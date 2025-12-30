import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { insertPendingSubscription } from '@/lib/supabase/typed'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params

  // Debug logs to trace OAuth callback handling in dev
  try {
    console.debug('[auth/callback] incoming request url:', request.url)
    console.debug('[auth/callback] incoming headers cookie:', request.headers.get('cookie'))
  } catch (e) {
    // ignore logging errors
  }

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
        let service: ReturnType<typeof createServiceClient>
        try {
          service = createServiceClient()
        } catch {
          service = null as any
        }

        if (service) {
          // Ensure profile exists (user_subscriptions.user_id references profiles.id)
          const { data: existingProfile } = await service
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

          if (!existingProfile?.id) {
            const fullName =
              (user.user_metadata as any)?.full_name ||
              (user.user_metadata as any)?.name ||
              (user.user_metadata as any)?.display_name ||
              null

            await (service.from('profiles') as any).insert({
              id: user.id,
              email: user.email || null,
              full_name: fullName,
            })
          }

          const { data: existingSub } = await service
            .from('user_subscriptions')
            .select('user_id, stripe_subscription_id')
            .eq('user_id', user.id)
            .maybeSingle()

          // Do not overwrite a Stripe-managed subscription.
          if (!existingSub?.stripe_subscription_id) {
            const { data: planRows } = await service
              .from('subscription_plans')
              .select('id, name, price_monthly')
              .eq('is_active', true)
              .order('price_monthly', { ascending: true })
              .limit(10)

            const free = (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0 && (p?.name || '').toLowerCase() === 'free')
              || (planRows || []).find((p: any) => (p?.price_monthly ?? 0) === 0)

            if (free?.id) {
              const now = new Date().toISOString()
              await (service.from('user_subscriptions') as any).upsert(
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
            }
          }
        }
      } catch (e) {
        console.error('Auto-subscribe error:', e)
      }
    }

    // Always redirect to absolute URL on the same origin (fallback to configured public domain).
    const requestOrigin = new URL(request.url).origin;
    const PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;
    const redirectUrl = next.startsWith('http')
      ? next
      : `${PUBLIC_DOMAIN.replace(/\/$/, '')}${next.startsWith('/') ? '' : '/'}${next}`;
    return NextResponse.redirect(redirectUrl);
  } catch {
    // Redirect back to the same origin (or configured public domain) on error as well
    const requestOrigin = new URL(request.url).origin;
    const PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;
    const errorRedirect = `${PUBLIC_DOMAIN.replace(/\/$/, '')}/${locale}/login?error=oauth_failed`;
    return NextResponse.redirect(errorRedirect);
  }
}
