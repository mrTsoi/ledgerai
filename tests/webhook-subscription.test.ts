import { describe, it, expect, vi } from 'vitest'

vi.mock('next/headers', () => ({ headers: () => ({ get: (_: string) => 'sig' }) }))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    subscriptions: { },
    webhooks: { constructEvent: vi.fn((_b: any, _s: any, _sec: any) => ({ type: 'customer.subscription.updated', data: { object: { id: 'sub_123', status: 'active', current_period_start: 1700000000, current_period_end: 1702592000 } } })) }
  })),
  getStripeConfig: vi.fn(() => ({ webhook_secret: 'whsec' }))
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockResolvedValue({}),
    }))
  }))
}))

describe('customer.subscription.updated webhook', () => {
  it('updates user_subscriptions based on stripe subscription', async () => {
    const { POST } = await import('../src/app/api/webhooks/stripe/route')
    const req = new Request('http://localhost', { method: 'POST', body: '' })
    const res = await POST(req)
    const r = res as Response
    expect(r.status).toBe(200)
  })
})
