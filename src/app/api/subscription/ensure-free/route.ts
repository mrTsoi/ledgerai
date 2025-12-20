import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }

  // Ensure the user's profile exists.
  // user_subscriptions.user_id references profiles(id), so older accounts (created before triggers)
  // or certain edge-cases can fail with FK violations unless we backfill profiles.
  try {
    const { data: existingProfile, error: profileErr } = await service
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) throw profileErr

    if (!existingProfile?.id) {
      const fullName =
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        (user.user_metadata as any)?.display_name ||
        null

      const { error: insertProfileErr } = await (service.from('profiles') as any).insert({
        id: user.id,
        email: user.email || null,
        full_name: fullName,
      })
      if (insertProfileErr) throw insertProfileErr
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to ensure profile' }, { status: 400 })
  }

  // Find the Free plan (lowest-priced active plan)
  const { data: planRows, error: planErr } = await service
    .from('subscription_plans')
    .select('id, name, price_monthly, price_yearly')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })
    .limit(10)

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 400 })

  const free = (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0 && (p?.name || '').toLowerCase() === 'free')
    || (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0)

  if (!free?.id) return NextResponse.json({ error: 'No free plan configured' }, { status: 400 })

  // Only create/update if the user has no subscription yet.
  const { data: existing } = await service
    .from('user_subscriptions')
    .select('user_id, stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Cannot auto-assign free plan while a Stripe subscription exists' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error: upsertErr } = await (service.from('user_subscriptions') as any).upsert(
    {
      user_id: user.id,
      plan_id: free.id,
      status: 'active',
      current_period_start: now,
      current_period_end: null,
      stripe_subscription_id: null,
    },
    { onConflict: 'user_id' }
  )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 400 })

  return NextResponse.json({ success: true, planName: free.name })
}
