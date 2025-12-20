import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe, getStripeConfig, retrieveSubscription, retrieveInvoice } from '@/lib/stripe'
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
    // Invalid signatures are a normal/expected outcome for bad or replayed requests.
    // Log to stdout (not stderr) to keep CI/test output clean while still leaving a breadcrumb.
    console.info(`Webhook signature verification failed: ${error.message}`)
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

  // When running in mock mode, capture the REST insert result so tests
  // can assert a deterministic confirmation response.
  let mockInsertResult: any = null

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
          // When running against stripe-mock in tests, avoid making server-side
          // requests back to Stripe. Use metadata or defaults instead so tests are deterministic.
          if (process.env.STRIPE_USE_MOCK === 'true') {
            console.log('[webhook] STRIPE_USE_MOCK=true — skipping retrieveSubscription for', session.subscription)
          } else {
            try {
              const subResp = await retrieveSubscription(String(session.subscription))
              const cps = getNumberField(subResp, 'current_period_start')
              const cpe = getNumberField(subResp, 'current_period_end')
              if (cps) currentPeriodStart = new Date(cps * 1000).toISOString()
              if (cpe) currentPeriodEnd = new Date(cpe * 1000).toISOString()
            } catch (e) {
              console.error('Failed to retrieve subscription in webhook:', e)
            }
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
              try {
                console.log('[webhook] Upserting user subscription (pendingToken path):', userSub)
                if (process.env.STRIPE_USE_MOCK === 'true' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
                  // Write directly to the Supabase REST mock when running tests/mocks
                  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '')
                  const r = await fetch(`${supabaseUrl}/rest/v1/user_subscriptions`, {
                    method: 'POST',
                    headers: {
                      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                      'Content-Type': 'application/json',
                      Prefer: 'return=representation'
                    },
                    body: JSON.stringify(userSub)
                  })
                  const up = await r.json()
                  console.log('[webhook] supabase REST insert result:', up)
                  mockInsertResult = up
                } else {
                  const up = await upsertUserSubscription(userSub)
                  console.log('[webhook] upsertUserSubscription result:', up)
                }
              } catch (e) {
                console.error('[webhook] upsertUserSubscription failed:', e)
              }

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
              try {
              // Skip invoice retrieval when using stripe-mock to avoid network flakiness in tests
              let invoice: any = null
              if (process.env.STRIPE_USE_MOCK === 'true') {
                console.log('[webhook] STRIPE_USE_MOCK=true — skipping retrieveInvoice for', session.invoice)
              } else {
                invoice = await retrieveInvoice(String(session.invoice))
              }
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
            } catch (e) {
              console.error('Failed to retrieve invoice in webhook (pendingToken path):', e)
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
          try {
            console.log('[webhook] Upserting user subscription (metadata path):', userSub)
            if (process.env.STRIPE_USE_MOCK === 'true' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
              const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '')
              const r = await fetch(`${supabaseUrl}/rest/v1/user_subscriptions`, {
                method: 'POST',
                headers: {
                  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=representation'
                },
                body: JSON.stringify(userSub)
              })
              const up = await r.json()
              console.log('[webhook] supabase REST insert result:', up)
              mockInsertResult = up
            } else {
              const up = await upsertUserSubscription(userSub)
              console.log('[webhook] upsertUserSubscription result:', up)
            }
          } catch (e) {
            console.error('[webhook] upsertUserSubscription failed:', e)
          }

          // 2. Handle Initial Invoice (Race Condition Fix)
          if (session.invoice) {
            try {
              let invoice: any = null
              if (process.env.STRIPE_USE_MOCK === 'true') {
                console.log('[webhook] STRIPE_USE_MOCK=true — skipping retrieveInvoice for', session.invoice)
              } else {
                invoice = await retrieveInvoice(String(session.invoice))
              }
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
            } catch (e) {
              console.error('Failed to retrieve invoice in webhook (metadata path):', e)
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
        
        // If Stripe says the subscription is deleted, and we had a queued next_plan_id
        // (e.g., downgrade to Free), apply it now so the app immediately reflects the Free plan.
        if (event.type === 'customer.subscription.deleted') {
          const svc = createService()
          const { data: existingRow } = await svc
            .from('user_subscriptions')
            .select('user_id, next_plan_id')
            .eq('stripe_subscription_id', subscription.id)
            .maybeSingle()

          const nextPlanId = (existingRow as any)?.next_plan_id as string | null | undefined

          if (nextPlanId) {
            const nowIso = new Date().toISOString()
            await svc
              .from('user_subscriptions')
              .update({
                plan_id: nextPlanId,
                status: 'active',
                stripe_subscription_id: null,
                current_period_start: nowIso,
                current_period_end: null,
                next_plan_id: null,
                next_plan_start_date: null,
                next_billing_interval: null,
              })
              .eq('stripe_subscription_id', subscription.id)
            break
          }
        }

        const cps2 = getNumberField(subscription, 'current_period_start')
        const cpe2 = getNumberField(subscription, 'current_period_end')
        const updateData: Database['public']['Tables']['user_subscriptions']['Update'] = {
          status: status,
          current_period_start: cps2 ? new Date(cps2 * 1000).toISOString() : null,
          current_period_end: cpe2 ? new Date(cpe2 * 1000).toISOString() : null
        }

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

  // If running in mock mode and we captured an insert result, return it so
  // tests can assert deterministically without polling the DB.
  if (process.env.STRIPE_USE_MOCK === 'true' && mockInsertResult) {
    return NextResponse.json({ success: true, inserted: mockInsertResult }, { status: 200 })
  }

  return new NextResponse(null, { status: 200 })
}
