import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X } from 'lucide-react';

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: { text: string; included: boolean }[];
  isPopular?: boolean;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For individuals getting started',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      { text: '1 Tenant', included: true },
      { text: '100 Documents/mo', included: true },
      { text: '1 GB Storage', included: true },
      { text: 'AI Automation', included: false },
      { text: 'Custom Domain', included: false },
      { text: 'SSO / Enterprise Security', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small businesses',
    priceMonthly: 29,
    priceYearly: 278,
    features: [
      { text: '3 Tenants', included: true },
      { text: '1,000 Documents/mo', included: true },
      { text: '10 GB Storage', included: true },
      { text: 'AI Automation', included: true },
      { text: 'Custom Domain', included: false },
      { text: 'SSO / Enterprise Security', included: false },
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing teams',
    priceMonthly: 79,
    priceYearly: 758,
    isPopular: true,
    features: [
      { text: '10 Tenants', included: true },
      { text: '10,000 Documents/mo', included: true },
      { text: '100 GB Storage', included: true },
      { text: 'AI Automation', included: true },
      { text: 'Custom Domain', included: true },
      { text: 'SSO / Enterprise Security', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthly: 199,
    priceYearly: 1910,
    features: [
      { text: 'Unlimited Tenants', included: true },
      { text: 'Unlimited Documents', included: true },
      { text: 'Unlimited Storage', included: true },
      { text: 'AI Automation', included: true },
      { text: 'Custom Domain', included: true },
      { text: 'SSO / Enterprise Security', included: true },
    ],
  },
];

export function PricingSection() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free';
    return `$${price}`;
  };

  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
          <p className="text-lg text-gray-600 mb-8">Choose the plan that's right for your business.</p>
          
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
            const price = billingInterval === 'monthly' ? plan.priceMonthly : Math.round(plan.priceYearly / 12);

            return (
              <Card 
                key={plan.id} 
                className={`flex flex-col relative ${plan.isPopular ? 'border-blue-600 shadow-xl scale-105 z-10' : 'hover:shadow-lg transition-shadow'}`}
              >
                {plan.isPopular && (
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
                        Billed ${plan.priceYearly} yearly (Save 20%)
                      </div>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
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
                  <Link to="/signup" className="w-full">
                    <Button 
                      className="w-full" 
                      variant={plan.isPopular ? 'default' : 'outline'}
                    >
                      {price === 0 ? 'Get Started Free' : 'Start Free Trial'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
