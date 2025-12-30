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
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

    try {
      const { data: row } = await (createServiceClient().from('external_sources_cron_secrets') as any)
        .select('enabled, key_prefix, default_run_limit')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      return NextResponse.json({ configured: !!(row as any)?.key_prefix, enabled: !!(row as any)?.enabled, key_prefix: (row as any)?.key_prefix, default_run_limit: (row as any)?.default_run_limit })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Failed to fetch cron settings' }, { status: 500 })
    }
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/cron', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

