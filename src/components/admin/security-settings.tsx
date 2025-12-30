"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Save, Shield } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

type SecurityConfig = {
  monitor_enabled?: boolean
  monitor_threshold?: number
  monitor_window_minutes?: number
  ai_enabled?: boolean
  ai_since_minutes?: number
  ai_score_cutoff?: number
}

const DEFAULTS: SecurityConfig = {
  monitor_enabled: true,
  monitor_threshold: 5,
  monitor_window_minutes: 10,
  ai_enabled: true,
  ai_since_minutes: 60,
  ai_score_cutoff: 0.4
}

export function SecuritySettings() {
  const lt = useLiterals()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SecurityConfig>(DEFAULTS)
  const supabase = useMemo(() => createClient(), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase.from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'security_monitoring_config')
        .single()

      if (error && error.code !== 'PGRST116') throw error
      if (data && data.setting_value) setConfig({ ...(DEFAULTS as any), ...(data.setting_value as any) })
    } catch (e: any) {
      console.error('Error loading security settings', e)
      toast.error(lt('Failed to load platform settings'))
    } finally {
      setLoading(false)
    }
  }, [supabase, lt])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    try {
      setSaving(true)
      const payload = { ...config }
      const { error } = await (supabase.from('system_settings') as any).upsert({
        setting_key: 'security_monitoring_config',
        setting_value: payload,
        description: 'Security monitor and AI analysis configuration',
        is_public: false
      }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success(lt('Settings saved successfully'))
    } catch (e: any) {
      console.error('Error saving security settings', e)
      toast.error(lt('Failed to save platform settings'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-600" />
          <CardTitle>{lt('Security Monitoring')}</CardTitle>
        </div>
        <CardDescription>{lt('Configure automated monitoring and AI analysis thresholds for the platform.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{lt('Monitor Enabled')}</Label>
            <select className="w-full h-9" value={config.monitor_enabled ? 'true' : 'false'} onChange={(e) => setConfig({ ...config, monitor_enabled: e.target.value === 'true' })}>
              <option value="true">{lt('Enabled')}</option>
              <option value="false">{lt('Disabled')}</option>
            </select>
            <p className="text-sm text-muted-foreground">{lt('Enable or disable the auto-monitor that can auto-suspend offenders.')}</p>
          </div>

          <div>
            <Label>{lt('Monitor Threshold')}</Label>
            <Input type="number" min={1} value={config.monitor_threshold || 0} onChange={(e) => setConfig({ ...config, monitor_threshold: parseInt(e.target.value || '0') })} />
            <p className="text-sm text-muted-foreground">{lt('Number of cross-tenant attempts in window to consider offending.')}</p>
          </div>

          <div>
            <Label>{lt('Monitor Window (minutes)')}</Label>
            <Input type="number" min={1} value={config.monitor_window_minutes || 0} onChange={(e) => setConfig({ ...config, monitor_window_minutes: parseInt(e.target.value || '0') })} />
            <p className="text-sm text-muted-foreground">{lt('Time window (minutes) for the threshold count.')}</p>
          </div>

          <div>
            <Label>{lt('AI Analysis Enabled')}</Label>
            <select className="w-full h-9" value={config.ai_enabled ? 'true' : 'false'} onChange={(e) => setConfig({ ...config, ai_enabled: e.target.value === 'true' })}>
              <option value="true">{lt('Enabled')}</option>
              <option value="false">{lt('Disabled')}</option>
            </select>
            <p className="text-sm text-muted-foreground">{lt('Enable or disable periodic AI analysis of audit logs.')}</p>
          </div>

          <div>
            <Label>{lt('AI Since (minutes)')}</Label>
            <Input type="number" min={1} value={config.ai_since_minutes || 0} onChange={(e) => setConfig({ ...config, ai_since_minutes: parseInt(e.target.value || '0') })} />
            <p className="text-sm text-muted-foreground">{lt('How far back (minutes) the AI analysis scans logs by default.')}</p>
          </div>

          <div>
            <Label>{lt('AI Score Cutoff')}</Label>
            <Input type="number" step="0.01" min={0} max={1} value={config.ai_score_cutoff || 0} onChange={(e) => setConfig({ ...config, ai_score_cutoff: parseFloat(e.target.value || '0') })} />
            <p className="text-sm text-muted-foreground">{lt('Minimum risk score to produce alerts.')}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {lt('Save Configuration')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default SecuritySettings
