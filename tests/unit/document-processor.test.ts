import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import the class under test
import { AIProcessingService } from '@/lib/ai/document-processor'

// Mock external helpers that the processor imports
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => {
    // Generic chain object to simulate Supabase query builder with common methods
    const chain: any = {}
    chain.single = vi.fn(async () => ({ data: null }))
    chain.maybeSingle = vi.fn(async () => ({ data: { setting_value: { allow_auto_reassignment: true, allow_auto_tenant_creation: true, min_confidence: 0.5 } } }))
    chain.eq = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)

    // Specific chain for the initial documents lookup to return a mock document
    const docChain: any = {}
    docChain.single = vi.fn(async () => ({ data: {
      id: 'doc-1',
      file_path: 'documents/doc-1.pdf',
      file_type: 'application/pdf',
      file_name: 'doc-1.pdf',
      tenant_id: 'tenant-1',
      tenants: { name: 'Tenant A', currency: 'USD', owner_id: 'owner-1', locale: 'en' }
    } }))
    docChain.maybeSingle = vi.fn(async () => ({ data: null }))
    docChain.eq = vi.fn(() => docChain)
    docChain.select = vi.fn(() => docChain)
    docChain.order = vi.fn(() => docChain)
    docChain.limit = vi.fn(() => docChain)

    return {
      storage: { from: () => ({ download: vi.fn(async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null })) }) },
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      from: vi.fn((table: string) => (table === 'documents' ? docChain : chain)),
      rpc: vi.fn()
    }
  })
}))

vi.mock('@/lib/ai/tenant-matcher', () => ({ findTenantCandidates: vi.fn(async () => ({ candidates: [], isMultiTenant: false, suggestedTenantName: null })) }))

vi.mock('@/lib/supabase/typed', () => ({
  findDocumentsByTenantAndHash: vi.fn(),
  findTransactionByDocumentId: vi.fn(),
  updateDocumentById: vi.fn(async () => ({})),
  insertAIUsageLog: vi.fn(async () => ({})),
  getTenantById: vi.fn(async () => ({ data: { id: 'tenant-1', name: 'Tenant A', currency: 'USD' } })),
  findBankAccountByTenantAndAccountNumber: vi.fn(async () => ({ data: null })),
  upsertDocumentData: vi.fn(async () => ({})),
  createService: vi.fn(() => ({
    from: (table: string) => ({
      select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })),
      insert: vi.fn(async () => ({ data: null })),
      upsert: vi.fn(async () => ({ data: null })),
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) }))
    })
  })),
  rpc: vi.fn()
}))

// We'll dynamically import the mocked modules inside each test to ensure Vitest's
// module mocking/resolution has been applied.

// Spy on internal creation methods

describe('AIProcessingService.processDocument', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('skips creating a new transaction for duplicate without existing transaction', async () => {
    // Arrange
    const typed = await import('@/lib/supabase/typed')
    ;(typed.findDocumentsByTenantAndHash as any).mockResolvedValue({ data: [{ id: 'orig-doc' }] })
    ;(typed.findTransactionByDocumentId as any).mockResolvedValue({ data: null })

    // Stub provider processing to return minimal extracted data
    vi.spyOn(AIProcessingService as any, 'processWithOpenAIVision').mockResolvedValue({
      document_type: 'invoice',
      transaction_type: 'expense',
      vendor_name: 'Vendor X',
      total_amount: 100
    })

    // Mock tenant AI config so processor picks our mocked provider branch
    vi.spyOn(AIProcessingService as any, 'getTenantAIConfig').mockResolvedValue({ ai_providers: { name: 'openai-vision', id: 'provider-1', config: {}, is_active: true }, model_name: 'gpt' })

    // Spy on draft creation
    const draftSpy = vi.spyOn(AIProcessingService as any, 'createDraftTransaction').mockResolvedValue(undefined)

    // Act
    const res = await AIProcessingService.processDocument('doc-dup-no-tx')

    // Debug: inspect result
    console.log('process result:', JSON.stringify(res))

    // Assert
    expect(res.recordsCreated).toBe(false)
    expect(draftSpy).not.toHaveBeenCalled()
  })

  it('updates existing transaction when duplicate has existing transaction', async () => {
    const typed = await import('@/lib/supabase/typed')
    ;(typed.findDocumentsByTenantAndHash as any).mockResolvedValue({ data: [{ id: 'orig-doc' }] })
    ;(typed.findTransactionByDocumentId as any).mockResolvedValue({ data: { id: 'tx-123' } })

    vi.spyOn(AIProcessingService as any, 'processWithOpenAIVision').mockResolvedValue({
      document_type: 'invoice',
      transaction_type: 'expense',
      vendor_name: 'Vendor X',
      is_belongs_to_tenant: true,
      total_amount: 200
    })

    vi.spyOn(AIProcessingService as any, 'getTenantAIConfig').mockResolvedValue({ ai_providers: { name: 'openai-vision', id: 'provider-1', config: {}, is_active: true }, model_name: 'gpt' })

    const draftSpy = vi.spyOn(AIProcessingService as any, 'createDraftTransaction').mockResolvedValue(undefined)

    const res = await AIProcessingService.processDocument('doc-dup-with-tx')

    expect(res.recordsCreated).toBe(true)
    expect(draftSpy).toHaveBeenCalled()
  })

  it('skips creating records when wrong tenant not auto-corrected', async () => {
    // Make no duplicates
    const typed = await import('@/lib/supabase/typed')
    ;(typed.findDocumentsByTenantAndHash as any).mockResolvedValue({ data: [] })
    ;(typed.findTransactionByDocumentId as any).mockResolvedValue({ data: null })

    // Return extracted data that indicates mismatch
    vi.spyOn(AIProcessingService as any, 'processWithOpenAIVision').mockResolvedValue({
      document_type: 'invoice',
      transaction_type: 'expense',
      vendor_name: 'Different Company',
      customer_name: null,
      is_belongs_to_tenant: false
    })

    vi.spyOn(AIProcessingService as any, 'getTenantAIConfig').mockResolvedValue({ ai_providers: { name: 'openai-vision', id: 'provider-1', config: {}, is_active: true }, model_name: 'gpt' })

    // Ensure tenant matcher returns no candidates
    const tenantMatcher = await import('@/lib/ai/tenant-matcher')
    ;(tenantMatcher.findTenantCandidates as any).mockResolvedValue({ candidates: [], isMultiTenant: false, suggestedTenantName: null })

    const draftSpy = vi.spyOn(AIProcessingService as any, 'createDraftTransaction').mockResolvedValue(undefined)

    const res = await AIProcessingService.processDocument('doc-wrong-tenant')

    expect(res.recordsCreated).toBe(false)
    expect(draftSpy).not.toHaveBeenCalled()
  })

  it('auto-reassigns and creates records when wrong tenant auto-corrects', async () => {
    const typed = await import('@/lib/supabase/typed')
    ;(typed.findDocumentsByTenantAndHash as any).mockResolvedValue({ data: [] })
    ;(typed.findTransactionByDocumentId as any).mockResolvedValue({ data: null })

    vi.spyOn(AIProcessingService as any, 'processWithOpenAIVision').mockResolvedValue({
      document_type: 'invoice',
      transaction_type: 'expense',
      vendor_name: 'Different Company',
      customer_name: null,
      is_belongs_to_tenant: false
    })

    vi.spyOn(AIProcessingService as any, 'getTenantAIConfig').mockResolvedValue({ ai_providers: { name: 'openai-vision', id: 'provider-1', config: {}, is_active: true }, model_name: 'gpt' })

    // Provide a candidate with high confidence
    const tenantMatcher = await import('@/lib/ai/tenant-matcher')
    ;(tenantMatcher.findTenantCandidates as any).mockResolvedValue({
      candidates: [{ tenantId: 'tenant-2', confidence: 0.95 }],
      isMultiTenant: false,
      suggestedTenantName: 'Tenant B'
    })

    // make rpc transfer succeed
    ;(typed.rpc as any).mockResolvedValue({})

    // Ensure createService returns a client that can select tenant name and insert candidates
    ;(typed.createService as any).mockImplementation(() => ({
      from: (table: string) => {
        const t: any = {}
        t.select = () => t
        t.eq = () => t
        t.maybeSingle = async () => ({ data: { name: 'Tenant B' } })
        t.insert = async () => ({})
        return t
      }
    }))

    const draftSpy = vi.spyOn(AIProcessingService as any, 'createDraftTransaction').mockResolvedValue(undefined)

    const res = await AIProcessingService.processDocument('doc-auto-correct')

    expect(res.recordsCreated).toBe(true)
    expect(draftSpy).toHaveBeenCalled()
    expect(res.tenantCorrection?.actionTaken === 'REASSIGNED' || res.tenantCorrection?.actionTaken === 'CREATED').toBe(true)
  })
})
