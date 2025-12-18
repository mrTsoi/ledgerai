import { NextResponse } from 'next/server'
import { rpc } from '@/lib/supabase/typed'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const p_tenant_id = url.searchParams.get('p_tenant_id')
    const p_start_date = url.searchParams.get('p_start_date')
    const p_end_date = url.searchParams.get('p_end_date')

    if (!p_tenant_id || !p_start_date || !p_end_date) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const { data, error } = await rpc('get_profit_loss', {
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
