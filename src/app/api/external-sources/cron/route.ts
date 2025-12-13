import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  const { data: membership } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const { data } = await (service.from('external_sources_cron_secrets') as any)
    .select('enabled, default_run_limit, key_prefix, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured: true,
    enabled: !!(data as any).enabled,
    default_run_limit: Number((data as any).default_run_limit || 10),
    key_prefix: (data as any).key_prefix as string,
    updated_at: (data as any).updated_at as string,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const tenantId = body?.tenant_id as string | undefined
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  const { data: membership } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined
  const defaultRunLimitRaw = body.default_run_limit
  const defaultRunLimit =
    typeof defaultRunLimitRaw === 'number' || typeof defaultRunLimitRaw === 'string'
      ? Math.max(1, Math.min(50, Number(defaultRunLimitRaw)))
      : undefined

  const service = createServiceClient()

  // Only allow updating config if already configured (key exists)
  const { data: existing } = await (service.from('external_sources_cron_secrets') as any)
    .select('tenant_id, enabled, default_run_limit, key_prefix')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Cron key not configured yet. Rotate/generate first.' }, { status: 400 })
  }

  const patch: any = {}
  if (typeof enabled !== 'undefined') patch.enabled = enabled
  if (typeof defaultRunLimit !== 'undefined') patch.default_run_limit = defaultRunLimit

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await (service.from('external_sources_cron_secrets') as any)
    .update(patch)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
