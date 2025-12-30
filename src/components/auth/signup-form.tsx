'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLiterals } from '@/hooks/use-literals'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import Image from 'next/image'
import usePlatform from '@/hooks/use-platform'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
type Plan = { id: string; name: string; description: string; price_monthly: number; price_yearly?: number; yearly_discount_percent?: number }

export default function SignupForm() {
  const lt = useLiterals()
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
  const pathname = usePathname()
  const supabase = createClient()

  const { platform } = usePlatform()

  const locale = (pathname?.split('/')?.[1] || 'en') as string

  const handleGoogleSignup = async () => {
    setError(null)
    if (!planId) {
      setError(lt('Please select a subscription plan.'))
      return
    }

    setLoading(true)
    try {
      const next = `/${locale}/dashboard`
      const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || window.location.origin
      const redirectTo = `${origin.replace(/\/$/, '')}/${locale}/auth/callback?next=${encodeURIComponent(next)}&plan_id=${encodeURIComponent(planId)}&interval=${encodeURIComponent(interval)}`
      console.debug('OAuth redirectTo (signup):', redirectTo)
      try {
        localStorage.setItem('supabase_oauth_redirectTo', redirectTo)
      } catch (e) {
        // ignore
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      })
      if (error) throw error
      // Redirect handled by Supabase
    } catch (err: any) {
      setError(err?.message || lt('Failed to start Google signup'))
      setLoading(false)
    }
  }

  useEffect(() => {
    // Fetch plans from Supabase
    (async () => {
      const { data, error } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('price_monthly', { ascending: true })
      if (!error && data) {
        setPlans(data)
        // Auto-select the first plan (usually Free)
        if (data.length > 0) {
          setPlanId((prev) => prev || data[0].id)
        }
      }
    })()
  }, [supabase])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!planId) {
      setError(lt('Please select a subscription plan.'))
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
      setError(lt('An unexpected error occurred'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-green-600">{lt('Account Created!')}</CardTitle>
            <CardDescription>
              {lt('Please check your email to confirm your address.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md text-center">
              <p className="text-sm text-green-800 mb-2">
                {lt('We have sent a confirmation link to')} <strong>{email}</strong>.
              </p>
              <p className="text-sm text-green-800">
                {lt('Click the link in the email to activate your account and sign in.')}
              </p>
            </div>
            <Button className="w-full" variant="outline" onClick={() => router.push(`/${locale}/login`)}>
              {lt('Go to Login')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-3">
            {platform?.logo_url ? (
              <Image src={platform.logo_url} alt={platform?.name || 'Logo'} className="w-8 h-8 object-contain rounded-lg" width={32} height={32} />
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">{(platform?.name && platform.name[0]) ? String(platform.name[0]).toUpperCase() : 'L'}</div>
            )}
            <div className="text-lg font-semibold text-gray-900">{platform?.name || 'LedgerAI'}</div>
          </div>
          <CardTitle className="text-2xl font-bold">{lt('Create an Account')}</CardTitle>
          <CardDescription>
            {lt('Enter your information to get started with LedgerAI')}
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
                {lt('Account created! Please check your email to confirm your address before logging in.')}
                <br />
                {lt('After confirming, log in to complete your subscription payment if required.')}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="fullName">{lt('Full Name')}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={lt('John Doe')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignup} disabled={loading || success}>
              {lt('Continue with Google')}
            </Button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{lt('or')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan">{lt('Subscription Plan')}</Label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${interval === 'month' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-gray-300 hover:bg-gray-50'}`}
                    onClick={() => setInterval('month')}
                    disabled={loading}
                  >
                    {lt('Monthly')}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${interval === 'year' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-gray-300 hover:bg-gray-50'}`}
                    onClick={() => setInterval('year')}
                    disabled={loading}
                  >
                    {lt('Yearly')}
                  </button>
                </div>
                <Select value={planId} onValueChange={setPlanId} disabled={loading || plans.length === 0}>
                  <SelectTrigger id="plan" className="truncate">
                    <SelectValue placeholder={lt('Select a plan')} className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id} className="truncate">
                        <div className="flex flex-col w-56 truncate">
                          <span className="font-medium truncate">{plan.name}</span>
                          {interval === 'month' ? (
                            <span className="text-xs text-muted-foreground truncate">
                              ${plan.price_monthly}/{lt('mo')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground truncate">
                              ${plan.price_yearly}/{lt('yr')}{' '}
                              {plan.yearly_discount_percent ? `(${plan.yearly_discount_percent}% ${lt('off')})` : ''}
                            </span>
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
              <Label htmlFor="email">{lt('Email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={lt('you@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{lt('Password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={lt('Create a strong password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                {lt('Password must be at least 6 characters')}
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success}>
              {loading ? lt('Creating Account...') : lt('Sign Up')}
            </Button>
            <p className="text-sm text-center text-gray-600">
              {lt('Already have an account?')}{' '}
              <Link href="/login" className="text-primary hover:underline">
                {lt('Login')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
