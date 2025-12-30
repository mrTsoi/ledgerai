import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

const ALLOWED_ROLES = ['COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR', 'SUPER_ADMIN'] as const
type AllowedRole = (typeof ALLOWED_ROLES)[number]

function isAllowedRole(role: string): role is AllowedRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role)
}

async function requireTenantAdmin(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  tenantId: string
}) {
  const { supabase, userId, tenantId } = opts
  const { data, error } = await supabase
    .from('memberships')
    .select('role,is_active')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return { ok: false as const, reason: error.message }
  }

  const role = (data?.role ?? null) as string | null
  const isActive = Boolean(data?.is_active)
  const isAdmin = isActive && (role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN')

  if (!isAdmin) {
    return { ok: false as const, reason: 'Forbidden' }
  }

  return { ok: true as const, role }
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

  const authz = await requireTenantAdmin({ supabase, userId: user.id, tenantId })
  if (!authz.ok) return NextResponse.json({ error: authz.reason }, { status: authz.reason === 'Forbidden' ? 403 : 400 })

  const { data, error } = await supabase
    .from('memberships')
    .select('*, profiles (*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ members: data || [] })
}

export async function POST(req: Request) {
  // Invite via Supabase Auth: send an email invite. A DB trigger will create
  // the profile + membership for new users. For existing users, we upsert
  // membership by email after a successful invite.
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tenant_id?: string; email?: string; role?: string; locale?: string }
  try {
    body = (await req.json()) as unknown as { tenant_id?: string; email?: string; role?: string; locale?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  const email = (body?.email || '').trim().toLowerCase()
  const role = (body?.role || 'OPERATOR').trim()
  const locale = (body?.locale || 'en').trim()

  if (!tenantId) return badRequest('tenant_id is required')
  if (!email) return badRequest('email is required')
  if (!isAllowedRole(role)) return badRequest('role is invalid')

  const authz = await requireTenantAdmin({ supabase, userId: user.id, tenantId })
  if (!authz.ok) return NextResponse.json({ error: authz.reason }, { status: authz.reason === 'Forbidden' ? 403 : 400 })
  if (role === 'SUPER_ADMIN' && authz.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || new URL(req.url).origin
  const redirectTo = `${origin.replace(/\/$/, '')}/${encodeURIComponent(locale)}/auth/callback?next=${encodeURIComponent(
    `/${locale}/dashboard`
  )}`

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invited_tenant_id: tenantId,
      invited_role: role,
      invited_by: user.id,
    },
  })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  // Ensure membership exists for both existing and newly invited users.
  const { data: invitedProfile, error: invitedProfileError } = await service
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (invitedProfileError) {
    return NextResponse.json({ error: invitedProfileError.message }, { status: 400 })
  }

  if (invitedProfile?.id) {
    const { error: membershipError } = await service.from('memberships').upsert(
      {
        tenant_id: tenantId,
        user_id: invitedProfile.id,
        role,
        is_active: true,
      },
      { onConflict: 'tenant_id,user_id' }
    )

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, invited: true })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; role?: string; is_active?: boolean }
  try {
    body = (await req.json()) as unknown as { id?: string; role?: string; is_active?: boolean }
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body?.id) return badRequest('id is required')

  // Prevent IDOR: load membership and enforce admin rights on its tenant.
  const { data: existingMembership, error: existingMembershipError } = await supabase
    .from('memberships')
    .select('id, tenant_id, user_id, role')
    .eq('id', body.id)
    .maybeSingle()

  if (existingMembershipError) {
    return NextResponse.json({ error: existingMembershipError.message }, { status: 400 })
  }
  if (!existingMembership?.tenant_id) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  const authz = await requireTenantAdmin({ supabase, userId: user.id, tenantId: existingMembership.tenant_id })
  if (!authz.ok) return NextResponse.json({ error: authz.reason }, { status: authz.reason === 'Forbidden' ? 403 : 400 })

  const payload: any = {}
  if (typeof body?.role === 'string') {
    const nextRole = body.role.trim()
    if (!isAllowedRole(nextRole)) return badRequest('role is invalid')
    if (nextRole === 'SUPER_ADMIN' && authz.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Do not allow tenant admins to modify SUPER_ADMIN memberships.
    if ((existingMembership.role as string | null) === 'SUPER_ADMIN' && authz.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    payload.role = nextRole
  }
  if (typeof body?.is_active === 'boolean') payload.is_active = body.is_active

  const { error } = await supabase.from('memberships').update(payload).eq('id', body.id)
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
  const id = url.searchParams.get('id')
  if (!id) return badRequest('id is required')

  // Prevent IDOR: load membership and enforce admin rights on its tenant.
  const { data: existingMembership, error: existingMembershipError } = await supabase
    .from('memberships')
    .select('id, tenant_id, user_id, role')
    .eq('id', id)
    .maybeSingle()

  if (existingMembershipError) {
    return NextResponse.json({ error: existingMembershipError.message }, { status: 400 })
  }
  if (!existingMembership?.tenant_id) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  const authz = await requireTenantAdmin({ supabase, userId: user.id, tenantId: existingMembership.tenant_id })
  if (!authz.ok) return NextResponse.json({ error: authz.reason }, { status: authz.reason === 'Forbidden' ? 403 : 400 })
  if ((existingMembership.role as string | null) === 'SUPER_ADMIN' && authz.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('memberships').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
