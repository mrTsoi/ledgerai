import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_user_subscription_details', {
    p_user_id: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const subscription = Array.isArray(data) && data.length > 0 ? data[0] : null
  return NextResponse.json({ subscription })
}
