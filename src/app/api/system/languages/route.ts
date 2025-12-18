import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase.from('system_languages').select('*').order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ languages: data || [] })
}
