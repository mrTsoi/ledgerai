import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'

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
  _test_only?: boolean
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

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

    let service: ReturnType<typeof createServiceClient>
    try {
      service = createServiceClient()
    } catch {
      return NextResponse.json(
        { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 503 }
      )
    }

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

    if (sourceError) {
      if (isPostgrestRelationMissing(sourceError, 'external_document_sources')) {
        return NextResponse.json(
          {
            error: sourceError.message,
            ...missingRelationHint('external_document_sources'),
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: sourceError.message }, { status: 500 })
    }

    const sourceId = (sourceRow as any).id as string

    if (!body._test_only && typeof body.secrets !== 'undefined') {
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
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/upsert', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
