import { Page } from '@playwright/test'

export function registerStripeMocks(page: Page) {
  page.route('**/api/stripe/**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST' && req.url().includes('/api/stripe/checkout')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'cs_test_123' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  page.route('https://api.stripe.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}
