import { Page, Route } from '@playwright/test'

export function registerSupabaseRateLimitMocks(page: Page) {
  page.addInitScript(() => {
    try {
      const session = { access_token: 'e2e-access-token', user: { id: 'user_e2e_1', email: 'e2e@example.com' } }
      localStorage.setItem('sb:token', JSON.stringify(session))
      localStorage.setItem('supabase.auth.token', JSON.stringify(session))
    } catch (e) {}
  })

  page.route('**/api/documents', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const id = 'doc_rl_1'
      const body = { id, tenant_id: 'tenant_e2e_1', file_name: 'invoice-rl.pdf', status: 'UPLOADED', created_at: new Date().toISOString() }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // Simulate rate limit when attempting to process
  page.route('**/api/documents/*/process', async (route: Route) => {
    await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited', retry_after: 30 }) })
  })
}
