import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/subscription/server'

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

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', body.tenantId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const ok = await userHasFeature(supabase, user.id, 'tax_automation')
      if (!ok) {
        return NextResponse.json({ error: 'Tax automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    const { rpc } = await import('@/lib/supabase/typed')
    const { data, error } = await rpc('get_tax_estimate', {
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
