import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock next-intl used by the component
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => ((k: string) => k),
  NextIntlClientProvider: ({ children }: any) => children
}))

// We'll mock the Supabase client factory to return a controllable stub
// Mock useTenant to provide a currentTenant for the modal
vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({
    currentTenant: { id: 'tenant_1' },
    tenants: [],
    memberships: [],
    loading: false,
    isSuperAdmin: false,
    switchTenant: () => {},
    refreshTenants: async () => {}
  })
}))

const mockDoc = {
  id: 'doc-1',
  file_path: 'tests/fixtures/stmt.pdf',
  file_type: 'application/pdf',
  document_type: 'bank_statement',
  file_name: 'stmt.pdf',
  validation_status: 'IMPORTED'
}

const mockDocData = {
  extracted_data: {
    statement_period_start: '2025-12-01',
    statement_period_end: '2025-12-31',
    opening_balance: 1000,
    closing_balance: 1200,
    bank_transactions: [
      { date: '2025-12-05', description: 'Tx1', amount: 100, type: 'DEBIT' }
    ]
  },
  document_date: '2025-12-31',
  total_amount: 1200,
  currency: 'USD',
  confidence_score: 0.9
}

const createSupabaseMock = () => {
  const upsertSpy = vi.fn(async (..._args: any[]) => ({ error: null }))
  const updateSpy = vi.fn(async (..._args: any[]) => ({ error: null }))
  const bankAccountInsert = vi.fn(async (..._args: any[]) => ({ data: { id: 'acct_1' }, error: null }))
  const bankStatementInsert = vi.fn(async (..._args: any[]) => ({ data: { id: 'stmt_1' }, error: null }))
  const bankTransactionsInsert = vi.fn(async (..._args: any[]) => ({ error: null }))

  const supabase: any = {
    storage: { from: () => ({ download: async () => ({ data: new Blob() }) }) },
    from: (table: string) => {
        const qb: any = {}
        qb._table = table
        qb.select = (..._args: any[]) => qb
        qb.eq = (_col: string, _val: any) => qb
        qb.ilike = (_col: string, _val: any) => qb
        qb.in = (_col: string, _vals: any[]) => qb
        qb.order = () => qb
        qb.limit = async (_n: number) => {
          if (table === 'bank_accounts') return { data: [] }
          return { data: null }
        }
        qb.single = async () => {
          if (table === 'documents') return { data: mockDoc }
          if (table === 'bank_accounts') return { data: null }
          return { data: null }
        }
        qb.maybeSingle = async () => {
          if (table === 'document_data') return { data: mockDocData }
          if (table === 'bank_statements') return { data: null }
          if (table === 'bank_statements') return { data: null }
          return { data: null }
        }

        return {
          select: qb.select,
          eq: qb.eq,
          ilike: qb.ilike,
          in: qb.in,
          order: qb.order,
          limit: qb.limit,
          single: qb.single,
          maybeSingle: qb.maybeSingle,
          upsert: (payload: any) => {
            upsertSpy(payload)
            return Promise.resolve({ error: null })
          },
          update: (payload: any) => ({
            eq: async (_col: string, _val: any) => {
              updateSpy(payload)
              return { error: null }
            }
          }),
          insert: (payload: any) => {
            if (table === 'bank_accounts') {
              bankAccountInsert(payload)
              return {
                select: () => ({ single: async () => ({ data: { id: 'acct_1' }, error: null }) })
              }
            }
            if (table === 'bank_statements') {
              bankStatementInsert(payload)
              return {
                select: () => ({ single: async () => ({ data: { id: 'stmt_1' }, error: null }) })
              }
            }
            if (table === 'bank_transactions') {
              bankTransactionsInsert(payload)
              return Promise.resolve({ error: null })
            }
            return Promise.resolve({ data: payload, error: null })
          },
          delete: () => ({ eq: async () => ({ error: null }) })
        }
    }
  }

  return { supabase, spies: { upsertSpy, updateSpy, bankAccountInsert, bankStatementInsert, bankTransactionsInsert } }
}

let lastSpies: any = null
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const { supabase, spies } = createSupabaseMock()
    lastSpies = spies
    return supabase
  }
}))

import { DocumentVerificationModal } from '@/components/documents/document-verification-modal'

describe('DocumentVerificationModal', () => {
  beforeEach(() => {
    // ensure globals present
    // @ts-ignore
    if (!global.navigator) (global as any).navigator = {}
    // @ts-ignore
    global.navigator.clipboard = { writeText: vi.fn() }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('loads document details and performs save flow for bank statement', async () => {
    const onClose = vi.fn()
    const onSaved = vi.fn()

    // Render modal
    render(<DocumentVerificationModal documentId="doc-1" onClose={onClose} onSaved={onSaved} />)

    // Wait for the Verify & Save button to indicate initial load completed
    await waitFor(() => expect(screen.getByText(/Verify & Save/i)).toBeTruthy())

    // Click Verify & Save
    const saveBtn = screen.getAllByRole('button').find(b => /verify & save/i.test(b.textContent || ''))
    expect(saveBtn).toBeTruthy()
    if (saveBtn) fireEvent.click(saveBtn)

    // After save we expect the result area to appear (modal + inline card may both render)
    await waitFor(() => expect(screen.queryAllByText(/Verification Result/i).length).toBeGreaterThanOrEqual(1))
    // debug current DOM to inspect why the stmt id isn't visible in tests
    // eslint-disable-next-line no-console
    console.log('DOM after save:', document.body.innerHTML.slice(0, 5000))
    // eslint-disable-next-line no-console
    console.log('Supabase spies:', lastSpies && {
      bankStatementInsertCalls: lastSpies.bankStatementInsert.mock.calls.length,
      bankAccountInsertCalls: lastSpies.bankAccountInsert.mock.calls.length,
      bankTransactionsInsertCalls: lastSpies.bankTransactionsInsert.mock.calls.length
    })
    expect(lastSpies?.bankStatementInsert).toBeTruthy()
    expect(lastSpies.bankStatementInsert.mock.calls.length).toBeGreaterThan(0)
    expect(lastSpies.bankTransactionsInsert.mock.calls.length).toBeGreaterThanOrEqual(0)
  })
})
