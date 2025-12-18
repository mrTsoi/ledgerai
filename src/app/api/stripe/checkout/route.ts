import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

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
          
          // Let's try to find a Price for this plan.
          // We'll search products by name.
          const products = await stripe.products.search({
            query: `name:'${planRow.name}'`,
          })
          
          let priceId
          
          if (products.data.length > 0) {
            const productId = products.data[0].id
            // Find price
            const prices = await stripe.prices.list({ product: productId, lookup_keys: [`${planRow.id}_${interval}`] })
            if (prices.data.length > 0) {
              priceId = prices.data[0].id
            } else {
               const price = await stripe.prices.create({
                product: productId,
                unit_amount: newPriceAmount,
                currency: 'usd',
                recurring: { interval: interval as 'month' | 'year' },
                lookup_key: `${planRow.id}_${interval}`
              })
              priceId = price.id
            }
          } else {
            // Create product and price
            const product = await stripe.products.create({ name: planRow.name || 'Plan' })
            const price = await stripe.prices.create({
              product: product.id,
              unit_amount: newPriceAmount,
              currency: 'usd',
              recurring: { interval: interval as 'month' | 'year' },
                lookup_key: `${planRow.id}_${interval}`
            })
            priceId = price.id
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

            // 2. Update schedule
            await stripe.subscriptionSchedules.update(scheduleId, {
              end_behavior: 'release',
              phases: [
                {
                  items: [{ price: existingSub.items.data[0].price.id, quantity: 1 }],
                  start_date: 'now',
                  end_date: existingSub.current_period_end,
                },
                {
                  items: [{ price: priceId, quantity: 1 }],
                }
              ]
            })

            // Update local DB to reflect scheduled change
            await supabase.from('user_subscriptions').update({
                next_plan_id: planRow.id,
                next_plan_start_date: new Date(existingSub.current_period_end * 1000).toISOString()
              }).eq('user_id', user.id)
            
            return NextResponse.json({ url: `${baseUrl}?success=true&tab=billing&downgrade=scheduled` })
          } else {
            // Upgrade: Immediate
            // NOTE: Stripe API does not support 'allow_promotion_codes' on subscription updates directly.
            // To support promo codes on upgrades, we would need to create a new Checkout Session in 'setup' or 'subscription' mode
            // or apply a coupon manually if we had one.
            // Since we are doing a direct API update here, we can't easily pop up the promo code box.
            // However, if the user wants to use a promo code, they might expect to be redirected to Checkout.
            // Let's redirect to Checkout for Upgrades too if we want to support promo codes!
            // But Checkout for existing subscription is tricky (it might create a duplicate).
            // Stripe Checkout supports 'mode: subscription' with 'setup_future_usage' etc.
            // Actually, if we pass the existing 'subscription' ID to checkout, it updates it? No.
            
            // ALTERNATIVE: We can apply a coupon to the subscription update if the user provided one in the UI.
            // But our UI doesn't have a promo code input (Stripe Checkout does).
            
            // If we want to support promo codes on upgrade, we should probably use a Checkout Session 
            // that updates the subscription. But Stripe Checkout creates NEW subscriptions by default.
            // There is no "Update Subscription" mode in Checkout.
            
            // So, for Upgrades with Promo Codes, we are stuck unless we build our own UI for promo code 
            // and apply it via API.
            
            // For now, we will stick to direct update. 
            // If the user really wants to use a promo code, they might need to cancel and re-subscribe 
            // OR we implement a "Apply Coupon" feature separately.
            
            await stripe.subscriptions.update(existingSubscriptionId, {
              items: [{
                id: itemId,
                price: priceId,
              }],
              proration_behavior: 'always_invoice', // Charge/Credit immediately
            })

            // Update local DB immediately for better UX (webhook will confirm later)
            await supabase.from('user_subscriptions').update({
                plan_id: planRow.id,
                // Don't update status/dates yet, let webhook handle it or wait for refresh
              }).eq('user_id', user.id)

            return NextResponse.json({ url: `${baseUrl}?success=true&tab=billing&updated=true` })
          }
        }
      } catch (e) {
        console.log('Existing subscription not found or invalid, creating new one', e)
        // Fall through to create new session
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
