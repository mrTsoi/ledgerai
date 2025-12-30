import { createService } from '@/lib/supabase/typed'

export type TenantCandidate = {
  tenantId?: string
  confidence: number
  reasons: string[]
  tenantName?: string
}

export type TenantMatchResult = {
  candidates: TenantCandidate[]
  isMultiTenant: boolean
  suggestedTenantName?: string
}

export async function findTenantCandidates(
  extractedData: any,
  currentTenantId: string,
  accessibleTenantIds: string[]
): Promise<TenantMatchResult> {
  const svc = createService()
  const candidates: any[] = []
  let isMultiTenant = false

  const cleanText = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t.length > 0 ? t : null
  }

  const safeLower = (v: unknown): string | null => {
    const t = cleanText(v)
    return t ? t.toLowerCase() : null
  }

  const safeHostname = (urlish: unknown): string | null => {
    const raw = cleanText(urlish)
    if (!raw) return null
    try {
      const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
      const host = u.hostname.replace(/^www\./, '').trim().toLowerCase()
      return host.length > 0 ? host : null
    } catch {
      return null
    }
  }

  const allowedTenantIds = (accessibleTenantIds || []).filter((id) => typeof id === 'string' && id.length > 0)
  const allowedSet = new Set(allowedTenantIds)
  // If we have no allowed tenants, we cannot match.
  if (allowedTenantIds.length === 0) {
    return {
      candidates: [],
      isMultiTenant: false,
      suggestedTenantName: inferSuggestedTenantName(extractedData),
    }
  }

  // Extract potential identifiers
  const potentialNames = [
    extractedData.vendor_name,
    extractedData.customer_name,
    extractedData.account_holder_name,
  ]
    .map(safeLower)
    .filter((n): n is string => typeof n === 'string' && n.length >= 3)

  const potentialTaxIds = [
    extractedData.tax_id,
    extractedData.vat_number,
    extractedData.abn,
    extractedData.gst_number
  ].filter(Boolean)

  const potentialDomains = [
    typeof extractedData?.vendor_email === 'string' && extractedData.vendor_email.includes('@')
      ? extractedData.vendor_email.split('@').pop()
      : null,
    typeof extractedData?.customer_email === 'string' && extractedData.customer_email.includes('@')
      ? extractedData.customer_email.split('@').pop()
      : null,
    safeHostname(extractedData?.website),
  ]
    .map((d) => (typeof d === 'string' ? d.trim().toLowerCase().replace(/^www\./, '') : null))
    .filter((d): d is string => typeof d === 'string' && d.length > 0)

  const suggestedTenantName = inferSuggestedTenantName(extractedData)

  // 1. Match against Tenant Identifiers (Strongest Signal)
  if (potentialTaxIds.length > 0) {
    const { data: taxMatches } = await svc
      .from('tenant_identifiers')
      .select('tenant_id, identifier_value')
      .eq('identifier_type', 'TAX_ID')
      .in('identifier_value', potentialTaxIds)
    
    if (taxMatches && taxMatches.length > 0) {
      taxMatches.forEach((match: any) => {
        if (match.tenant_id !== currentTenantId && allowedSet.has(match.tenant_id)) {
          candidates.push({
            tenantId: match.tenant_id,
            confidence: 0.95,
            reasons: [`Matched Tax ID: ${match.identifier_value}`]
          })
        }
      })
    }
  }

  // 2. Match against Domains
  if (potentialDomains.length > 0) {
    const { data: domainMatches } = await svc
      .from('tenant_identifiers')
      .select('tenant_id, identifier_value')
      .eq('identifier_type', 'DOMAIN')
      .in('identifier_value', potentialDomains)

    if (domainMatches && domainMatches.length > 0) {
      domainMatches.forEach((match: any) => {
        if (match.tenant_id !== currentTenantId && allowedSet.has(match.tenant_id)) {
          candidates.push({
            tenantId: match.tenant_id,
            confidence: 0.85,
            reasons: [`Matched Domain: ${match.identifier_value}`]
          })
        }
      })
    }
  }

  // 3. Match against Tenant Names / Aliases (Fuzzy-ish)
  // We check the `tenant_identifiers` table for alias/name entries first,
  // falling back to a simple tenants.name ilike search as a secondary signal.
  if (potentialNames.length > 0) {
    for (const name of potentialNames) {
      if (name.length < 3) continue

      // Match against tenant_identifiers where owners may have added alternate names
      try {
        const { data: idMatches } = await svc
          .from('tenant_identifiers')
          .select('tenant_id, identifier_value, identifier_type')
          .in('tenant_id', allowedTenantIds)
          .in('identifier_type', ['NAME_ALIAS'])
          .ilike('identifier_value', `%${name.replace(/[%_]/g, (m) => `\\${m}`)}%`)
          .limit(20)

        if (idMatches && idMatches.length > 0) {
          idMatches.forEach((match: any) => {
            if (match.tenant_id !== currentTenantId) {
              const existing = candidates.find(c => c.tenantId === match.tenant_id)
              if (!existing) {
                candidates.push({
                  tenantId: match.tenant_id,
                  confidence: 0.78,
                  reasons: [`Matched Tenant ${match.identifier_type}: ${match.identifier_value}`]
                })
              }
            }
          })
        }
      } catch (e) {
        // Ignore failures here; we'll fall back to tenants.name search
      }

      // Secondary: check tenants.name directly for a match
      try {
        const { data: nameMatches } = await svc
          .from('tenants')
          .select('id, name')
          .in('id', allowedTenantIds)
          .ilike('name', `%${name.replace(/[%_]/g, (m) => `\\${m}`)}%`)
          .limit(5)

        if (nameMatches) {
          nameMatches.forEach((match: any) => {
            if (match.id !== currentTenantId) {
              const existing = candidates.find(c => c.tenantId === match.id)
              if (!existing) {
                candidates.push({
                  tenantId: match.id,
                  confidence: 0.72,
                  reasons: [`Matched Tenant Name: ${match.name}`]
                })
              }
            }
          })
        }
      } catch (e) {
        // swallow
      }
    }
  }

  // 3.5 Bank account number matching (strong for bank statements)
  if (typeof extractedData?.account_number === 'string' && extractedData.account_number.trim().length > 0) {
    const acct = extractedData.account_number.trim()
    const { data: bankMatches } = await svc
      .from('bank_accounts')
      .select('tenant_id, account_number')
      .in('tenant_id', allowedTenantIds)
      .ilike('account_number', `%${acct}%`)
      .limit(5)

    if (bankMatches && bankMatches.length > 0) {
      bankMatches.forEach((match: any) => {
        if (match.tenant_id !== currentTenantId) {
          const existing = candidates.find((c) => c.tenantId === match.tenant_id)
          if (!existing) {
            candidates.push({
              tenantId: match.tenant_id,
              confidence: 0.95,
              reasons: [`Matched Bank Account: ${match.account_number ?? acct}`]
            })
          }
        }
      })
    }
  }

  // 4. Check for Multi-Tenant Signals
  // If we found candidates AND the current tenant is also mentioned strongly
  // e.g. Invoice from Vendor A (Tenant A) to Customer B (Tenant B)
  // If we are currently in Tenant A, but document says "Bill To: Tenant B", it might be an outgoing invoice
  // If we are in Tenant B, it's an incoming invoice.
  // If the document lists TWO entities that BOTH exist in our system as tenants, it's multi-tenant.
  
  // Check if current tenant is mentioned
  const { data: currentTenant } = await svc.from('tenants').select('name').eq('id', currentTenantId).single()
  let currentTenantNames: string[] = []
  try {
    const { data: aliasRows } = await svc
      .from('tenant_identifiers')
      .select('identifier_value')
      .eq('tenant_id', currentTenantId)
      .in('identifier_type', ['NAME_ALIAS'])
      .limit(50)
    const primary = currentTenant?.name ? String(currentTenant.name).toLowerCase() : ''
    const aliasArr = Array.isArray(aliasRows) ? aliasRows.map((r: any) => String(r.identifier_value || '').toLowerCase()) : []
    currentTenantNames = [primary, ...aliasArr].filter((x): x is string => Boolean(x))
  } catch (e) {
    const primary = currentTenant?.name ? String(currentTenant.name).toLowerCase() : null
    currentTenantNames = primary ? [primary] : []
  }

  const isCurrentTenantMentioned =
    currentTenantNames.length > 0 &&
    potentialNames.some((n) => currentTenantNames.some((ct) => n.includes(ct) || ct.includes(n)))
  
  if (candidates.length > 0 && isCurrentTenantMentioned) {
    isMultiTenant = true
    // Add "Multi-tenant detected" to reasons
    candidates.forEach(c => c.reasons.push('Multi-tenant document detected (involves current tenant)'))
  } else if (candidates.length > 1) {
     // If it matches two OTHER tenants, it's also multi-tenant (but maybe not relevant to current one?)
     // This is rare: uploading a doc for Tenant B and C into Tenant A.
     isMultiTenant = true
  }

  // Deduplicate candidates
  const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.tenantId, c])).values())

  // Enrich candidates with tenant names for display, best-effort
  const tenantIds = uniqueCandidates.map((c) => c.tenantId).filter(Boolean) as string[]
  if (tenantIds.length > 0) {
    try {
      const { data: tenants } = await svc
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds)

      const nameMap = new Map<string, string>()
      if (Array.isArray(tenants)) {
        tenants.forEach((t: any) => {
          if (t && t.id) nameMap.set(String(t.id), t.name)
        })
      }

      uniqueCandidates.forEach((c) => {
        if (c.tenantId) c.tenantName = nameMap.get(String(c.tenantId))
      })
    } catch (e) {
      // ignore enrichment failures
    }
  }

  return {
    candidates: uniqueCandidates,
    isMultiTenant,
    suggestedTenantName
  }
}

function inferSuggestedTenantName(extractedData: any): string | undefined {
  const raw =
    (typeof extractedData?.customer_name === 'string' && extractedData.customer_name.trim()) ||
    (typeof extractedData?.account_holder_name === 'string' && extractedData.account_holder_name.trim()) ||
    (typeof extractedData?.vendor_name === 'string' && extractedData.vendor_name.trim()) ||
    undefined
  if (!raw) return undefined
  // Avoid obviously non-company values
  const v = String(raw).trim()
  if (v.length < 2) return undefined
  return v
}
