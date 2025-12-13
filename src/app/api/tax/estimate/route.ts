import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Body = {
  tenantId: string
  startDate: string
  endDate: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    if (!body?.tenantId || !body?.startDate || !body?.endDate) {
      return NextResponse.json(
        { error: 'tenantId, startDate, endDate are required' },
        { status: 400 }
      )
    }

    const { data, error } = await (supabase as any).rpc('get_tax_estimate', {
      p_tenant_id: body.tenantId,
      p_start_date: body.startDate,
      p_end_date: body.endDate
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ result: data })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    )
  }
}
