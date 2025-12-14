import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { token, returnUrl } = await req.json()
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('pending_subscriptions')
      .select('*')
      .eq('token', token)
      .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const pending = Array.isArray(data) && data.length > 0 ? (data as any)[0] : null
    if (!pending) return NextResponse.json({ error: 'invalid token' }, { status: 404 })
    if (new Date(pending.expires_at) < new Date()) return NextResponse.json({ error: 'token expired' }, { status: 410 })

    const stripe = await getStripe()

    // Determine pricing amount from subscription_plans if stripe_price_id not provided
    let unitAmount = null
    let interval = pending.interval || 'month'
    let productName = 'Subscription'

    if (pending.stripe_price_id) {
      // If a price id exists, create Checkout session using price
      const session = await stripe.checkout.sessions.create({
        customer_email: pending.email,
        line_items: [{ price: pending.stripe_price_id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${returnUrl || (req.headers.get('origin') || '')}/dashboard?success=true`,
        cancel_url: `${returnUrl || (req.headers.get('origin') || '')}/dashboard?canceled=true`,
        metadata: { pending_token: token }
      })
      return NextResponse.json({ url: session.url })
    }

    if (pending.plan_id) {
      const { data: planRows } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', pending.plan_id)
        .limit(1)
      const plan = Array.isArray(planRows) && planRows.length > 0 ? (planRows as any)[0] : null
      if (plan) {
        productName = plan.name || productName
        unitAmount = interval === 'year' ? (plan.price_yearly || plan.price_monthly * 12) : plan.price_monthly
      }
    }

    if (!unitAmount) return NextResponse.json({ error: 'price mapping missing' }, { status: 400 })

    const session = await stripe.checkout.sessions.create({
      customer_email: pending.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: productName },
            unit_amount: Math.round(unitAmount * 100),
            recurring: { interval: interval as 'month' | 'year' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${returnUrl || (req.headers.get('origin') || '')}/dashboard?success=true`,
      cancel_url: `${returnUrl || (req.headers.get('origin') || '')}/dashboard?canceled=true`,
      metadata: { pending_token: token }
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'failed' }, { status: 500 })
  }
}
