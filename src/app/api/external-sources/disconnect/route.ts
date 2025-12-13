import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Body = {
  source_id: string
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

  if (!body?.source_id) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

  const service = createServiceClient()

  const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
    .select('id, tenant_id')
    .eq('id', body.source_id)
    .single()

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 400 })

  const { data: membership } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', (source as any).tenant_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await (service.from('external_document_source_secrets') as any).upsert(
    { source_id: body.source_id, secrets: {} },
    { onConflict: 'source_id' }
  )

  return NextResponse.json({ ok: true })
}
