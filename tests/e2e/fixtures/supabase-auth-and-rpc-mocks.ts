import { Page, Route } from '@playwright/test'

export function registerSupabaseAuthAndRPCMocks(page: Page) {
  page.addInitScript(() => {
    try {
      const session = {
        provider_token: null,
        access_token: 'e2e-access-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'user_e2e_1', email: 'e2e@example.com' }
      }
      localStorage.setItem('sb:token', JSON.stringify(session))
      localStorage.setItem('supabase.auth.token', JSON.stringify(session))
    } catch (e) {
      // ignore
    }
  })

  const rpcHandler = async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: true }) })
  }

  page.route('**/rpc/check_ai_rate_limit', rpcHandler)
  page.route('**/rest/v1/rpc/check_ai_rate_limit', rpcHandler)
}
