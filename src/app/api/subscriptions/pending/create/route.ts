import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { insertPendingSubscription } from '../../../../../lib/supabase/typed'
import { Database } from '@/types/database.types'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, tenant_id = null, plan_id = null, interval = 'month', stripe_price_id = null } = body
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

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
