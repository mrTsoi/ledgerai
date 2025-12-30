"use client"

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiterals } from '@/hooks/use-literals'
import Link from 'next/link'
import Image from 'next/image'
import usePlatform from '@/hooks/use-platform'

export default function ForgotPasswordForm() {
  const lt = useLiterals()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const supabase = createClient()
  const { platform } = usePlatform()

  const locale = (pathname?.split('/')?.[1] || 'en') as string

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || window.location.origin
      const redirectTo = `${origin.replace(/\/$/, '')}/${locale}/login`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || lt('An unexpected error occurred'))
    } finally {
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
          <CardTitle className="text-2xl font-bold">{lt('forgotPassword')}</CardTitle>
          <CardDescription>
            {lt('Enter your email and we will send a password reset link.')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md">
                {lt('If that email is registered, you will receive a password reset link shortly.')}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{lt('Email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={lt('you@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || success}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading || success}>
              {loading ? lt('Sending...') : lt('Send Reset Link')}
            </Button>
            <p className="text-sm text-center text-gray-600">
              {lt('Remembered your password?')}{' '}
              <Link href={`/${locale}/login`} className="text-primary hover:underline">
                {lt('Login')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
