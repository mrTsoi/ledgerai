import { describe, it, expect, vi } from 'vitest'

// Mock next headers
vi.mock('next/headers', () => ({ headers: () => ({ get: (_: string) => 'sig' }) }))

// Mock stripe and config
vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    invoices: {
      retrieve: vi.fn(() => ({
        id: 'inv_1',
        status: 'paid',
        amount_paid: 2000,
        currency: 'usd',
        invoice_pdf: 'url',
        created: 1700000000,
        lines: { data: [{ description: 'Subscription', period: { start: 1700000000, end: 1702592000 } }] }
      }))
    },
    webhooks: {
        constructEvent: vi.fn((_b: any, _s: any, _sec: any) => ({
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              id: 'inv_1',
              subscription: 'sub_123',
              customer: 'cus_123',
              amount_paid: 2000,
              currency: 'usd',
              invoice_pdf: 'url',
              created: 1700000000,
              lines: { data: [{ description: 'Subscription', period: { start: 1700000000, end: 1702592000 } }] }
            }
          }
        }))
    }
  })),
  getStripeConfig: vi.fn(() => ({ webhook_secret: 'whsec' }))
}))

// Mock supabase service: user_subscriptions lookup returns a user
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { user_id: 'user_123' } }),
      upsert: vi.fn().mockResolvedValue({}),
    }))
  }))
}))

describe('invoice.payment_succeeded webhook', () => {
  it('inserts billing invoice for user found by subscription', async () => {
    const { POST } = await import('../src/app/api/webhooks/stripe/route')
    const req = new Request('http://localhost', { method: 'POST', body: '' })
    const res = await POST(req)
    const r = res as Response
    expect(r.status).toBe(200)
  })
})
