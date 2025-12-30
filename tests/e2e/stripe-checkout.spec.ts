import { test, expect } from '@playwright/test'
import { registerStripeMocks } from './fixtures/stripe-mocks'
import { registerStripeAdvancedMocks } from './fixtures/stripe-advanced-mocks'
import { registerSupabaseAuthAndRPCMocks } from './fixtures/supabase-auth-and-rpc-mocks'

test('stripe checkout creation (mocked)', async ({ page }) => {
  registerSupabaseAuthAndRPCMocks(page)
  registerStripeMocks(page)
  registerStripeAdvancedMocks(page)

  // Ensure page has a base URL so relative fetch works
  await page.goto('/')

  // Simulate client creating a checkout session via API
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price: 'price_test' }) })
    return { ok: r.ok, body: await r.json() }
  })

  expect(res.ok).toBeTruthy()
  expect(res.body.sessionId).toBeDefined()
})