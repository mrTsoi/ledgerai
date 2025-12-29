"use client"

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function usePlatform() {
  const supabase = useMemo(() => createClient(), [])
  const [platform, setPlatform] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'platform_appearance')
        .single()

      if (error && (error as any).code !== 'PGRST116') throw error
      const raw = (data as any)?.setting_value
      if (!raw) {
        setPlatform(null)
      } else {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          setPlatform(parsed?.platform || null)
        } catch {
          setPlatform((raw as any)?.platform || null)
        }
      }
    } catch (e) {
      console.error('usePlatform load error', e)
      setPlatform(null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  return { platform, loading, reload: load }
}
