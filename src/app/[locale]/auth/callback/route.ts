import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { insertPendingSubscription } from '@/lib/supabase/typed'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || `/${locale}/dashboard`

  // Optional: used by signup page to carry plan selection through OAuth.
  const planId = url.searchParams.get('plan_id')
  const interval = (url.searchParams.get('interval') as 'month' | 'year' | null) || null

  if (!code) {
    // No code means this wasn't a valid OAuth callback.
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // If signup carried a plan selection, persist it so the dashboard can resume checkout.
    if (planId && user?.email) {
      const email = user.email
      try {
        const token = crypto.randomBytes(24).toString('hex')
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

        await insertPendingSubscription({
          tenant_id: null,
          email,
          plan_id: planId,
          interval: interval || 'month',
          stripe_price_id: null,
          token,
          expires_at: expiresAt,
        })

        // Best-effort: store selection on the user as metadata too.
        await supabase.auth.updateUser({
          data: {
            selected_plan_id: planId,
            selected_plan_interval: interval || 'month',
          },
        })
      } catch {
        // Non-fatal: OAuth should still complete.
      }
    }

    // Auto-subscribe to Free plan if no subscription exists (e.g. Google Login without plan selection)
    if (user && !planId) {
      try {
        const { data: subscriptions } = await supabase
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', user.id)

        if (!subscriptions || subscriptions.length === 0) {
          const { data: plans } = await supabase
            .from('subscription_plans')
            .select('id')
            .ilike('name', '%Free%')
            .limit(1)

          if (plans && plans.length > 0) {
            await supabase.from('user_subscriptions').insert({
              user_id: user.id,
              plan_id: plans[0].id,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(new Date().setFullYear(new Date().getFullYear() + 100)).toISOString(),
            })
          }
        }
      } catch (e) {
        console.error('Auto-subscribe error:', e)
      }
    }

    return NextResponse.redirect(new URL(next, request.url))
  } catch {
    return NextResponse.redirect(new URL(`/${locale}/login?error=oauth_failed`, request.url))
  }
}
