import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe, getStripeConfig } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import {
  createService,
  selectProfileIdByEmail,
  upsertUserSubscription,
  updatePendingSubscriptionById,
  upsertBillingInvoice,
  findUserSubscriptionByStripeSubscriptionId,
  findUserSubscriptionByCustomerId,
} from '../../../../lib/supabase/typed'
import Stripe from 'stripe'
import { Database } from '@/types/database.types'

function getNumberField(obj: unknown, key: string): number | undefined {
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'number' ? v : undefined
}

function getStringField(obj: unknown, key: string): string | undefined {
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}

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

  let sb: ReturnType<typeof createServiceClient>
  try {
    sb = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // Prefer explicit metadata (userId/planId), but also support pending_token flow
        const userId = session.metadata?.userId
        const planId = session.metadata?.planId
        const pendingToken = session.metadata?.pending_token

        // Fetch the actual subscription to get correct dates
        const stripe = await getStripe()
        let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        let currentPeriodStart = new Date().toISOString()

        if (session.subscription) {
          try {
            const subResp = await stripe.subscriptions.retrieve(String(session.subscription))
            const cps = getNumberField(subResp, 'current_period_start')
            const cpe = getNumberField(subResp, 'current_period_end')
            if (cps) currentPeriodStart = new Date(cps * 1000).toISOString()
            if (cpe) currentPeriodEnd = new Date(cpe * 1000).toISOString()
          } catch (e) {
            console.error('Failed to retrieve subscription in webhook:', e)
          }
        }

        if (pendingToken) {
          // Pending-token flow: find pending record and link to user by email
          const { data: pendingData, error: pendingErr } = await createService()
            .from('pending_subscriptions')
            .select('*')
            .eq('token', pendingToken)
            .limit(1)
            .single()

          if (pendingErr) {
            console.error('Failed to load pending subscription for token:', pendingErr)
            break
          }

          const pending = pendingData as Database['public']['Tables']['pending_subscriptions']['Row'] | null
          if (!pending) break

          // Find user/profile by email
          const { data: profileData } = await selectProfileIdByEmail(pending.email)

          const finalUserId = (profileData as Database['public']['Tables']['profiles']['Row'] | null)?.id || null

          if (finalUserId) {
            // Upsert subscription for the user
            const userSub: Database['public']['Tables']['user_subscriptions']['Insert'] = {
              user_id: finalUserId,
              plan_id: pending.plan_id as string,
              status: 'active',
              current_period_start: currentPeriodStart,
              current_period_end: currentPeriodEnd,
            }
            await upsertUserSubscription(userSub)

            // Mark pending as consumed
            const pendingUpdate: Database['public']['Tables']['pending_subscriptions']['Update'] = {
              consumed_at: new Date().toISOString(),
              consumed_by_user_id: finalUserId
            }
            await updatePendingSubscriptionById(pending.id, pendingUpdate)
          } else {
            console.warn('Pending subscription found but no matching user/profile for email:', pending.email)
          }

          // Also handle initial invoice if present (same as below)
          if (session.invoice) {
            const invoice = await stripe.invoices.retrieve(String(session.invoice))
            if (invoice && getStringField(invoice, 'status') === 'paid') {
              let lineItem: any = undefined
              const linesField = (invoice as unknown as Record<string, unknown>)['lines']
              if (linesField && typeof linesField === 'object' && 'data' in (linesField as Record<string, unknown>)) {
                const dataField = (linesField as Record<string, unknown>)['data']
                if (Array.isArray(dataField)) lineItem = dataField[0]
              }
              if (finalUserId) {
                type BillingInvoiceInsert = {
                  user_id: string
                  stripe_invoice_id: string
                  amount_paid: number
                  currency?: string | null
                  status?: string | null
                  invoice_pdf?: string | null
                  created_at?: string
                  description?: string | null
                  period_start?: string | null
                  period_end?: string | null
                }
                const billingInvoice: BillingInvoiceInsert = {
                  user_id: finalUserId,
                  stripe_invoice_id: invoice.id,
                  amount_paid: invoice.amount_paid / 100,
                  currency: invoice.currency,
                  status: invoice.status,
                  invoice_pdf: invoice.invoice_pdf,
                  created_at: new Date(invoice.created * 1000).toISOString(),
                  description: lineItem?.description || 'Subscription',
                  period_start: lineItem?.period?.start ? new Date(lineItem.period.start * 1000).toISOString() : null,
                  period_end: lineItem?.period?.end ? new Date(lineItem.period.end * 1000).toISOString() : null
                }
                await upsertBillingInvoice(billingInvoice)
              }
            }
          }
        }

        // Fallback: metadata userId/planId flow (legacy)
        else if (userId && planId) {
          // 1. Upsert Subscription
          const userSub: Database['public']['Tables']['user_subscriptions']['Insert'] = {
            user_id: userId,
            plan_id: planId,
            status: 'active',
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd
          }
          await upsertUserSubscription(userSub)

          // 2. Handle Initial Invoice (Race Condition Fix)
          if (session.invoice) {
            const invoice = await stripe.invoices.retrieve(String(session.invoice))
              if (invoice && getStringField(invoice, 'status') === 'paid') {
              let lineItem: any = undefined
              const linesField = (invoice as unknown as Record<string, unknown>)['lines']
              if (linesField && typeof linesField === 'object' && 'data' in (linesField as Record<string, unknown>)) {
                const dataField = (linesField as Record<string, unknown>)['data']
                if (Array.isArray(dataField)) lineItem = dataField[0]
              }
              type BillingInvoiceInsert = {
                user_id: string
                stripe_invoice_id: string
                amount_paid: number
                currency?: string | null
                status?: string | null
                invoice_pdf?: string | null
                created_at?: string
                description?: string | null
                period_start?: string | null
                period_end?: string | null
              }
              const billingInvoice: BillingInvoiceInsert = {
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
              }
              await upsertBillingInvoice(billingInvoice)
            }
          }
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const rawStatus = getStringField(subscription, 'status')
        const allowedStatuses = ['active', 'canceled', 'past_due', 'trial']
        const status = rawStatus && allowedStatuses.includes(rawStatus) ? (rawStatus as Database['public']['Tables']['user_subscriptions']['Row']['status']) : null

        // Check if there's a scheduled update (downgrade)
        // If the subscription is now active and matches the "next" plan, we should clear the next_plan fields
        // But we don't have easy access to the plan ID mapping here without querying DB.
        // For now, just update the status and dates.
        
        // If the update was a phase transition (schedule completed), we might want to clear next_plan_id
        // We can check if cancel_at_period_end is false, meaning no pending cancellation.
        
        const cps2 = getNumberField(subscription, 'current_period_start')
        const cpe2 = getNumberField(subscription, 'current_period_end')
        const updateData: Database['public']['Tables']['user_subscriptions']['Update'] = {
          status: status,
          current_period_start: cps2 ? new Date(cps2 * 1000).toISOString() : null,
          current_period_end: cpe2 ? new Date(cpe2 * 1000).toISOString() : null
        }

        // If the subscription is active and not canceling, we might assume the transition happened
        // Ideally we check the plan ID.
        // Let's fetch the current plan from DB to compare? No, too expensive.
        // Let's just update the core fields.
        
        await createService()
          .from('user_subscriptions')
          .update(updateData)
          .eq('stripe_subscription_id', subscription.id)
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = getStringField(invoice, 'subscription')
        const customerId = getStringField(invoice, 'customer')
        
          // Find user by subscription ID first (helpers return { data } shape)
          let { data: sub } = await findUserSubscriptionByStripeSubscriptionId(subscriptionId)
          // Fallback: Find by customer ID if subscription ID lookup failed
          if (!sub && customerId) {
            const { data: subByCustomer } = await findUserSubscriptionByCustomerId(customerId)
            sub = subByCustomer
          }

        if (sub) {
          const lineItem = invoice.lines.data[0]
          const userIdFromSub = (sub as { user_id?: string })?.user_id
          if (userIdFromSub) {
            type BillingInvoiceInsert = {
              user_id: string
              stripe_invoice_id: string
              amount_paid: number
              currency?: string | null
              status?: string | null
              invoice_pdf?: string | null
              created_at?: string
              description?: string | null
              period_start?: string | null
              period_end?: string | null
            }
            const billingInvoice: BillingInvoiceInsert = {
              user_id: userIdFromSub,
              stripe_invoice_id: invoice.id,
              amount_paid: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: invoice.status,
              invoice_pdf: invoice.invoice_pdf,
              created_at: new Date(invoice.created * 1000).toISOString(),
              description: lineItem?.description || 'Subscription',
              period_start: lineItem?.period?.start ? new Date(lineItem.period.start * 1000).toISOString() : null,
              period_end: lineItem?.period?.end ? new Date(lineItem.period.end * 1000).toISOString() : null
            }
              await upsertBillingInvoice(billingInvoice)
          }
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
