import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canEncryptAtRest, encryptSecret } from '@/lib/secret-crypto'

export const runtime = 'nodejs'

type Body = {
  mode?: 'test' | 'live'
  publishable_key?: string
  secret_key?: string
  webhook_secret?: string
}

function normalizeEnvStyleAssignment(value: string, keyName: string): string {
  const trimmed = value.trim()
  const prefix = `${keyName}=`
  if (trimmed.toUpperCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim()
  }
  return trimmed
}

function normalizeStripeSecretKey(value: string): string {
  let v = normalizeEnvStyleAssignment(value, 'STRIPE_SECRET_KEY')
  if (v.toLowerCase().startsWith('bearer ')) v = v.slice(7).trim()
  return v
}

function normalizeStripeWebhookSecret(value: string): string {
  return normalizeEnvStyleAssignment(value, 'STRIPE_WEBHOOK_SECRET')
}

function looksLikeStripeSecretKey(value: string): boolean {
  return value.startsWith('sk_test_') || value.startsWith('sk_live_')
}

function looksLikeStripeWebhookSecret(value: string): boolean {
  return value.startsWith('whsec_')
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: isSuperAdmin, error: superAdminError } = await (supabase as any).rpc('is_super_admin')
  if (superAdminError || isSuperAdmin !== true) return new NextResponse('Forbidden', { status: 403 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const service = createServiceClient()

  // Load existing config to preserve secrets when omitted.
  const { data: existing } = await service
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'stripe_config')
    .maybeSingle()

  const raw = (existing as any)?.setting_value
  let current: any = {}
  if (typeof raw === 'string') {
    try {
      current = JSON.parse(raw)
    } catch {
      current = {}
    }
  } else if (raw && typeof raw === 'object') {
    current = raw
  }

  const next: any = {
    ...current,
    ...(body.mode ? { mode: body.mode } : {}),
    ...(typeof body.publishable_key === 'string' ? { publishable_key: body.publishable_key } : {}),
  }

  const encryptOk = canEncryptAtRest()

  // Only overwrite secrets if admin provided them.
  if (typeof body.secret_key === 'string' && body.secret_key.trim().length > 0) {
    const v = normalizeStripeSecretKey(body.secret_key)
    if (!looksLikeStripeSecretKey(v)) {
      return NextResponse.json({ error: 'Invalid Stripe secret key (expected sk_test_... or sk_live_...)' }, { status: 400 })
    }
    if (encryptOk) {
      next.secret_key_encrypted = encryptSecret(v)
      next.secret_key = null
    } else {
      // Backward-compatible fallback (not recommended): store plaintext if encryption key is missing.
      next.secret_key = v
    }
  }
  if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim().length > 0) {
    const v = normalizeStripeWebhookSecret(body.webhook_secret)
    if (!looksLikeStripeWebhookSecret(v)) {
      return NextResponse.json({ error: 'Invalid Stripe webhook secret (expected whsec_...)' }, { status: 400 })
    }
    if (encryptOk) {
      next.webhook_secret_encrypted = encryptSecret(v)
      next.webhook_secret = null
    } else {
      // Backward-compatible fallback (not recommended): store plaintext if encryption key is missing.
      next.webhook_secret = v
    }
  }

  if (next.mode !== 'test' && next.mode !== 'live') next.mode = 'test'

  const { error } = await (service.from('system_settings') as any).upsert(
    {
      setting_key: 'stripe_config',
      setting_value: next,
    },
    { onConflict: 'setting_key' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, encrypted: encryptOk })
}
