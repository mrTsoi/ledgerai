export async function getExchangeRate(from: string, to: string, tenantId?: string): Promise<{ rate: number; ok: boolean }> {
  const fromUpper = String(from).toUpperCase()
  const toUpper = String(to).toUpperCase()
  if (fromUpper === toUpper) return { rate: 1.0, ok: true }

  const params = new URLSearchParams({ from: fromUpper, to: toUpper })
  if (tenantId) params.set('tenant_id', tenantId)

  try {
    const res = await fetch(`/api/exchange-rates/cross?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.warn('getExchangeRate: non-ok response', json?.error || res.status)
      return { rate: 1.0, ok: false }
    }

    const rate = Number(json?.rate)
    if (!Number.isFinite(rate)) {
      console.warn('getExchangeRate: invalid rate', json)
      return { rate: 1.0, ok: false }
    }

    return { rate, ok: true }
  } catch (err) {
    console.warn('getExchangeRate: fetch failed', err)
    return { rate: 1.0, ok: false }
  }
}
