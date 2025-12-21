import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/subscription/server'

type Body = {
  tenantId?: string
  startDate?: string
  endDate?: string
  // Back-compat with earlier callers
  tenant_id?: string
  start_date?: string
  end_date?: string
}

type TaxEstimateRow = {
  document_count: number | string | null
  taxable_total: number | string | null
  estimated_tax_total: number | string | null
}

function normalizeBody(body: Body) {
  const tenantId = body.tenantId ?? body.tenant_id
  const startDate = body.startDate ?? body.start_date
  const endDate = body.endDate ?? body.end_date
  return { tenantId, startDate, endDate }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as Body
    const normalized = normalizeBody(body)
    if (!normalized?.tenantId || !normalized?.startDate || !normalized?.endDate) {
      return NextResponse.json(
        { error: 'tenantId/startDate/endDate (or tenant_id/start_date/end_date) are required' },
        { status: 400 }
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', normalized.tenantId)
      .eq('user_id', user.id)
      .eq('is_active', true)
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

    // Fast path: serve from cache if available.
    const { data: cached } = await (supabase.from('tenant_tax_estimate_cache') as any)
      .select('document_count,taxable_total,estimated_tax_total,computed_at')
      .eq('tenant_id', normalized.tenantId)
      .eq('start_date', normalized.startDate)
      .eq('end_date', normalized.endDate)
      .maybeSingle()

    if (cached) {
      return NextResponse.json({
        result: cached,
        document_count: cached?.document_count ?? 0,
        taxable_total: cached?.taxable_total ?? 0,
        estimated_tax_total: cached?.estimated_tax_total ?? 0,
        cached: true,
      })
    }

    const { data, error } = await (supabase as any).rpc('get_tax_estimate', {
      p_tenant_id: normalized.tenantId,
      p_start_date: normalized.startDate,
      p_end_date: normalized.endDate,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = (Array.isArray(data) ? (data[0] as TaxEstimateRow | undefined) : (data as any as TaxEstimateRow)) || null

    // Best-effort: persist to cache for faster dashboards.
    try {
      await (supabase as any).rpc('refresh_tax_estimate_cache', {
        p_tenant_id: normalized.tenantId,
        p_start_date: normalized.startDate,
        p_end_date: normalized.endDate,
      })
    } catch {
      // Non-fatal
    }

    return NextResponse.json({
      result: row,
      document_count: row?.document_count ?? 0,
      taxable_total: row?.taxable_total ?? 0,
      estimated_tax_total: row?.estimated_tax_total ?? 0,
      cached: false,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    )
  }
}
