'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Zap } from 'lucide-react'
import { toast } from "sonner"

interface SystemBatchConfig {
  default_batch_size: number
  max_batch_size: number
}

interface TenantBatchConfig {
  batch_size: number
}

export function BatchProcessingConfig() {
  const { currentTenant, isSuperAdmin } = useTenant()
  const userRole = useUserRole()
  const { subscription, loading: subLoading } = useSubscription()
  const supabase = useMemo(() => createClient(), [])
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [systemConfig, setSystemConfig] = useState<SystemBatchConfig | null>(null)
  const [batchSize, setBatchSize] = useState<number>(10)

  const canEdit = isSuperAdmin || userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'
  const hasFeature = subscription?.features?.concurrent_batch_processing

  const fetchConfigs = useCallback(async () => {
    try {
      setFetching(true)
      
      // Fetch system settings for limits
      const { data: systemData, error: systemError } = await (supabase
        .from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'batch_processing_config')
        .maybeSingle()

      if (systemError && systemError.code !== 'PGRST116') {
        console.error('Error fetching system settings:', systemError)
      }

      const sysConfig = systemData?.setting_value as SystemBatchConfig || { default_batch_size: 10, max_batch_size: 50 }
      setSystemConfig(sysConfig)

      // Fetch tenant settings
      const { data: tenantData, error: tenantError } = await (supabase
        .from('tenant_settings') as any)
        .select('setting_value')
        .eq('tenant_id', currentTenant!.id)
        .eq('setting_key', 'batch_processing_config')
        .maybeSingle()

      if (tenantError && tenantError.code !== 'PGRST116') {
        console.error('Error fetching tenant settings:', tenantError)
      }

      if (tenantData?.setting_value) {
        setBatchSize((tenantData.setting_value as TenantBatchConfig).batch_size)
      } else {
        setBatchSize(sysConfig.default_batch_size)
      }

    } catch (error) {
      console.error('Error loading batch configs:', error)
    } finally {
      setFetching(false)
    }
  }, [currentTenant, supabase])

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

      const { error } = await (supabase
        .from('tenant_settings') as any)
        .upsert({
          tenant_id: currentTenant.id,
          setting_key: 'batch_processing_config',
          setting_value: config,
          updated_at: new Date().toISOString(),
          updated_by: (await supabase.auth.getUser()).data.user?.id
        }, { onConflict: 'tenant_id, setting_key' })

      if (error) throw error
      
      toast.success('Batch processing settings saved')
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings: ' + error.message)
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
              Batch Processing
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                New
              </Badge>
            </CardTitle>
            <CardDescription>
              Configure concurrent processing limits for your workspace.
            </CardDescription>
          </div>
          <Zap className="h-5 w-5 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="batchSize">Concurrent Batch Size</Label>
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
                Max allowed: {systemConfig?.max_batch_size || 50}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Higher batch sizes process more items simultaneously but may impact system performance.
            </p>
          </div>

          {canEdit && (
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
