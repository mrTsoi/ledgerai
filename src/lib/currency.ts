export async function getExchangeRate(from: string, to: string, tenantId?: string): Promise<number> {
  const fromUpper = String(from).toUpperCase()
  const toUpper = String(to).toUpperCase()
  if (fromUpper === toUpper) return 1.0

  const params = new URLSearchParams({ from: fromUpper, to: toUpper })
  if (tenantId) params.set('tenant_id', tenantId)

  const res = await fetch(`/api/exchange-rates/cross?${params.toString()}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error || 'Failed to fetch exchange rate')
  }

  const rate = Number(json?.rate)
  if (!Number.isFinite(rate)) {
    throw new Error('Invalid exchange rate')
  }

  return rate
}
