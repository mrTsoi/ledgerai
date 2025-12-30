import { createClient } from '@/lib/supabase/server'

export async function getPlatformAppearance() {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'platform_appearance')
      .single()

    const raw = (data as any)?.setting_value
    if (!raw) return null

    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed?.platform || null
    } catch {
      return (raw as any)?.platform || null
    }
  } catch (e) {
    return null
  }
}
