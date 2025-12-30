import { test, expect } from '@playwright/test'
import crypto from 'crypto'
import { registerSupabaseAuthAndRPCMocks } from './fixtures/supabase-auth-and-rpc-mocks'
import { registerSupabaseRPCAdvanced } from './fixtures/supabase-rpc-advanced'
import { registerStripeAdvancedMocks } from './fixtures/stripe-advanced-mocks'

function generateStripeSignature(secret: string, payload: string, timestamp?: number) {
  const t = timestamp || Math.floor(Date.now() / 1000)
  const signedPayload = `${t}.${payload}`
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${t},v1=${hmac}`
}

test('signup -> subscription -> checkout.session.completed webhook (signed)', async ({ page }) => {
  registerSupabaseAuthAndRPCMocks(page)
  registerSupabaseRPCAdvanced(page)
  registerStripeAdvancedMocks(page)

  // Ensure app base loaded so relative fetch works
  await page.goto('/')

  // Simulate signup via RPC (browser-side RPC mock will return created user)
  const createdUser = await page.evaluate(async () => {
    const res = await fetch('/rpc/create_user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'newuser@example.com' }) })
    return res.ok ? await res.json() : null
  })

  expect(createdUser && createdUser.data && createdUser.data.email).toBe('newuser@example.com')

  // Simulate client creating subscription
  const sub = await page.evaluate(async () => {
    const r = await fetch('/api/stripe/create-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'user_new_1', price: 'price_test' }) })
    return r.ok ? await r.json() : null
  })

  expect(sub && sub.id).toBeTruthy()

  // Create a checkout.session.completed event body that webhook handler understands
  const event = {
    id: 'evt_test_checkout_completed',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_456',
        subscription: sub.id,
        metadata: { userId: 'user_new_1', planId: 'price_test' },
        invoice: 'in_123'
      }
    }
  }

  const payload = JSON.stringify(event)
  // Prefer explicit env var (loaded from .env.local by playwright.config.ts),
  // then STRIPE_CONFIG_JSON for backward compatibility.
  const secret =
    process.env.STRIPE_WEBHOOK_SECRET ||
    (process.env.STRIPE_CONFIG_JSON ? JSON.parse(process.env.STRIPE_CONFIG_JSON).webhook_secret : 'whsec_test')
  const sig = generateStripeSignature(secret, payload)

  // Post webhook to server endpoint with proper Stripe-Signature header
  const res = await page.request.post('/api/webhooks/stripe', {
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
    data: event
  })

  expect(res.status()).toBe(200)

  // After webhook, client would read subscription state via RPC — simulate that the RPC returns active
  const subResp = await page.evaluate(async () => {
    const r = await fetch('/rpc/get_subscription')
    return r.ok ? await r.json() : null
  })

  expect(subResp && subResp.data && subResp.data.status).toBe('active')
})
