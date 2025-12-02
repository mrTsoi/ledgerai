import { createClient } from '@/lib/supabase/client'

// Simple currency exchange service
// In a real app, this would call an external API like OpenExchangeRates or Fixer.io

const MOCK_RATES: Record<string, number> = {
  'USD': 1.0,
  'EUR': 0.92,
  'GBP': 0.79,
  'CNY': 7.19,
  'JPY': 148.5,
  'AUD': 1.52,
  'CAD': 1.35,
  'HKD': 7.82,
  'SGD': 1.34
}

export async function getExchangeRate(from: string, to: string, tenantId?: string): Promise<number> {
  // 1. Try to get custom rate from DB if tenantId provided
  if (tenantId) {
    const supabase = createClient()
    
    // Fetch tenant base currency
    const { data: tenant } = await supabase
      .from('tenants')
      .select('currency')
      .eq('id', tenantId)
      .single()
      
    if (tenant) {
      const base = tenant.currency || 'USD'
      
      // If converting to/from same currency
      if (from === to) return 1.0

      // Helper to get rate relative to base (1 Unit = X Base)
      const getRateToBase = async (currency: string): Promise<number | null> => {
        if (currency === base) return 1.0
        
        const { data } = await supabase
          .from('exchange_rates')
          .select('rate')
          .eq('tenant_id', tenantId)
          .eq('currency', currency)
          .maybeSingle()
          
        return data ? Number(data.rate) : null
      }

      const [rateFrom, rateTo] = await Promise.all([
        getRateToBase(from),
        getRateToBase(to)
      ])

      // If both rates exist in DB (or are base), calculate cross rate
      if (rateFrom !== null && rateTo !== null) {
        // 1 From = rateFrom Base
        // 1 To = rateTo Base => 1 Base = 1/rateTo To
        // 1 From = rateFrom * (1/rateTo) To = rateFrom / rateTo
        return rateFrom / rateTo
      }
    }
  }

  // Fallback to Mock
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500))

  const fromRate = MOCK_RATES[from] || 1.0
  const toRate = MOCK_RATES[to] || 1.0

  // Calculate cross rate
  // e.g. EUR -> GBP = (1/0.92) * 0.79 = 0.858
  return toRate / fromRate
}
