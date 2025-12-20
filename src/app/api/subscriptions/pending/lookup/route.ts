import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userEmail = user.email
    if (!userEmail) return NextResponse.json({ error: 'User email missing' }, { status: 400 })

    // If a client supplies an email param, it must match the authenticated user.
    const emailParam = url.searchParams.get('email')
    if (emailParam && emailParam.toLowerCase() !== userEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { data, error } = await supabase
      .from('pending_subscriptions')
      .select('*')
      .eq('email', userEmail)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = (data && data[0]) || null
    if (!row) return NextResponse.json({ pending: null })

    // Return pending, include token so client can resume checkout
    return NextResponse.json({ pending: row })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 })
  }
}
