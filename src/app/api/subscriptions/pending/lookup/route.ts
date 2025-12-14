import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const email = url.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pending_subscriptions')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = (data && (data as any)[0]) || null
    if (!row) return NextResponse.json({ pending: null })

    // Return pending, include token so client can resume checkout
    return NextResponse.json({ pending: row })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 })
  }
}
