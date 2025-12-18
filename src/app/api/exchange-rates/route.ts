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

  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('currency')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ rates: data || [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tenant_id?: string; currency?: string; rate?: number }
  try {
    body = (await req.json()) as unknown as { tenant_id?: string; currency?: string; rate?: number }
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body?.tenant_id) return badRequest('tenant_id is required')
  if (!body?.currency) return badRequest('currency is required')
  if (typeof body?.rate !== 'number' || !Number.isFinite(body.rate)) return badRequest('rate is required')

  const { error } = await supabase.from('exchange_rates').insert({
    tenant_id: body.tenant_id,
    currency: String(body.currency).toUpperCase(),
    rate: body.rate,
    is_manual: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; rate?: number }
  try {
    body = (await req.json()) as unknown as { id?: string; rate?: number }
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body?.id) return badRequest('id is required')
  if (typeof body?.rate !== 'number' || !Number.isFinite(body.rate)) return badRequest('rate is required')

  const { error } = await supabase
    .from('exchange_rates')
    .update({ rate: body.rate, is_manual: true })
    .eq('id', body.id)

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

  const { error } = await supabase.from('exchange_rates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
