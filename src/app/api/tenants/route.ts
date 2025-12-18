import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: Request) {
  // Create tenant
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; slug?: string; locale?: string }
  try {
    body = (await req.json()) as unknown as { name?: string; slug?: string; locale?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  const name = (body?.name || '').trim()
  const slug = (body?.slug || '').trim()
  const locale = (body?.locale || 'en').trim()

  if (!name) return badRequest('name is required')
  if (!slug) return badRequest('slug is required')

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name,
      slug,
      locale,
      owner_id: user.id,
      is_active: true,
    })
    .select()
    .single()

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 400 })

  // Some schemas rely on triggers to create memberships; but if not present, ensure membership exists.
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ tenant_id: tenant?.id, user_id: user.id, role: 'COMPANY_ADMIN', is_active: true })
    .select()
    .maybeSingle()

  // Ignore duplicate/trigger-created membership errors.
  if (membershipError && !String(membershipError.message || '').toLowerCase().includes('duplicate')) {
    // best-effort: do not fail tenant creation if membership insert fails
  }

  return NextResponse.json({ tenant })
}

export async function PUT(req: Request) {
  // Update tenant (name/locale/currency)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tenant_id?: string; name?: string; locale?: string; currency?: string }
  try {
    body = (await req.json()) as unknown as { tenant_id?: string; name?: string; locale?: string; currency?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body?.tenant_id) return badRequest('tenant_id is required')

  const payload: Record<string, string> = {}
  if (typeof body?.name === 'string') payload.name = body.name
  if (typeof body?.locale === 'string') payload.locale = body.locale
  if (typeof body?.currency === 'string') payload.currency = body.currency

  const { error } = await supabase.from('tenants').update(payload).eq('id', body.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
