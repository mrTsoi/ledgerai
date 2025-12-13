import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })

  const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 })
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (supabase.from('external_document_sources') as any)
    .select('id, tenant_id, name, provider, enabled, schedule_minutes, last_run_at, config, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: data || [] })
}
