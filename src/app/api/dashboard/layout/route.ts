import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getDefaultTemplateKeyForRole,
  getTemplateByKey,
  isTemplateAllowedForRole,
  sanitizeLayoutForTemplate,
  type DashboardLayoutV1,
  type UserRole,
} from '@/lib/dashboard/registry'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

async function resolveUserRole(supabase: any, userId: string, tenantId: string): Promise<UserRole | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role, is_active')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (membershipError && membershipError.code !== 'PGRST116') {
    throw new Error(membershipError.message)
  }

  if (membership && membership.is_active !== false) {
    return membership.role as UserRole
  }

  const { data: saMemberships, error: saError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .limit(1)

  if (saError) throw new Error(saError.message)
  if ((saMemberships || []).length > 0) return 'SUPER_ADMIN'

  return null
}

async function resolveTemplateKey(supabase: any, tenantId: string, userId: string, role: UserRole): Promise<string> {
  const { data: pref, error } = await (supabase.from('dashboard_preferences') as any)
    .select('selected_template_key')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)

  const selectedTemplateKey = (pref as any)?.selected_template_key as string | undefined
  if (selectedTemplateKey) {
    if (role === 'SUPER_ADMIN') {
      if (getTemplateByKey(selectedTemplateKey)) return selectedTemplateKey
    } else {
      if (isTemplateAllowedForRole(selectedTemplateKey, role)) return selectedTemplateKey
    }
  }

  return getDefaultTemplateKeyForRole(role)
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

  let role: UserRole | null
  try {
    role = await resolveUserRole(supabase, user.id, tenantId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to resolve role' }, { status: 400 })
  }

  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const templateKeyParam = url.searchParams.get('template_key')
  const templateKey = templateKeyParam || (await resolveTemplateKey(supabase, tenantId, user.id, role))

  if (role !== 'SUPER_ADMIN' && !isTemplateAllowedForRole(templateKey, role)) {
    return NextResponse.json({ error: 'Template not allowed for role' }, { status: 403 })
  }

  const tpl = getTemplateByKey(templateKey)
  if (!tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  // Resolution order: user override -> tenant published default -> code default.
  const [{ data: userLayout, error: userLayoutError }, { data: tenantLayout, error: tenantLayoutError }] = await Promise.all([
    (supabase.from('dashboard_layouts') as any)
      .select('layout_json')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('template_key', templateKey)
      .maybeSingle(),
    (supabase.from('tenant_dashboard_layouts') as any)
      .select('layout_json')
      .eq('tenant_id', tenantId)
      .eq('template_key', templateKey)
      .maybeSingle(),
  ])

  if (userLayoutError && userLayoutError.code !== 'PGRST116') {
    return NextResponse.json({ error: userLayoutError.message }, { status: 400 })
  }
  if (tenantLayoutError && tenantLayoutError.code !== 'PGRST116') {
    return NextResponse.json({ error: tenantLayoutError.message }, { status: 400 })
  }

  let source: 'user' | 'tenant' | 'code' = 'code'
  let layout: DashboardLayoutV1 = tpl.defaultLayout

  if ((userLayout as any)?.layout_json) {
    source = 'user'
    layout = sanitizeLayoutForTemplate((userLayout as any).layout_json, templateKey)
  } else if ((tenantLayout as any)?.layout_json) {
    source = 'tenant'
    layout = sanitizeLayoutForTemplate((tenantLayout as any).layout_json, templateKey)
  } else {
    layout = sanitizeLayoutForTemplate(tpl.defaultLayout, templateKey)
  }

  return NextResponse.json({
    role,
    template_key: templateKey,
    layout,
    source,
  })
}

export async function POST(req: Request) {
  // Save per-user override.
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
  const templateKey = body?.template_key
  const layoutJson = body?.layout_json

  if (!tenantId) return badRequest('tenant_id is required')
  if (!templateKey || typeof templateKey !== 'string') return badRequest('template_key is required')

  let role: UserRole | null
  try {
    role = await resolveUserRole(supabase, user.id, tenantId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to resolve role' }, { status: 400 })
  }

  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (role === 'SUPER_ADMIN') {
    if (!getTemplateByKey(templateKey)) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  } else {
    if (!isTemplateAllowedForRole(templateKey, role)) return NextResponse.json({ error: 'Template not allowed for role' }, { status: 403 })
  }

  const sanitized = sanitizeLayoutForTemplate(layoutJson, templateKey)

  const payload = {
    tenant_id: tenantId,
    user_id: user.id,
    template_key: templateKey,
    layout_json: sanitized,
  }

  const { error } = await (supabase.from('dashboard_layouts') as any).upsert(payload, {
    onConflict: 'tenant_id,user_id,template_key',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, layout: sanitized })
}

export async function PUT(req: Request) {
  // Publish tenant default layout (COMPANY_ADMIN or SUPER_ADMIN).
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
  const templateKey = body?.template_key
  const layoutJson = body?.layout_json

  if (!tenantId) return badRequest('tenant_id is required')
  if (!templateKey || typeof templateKey !== 'string') return badRequest('template_key is required')

  const tpl = getTemplateByKey(templateKey)
  if (!tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  let role: UserRole | null
  try {
    role = await resolveUserRole(supabase, user.id, tenantId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to resolve role' }, { status: 400 })
  }

  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Admin check: either COMPANY_ADMIN in this tenant, or SUPER_ADMIN (global or tenant).
  const isAdmin = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sanitized = sanitizeLayoutForTemplate(layoutJson, templateKey)

  const payload = {
    tenant_id: tenantId,
    template_key: templateKey,
    layout_json: sanitized,
    published_by_user_id: user.id,
    published_at: new Date().toISOString(),
  }

  const { error } = await (supabase.from('tenant_dashboard_layouts') as any).upsert(payload, {
    onConflict: 'tenant_id,template_key',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  const templateKey = url.searchParams.get('template_key')
  const scope = url.searchParams.get('scope') || 'user'

  if (!tenantId) return badRequest('tenant_id is required')
  if (!templateKey) return badRequest('template_key is required')

  let role: UserRole | null
  try {
    role = await resolveUserRole(supabase, user.id, tenantId)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to resolve role' }, { status: 400 })
  }

  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (scope === 'tenant') {
    const isAdmin = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await (supabase.from('tenant_dashboard_layouts') as any)
      .delete()
      .eq('tenant_id', tenantId)
      .eq('template_key', templateKey)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Default: delete user override
  const { error } = await (supabase.from('dashboard_layouts') as any)
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('template_key', templateKey)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
