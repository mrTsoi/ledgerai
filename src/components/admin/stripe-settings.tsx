'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, Eye, EyeOff } from 'lucide-react'
import { toast } from "sonner"

export function StripeSettings() {
  const [loading, setLoading] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [config, setConfig] = useState({
    mode: 'test', // 'test' or 'live'
    publishable_key: '',
    secret_key: '',
    webhook_secret: ''
  })
  const supabase = useMemo(() => createClient(), [])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'stripe_config')
        .single()

      if (data) {
        const raw = (data as unknown as { setting_value: unknown }).setting_value
        if (typeof raw === 'string') {
          try {
            setConfig(JSON.parse(raw) as typeof config)
          } catch {
            setConfig(DEFAULT_CONFIG)
          }
        } else if (raw && typeof raw === 'object') {
          setConfig(raw as typeof config)
        }
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
      const { error } = await (supabase
        .from('system_settings') as any)
        .upsert({
          setting_key: 'stripe_config',
          setting_value: config,
          description: 'Stripe payment gateway configuration',
          is_public: false
        })

      if (error) throw error
      toast.success('Stripe settings saved successfully')
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings: ' + error.message)
    } finally {
      setLoading(false)
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
          <Label>Secret Key</Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={config.secret_key}
              onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
              placeholder="sk_test_..."
            />
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
          <Label>Webhook Secret</Label>
          <Input
            type="password"
            value={config.webhook_secret}
            onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })}
            placeholder="whsec_..."
          />
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  )
}
