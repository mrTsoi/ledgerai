import { describe, it, expect, vi } from 'vitest'

// Mock Next headers used in the route
vi.mock('next/headers', () => ({
  headers: () => ({ get: (_: string) => 'sig' })
}))

// Mocks
vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn((_body: any, _sig: any, _secret: any) => ({
        type: 'checkout.session.completed',
        data: { object: { metadata: { pending_token: 'tok' }, subscription: 'subid', customer: 'cusid', invoice: 'invid' } }
      })),
    },
    subscriptions: {
      retrieve: vi.fn(() => ({ current_period_start: 1700000000, current_period_end: 1702592000 }))
    },
    invoices: {
      retrieve: vi.fn(() => ({
        id: 'invid',
        status: 'paid',
        amount_paid: 1000,
        currency: 'usd',
        invoice_pdf: 'url',
        created: 1700000000,
        lines: { data: [{ description: 'desc', period: { start: 1700000000, end: 1702592000 } }] }
      }))
    }
  })),
  getStripeConfig: vi.fn(() => ({ webhook_secret: 'whsec' })),
  retrieveSubscription: vi.fn(async (_id: string) => ({
    current_period_start: 1700000000,
    current_period_end: 1702592000,
  })),
  retrieveInvoice: vi.fn(async (_id: string) => ({
    id: 'invid',
    status: 'paid',
    amount_paid: 1000,
    currency: 'usd',
    invoice_pdf: 'url',
    created: 1700000000,
    lines: { data: [{ description: 'desc', period: { start: 1700000000, end: 1702592000 } }] },
  })),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => {
      const single = vi.fn()
        .mockResolvedValueOnce({ data: { id: 'pending1', email: 'test@example.com', plan_id: 'plan1', token: 'tok', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() } })
        .mockResolvedValueOnce({ data: { id: 'user1' } })

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single,
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({}) })),
        in: vi.fn().mockResolvedValue({}),
        order: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
      }
    })
  }))
}))

describe('Stripe Webhook', () => {
  it('handles checkout.session.completed with pending_token', async () => {
    const { POST: stripeWebhook } = await import('../src/app/api/webhooks/stripe/route')
    const req = new Request('http://localhost', { method: 'POST', body: '' })
    const res = await stripeWebhook(req)
    const r = res as Response
    expect(r.status).toBe(200)
  })
})
