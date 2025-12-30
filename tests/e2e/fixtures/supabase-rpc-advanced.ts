import { Page, Route } from '@playwright/test'

export function registerSupabaseRPCAdvanced(page: Page) {
  // Mock RPC to create a user (signup flow)
  page.route('**/rpc/create_user', async (route: Route) => {
    const body = { id: 'user_new_1', email: 'newuser@example.com', created_at: new Date().toISOString() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: body }) })
  })

  // Mock RPC to create subscription in DB
  page.route('**/rpc/create_subscription', async (route: Route) => {
    const sub = {
      id: 'sub_e2e_1',
      user_id: 'user_new_1',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      price_id: 'price_test',
      created_at: new Date().toISOString()
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: sub }) })
  })

  // Mock RPC to update subscription (upgrade/downgrade)
  page.route('**/rpc/update_subscription', async (route: Route) => {
    const sub = {
      id: 'sub_e2e_1',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      price_id: 'price_updated',
      updated_at: new Date().toISOString()
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: sub }) })
  })

  // Mock RPC to fetch subscription
  page.route('**/rpc/get_subscription', async (route: Route) => {
    const sub = {
      id: 'sub_e2e_1',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      price_id: 'price_test',
      created_at: new Date().toISOString()
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: sub }) })
  })
}
