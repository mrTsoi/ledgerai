import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const p_tenant_id = url.searchParams.get('p_tenant_id')
    const p_start_date = url.searchParams.get('p_start_date')
    const p_end_date = url.searchParams.get('p_end_date')

    if (!p_tenant_id || !p_start_date || !p_end_date) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Ensure the caller is a member of the tenant they are requesting.
    const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
      .select('id, role')
      .eq('tenant_id', p_tenant_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await (supabase as any).rpc('get_profit_loss', {
      p_tenant_id,
      p_start_date,
      p_end_date,
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'RPC error' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
