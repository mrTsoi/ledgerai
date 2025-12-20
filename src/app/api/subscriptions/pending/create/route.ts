import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { insertPendingSubscription } from '@/lib/supabase/typed'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const tenant_id = body?.tenant_id ?? null
    const plan_id = body?.plan_id ?? null
    const interval = body?.interval ?? 'month'
    const stripe_price_id = body?.stripe_price_id ?? null

    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
    if (interval !== 'month' && interval !== 'year') return NextResponse.json({ error: 'interval must be month or year' }, { status: 400 })

    // Mixed access:
    // - Pre-auth signup flow uses tenant_id=null (allowed without a user session)
    // - Tenant-scoped pending subscription creation requires auth + membership
    if (tenant_id) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { data: membership } = await (supabase.from('memberships') as any)
        .select('role')
        .eq('tenant_id', tenant_id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
        .maybeSingle()

      if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error } = await insertPendingSubscription({
      tenant_id,
      email,
      plan_id,
      interval,
      stripe_price_id,
      token,
      expires_at: expiresAt,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ token, expires_at: expiresAt })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg || 'failed' }, { status: 500 })
  }
}
