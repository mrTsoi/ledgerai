import { Page, Route } from '@playwright/test'

export function registerStripeAdvancedMocks(page: Page) {
  // Checkout session creation
  page.route('**/api/stripe/checkout', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'cs_test_456' }) })
  })

  // Create subscription endpoint (client initiating subscription creation)
  page.route('**/api/stripe/create-subscription', async (route: Route) => {
    const subscription = {
      id: 'sub_123',
      status: 'active',
      price: 'price_test',
      created: Math.floor(Date.now() / 1000)
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(subscription) })
  })

  // Update subscription (upgrade/downgrade)
  page.route('**/api/stripe/update-subscription', async (route: Route) => {
    const subscription = { id: 'sub_123', status: 'active', price: 'price_updated', updated: Math.floor(Date.now() / 1000) }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(subscription) })
  })

  // Simulate external Stripe API (if called by app)
  page.route('https://api.stripe.com/**', async (route: Route) => {
    // Provide minimal responses for session/subscription retrieval
    const url = route.request().url()
    if (url.includes('/v1/checkout/sessions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cs_test_456', payment_status: 'unpaid' }) })
      return
    }
    // Default stub
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  // NOTE: Do not short-circuit /api/webhooks/stripe here — tests will generate real signatures
}
