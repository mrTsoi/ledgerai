import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'

interface BatchConfig {
  batch_size: number
}

interface SystemBatchConfig {
  default_batch_size: number
  max_batch_size: number
}

export function useBatchConfig() {
  const { currentTenant } = useTenant()
  const [batchSize, setBatchSize] = useState<number>(5) // Safe default
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function fetchConfig() {
      if (!currentTenant) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        // 1. Get System Config for defaults
        const { data: systemData, error: systemError } = await (supabase
          .from('system_settings') as any)
          .select('setting_value')
          .eq('setting_key', 'batch_processing_config')
          .maybeSingle()

        if (systemError) {
          throw systemError
        }
        
        const sysConfig = (systemData?.setting_value as SystemBatchConfig) || { 
          default_batch_size: 5, 
          max_batch_size: 50 
        }

        // 2. Get Tenant Config for override
        const { data: tenantData, error: tenantError } = await (supabase
          .from('tenant_settings') as any)
          .select('setting_value')
          .eq('tenant_id', currentTenant.id)
          .eq('setting_key', 'batch_processing_config')
          .maybeSingle()

        if (tenantError) {
          throw tenantError
        }

        if (tenantData?.setting_value) {
          const tenantConfig = tenantData.setting_value as BatchConfig
          // Ensure we don't exceed max even if DB says so (safety)
          setBatchSize(Math.min(tenantConfig.batch_size, sysConfig.max_batch_size))
        } else {
          setBatchSize(sysConfig.default_batch_size)
        }

      } catch (error) {
        console.error('Error fetching batch config:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchConfig()
  }, [currentTenant, supabase])

  return { batchSize, loading }
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
