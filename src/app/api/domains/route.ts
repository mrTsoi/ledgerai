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

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_domain')
    if (!ok) return NextResponse.json({ error: 'Custom domains are not available on your plan' }, { status: 403 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return badRequest('tenant_id is required')

  const { data, error } = await supabase
    .from('tenant_domains')
    .select('id, tenant_id, domain, is_primary, verified_at, verification_token, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    const status = error.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }

  return NextResponse.json({ domains: data || [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_domain')
    if (!ok) return NextResponse.json({ error: 'Custom domains are not available on your plan' }, { status: 403 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  let body: { tenant_id?: string; domain?: string }
  try {
    body = (await req.json()) as unknown as { tenant_id?: string; domain?: string }
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  const domainRaw = body?.domain

  if (!tenantId) return badRequest('tenant_id is required')
  if (!domainRaw || typeof domainRaw !== 'string') return badRequest('domain is required')

  const domain = domainRaw.trim().toLowerCase()
  if (!domain) return badRequest('domain is required')
  if (domain.includes('://') || domain.includes('/') || domain.includes(' ')) {
    return badRequest('domain must be a hostname like example.com')
  }

  // Determine if this is the first domain for the tenant (make it primary).
  const { data: existing, error: existingError } = await supabase.from('tenant_domains').select('id').eq('tenant_id', tenantId).limit(1)

  if (existingError) {
    const status = existingError.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: existingError.message, code: existingError.code }, { status })
  }

  const isPrimary = !existing || existing.length === 0

  const { error: insertError } = await supabase.from('tenant_domains').insert({
    tenant_id: tenantId,
    domain,
    is_primary: isPrimary,
  })

  if (insertError) {
    const status = insertError.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: insertError.message, code: insertError.code }, { status })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_domain')
    if (!ok) return NextResponse.json({ error: 'Custom domains are not available on your plan' }, { status: 403 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return badRequest('id is required')

  const { error } = await supabase.from('tenant_domains').delete().eq('id', id)

  if (error) {
    const status = error.code === 'PGRST205' ? 500 : 400
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }

  return NextResponse.json({ ok: true })
}
