import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateExternalSourcesCronKey, hashExternalSourcesCronKey } from '@/lib/external-sources/cron-keys'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

type Body = {
  tenant_id: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase, user.id, 'ai_access')
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

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', body.tenant_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { key, prefix } = generateExternalSourcesCronKey()
  const keyHash = hashExternalSourcesCronKey(key)

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }
  const { error } = await service.from('external_sources_cron_secrets').upsert(
    {
      tenant_id: body.tenant_id,
      key_prefix: prefix,
      key_hash: keyHash,
      enabled: true,
      default_run_limit: 10,
    },
    { onConflict: 'tenant_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    cron_secret: key,
    key_prefix: prefix,
  })
}
