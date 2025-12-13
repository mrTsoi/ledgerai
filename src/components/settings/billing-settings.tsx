'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Check, X, AlertCircle, Download, FileInput, Phone, Mail } from 'lucide-react'
import { useSubscription } from '@/hooks/use-subscription'
import { importInvoiceToTransactions } from '@/app/actions/billing-actions'
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { FEATURE_DEFINITIONS, isFeatureEnabled } from '@/lib/subscription/features'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

interface ContactConfig {
  whatsapp: string
  email: string
}

export function BillingSettings() {
  const { subscription, loading: subLoading, refreshSubscription } = useSubscription()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month')
  const [invoices, setInvoices] = useState<any[]>([])
  const [contactConfig, setContactConfig] = useState<ContactConfig>({ whatsapp: '', email: '' })
  const supabase = useMemo(() => createClient(), [])

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return 'Unlimited'
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb} GB`
  }

  const formatPrice = (price: number | null) => {
    if (price === 0 || price === null) return 'Free'
    return `$${price}`
  }

  const getFeaturesList = (plan: SubscriptionPlan) => {
    const features: { text: string; included: boolean; isNew?: boolean }[] = []

    // Limits
    features.push({
      text: plan.max_tenants === -1 ? 'Unlimited Tenants' : `${plan.max_tenants} Tenant${plan.max_tenants > 1 ? 's' : ''}`,
      included: true
    })
    features.push({
      text: plan.max_documents === -1 ? 'Unlimited Documents' : `${plan.max_documents.toLocaleString()} Documents/mo`,
      included: true
    })
    features.push({
      text: `${formatStorage(plan.max_storage_bytes)} Storage`,
      included: true
    })

    const featureFlags = (plan.features as any) || {}
    for (const def of FEATURE_DEFINITIONS) {
      features.push({
        text: def.label,
        included: isFeatureEnabled(featureFlags, def.key),
        isNew: def.isNew,
      })
    }

    return features
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
        toast.success('Invoice imported successfully as an expense!')
      }
    } catch (error: any) {
      console.error('Import error:', error)
      toast.error('Failed to import invoice: ' + error.message)
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

  const handleUpgrade = async (planId: string) => {
    try {
      setUpgrading(planId)
      
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          interval: billingCycle,
          returnUrl: window.location.origin + window.location.pathname
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
        throw new Error('No checkout URL returned')
      }
    } catch (error: any) {
      console.error('Upgrade error:', error)
      toast.error('Failed to start upgrade: ' + error.message)
    } finally {
      setUpgrading(null)
    }
  }

  if (subLoading || loadingPlans) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="space-y-8">
      {/* Current Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>Your plan and usage limits</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="font-semibold text-blue-900">{subscription.plan_name}</h3>
                <p className="text-sm text-blue-700 mb-2">{subscription.status === 'active' ? 'Active' : 'Inactive'}</p>
                <p className="text-2xl font-bold text-blue-800">${subscription.price_monthly}/mo</p>
                
                {subscription.current_period_start && subscription.current_period_end && (
                  <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-blue-800">
                    <p className="font-semibold mb-1">Billing Period</p>
                    <p>Start: {new Date(subscription.current_period_start).toLocaleDateString()}</p>
                    <p>End: {new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                )}

                {subscription.next_plan_name && subscription.next_plan_start_date && (
                  <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    <p className="font-semibold mb-1">Scheduled Change</p>
                    <p>Switching to <strong>{subscription.next_plan_name}</strong> on {new Date(subscription.next_plan_start_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              
              <div className="space-y-4 col-span-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Companies</span>
                    <span className="font-medium">
                      {subscription.current_tenants} / {subscription.max_tenants === -1 ? 'Unlimited' : subscription.max_tenants}
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
                    <span>Documents</span>
                    <span className="font-medium">
                      {subscription.current_documents} / {subscription.max_documents === -1 ? 'Unlimited' : subscription.max_documents.toLocaleString()}
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
                    <span>Storage</span>
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
              <p>No active subscription found. Please select a plan below.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>Recent invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="space-y-4">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{new Date(invoice.created_at).toLocaleDateString()}</p>
                    <p className="text-sm font-semibold text-gray-900">{invoice.description || 'Subscription'}</p>
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
                          title="Download PDF"
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
                        title={invoice.is_imported ? "Already imported (Click to re-import)" : "Import to Expenses"}
                      >
                        {importing === invoice.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : invoice.is_imported ? (
                           <div className="flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            <span className="hidden sm:inline">Imported</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <FileInput className="w-4 h-4" />
                            <span className="hidden sm:inline">Import</span>
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
              <p>No billing history available yet.</p>
              <p className="text-sm mt-1">Invoices will appear here after your first payment.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Available Plans</h2>
          <div className="flex items-center space-x-2">
            <Label htmlFor="billing-cycle" className={billingCycle === 'month' ? 'font-bold' : ''}>Monthly</Label>
            <Switch
              id="billing-cycle"
              checked={billingCycle === 'year'}
              onCheckedChange={(checked) => setBillingCycle(checked ? 'year' : 'month')}
            />
            <Label htmlFor="billing-cycle" className={billingCycle === 'year' ? 'font-bold' : ''}>Yearly <span className="text-green-600 text-xs">(Save ~20%)</span></Label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map(plan => {
            const isSamePlan = subscription?.plan_name === plan.name
            const isCurrent = isSamePlan && currentInterval === billingCycle
            const currentPrice = subscription?.price_monthly || 0
            
            // Calculate price based on cycle
            const price = billingCycle === 'year' 
              ? (plan.price_yearly ? plan.price_yearly / 12 : (plan.price_monthly || 0)) 
              : (plan.price_monthly || 0)
              
            const displayPrice = billingCycle === 'year' 
              ? (plan.price_yearly || 0)
              : (plan.price_monthly || 0)

            const isUpgrade = (plan.price_monthly || 0) > currentPrice
            const isDowngrade = (plan.price_monthly || 0) < currentPrice
            const isEnterprise = plan.name.toLowerCase().includes('enterprise')
            
            let buttonText = 'Switch Plan'
            if (isCurrent) {
              buttonText = 'Current Plan'
            } else if (isSamePlan) {
              if (billingCycle === 'year' && currentInterval === 'month') buttonText = 'Upgrade to Yearly'
              else if (billingCycle === 'month' && currentInterval === 'year') buttonText = 'Switch to Monthly'
            } else if (isUpgrade) {
              buttonText = 'Upgrade'
            } else if (isDowngrade) {
              buttonText = 'Downgrade'
            }

            // Calculate estimated proration if upgrading
            let estimatedProration = null
            if (isUpgrade && subscription?.current_period_end && subscription?.current_period_start) {
              const now = new Date().getTime()
              const start = new Date(subscription.current_period_start).getTime()
              const end = new Date(subscription.current_period_end).getTime()
              const totalDuration = end - start
              const remainingDuration = end - now
              
              if (remainingDuration > 0 && totalDuration > 0) {
                const currentPlanPrice = currentInterval === 'year' 
                  ? (subscription.price_monthly * 12) // Approximation if we don't have yearly price in subscription object
                  : subscription.price_monthly
                
                const unusedValue = (remainingDuration / totalDuration) * currentPlanPrice
                const newPlanPrice = displayPrice
                
                // Only show if there is a significant credit
                if (unusedValue > 1) {
                  estimatedProration = Math.max(0, newPlanPrice - unusedValue)
                }
              }
            }

            return (
              <Card key={plan.id} className={`flex flex-col ${isCurrent ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-4">
                    {isEnterprise ? (
                      <span className="text-3xl font-bold">Contact Sales</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">{formatPrice(displayPrice)}</span>
                        {displayPrice > 0 && <span className="text-gray-500">/{billingCycle}</span>}
                        {billingCycle === 'year' && displayPrice > 0 && (
                          <div className="text-sm text-gray-500 mt-1">
                            (${price.toFixed(2)}/mo billed yearly)
                          </div>
                        )}
                        {estimatedProration !== null && (
                          <div className="mt-2 text-xs bg-green-50 text-green-700 p-2 rounded border border-green-100">
                            <strong>Upgrade Offer:</strong> Pay only ~${estimatedProration.toFixed(2)} today (prorated)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {getFeaturesList(plan).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {feature.included ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <X className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={feature.included ? 'text-gray-900' : 'text-gray-400'}>
                          {feature.text}
                          {(feature as any).isNew && feature.included && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">New</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isEnterprise ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button className="w-full" variant="outline">Contact Sales</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Contact Enterprise Sales</DialogTitle>
                          <DialogDescription>
                            Get in touch with our team to discuss a custom plan for your organization.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          {contactConfig.whatsapp && (
                            <a 
                              href={`https://wa.me/${contactConfig.whatsapp}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="bg-green-100 p-2 rounded-full">
                                <Phone className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <div className="font-semibold">WhatsApp</div>
                                <div className="text-sm text-gray-500">Chat with us instantly</div>
                              </div>
                            </a>
                          )}
                          
                          {contactConfig.email && (
                            <a 
                              href={`mailto:${contactConfig.email}`}
                              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="bg-blue-100 p-2 rounded-full">
                                <Mail className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-semibold">Email</div>
                                <div className="text-sm text-gray-500">{contactConfig.email}</div>
                              </div>
                            </a>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Button 
                      className="w-full" 
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent || upgrading !== null}
                      onClick={() => handleUpgrade(plan.id)}
                    >
                      {upgrading === plan.id ? <Loader2 className="animate-spin" /> : buttonText}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
