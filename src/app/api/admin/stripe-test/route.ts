import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
  if (error || isSuperAdmin !== true) return new NextResponse('Forbidden', { status: 403 })

  try {
    const stripe = await getStripe()
    const start = Date.now()
    await stripe.customers.list({ limit: 1 })
    const ms = Date.now() - start

    return NextResponse.json({ success: true, message: `Stripe connection OK (${ms}ms)` })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'Stripe test failed'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
