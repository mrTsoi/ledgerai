import { describe, it, expect, vi, beforeEach } from 'vitest'

const createClientMock = vi.fn()
const insertPendingSubscriptionMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => await createClientMock(),
}))

vi.mock('@/lib/supabase/typed', () => ({
  insertPendingSubscription: (...args: any[]) => insertPendingSubscriptionMock(...args),
}))

import { POST } from '../../src/app/api/subscriptions/pending/create/route'

describe('POST /api/subscriptions/pending/create', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    insertPendingSubscriptionMock.mockReset()
  })

  it('allows unauthenticated creation when tenant_id is null', async () => {
    insertPendingSubscriptionMock.mockResolvedValue({ error: null })

    const req = new Request('https://example.test/api/subscriptions/pending/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', tenant_id: null, interval: 'month' }),
    })

    const res = await POST(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(200)
    const body = await (res as any).json()

    expect(body.token).toMatch(/^[0-9a-f]{48}$/)
    expect(typeof body.expires_at).toBe('string')
    expect(createClientMock).not.toHaveBeenCalled()
    expect(insertPendingSubscriptionMock).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when tenant_id is present but unauthenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })

    const req = new Request('https://example.test/api/subscriptions/pending/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', tenant_id: 't1', interval: 'month' }),
    })

    const res = await POST(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(401)
    expect(insertPendingSubscriptionMock).not.toHaveBeenCalled()
  })

  it('returns 403 when tenant_id is present but user is not an admin member', async () => {
    const membershipsQuery = {
      select: () => membershipsQuery,
      eq: () => membershipsQuery,
      in: () => membershipsQuery,
      maybeSingle: async () => ({ data: null, error: null }),
    }

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user_1' } } }) },
      from: () => membershipsQuery,
    })

    const req = new Request('https://example.test/api/subscriptions/pending/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', tenant_id: 't1', interval: 'month' }),
    })

    const res = await POST(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(403)
    expect(insertPendingSubscriptionMock).not.toHaveBeenCalled()
  })

  it('allows tenant-scoped creation for admin members', async () => {
    const membershipsQuery = {
      select: () => membershipsQuery,
      eq: () => membershipsQuery,
      in: () => membershipsQuery,
      maybeSingle: async () => ({ data: { role: 'COMPANY_ADMIN' }, error: null }),
    }

    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'user_1' } } }) },
      from: () => membershipsQuery,
    })

    insertPendingSubscriptionMock.mockResolvedValue({ error: null })

    const req = new Request('https://example.test/api/subscriptions/pending/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', tenant_id: 't1', interval: 'year' }),
    })

    const res = await POST(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(200)
    const body = await (res as any).json()
    expect(body.token).toMatch(/^[0-9a-f]{48}$/)
    expect(insertPendingSubscriptionMock).toHaveBeenCalledTimes(1)
  })
})
