import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Body = {
  id?: string
  tenant_id: string
  name: string
  provider: 'SFTP' | 'FTPS' | 'GOOGLE_DRIVE' | 'ONEDRIVE'
  enabled: boolean
  schedule_minutes: number
  config: Record<string, any>
  secrets?: Record<string, any>
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

  if (!body?.tenant_id) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  if (!body?.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body?.provider) return NextResponse.json({ error: 'provider is required' }, { status: 400 })

  // Tenant admin check (and tenant membership correctness)
  const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', body.tenant_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()

  const scheduleMinutes = Math.max(5, Number(body.schedule_minutes || 60))

  const { data: sourceRow, error: sourceError } = await (service.from('external_document_sources') as any)
    .upsert(
      {
        id: body.id,
        tenant_id: body.tenant_id,
        name: body.name,
        provider: body.provider,
        enabled: !!body.enabled,
        schedule_minutes: scheduleMinutes,
        config: body.config || {},
        created_by: user.id,
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single()

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 })

  const sourceId = (sourceRow as any).id as string

  if (typeof body.secrets !== 'undefined') {
    const { error: secretsError } = await (service.from('external_document_source_secrets') as any).upsert(
      {
        source_id: sourceId,
        secrets: body.secrets || {},
      },
      { onConflict: 'source_id' }
    )

    if (secretsError) return NextResponse.json({ error: secretsError.message }, { status: 500 })
  }

  return NextResponse.json({ id: sourceId })
}
