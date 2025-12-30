import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type Body = {
  user_id: string
  tenant_id?: string
  reason?: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Allow if SUPER_ADMIN user or if internal security secret provided
  const internalProvided = req.headers.get('x-internal-security-secret') === process.env.INTERNAL_SECURITY_SECRET

  let isSuper = false
  if (user) {
    const { data: isSuperRaw } = await (supabase as any).rpc('is_super_admin')
    isSuper = isSuperRaw === true
  }

  if (!isSuper && !internalProvided) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  // Use service client to update memberships / deactivate user memberships for tenant
  let svc: ReturnType<typeof createServiceClient>
  try {
    svc = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 500 })
  }

  try {
    // Mark all memberships for this user (optionally filtered by tenant) as inactive
    const q = svc.from('memberships').update({ is_active: false }).eq('user_id', body.user_id)
    if (body.tenant_id) q.eq('tenant_id', body.tenant_id)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log the suspension to audit_logs
    await svc.from('audit_logs').insert({
      action: 'auto_suspend',
      resource_type: 'user',
      resource_id: body.user_id,
      new_data: { reason: body.reason || 'security_monitor_auto_suspend', tenant_id: body.tenant_id || null },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Suspend failed' }, { status: 500 })
  }
}
