import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Body = {
  setting_key: string
  setting_value: any
  scope:
    | 'current'
    | 'all_managed'
    | 'selected_managed'
    | 'all_platform'
    | 'selected_platform'
    // Back-compat (older clients)
    | 'all_visible'
    | 'selected'
  tenant_id?: string
  tenant_ids?: string[]
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === 'string' && v.length > 0)))
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.setting_key || typeof body.setting_key !== 'string') {
    return NextResponse.json({ error: 'setting_key is required' }, { status: 400 })
  }

  if (!body?.scope) {
    return NextResponse.json({ error: 'scope is required' }, { status: 400 })
  }

  // Load memberships to determine permissions
  const { data: membershipRows, error: membershipError } = await supabase
    .from('memberships')
    .select('tenant_id, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  const memberships = (membershipRows || []) as { tenant_id: string; role: string; is_active: boolean }[]
  const isSuperAdmin = memberships.some((m) => m.role === 'SUPER_ADMIN')

  // Tenants the user explicitly manages in a tenant-context sense.
  const managedTenantIds = uniqueStrings(memberships.map((m) => m.tenant_id))

  let targetTenantIds: string[] = []

  // Normalize legacy scopes
  const normalizedScope: Body['scope'] =
    body.scope === 'all_visible' ? (isSuperAdmin ? 'all_platform' : 'all_managed') : body.scope === 'selected' ? 'selected_managed' : body.scope

  if (normalizedScope === 'current') {
    if (!body.tenant_id) return NextResponse.json({ error: 'tenant_id is required for scope=current' }, { status: 400 })

    targetTenantIds = [body.tenant_id]
  } else if (normalizedScope === 'selected_managed') {
    const requested = uniqueStrings(body.tenant_ids || [])
    if (requested.length === 0) {
      return NextResponse.json({ error: 'tenant_ids is required for scope=selected_managed' }, { status: 400 })
    }
    targetTenantIds = requested
  } else if (normalizedScope === 'all_managed') {
    targetTenantIds = managedTenantIds
  } else if (normalizedScope === 'selected_platform') {
    if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const requested = uniqueStrings(body.tenant_ids || [])
    if (requested.length === 0) {
      return NextResponse.json({ error: 'tenant_ids is required for scope=selected_platform' }, { status: 400 })
    }
    targetTenantIds = requested
  } else if (normalizedScope === 'all_platform') {
    if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id')
    if (tenantsError) {
      return NextResponse.json({ error: tenantsError.message }, { status: 400 })
    }
    targetTenantIds = uniqueStrings(((tenants || []) as { id: string }[]).map((t) => t.id))
  } else {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }

  // Permission check: managed scopes must be limited to explicitly-managed tenants
  if (normalizedScope === 'current' || normalizedScope === 'all_managed' || normalizedScope === 'selected_managed') {
    const allowedSet = new Set(managedTenantIds)
    const forbidden = targetTenantIds.filter((id) => !allowedSet.has(id))
    if (forbidden.length > 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (targetTenantIds.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }

  const now = new Date().toISOString()
  const rows = targetTenantIds.map((tenantId) => ({
    tenant_id: tenantId,
    setting_key: body.setting_key,
    setting_value: body.setting_value,
    updated_at: now,
  }))

  const { error: upsertError } = await (service.from('tenant_settings') as any).upsert(rows, {
    onConflict: 'tenant_id,setting_key',
  })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ updated: rows.length })
}
