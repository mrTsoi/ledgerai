import { createClient } from '@/lib/supabase/server'

export type HeroMediaItem = {
  type: 'video' | 'image'
  url: string
  duration_seconds?: number
}

export type PublicPlatformAppearance = {
  chatbot?: any
  landing_page?: {
    hero_badge?: string
    hero_title?: string
    hero_title_highlight?: string
    hero_subtitle?: string
    show_features?: boolean
    hero_overlay_opacity?: number
    hero_rotation_seconds?: number
    hero_media?: HeroMediaItem[]
  }
}

export async function getPublicPlatformAppearance(): Promise<PublicPlatformAppearance | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'platform_appearance')
      .maybeSingle()

    if (error) return null

    const raw = (data as any)?.setting_value
    if (!raw) return null
    if (typeof raw === 'object') return raw as PublicPlatformAppearance
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as PublicPlatformAppearance
      } catch {
        return null
      }
    }
    return null
  } catch {
    return null
  }
}
