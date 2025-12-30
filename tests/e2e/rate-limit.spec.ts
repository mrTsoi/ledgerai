import { test, expect } from '@playwright/test'
import { registerSupabaseRateLimitMocks } from './fixtures/supabase-rate-limit-mocks'

test('processing is rate limited (mocked 429)', async ({ page }) => {
  registerSupabaseRateLimitMocks(page)

  // Ensure page has a base URL so relative fetch works
  await page.goto('/')

  // Create document via page context so route interception applies
  const created = await page.evaluate(async () => {
    const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: 'invoice-rl.pdf', file_type: 'application/pdf' }) })
    return res.ok ? await res.json() : { ok: false }
  })

  expect(created && created.id).toBeTruthy()

  // Attempt to trigger processing, expect 429 response
  const processRes = await page.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}/process`, { method: 'POST' })
    return { status: r.status, body: await r.json() }
  }, created.id)

  expect(processRes.status).toBe(429)
  expect(processRes.body.error).toBe('rate_limited')
})
