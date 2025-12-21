'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTenant } from '@/hooks/use-tenant'
import { useSubscription } from '@/hooks/use-subscription'
import { isFeatureEnabled } from '@/lib/subscription/features'
import { useLiterals } from '@/hooks/use-literals'
import { toast } from 'sonner'

type TaxSettingsRecord = {
  tenant_id: string
  locale: string | null
  tax_registration_id: string | null
  default_tax_rate: number
}

type TaxEstimate = {
  document_count: number
  taxable_total: number
  estimated_tax_total: number
  cached: boolean
  computed_at?: string | null
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export function TaxSettings() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const { subscription, loading: subscriptionLoading } = useSubscription()

  const [isLoading, setIsLoading] = React.useState(false)
  const [settings, setSettings] = React.useState<TaxSettingsRecord | null>(null)

  const [locale, setLocale] = React.useState('')
  const [taxRegistrationId, setTaxRegistrationId] = React.useState('')
  const [defaultTaxRatePercent, setDefaultTaxRatePercent] = React.useState('')

  const [estimateStart, setEstimateStart] = React.useState('')
  const [estimateEnd, setEstimateEnd] = React.useState('')
  const [estimateResult, setEstimateResult] = React.useState<TaxEstimate | null>(null)

  const allowed = isFeatureEnabled(subscription?.features, 'tax_automation')
  React.useEffect(() => {
    if (!currentTenant?.id || !allowed) return

    const run = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/tax/settings?tenant_id=${encodeURIComponent(currentTenant.id)}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Failed to load tax settings')

        const loaded = (json?.settings as TaxSettingsRecord | null) || null
        setSettings(loaded)
        setLocale(loaded?.locale || '')
        setTaxRegistrationId(loaded?.tax_registration_id || '')
        setDefaultTaxRatePercent(
          typeof loaded?.default_tax_rate === 'number' ? String(Math.round(loaded.default_tax_rate * 10000) / 100) : ''
        )
      } catch (e: any) {
        toast.error(e?.message || lt('Failed to load tax settings'))
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [currentTenant?.id, allowed, lt])

  if (subscriptionLoading) return null
  if (!allowed) return null
  if (!currentTenant?.id) return null

  const onSave = async () => {
    setIsLoading(true)
    try {
      const percent = defaultTaxRatePercent.trim() === '' ? 0 : Number(defaultTaxRatePercent)
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error(lt('Default tax rate must be between 0 and 100 (percent)'))
      }

      const res = await fetch('/api/tax/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          locale: locale.trim() || null,
          tax_registration_id: taxRegistrationId.trim() || null,
          default_tax_rate: percent / 100,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to save tax settings')

      setSettings({
        tenant_id: currentTenant.id,
        locale: locale.trim() || null,
        tax_registration_id: taxRegistrationId.trim() || null,
        default_tax_rate: percent / 100,
      })

      toast.success(lt('Tax settings updated'))
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to save'))
    } finally {
      setIsLoading(false)
    }
  }

  const onEstimate = async () => {
    setIsLoading(true)
    setEstimateResult(null)
    try {
      if (!estimateStart || !estimateEnd) throw new Error(lt('Start date and end date are required'))
      const res = await fetch('/api/tax/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          start_date: estimateStart,
          end_date: estimateEnd,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to estimate tax'))

      const row = json?.result || json
      setEstimateResult({
        document_count: toNumber(row?.document_count ?? json?.document_count),
        taxable_total: toNumber(row?.taxable_total ?? json?.taxable_total),
        estimated_tax_total: toNumber(row?.estimated_tax_total ?? json?.estimated_tax_total),
        cached: json?.cached === true,
        computed_at: typeof row?.computed_at === 'string' ? row.computed_at : null,
      })
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to estimate'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{lt('Tax Settings')}</CardTitle>
          <CardDescription>{lt('Configure tenant defaults used for tax automation.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-locale">{lt('Locale')}</Label>
            <Input
              id="tax-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder={lt('e.g., en-US, th-TH')}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-registration">{lt('Tax Registration ID')}</Label>
            <Input
              id="tax-registration"
              value={taxRegistrationId}
              onChange={(e) => setTaxRegistrationId(e.target.value)}
              placeholder={lt('VAT/GST ID (optional)')}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-rate">{lt('Default Tax Rate (%)')}</Label>
            <Input
              id="tax-rate"
              inputMode="decimal"
              value={defaultTaxRatePercent}
              onChange={(e) => setDefaultTaxRatePercent(e.target.value)}
              placeholder={lt('e.g., 7')}
              disabled={isLoading}
            />
          </div>

          <Button onClick={onSave} disabled={isLoading}>
            {lt('Save')}
          </Button>

          <div className="text-sm text-muted-foreground">
            {lt('Automation behavior: if AI extraction does not provide a tax amount, LedgerAI will compute it as')}
            <span className="font-medium"> {lt('total_amount × default_tax_rate')}</span> {lt('when possible.')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Tax Estimate')}</CardTitle>
          <CardDescription>{lt('Summarizes extracted tax amounts for a date range.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tax-est-start">{lt('Start date')}</Label>
              <Input
                id="tax-est-start"
                type="date"
                value={estimateStart}
                onChange={(e) => setEstimateStart(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-est-end">{lt('End date')}</Label>
              <Input
                id="tax-est-end"
                type="date"
                value={estimateEnd}
                onChange={(e) => setEstimateEnd(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <Button onClick={onEstimate} disabled={isLoading}>
            {lt('Get estimate')}
          </Button>

          {estimateResult ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">{lt('Documents')}</div>
                <div className="text-2xl font-semibold">{estimateResult.document_count}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">{lt('Taxable total')}</div>
                <div className="text-2xl font-semibold">{formatMoney(estimateResult.taxable_total)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">{lt('Estimated tax')}</div>
                <div className="text-2xl font-semibold">{formatMoney(estimateResult.estimated_tax_total)}</div>
              </div>
            </div>
          ) : null}

          {estimateResult ? (
            <div className="text-sm text-muted-foreground">
              {estimateResult.cached ? lt('Cached result') : lt('Freshly computed')}
              {estimateResult.cached && estimateResult.computed_at
                ? ` (${lt('computed')} ${formatDateTime(estimateResult.computed_at)})`
                : ''}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
