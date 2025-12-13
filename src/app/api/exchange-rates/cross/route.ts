import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const MOCK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CNY: 7.19,
  JPY: 148.5,
  AUD: 1.52,
  CAD: 1.35,
  HKD: 7.82,
  SGD: 1.34,
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  const from = (url.searchParams.get('from') || '').toUpperCase()
  const to = (url.searchParams.get('to') || '').toUpperCase()

  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  if (from === to) return NextResponse.json({ rate: 1.0 })

  // If tenant_id not provided, just do mock cross rates.
  if (!tenantId) {
    const fromRate = MOCK_RATES[from] || 1.0
    const toRate = MOCK_RATES[to] || 1.0
    return NextResponse.json({ rate: toRate / fromRate })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Require auth for tenant-scoped rate lookups.
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: tenant } = await (supabase.from('tenants') as any)
    .select('currency')
    .eq('id', tenantId)
    .maybeSingle()

  const base = (tenant as any)?.currency || 'USD'

  const getRateToBase = async (currency: string): Promise<number | null> => {
    if (currency === base) return 1.0
    const { data } = await (supabase.from('exchange_rates') as any)
      .select('rate')
      .eq('tenant_id', tenantId)
      .eq('currency', currency)
      .maybeSingle()
    if (!data) return null
    const n = Number((data as any).rate)
    return Number.isFinite(n) ? n : null
  }

  const [rateFrom, rateTo] = await Promise.all([getRateToBase(from), getRateToBase(to)])

  if (rateFrom !== null && rateTo !== null) {
    return NextResponse.json({ rate: rateFrom / rateTo })
  }

  const fromRate = MOCK_RATES[from] || 1.0
  const toRate = MOCK_RATES[to] || 1.0
  return NextResponse.json({ rate: toRate / fromRate })
}
