'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Save, ServerCog } from 'lucide-react'
import { TenantMismatchPolicySettings } from '@/components/admin/tenant-mismatch-policy-settings'
import { useLiterals } from '@/hooks/use-literals'

interface BatchConfig {
  default_batch_size: number
  max_batch_size: number
}

type TenantRow = {
  id: string
  name: string
  is_active: boolean | null
}

const DEFAULT_CONFIG: BatchConfig = {
  default_batch_size: 10,
  max_batch_size: 100
}

export function ProcessingSettings() {
  const lt = useLiterals()
  const [config, setConfig] = useState<BatchConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [applyScope, setApplyScope] = useState<'all_platform' | 'selected_platform'>('all_platform')
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([])
  const supabase = useMemo(() => createClient(), [])

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await (supabase
        .from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'batch_processing_config')
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setConfig(data.setting_value as BatchConfig)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load processing settings')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    async function loadTenants() {
      try {
        const { data, error } = await (supabase.from('tenants') as any)
          .select('id, name, is_active')
          .order('name')
        if (error) throw error
        setTenants((data || []) as TenantRow[])
      } catch (e: any) {
        console.error('Error loading tenants:', e)
        // Avoid noisy toasts on initial load; admin may not have access if not SUPER_ADMIN.
      }
    }

    loadTenants()
  }, [supabase])

  const handleSave = async () => {
    try {
      setSaving(true)
      
      // Validation
      if (config.default_batch_size > config.max_batch_size) {
        toast.error(lt('Default batch size cannot exceed max batch size'))
        return
      }

      const { error } = await (supabase
        .from('system_settings') as any)
        .upsert({
          setting_key: 'batch_processing_config',
          setting_value: config as any,
          description: 'Configuration for concurrent batch processing limits',
          is_public: true
        }, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success(lt('Settings saved successfully'))
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error(lt('Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const applyToTenants = async () => {
    try {
      setApplying(true)

      // Validation
      if (config.default_batch_size > config.max_batch_size) {
        toast.error(lt('Default batch size cannot exceed max batch size'))
        return
      }

      let tenantIds: string[] | undefined
      if (applyScope === 'selected_platform') {
        if (selectedTenantIds.length === 0) {
          toast.error(lt('Select at least one tenant'))
          return
        }
        tenantIds = selectedTenantIds
      }

      const res = await fetch('/api/tenant-settings/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setting_key: 'batch_processing_config',
          setting_value: config,
          scope: applyScope,
          tenant_ids: tenantIds,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to apply settings'))

      const updated = Number(json?.updated || 0)
      toast.success(
        lt('Applied to {count} tenant{suffix}', { count: updated, suffix: updated === 1 ? '' : 's' })
      )
    } catch (e: any) {
      console.error('Error applying settings:', e)
      toast.error(e?.message || lt('Failed to apply settings'))
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
  }

  return (
    <div className="space-y-6">
      <TenantMismatchPolicySettings />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ServerCog className="h-5 w-5 text-blue-600" />
            <CardTitle>{lt('Concurrent Batch Processing')}</CardTitle>
          </div>
          <CardDescription>
            {lt('Configure global limits for concurrent processing. These settings define the boundaries for all tenants.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{lt('Default Batch Size')}</Label>
              <Input
                type="number"
                min={1}
                value={config.default_batch_size}
                onChange={(e) => setConfig({ ...config, default_batch_size: parseInt(e.target.value) || 0 })}
              />
              <p className="text-sm text-muted-foreground">
                {lt("The default number of items processed concurrently if a tenant hasn't configured their own limit.")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{lt('Max Batch Size Limit')}</Label>
              <Input
                type="number"
                min={1}
                value={config.max_batch_size}
                onChange={(e) => setConfig({ ...config, max_batch_size: parseInt(e.target.value) || 0 })}
              />
              <p className="text-sm text-muted-foreground">
                {lt('The absolute maximum batch size a tenant can configure, regardless of their preference.')}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {lt('Save Configuration')}
            </Button>
          </div>

          <div className="border-t pt-6 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-medium">{lt('Apply to tenants')}</div>
                <div className="text-sm text-muted-foreground">
                  {lt('Push this configuration into tenant overrides (tenant_settings).')}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{lt('Scope')}</Label>
              <Select value={applyScope} onValueChange={(v) => setApplyScope(v as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={lt('Select scope')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_platform">{lt('All tenants (platform-wide)')}</SelectItem>
                  <SelectItem value="selected_platform">{lt('Selected tenants')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {applyScope === 'selected_platform' && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-sm text-muted-foreground">{lt('Select tenants')}</div>
                <div className="space-y-2">
                  {tenants.map((t) => {
                    const checked = selectedTenantIds.includes(t.id)
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const on = next === true
                            setSelectedTenantIds((prev) => {
                              const set = new Set(prev)
                              if (on) set.add(t.id)
                              else set.delete(t.id)
                              return Array.from(set)
                            })
                          }}
                        />
                        <span className={t.is_active === false ? 'text-muted-foreground' : ''}>{t.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={applyToTenants} disabled={applying}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {lt('Apply Settings')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
