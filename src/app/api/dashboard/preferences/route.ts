import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDefaultTemplateKeyForRole, getTemplateByKey, isTemplateAllowedForRole, type UserRole } from '@/lib/dashboard/registry'

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

  const { data: pref, error } = await (supabase.from('dashboard_preferences') as any)
    .select('selected_template_key')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 400 })

  const selectedTemplateKey = (pref as any)?.selected_template_key as string | undefined
  const allowedSelected =
    selectedTemplateKey && (role === 'SUPER_ADMIN' ? Boolean(getTemplateByKey(selectedTemplateKey)) : isTemplateAllowedForRole(selectedTemplateKey, role))

  return NextResponse.json({
    role,
    selected_template_key: allowedSelected ? selectedTemplateKey : null,
    default_template_key: getDefaultTemplateKeyForRole(role),
  })
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
  const templateKey = body?.selected_template_key
  if (!tenantId) return badRequest('tenant_id is required')
  if (!templateKey || typeof templateKey !== 'string') return badRequest('selected_template_key is required')

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

  const payload = {
    tenant_id: tenantId,
    user_id: user.id,
    selected_template_key: templateKey,
  }

  const { error } = await (supabase.from('dashboard_preferences') as any).upsert(payload, {
    onConflict: 'tenant_id,user_id',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
