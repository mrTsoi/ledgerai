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

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return badRequest('tenant_id is required')

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_ai_provider')
    if (!ok) {
      return NextResponse.json({ error: 'Custom AI provider configuration is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const [{ data: providers, error: providersError }, { data: tenantCfg, error: tenantCfgError }] = await Promise.all([
    (supabase.from('ai_providers') as any).select('*').eq('is_active', true).order('display_name'),
    (supabase.from('tenant_ai_configurations') as any)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (providersError) return NextResponse.json({ error: providersError.message }, { status: 400 })
  if (tenantCfgError && tenantCfgError.code !== 'PGRST116') {
    return NextResponse.json({ error: tenantCfgError.message }, { status: 400 })
  }

  return NextResponse.json({ providers: providers || [], tenant_config: tenantCfg || null })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const tenantId = body?.tenant_id
  if (!tenantId) return badRequest('tenant_id is required')

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'custom_ai_provider')
    if (!ok) {
      return NextResponse.json({ error: 'Custom AI provider configuration is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  const payload = {
    tenant_id: tenantId,
    ai_provider_id: body?.ai_provider_id ?? null,
    api_key_encrypted: body?.api_key_encrypted ?? null,
    model_name: body?.model_name ?? null,
    custom_config: body?.custom_config ?? {},
    is_active: body?.is_active !== false,
  }

  const { error } = await (supabase.from('tenant_ai_configurations') as any).upsert(payload, {
    onConflict: 'tenant_id',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
