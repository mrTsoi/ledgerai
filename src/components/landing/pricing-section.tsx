'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X, Loader2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

export function PricingSection() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')
  const supabase = createClient()

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
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
      setLoading(false)
    }
  }

  const formatPrice = (price: number | null) => {
    if (price === 0 || price === null) return 'Free'
    return `$${price}`
  }

  const formatStorage = (bytes: number) => {
    if (bytes === -1) return 'Unlimited'
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb} GB`
  }

  const getFeaturesList = (plan: SubscriptionPlan) => {
    const features: { text: string; included: boolean }[] = []
    
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

    // JSON Features
    const featureFlags = (plan.features as any) || {}
    
    features.push({ 
      text: 'AI Automation', 
      included: !!featureFlags.ai_access 
    })
    features.push({ 
      text: 'Custom Domain', 
      included: !!featureFlags.custom_domain 
    })
    features.push({ 
      text: 'SSO / Enterprise Security', 
      included: !!featureFlags.sso 
    })

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
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
          <p className="text-lg text-gray-600 mb-8">Choose the plan that&apos;s right for your business.</p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingInterval === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>Monthly</span>
            <button
              onClick={() => setBillingInterval(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span
                className={`${
                  billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </button>
            <span className={`text-sm font-medium ${billingInterval === 'yearly' ? 'text-gray-900' : 'text-gray-500'}`}>
              Yearly <span className="text-green-600 text-xs font-bold ml-1">(Save ~20%)</span>
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

            return (
              <Card 
                key={plan.id} 
                className={`flex flex-col relative ${isPopular ? 'border-blue-600 shadow-xl scale-105 z-10' : 'hover:shadow-lg transition-shadow'}`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{formatPrice(price)}</span>
                    <span className="text-gray-500">/mo</span>
                    {billingInterval === 'yearly' && price > 0 && (
                      <div className="text-xs text-green-600 font-medium mt-1">
                        Billed ${yearlyPrice} yearly (Save {discountPercent}%)
                      </div>
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
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href="/signup" className="w-full">
                    <Button 
                      className="w-full" 
                      variant={isPopular ? 'default' : 'outline'}
                    >
                      {price === 0 ? 'Get Started Free' : 'Start Free Trial'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
