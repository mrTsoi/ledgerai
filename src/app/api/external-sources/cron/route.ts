import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase, user.id, 'ai_access')
    if (!ok) {
      return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }
  const { data } = await service
    .from('external_sources_cron_secrets')
    .select('enabled, default_run_limit, key_prefix, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured: true,
    enabled: !!(data as { enabled?: boolean } | null)?.enabled,
    default_run_limit: Number(((data as { default_run_limit?: number } | null)?.default_run_limit) || 10),
    key_prefix: (data as { key_prefix?: string } | null)?.key_prefix as string,
    updated_at: (data as { updated_at?: string } | null)?.updated_at as string,
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase, user.id, 'ai_access')
    if (!ok) {
      return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const tenantId = body?.tenant_id as string | undefined
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('memberships')
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

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }

  // Only allow updating config if already configured (key exists)
  const { data: existing } = await service
    .from('external_sources_cron_secrets')
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

  const { error } = await service.from('external_sources_cron_secrets').update(patch).eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
