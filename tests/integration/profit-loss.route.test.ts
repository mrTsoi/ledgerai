import { describe, it, expect, vi, beforeEach } from 'vitest'

const createClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => await createClientMock(),
}))

import { GET } from '../../src/app/api/dashboard/profit-loss/route'

describe('GET /api/dashboard/profit-loss', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  it('returns 401 when unauthenticated', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
    })

    const req = new Request(
      'https://example.test/api/dashboard/profit-loss?p_tenant_id=t1&p_start_date=2024-01-01&p_end_date=2024-01-31',
      { method: 'GET' },
    )

    const res = await GET(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(401)
  })

  it('returns 403 when user is not a tenant member', async () => {
    const membershipsQuery = {
      select: () => membershipsQuery,
      eq: () => membershipsQuery,
      maybeSingle: async () => ({ data: null, error: null }),
    }

    const rpcSpy = vi.fn()

    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user_1' } } }),
      },
      from: () => membershipsQuery,
      rpc: rpcSpy,
    })

    const req = new Request(
      'https://example.test/api/dashboard/profit-loss?p_tenant_id=t1&p_start_date=2024-01-01&p_end_date=2024-01-31',
      { method: 'GET' },
    )

    const res = await GET(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(403)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it('returns 200 and data for a tenant member', async () => {
    const membershipsQuery = {
      select: () => membershipsQuery,
      eq: () => membershipsQuery,
      maybeSingle: async () => ({ data: { id: 'm1', role: 'MEMBER' }, error: null }),
    }

    const rpcSpy = vi.fn(async () => ({ data: [{ category: 'Revenue', amount: 123 }], error: null }))

    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user_1' } } }),
      },
      from: () => membershipsQuery,
      rpc: rpcSpy,
    })

    const req = new Request(
      'https://example.test/api/dashboard/profit-loss?p_tenant_id=t1&p_start_date=2024-01-01&p_end_date=2024-01-31',
      { method: 'GET' },
    )

    const res = await GET(req)
    // @ts-ignore - NextResponse typings in test environment
    expect((res as any).status).toBe(200)
    const body = await (res as any).json()
    expect(body).toEqual({ data: [{ category: 'Revenue', amount: 123 }] })
    expect(rpcSpy).toHaveBeenCalledTimes(1)
  })
})
