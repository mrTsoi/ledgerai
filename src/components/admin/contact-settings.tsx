'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Save, Phone, Mail } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

interface ContactConfig {
  whatsapp: string
  email: string
}

const DEFAULT_CONFIG: ContactConfig = {
  whatsapp: '85251263335',
  email: 'eric@sophiesofts.com'
}

export function ContactSettings() {
  const lt = useLiterals()
  const [config, setConfig] = useState<ContactConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await (supabase
        .from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'contact_sales_config')
        .single()

      if (data?.setting_value) {
        setConfig(data.setting_value as ContactConfig)
      }
    } catch (error) {
      console.error('Error fetching contact config:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleSave = async () => {
    try {
      setSaving(true)
      const { error } = await (supabase
        .from('system_settings') as any)
        .upsert({
          setting_key: 'contact_sales_config',
          setting_value: config,
          description: 'Contact information for Enterprise sales',
          is_public: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success(lt('Contact settings saved successfully'))
    } catch (error: any) {
      console.error('Error saving contact settings:', error)
      toast.error(lt('Failed to save settings: {message}', { message: error?.message ?? '' }))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Sales Contact Information')}</CardTitle>
        <CardDescription>{lt('Configure contact details for Enterprise plan inquiries.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="whatsapp">{lt('WhatsApp Number')}</Label>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-500" />
            <Input
              id="whatsapp"
              value={config.whatsapp}
              onChange={(e) => setConfig({ ...config, whatsapp: e.target.value })}
              placeholder={lt('e.g. 85251263335')}
            />
          </div>
          <p className="text-xs text-muted-foreground">{lt('Format: Country code + Number (no spaces or symbols)')}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">{lt('Sales Email')}</Label>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-500" />
            <Input
              id="email"
              type="email"
              value={config.email}
              onChange={(e) => setConfig({ ...config, email: e.target.value })}
              placeholder={lt('e.g. sales@example.com')}
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {lt('Save Changes')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
