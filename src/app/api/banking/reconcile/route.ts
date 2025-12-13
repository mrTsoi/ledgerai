import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AIReconciliationService } from '@/lib/ai/reconciliation-service'
import { userHasFeature } from '@/lib/subscription/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    const body = await request.json()
    const { bankTransaction, candidates, tenantId } = body

    if (!bankTransaction || !candidates || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const matches = await AIReconciliationService.findMatches(bankTransaction, candidates, tenantId)

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Reconciliation API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
