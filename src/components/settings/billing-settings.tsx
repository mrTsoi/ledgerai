'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Check, X, AlertCircle, Download, FileInput, Phone, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useSubscription } from '@/hooks/use-subscription'
import { importInvoiceToTransactions } from '@/app/actions/billing-actions'
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useLiterals } from '@/hooks/use-literals'
import { AvailablePlans } from '@/components/subscription/available-plans'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

interface ContactConfig {
  whatsapp: string
  email: string
}

export function BillingSettings() {
  const lt = useLiterals()
  const { subscription, loading: subLoading, refreshSubscription } = useSubscription()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [contactConfig, setContactConfig] = useState<ContactConfig>({ whatsapp: '', email: '' })
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
  const [purchaseModal, setPurchaseModal] = useState<null | {
    kind: 'success' | 'updated' | 'scheduled' | 'canceled'
    previousPlanName?: string | null
    previousCycle?: 'month' | 'year' | null
    newPlanName?: string | null
    newCycle?: 'month' | 'year' | null
    effectiveDate?: string | null
    nextBillingDate?: string | null
  }>(null)
  const [inlineChangeBanner, setInlineChangeBanner] = useState<null | {
    previousPlanName?: string | null
    previousCycle?: 'month' | 'year' | null
    newPlanName?: string | null
    newCycle?: 'month' | 'year' | null
    effectiveDate?: string | null
    isScheduled: boolean
  }>(null)
  const supabase = useMemo(() => createClient(), [])

  const inferInterval = (sub: any): 'month' | 'year' => {
    if (sub?.current_period_start && sub?.current_period_end) {
      const dur = new Date(sub.current_period_end).getTime() - new Date(sub.current_period_start).getTime()
      return dur > 40 * 24 * 60 * 60 * 1000 ? 'year' : 'month'
    }
    return 'month'
  }

  const formatCycle = (cycle: 'month' | 'year' | null | undefined) => {
    if (!cycle) return ''
    return cycle === 'year' ? lt('Yearly') : lt('Monthly')
  }

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return lt('Unlimited')
    const gb = bytes / (1024 * 1024 * 1024)
    return lt('{gb} GB', { gb })
  }

  const formatPrice = (price: number | null) => {
    if (price === 0 || price === null) return lt('Free')
    return `$${price}`
  }

  // Determine current interval based on period duration (approx > 40 days = year)
  const currentInterval = subscription?.current_period_start && subscription?.current_period_end
    ? (new Date(subscription.current_period_end).getTime() - new Date(subscription.current_period_start).getTime()) > 40 * 24 * 60 * 60 * 1000
      ? 'year'
      : 'month'
    : 'month'

  const fetchContactConfig = useCallback(async () => {
    const { data } = await (supabase
      .from('system_settings') as any)
      .select('setting_value')
      .eq('setting_key', 'contact_sales_config')
      .single()
    
    if (data?.setting_value) {
      setContactConfig(data.setting_value as ContactConfig)
    }
  }, [supabase])

  const fetchInvoices = useCallback(async () => {
    const { data: invoicesData } = await supabase
      .from('billing_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (invoicesData) {
      // Check for existing transactions
      const stripeInvoiceIds = invoicesData.map((inv: any) => inv.stripe_invoice_id).filter(Boolean)
      
      let importedIds = new Set()
      if (stripeInvoiceIds.length > 0) {
        const { data: transactions } = await (supabase
          .from('transactions') as any)
          .select('reference_number')
          .in('reference_number', stripeInvoiceIds)
          .neq('status', 'VOID')
        
        if (transactions) {
          transactions.forEach((t: any) => importedIds.add(t.reference_number))
        }
      }

      const invoicesWithStatus = invoicesData.map((inv: any) => ({
        ...inv,
        is_imported: importedIds.has(inv.stripe_invoice_id)
      }))
      
      setInvoices(invoicesWithStatus)
    }
  }, [supabase])

  const handleImport = async (invoiceId: string) => {
    try {
      setImporting(invoiceId)
      const result = await importInvoiceToTransactions(invoiceId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(lt('Invoice imported successfully as an expense!'))
      }
    } catch (error: any) {
      console.error('Import error:', error)
      toast.error(lt('Failed to import invoice: {message}', { message: error.message }))
    } finally {
      setImporting(null)
    }
  }

  const fetchPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true })

      if (error) throw error
      setPlans(data || [])
    } catch (error) {
      console.error('Error fetching plans:', error)
    } finally {
      setLoadingPlans(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchPlans()
    fetchInvoices()
    fetchContactConfig()
  }, [fetchPlans, fetchInvoices, fetchContactConfig])

  useEffect(() => {
    // Post-checkout UX: show a clear confirmation and refresh subscription + invoices.
    // We keep tab/other params intact, and remove only the checkout-related ones.
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success') === 'true'
    const canceled = params.get('canceled') === 'true'
    const updated = params.get('updated') === 'true'
    const scheduled = params.get('change') === 'scheduled' || params.get('downgrade') === 'scheduled'

    if (!success && !canceled && !updated && !scheduled) return

    const previousPlanName = subscription?.plan_name || null
    const previousCycle = subscription ? inferInterval(subscription) : null

    ;(async () => {
      try {
        const nextSub = await refreshSubscription()
        await fetchInvoices()

        const currentCycle = nextSub ? inferInterval(nextSub) : null
        const nextBillingDate = nextSub?.current_period_end || null

        if (canceled) {
          setPurchaseModal({
            kind: 'canceled',
            previousPlanName,
            previousCycle,
            newPlanName: previousPlanName,
            newCycle: previousCycle,
          })
          setPurchaseModalOpen(true)
          setInlineChangeBanner(null)
          return
        }

        if (scheduled) {
          const nextPlanName = nextSub?.next_plan_name || nextSub?.plan_name || null
          const nextCycle = (nextSub?.next_billing_interval as any) || currentCycle
          const effectiveDate = nextSub?.next_plan_start_date || nextSub?.current_period_end || null

          setPurchaseModal({
            kind: 'scheduled',
            previousPlanName,
            previousCycle,
            newPlanName: nextPlanName,
            newCycle: nextCycle,
            effectiveDate,
            nextBillingDate,
          })
          setPurchaseModalOpen(true)
          setInlineChangeBanner({
            previousPlanName,
            previousCycle,
            newPlanName: nextPlanName,
            newCycle: nextCycle,
            effectiveDate,
            isScheduled: true,
          })
          return
        }

        // Immediate purchase/update
        const newPlanName = nextSub?.plan_name || null
        const newCycle = currentCycle
        setPurchaseModal({
          kind: updated ? 'updated' : 'success',
          previousPlanName,
          previousCycle,
          newPlanName,
          newCycle,
          effectiveDate: null,
          nextBillingDate,
        })
        setPurchaseModalOpen(true)
        setInlineChangeBanner({
          previousPlanName,
          previousCycle,
          newPlanName,
          newCycle,
          effectiveDate: null,
          isScheduled: false,
        })
      } finally {
        const url = new URL(window.location.href)
        url.searchParams.delete('success')
        url.searchParams.delete('canceled')
        url.searchParams.delete('updated')
        url.searchParams.delete('change')
        url.searchParams.delete('downgrade')

        const qs = url.searchParams.toString()
        window.history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`)
      }
    })()
  }, [fetchInvoices, refreshSubscription, subscription])

  const handleSelectPlan = async (plan: SubscriptionPlan, interval: 'month' | 'year') => {
    try {
      setUpgrading(plan.id)

      const monthly = plan.price_monthly ?? 0
      if (monthly === 0) {
        const res = await fetch('/api/subscription/ensure-free', { method: 'POST' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || lt('Failed to select Free plan'))
        await refreshSubscription()
        toast.success(lt('Subscription plan updated'))
        return
      }

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: plan.id,
          interval,
          returnUrl: window.location.origin + window.location.pathname,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      } else {
        throw new Error(lt('No checkout URL returned'))
      }
    } catch (error: any) {
      console.error('Upgrade error:', error)
      toast.error(lt('Failed to start upgrade: {message}', { message: error.message }))
    } finally {
      setUpgrading(null)
    }
  }

  if (subLoading || loadingPlans) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="space-y-8">
      <Dialog open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {purchaseModal?.kind === 'scheduled'
                ? lt('Change scheduled')
                : purchaseModal?.kind === 'updated'
                  ? lt('Subscription updated')
                  : purchaseModal?.kind === 'canceled'
                    ? lt('Checkout canceled')
                    : lt('Purchase confirmed')}
            </DialogTitle>
            <DialogDescription>
              {purchaseModal?.kind === 'scheduled'
                ? lt('Your changes will take effect at the end of your current billing period.')
                : purchaseModal?.kind === 'canceled'
                  ? lt('No charges were made.')
                  : lt('Your subscription has been updated successfully.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {(purchaseModal?.previousPlanName || purchaseModal?.newPlanName) && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{lt('Plan')}</span>
                <span className="text-right font-medium">
                  {(purchaseModal?.previousPlanName ? lt(String(purchaseModal.previousPlanName)) : '—')}
                  {'  →  '}
                  {(purchaseModal?.newPlanName ? lt(String(purchaseModal.newPlanName)) : '—')}
                </span>
              </div>
            )}

            {(purchaseModal?.previousCycle || purchaseModal?.newCycle) && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{lt('Billing cycle')}</span>
                <span className="text-right font-medium">
                  {formatCycle(purchaseModal?.previousCycle || null) || '—'}
                  {'  →  '}
                  {formatCycle(purchaseModal?.newCycle || null) || '—'}
                </span>
              </div>
            )}

            {purchaseModal?.kind === 'scheduled' && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{lt('Effective')}</span>
                <span className="text-right font-medium">
                  {purchaseModal?.effectiveDate ? new Date(purchaseModal.effectiveDate).toLocaleDateString() : lt('End of current period')}
                </span>
              </div>
            )}

            {purchaseModal?.nextBillingDate && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{lt('Next billing date')}</span>
                <span className="text-right font-medium">
                  {new Date(purchaseModal.nextBillingDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setPurchaseModalOpen(false)}>{lt('Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Current Usage */}
      <Card>
        <CardHeader>
          <CardTitle>{lt('Current Subscription')}</CardTitle>
          <CardDescription>{lt('Your plan and usage limits')}</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-blue-900">{subscription?.plan_name ? lt(String(subscription.plan_name)) : ''}</h3>
                  <Badge variant={subscription.status === 'active' ? 'default' : subscription.status === 'pending' ? 'secondary' : 'destructive'} className="text-sm">
                    {subscription.status?.toString().toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-blue-700 mb-2">
                  {subscription.status === 'active'
                    ? lt('Active')
                    : subscription.status === 'pending'
                      ? lt('Pending Confirmation')
                      : lt('Inactive')}
                </p>
                <p className="text-2xl font-bold text-blue-800">
                  {formatPrice(subscription.price_monthly)}
                  <span className="text-base font-semibold">{lt('/mo')}</span>
                </p>
                
                {subscription.current_period_start && subscription.current_period_end && (
                  <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-blue-800">
                    <p className="font-semibold mb-1">{lt('Billing Period')}</p>
                    <p>{lt('Start:')} {new Date(subscription.current_period_start).toLocaleDateString()}</p>
                    <p>{lt('End:')} {new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                )}

                {inlineChangeBanner && (
                  <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-amber-800 bg-amber-50 p-2 rounded">
                    <p className="font-semibold mb-1">
                      {inlineChangeBanner.isScheduled
                        ? lt('Change scheduled (effective at period end)')
                        : lt('Recent change')}
                    </p>
                    <p>
                      {lt('Plan:')} <strong>{inlineChangeBanner.previousPlanName ? lt(String(inlineChangeBanner.previousPlanName)) : '—'}</strong> →{' '}
                      <strong>{inlineChangeBanner.newPlanName ? lt(String(inlineChangeBanner.newPlanName)) : '—'}</strong>
                    </p>
                    <p>
                      {lt('Billing cycle:')} <strong>{formatCycle(inlineChangeBanner.previousCycle || null) || '—'}</strong> → <strong>{formatCycle(inlineChangeBanner.newCycle || null) || '—'}</strong>
                    </p>
                    {inlineChangeBanner.isScheduled && (
                      <p>
                        {lt('After your current billing period ends (on {date}), your changes will take effect.', {
                          date: inlineChangeBanner.effectiveDate
                            ? new Date(inlineChangeBanner.effectiveDate).toLocaleDateString()
                            : new Date(subscription.current_period_end).toLocaleDateString(),
                        })}
                      </p>
                    )}
                  </div>
                )}

                {(subscription.next_plan_start_date || (subscription as any)?.next_billing_interval) && (
                  (() => {
                    const nextInterval = subscription.next_billing_interval || null
                    const nextBillingLabel = nextInterval === 'year' ? lt('Yearly') : nextInterval === 'month' ? lt('Monthly') : null
                    const planChange = Boolean(subscription.next_plan_name && subscription.next_plan_name !== subscription.plan_name)
                    const cycleChange = Boolean(nextInterval && nextInterval !== currentInterval)
                    const effectiveDate = subscription.next_plan_start_date || subscription.current_period_end
                    const effectiveDateLabel = effectiveDate ? new Date(effectiveDate).toLocaleDateString() : null

                    const parts: string[] = []
                    if (planChange && subscription.next_plan_name) parts.push(lt('switch to {plan}', { plan: lt(String(subscription.next_plan_name)) }))
                    if (cycleChange && nextBillingLabel) parts.push(lt('switch billing cycle to {cycle}', { cycle: nextBillingLabel }))

                    const afterText = effectiveDateLabel
                      ? lt('After your current billing period ends (on {date}), ', { date: effectiveDateLabel })
                      : lt('After your current billing period ends, ')

                    const willText = parts.length > 0
                      ? lt('your subscription will {actions}.', { actions: parts.join(lt(' and ')) })
                      : lt('your change will take effect.')

                    return (
                      <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-amber-800 bg-amber-50 p-2 rounded">
                        <p className="font-semibold mb-1">{lt('Change scheduled (effective at period end)')}</p>
                        <p>{afterText}{willText}</p>
                      </div>
                    )
                  })()
                )}

                {/* Actions: Complete Purchase if pending, Download latest invoice when available */}
                <div className="mt-4 flex gap-2">
                  {subscription.status === 'pending' && subscription.plan_id && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setUpgrading(subscription.plan_id as string)
                          const response = await fetch('/api/stripe/checkout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ planId: subscription.plan_id, interval: currentInterval, returnUrl: window.location.href })
                          })
                          if (!response.ok) throw new Error(lt('Failed to start checkout'))
                          const { url } = await response.json()
                          if (url) window.location.href = url
                        } catch (e) {
                          console.error('Complete purchase failed', e)
                        } finally {
                          setUpgrading(null)
                        }
                      }}
                      disabled={upgrading !== null}
                    >
                      {upgrading === subscription.plan_id ? <Loader2 className="animate-spin" /> : lt('Complete Purchase')}
                    </Button>
                  )}

                  {invoices.length > 0 && (
                    <a href={invoices[0].invoice_pdf || '#'} target="_blank" rel="noreferrer" className="inline-block">
                      <Button size="sm" variant="outline" title={lt('Download latest invoice')}>
                        <Download className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">{lt('Download Invoice')}</span>
                      </Button>
                    </a>
                  )}
                </div>
              </div>
              
              <div className="space-y-4 col-span-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{lt('Companies')}</span>
                    <span className="font-medium">
                      {subscription.current_tenants} / {subscription.max_tenants === -1 ? lt('Unlimited') : subscription.max_tenants}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: subscription.max_tenants === -1 ? '5%' : `${Math.min((subscription.current_tenants / subscription.max_tenants) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{lt('Documents')}</span>
                    <span className="font-medium">
                      {subscription.current_documents} / {subscription.max_documents === -1 ? lt('Unlimited') : subscription.max_documents.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500" 
                      style={{ width: subscription.max_documents === -1 ? '5%' : `${Math.min((subscription.current_documents / subscription.max_documents) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{lt('Storage')}</span>
                    <span className="font-medium">
                      {(subscription.current_storage_bytes / 1024 / 1024).toFixed(1)} MB / {(subscription.max_storage_bytes / 1024 / 1024 / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ width: subscription.max_storage_bytes === -1 ? '1%' : `${Math.min((subscription.current_storage_bytes / subscription.max_storage_bytes) * 100, 100)}%` }} 
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>{lt('No active subscription found. Please select a plan below.')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>{lt('Billing History')}</CardTitle>
          <CardDescription>{lt('Recent invoices and payments')}</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{new Date(invoice.created_at).toLocaleDateString()}</p>
                    <p className="text-sm font-semibold text-gray-900">{invoice.description || lt('Subscription')}</p>
                    {invoice.period_start && invoice.period_end && (
                      <p className="text-xs text-gray-500">
                        {new Date(invoice.period_start).toLocaleDateString()} - {new Date(invoice.period_end).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 capitalize">{invoice.status}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold">${invoice.amount_paid.toFixed(2)}</span>
                    
                    <div className="flex gap-2">
                      {invoice.invoice_pdf && (
                        <a 
                          href={invoice.invoice_pdf} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                          title={lt('Download PDF')}
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">PDF</span>
                        </a>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`h-8 px-2 ${invoice.is_imported ? 'text-green-600' : 'text-gray-600'}`}
                        onClick={() => handleImport(invoice.id)}
                        disabled={importing === invoice.id}
                        title={invoice.is_imported ? lt('Already imported (Click to re-import)') : lt('Import to Expenses')}
                      >
                        {importing === invoice.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : invoice.is_imported ? (
                           <div className="flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            <span className="hidden sm:inline">{lt('Imported')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <FileInput className="w-4 h-4" />
                            <span className="hidden sm:inline">{lt('Import')}</span>
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
              <p>{lt('No billing history available yet.')}</p>
              <p className="text-sm mt-1">{lt('Invoices will appear here after your first payment.')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <AvailablePlans
        plans={plans}
        loading={loadingPlans}
        subscription={subscription}
        upgradingPlanId={upgrading}
        onSelectPlan={handleSelectPlan}
        contactConfig={contactConfig}
      />
    </div>
  )
}
