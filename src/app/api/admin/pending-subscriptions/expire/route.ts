import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/types/database.types'
import { createClient } from '@/lib/supabase/server'

// POST: { id: string } or { ids: string[] }
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
  if (error || isSuperAdmin !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const ids: string[] = body.ids || (body.id ? [body.id] : [])
  if (!ids.length) {
    return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
  }
  const now = new Date().toISOString()
  // update each id via the typed helper
  const { updatePendingSubscriptionById } = await import('../../../../../lib/supabase/typed')
  for (const id of ids) {
    const { error } = await updatePendingSubscriptionById(id, { expires_at: now, consumed_at: now })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ success: true })
}
