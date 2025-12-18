import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error } = await supabase.from('memberships').select('*, profiles (*)').eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ members: data || [] })
}

export async function POST(req: Request) {
  // Invite: create membership for an existing profile user_id if email exists.
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tenant_id?: string; email?: string; role?: string }
  try {
    body = (await req.json()) as unknown as { tenant_id?: string; email?: string; role?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  const email = (body?.email || '').trim().toLowerCase()
  const role = (body?.role || 'OPERATOR').trim()

  if (!tenantId) return badRequest('tenant_id is required')
  if (!email) return badRequest('email is required')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle()

  if (profileError && profileError.code !== 'PGRST116') {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (!profile?.id) {
    return NextResponse.json({ error: 'User not found. Ask them to sign up first.' }, { status: 400 })
  }

  const { error } = await supabase.from('memberships').upsert(
    {
      tenant_id: tenantId,
      user_id: profile.id,
      role,
      is_active: true,
    },
    { onConflict: 'tenant_id,user_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
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

  const payload: any = {}
  if (typeof body?.role === 'string') payload.role = body.role
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

  const { error } = await supabase.from('memberships').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
