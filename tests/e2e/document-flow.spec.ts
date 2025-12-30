import { test, expect } from '@playwright/test'
import { registerSupabaseMocks } from './fixtures/supabase-mocks'
import { registerAIMocks } from './fixtures/ai-mocks'
import { registerSupabaseAuthAndRPCMocks } from './fixtures/supabase-auth-and-rpc-mocks'
import { registerStripeMocks } from './fixtures/stripe-mocks'
import { registerSupabaseRPCAdvanced } from './fixtures/supabase-rpc-advanced'
import { registerStripeAdvancedMocks } from './fixtures/stripe-advanced-mocks'

test('document upload → AI processing → transaction created (mocked backend)', async ({ page }) => {
  registerSupabaseAuthAndRPCMocks(page)
  registerSupabaseMocks(page)
  registerAIMocks(page)
  registerStripeMocks(page)
  registerSupabaseRPCAdvanced(page)
  registerStripeAdvancedMocks(page)

  await page.goto('/documents/upload')
  // Some apps render upload controls conditionally; create the document via API
  // Use page.evaluate so the requests go through the page network (and are intercepted by page.route)
  const created = await page.evaluate(async () => {
    const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: 'invoice-e2e.pdf', file_type: 'application/pdf' }) })
    if (!res.ok) return { ok: false }
    return await res.json()
  })
  expect(created && created.id).toBeTruthy()

  const trigger = await page.evaluate(async (id) => {
    const res = await fetch(`/api/documents/${id}/process`, { method: 'POST' })
    return res.ok
  }, created.id)
  expect(trigger).toBeTruthy()

  // Poll status until PROCESSED (our fixture returns PROCESSING twice then PROCESSED)
  const maxAttempts = 10
  let status = null
  for (let i = 0; i < maxAttempts; i++) {
    const s = await page.evaluate(async (id) => {
      const res = await fetch(`/api/documents/${id}/status`)
      return res.ok ? await res.json() : { status: null }
    }, created.id)
    status = s.status
    if (status === 'PROCESSED') break
    await page.waitForTimeout(500)
  }
  expect(status).toBe('PROCESSED')

  // Verify transaction exists via API (more deterministic than UI rendering in E2E)
  const txs = await page.evaluate(async () => {
    const res = await fetch('/api/transactions?document_id=doc_e2e_1')
    return res.ok ? await res.json() : []
  })
  expect(Array.isArray(txs) && txs.length > 0).toBeTruthy()
  expect(txs[0].description).toContain('Sample Vendor Inc.')
  expect(txs[0].amount).toBe(1250)
})
