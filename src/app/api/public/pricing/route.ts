import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type ContactConfig = {
  whatsapp: string
  email: string
}

export async function GET() {
  const supabase = await createClient()

  const { data: contactRow } = await supabase.from('system_settings').select('setting_value').eq('setting_key', 'contact_sales_config').maybeSingle()

  const contact_config = (contactRow?.setting_value as ContactConfig) || { whatsapp: '', email: '' }

  const { data: plans, error: plansError } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('price_monthly', { ascending: true })

  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 400 })

  return NextResponse.json({ plans: plans || [], contact_config })
}
