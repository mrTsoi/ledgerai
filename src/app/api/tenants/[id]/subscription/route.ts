import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: tenantId } = await context.params
  if (!tenantId) return NextResponse.json({ error: 'tenant id required' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check membership or owner
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: tenantData, error: tenantErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .limit(1)
    .maybeSingle()

  if (tenantErr) return NextResponse.json({ error: tenantErr.message }, { status: 400 })
  if (!tenantData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let plan: any = null
  if (tenantData.subscription_plan) {
    const { data: planRow } = await supabase.from('subscription_plans').select('*').eq('id', tenantData.subscription_plan).limit(1).maybeSingle()
    plan = planRow || null
  }

  // If the tenant has no explicit tenant-level subscription, try to infer
  // from the calling user's subscription (useful when billing is per-user)
  if (!tenantData.subscription_plan) {
    try {
      const { data: userSub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (userSub) {
        const { data: planRow } = await supabase.from('subscription_plans').select('*').eq('id', userSub.plan_id).limit(1).maybeSingle()
        plan = planRow || null
        return NextResponse.json({ subscription: { plan_name: plan?.display_name || plan?.name || null, plan_id: userSub.plan_id || null, status: userSub.status || null, plan } })
      }
    } catch (e) {
      // ignore and fall through to returning tenant-level (null) subscription
    }
  }

  return NextResponse.json({ subscription: { plan_name: plan?.display_name || plan?.name || null, plan_id: tenantData.subscription_plan || null, status: tenantData.subscription_status || null, plan } })
}
