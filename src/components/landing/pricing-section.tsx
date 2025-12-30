'use client'

import { useState, useEffect, useCallback } from 'react'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X, Loader2, Phone, Mail } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { FEATURE_DEFINITIONS, featureKeyToSlug, isFeatureEnabled } from '@/lib/subscription/features'
import { useLiterals } from '@/hooks/use-literals'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

interface ContactConfig {
  whatsapp: string
  email: string
}

export function PricingSection() {
  const lt = useLiterals()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [contactConfig, setContactConfig] = useState<ContactConfig>({ whatsapp: '', email: '' })

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/public/pricing')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to load pricing')

      setPlans((json?.plans || []) as SubscriptionPlan[])
      setContactConfig((json?.contact_config || { whatsapp: '', email: '' }) as ContactConfig)
    } catch (error) {
      console.error('Error fetching plans:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const formatPrice = (price: number | null) => {
    if (price === 0 || price === null) return lt('Free')
    return `$${price}`
  }

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return lt('Unlimited')
    const gb = bytes / (1024 * 1024 * 1024)
    const gbDisplay = Number.isFinite(gb)
      ? Number.isInteger(gb)
        ? gb.toLocaleString()
        : gb.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : String(gb)
    return lt('{gb} GB', { gb: gbDisplay })
  }

  const getFeaturesList = (plan: SubscriptionPlan) => {
    const features: { text: string; included: boolean; isNew?: boolean; href?: string }[] = []

    // Limits
    features.push({
      text:
        plan.max_tenants === -1
          ? lt('Unlimited Tenants')
          : plan.max_tenants === 1
            ? lt('1 Tenant')
            : lt('{count} Tenants', { count: plan.max_tenants }),
      included: true
    })
    features.push({
      text:
        plan.max_documents === -1
          ? lt('Unlimited Documents')
          : lt('{count} Documents/mo', { count: plan.max_documents.toLocaleString() }),
      included: true
    })
    features.push({
      text: lt('{storage} Storage', { storage: formatStorage(plan.max_storage_bytes) }),
      included: true
    })

    // JSON Features
    const featureFlags = (plan.features || {}) as Record<string, unknown>
    for (const def of FEATURE_DEFINITIONS) {
      features.push({
        text: lt(def.label),
        included: isFeatureEnabled(featureFlags, def.key),
        isNew: def.isNew,
        href: `/features/${featureKeyToSlug(def.key)}`,
      })
    }

    return features
  }

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{lt('Simple, transparent pricing')}</h2>
          <p className="text-lg text-gray-600 mb-8">{lt("Choose the plan that's right for your business.")}</p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingInterval === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>{lt('Monthly')}</span>
            <button
              onClick={() => setBillingInterval(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                billingInterval === 'yearly' ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingInterval === 'yearly' ? 'text-gray-900' : 'text-gray-500'}`}>
              {lt('Yearly')} <span className="text-green-600 font-bold">{lt('(Save 20%)')}</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {plans.map((plan) => {
            // Calculate yearly price dynamically if not set, or use the discount percent
            const discountPercent = plan.yearly_discount_percent || 20
            const monthlyPrice = plan.price_monthly || 0
            const calculatedYearlyPrice = Math.round((monthlyPrice * 12) * (1 - discountPercent / 100))
            
            // Use explicit price_yearly if available, otherwise calculated
            const yearlyPrice = plan.price_yearly ?? calculatedYearlyPrice

            const price = billingInterval === 'monthly' ? (plan.price_monthly || 0) : Math.round(yearlyPrice / 12) // Show monthly equivalent for yearly billing

            const isPopular = plan.name === 'Agency Pro' // Hardcoded for visual pop, or could be a DB flag
            const isEnterprise = plan.name.toLowerCase().includes('enterprise')

            const displayName = plan.name ? lt(String(plan.name)) : ''
            const displayDescription = plan.description ? lt(String(plan.description)) : ''

            return (
              <Card 
                key={plan.id} 
                className={`flex flex-col relative ${isPopular ? 'border-blue-600 shadow-xl scale-105 z-10' : 'hover:shadow-lg transition-shadow'}`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    {lt('Most Popular')}
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{displayName}</CardTitle>
                  <CardDescription>{displayDescription}</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="mb-6">
                    {isEnterprise ? (
                      <span className="text-4xl font-bold">{lt('Contact Sales')}</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">{formatPrice(price)}</span>
                        <span className="text-gray-500">{lt('/mo')}</span>
                        {billingInterval === 'yearly' && price > 0 && (
                          <div className="text-xs text-green-600 font-medium mt-1">
                            {lt('Billed ${amount} yearly (Save {percent}%)', { amount: yearlyPrice, percent: discountPercent })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {getFeaturesList(plan).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        )}
                        <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
                          {feature.href ? (
                            <Link
                              href={feature.href}
                              className={feature.included ? 'hover:underline' : ''}
                            >
                              {feature.text}
                            </Link>
                          ) : (
                            feature.text
                          )}
                          {feature.isNew && feature.included && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">{lt('New')}</span>
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
                        <Button className="w-full" variant="outline">{lt('Contact Sales')}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{lt('Contact Enterprise Sales')}</DialogTitle>
                          <DialogDescription>
                            {lt('Get in touch with our team to discuss a custom plan for your organization.')}
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
                                <div className="font-semibold">{lt('WhatsApp')}</div>
                                <div className="text-sm text-gray-500">{lt('Chat with us instantly')}</div>
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
                                <div className="font-semibold">{lt('Email')}</div>
                                <div className="text-sm text-gray-500">{contactConfig.email}</div>
                              </div>
                            </a>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Link href="/signup" className="w-full">
                      <Button 
                        className="w-full" 
                        variant={isPopular ? 'default' : 'outline'}
                      >
                        {price === 0 ? lt('Get Started Free') : lt('Start Free Trial')}
                      </Button>
                    </Link>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          {lt('Want deeper details? Explore all features and what each plan unlocks.')}{' '}
          <Link href="/features" className="text-blue-600 hover:underline">
            {lt('Browse features')}
          </Link>
        </div>
      </div>
    </section>
  )
}

