'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
type Plan = { id: string; name: string; description: string; price_monthly: number; price_yearly?: number; yearly_discount_percent?: number }

export default function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [planId, setPlanId] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Fetch plans from Supabase
    (async () => {
      const { data, error } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('price_monthly', { ascending: true })
      if (!error && data) setPlans(data)
    })()
  }, [supabase])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!planId) {
      setError('Please select a subscription plan.')
      setLoading(false)
      return
    }

    try {
      // 1. Register user
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            selected_plan_id: planId,
            selected_plan_interval: interval,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      // Persist pending subscription so we can resume checkout after email confirmation/login
      try {
        await fetch('/api/subscriptions/pending/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            tenant_id: null,
            plan_id: planId,
            interval,
          }),
        })
      } catch (e) {
        // Non-fatal: allow signup to proceed even if persisting pending fails
        console.error('failed to persist pending subscription', e)
      }
      // Show confirmation message and prompt user to check email
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>
            Enter your information to get started with LedgerAI
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
                Account created! Please check your email to confirm your address before logging in.<br />
                After confirming, log in to complete your subscription payment if required.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">Subscription Plan</Label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${interval === 'month' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-gray-300 hover:bg-gray-50'}`}
                    onClick={() => setInterval('month')}
                    disabled={loading}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${interval === 'year' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-gray-300 hover:bg-gray-50'}`}
                    onClick={() => setInterval('year')}
                    disabled={loading}
                  >
                    Yearly
                  </button>
                </div>
                <Select value={planId} onValueChange={setPlanId} disabled={loading || plans.length === 0}>
                  <SelectTrigger id="plan" className="truncate">
                    <SelectValue placeholder="Select a plan" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id} className="truncate">
                        <div className="flex flex-col w-56 truncate">
                          <span className="font-medium truncate">{plan.name}</span>
                          {interval === 'month' ? (
                            <span className="text-xs text-muted-foreground truncate">${plan.price_monthly}/mo</span>
                          ) : (
                            <span className="text-xs text-muted-foreground truncate">${plan.price_yearly} /yr {plan.yearly_discount_percent ? `(${plan.yearly_discount_percent}% off)` : ''}</span>
                          )}
                          <span className="text-xs text-muted-foreground truncate">{plan.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                Password must be at least 6 characters
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Button>
            <p className="text-sm text-center text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Login
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
