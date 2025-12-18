import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/types/database.types'

// POST: { id: string } or { ids: string[] }
export async function POST(req: Request) {
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
