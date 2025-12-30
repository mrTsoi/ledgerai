import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Body = {
  event: string
  details?: Record<string, any>
}

function hasInternalSecret(req: Request) {
  const provided = req.headers.get('x-internal-security-secret')
  return !!provided && provided === process.env.INTERNAL_SECURITY_SECRET
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body?.event) return NextResponse.json({ error: 'event is required' }, { status: 400 })

  // If not called by internal secret, require authenticated user
  const internal = hasInternalSecret(req)
  let userId: string | null = null
  let userEmail: string | null = null

  if (!internal) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    userEmail = user.email || null
  }

  let svc: ReturnType<typeof createServiceClient>
  try {
    svc = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: 'Service client not configured' }, { status: 500 })
  }

  try {
    await svc.from('audit_logs').insert({
      action: body.event,
      resource_type: 'security_event',
      user_id: userId,
      user_email: userEmail,
      new_data: body.details || {},
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Insert failed' }, { status: 500 })
  }
}
