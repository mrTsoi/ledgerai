import { useState, useEffect } from 'react'
import { useTenant } from '@/hooks/use-tenant'

/**
 * Hook: useBatchConfig
 *
 * This hook fetches batch processing configuration for the current tenant
 * from the server (`/api/batch-processing/config`). In browser environments
 * it constructs an absolute URL using `window.location.origin`.
 *
 * In server or test environments (where `window` is not available), the
 * hook will attempt to use `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`,
 * or `VERCEL_URL` to build the absolute URL. If none are available the
 * network fetch is skipped and a safe default is used (batchSize = 5).
 *
 * This prevents runtime errors in Node-based tests (undici/URL parsing)
 * while allowing the app to fetch real tenant/system config at runtime.
 */

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

        // Determine base URL. In test or Node environments `window.location` may be unavailable.
        const baseUrl =
          typeof window !== 'undefined' && window.location && window.location.origin
            ? window.location.origin
            : process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

        if (!baseUrl) {
          // Cannot construct a safe absolute URL in this environment (tests/Node). Skip network fetch and keep defaults.
          console.warn('Skipping batch-config fetch: no base URL available')
          setLoading(false)
          return
        }

        const res = await fetch(
          `${baseUrl}/api/batch-processing/config?tenant_id=${encodeURIComponent(currentTenant.id)}`
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
