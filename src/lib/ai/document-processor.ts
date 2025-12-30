import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database.types'
import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import OpenAI from 'openai'
import crypto from 'crypto'
import {
  findDocumentsByTenantAndHash,
  findTransactionByDocumentId,
  updateDocumentById,
  insertAIUsageLog,
  getTenantById,
  findBankAccountByTenantAndAccountNumber,
  upsertDocumentData,
  createService,
  rpc
} from '../supabase/typed'
import { findTenantCandidates } from './tenant-matcher'

type Document = Database['public']['Tables']['documents']['Row']
type DocumentData = Database['public']['Tables']['document_data']['Insert']
type Account = Database['public']['Tables']['chart_of_accounts']['Row']

interface ExtractedData {
  vendor_name?: string
  customer_name?: string // Added for tenant validation
  document_date?: string
  total_amount?: number
  currency?: string
  line_items?: Array<{
    description: string
    amount: number
    quantity?: number
  }>
  invoice_number?: string
  tax_amount?: number
  document_type?: 'invoice' | 'receipt' | 'credit_note' | 'bank_statement' | 'other'
  transaction_type?: 'income' | 'expense'
  // Bank Statement Fields
  statement_period_start?: string
  statement_period_end?: string
  opening_balance?: number
  closing_balance?: number
  bank_name?: string
  account_number?: string
  account_holder_name?: string // Added for bank statement validation
  bank_transactions?: Array<{
    date: string
    description: string
    amount: number
    balance?: number
    type: 'DEBIT' | 'CREDIT'
  }>
  confidence_score?: number // Added for AI confidence
  [key: string]: any
  is_belongs_to_tenant?: boolean
}

function cleanText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeCompanyName(v: unknown): string {
  const raw = cleanText(v).toLowerCase()
  if (!raw) return ''
  return raw
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9\s&.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCurrencyCode(v: unknown): string | null {
  const raw = cleanText(v)
  if (!raw) return null

  // Handle a few common, unambiguous symbol formats.
  const compact = raw.replace(/\s+/g, '').toUpperCase()
  const symbolMap: Record<string, string> = {
    '€': 'EUR',
    '£': 'GBP',
    'HK$': 'HKD',
    'US$': 'USD',
    'A$': 'AUD',
    'C$': 'CAD',
    'S$': 'SGD',
  }
  if (symbolMap[compact]) return symbolMap[compact]

  const upper = raw.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(upper)) return upper
  return null
}

function nameIncludes(a: string, b: string): boolean {
  const aa = a.trim()
  const bb = b.trim()
  if (aa.length < 2 || bb.length < 2) return false
  // Avoid pathological matches like single-letter or empty string
  if (aa.length <= 1 || bb.length <= 1) return false
  return aa.includes(bb) || bb.includes(aa)
}

function normalizeTenantLocaleTag(tag?: string): 'en' | 'zh-CN' | 'zh-HK' {
  const raw = String(tag || '').trim()
  if (!raw) return 'en'

  const lower = raw.toLowerCase().replace('_', '-')
  if (lower === 'en' || lower.startsWith('en-')) return 'en'

  if (lower.startsWith('zh')) {
    if (/(^zh-?(cn|hans|sg))/.test(lower)) return 'zh-CN'
    if (/(^zh-?(hk|hant|tw|mo))/.test(lower)) return 'zh-HK'
    return 'zh-CN'
  }

  return 'en'
}

function resolveTenantLanguageLabel(normalizedLocale: 'en' | 'zh-CN' | 'zh-HK'): string {
  switch (normalizedLocale) {
    case 'zh-CN':
      return 'Simplified Chinese'
    case 'zh-HK':
      return 'Traditional Chinese (Hong Kong)'
    case 'en':
    default:
      return 'English'
  }
}

function splitBilingualCandidates(value: string): string[] {
  const raw = String(value || '').trim()
  if (!raw) return []

  // Replace common bracket forms with separators, but keep inside text as candidates.
  // Example: "ABC Ltd (ABC有限公司)" => ["ABC Ltd", "ABC有限公司"].
  const normalized = raw
    .replace(/[（(]/g, ' | ')
    .replace(/[）)]/g, ' | ')
    .replace(/[\r\n]+/g, ' | ')
    .replace(/\s{2,}/g, ' ')

  const parts = normalized
    .split(/\s*[\/|｜、,;·•]+\s*|\s+-\s+|\s+—\s+|\s+–\s+/g)
    .map(s => s.trim())
    .filter(Boolean)

  const uniq: string[] = []
  for (const p of parts) {
    if (p.length < 2) continue
    if (!uniq.includes(p)) uniq.push(p)
  }

  // Always include the original raw value as a fallback candidate.
  if (!uniq.includes(raw)) uniq.unshift(raw)
  return uniq
}

function chooseLocalePreferredName(value: unknown, tenantLocale: 'en' | 'zh-CN' | 'zh-HK'): string | undefined {
  const raw = cleanText(value)
  if (!raw) return undefined

  const candidates = splitBilingualCandidates(raw)
  if (candidates.length <= 1) return raw

  const hanRe = /[\p{Script=Han}]/gu
  const latinRe = /[A-Za-z]/g

  const score = (s: string) => {
    const t = s.trim()
    const han = (t.match(hanRe) || []).length
    const latin = (t.match(latinRe) || []).length
    const len = Math.max(1, t.length)
    return {
      han,
      latin,
      hanRatio: han / len,
      latinRatio: latin / len,
      len,
    }
  }

  const scored = candidates.map(c => ({ c, ...score(c) }))

  if (tenantLocale === 'zh-CN' || tenantLocale === 'zh-HK') {
    // Prefer strings that actually contain Chinese characters.
    const withHan = scored.filter(x => x.han > 0)
    if (withHan.length > 0) {
      withHan.sort((a, b) => (b.hanRatio - a.hanRatio) || (b.han - a.han) || (b.len - a.len))
      return withHan[0].c
    }
    return raw
  }

  // English: prefer Latin-heavy candidates.
  const withLatin = scored.filter(x => x.latin > 0)
  if (withLatin.length > 0) {
    withLatin.sort((a, b) => (b.latinRatio - a.latinRatio) || (b.latin - a.latin) || (b.len - a.len))
    return withLatin[0].c
  }

  return raw
}

const TENANT_DEBUG_ENABLED = (() => {
  const raw = process.env.AI_TENANT_DEBUG || process.env.NEXT_PUBLIC_AI_TENANT_DEBUG
  if (!raw) return false
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
})()

// Confidence threshold for trusting AI-provided tenant boolean flag.
// Can be overridden via env var `AI_TENANT_CONFIDENCE_THRESHOLD` (0.0 - 1.0).
const AI_TENANT_CONFIDENCE_THRESHOLD = (() => {
  const raw = process.env.AI_TENANT_CONFIDENCE_THRESHOLD || process.env.NEXT_PUBLIC_AI_TENANT_CONFIDENCE_THRESHOLD
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.8
})()

function tenantDebugLog(payload: Record<string, unknown>) {
  if (!TENANT_DEBUG_ENABLED) return
  // Keep logs compact and predictable; do not log raw extracted_data blobs.
  console.info('[ai][tenant-debug]', payload)
}

function getNumberFrom(obj: Record<string, unknown> | undefined, key: string): number {
  if (!obj) return 0
  const v = obj[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

type TenantMismatchPolicy = {
  allow_auto_tenant_creation: boolean
  allow_auto_reassignment: boolean
  min_confidence: number
}

const DEFAULT_TENANT_MISMATCH_POLICY: TenantMismatchPolicy = {
  allow_auto_tenant_creation: false,
  allow_auto_reassignment: false,
  min_confidence: 0.9,
}

function normalizeTenantMismatchPolicy(input: unknown): TenantMismatchPolicy {
  const obj = (input && typeof input === 'object' ? (input as any) : {}) as Record<string, unknown>
  const allow_auto_tenant_creation = obj.allow_auto_tenant_creation === true
  const allow_auto_reassignment = obj.allow_auto_reassignment === true
  const min_confidence_raw = obj.min_confidence
  const min_confidence =
    typeof min_confidence_raw === 'number'
      ? min_confidence_raw
      : typeof min_confidence_raw === 'string'
        ? Number(min_confidence_raw)
        : DEFAULT_TENANT_MISMATCH_POLICY.min_confidence

  return {
    allow_auto_tenant_creation,
    allow_auto_reassignment,
    min_confidence: Number.isFinite(min_confidence) ? min_confidence : DEFAULT_TENANT_MISMATCH_POLICY.min_confidence,
  }
}

async function getTenantMismatchPolicy(supabase: any, tenantId: string): Promise<TenantMismatchPolicy> {
  try {
    const { data: systemData, error: systemError } = await (supabase.from('system_settings') as any)
      .select('setting_value')
      .eq('setting_key', 'tenant_mismatch_policy')
      .maybeSingle()

    if (systemError && systemError.code !== 'PGRST116') {
      return DEFAULT_TENANT_MISMATCH_POLICY
    }

    const systemPolicy = normalizeTenantMismatchPolicy(systemData?.setting_value)

    const { data: tenantData, error: tenantError } = await (supabase.from('tenant_settings') as any)
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'tenant_mismatch_policy')
      .maybeSingle()

    if (tenantError && tenantError.code !== 'PGRST116') {
      return systemPolicy
    }

    const tenantPolicyRaw = tenantData?.setting_value
    if (!tenantPolicyRaw) return systemPolicy

    // Tenant setting overrides system setting
    return normalizeTenantMismatchPolicy({
      ...systemPolicy,
      ...(typeof tenantPolicyRaw === 'object' ? tenantPolicyRaw : {}),
    })
  } catch {
    return DEFAULT_TENANT_MISMATCH_POLICY
  }
}

function slugifyTenantSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type TenantCorrectionInfo = {
  actionTaken: 'NONE' | 'REASSIGNED' | 'CREATED' | 'LIMIT_REACHED' | 'SKIPPED_MULTI_TENANT' | 'FAILED'
  fromTenantId?: string
  toTenantId?: string
  toTenantName?: string
  message?: string
}

/**
 * AI Document Processing Service
 * 
 * This is a placeholder service that will be connected to actual AI providers
 * (OpenAI, Anthropic, Azure OpenAI, etc.) in production.
 * 
 * Current implementation returns mock data for demonstration purposes.
 */
export class AIProcessingService {
  private static applyTenantLocalePreferences(extractedData: ExtractedData, tenantLocale?: string): ExtractedData {
    const locale = normalizeTenantLocaleTag(tenantLocale)

    const vendor = chooseLocalePreferredName(extractedData.vendor_name, locale)
    const customer = chooseLocalePreferredName(extractedData.customer_name, locale)
    const bank = chooseLocalePreferredName(extractedData.bank_name, locale)
    const holder = chooseLocalePreferredName(extractedData.account_holder_name, locale)

    return {
      ...extractedData,
      vendor_name: vendor ?? extractedData.vendor_name,
      customer_name: customer ?? extractedData.customer_name,
      bank_name: bank ?? extractedData.bank_name,
      account_holder_name: holder ?? extractedData.account_holder_name,
    }
  }
  private static async applyTenantTaxDefaults(supabase: any, tenantId: string, extractedData: ExtractedData) {
    try {
      // Only apply defaults if tax_amount is missing (0 is a valid tax amount).
      const hasTaxAmount = typeof extractedData.tax_amount === 'number' && Number.isFinite(extractedData.tax_amount)
      if (hasTaxAmount) return extractedData

      const total = extractedData.total_amount
      if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return extractedData

      const { data, error } = await (supabase.from('tenant_tax_settings') as any)
        .select('default_tax_rate')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      // If schema isn't present yet or RLS blocks, fail quietly.
      if (error) return extractedData

      const rate = data?.default_tax_rate
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 1) return extractedData

      // Round to 2 decimals for currency-like values.
      const computed = Math.round(total * rate * 100) / 100
      if (!Number.isFinite(computed) || computed < 0) return extractedData

      return {
        ...extractedData,
        tax_amount: computed,
      }
    } catch {
      return extractedData
    }
  }
  private static resolveMergedProviderConfig(config: any): Record<string, any> {
    const providerCfg = (config?.ai_providers?.config ?? {}) as Record<string, any>
    const tenantCfg = (config?.custom_config ?? {}) as Record<string, any>
    return {
      ...providerCfg,
      ...tenantCfg,
    }
  }

  private static resolveApiKey(config: any): string {
    const apiKey =
      (typeof config?.api_key_encrypted === 'string' && config.api_key_encrypted.trim()
        ? config.api_key_encrypted.trim()
        : null) ||
      (typeof config?.ai_providers?.config?.platform_api_key === 'string' &&
      config.ai_providers.config.platform_api_key.trim()
        ? config.ai_providers.config.platform_api_key.trim()
        : null)

    if (!apiKey) {
      throw new Error('No API key configured for AI provider (tenant or platform)')
    }

    return apiKey
  }

  private static resolveModelName(config: any, providerDefault: string): string {
    const merged = this.resolveMergedProviderConfig(config)
    const firstModel = Array.isArray(merged.models) ? (merged.models[0] as string | undefined) : undefined
    const modelFromMerged =
      (typeof merged.defaultModel === 'string' && merged.defaultModel.trim() ? merged.defaultModel.trim() : null) ||
      (typeof merged.default_model === 'string' && merged.default_model.trim() ? merged.default_model.trim() : null) ||
      (typeof merged.model === 'string' && merged.model.trim() ? merged.model.trim() : null) ||
      (typeof firstModel === 'string' && firstModel.trim() ? firstModel.trim() : null)

    return (config?.model_name as string | null | undefined) || modelFromMerged || providerDefault
  }
  
  /**
   * Process a document and extract structured data using AI
   * 
   * @param documentId - UUID of the document to process
   * @returns Promise<{ success: boolean, validationStatus?: string, validationFlags?: string[], error?: string, statusCode?: number }>
   */
  static async processDocument(documentId: string): Promise<{ success: boolean, validationStatus?: string, validationFlags?: string[], tenantCandidates?: any[], isMultiTenant?: boolean, tenantCorrection?: TenantCorrectionInfo, recordsCreated?: boolean, error?: string, statusCode?: number }> {
    try {
      const supabase = await createClient()

      // 1. Get document details
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, tenants(name, currency, owner_id, locale)')
        .eq('id', documentId)
        .single()

      if (docError || !document) {
        // A missing document is an expected outcome for invalid IDs.
        // Log to stdout to avoid noisy stderr in CI for tests that assert a 404.
        console.info('Document not found:', docError)
        return { success: false, error: 'Document not found', statusCode: 404 }
      }

      const docRow = document as unknown as Document & { tenants?: { name?: string; currency?: string } }
      const tenantName = docRow.tenants?.name || 'the company'
      const tenantCurrency = docRow.tenants?.currency || 'USD'
      const tenantLocale = (docRow.tenants as any)?.locale as string | undefined

      // 2. Update status to PROCESSING
      await updateDocumentById(documentId, { status: 'PROCESSING' })

      // --- DUPLICATE DETECTION START ---
      // Download file to calculate hash
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(docRow.file_path)

      if (downloadError || !fileData) throw new Error('Failed to download file from storage')

      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const hash = crypto.createHash('sha256').update(buffer).digest('hex')

      // Check for duplicates
      // Dynamically import these helpers instead of using static imports so:
      // - Test runners (Vitest) that mock the module exports will be respected
      //   by runtime callers (dynamic import resolves to the mocked module).
      // - We avoid capturing stale references to functions at module-eval time,
      //   which improves testability and makes mocks reliable during isolated
      //   test runs.
      const typed = await import('@/lib/supabase/typed')
      const dupResp = await typed.findDocumentsByTenantAndHash(docRow.tenant_id, hash, documentId)

      const duplicates = Array.isArray(dupResp.data) ? (dupResp.data as Array<{ id: string }>) : []
      const isDuplicate = duplicates && duplicates.length > 0
      const validationFlags: string[] = []
      let validationStatus = 'PENDING'
      let existingTransactionId: string | null = null
      let tenantCorrection: TenantCorrectionInfo = { actionTaken: 'NONE' }
      // Whether this run created ledger/bank records. Default true; set false when skipped due to review flags.
      let recordsCreated = true

      if (isDuplicate) {
        validationFlags.push('DUPLICATE_DOCUMENT')
        validationStatus = 'NEEDS_REVIEW'
        console.log(`Duplicate document detected: ${documentId}`)
        
        // Find if there is an existing transaction for the original document
        // We use the first duplicate found as the "original"
        const originalDocId = duplicates[0].id
        const txResp = await typed.findTransactionByDocumentId(originalDocId)

        const existingTx = txResp.data as { id: string } | null
        if (existingTx) {
          existingTransactionId = existingTx.id
          console.log(`Found existing transaction ${existingTransactionId} to update`)
        }
      }

      // Update document with hash
      await updateDocumentById(documentId, {
        content_hash: hash,
        validation_status: validationStatus,
        validation_flags: validationFlags
      })
      
      // --- DUPLICATE DETECTION END ---

      // 3. Get Tenant AI Configuration
      const aiConfig = await this.getTenantAIConfig(docRow.tenant_id)

      // Fetch tenant alias/name identifiers to provide to AI prompts
      let tenantAliases: string[] = []
      try {
        const svc = createService()
        const { data: aliasRows } = await svc
          .from('tenant_identifiers')
          .select('identifier_value')
          .eq('tenant_id', docRow.tenant_id)
          .in('identifier_type', ['NAME_ALIAS'])
          .limit(50)
        if (Array.isArray(aliasRows)) {
          tenantAliases = aliasRows.map((r: any) => String(r.identifier_value || '').trim()).filter(Boolean)
        }
      } catch (e) {
        tenantAliases = []
      }
      
      // --- RATE LIMIT CHECK START ---
        if (aiConfig && aiConfig.ai_providers) {
          const providerConfigObj = (aiConfig.ai_providers?.config ?? {}) as Record<string, unknown>
          const limitMin = getNumberFrom(providerConfigObj, 'per_minute_limit_default')
          const limitHour = getNumberFrom(providerConfigObj, 'per_hour_limit_default')
          const limitDay = getNumberFrom(providerConfigObj, 'per_day_limit_default')
          
          if (limitMin > 0 || limitHour > 0 || limitDay > 0) {
              try {
                  // We use a try-catch here because the RPC function might not exist if migration wasn't run
                    const { data: isAllowed, error: limitError } = await (supabase as any).rpc('check_ai_rate_limit', {
                      p_tenant_id: docRow.tenant_id,
                      p_provider_id: aiConfig.ai_providers.id,
                      p_limit_min: limitMin,
                      p_limit_hour: limitHour,
                      p_limit_day: limitDay
                    })

                  if (limitError) {
                      // If RPC fails (e.g. not found), we log warning but allow processing (fail open)
                      // unless it's a permission error, but for now we prioritize availability
                      console.warn('Rate limit check failed (RPC error):', limitError.message)
                  } else if (isAllowed === false) {
                      throw new Error('Rate limit exceeded (Internal Policy)')
                  }
              } catch (e) {
                  console.warn('Rate limit check failed (Exception):', e)
              }
          }
      }
      // --- RATE LIMIT CHECK END ---

      let extractedData: ExtractedData

      // 4. Route to appropriate provider; mock is no longer used in production
      // Pass the buffer to avoid re-downloading
      if (aiConfig && aiConfig.ai_providers?.name === 'google-document-ai') {
        console.log('Processing with Google Document AI...')
        extractedData = await this.processWithGoogleDocumentAI(document, aiConfig, supabase, buffer, tenantAliases)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'qwen-vision') {
        console.log('Processing with Qwen Vision...')
        extractedData = await this.processWithQwenVision(document, aiConfig, supabase, buffer, tenantName, tenantLocale, tenantAliases)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'openai-vision') {
        console.log('Processing with OpenAI Vision...')
        extractedData = await this.processWithOpenAIVision(document, aiConfig, supabase, buffer, tenantName, tenantLocale, tenantAliases)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'openrouter') {
        console.log('Processing with OpenRouter...')
        extractedData = await this.processWithOpenRouter(document, aiConfig, supabase, buffer, tenantName, tenantLocale, tenantAliases)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'deepseek-ocr') {
        console.log('Processing with DeepSeek OCR...')
        extractedData = await this.processWithDeepSeek(document, aiConfig, supabase, buffer, tenantName, tenantLocale, tenantAliases)
      } else {
        throw new Error('No active AI provider configured for this tenant or platform')
      }

      // Normalize common provider-specific key variants into our canonical fields
      extractedData = this.sanitizeExtractedData(extractedData) as ExtractedData

      // Prefer locale-appropriate variants when bilingual names are present.
      extractedData = this.applyTenantLocalePreferences(extractedData, tenantLocale)

      // Tax automation: if AI didn't extract tax_amount, apply tenant default rate
      extractedData = (await this.applyTenantTaxDefaults(supabase, docRow.tenant_id, extractedData)) as ExtractedData

      // --- LOG USAGE START ---
      try {
          if (aiConfig?.ai_providers?.id) {
            await insertAIUsageLog({
              tenant_id: docRow.tenant_id,
              ai_provider_id: aiConfig.ai_providers.id,
              model: aiConfig.model_name || (((aiConfig.ai_providers?.config ?? {}) as Record<string, any>).models?.[0] as string) || 'unknown',
              status: 'success',
              tokens_input: 0,
              tokens_output: 0
            })
          }
      } catch (e) {
          console.warn('Failed to log usage:', e)
      }
      // --- LOG USAGE END ---

      // --- TENANT VALIDATION START ---
      // Check if tenant name appears in either vendor or customer fields
      const { data: tenant } = await getTenantById(docRow.tenant_id)

      let tenantCandidates: any[] = []
      let isMultiTenant = false
      
      if (tenant) {
        // Assemble primary name + aliases for robust matching
        const svc = createService()
        const primaryNameRaw = (tenant as { name?: string } | null)?.name || ''
        let aliasRows: any[] = []
        try {
          const { data } = await svc
            .from('tenant_identifiers')
            .select('identifier_value')
            .eq('tenant_id', docRow.tenant_id)
            .in('identifier_type', ['NAME_ALIAS'])
            .limit(50)
          aliasRows = Array.isArray(data) ? data : []
        } catch (e) {
          aliasRows = []
        }

        const tenantNames = [primaryNameRaw, ...aliasRows.map((r: any) => r.identifier_value || '')]
          .map(normalizeCompanyName)
          .filter(Boolean)

        const vendorName = normalizeCompanyName(extractedData.vendor_name)
        const customerName = normalizeCompanyName(extractedData.customer_name)

        tenantDebugLog({
          documentId,
          tenantId: docRow.tenant_id,
          documentType: extractedData.document_type ?? this.inferDocumentType(extractedData),
          normalized: {
            tenantName,
            vendorName,
            customerName,
            is_belongs_to_tenant: extractedData.is_belongs_to_tenant,
          },
        })
        
        // Check if tenant is involved in the transaction
        // We *conservatively* trust the AI's boolean only when accompanied by
        // sufficient confidence or by confirmatory name matches. Otherwise
        // fall back to string matching heuristics below.
        let isTenantMatch = false

        if (typeof extractedData.is_belongs_to_tenant === 'boolean') {
          const aiBelongs = extractedData.is_belongs_to_tenant
          const aiConf = typeof extractedData.confidence_score === 'number' ? Number(extractedData.confidence_score) : 0
          const threshold = AI_TENANT_CONFIDENCE_THRESHOLD

          // Helper: do we have a tenant name match from vendor/customer strings?
          const hasVendorConfirm = vendorName && tenantNames.length > 0 ? tenantNames.some(tn => nameIncludes(vendorName, tn)) : false
          const hasCustomerConfirm = customerName && tenantNames.length > 0 ? tenantNames.some(tn => nameIncludes(customerName, tn)) : false

          // If AI asserts it belongs and confidence is high OR we have a name confirmation,
          // accept the AI boolean as true. If AI asserts it does NOT belong, accept that
          // only when confidence is high or there is corroborating mismatch evidence.
          if (aiBelongs === true) {
            if (aiConf >= threshold || hasVendorConfirm || hasCustomerConfirm) {
              isTenantMatch = true
            } else {
              tenantDebugLog({ documentId, tenantId: docRow.tenant_id, note: 'AI boolean ignored (low confidence/no name confirm)', aiConf, threshold })
              // leave isTenantMatch as false and fall through to string checks below
            }
          } else {
            // AI says it's NOT the tenant
            const explicitFalseConfirm = aiConf >= threshold || ((customerName && customerName.length >= 3) && !hasCustomerConfirm) || ((vendorName && vendorName.length >= 3) && !hasVendorConfirm)
            if (explicitFalseConfirm) {
              isTenantMatch = false
            } else {
              tenantDebugLog({ documentId, tenantId: docRow.tenant_id, note: 'AI negative boolean ignored (low confidence/no corroborating mismatch)', aiConf, threshold })
              // fall through to string matching
            }
          }
        } else {
          // No explicit boolean from AI; use string matching heuristics below.
          // Special handling for Bank Statements
          if (extractedData.document_type === 'bank_statement') {
              // For bank statements, check account holder name if available
              const accountHolder = normalizeCompanyName(extractedData.account_holder_name)
                if (accountHolder && tenantNames.some(tn => nameIncludes(accountHolder, tn))) {
                  isTenantMatch = true
              } else if (extractedData.account_number) {
                  // If we have an account number, check if it matches any of our bank accounts
                    const { data: existingAccount } = await findBankAccountByTenantAndAccountNumber(docRow.tenant_id, extractedData.account_number)
                    if (existingAccount) {
                      isTenantMatch = true
                    }
              }
              
              // Fallback: Check if AI put the name in customer_name or vendor_name by mistake
              if (!isTenantMatch && !accountHolder) {
                  const vendor = vendorName
                  const customer = customerName
                    if (tenantNames.some(tn => nameIncludes(vendor, tn) || nameIncludes(customer, tn))) {
                      isTenantMatch = true
                    }
              }

              // If we still don't have a match, but it's a bank statement, we might be more lenient
              // UNLESS the AI didn't find any account holder name at all (common in some statements)
              if (!isTenantMatch && !accountHolder) {
                  // Ambiguous case: No account holder name found. 
                  // We assume it's correct if we can't prove it's wrong (i.e. no conflicting name found)
                  isTenantMatch = true 
              }
           } else {
               // Standard Invoice/Receipt logic
               const isTenantVendor = vendorName && tenantNames.length > 0 ? tenantNames.some(tn => nameIncludes(vendorName, tn)) : false
               const isTenantCustomer = customerName && tenantNames.length > 0 ? tenantNames.some(tn => nameIncludes(customerName, tn)) : false
               isTenantMatch = isTenantVendor || isTenantCustomer
           }
        }

        tenantDebugLog({
          documentId,
          tenantId: docRow.tenant_id,
          decision: { isTenantMatch },
        })

        if (!isTenantMatch) {
            const docType = extractedData.document_type || this.inferDocumentType(extractedData)

            // For receipts, tenant is often not explicitly printed; only flag when we have evidence.
            // Evidence is: explicit AI boolean says it's not for this tenant, OR customer name exists but doesn't match,
            // OR both parties exist and neither matches (rare, but strong signal).
            const hasVendor = vendorName.length >= 2
            const hasCustomer = customerName.length >= 2
            const hasExplicitBelongs = typeof extractedData.is_belongs_to_tenant === 'boolean'
            const explicitMismatch = hasExplicitBelongs && extractedData.is_belongs_to_tenant === false
            const vendorMatchesTenant = hasVendor ? tenantNames.some(tn => nameIncludes(vendorName, tn)) : false
            const customerMatchesTenant = hasCustomer ? tenantNames.some(tn => nameIncludes(customerName, tn)) : false
            const strongStringMismatch = (hasVendor && hasCustomer && !vendorMatchesTenant && !customerMatchesTenant) || (hasCustomer && !customerMatchesTenant)

            const shouldInvestigateMismatch =
              docType === 'receipt' ? (explicitMismatch || strongStringMismatch) : (explicitMismatch || hasVendor || hasCustomer)

            tenantDebugLog({
              documentId,
              tenantId: docRow.tenant_id,
              documentType: docType,
              mismatchSignals: {
                hasVendor,
                hasCustomer,
                explicitMismatch,
                vendorMatchesTenant,
                customerMatchesTenant,
                strongStringMismatch,
                shouldInvestigateMismatch,
              },
            })

            if (shouldInvestigateMismatch) {
              console.log(`Potential wrong tenant detected. Tenant: ${primaryNameRaw || 'unknown'}`)

              const fromTenantId = docRow.tenant_id

              // Determine accessible tenants + actor role for policy/creation checks
              const { data: authData } = await supabase.auth.getUser()
              const actor = authData?.user ?? null
              let accessibleTenantIds: string[] = []
              let actorRole: string | null = null
              if (actor) {
                const { data: memberships } = await (supabase.from('memberships') as any)
                  .select('tenant_id, role')
                  .eq('user_id', actor.id)
                  .eq('is_active', true)

                const rows = Array.isArray(memberships) ? memberships : []
                accessibleTenantIds = rows.map((m: any) => m.tenant_id).filter((id: any) => typeof id === 'string')
                const current = rows.find((m: any) => m.tenant_id === fromTenantId)
                actorRole = (typeof current?.role === 'string' ? current.role : null) as string | null
              }

              const policy = await getTenantMismatchPolicy(supabase, fromTenantId)

              // Build tenant candidates list for review/auto-action
              try {
                const svc = createService()
                const matchRes = await findTenantCandidates(extractedData, fromTenantId, accessibleTenantIds)
                tenantCandidates = matchRes.candidates
                isMultiTenant = matchRes.isMultiTenant

                if (isMultiTenant) {
                  tenantCorrection = {
                    actionTaken: 'SKIPPED_MULTI_TENANT',
                    fromTenantId,
                    message: 'Multi-tenant document detected; manual review required.',
                  }
                }

                const bestCandidate = [...tenantCandidates].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
                const canAutoReassign =
                  policy.allow_auto_reassignment === true &&
                  !isMultiTenant &&
                  Boolean(bestCandidate?.tenantId) &&
                  (bestCandidate?.confidence ?? 0) >= policy.min_confidence

                // Auto-reassign to an accessible tenant if confident
                if (canAutoReassign) {
                  const toTenantId = String(bestCandidate.tenantId)
                  const { data: toTenant } = await svc.from('tenants').select('name').eq('id', toTenantId).maybeSingle()
                  // Prefer a configured alias for display if available
                  let displayName = toTenant?.name
                  try {
                    const { data: aliasRows2 } = await svc
                      .from('tenant_identifiers')
                      .select('identifier_value')
                      .eq('tenant_id', toTenantId)
                      .in('identifier_type', ['NAME_ALIAS'])
                      .limit(5)
                    if (Array.isArray(aliasRows2) && aliasRows2.length > 0) {
                      displayName = aliasRows2[0].identifier_value || displayName
                    }
                  } catch (e) {
                    // ignore alias fetch failures
                  }

                  const rpcRes = await rpc('transfer_document_tenant', {
                    p_document_id: documentId,
                    p_target_tenant_id: toTenantId,
                    p_mode: 'MOVE',
                  })

                  if (rpcRes?.error) {
                    tenantCorrection = { actionTaken: 'FAILED', fromTenantId, message: rpcRes.error.message }
                  } else {
                    // Update in-memory tenant id so subsequent inserts use the correct tenant
                    ;(document as any).tenant_id = toTenantId
                    ;(docRow as any).tenant_id = toTenantId

                    tenantCorrection = {
                      actionTaken: 'REASSIGNED',
                      fromTenantId,
                      toTenantId,
                      toTenantName: displayName ?? toTenant?.name ?? undefined,
                    }
                  }
                }

                // Auto-create tenant (owned by current tenant admin, unless actor is admin)
                const canAutoCreate =
                  tenantCorrection.actionTaken === 'NONE' &&
                  policy.allow_auto_tenant_creation === true &&
                  !isMultiTenant &&
                  Boolean(matchRes.suggestedTenantName) &&
                  actor != null

                if (canAutoCreate) {
                  const suggestedName = String(matchRes.suggestedTenantName).trim()
                  const baseSlug = slugifyTenantSlug(suggestedName) || `tenant-${Math.random().toString(36).slice(2, 8)}`
                  const locale = (docRow.tenants as any)?.locale || 'en'
                  const currentOwnerId = (docRow.tenants as any)?.owner_id as string | undefined
                  const ownerId = actorRole === 'COMPANY_ADMIN' ? actor.id : (currentOwnerId ?? actor.id)
                  const fromTenantCurrency = String((docRow.tenants as any)?.currency || 'USD').toUpperCase()
                  const detectedCurrency = normalizeCurrencyCode(extractedData.currency) || fromTenantCurrency

                  // Idempotency guard: if a tenant with the same name already exists for this owner,
                  // reuse it instead of creating another slug variant (common during bulk/parallel processing).
                  try {
                    const normalizedSuggested = normalizeCompanyName(suggestedName)
                    if (normalizedSuggested.length >= 2) {
                      const { data: existingTenants } = await (svc as any)
                        .from('tenants')
                        .select('id, name, slug')
                        .eq('owner_id', ownerId)
                        .limit(50)

                      let existing: any = null
                      const rows = Array.isArray(existingTenants) ? existingTenants : []
                      for (const t of rows) {
                        const n = normalizeCompanyName(t?.name)
                        if (n.length > 0 && n === normalizedSuggested) {
                          existing = t
                          break
                        }
                        // Check aliases for this tenant
                        try {
                          const { data: arows } = await svc
                            .from('tenant_identifiers')
                            .select('identifier_value')
                            .eq('tenant_id', t.id)
                            .in('identifier_type', ['NAME_ALIAS'])
                            .limit(20)
                          const aliases = Array.isArray(arows) ? arows.map((r:any) => normalizeCompanyName(r.identifier_value || '')) : []
                          if (aliases.includes(normalizedSuggested)) {
                            existing = t
                            break
                          }
                        } catch (e) {
                          // ignore alias fetch errors
                        }
                      }

                      if (existing?.id) {
                        const toTenantId = String(existing.id)

                        // Ensure memberships exist (best-effort)
                        const inserts: any[] = []
                        if (ownerId === actor.id) {
                          inserts.push({ tenant_id: toTenantId, user_id: ownerId, role: 'COMPANY_ADMIN', is_active: true })
                        } else {
                          inserts.push({ tenant_id: toTenantId, user_id: ownerId, role: 'COMPANY_ADMIN', is_active: true })
                          inserts.push({ tenant_id: toTenantId, user_id: actor.id, role: actorRole ?? 'OPERATOR', is_active: true })
                        }

                        const { error: membershipError } = await (svc.from('memberships') as any).insert(inserts)
                        if (membershipError && !String(membershipError.message || '').toLowerCase().includes('duplicate')) {
                          console.warn('Failed to insert memberships for existing tenant:', membershipError)
                        }

                        const rpcRes = await rpc('transfer_document_tenant', {
                          p_document_id: documentId,
                          p_target_tenant_id: toTenantId,
                          p_mode: 'MOVE',
                        })

                        if (rpcRes?.error) {
                          tenantCorrection = { actionTaken: 'FAILED', fromTenantId, message: rpcRes.error.message }
                        } else {
                          ;(document as any).tenant_id = toTenantId
                          ;(docRow as any).tenant_id = toTenantId
                          tenantCorrection = {
                            actionTaken: 'REASSIGNED',
                            fromTenantId,
                            toTenantId,
                            toTenantName: existing?.name ?? suggestedName,
                            message: 'Reused existing tenant (same owner/name).',
                          }
                        }

                        tenantDebugLog({
                          documentId,
                          tenantId: fromTenantId,
                          reusedTenant: {
                            ownerId,
                            suggestedName,
                            toTenantId,
                            toTenantName: existing?.name ?? suggestedName,
                          },
                        })
                      }
                    }
                  } catch (e) {
                    console.warn('Failed to check existing tenants for idempotent creation:', e)
                  }

                  // If we already reassigned by reusing an existing tenant, stop here.
                  if (tenantCorrection.actionTaken === 'REASSIGNED') {
                    // no-op
                  } else {

                  let createdTenant: any = null
                  let tenantError: any = null

                  for (let i = 0; i < 3; i++) {
                    const slug = i === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
                    const { data: newTenant, error: createError } = await (svc as any)
                      .from('tenants')
                      .insert({
                        name: suggestedName,
                        slug,
                        locale,
                        owner_id: ownerId,
                        currency: detectedCurrency,
                        is_active: true,
                      })
                      .select('id, name')
                      .single()

                    if (createError) {
                      tenantError = createError
                      continue
                    }

                    createdTenant = newTenant
                    tenantError = null
                    break
                  }

                  if (tenantError || !createdTenant?.id) {
                    const msg = String(tenantError?.message || 'Failed to create tenant')
                    const looksLikeLimit = msg.toLowerCase().includes('tenant') && msg.toLowerCase().includes('limit')
                    tenantCorrection = {
                      actionTaken: looksLikeLimit ? 'LIMIT_REACHED' : 'FAILED',
                      fromTenantId,
                      message: msg,
                    }
                  } else {
                    const toTenantId = String(createdTenant.id)

                    // Ensure memberships exist: owner gets admin, actor gets mirrored role
                    const inserts: any[] = []
                    if (ownerId === actor.id) {
                      inserts.push({ tenant_id: toTenantId, user_id: ownerId, role: 'COMPANY_ADMIN', is_active: true })
                    } else {
                      inserts.push({ tenant_id: toTenantId, user_id: ownerId, role: 'COMPANY_ADMIN', is_active: true })
                      inserts.push({ tenant_id: toTenantId, user_id: actor.id, role: actorRole ?? 'OPERATOR', is_active: true })
                    }

                    const { error: membershipError } = await (svc.from('memberships') as any).insert(inserts)
                    if (membershipError && !String(membershipError.message || '').toLowerCase().includes('duplicate')) {
                      console.warn('Failed to insert memberships for new tenant:', membershipError)
                    }

                    const rpcRes = await rpc('transfer_document_tenant', {
                      p_document_id: documentId,
                      p_target_tenant_id: toTenantId,
                      p_mode: 'MOVE',
                    })

                    if (rpcRes?.error) {
                      tenantCorrection = { actionTaken: 'FAILED', fromTenantId, message: rpcRes.error.message }
                    } else {
                      ;(document as any).tenant_id = toTenantId
                      ;(docRow as any).tenant_id = toTenantId
                      tenantCorrection = {
                        actionTaken: 'CREATED',
                        fromTenantId,
                        toTenantId,
                        toTenantName: createdTenant?.name ?? suggestedName,
                      }
                    }
                  }
                  }
                }

                if (tenantCandidates.length > 0) {
                  // Persist candidates for the document (best-effort)
                  await (svc as any)
                    .from('document_tenant_candidates')
                    .insert(
                      tenantCandidates.map((c) => ({
                        document_id: documentId,
                        candidate_tenant_id: c.tenantId ?? null,
                        suggested_tenant_name: matchRes.suggestedTenantName ?? null,
                        confidence: c.confidence,
                        reasons: c.reasons ?? []
                      }))
                    )
                }
              } catch (e) {
                console.warn('Failed to compute/persist tenant candidates:', e)
              }

              // If we didn't auto-correct, flag for manual review
              if (
                tenantCorrection.actionTaken === 'NONE' ||
                tenantCorrection.actionTaken === 'SKIPPED_MULTI_TENANT' ||
                tenantCorrection.actionTaken === 'LIMIT_REACHED' ||
                tenantCorrection.actionTaken === 'FAILED'
              ) {
                validationFlags.push('WRONG_TENANT')
                validationStatus = 'NEEDS_REVIEW'
              }

              tenantDebugLog({
                documentId,
                tenantId: docRow.tenant_id,
                tenantCorrection,
                updatedValidation: {
                  validationStatus,
                  validationFlags,
                },
              })
              
              // Update flags
              await updateDocumentById(documentId, {
                validation_status: validationStatus,
                validation_flags: validationFlags,
              })
            }
        }
      }
      // --- TENANT VALIDATION END ---

      // 5. Save extracted data
      const documentData: DocumentData = {
        document_id: documentId,
        extracted_data: extractedData as unknown as DocumentData['extracted_data'],
        confidence_score: extractedData.confidence_score || 0.85,
        vendor_name: extractedData.vendor_name || null,
        document_date: extractedData.document_date || extractedData.statement_period_end || null,
        total_amount: extractedData.total_amount || extractedData.closing_balance || null,
        currency: extractedData.currency || tenantCurrency,
        line_items: (extractedData.line_items || []) as unknown as DocumentData['line_items'],
        metadata: {
          processed_by: aiConfig?.ai_providers?.name || 'mock-ai-service',
          processing_time: Date.now(),
          transaction_type: extractedData.transaction_type
        } as unknown as DocumentData['metadata']
      }

      // Save extracted data to DB
      // We use upsert to handle re-processing of the same document
      const { error: dataError } = await upsertDocumentData(documentData)
      
      if (dataError) {
          console.error('Error saving document data:', dataError)
          // We continue even if saving document data fails
      }

      // 6. Create records based on type
      // Determine if we should skip creating ledger/bank records when the document
      // requires manual review. We do NOT want to auto-create transactions for
      // duplicates (without an existing transaction) or for wrong-tenant documents
      // that were not auto-corrected.
      const isDuplicateFlag = validationFlags.includes('DUPLICATE_DOCUMENT') || isDuplicate === true
      const isWrongTenantFlag = validationFlags.includes('WRONG_TENANT')

      let skipCreation = false

      // Skip when duplicate and there is no existing transaction to update
      if (isDuplicateFlag && !existingTransactionId) {
        skipCreation = true
      }

      // Skip when wrong tenant and tenantCorrection did not reassign/create a tenant.
      // However, if there is an existing transaction for the original document,
      // prefer updating that transaction rather than skipping creation entirely.
      if (isWrongTenantFlag && tenantCorrection?.actionTaken === 'NONE' && !existingTransactionId) {
        skipCreation = true
      }

      if (skipCreation) {
        recordsCreated = false
        // Persist that processing completed but records were intentionally skipped
        await updateDocumentById(documentId, {
          validation_status: validationStatus,
          validation_flags: validationFlags
        })
      } else {
        if (extractedData.document_type === 'bank_statement') {
          await this.createBankStatementRecords(document, extractedData, supabase)
        } else {
          await this.createDraftTransaction(document, extractedData, supabase, existingTransactionId)
        }
      }

      // 7. Update document status to PROCESSED (or keep as NEEDS_REVIEW if flagged)
      // If validation failed, we might want to keep it as PROCESSED but with validation_status = NEEDS_REVIEW
      // The UI should show "Processed (Needs Review)"
      await updateDocumentById(documentId, {
        status: 'PROCESSED',
        processed_at: new Date().toISOString(),
        document_type: extractedData.document_type || this.inferDocumentType(extractedData)
      })

      return {
        success: true,
        validationStatus,
        validationFlags,
        tenantCandidates,
        isMultiTenant,
        tenantCorrection,
        recordsCreated
      }

    } catch (error: any) {
      console.error('AI Processing error:', error)

      let statusCode = 500
      let errorMessage = error instanceof Error ? error.message : 'Processing failed'

      if (errorMessage.includes('Rate limit exceeded')) {
          statusCode = 429
      } else if (error.status === 429) {
          statusCode = 429
          errorMessage = 'Provider Rate Limit Exceeded'
      }

      // Update status to FAILED
      await updateDocumentById(documentId, {
        status: 'FAILED',
        error_message: errorMessage
      })

      return { success: false, error: errorMessage, statusCode, recordsCreated: false }
    }
  }

  /**
   * Process document using Google Cloud Document AI
   */
  private static async processWithGoogleDocumentAI(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantAliases?: string[]
  ): Promise<ExtractedData> {
    try {
      let content: string
      
      if (fileBuffer) {
        content = fileBuffer.toString('base64')
      } else {
        // Fallback to download if not provided
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(document.file_path)

        if (downloadError || !fileData) throw new Error('Failed to download file from storage')
        const arrayBuffer = await fileData.arrayBuffer()
        content = Buffer.from(arrayBuffer).toString('base64')
      }

      // 2. Initialize Google Client
      // We expect the config to contain credentials or we use environment variables
      // Structure of custom_config: { projectId, location, processorId, clientEmail, privateKey }
      const customConfig = config.custom_config || {}
      const clientConfig: any = {
        apiEndpoint: customConfig.location === 'us' ? 'us-documentai.googleapis.com' : `${customConfig.location}-documentai.googleapis.com`
      }

      // If credentials are provided in the DB config (Not recommended for production, use Secret Manager)
      if (customConfig.clientEmail && config.api_key_encrypted) {
        clientConfig.credentials = {
          client_email: customConfig.clientEmail,
          private_key: config.api_key_encrypted.replace(/\\n/g, '\n'), // Handle newline escaping
        }
      }

      const client = new DocumentProcessorServiceClient(clientConfig)

      // 3. Call Google API
      // Format: projects/{project_id}/locations/{location}/processors/{processor_id}
      const name = `projects/${customConfig.projectId}/locations/${customConfig.location}/processors/${customConfig.processorId}`

      const [result] = await client.processDocument({
        name,
        rawDocument: {
          content,
          mimeType: document.file_type,
        },
      })

      const { document: googleDoc } = result

      if (!googleDoc) throw new Error('No document returned from Google Document AI')

      // 4. Parse Google Response (Simplified for Invoice Parser)
      const entities = googleDoc.entities || []
      
      // Helper to find entity value
      const findEntity = (type: string) => entities.find(e => e.type === type)?.normalizedValue?.text || 
                                           entities.find(e => e.type === type)?.mentionText

      const vendorName = findEntity('supplier_name')
      const customerName = findEntity('receiver_name') // Google Invoice Parser uses receiver_name
      const invoiceDate = findEntity('invoice_date')
      const totalAmount = entities.find(e => e.type === 'total_amount')?.normalizedValue?.text // usually structured
      const currency = entities.find(e => e.type === 'currency')?.normalizedValue?.text || 'USD'
      const invoiceId = findEntity('invoice_id')

      // Parse date (Google usually returns YYYY-MM-DD in normalizedValue)
      let parsedDate = invoiceDate
      if (invoiceDate) {
        // Try to normalize if not already
        try {
          parsedDate = new Date(invoiceDate).toISOString().split('T')[0]
        } catch (e) {}
      }

      // Parse amount
      let parsedAmount = 0
      if (totalAmount) {
        parsedAmount = parseFloat(totalAmount.replace(/[^0-9.-]+/g, ''))
      }

      // Extract Line Items (if available)
      const lineItems = entities
        .filter(e => e.type === 'line_item')
        .map(item => {
          const props = item.properties || []
          const desc = props.find(p => p.type === 'line_item/description')?.mentionText || 'Item'
          const amt = props.find(p => p.type === 'line_item/amount')?.normalizedValue?.text || '0'
          return {
            description: desc,
            amount: parseFloat(amt),
            quantity: 1
          }
        })

      return {
        vendor_name: vendorName || undefined,
        customer_name: customerName || undefined,
        document_date: parsedDate || undefined,
        total_amount: parsedAmount,
        currency: currency || undefined,
        invoice_number: invoiceId || undefined,
        line_items: lineItems,
        document_type: 'invoice', // Assuming we used Invoice Parser
        transaction_type: 'expense', // Invoices are usually expenses
        confidence_score: 0.9 // You can calculate average confidence from entities
      }

    } catch (error) {
      console.error('Google Document AI Error:', error)
      throw error
    }
  }

  /**
   * Process document using Qwen Vision (via OpenAI Compatible API)
   */
  private static async processWithQwenVision(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string,
    tenantLocale?: string,
    tenantAliases?: string[]
  ): Promise<ExtractedData> {
    const customConfig = this.resolveMergedProviderConfig(config)
    const apiKey = this.resolveApiKey(config)
    
    // Qwen defaults (DashScope)
    const baseURL = customConfig.baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    const model = this.resolveModelName(config, 'qwen-vl-max')

    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName, tenantLocale, tenantAliases)
  }

  /**
   * Process document using OpenAI Vision
   */
  private static async processWithOpenAIVision(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string,
    tenantLocale?: string,
    tenantAliases?: string[]
  ): Promise<ExtractedData> {
    const customConfig = this.resolveMergedProviderConfig(config)
    const apiKey = this.resolveApiKey(config)
    
    // OpenAI defaults
    // If baseUrl is not provided in customConfig, it will be undefined, 
    // which causes the OpenAI SDK to use the default (https://api.openai.com/v1)
    const baseURL = customConfig.baseUrl 
    const model = this.resolveModelName(config, 'gpt-4-vision-preview')

    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName, tenantLocale, tenantAliases)
  }

  /**
   * Process document using OpenRouter
   */
  private static async processWithOpenRouter(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string,
    tenantLocale?: string,
    tenantAliases?: string[]
  ): Promise<ExtractedData> {
    const customConfig = this.resolveMergedProviderConfig(config)
    const apiKey = this.resolveApiKey(config)
    
    // OpenRouter defaults
    const baseURL = customConfig.baseUrl || 'https://openrouter.ai/api/v1'
    const model = this.resolveModelName(config, 'google/gemini-2.0-flash-exp:free')

    // OpenRouter specific headers
    const extraHeaders = {
      "HTTP-Referer": "https://ledgerai.com", // Replace with your actual site URL
      "X-Title": "LedgerAI"
    }
    
    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName, tenantLocale, tenantAliases, extraHeaders)
  }

  /**
   * Process document using DeepSeek (via OpenAI Compatible API)
   */
  private static async processWithDeepSeek(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string,
    tenantLocale?: string,
    tenantAliases?: string[]
  ): Promise<ExtractedData> {
    const customConfig = this.resolveMergedProviderConfig(config)
    const apiKey = this.resolveApiKey(config)
    
    // DeepSeek defaults
    const baseURL = customConfig.baseUrl || 'https://api.deepseek.com'
    const model = this.resolveModelName(config, 'deepseek-chat')

    // Warning: DeepSeek's main models (deepseek-chat) do not support Vision yet.
    // This will likely fail unless the user provides a custom model that supports it.
    
    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName, tenantLocale, tenantAliases)
  }

  /**
   * Generic OpenAI Compatible Vision Processor
   * Handles Qwen, DeepSeek, OpenAI, etc.
   */
  private static async processWithOpenAICompatibleVision(
    document: Document,
    apiKey: string,
    baseURL: string,
    model: string,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string,
    tenantLocale?: string,
    tenantAliases?: string[],
    defaultHeaders?: Record<string, string>
  ): Promise<ExtractedData> {
    try {
      let base64Image: string
      
      if (fileBuffer) {
        base64Image = fileBuffer.toString('base64')
      } else {
        // 1. Download file
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('documents')
          .download(document.file_path)

        if (downloadError || !fileData) throw new Error('Failed to download file from storage')

        // 2. Convert to base64
        const arrayBuffer = await fileData.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        base64Image = buffer.toString('base64')
      }
      
      const dataUrl = `data:${document.file_type};base64,${base64Image}`

      // 3. Initialize OpenAI Client
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
        defaultHeaders: defaultHeaders
      })

      const normalizedTenantLocale = normalizeTenantLocaleTag(tenantLocale)
      const outputLanguage = resolveTenantLanguageLabel(normalizedTenantLocale)

      // 4. Construct Prompt
      const aliasNote = Array.isArray(tenantAliases) && tenantAliases.length > 0
        ? `Known alternate names for the tenant: ${tenantAliases.map(a => `"${a}"`).join(', ')}.`
        : ''

      const systemPrompt = `You are an expert accounting AI. Extract data from this ${document.document_type || 'document'} into JSON format.
      Return ONLY valid JSON with no markdown formatting.
      
      The name of the company/tenant that owns this document is: "${tenantName || 'Unknown'}".
      ${aliasNote}

      OUTPUT LANGUAGE (TENANT LOCALE):
      - The tenant locale is "${normalizedTenantLocale}". Write all natural-language descriptive fields in ${outputLanguage}.
      - For proper nouns or legal names, do NOT translate. However, if the document shows multiple-language variants of the same name (e.g. English + Chinese), choose the variant that matches the tenant locale:
        - For zh locales, prefer the Chinese name variant.
        - For en locale, prefer the English name variant.
        - Keep the chosen variant exactly as printed (no translation). Fields: "vendor_name", "customer_name", "bank_name", "account_holder_name".
      - Do NOT translate enum-like fields or constrained values. Keep:
        - "document_type" as one of: "invoice" | "receipt" | "credit_note" | "bank_statement"
        - "transaction_type" as: "income" | "expense" | "transfer" (use "income"/"expense" per rules below)
        - Bank transaction "type" as: "DEBIT" | "CREDIT"
      - Keep numbers as numbers (no locale separators) and dates as YYYY-MM-DD.
      
      CRITICAL - TENANT VALIDATION:
      - Check if the document belongs to "${tenantName || 'Unknown'}". Look for the company name or any of its known alternate names in the "Bill To", "Ship To", or "Receiver" fields.
      - Set "is_belongs_to_tenant" to true if found, false otherwise.
      - Also provide a "confidence_score" (0.0 to 1.0) indicating how confident you are in the extraction and validation.
      
      If this is a BANK STATEMENT:
      - Set "document_type" to "bank_statement"
      - Extract "bank_name" and "account_number" (last 4 digits if possible)
      - Extract "account_holder_name" (the name of the account owner shown on the statement). Look for "Account Name", "Name", or the address block.
      - Extract "statement_period_start" (YYYY-MM-DD). Look for "From", "Period Beginning", "Start Date", "Opening Date".
      - Extract "statement_period_end" (YYYY-MM-DD). Look for "To", "Period Ending", "End Date", "Statement Date", "Closing Date".
      - Extract "opening_balance" (number). Look for "Beginning Balance", "Previous Balance", "Brought Forward", "Start Balance", "Opening Balance".
      - Extract "closing_balance" (number). Look for "Ending Balance", "New Balance", "Current Balance", "Closing Balance".
      - Extract "bank_transactions" as an array of objects with:
        - "date" (YYYY-MM-DD)
        - "description" (string)
        - "amount" (number, absolute value)
        - Preferably extract the per-line "balance" (number) or "running_balance" if present on the statement.
          - Provide "balance" as the account running balance after the transaction (number, no separators).
          - Acceptable keys: "balance", "running_balance", "runningBalance". If multiple exist, return a "balance" field.
          - If the statement lists only individual amounts and an opening balance, include the per-line running balances computed by the AI when possible (but if not available, the platform will compute them from opening_balance as a fallback).
        - "type" ("DEBIT" for withdrawals/fees, "CREDIT" for deposits/interest)
      - NOTE: For bank statements, "customer_name" and "vendor_name" are usually NOT applicable. Do not hallucinate them.
      
      If this is an INVOICE, RECEIPT, or CREDIT NOTE:
      - Set "document_type" to "invoice", "receipt", or "credit_note"
      - Extract "vendor_name" (the sender/supplier)
      - Extract "customer_name" (the receiver/bill to)
      - Extract "document_date" (YYYY-MM-DD), "total_amount" (number), "invoice_number"
      - Extract "currency" (ISO code). If the currency symbol is ambiguous (e.g. "$") or missing:
        - Infer the currency based on the address/country of the vendor or customer.
        - Example: If address is in Hong Kong, infer "HKD". If in UK, infer "GBP". If in Europe, infer "EUR".
        - If explicitly stated (e.g. "USD", "CAD"), use that.
      - Extract "line_items" (array of {description, amount, quantity})
      
      CRITICAL - DETERMINE TRANSACTION TYPE:
      - Compare "vendor_name" and "customer_name" with the tenant name and its known alternates: "${tenantName || 'Unknown'}".
      - If the "vendor_name" is similar to the tenant name or any alternate, then this is an OUTGOING invoice (Sales), so set "transaction_type" to "income".
      - If the "customer_name" is similar to the tenant name or any alternate, then this is an INCOMING invoice (Purchase), so set "transaction_type" to "expense".
      - If uncertain, default to "expense".`

      // 5. Call API
      try {
        const response = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract data from this image:" },
                {
                  type: "image_url",
                  image_url: {
                    url: dataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 4000,
          temperature: 0.1,
        })

        // 6. Parse Response
        const content = response.choices[0].message.content
        if (!content) throw new Error('No content returned from AI')

        // Clean markdown code blocks if present
        // We handle cases where the closing block might be missing due to truncation (though max_tokens=4000 should prevent that)
        let jsonStr = content.replace(/```json\n?|```/g, '').trim()
        
        try {
          const data = JSON.parse(jsonStr)
          const sanitizedData = this.sanitizeExtractedData(data)
          return {
            ...sanitizedData,
            confidence_score: 0.85 // Placeholder as generic APIs don't always return confidence
          }
        } catch (e) {
          console.error('Failed to parse AI JSON response:', content)
          
          // Attempt to extract JSON if it's wrapped in text
          // We look for the first { and the last }
          const firstBrace = content.indexOf('{')
          const lastBrace = content.lastIndexOf('}')
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
             const potentialJson = content.substring(firstBrace, lastBrace + 1)
             try {
                const data = JSON.parse(potentialJson)
                const sanitizedData = this.sanitizeExtractedData(data)
                return {
                   ...sanitizedData,
                   confidence_score: 0.85
                }
             } catch (e2) {
                // If strict parsing fails, we could try a "repair" library in the future, 
                // but for now we just fail to avoid bad data.
                throw new Error('Invalid JSON response from AI (Extraction Failed)')
             }
          }
          throw new Error('Invalid JSON response from AI')
        }
      } catch (error: any) {
        // Handle specific error for models that don't support vision (like DeepSeek-Chat)
        if (error.status === 400 && error.error?.code === 'invalid_request_error') {
          if (error.error?.message?.includes('image_url') || JSON.stringify(error).includes('image_url')) {
             throw new Error(`The selected AI model (${model}) does not support image inputs (Vision). Please check your provider settings or use a model that supports Vision (e.g. Qwen-VL).`)
          }
        }
        throw error
      }

    } catch (error) {
      console.error(`OpenAI Compatible Vision Error (${model}):`, error)
      throw error
    }
  }

  /**
   * Sanitize extracted data to ensure correct types
   */
  private static sanitizeExtractedData(data: any): any {
    const cleanNumber = (val: any) => {
      if (typeof val === 'number') return val
      if (typeof val === 'string') {
        // Remove currency symbols and commas, keep negative sign and decimal point
        const num = parseFloat(val.replace(/[^0-9.-]+/g, ''))
        return isNaN(num) ? null : num
      }
      return null
    }

    const cleanDate = (val: any) => {
        if (!val) return null
        try {
            // If it's already YYYY-MM-DD, it's fine. 
            // If it's "Jan 1, 2024", Date.parse might handle it.
            const d = new Date(val)
            if (isNaN(d.getTime())) return val // Return original if parse fails, maybe DB can handle or it's garbage
            return d.toISOString().split('T')[0]
        } catch (e) {
            return val
        }
    }

    // Map synonyms for bank statements
    if (!data.statement_period_start && data.start_date) data.statement_period_start = data.start_date
    if (!data.statement_period_end && data.end_date) data.statement_period_end = data.end_date

    // Normalize common invoice/receipt party field variants
    if (!data.vendor_name) {
      data.vendor_name =
        data.supplier_name ||
        data.merchant_name ||
        data.seller_name ||
        data.issuer_name ||
        data.payee_name ||
        data.vendor ||
        data.from ||
        data.sender_name ||
        data.bill_from ||
        data.billed_from ||
        undefined
    }

    if (!data.customer_name) {
      data.customer_name =
        data.receiver_name ||
        data.buyer_name ||
        data.customer ||
        data.bill_to ||
        data.billed_to ||
        data.ship_to ||
        data.to ||
        data.recipient_name ||
        data.payer ||
        data.payer_name ||
        data.payer_party ||
        data.payor ||
        data.payee ||
        data.bill_to_name ||
        data.payer_details ||
        undefined
    }

    // Normalize belongs-to boolean variants
    if (typeof data.is_belongs_to_tenant !== 'boolean') {
      if (typeof data.belongs_to_tenant === 'boolean') data.is_belongs_to_tenant = data.belongs_to_tenant
      else if (typeof data.belongs_to_current_tenant === 'boolean') data.is_belongs_to_tenant = data.belongs_to_current_tenant
      else if (typeof data.belongs_to_company === 'boolean') data.is_belongs_to_tenant = data.belongs_to_company
    }
    
    // Opening Balance Synonyms
    if (!data.opening_balance) {
        if (data.start_balance) data.opening_balance = data.start_balance
        else if (data.beginning_balance) data.opening_balance = data.beginning_balance
        else if (data.previous_balance) data.opening_balance = data.previous_balance
        else if (data.brought_forward) data.opening_balance = data.brought_forward
    }

    // Closing Balance Synonyms
    if (!data.closing_balance) {
        if (data.end_balance) data.closing_balance = data.end_balance
        else if (data.ending_balance) data.closing_balance = data.ending_balance
        else if (data.new_balance) data.closing_balance = data.new_balance
        else if (data.current_balance) data.closing_balance = data.current_balance
    }

    if (data.opening_balance !== undefined) data.opening_balance = cleanNumber(data.opening_balance)
    if (data.closing_balance !== undefined) data.closing_balance = cleanNumber(data.closing_balance)
    if (data.total_amount !== undefined) data.total_amount = cleanNumber(data.total_amount)
    if (!data.tax_amount) {
      data.tax_amount =
        data.vat_amount ||
        data.vat ||
        data.tax_total ||
        data.total_tax ||
        data.tax ||
        data.sales_tax ||
        data.gst_amount ||
        data.gst ||
        data.vat_total ||
        undefined
    }
    if (data.tax_amount !== undefined) data.tax_amount = cleanNumber(data.tax_amount)
    
    if (data.statement_period_start) data.statement_period_start = cleanDate(data.statement_period_start)
    if (data.statement_period_end) data.statement_period_end = cleanDate(data.statement_period_end)
    if (data.document_date) data.document_date = cleanDate(data.document_date)

    if (data.bank_transactions && Array.isArray(data.bank_transactions)) {
      data.bank_transactions = data.bank_transactions.map((tx: any) => ({
        ...tx,
        amount: cleanNumber(tx.amount) || 0,
        balance: cleanNumber(tx.balance ?? tx.running_balance ?? tx.runningBalance) ?? null,
        date: cleanDate(tx.date)
      }))
    }

    // If opening_balance is present and transactions lack per-line balances,
    // compute running balances so downstream logic can use them to derive
    // statement opening/closing balances. We compute forward using opening_balance.
    if (data.bank_transactions && Array.isArray(data.bank_transactions) && (typeof data.opening_balance !== 'undefined' && data.opening_balance !== null)) {
      let running = cleanNumber(data.opening_balance) || 0
      data.bank_transactions = data.bank_transactions.map((tx: any) => {
        // If the tx already has a balance, keep it
        if (typeof tx.balance !== 'undefined' && tx.balance !== null) return tx
        // Apply transaction: CREDIT increases balance, DEBIT decreases
        const amt = cleanNumber(tx.amount) || 0
        if (tx.type === 'CREDIT') running = Number((running + amt).toFixed(2))
        else running = Number((running - amt).toFixed(2))
        return { ...tx, balance: running }
      })
    }
    
    return data
  }

  /**
   * Mock AI extraction - Replace this with actual AI service call
   * 
   * Example integrations:
   * - OpenAI GPT-4 Vision API
   * - Anthropic Claude with vision
   * - Azure Document Intelligence
   * - Google Cloud Document AI
   */
  private static async mockAIExtraction(document: Document): Promise<ExtractedData> {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Mock extracted data based on file type
    const fileType = document.file_type
    const fileName = document.file_name.toLowerCase()

    // Intelligent detection simulation
    let docType: 'invoice' | 'receipt' | 'credit_note' | 'bank_statement' | 'other' = 'invoice'
    let txType: 'income' | 'expense' = 'expense'

    if (fileName.includes('receipt')) docType = 'receipt'
    else if (fileName.includes('credit')) docType = 'credit_note'
    else if (fileName.includes('statement')) docType = 'bank_statement'

    // Simple heuristic for transaction type
    if (docType === 'credit_note') txType = 'income' // Usually a refund
    
    // Randomize slightly for demo
    const amount = Math.floor(Math.random() * 1000) + 50

    if (docType === 'bank_statement') {
      return {
        document_type: 'bank_statement',
        statement_period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        statement_period_end: new Date().toISOString().split('T')[0],
        opening_balance: 10000,
        closing_balance: 12500,
        currency: 'USD',
        bank_transactions: [
          { date: new Date().toISOString().split('T')[0], description: 'Deposit from Client A', amount: 5000, type: 'CREDIT' },
          { date: new Date().toISOString().split('T')[0], description: 'Office Rent', amount: 2000, type: 'DEBIT' },
          { date: new Date().toISOString().split('T')[0], description: 'Software Subscription', amount: 500, type: 'DEBIT' }
        ],
        confidence_score: 0.95
      }
    }

    if (fileType === 'application/pdf' || fileType.startsWith('image/')) {
      return {
        vendor_name: 'Sample Vendor Inc.',
        document_date: new Date().toISOString().split('T')[0],
        total_amount: amount,
        currency: 'USD',
        invoice_number: 'INV-' + Math.floor(Math.random() * 10000),
        tax_amount: amount * 0.1,
        line_items: [
          {
            description: 'Professional Services',
            amount: amount * 0.8,
            quantity: 1
          },
          {
            description: 'Service Fee',
            amount: amount * 0.2,
            quantity: 1
          }
        ],
        payment_terms: 'Net 30',
        notes: 'Extracted by AI - Mock Data',
        document_type: docType,
        transaction_type: txType
      }
    }

    return {
      vendor_name: 'Unknown Vendor',
      document_date: new Date().toISOString().split('T')[0],
      total_amount: 0,
      currency: 'USD',
      document_type: 'other',
      transaction_type: 'expense'
    }
  }

  /**
   * Create bank statement and transaction records
   */
  private static async createBankStatementRecords(
    document: Document,
    extractedData: ExtractedData,
    supabase: any
  ): Promise<void> {
    try {
      // 1. Check if Bank Statement Record already exists (e.g. created by upload component)
      const { data: existingStatement } = await supabase
        .from('bank_statements')
        .select('*')
        .eq('document_id', document.id)
        .maybeSingle()

      let statementId = existingStatement?.id
      let bankAccountId = existingStatement?.bank_account_id

      // 2. If no bank account linked, try to find or create one
      if (!bankAccountId && (extractedData.account_number || extractedData.bank_name)) {
        // Search for existing account
        let query = supabase
          .from('bank_accounts')
          .select('id')
          .eq('tenant_id', document.tenant_id)
          .eq('is_active', true)
        
        if (extractedData.account_number) {
          query = query.ilike('account_number', `%${extractedData.account_number}%`)
        } else if (extractedData.bank_name) {
          query = query.ilike('bank_name', `%${extractedData.bank_name}%`)
        }

        const { data: accounts } = await query.limit(1)
        
        if (accounts && accounts.length > 0) {
          bankAccountId = accounts[0].id
        } else {
          // Fetch tenant default currency
          const { data: tenant } = await supabase
            .from('tenants')
            .select('currency')
            .eq('id', document.tenant_id)
            .single()
            
          const defaultCurrency = tenant?.currency || 'USD'
          const accountCurrency = extractedData.currency || defaultCurrency

          // Create new bank account
          const { data: newAccount, error: accError } = await supabase
            .from('bank_accounts')
            .insert({
              tenant_id: document.tenant_id,
              account_name: `${extractedData.bank_name || 'Bank'} ${extractedData.account_number ? ' - ' + extractedData.account_number : ''}`,
              bank_name: extractedData.bank_name || 'Unknown Bank',
              account_number: extractedData.account_number || null,
              currency: accountCurrency,
              is_active: true
            })
            .select()
            .single()
          
          if (!accError && newAccount) {
            bankAccountId = newAccount.id
          }
        }
      }

      // derive sensible fallbacks for missing statement-level data from
      // bank transaction line items: first item -> start/opening, last -> end/closing
      // Derive statement-level values from transactions when missing
      const { default: deriveStatementFromTransactions } = await import('@/lib/documents/statement-derivation')
      const txs = extractedData.bank_transactions || []
      const derived = deriveStatementFromTransactions({
        statement_period_start: extractedData.statement_period_start,
        statement_period_end: extractedData.statement_period_end,
        opening_balance: extractedData.opening_balance,
        closing_balance: extractedData.closing_balance
      }, txs)

      const startDateToUse = derived.statement_period_start
      const endDateToUse = derived.statement_period_end
      const derivedOpeningBalance = derived.opening_balance
      const derivedClosingBalance = derived.closing_balance

      // Use derived values when updating/creating statements below
      
      if (existingStatement) {
        // Update existing statement
        const { error: updateError } = await supabase
          .from('bank_statements')
          .update({
            bank_account_id: bankAccountId || existingStatement.bank_account_id,
            statement_date: extractedData.statement_period_end || new Date().toISOString().split('T')[0],
            start_date: startDateToUse || existingStatement.start_date || null,
            end_date: endDateToUse || existingStatement.end_date || null,
            opening_balance: derivedOpeningBalance ?? existingStatement.opening_balance ?? null,
            closing_balance: derivedClosingBalance ?? existingStatement.closing_balance ?? null,
            status: 'PROCESSED'
          })
          .eq('id', statementId)

        if (updateError) {
          console.error('Error updating bank statement:', updateError)
          return
        }

        // Delete existing transactions for this statement to prevent duplicates
        // This ensures that re-processing a statement overrides the old feed
        const { error: deleteError } = await supabase
          .from('bank_transactions')
          .delete()
          .eq('bank_statement_id', statementId)
        
        if (deleteError) {
          console.error('Error deleting existing bank transactions:', deleteError)
          // We continue even if delete fails, though it might cause duplicates. 
          // Ideally we should transaction this, but Supabase client doesn't support transactions easily.
        }

      } else {
        // Create new Bank Statement Record
        const { data: statement, error: stmtError } = await supabase
          .from('bank_statements')
          .insert({
            tenant_id: document.tenant_id,
            document_id: document.id,
            bank_account_id: bankAccountId, // Link if found
            statement_date: extractedData.statement_period_end || new Date().toISOString().split('T')[0],
            start_date: startDateToUse,
            end_date: endDateToUse,
            opening_balance: derivedOpeningBalance ?? null,
            closing_balance: derivedClosingBalance ?? null,
            status: 'IMPORTED'
          })
          .select()
          .single()

        if (stmtError || !statement) {
          console.error('Error creating bank statement:', stmtError)
          return
        }
        statementId = statement.id
      }

      // 3. Create Bank Transactions
      if (extractedData.bank_transactions && extractedData.bank_transactions.length > 0) {
        const transactions = extractedData.bank_transactions.map((tx: any) => ({
          tenant_id: document.tenant_id,
          bank_statement_id: statementId,
          transaction_date: tx.date,
          description: tx.description,
          amount: tx.amount,
          transaction_type: tx.type,
          status: 'PENDING',
          confidence_score: extractedData.confidence_score || 0.9
        }))

        const { error: txError } = await supabase
          .from('bank_transactions')
          .insert(transactions)

        if (txError) {
          console.error('Error creating bank transactions:', txError)
        }
      }
    } catch (error) {
      console.error('Error in createBankStatementRecords:', error)
    }
  }
  private static async createDraftTransaction(
    document: Document,
    extractedData: ExtractedData,
    supabase: any,
    existingTransactionId: string | null = null
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get suggested accounts from chart of accounts
      const accounts = await this.suggestAccounts(document.tenant_id, extractedData, supabase)
      
      // Get tenant currency
      const { data: tenant } = await supabase
        .from('tenants')
        .select('currency')
        .eq('id', document.tenant_id)
        .single()
      
      const tenantCurrency = tenant?.currency || 'USD'
      const txCurrency = extractedData.currency || tenantCurrency
      const isForeign = txCurrency !== tenantCurrency

      let transactionId = existingTransactionId
      let transaction = null

      if (transactionId) {
        // UPDATE existing transaction
        const { data: updatedTx, error: updateError } = await supabase
          .from('transactions')
          .update({
            transaction_date: extractedData.document_date || new Date().toISOString().split('T')[0],
            description: `${extractedData.vendor_name || 'Vendor'} - ${document.file_name}`,
            reference_number: extractedData.invoice_number || null,
            // We don't reset status to DRAFT if it was already POSTED? 
            // User said "update existing transactions". Usually safe to update if it's just a draft.
            // If it's POSTED, we might want to be careful. For now, let's assume we can update.
            document_id: document.id, // Point to the NEW document
            currency: txCurrency,
            // exchange_rate: 1.0 // Don't reset exchange rate if it was manually set? 
            // Actually, if currency changed, we should probably reset or let the editor handle it.
          })
          .eq('id', transactionId)
          .select()
          .single()
        
        if (updateError) {
           console.error('Error updating transaction:', updateError)
           return
        }
        transaction = updatedTx
        
        // Delete existing line items to replace them
        await supabase.from('line_items').delete().eq('transaction_id', transactionId)
        
      } else {
        // CREATE new transaction
        const { data: newTx, error: txError } = await supabase
          .from('transactions')
          .insert({
            tenant_id: document.tenant_id,
            transaction_date: extractedData.document_date || new Date().toISOString().split('T')[0],
            description: `${extractedData.vendor_name || 'Vendor'} - ${document.file_name}`,
            reference_number: extractedData.invoice_number || null,
            status: 'DRAFT',
            document_id: document.id,
            created_by: user?.id || null,
            currency: txCurrency,
            exchange_rate: 1.0
          } as unknown as Database['public']['Tables']['transactions']['Insert'])
          .select()
          .single()

        if (txError || !newTx) {
          console.error('Error creating transaction:', txError)
          return
        }
        transaction = newTx
        transactionId = newTx.id
      }

      // Create line items (double-entry)
      const lineItems = []
      const amount = extractedData.total_amount || 0
      const isExpense = extractedData.transaction_type === 'expense'

      // Helper to create line item object
      const createLineItem = (accountId: string, type: 'debit' | 'credit', description: string) => {
         const item: any = {
            transaction_id: transactionId,
            account_id: accountId,
            description: description,
            debit: 0,
            credit: 0
         }
         
         if (type === 'debit') {
            item.debit = amount
            if (isForeign) item.debit_foreign = amount
         } else {
            item.credit = amount
            if (isForeign) item.credit_foreign = amount
         }
         return item
      }

      if (isExpense) {
        // Expense Transaction
        // Debit: Expense Account
        if (accounts.expense) {
          lineItems.push(createLineItem(accounts.expense, 'debit', extractedData.line_items?.[0]?.description || 'Expense'))
        }

        // Credit: Accounts Payable (Liability) or Cash (Asset)
        if (accounts.payable) {
          lineItems.push(createLineItem(accounts.payable, 'credit', `Payment to ${extractedData.vendor_name || 'vendor'}`))
        }
      } else {
        // Income Transaction
        // Debit: Accounts Receivable (Asset) or Cash
        if (accounts.payable) { // Using payable as "Bank/Cash" proxy
             lineItems.push(createLineItem(accounts.payable, 'debit', `Payment from ${extractedData.vendor_name || 'customer'}`))
        }
        
        // Credit: Revenue Account (using expense as proxy for now if not found, but ideally need revenue)
        if (accounts.expense) {
             lineItems.push(createLineItem(accounts.expense, 'credit', 'Revenue'))
        }
      }

      if (lineItems.length > 0) {
        const { error: lineError } = await supabase
          .from('line_items')
          .insert(lineItems)

        if (lineError) {
          console.error('Error creating line items:', lineError)
        }
      }
    } catch (error) {
      console.error('Error creating draft transaction:', error)
    }
  }

  /**
   * Suggest appropriate accounts based on extracted data
   * Uses AI/rules to map document data to chart of accounts
   */
  private static async suggestAccounts(
    tenantId: string,
    extractedData: ExtractedData,
    supabase: any
  ): Promise<{ expense: string | null; payable: string | null }> {
    try {
      // Get tenant's chart of accounts
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      if (!accounts || accounts.length === 0) {
        return { expense: null, payable: null }
      }

      // Simple rule-based mapping (in production, use AI for better accuracy)
      let expenseAccount = null
      let payableAccount = null

      // Find expense account
      const description = extractedData.line_items?.[0]?.description?.toLowerCase() || ''
      
      if (description.includes('consulting') || description.includes('professional')) {
        expenseAccount = accounts.find((a: Account) => a.code === '6500')?.id // Professional Fees
      } else if (description.includes('office') || description.includes('supplies')) {
        expenseAccount = accounts.find((a: Account) => a.code === '6300')?.id // Office Supplies
      } else if (description.includes('marketing') || description.includes('advertising')) {
        expenseAccount = accounts.find((a: Account) => a.code === '6400')?.id // Marketing
      } else {
        // Default to first expense account or COGS
        expenseAccount = accounts.find((a: Account) => a.account_type === 'EXPENSE')?.id
      }

      // Find payable account (Accounts Payable)
      payableAccount = accounts.find((a: Account) => a.code === '2000')?.id

      return {
        expense: expenseAccount || null,
        payable: payableAccount || null
      }
    } catch (error) {
      console.error('Error suggesting accounts:', error)
      return { expense: null, payable: null }
    }
  }

  /**
   * Infer document type based on extracted data
   */
  private static inferDocumentType(data: ExtractedData): string {
    if (data.invoice_number) return 'invoice'
    if (data.total_amount && data.total_amount < 100) return 'receipt'
    if (data.line_items && data.line_items.length > 5) return 'invoice'
    return 'document'
  }

  /**
   * Get AI provider configuration for a tenant
   * This will be used when integrating actual AI providers
   */
  static async getTenantAIConfig(tenantId: string) {
    const supabase = await createClient()

    // 1. Try tenant-specific configuration first
    const { data: tenantConfig } = await supabase
      .from('tenant_ai_configurations')
      .select(`
        *,
        ai_providers (*)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (tenantConfig) {
      // tenant_ai_configurations can be active while its referenced provider is inactive/removed.
      // Treat that as "no effective config" and fall back to the platform default.
      const provider = (tenantConfig as any).ai_providers as { id?: string; is_active?: boolean } | null | undefined
      if (provider?.id && provider.is_active === true) {
        const platformKey = (tenantConfig as any)?.ai_providers?.config?.platform_api_key
        const hasTenantKey = typeof (tenantConfig as any)?.api_key_encrypted === 'string' && (tenantConfig as any).api_key_encrypted.trim()

        return {
          ...(tenantConfig as any),
          api_key_encrypted: hasTenantKey ? (tenantConfig as any).api_key_encrypted : (platformKey ?? null),
        }
      }
    }

    // 2. Fallback to a platform-level default provider
    // Prefer the provider marked as default in config (config.is_default = true).
    const { data: configuredDefaultProvider } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('is_active', true)
      // PostgREST JSON path filter
      .eq('config->>is_default', 'true')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: firstActiveProvider } = configuredDefaultProvider
      ? { data: null as any }
      : await supabase
          .from('ai_providers')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

    const defaultProvider = configuredDefaultProvider || firstActiveProvider

    if (!defaultProvider) {
      return null
    }

    // Shape the result similar to tenant_ai_configurations + joined ai_providers
    return {
      tenant_id: tenantId,
      ai_provider_id: defaultProvider.id,
      api_key_encrypted: (defaultProvider as any)?.config?.platform_api_key ?? null,
      model_name: null,
      custom_config: defaultProvider.config || {},
      is_active: true,
      ai_providers: defaultProvider,
    }
  }
}

/**
 * Integration Guide for Production AI Services:
 * 
 * 1. OpenAI GPT-4 Vision:
 *    - Install: npm install openai
 *    - Use GPT-4 Vision API to extract text from images/PDFs
 *    - Structured output with JSON mode
 * 
 * 2. Anthropic Claude:
 *    - Install: npm install @anthropic-ai/sdk
 *    - Use Claude 3 with vision capabilities
 *    - Supports PDF and image analysis
 * 
 * 3. Azure Document Intelligence:
 *    - Install: npm install @azure/ai-form-recognizer
 *    - Specialized for invoice/receipt extraction
 *    - Pre-trained models available
 * 
 * 4. Google Cloud Document AI:
 *    - Install: npm install @google-cloud/documentai
 *    - Invoice parser and receipt parser
 *    - High accuracy for financial documents
 * 
 * Implementation steps:
 * 1. Get tenant's AI configuration
 * 2. Download document from Supabase Storage
 * 3. Convert to base64 or use signed URL
 * 4. Call AI provider API with appropriate prompts
 * 5. Parse and validate response
 * 6. Save to document_data table
 */
