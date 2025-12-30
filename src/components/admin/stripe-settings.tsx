'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, Eye, EyeOff } from 'lucide-react'
import { toast } from "sonner"

const DEFAULT_STRIPE_CONFIG = {
  mode: 'test',
  publishable_key: '',
  secret_key: '',
  webhook_secret: '',
}

export function StripeSettings() {
  const [loading, setLoading] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [hasSecretKey, setHasSecretKey] = useState(false)
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState(() => DEFAULT_STRIPE_CONFIG)
  const supabase = useMemo((): SupabaseClient<Database> => createClient() as SupabaseClient<Database>, [])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'stripe_config')
        .single()

      if (error) throw error

      if (data) {
        const raw = (data as unknown as { setting_value: unknown }).setting_value
        let nextConfig: any = DEFAULT_STRIPE_CONFIG
        if (typeof raw === 'string') {
          try {
            nextConfig = JSON.parse(raw)
          } catch {
            nextConfig = DEFAULT_STRIPE_CONFIG
          }
        } else if (raw && typeof raw === 'object') {
          nextConfig = raw
        }

        // Avoid null/undefined leaking into controlled inputs.
        if (typeof nextConfig.secret_key !== 'string') nextConfig.secret_key = ''
        if (typeof nextConfig.webhook_secret !== 'string') nextConfig.webhook_secret = ''
        if (typeof nextConfig.publishable_key !== 'string') nextConfig.publishable_key = ''
        if (nextConfig.mode !== 'test' && nextConfig.mode !== 'live') nextConfig.mode = 'test'

        setConfig(nextConfig)
      }

      // Load secret status (encrypted presence) without exposing secrets
      try {
        const res = await fetch('/api/admin/stripe-config/status', { method: 'GET' })
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          setHasSecretKey(!!json?.hasSecretKey)
          setHasWebhookSecret(!!json?.hasWebhookSecret)
        }
      } catch {
        // Non-fatal
      }
    } catch (error) {
      console.error('Error loading Stripe settings:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    try {
      setLoading(true)

      // Only send secrets if the admin typed a new one; otherwise preserve existing encrypted values.
      const payload: any = {
        mode: config.mode,
        publishable_key: config.publishable_key,
      }
      if (typeof config.secret_key === 'string' && config.secret_key.trim().length > 0) {
        payload.secret_key = config.secret_key
      }
      if (typeof config.webhook_secret === 'string' && config.webhook_secret.trim().length > 0) {
        payload.webhook_secret = config.webhook_secret
      }

      const res = await fetch('/api/admin/stripe-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save Stripe settings')
      }

      toast.success('Stripe settings saved securely')

      // Clear the secret inputs after a successful save to avoid re-submitting
      // and to avoid keeping secrets in React state longer than needed.
      setConfig((prev: any) => ({ ...prev, secret_key: '', webhook_secret: '' }))

      // Refresh status indicators after saving
      try {
        const res = await fetch('/api/admin/stripe-config/status', { method: 'GET' })
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          setHasSecretKey(!!json?.hasSecretKey)
          setHasWebhookSecret(!!json?.hasWebhookSecret)
        }
      } catch {
        // Non-fatal
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTestStripe = async () => {
    try {
      setTesting(true)
      const res = await fetch('/api/admin/stripe-test', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || 'Stripe test failed')
      }
      toast.success(json?.message || 'Stripe test succeeded')
    } catch (error: any) {
      toast.error(error?.message || 'Stripe test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Integration</CardTitle>
        <CardDescription>Configure your Stripe payment gateway settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Environment Mode</Label>
            <p className="text-sm text-muted-foreground">
              Switch between Test and Live mode
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${config.mode === 'test' ? 'font-bold' : ''}`}>Test</span>
            <Switch
              checked={config.mode === 'live'}
              onCheckedChange={(checked) => setConfig({ ...config, mode: checked ? 'live' : 'test' })}
            />
            <span className={`text-sm ${config.mode === 'live' ? 'font-bold' : ''}`}>Live</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Publishable Key</Label>
          <Input
            value={config.publishable_key}
            onChange={(e) => setConfig({ ...config, publishable_key: e.target.value })}
            placeholder="pk_test_..."
          />
        </div>

        <div className="space-y-2">
          <Label>
            Secret Key
            {hasSecretKey ? <span className="text-muted-foreground"> (configured)</span> : null}
          </Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={config.secret_key}
              onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
              placeholder={hasSecretKey ? 'Configured (enter to replace)' : 'sk_test_...'}
              className={hasSecretKey && !config.secret_key ? 'pr-28' : undefined}
            />

            {hasSecretKey && !config.secret_key ? (
              <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                Configured
              </span>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Webhook Secret
            {hasWebhookSecret ? <span className="text-muted-foreground"> (configured)</span> : null}
          </Label>
          <div className="relative">
            <Input
              type="password"
              value={config.webhook_secret}
              onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })}
              placeholder={hasWebhookSecret ? 'Configured (enter to replace)' : 'whsec_...'}
              className={hasWebhookSecret && !config.webhook_secret ? 'pr-24' : undefined}
            />
            {hasWebhookSecret && !config.webhook_secret ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                Configured
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Configuration
          </Button>

          <Button variant="outline" onClick={handleTestStripe} disabled={loading || testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test Stripe Connection
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
