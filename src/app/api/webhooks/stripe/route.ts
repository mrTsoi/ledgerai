import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe, getStripeConfig } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get('Stripe-Signature') as string

  let event: Stripe.Event

  try {
    const stripe = await getStripe()
    const config = await getStripeConfig()
    
    if (!config.webhook_secret) {
      throw new Error('Webhook secret not configured')
    }

    event = stripe.webhooks.constructEvent(
      body,
      signature,
      config.webhook_secret
    )
  } catch (error: any) {
    console.error(`Webhook signature verification failed: ${error.message}`)
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const planId = session.metadata?.planId

        if (userId && planId) {
          // Fetch the actual subscription to get correct dates
          const stripe = await getStripe()
          let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          let currentPeriodStart = new Date().toISOString()
          
          if (session.subscription) {
            try {
              const subResp = await stripe.subscriptions.retrieve(session.subscription as string)
              const sub: any = (subResp as any).data ?? subResp
              currentPeriodStart = new Date(sub.current_period_start * 1000).toISOString()
              currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString()
            } catch (e) {
              console.error('Failed to retrieve subscription in webhook:', e)
            }
          }

          // 1. Upsert Subscription
          await supabase
            .from('user_subscriptions')
            .upsert({
              user_id: userId,
              plan_id: planId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              status: 'active',
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd
            } as any, { onConflict: 'user_id' })

          // 2. Handle Initial Invoice (Race Condition Fix)
          // If invoice.payment_succeeded fired before this, it might have failed to find the user.
          // So we manually insert the invoice here if it exists.
          if (session.invoice) {
            const stripe = await getStripe()
            const invoice = await stripe.invoices.retrieve(session.invoice as string)
            
            if (invoice && invoice.status === 'paid') {
              const lineItem = invoice.lines.data[0]
              await supabase.from('billing_invoices').upsert({
                user_id: userId,
                stripe_invoice_id: invoice.id,
                amount_paid: invoice.amount_paid / 100,
                currency: invoice.currency,
                status: invoice.status,
                invoice_pdf: invoice.invoice_pdf,
                created_at: new Date(invoice.created * 1000).toISOString(),
                description: lineItem?.description || 'Subscription',
                period_start: lineItem?.period?.start ? new Date(lineItem.period.start * 1000).toISOString() : null,
                period_end: lineItem?.period?.end ? new Date(lineItem.period.end * 1000).toISOString() : null
              } as any, { onConflict: 'stripe_invoice_id' })
            }
          }
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const status = subscription.status

        // Check if there's a scheduled update (downgrade)
        // If the subscription is now active and matches the "next" plan, we should clear the next_plan fields
        // But we don't have easy access to the plan ID mapping here without querying DB.
        // For now, just update the status and dates.
        
        // If the update was a phase transition (schedule completed), we might want to clear next_plan_id
        // We can check if cancel_at_period_end is false, meaning no pending cancellation.
        
        const updateData: any = { 
          status: status,
          current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString()
        }

        // If the subscription is active and not canceling, we might assume the transition happened
        // Ideally we check the plan ID.
        // Let's fetch the current plan from DB to compare? No, too expensive.
        // Let's just update the core fields.
        
        await supabase
          .from('user_subscriptions')
          .update(updateData as any as never)
          .eq('stripe_subscription_id', subscription.id)
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string
        const customerId = (invoice as any).customer as string
        
        // Find user by subscription ID first
        let { data: sub } = await supabase
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()
          
        // Fallback: Find by customer ID if subscription ID lookup failed
        if (!sub && customerId) {
           const { data: subByCustomer } = await supabase
            .from('user_subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .single()
           sub = subByCustomer
        }

        if (sub) {
          const lineItem = invoice.lines.data[0]
          await supabase.from('billing_invoices').upsert({
            user_id: (sub as any).user_id,
            stripe_invoice_id: invoice.id,
            amount_paid: invoice.amount_paid / 100, // Convert cents to dollars
            currency: invoice.currency,
            status: invoice.status,
            invoice_pdf: invoice.invoice_pdf,
            created_at: new Date(invoice.created * 1000).toISOString(),
            description: lineItem?.description || 'Subscription',
            period_start: lineItem?.period?.start ? new Date(lineItem.period.start * 1000).toISOString() : null,
            period_end: lineItem?.period?.end ? new Date(lineItem.period.end * 1000).toISOString() : null
          } as any, { onConflict: 'stripe_invoice_id' })
        }
        break
      }
    }
  } catch (error: any) {
    console.error(`Error processing webhook: ${error.message}`)
    return new NextResponse('Webhook handler failed', { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
