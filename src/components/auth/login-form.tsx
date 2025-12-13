'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showMfaInput, setShowMfaInput] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (showMfaInput) {
        // Handle MFA Verification
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('User not found')

        const factors = await supabase.auth.mfa.listFactors()
        if (factors.error) throw factors.error

        const totpFactor = factors.data.all.find(f => f.factor_type === 'totp' && f.status === 'verified')
        
        if (!totpFactor) throw new Error('No MFA factor found')

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
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login to LedgerAI</CardTitle>
          <CardDescription>
            {showMfaInput ? 'Enter your 2FA code' : 'Enter your credentials to access your account'}
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
                <Label htmlFor="mfa-code">Two-Factor Authentication Code</Label>
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
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            ) : (
              <>
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
                    placeholder="Enter your password"
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
              {loading ? (showMfaInput ? 'Verifying...' : 'Logging in...') : (showMfaInput ? 'Verify' : 'Login')}
            </Button>
            {!showMfaInput && (
              <p className="text-sm text-center text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
