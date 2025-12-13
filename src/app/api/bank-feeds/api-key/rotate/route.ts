import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateTenantWebhookKey, hashTenantWebhookKey } from '@/lib/bank-feed-keys'
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
    const ok = await userHasFeature(supabase as any, user.id, 'bank_integration')
    if (!ok) {
      return NextResponse.json({ error: 'Bank feeds are not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  let tenantId: string
  try {
    const body = (await req.json()) as Body
    tenantId = body?.tenant_id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { key, prefix } = generateTenantWebhookKey()
    const hash = hashTenantWebhookKey(key)

    // Revoke existing keys for this tenant (service role bypasses RLS for the secrets table)
    let service: ReturnType<typeof createServiceClient>
    try {
      service = createServiceClient()
    } catch {
      return NextResponse.json(
        { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 503 }
      )
    }

    await (service.from('bank_feed_api_keys') as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .is('revoked_at', null)

    const { data: apiKeyRow, error: apiKeyError } = await (service.from('bank_feed_api_keys') as any)
      .insert({
        tenant_id: tenantId,
        key_prefix: prefix,
        created_by: user.id,
      })
      .select('id, key_prefix, created_at')
      .single()

    if (apiKeyError) {
      return NextResponse.json({ error: apiKeyError.message }, { status: 500 })
    }

    const apiKeyId = (apiKeyRow as any).id as string

    const { error: secretError } = await (service.from('bank_feed_api_key_secrets') as any).upsert(
      {
        api_key_id: apiKeyId,
        key_hash: hash,
      },
      { onConflict: 'api_key_id' }
    )

    if (secretError) {
      return NextResponse.json({ error: secretError.message }, { status: 500 })
    }

    return NextResponse.json({
      api_key: key,
      key_prefix: prefix,
      created_at: (apiKeyRow as any).created_at,
    })
  } catch (e: any) {
    console.error('Error rotating bank feed api key:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
