'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiterals } from '@/hooks/use-literals'
import Link from 'next/link'
import Image from 'next/image'
import usePlatform from '@/hooks/use-platform'

export default function LoginForm() {
  const lt = useLiterals()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showMfaInput, setShowMfaInput] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const { platform } = usePlatform()

  const locale = (pathname?.split('/')?.[1] || 'en') as string

  const handleGoogleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || window.location.origin
      const redirectTo = `${origin.replace(/\/$/, '')}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/dashboard`)}`
      console.debug('OAuth redirectTo (login):', redirectTo)
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
      setError(err?.message || lt('Failed to start Google login'))
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (showMfaInput) {
        // Handle MFA Verification
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error(lt('User not found'))

        const factors = await supabase.auth.mfa.listFactors()
        if (factors.error) throw factors.error

        const totpFactor = factors.data.all.find(f => f.factor_type === 'totp' && f.status === 'verified')
        
        if (!totpFactor) throw new Error(lt('No MFA factor found'))

        const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id })
        if (challenge.error) throw challenge.error

        const verify = await supabase.auth.mfa.verify({
          factorId: totpFactor.id,
          challengeId: challenge.data.id,
          code: mfaCode,
        })

        if (verify.error) throw verify.error

        router.push('/dashboard')
        router.refresh()
      } else {
        // Handle Password Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(error.message)
          setLoading(false)
          return
        }

        // Check if MFA is enabled
        const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (mfaError) throw mfaError
        
        if (mfaData && mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
          setShowMfaInput(true)
          setLoading(false)
          return
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || lt('An unexpected error occurred'))
      setLoading(false)
    }
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
          <CardTitle className="text-2xl font-bold">{lt('login')}</CardTitle>
          <CardDescription>
            {showMfaInput ? lt('Enter your 2FA code') : lt('Enter your credentials to access your account')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
            
            {showMfaInput ? (
              <div className="space-y-2">
                <Label htmlFor="mfa-code">{lt('Two-Factor Authentication Code')}</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono tracking-widest text-center text-lg"
                  required
                  autoFocus
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground text-center">
                  {lt('Enter the 6-digit code from your authenticator app.')}
                </p>
              </div>
            ) : (
              <>
                <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
                  {lt('Continue with Google')}
                </Button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{lt('or')}</span>
                  <div className="h-px flex-1 bg-border" />
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
                    placeholder={lt('Enter your password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? (showMfaInput ? lt('Verifying...') : lt('Logging in...'))
                : (showMfaInput ? lt('Verify') : lt('Login'))}
            </Button>
            {!showMfaInput && (
              <>
                <p className="text-sm text-right w-full">
                  <Link href={`/${locale}/forgot-password`} className="text-sm text-primary hover:underline">
                    {lt('forgotPassword')}
                  </Link>
                </p>
                <p className="text-sm text-center text-gray-600">
                  {lt("Don't have an account?")}{' '}
                  <Link href={`/${locale}/signup`} className="text-primary hover:underline">
                    {lt('Sign up')}
                  </Link>
                </p>
              </>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
