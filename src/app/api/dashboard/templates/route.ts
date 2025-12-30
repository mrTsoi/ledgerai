import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DASHBOARD_TEMPLATES, getDefaultTemplateKeyForRole, getTemplatesForRole, type UserRole } from '@/lib/dashboard/registry'

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

  const templatesSource = role === 'SUPER_ADMIN' ? DASHBOARD_TEMPLATES : getTemplatesForRole(role)
  const templates = templatesSource.map(t => ({
    key: t.key,
    name: t.name,
    description: t.description,
    role: t.role,
  }))

  return NextResponse.json({
    role,
    default_template_key: getDefaultTemplateKeyForRole(role),
    templates,
  })
}
