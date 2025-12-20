import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
  if (error || isSuperAdmin !== true) return new NextResponse('Forbidden', { status: 403 })

  const service = createServiceClient()
  const { data } = await service
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'stripe_config')
    .maybeSingle()

  const raw = (data as any)?.setting_value
  let cfg: any = null
  if (typeof raw === 'string') {
    try {
      cfg = JSON.parse(raw)
    } catch {
      cfg = null
    }
  } else if (raw && typeof raw === 'object') {
    cfg = raw
  }

  const hasSecretKey = !!(
    cfg &&
    ((typeof cfg.secret_key === 'string' && cfg.secret_key.trim()) ||
      (typeof cfg.secret_key_encrypted === 'string' && cfg.secret_key_encrypted.trim()))
  )
  const hasWebhookSecret = !!(
    cfg &&
    ((typeof cfg.webhook_secret === 'string' && cfg.webhook_secret.trim()) ||
      (typeof cfg.webhook_secret_encrypted === 'string' && cfg.webhook_secret_encrypted.trim()))
  )

  return NextResponse.json({ hasSecretKey, hasWebhookSecret })
}
