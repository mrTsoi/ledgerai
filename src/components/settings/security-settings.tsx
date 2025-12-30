"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Shield, ShieldCheck, ShieldAlert, Copy } from "lucide-react"
import { toast } from "sonner"
import { ImagePreview } from "@/components/ui/image-preview"
import { useLiterals } from "@/hooks/use-literals"

export function SecuritySettings() {
  const lt = useLiterals()
  const [loading, setLoading] = useState(false)
  const [factors, setFactors] = useState<any[]>([])
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [isEnrolling, setIsEnrolling] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchFactors = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      setFactors(data.all || [])
    } catch (error) {
      console.error('Error fetching MFA factors:', error)
    }
  }, [supabase])

  useEffect(() => {
    fetchFactors()
  }, [fetchFactors])

  const startEnrollment = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      })

      if (error) throw error

      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setIsEnrolling(true)
    } catch (error: any) {
      toast.error(error.message || lt('Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  const verifyEnrollment = async () => {
    try {
      setLoading(true)
      if (!factorId) return

      const { data, error } = await supabase.auth.mfa.challenge({
        factorId,
      })

      if (error) throw error

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: data.id,
        code: verifyCode,
      })

      if (verifyError) throw verifyError

      toast.success(lt('Two-factor authentication enabled successfully'))
      setIsEnrolling(false)
      setQrCode(null)
      setSecret(null)
      setVerifyCode("")
      fetchFactors()
    } catch (error: any) {
      toast.error(error.message || lt('Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  const unenroll = async (id: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (error) throw error
      
      toast.success(lt('Two-factor authentication disabled'))
      fetchFactors()
    } catch (error: any) {
      toast.error(error.message || lt('Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  const hasVerifiedFactor = factors.some(f => f.status === 'verified')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {lt('Two-Factor Authentication (2FA)')}
        </CardTitle>
        <CardDescription>
          {lt('Add an extra layer of security to your account using an authenticator app.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasVerifiedFactor ? (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <ShieldCheck className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-green-900">{lt('2FA is enabled')}</h3>
                <p className="text-sm text-green-700">{lt('Your account is secured with TOTP.')}</p>
              </div>
            </div>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => {
                const factor = factors.find(f => f.status === 'verified')
                if (factor) unenroll(factor.id)
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : lt('Disable 2FA')}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-yellow-50 border-yellow-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-full">
                <ShieldAlert className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-medium text-yellow-900">{lt('2FA is not enabled')}</h3>
                <p className="text-sm text-yellow-700">{lt('We recommend enabling 2FA for better security.')}</p>
              </div>
            </div>
            {!isEnrolling && (
              <Button onClick={startEnrollment} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : lt('Enable 2FA')}
              </Button>
            )}
          </div>
        )}

        {isEnrolling && qrCode && (
          <div className="space-y-6 border-t pt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="font-medium">{lt('1. Scan QR Code')}</h3>
                <p className="text-sm text-muted-foreground">
                  {lt('Use an authenticator app like Google Authenticator or Authy to scan this QR code.')}
                </p>
                <div className="p-4 bg-white border rounded-lg w-fit">
                  <ImagePreview src={qrCode} alt={lt('QR Code')} className="w-48 h-48" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{lt('Or enter code manually:')}</Label>
                  <div className="flex items-center gap-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{secret}</code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => {
                        if (secret) {
                          navigator.clipboard.writeText(secret)
                          toast.success(lt('Secret copied to clipboard'))
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium">{lt('2. Verify Code')}</h3>
                <p className="text-sm text-muted-foreground">
                  {lt('Enter the 6-digit code from your authenticator app to verify the setup.')}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="verify-code">{lt('Authentication Code')}</Label>
                  <Input
                    id="verify-code"
                    placeholder={lt('000000')}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="font-mono tracking-widest text-center text-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    className="w-full" 
                    onClick={verifyEnrollment}
                    disabled={loading || verifyCode.length !== 6}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {lt('Verify & Enable')}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setIsEnrolling(false)
                      setQrCode(null)
                      setSecret(null)
                      setVerifyCode("")
                    }}
                  >
                    {lt('Cancel')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
