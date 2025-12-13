import { useState, useEffect } from 'react'
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

  useEffect(() => {
    async function fetchConfig() {
      if (!currentTenant) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const res = await fetch(
          `/api/batch-processing/config?tenant_id=${encodeURIComponent(currentTenant.id)}`
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to load batch config')

        const sysConfig = (json?.system_config as SystemBatchConfig) || {
          default_batch_size: 5,
          max_batch_size: 50,
        }

        const tenantConfig = (json?.tenant_config as BatchConfig | null) || null

        if (tenantConfig?.batch_size) {
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
  }, [currentTenant])

  return { batchSize, loading }
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
