import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fetchDetails = async (): Promise<{ subscription: any | null; error: any | null }> => {
    const { data, error } = await supabase.rpc('get_user_subscription_details', {
      p_user_id: user.id,
    })
    if (error) return { subscription: null, error }
    const subscription = Array.isArray(data) && data.length > 0 ? data[0] : null
    return { subscription, error: null }
  }

  const first = await fetchDetails()
  if (first.error) return NextResponse.json({ error: first.error.message }, { status: 400 })
  if (first.subscription) return NextResponse.json({ subscription: first.subscription })

  // If the user has no subscription row yet, auto-assign Free plan (best-effort).
  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json({ subscription: null })
  }

  try {
    // Ensure profile exists (FK target)
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

    const { data: existingSub } = await service
      .from('user_subscriptions')
      .select('user_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Avoid overriding Stripe-managed subscriptions.
    if (!existingSub?.stripe_subscription_id) {
      const { data: planRows, error: planErr } = await service
        .from('subscription_plans')
        .select('id, name, price_monthly')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true })
        .limit(10)
      if (planErr) throw planErr

      const free = (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0 && (p?.name || '').toLowerCase() === 'free')
        || (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0)

      if (free?.id) {
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
        if (upsertErr) throw upsertErr
      }
    }
  } catch {
    // Non-fatal: caller can still render with subscription = null.
    return NextResponse.json({ subscription: null })
  }

  const second = await fetchDetails()
  if (second.error) return NextResponse.json({ error: second.error.message }, { status: 400 })
  return NextResponse.json({ subscription: second.subscription })
}
