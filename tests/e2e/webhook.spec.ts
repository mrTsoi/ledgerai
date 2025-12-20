import { test, expect } from '@playwright/test'

test('stripe webhook returns 400 on invalid signature', async ({ page }) => {
  // Send a webhook POST with an invalid signature header and expect 400
  const payload = { id: 'evt_test', type: 'payment_intent.succeeded' }
  const res = await page.request.post('/api/webhooks/stripe', {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 'invalid-signature'
    },
    data: payload
  })

  expect(res.status()).toBe(400)
})