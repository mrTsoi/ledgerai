import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

async function ensureActivePriceAndProduct(
  stripe: Stripe,
  priceId: string,
  opts: { required?: boolean } = {}
): Promise<void> {
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })

  if (price.active === false) {
    try {
      await stripe.prices.update(priceId, { active: true })
    } catch (e) {
      // Some legacy/auto-created Stripe prices cannot be updated.
      if (opts.required) throw e
      return
    }
  }

  if (typeof price.product !== 'string') {
    if ('deleted' in price.product) {
      throw new Error(`Stripe product for price ${priceId} is deleted and cannot be reactivated`)
    }
    if (price.product.active === false) {
      try {
        await stripe.products.update(price.product.id, { active: true })
      } catch (e) {
        if (opts.required) throw e
        return
      }
    }
  }
}

async function createReplacementProductAndPrice(params: {
  stripe: Stripe
  planId: string
  planName: string
  planDescription?: string
  interval: 'month' | 'year'
  unitAmount: number
  lookupKey?: string
}): Promise<string> {
  const { stripe, planId, planName, planDescription, interval, unitAmount, lookupKey } = params

  const product = await stripe.products.create({
    name: planName,
    description: planDescription,
    metadata: { plan_id: planId },
  })

  try {
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: unitAmount,
      currency: 'usd',
      recurring: { interval },
      ...(lookupKey ? { lookup_key: lookupKey } : {}),
      metadata: { plan_id: planId, interval },
    })
    return price.id
  } catch (e: any) {
    // If lookup_key collides with an existing archived price, retry without it.
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: unitAmount,
      currency: 'usd',
      recurring: { interval },
      metadata: { plan_id: planId, interval, ...(lookupKey ? { lookup_key: lookupKey } : {}) },
    })
    return price.id
  }
}

function isStripeSubscriptionNotFoundError(e: any): boolean {
  const msg = String(e?.message || '')
  return e?.type === 'StripeInvalidRequestError' && (msg.includes('No such subscription') || msg.includes('resource_missing'))
}

export async function POST(req: NextRequest) {
  try {
    const { planId, interval = 'month', returnUrl } = await req.json()
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Fetch plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) {
      return new NextResponse('Plan not found', { status: 404 })
    }

    // Narrow plan into a local shape used below
    const planRow = plan as { price_yearly?: number; price_monthly?: number; name?: string; id?: string; description?: string }

    const stripe = await getStripe()

    // Get or create customer
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan_id')
      .eq('user_id', user.id)
      .single()

    let customerId = subscription?.stripe_customer_id
    const currentPlanId = subscription?.plan_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id
        }
      })
      customerId = customer.id
      
      // Save customer ID
      await (supabase
        .from('user_subscriptions') as any)
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

    // Use provided returnUrl or fallback to origin/settings (which might be wrong but is a safe fallback)
    const baseUrl = returnUrl || `${req.headers.get('origin')}/dashboard/settings`

    // Check if user already has an active subscription in Stripe
    let existingSubscriptionId = (subscription as any)?.stripe_subscription_id
    let existingSub: any = null

    // ROBUSTNESS FIX: Always check Stripe for active subscriptions if we have a customer ID.
    // This handles cases where DB is stale, webhook failed, or user has multiple subs (we pick the first active one).
    if (customerId) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1
        })
        
        if (subs.data.length > 0) {
          // Found an active subscription in Stripe!
          existingSub = subs.data[0]
          existingSubscriptionId = existingSub.id
          
          // Sync DB if needed
           if (subscription?.stripe_subscription_id !== existingSubscriptionId) {
             await supabase.from('user_subscriptions').update({ stripe_subscription_id: existingSubscriptionId }).eq('user_id', user.id)
          }
        } else {
          // No active subscriptions in Stripe, even if DB thought so.
          existingSubscriptionId = null
          existingSub = null
        }
      } catch (e) {
        console.error('Error fetching subscriptions from Stripe:', e)
      }
    }

    if (existingSubscriptionId && existingSub) {
      try {
        if (existingSub.status === 'active' || existingSub.status === 'trialing') {
          // This is an UPGRADE or DOWNGRADE
          // We will update the existing subscription directly
          
          const itemId = existingSub.items.data[0].id
          
          // Calculate new price amount
          const priceAmount = interval === 'year'
            ? (planRow.price_yearly ?? ((planRow.price_monthly ?? 0) * 12))
            : (planRow.price_monthly ?? 0)
          const newPriceAmount = Math.round(priceAmount * 100)          // We need to find or create the price ID in Stripe for this plan
          // For simplicity in this demo, we'll create a new price on the fly or search for it
          // In production, you should map your DB plan IDs to Stripe Price IDs
          
          // Let's search for a price with the matching product name and amount
          // Or better, just create a new price for the product if we don't have a mapping
          // But we don't have a product ID mapping either.
          // Let's assume we create a price on the fly for the "Standard Product" or similar.
          // Actually, creating a price requires a product ID.
          
          // STRATEGY: Create a product for the plan if not exists, then price.
          // This is getting complex for a single file.
          // SIMPLIFICATION: We will create a new Checkout Session in 'subscription' mode 
          // but passing the existing customer. Stripe might create a duplicate sub.
          // To avoid duplicate, we should really update.
          
          // Prefer stable lookup_key pricing; create replacement product/price if the old one is tied to an inactive product.
          const lookupKey = `${planRow.id}_${interval}`
          let priceId: string | null = null

          const byLookup = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })
          if (byLookup.data.length > 0) {
            priceId = byLookup.data[0].id
            try {
              await ensureActivePriceAndProduct(stripe, priceId, { required: true })
            } catch {
              // The existing lookup-key price is not usable (inactive product and cannot be reactivated).
              // Create a replacement price under a new active product.
              priceId = await createReplacementProductAndPrice({
                stripe,
                planId: String(planRow.id),
                planName: planRow.name || 'Plan',
                planDescription: planRow.description || undefined,
                interval: interval as 'month' | 'year',
                unitAmount: newPriceAmount,
                lookupKey,
              })
            }
          } else {
            // No lookup-key price exists yet: create one (or fall back without lookup_key if it collides).
            priceId = await createReplacementProductAndPrice({
              stripe,
              planId: String(planRow.id),
              planName: planRow.name || 'Plan',
              planDescription: planRow.description || undefined,
              interval: interval as 'month' | 'year',
              unitAmount: newPriceAmount,
              lookupKey,
            })
          }

          // Ensure current subscription price/product is active (needed for schedules).
          const currentPriceId = existingSub.items.data?.[0]?.price?.id
          if (typeof currentPriceId === 'string' && currentPriceId) {
            // Best-effort only: some Stripe-generated legacy prices cannot be updated.
            await ensureActivePriceAndProduct(stripe, currentPriceId, { required: false })
          }

          // Check if it's a downgrade
          const currentPriceAmount = existingSub.items.data[0].price.unit_amount || 0
          const currentInterval = existingSub.items.data[0].price.recurring?.interval || 'month'
          
          // Determine if this is a downgrade
          let isDowngrade = false
          
          // If we recovered the sub from Stripe, currentPlanId might be null/old.
          // Trust the price comparison logic primarily.

          if (currentPlanId === planRow.id) {
            // Same plan, check interval change
            if (currentInterval === 'year' && interval === 'month') {
              // Year -> Month is a downgrade (scheduled)
              isDowngrade = true
            } else {
              // Month -> Year is an upgrade (immediate)
              // Month -> Month is no change (shouldn't happen if UI is correct)
              isDowngrade = false
            }
          } else {
            // Different plan, compare value
            // Normalize to monthly for comparison
            const currentMonthly = currentInterval === 'year' ? currentPriceAmount / 12 : currentPriceAmount
            const newMonthly = interval === 'year' ? newPriceAmount / 12 : newPriceAmount
            
            // If new monthly cost is lower, it's a downgrade
            isDowngrade = newMonthly < currentMonthly
          }

          if (isDowngrade) {
            // Special-case: downgrade to Free should not attempt to switch Stripe prices.
            // Instead, schedule cancellation at period end and let the app switch to Free in DB.
            const isFreeTarget = newPriceAmount === 0

            // Downgrade: Schedule for end of period
            // 1. Check for existing schedule
            const schedules = await stripe.subscriptionSchedules.list({
              customer: customerId,
            })
            
            let scheduleId = schedules.data.find((s: any) => s.subscription === existingSubscriptionId)?.id

            if (!scheduleId) {
              const schedule = await stripe.subscriptionSchedules.create({
                from_subscription: existingSubscriptionId,
              })
              scheduleId = schedule.id
            }

            const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
            const phase0Start = schedule.current_phase?.start_date ?? schedule.phases?.[0]?.start_date
            const phase0End = schedule.current_phase?.end_date ?? schedule.phases?.[0]?.end_date ?? (existingSub as any)?.current_period_end
            if (!phase0End || typeof phase0End !== 'number') {
              return NextResponse.json(
                { error: 'Unable to schedule change: missing current billing period end date from Stripe' },
                { status: 409 }
              )
            }

            if (isFreeTarget) {
              // If the subscription is managed by a subscription schedule, Stripe forbids setting
              // cancellation directly on the subscription. Always manage end-of-period cancellation
              // by updating/creating the schedule.
              await stripe.subscriptionSchedules.update(scheduleId, {
                end_behavior: 'cancel',
                phases: [
                  {
                    items: [{ price: existingSub.items.data[0].price.id, quantity: 1 }],
                    ...(typeof phase0Start === 'number' ? { start_date: phase0Start } : {}),
                    end_date: phase0End,
                  },
                ],
              })

              await supabase.from('user_subscriptions').update({
                next_plan_id: planRow.id,
                next_plan_start_date: new Date(phase0End * 1000).toISOString(),
                next_billing_interval: null,
              }).eq('user_id', user.id)

              return NextResponse.json({ url: `${baseUrl}?success=true&tab=billing&change=scheduled` })
            }

            // 2. Update schedule
            await stripe.subscriptionSchedules.update(scheduleId, {
              end_behavior: 'release',
              phases: [
                {
                  items: [{ price: existingSub.items.data[0].price.id, quantity: 1 }],
                  ...(typeof phase0Start === 'number' ? { start_date: phase0Start } : {}),
                  end_date: phase0End,
                },
                {
                  items: [{ price: priceId, quantity: 1 }],
                }
              ]
            })

            // Update local DB to reflect scheduled change
            await supabase.from('user_subscriptions').update({
                next_plan_id: planRow.id,
                next_plan_start_date: new Date(phase0End * 1000).toISOString(),
                next_billing_interval: interval as 'month' | 'year'
              }).eq('user_id', user.id)
            
            return NextResponse.json({ url: `${baseUrl}?success=true&tab=billing&change=scheduled` })
          } else {
            // Upgrade: Immediate
            // REQUIREMENT: Customer must confirm proration & billing cycle in Stripe.
            // Stripe Checkout cannot update an existing subscription without creating a new one,
            // so we use Stripe Billing Portal's subscription_update flow.
            try {
              const portal = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: `${baseUrl}?success=true&tab=billing&updated=true`,
                // Use the portal flow to update an existing subscription item.
                flow_data: {
                  type: 'subscription_update',
                  subscription_update: {
                    subscription: existingSubscriptionId,
                    items: [
                      {
                        id: itemId,
                        price: priceId,
                        quantity: 1,
                      },
                    ],
                    proration_behavior: 'always_invoice',
                  },
                },
              } as any)

              return NextResponse.json({ url: portal.url })
            } catch (e: any) {
              // Common cause: Billing Portal not configured in Stripe dashboard.
              const msg = String(e?.message || '')
              return NextResponse.json(
                {
                  error:
                    msg ||
                    'Unable to start Stripe Billing Portal session. Ensure Billing Portal is enabled/configured in Stripe.',
                },
                { status: 409 }
              )
            }
          }
        }
      } catch (e) {
        console.error('Failed to update existing Stripe subscription', e)

        // Only fall back to creating a new subscription if the existing subscription truly doesn't exist.
        if (isStripeSubscriptionNotFoundError(e)) {
          console.log('Existing subscription not found, creating new one')
          // Fall through to create new session
        } else {
          // If Stripe rejects the change (e.g., inactive product/price), surface an actionable error.
          const msg = String((e as any)?.message || 'Stripe update failed')
          return NextResponse.json({ error: msg }, { status: 409 })
        }
      }
    }

    // Create Checkout Session (New Subscription)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: planRow.name,
              description: planRow.description || undefined,
            },
            unit_amount: Math.round(((interval === 'year'
              ? (planRow.price_yearly ?? ((planRow.price_monthly ?? 0) * 12))
              : (planRow.price_monthly ?? 0))
            ) * 100),
            recurring: {
              interval: interval as 'month' | 'year',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}?success=true&tab=billing`,
      cancel_url: `${baseUrl}?canceled=true&tab=billing`,
      metadata: {
        userId: user.id,
        planId: planRow.id,
      },
      allow_promotion_codes: true,
    } as Stripe.Checkout.SessionCreateParams)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return new NextResponse(error.message, { status: 500 })
  }
}
