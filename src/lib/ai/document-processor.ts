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
  upsertDocumentData
} from '../supabase/typed'

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
    type: 'DEBIT' | 'CREDIT'
  }>
  confidence_score?: number // Added for AI confidence
  [key: string]: any
  is_belongs_to_tenant?: boolean
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
  
  /**
   * Process a document and extract structured data using AI
   * 
   * @param documentId - UUID of the document to process
   * @returns Promise<{ success: boolean, validationStatus?: string, validationFlags?: string[], error?: string, statusCode?: number }>
   */
  static async processDocument(documentId: string): Promise<{ success: boolean, validationStatus?: string, validationFlags?: string[], error?: string, statusCode?: number }> {
    try {
      const supabase = await createClient()

      // 1. Get document details
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, tenants(name, currency)')
        .eq('id', documentId)
        .single()

      if (docError || !document) {
        console.error('Document not found:', docError)
        return { success: false, error: 'Document not found', statusCode: 404 }
      }

      const docRow = document as unknown as Document & { tenants?: { name?: string; currency?: string } }
      const tenantName = docRow.tenants?.name || 'the company'
      const tenantCurrency = docRow.tenants?.currency || 'USD'

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
      const dupResp = await findDocumentsByTenantAndHash(docRow.tenant_id, hash, documentId)

      const duplicates = (dupResp.data as Array<{ id: string }>) || []
      const isDuplicate = duplicates && duplicates.length > 0
      const validationFlags: string[] = []
      let validationStatus = 'PENDING'
      let existingTransactionId: string | null = null

      if (isDuplicate) {
        validationFlags.push('DUPLICATE_DOCUMENT')
        validationStatus = 'NEEDS_REVIEW'
        console.log(`Duplicate document detected: ${documentId}`)
        
        // Find if there is an existing transaction for the original document
        // We use the first duplicate found as the "original"
        const originalDocId = duplicates[0].id
        const txResp = await findTransactionByDocumentId(originalDocId)

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
      
      // --- RATE LIMIT CHECK START ---
      if (aiConfig && aiConfig.ai_providers) {
          const providerConfig = aiConfig.ai_providers.config as any
          const limitMin = providerConfig?.per_minute_limit_default || 0
          const limitHour = providerConfig?.per_hour_limit_default || 0
          const limitDay = providerConfig?.per_day_limit_default || 0
          
          if (limitMin > 0 || limitHour > 0 || limitDay > 0) {
              try {
                  // We use a try-catch here because the RPC function might not exist if migration wasn't run
                  const { data: isAllowed, error: limitError } = await (supabase.rpc as any)('check_ai_rate_limit', {
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
        extractedData = await this.processWithGoogleDocumentAI(document, aiConfig, supabase, buffer)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'qwen-vision') {
        console.log('Processing with Qwen Vision...')
        extractedData = await this.processWithQwenVision(document, aiConfig, supabase, buffer, tenantName)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'openai-vision') {
        console.log('Processing with OpenAI Vision...')
        extractedData = await this.processWithOpenAIVision(document, aiConfig, supabase, buffer, tenantName)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'openrouter') {
        console.log('Processing with OpenRouter...')
        extractedData = await this.processWithOpenRouter(document, aiConfig, supabase, buffer, tenantName)
      } else if (aiConfig && aiConfig.ai_providers?.name === 'deepseek-ocr') {
        console.log('Processing with DeepSeek OCR...')
        extractedData = await this.processWithDeepSeek(document, aiConfig, supabase, buffer, tenantName)
      } else {
        throw new Error('No active AI provider configured for this tenant or platform')
      }

      // --- LOG USAGE START ---
      try {
          if (aiConfig?.ai_providers?.id) {
            await insertAIUsageLog({
              tenant_id: docRow.tenant_id,
              ai_provider_id: aiConfig.ai_providers.id,
              model: aiConfig.model_name || (aiConfig.ai_providers.config as any)?.models?.[0] || 'unknown',
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
      
      if (tenant) {
        const tenantName = ((tenant as any)?.name || '').toLowerCase()
        const vendorName = extractedData.vendor_name?.toLowerCase() || ''
        const customerName = extractedData.customer_name?.toLowerCase() || ''
        
        // Check if tenant is involved in the transaction
        // We trust the AI's judgment (is_belongs_to_tenant) if available, otherwise fallback to string matching
        let isTenantMatch = false
        
        if (typeof extractedData.is_belongs_to_tenant === 'boolean') {
           isTenantMatch = extractedData.is_belongs_to_tenant
        } else {
           // Special handling for Bank Statements
           if (extractedData.document_type === 'bank_statement') {
              // For bank statements, check account holder name if available
              const accountHolder = extractedData.account_holder_name?.toLowerCase() || ''
              if (accountHolder && (accountHolder.includes(tenantName) || tenantName.includes(accountHolder))) {
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
                  const vendor = extractedData.vendor_name?.toLowerCase() || ''
                  const customer = extractedData.customer_name?.toLowerCase() || ''
                  if (vendor.includes(tenantName) || customer.includes(tenantName)) {
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
               const isTenantVendor = vendorName.includes(tenantName) || tenantName.includes(vendorName)
               const isTenantCustomer = customerName.includes(tenantName) || tenantName.includes(customerName)
               isTenantMatch = isTenantVendor || isTenantCustomer
           }
        }

        if (!isTenantMatch) {
            // If tenant is neither sender nor receiver, it might be a wrong document
            // UNLESS it's a receipt where customer name might be missing/generic
            if (extractedData.document_type !== 'receipt') {
              validationFlags.push('WRONG_TENANT')
              validationStatus = 'NEEDS_REVIEW'
              console.log(`Potential wrong tenant detected. Tenant: ${tenantName}`)
              
              // Update flags
              await (supabase
              .from('documents') as any)
              .update({ 
                validation_status: validationStatus,
                validation_flags: validationFlags
              })
              .eq('id', documentId)
            }
        }
      }
      // --- TENANT VALIDATION END ---

      // 5. Save extracted data
      const documentData: DocumentData = {
        document_id: documentId,
        extracted_data: extractedData as any,
        confidence_score: extractedData.confidence_score || 0.85,
        vendor_name: extractedData.vendor_name || null,
        document_date: extractedData.document_date || extractedData.statement_period_end || null,
        total_amount: extractedData.total_amount || extractedData.closing_balance || null,
        currency: extractedData.currency || tenantCurrency,
        line_items: (extractedData.line_items || []) as any,
        metadata: {
          processed_by: aiConfig?.ai_providers?.name || 'mock-ai-service',
          processing_time: Date.now(),
          transaction_type: extractedData.transaction_type
        } as any
      }

      // Save extracted data to DB
      // We use upsert to handle re-processing of the same document
      const { error: dataError } = await upsertDocumentData(documentData)
      
      if (dataError) {
          console.error('Error saving document data:', dataError)
          // We continue even if saving document data fails
      }

      // 6. Create records based on type
      if (extractedData.document_type === 'bank_statement') {
        await this.createBankStatementRecords(document, extractedData, supabase)
      } else {
        await this.createDraftTransaction(document, extractedData, supabase, existingTransactionId)
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
        validationFlags 
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

      return { success: false, error: errorMessage, statusCode }
    }
  }

  /**
   * Process document using Google Cloud Document AI
   */
  private static async processWithGoogleDocumentAI(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer
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
    tenantName?: string
  ): Promise<ExtractedData> {
    const customConfig = config.custom_config || {}
    // In a real app, you must decrypt the API key
    const apiKey = config.api_key_encrypted 
    
    // Qwen defaults (DashScope)
    const baseURL = customConfig.baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    const model = config.model_name || 'qwen-vl-max'

    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName)
  }

  /**
   * Process document using OpenAI Vision
   */
  private static async processWithOpenAIVision(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string
  ): Promise<ExtractedData> {
    const customConfig = config.custom_config || {}
    const apiKey = config.api_key_encrypted
    
    // OpenAI defaults
    // If baseUrl is not provided in customConfig, it will be undefined, 
    // which causes the OpenAI SDK to use the default (https://api.openai.com/v1)
    const baseURL = customConfig.baseUrl 
    const model = config.model_name || 'gpt-4-vision-preview'

    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName)
  }

  /**
   * Process document using OpenRouter
   */
  private static async processWithOpenRouter(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string
  ): Promise<ExtractedData> {
    const customConfig = config.custom_config || {}
    const apiKey = config.api_key_encrypted
    
    // OpenRouter defaults
    const baseURL = customConfig.baseUrl || 'https://openrouter.ai/api/v1'
    const model = config.model_name || 'google/gemini-2.0-flash-exp:free'

    // OpenRouter specific headers
    const extraHeaders = {
      "HTTP-Referer": "https://ledgerai.com", // Replace with your actual site URL
      "X-Title": "LedgerAI"
    }
    
    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName, extraHeaders)
  }

  /**
   * Process document using DeepSeek (via OpenAI Compatible API)
   */
  private static async processWithDeepSeek(
    document: Document,
    config: any,
    supabase: any,
    fileBuffer?: Buffer,
    tenantName?: string
  ): Promise<ExtractedData> {
    const customConfig = config.custom_config || {}
    const apiKey = config.api_key_encrypted
    
    // DeepSeek defaults
    const baseURL = customConfig.baseUrl || 'https://api.deepseek.com'
    const model = config.model_name || 'deepseek-chat' 

    // Warning: DeepSeek's main models (deepseek-chat) do not support Vision yet.
    // This will likely fail unless the user provides a custom model that supports it.
    
    return this.processWithOpenAICompatibleVision(document, apiKey, baseURL, model, supabase, fileBuffer, tenantName)
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

      // 4. Construct Prompt
      const systemPrompt = `You are an expert accounting AI. Extract data from this ${document.document_type || 'document'} into JSON format.
      Return ONLY valid JSON with no markdown formatting.
      
      The name of the company/tenant that owns this document is: "${tenantName || 'Unknown'}".
      
      CRITICAL - TENANT VALIDATION:
      - Check if the document belongs to "${tenantName || 'Unknown'}". Look for the company name in the "Bill To", "Ship To", or "Receiver" fields.
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
      - Compare "vendor_name" and "customer_name" with the tenant name: "${tenantName || 'Unknown'}".
      - If the "vendor_name" is similar to "${tenantName}", then this is an OUTGOING invoice (Sales), so set "transaction_type" to "income".
      - If the "customer_name" is similar to "${tenantName}", then this is an INCOMING invoice (Purchase), so set "transaction_type" to "expense".
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
    
    if (data.statement_period_start) data.statement_period_start = cleanDate(data.statement_period_start)
    if (data.statement_period_end) data.statement_period_end = cleanDate(data.statement_period_end)
    if (data.document_date) data.document_date = cleanDate(data.document_date)

    if (data.bank_transactions && Array.isArray(data.bank_transactions)) {
      data.bank_transactions = data.bank_transactions.map((tx: any) => ({
        ...tx,
        amount: cleanNumber(tx.amount) || 0,
        date: cleanDate(tx.date)
      }))
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

      if (existingStatement) {
        // Update existing statement
        const { error: updateError } = await supabase
          .from('bank_statements')
          .update({
            bank_account_id: bankAccountId || existingStatement.bank_account_id, // Update link if found
            statement_date: extractedData.statement_period_end || new Date().toISOString().split('T')[0],
            start_date: extractedData.statement_period_start,
            end_date: extractedData.statement_period_end,
            opening_balance: extractedData.opening_balance,
            closing_balance: extractedData.closing_balance,
            status: 'PROCESSED' // Update status to PROCESSED
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
            start_date: extractedData.statement_period_start,
            end_date: extractedData.statement_period_end,
            opening_balance: extractedData.opening_balance,
            closing_balance: extractedData.closing_balance,
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
          } as any)
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
    const { data: tenantConfig } = await (supabase
      .from('tenant_ai_configurations') as any)
      .select(`
        *,
        ai_providers (*)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (tenantConfig) {
      return tenantConfig
    }

    // 2. Fallback to a platform-level default provider
    // Currently we treat the first active provider as the default.
    // Later, we can add an explicit is_default flag in ai_providers.
    const { data: defaultProvider } = await (supabase
      .from('ai_providers') as any)
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!defaultProvider) {
      return null
    }

    // Shape the result similar to tenant_ai_configurations + joined ai_providers
    return {
      tenant_id: tenantId,
      ai_provider_id: defaultProvider.id,
      api_key_encrypted: null,
      model_name: null,
      custom_config: defaultProvider.config || {},
      is_active: true,
      ai_providers: defaultProvider,
    } as any
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
