'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Zap } from 'lucide-react'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

interface SystemBatchConfig {
  default_batch_size: number
  max_batch_size: number
}

interface TenantBatchConfig {
  batch_size: number
}

export function BatchProcessingConfig() {
  const lt = useLiterals()
  const { currentTenant, tenants, memberships, isSuperAdmin } = useTenant()
  const userRole = useUserRole()
  const { subscription, loading: subLoading } = useSubscription()
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [systemConfig, setSystemConfig] = useState<SystemBatchConfig | null>(null)
  const [batchSize, setBatchSize] = useState<number>(10)

  const [applyScope, setApplyScope] = useState<'current' | 'all_managed' | 'selected_managed'>('current')
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([])

  const managedTenantIdSet = useMemo(() => {
    const set = new Set<string>()
    for (const m of memberships || []) {
      const role = (m as any).role as string | null
      const active = (m as any).is_active !== false
      if (!active) continue
      if (role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN') {
        if ((m as any).tenant_id) set.add((m as any).tenant_id as string)
      }
    }
    return set
  }, [memberships])

  const managedTenants = useMemo(() => {
    return (tenants || []).filter((t) => managedTenantIdSet.has(t.id))
  }, [tenants, managedTenantIdSet])

  const canEditThisTenant = !!currentTenant && managedTenantIdSet.has(currentTenant.id)

  const canEdit = canEditThisTenant
  const hasFeature = subscription?.features?.concurrent_batch_processing

  const fetchConfigs = useCallback(async () => {
    try {
      setFetching(true)

      const tenantId = currentTenant?.id
      if (!tenantId) return

      const res = await fetch(`/api/batch-processing/config?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || lt('Failed to load batch processing config'))

      const sysConfig = (json?.system_config as SystemBatchConfig) || { default_batch_size: 10, max_batch_size: 50 }
      setSystemConfig(sysConfig)

      const tenantConfig = (json?.tenant_config as TenantBatchConfig | null) || null
      if (tenantConfig?.batch_size) {
        setBatchSize(tenantConfig.batch_size)
      } else {
        setBatchSize(sysConfig.default_batch_size)
      }

    } catch (error) {
      console.error('Error loading batch configs:', error)
    } finally {
      setFetching(false)
    }
  }, [currentTenant, lt])

  useEffect(() => {
    if (currentTenant && hasFeature) {
      fetchConfigs()
    } else {
      setFetching(false)
    }
  }, [currentTenant, hasFeature, fetchConfigs])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentTenant) return

    try {
      setLoading(true)
      
      const config: TenantBatchConfig = {
        batch_size: batchSize
      }

      if (!canEditThisTenant) {
        toast.error(lt('You can only apply settings to companies you manage'))
        return
      }

      let scope: 'current' | 'all_managed' | 'selected_managed' = applyScope
      let tenantIds: string[] | undefined

      if (managedTenants.length <= 1) {
        scope = 'current'
      }

      if (scope === 'selected_managed') {
        const filtered = (selectedTenantIds || []).filter((id) => managedTenantIdSet.has(id))
        if (filtered.length === 0) {
          toast.error(lt('Select at least one company'))
          return
        }
        tenantIds = filtered
      }

      const res = await fetch('/api/tenant-settings/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setting_key: 'batch_processing_config',
          setting_value: config,
          scope,
          tenant_id: currentTenant.id,
          tenant_ids: tenantIds,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to apply settings'))

      const updated = Number(json?.updated || 0)
      if (scope === 'current') {
        toast.success(lt('Batch processing settings saved'))
      } else {
        toast.success(lt('Batch processing settings applied to {updated} companies', { updated }))
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(lt('Failed to save settings: {message}', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }

  if (subLoading || fetching) {
    return null // Or a skeleton
  }

  if (!hasFeature) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {lt('Batch Processing')}
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                {lt('New')}
              </Badge>
            </CardTitle>
            <CardDescription>
              {lt('Configure concurrent processing limits for your workspace.')}
            </CardDescription>
          </div>
          <Zap className="h-5 w-5 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="batchSize">{lt('Concurrent Batch Size')}</Label>
            <div className="flex items-center gap-4">
              <Input
                id="batchSize"
                type="number"
                min={1}
                max={systemConfig?.max_batch_size || 50}
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 0)}
                disabled={!canEdit || loading}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                {lt('Max allowed: {max}', { max: systemConfig?.max_batch_size || 50 })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {lt('Higher batch sizes process more items simultaneously but may impact system performance.')}
            </p>
          </div>

          {canEdit && managedTenants.length > 1 && (
            <div className="grid gap-2">
              <Label>{lt('Apply To')}</Label>
              <Select value={applyScope} onValueChange={(v) => setApplyScope(v as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={lt('Select scope')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">{lt('This company')}</SelectItem>
                  <SelectItem value="all_managed">{lt('All managed companies')}</SelectItem>
                  <SelectItem value="selected_managed">{lt('Selected companies')}</SelectItem>
                </SelectContent>
              </Select>

              {applyScope === 'selected_managed' && (
                <div className="mt-2 space-y-2 rounded-md border p-3">
                  <div className="text-sm text-muted-foreground">{lt('Select companies')}</div>
                  <div className="space-y-2">
                    {managedTenants.map((t) => {
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
                          <span>{t.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {canEdit && (
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {applyScope === 'current' || managedTenants.length <= 1 ? lt('Save Changes') : lt('Apply Settings')}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
