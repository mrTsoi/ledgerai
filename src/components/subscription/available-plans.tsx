'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Check, Loader2, Mail, Phone, X } from 'lucide-react'
import type { Database } from '@/types/database.types'
import type { SubscriptionDetails } from '@/hooks/use-subscription'
import { FEATURE_DEFINITIONS, isFeatureEnabled } from '@/lib/subscription/features'
import { useLiterals } from '@/hooks/use-literals'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

export interface ContactConfig {
  whatsapp: string
  email: string
}

export function AvailablePlans(props: {
  plans: SubscriptionPlan[]
  loading?: boolean
  subscription: SubscriptionDetails | null
  upgradingPlanId: string | null
  onSelectPlan: (plan: SubscriptionPlan, interval: 'month' | 'year') => Promise<void> | void
  contactConfig?: ContactConfig | null
}) {
  const lt = useLiterals()
  const { plans, loading = false, subscription, upgradingPlanId, onSelectPlan, contactConfig } = props

  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month')

  const inferInterval = (sub: SubscriptionDetails | null): 'month' | 'year' => {
    if (sub?.current_period_start && sub?.current_period_end) {
      const dur = new Date(sub.current_period_end).getTime() - new Date(sub.current_period_start).getTime()
      return dur > 40 * 24 * 60 * 60 * 1000 ? 'year' : 'month'
    }
    return 'month'
  }

  const currentInterval = useMemo(() => inferInterval(subscription), [subscription])

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return lt('Unlimited')
    const gb = bytes / (1024 * 1024 * 1024)
    return lt('{gb} GB', { gb })
  }

  const formatPrice = (price: number | null) => {
    if (price === 0 || price === null) return lt('Free')
    return `$${price}`
  }

  const getFeaturesList = (plan: SubscriptionPlan) => {
    const features: { text: string; included: boolean; isNew?: boolean }[] = []

    features.push({
      text:
        plan.max_tenants === -1
          ? lt('Unlimited Tenants')
          : plan.max_tenants === 1
            ? lt('1 Tenant')
            : lt('{count} Tenants', { count: plan.max_tenants }),
      included: true,
    })

    features.push({
      text:
        plan.max_documents === -1
          ? lt('Unlimited Documents')
          : lt('{count} Documents/mo', { count: plan.max_documents }),
      included: true,
    })

    features.push({
      text: lt('{storage} Storage', { storage: formatStorage(plan.max_storage_bytes) }),
      included: true,
    })

    const featureFlags = (plan.features as any) || {}
    for (const def of FEATURE_DEFINITIONS) {
      features.push({
        text: lt(def.label),
        included: isFeatureEnabled(featureFlags, def.key),
        isNew: def.isNew,
      })
    }

    return features
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{lt('Available Plans')}</h2>
        <div className="flex items-center space-x-2">
          <Label htmlFor="billing-cycle" className={billingCycle === 'month' ? 'font-bold' : ''}>
            {lt('Monthly')}
          </Label>
          <Switch
            id="billing-cycle"
            checked={billingCycle === 'year'}
            onCheckedChange={(checked) => setBillingCycle(checked ? 'year' : 'month')}
          />
          <Label htmlFor="billing-cycle" className={billingCycle === 'year' ? 'font-bold' : ''}>
            {lt('Yearly')} <span className="text-green-600 text-xs">{lt('(Save ~20%)')}</span>
          </Label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {lt('Loading…')}
        </div>
      ) : plans.length === 0 ? (
        <div className="text-sm text-muted-foreground">{lt('No subscription plans found.')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isSamePlan = subscription?.plan_id
              ? subscription.plan_id === plan.id
              : (subscription?.plan_name || '').toLowerCase() === (plan.name || '').toLowerCase()

            const isCurrent = isSamePlan && currentInterval === billingCycle
            const currentPrice = subscription?.price_monthly || 0

            const price =
              billingCycle === 'year'
                ? plan.price_yearly
                  ? plan.price_yearly / 12
                  : plan.price_monthly || 0
                : plan.price_monthly || 0

            const displayPrice = billingCycle === 'year' ? plan.price_yearly || 0 : plan.price_monthly || 0

            const isUpgrade = (plan.price_monthly || 0) > currentPrice
            const isDowngrade = (plan.price_monthly || 0) < currentPrice
            const isEnterprise = (plan.name || '').toLowerCase().includes('enterprise')

            let buttonText = lt('Switch Plan')
            if (isCurrent) {
              buttonText = lt('Current Plan')
            } else if (isSamePlan) {
              if (billingCycle === 'year' && currentInterval === 'month') buttonText = lt('Upgrade to Yearly')
              else if (billingCycle === 'month' && currentInterval === 'year') buttonText = lt('Switch to Monthly')
            } else if (isUpgrade) {
              buttonText = lt('Upgrade')
            } else if (isDowngrade) {
              buttonText = lt('Downgrade')
            }

            // Calculate estimated proration if upgrading
            let estimatedProration: number | null = null
            if (isUpgrade && subscription?.current_period_end && subscription?.current_period_start) {
              const now = new Date().getTime()
              const start = new Date(subscription.current_period_start).getTime()
              const end = new Date(subscription.current_period_end).getTime()
              const totalDuration = end - start
              const remainingDuration = end - now

              if (remainingDuration > 0 && totalDuration > 0) {
                const currentPlanPrice =
                  currentInterval === 'year'
                    ? subscription.price_monthly * 12
                    : subscription.price_monthly

                const unusedValue = (remainingDuration / totalDuration) * currentPlanPrice
                const newPlanPrice = displayPrice

                if (unusedValue > 1) {
                  estimatedProration = Math.max(0, newPlanPrice - unusedValue)
                }
              }
            }

            const isBusy = upgradingPlanId === plan.id

            return (
              <Card key={plan.id} className={`flex flex-col ${isCurrent ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
                <CardHeader>
                  <CardTitle>{plan.name ? lt(String(plan.name)) : ''}</CardTitle>
                  <CardDescription>{plan.description ? lt(String(plan.description)) : ''}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1">
                  <div className="mb-4">
                    {isEnterprise ? (
                      <span className="text-3xl font-bold">{lt('Contact Sales')}</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">{formatPrice(displayPrice)}</span>
                        {displayPrice > 0 && (
                          <span className="text-gray-500">/{billingCycle === 'year' ? lt('year') : lt('month')}</span>
                        )}
                        {billingCycle === 'year' && displayPrice > 0 && (
                          <div className="text-sm text-gray-500 mt-1">
                            {lt('(${price}/mo billed yearly)', { price: price.toFixed(2) })}
                          </div>
                        )}
                        {estimatedProration !== null && (
                          <div className="mt-2 text-xs bg-green-50 text-green-700 p-2 rounded border border-green-100">
                            <strong>{lt('Upgrade Offer:')}</strong>{' '}
                            {lt('Pay only ~${amount} today (prorated)', { amount: estimatedProration.toFixed(2) })}
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
                            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                              {lt('New')}
                            </span>
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
                        <Button className="w-full" variant="outline">
                          {lt('Contact Sales')}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{lt('Contact Enterprise Sales')}</DialogTitle>
                          <DialogDescription>
                            {lt('Get in touch with our team to discuss a custom plan for your organization.')}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          {!!contactConfig?.whatsapp && (
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
                                <div className="font-semibold">{lt('WhatsApp')}</div>
                                <div className="text-sm text-gray-500">{lt('Chat with us instantly')}</div>
                              </div>
                            </a>
                          )}

                          {!!contactConfig?.email && (
                            <a
                              href={`mailto:${contactConfig.email}`}
                              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="bg-blue-100 p-2 rounded-full">
                                <Mail className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <div className="font-semibold">{lt('Email')}</div>
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
                      variant={isCurrent ? 'outline' : 'default'}
                      disabled={isCurrent || upgradingPlanId !== null}
                      onClick={() => onSelectPlan(plan, billingCycle)}
                    >
                      {isBusy ? <Loader2 className="animate-spin" /> : buttonText}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
