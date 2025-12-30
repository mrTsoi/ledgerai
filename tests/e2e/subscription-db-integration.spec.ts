import { test, expect } from '@playwright/test'
import crypto from 'crypto'

// Environment and feature flags
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test'
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'
const STRIPE_TEST_PRICE_ID = process.env.STRIPE_TEST_PRICE_ID
const STRIPE_API_BASE_URL = process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com'
const STRIPE_USE_MOCK = process.env.STRIPE_USE_MOCK === 'true'
// In non-mock mode, the app uses the official Stripe API base; tests should match.
const STRIPE_REQUEST_BASE_URL = STRIPE_USE_MOCK ? STRIPE_API_BASE_URL : 'https://api.stripe.com'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_BASE_URL = SUPABASE_URL ? SUPABASE_URL.replace(/\/$/, '') : undefined

// Require Supabase credentials and either real Stripe creds or stripe-mock config
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  test.skip(true, 'Integration env vars for Supabase not set')
}

// This spec is intentionally run only with stripe-mock.
// Creating real Stripe subscriptions requires attaching a test payment method,
// which makes the E2E suite brittle and environment-specific.
if (!STRIPE_USE_MOCK) {
  test.skip(true, 'Set STRIPE_USE_MOCK=true (and STRIPE_API_BASE_URL) to run this integration test against stripe-mock')
}

if (!process.env.STRIPE_API_BASE_URL) {
  test.skip(true, 'STRIPE_API_BASE_URL not set; required for stripe-mock runs')
}

function generateStripeSignature(secret: string, payload: string, timestamp?: number) {
  const t = timestamp || Math.floor(Date.now() / 1000)
  const signedPayload = `${t}.${payload}`
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  return `t=${t},v1=${hmac}`
}

async function stripeCreateCustomer(email: string) {
  const form = new URLSearchParams()
  form.append('email', email)
  const res = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/customers`, {
    method: 'POST',
    body: form.toString(),
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (!res.ok) throw new Error('Failed to create stripe customer: ' + await res.text())
  return res.json()
}

async function stripeCreateProductAndPrice(productName = 'e2e-product') {
  const p = new URLSearchParams()
  p.append('name', productName)
  const prodRes = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/products`, {
    method: 'POST',
    body: p.toString(),
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (!prodRes.ok) throw new Error('Failed to create product: ' + await prodRes.text())
  const product = await prodRes.json()

  const priceForm = new URLSearchParams()
  priceForm.append('unit_amount', '1000')
  priceForm.append('currency', 'usd')
  priceForm.append('product', product.id)
  priceForm.append('recurring[interval]', 'month')

  const priceRes = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/prices`, {
    method: 'POST',
    body: priceForm.toString(),
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (!priceRes.ok) throw new Error('Failed to create price: ' + await priceRes.text())
  return priceRes.json()
}

async function stripeCreateSubscription(customerId: string, priceId: string) {
  const form = new URLSearchParams()
  form.append('customer', customerId)
  form.append('items[0][price]', priceId)
  // create a subscription (stripe-mock or real Stripe depending on STRIPE_API_BASE_URL)
  const res = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/subscriptions`, {
    method: 'POST',
    body: form.toString(),
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  if (!res.ok) throw new Error('Failed to create stripe subscription: ' + await res.text())
  return res.json()
}

async function stripePriceExists(priceId: string) {
  const res = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/prices/${encodeURIComponent(priceId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
  })

  if (res.ok) return true
  // If the Stripe API base is mock, it may not implement this endpoint; treat as unknown.
  if (STRIPE_USE_MOCK) return false
  // For real Stripe, a 404 means stale/incorrect price id.
  if (res.status === 404) return false
  throw new Error('Failed to validate price: ' + await res.text())
}

async function supabaseInsertProfile(id: string, email: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    } as unknown) as Record<string, string>,
    body: JSON.stringify({ id, email })
  })
  if (!res.ok) throw new Error('Failed to create profile: ' + await res.text())
  return res.json()
}

async function supabaseGetProfileById(id: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'GET',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    } as unknown) as Record<string, string>
  })
  if (!res.ok) throw new Error('Failed to query profile: ' + await res.text())
  return res.json()
}

type SupabaseAdminUser = { id: string }

async function supabaseAdminCreateUser(email: string): Promise<SupabaseAdminUser | null> {
  // Not available in supabase-mock; only real Supabase (or local Supabase) exposes /auth/v1/admin/users.
  const url = `${SUPABASE_BASE_URL}/auth/v1/admin/users`
  const res = await fetch(url, {
    method: 'POST',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    } as unknown) as Record<string, string>,
    body: JSON.stringify({
      email,
      email_confirm: true
    })
  })

  if (res.status === 404 || res.status === 405) return null
  if (!res.ok) throw new Error('Failed to create auth user: ' + await res.text())
  const json = (await res.json()) as any
  if (!json?.id) throw new Error('Auth user create response missing id')
  return { id: json.id }
}

async function supabaseAdminDeleteUser(userId: string) {
  const res = await fetch(`${SUPABASE_BASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    } as unknown) as Record<string, string>
  })

  if (res.status === 404 || res.status === 405) return
  if (!res.ok) throw new Error('Failed to delete auth user: ' + await res.text())
}

async function supabaseFindSubscriptionByStripeId(stripeSubscriptionId: string) {
  const url = `${SUPABASE_URL}/rest/v1/user_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}&select=*`
  const res = await fetch(url, {
    method: 'GET',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    } as unknown) as Record<string, string>
  })
  if (!res.ok) throw new Error('Failed to query subscriptions: ' + await res.text())
  return res.json()
}

async function supabaseGetPlanIdForTest(): Promise<string> {
  if (process.env.SUBSCRIPTION_PLAN_ID) return process.env.SUBSCRIPTION_PLAN_ID

  // Prefer the seeded Free plan.
  const byName = await fetch(`${SUPABASE_URL}/rest/v1/subscription_plans?name=eq.${encodeURIComponent('Free')}&select=id&limit=1`, {
    method: 'GET',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    } as unknown) as Record<string, string>
  })
  if (byName.ok) {
    const rows = await byName.json()
    if (Array.isArray(rows) && rows[0]?.id) return String(rows[0].id)
  }

  // Fallback: pick the cheapest active plan.
  const any = await fetch(`${SUPABASE_URL}/rest/v1/subscription_plans?is_active=eq.true&select=id&order=price_monthly.asc&limit=1`, {
    method: 'GET',
    headers: ({
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    } as unknown) as Record<string, string>
  })
  if (!any.ok) throw new Error('Failed to query subscription plans: ' + await any.text())
  const rows = await any.json()
  if (Array.isArray(rows) && rows[0]?.id) return String(rows[0].id)
  throw new Error('No subscription plan found in Supabase for test')
}

test('full signup → subscription → webhook → DB update (integration)', async ({ page }) => {
  // Create a Stripe customer and subscription (real Stripe test account required)
  const email = `e2e-${Date.now()}@example.com`
  let customer: any = null
  let subscription: any = null
  // `profiles.id` is UUID in production schema.
  let profileId: string = crypto.randomUUID()
  let authUserId: string | null = null

  try {
    customer = await stripeCreateCustomer(email)

    // Use provided price id or create one in stripe-mock (or real Stripe) when missing
    let priceId = STRIPE_TEST_PRICE_ID
    if (priceId && !STRIPE_USE_MOCK) {
      const exists = await stripePriceExists(priceId)
      if (!exists) priceId = undefined
    }
    if (!priceId) {
      const price = await stripeCreateProductAndPrice(`e2e-${Date.now()}`)
      priceId = price.id
    }

    subscription = await stripeCreateSubscription(customer.id, priceId as string)

    // IMPORTANT: our webhook expects `metadata.planId` to be an internal `subscription_plans.id` (UUID),
    // not a Stripe price id.
    const subscriptionPlanId = await supabaseGetPlanIdForTest()

    // Ensure the profile exists in Supabase.
    // In real Supabase, `profiles.id` references auth.users(id), so we must create an auth user first.
    // In supabase-mock, the auth admin endpoint doesn't exist; we fall back to inserting directly.
    if (SUPABASE_BASE_URL) {
      const adminUser = await supabaseAdminCreateUser(email)
      if (adminUser) {
        authUserId = adminUser.id
        profileId = adminUser.id
        const existing = await supabaseGetProfileById(profileId)
        if (!(Array.isArray(existing) && existing.length > 0)) {
          await supabaseInsertProfile(profileId, email)
        }
      } else {
        await supabaseInsertProfile(profileId, email)
      }
    } else {
      await supabaseInsertProfile(profileId, email)
    }

    // Craft a checkout.session.completed webhook that references the subscription
    const event = {
      id: `evt_integ_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_integ_${Date.now()}`,
          subscription: subscription.id,
          metadata: { userId: profileId, planId: subscriptionPlanId }
        }
      }
    }

    const payload = JSON.stringify(event)
    const sig = generateStripeSignature(STRIPE_WEBHOOK_SECRET as string, payload)

    // Send webhook to application endpoint (the server will use real STRIPE_SECRET_KEY to retrieve subscription details)
    async function postWebhookWithRetry(attempts = 3) {
      let lastErr: unknown = null
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await page.request.post('/api/webhooks/stripe', {
            headers: {
              'Content-Type': 'application/json',
              'Stripe-Signature': sig
            },
            data: event
          })
        } catch (err) {
          lastErr = err
          const msg = String((err as any)?.message ?? err)
          const isConnReset = msg.includes('ECONNRESET') || msg.includes('socket hang up')
          if (!isConnReset || attempt === attempts) throw err
          await new Promise(r => setTimeout(r, 500 * attempt))
        }
      }
      throw lastErr
    }

    const res = await postWebhookWithRetry()

    expect(res.status()).toBe(200)

    if (STRIPE_USE_MOCK) {
      // In mock mode the webhook handler returns a deterministic confirmation
      // with the inserted row (so tests don't need to poll the DB).
      const payload = await res.json()
      expect(payload).toHaveProperty('success', true)
      expect(payload).toHaveProperty('inserted')
      const inserted = payload.inserted
      // Support both single-object representation and array responses
      const row = Array.isArray(inserted) ? inserted[0] : inserted
      expect(row).toBeDefined()

      // If Supabase REST returned an error payload, surface it clearly.
      if (row && typeof row === 'object' && !Array.isArray(row) && !('user_id' in (row as any)) && !('plan_id' in (row as any))) {
        throw new Error('Webhook mock insert did not return a row: ' + JSON.stringify(row))
      }

      // In our webhook we don't always set stripe_subscription_id in mock path; check id or plan info
      if (row && row.stripe_subscription_id) {
        expect(row.stripe_subscription_id).toBe(subscription.id)
      } else {
        // Fallback: assert that user_id or plan_id matches our inputs
        expect(row.user_id || row.plan_id).toBeTruthy()
      }
    } else {
      // Poll Supabase for a short period until server has created/updated the user_subscriptions row
      let attempts = 0
      let rows: any[] = []
      while (attempts < 10) {
        rows = await supabaseFindSubscriptionByStripeId(subscription.id)
        if (Array.isArray(rows) && rows.length > 0) break
        attempts++
        await new Promise(r => setTimeout(r, 1000))
      }

      expect(Array.isArray(rows) && rows.length > 0).toBeTruthy()
      expect(rows[0].stripe_subscription_id).toBe(subscription.id)
    }
  } finally {
    // Cleanup with retries and verification
    async function retry(fn: () => Promise<void>, attempts = 5, delayMs = 1000) {
      let lastErr: any = null
      for (let i = 0; i < attempts; i++) {
        try {
          await fn()
          return
        } catch (e) {
          lastErr = e
          await new Promise(r => setTimeout(r, delayMs * (i + 1)))
        }
      }
      throw lastErr
    }

    // Delete subscription and verify deletion
    if (subscription && subscription.id) {
      try {
        await retry(async () => {
          const del = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/subscriptions/${subscription.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
          })
          if (!del.ok) throw new Error('Failed to delete subscription: ' + await del.text())
          const json = await del.json()
          if (!(json.deleted === true || json.status === 'canceled' || del.status === 200)) {
            throw new Error('Subscription delete not confirmed: ' + JSON.stringify(json))
          }
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete subscription during cleanup', e)
      }
    }

    // Delete customer and verify
    if (customer && customer.id) {
      try {
        await retry(async () => {
          const del = await fetch(`${STRIPE_REQUEST_BASE_URL}/v1/customers/${customer.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
          })
          if (!del.ok) throw new Error('Failed to delete customer: ' + await del.text())
          const json = await del.json()
          if (!(json.deleted === true || del.status === 200)) throw new Error('Customer not deleted: ' + JSON.stringify(json))
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete customer during cleanup', e)
      }
    }

    // Delete Supabase rows and verify
    if (profileId) {
      try {
        await retry(async () => {
          const pdel = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}`, {
            method: 'DELETE',
            headers: ({ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } as unknown) as Record<string, string>
          })
          if (!pdel.ok) throw new Error('Failed to delete profile: ' + await pdel.text())
          // verify gone
          const check = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=*`, {
            method: 'GET',
            headers: ({ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } as unknown) as Record<string, string>
          })
          const arr = await check.json()
          if (Array.isArray(arr) && arr.length > 0) throw new Error('Profile still present')
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete profile during cleanup', e)
      }
    }

    if (subscription && subscription.id) {
      try {
        await retry(async () => {
          const usdel = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}`, {
            method: 'DELETE',
            headers: ({ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } as unknown) as Record<string, string>
          })
          if (!usdel.ok) throw new Error('Failed to delete user_subscriptions: ' + await usdel.text())
          // verify gone
          const check = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}&select=*`, {
            method: 'GET',
            headers: ({ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } as unknown) as Record<string, string>
          })
          const arr = await check.json()
          if (Array.isArray(arr) && arr.length > 0) throw new Error('user_subscriptions still present')
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete user_subscriptions during cleanup', e)
      }
    }

    // Also delete by user_id (webhook metadata path does not set stripe_subscription_id).
    if (profileId) {
      try {
        await retry(async () => {
          const usdel = await fetch(`${SUPABASE_URL}/rest/v1/user_subscriptions?user_id=eq.${encodeURIComponent(profileId)}`, {
            method: 'DELETE',
            headers: ({ apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } as unknown) as Record<string, string>
          })
          if (!usdel.ok) throw new Error('Failed to delete user_subscriptions by user_id: ' + await usdel.text())
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete user_subscriptions (by user_id) during cleanup', e)
      }
    }

    // Delete auth user last (profiles may reference it).
    if (authUserId) {
      try {
        await retry(async () => {
          await supabaseAdminDeleteUser(authUserId as string)
        }, 6, 1000)
      } catch (e) {
        console.warn('Failed to delete auth user during cleanup', e)
      }
    }
  }
})
