import { describe, it, expect, vi } from 'vitest'

// Mock headers() from next/headers to provide signature
vi.mock('next/headers', () => ({ headers: () => ({ get: () => 'tstest_signature' }) }))

// Mock stripe library helpers used by route
vi.mock('@/lib/stripe', () => ({
  getStripe: async () => ({
    webhooks: {
      constructEvent: () => { throw new Error('invalid signature') }
    }
  }),
  getStripeConfig: async () => ({ webhook_secret: 'whsec_test' })
}))

import { POST } from '../../src/app/api/webhooks/stripe/route'

describe('Stripe webhook route', () => {
  it('returns 400 on signature verification failure', async () => {
    const req = new Request('https://example.test/webhook', { method: 'POST', body: '' })
    const res = await POST(req)
    // NextResponse status available as .status
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(400)
    const text = await (res as any).text()
    expect(text).toContain('Webhook Error')
  })
})
