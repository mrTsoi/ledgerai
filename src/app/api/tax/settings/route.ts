import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return badRequest('tenant_id is required')

  // Entitlement
  try {
    const ok = await userHasFeature(supabase as any, user.id, 'tax_automation')
    if (!ok) return NextResponse.json({ error: 'Tax automation is not available on your plan' }, { status: 403 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  // Must belong to tenant
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (supabase.from('tenant_tax_settings') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    const status = error.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }

  return NextResponse.json({ settings: data || null })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  if (!tenantId || typeof tenantId !== 'string') return badRequest('tenant_id is required')

  // Entitlement
  try {
    const ok = await userHasFeature(supabase as any, user.id, 'tax_automation')
    if (!ok) return NextResponse.json({ error: 'Tax automation is not available on your plan' }, { status: 403 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  // Must be tenant admin to change settings
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = (membership as any)?.role as string | undefined
  const canManage = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const payload = {
    tenant_id: tenantId,
    locale: typeof body?.locale === 'string' ? body.locale : null,
    tax_registration_id: typeof body?.tax_registration_id === 'string' ? body.tax_registration_id : null,
    default_tax_rate:
      typeof body?.default_tax_rate === 'number'
        ? body.default_tax_rate
        : typeof body?.default_tax_rate === 'string'
          ? Number(body.default_tax_rate)
          : 0,
  }

  if (!Number.isFinite(payload.default_tax_rate) || payload.default_tax_rate < 0 || payload.default_tax_rate > 1) {
    return badRequest('default_tax_rate must be a number between 0 and 1')
  }

  const { error } = await (supabase.from('tenant_tax_settings') as any).upsert(payload, {
    onConflict: 'tenant_id',
  })

  if (error) {
    const status = error.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }

  return NextResponse.json({ ok: true })
}
