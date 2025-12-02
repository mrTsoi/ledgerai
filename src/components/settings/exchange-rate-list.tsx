'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Plus, Trash2, Save, X } from 'lucide-react'
import { Database } from '@/types/database.types'

type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']

const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' }
]

export function ExchangeRateList() {
  const { currentTenant } = useTenant()
  const userRole = useUserRole()
  const supabase = createClient()
  
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  
  const [newRate, setNewRate] = useState({
    currency: 'EUR',
    rate: ''
  })

  const canEdit = userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ACCOUNTANT'
  const baseCurrency = (currentTenant as any)?.currency || 'USD'

  useEffect(() => {
    if (currentTenant) {
      fetchRates()
    }
  }, [currentTenant])

  const fetchRates = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('tenant_id', currentTenant!.id)
        .order('currency')

      if (error) throw error
      setRates(data || [])
    } catch (error) {
      console.error('Error fetching rates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRate = async () => {
    if (!currentTenant || !newRate.rate) return

    try {
      setSaving(true)
      const { error } = await supabase
        .from('exchange_rates')
        .insert({
          tenant_id: currentTenant.id,
          currency: newRate.currency,
          rate: parseFloat(newRate.rate),
          is_manual: true
        })

      if (error) throw error
      
      await fetchRates()
      setIsAdding(false)
      setNewRate({ currency: 'EUR', rate: '' })
    } catch (error: any) {
      alert('Failed to add rate: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRate = async (id: string) => {
    if (!confirm('Are you sure you want to remove this custom exchange rate?')) return

    try {
      const { error } = await supabase
        .from('exchange_rates')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchRates()
    } catch (error: any) {
      alert('Failed to delete rate: ' + error.message)
    }
  }

  const handleUpdateRate = async (id: string, newRateValue: number) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ rate: newRateValue })
        .eq('id', id)

      if (error) throw error
      await fetchRates()
    } catch (error: any) {
      alert('Failed to update rate: ' + error.message)
    }
  }

  if (!currentTenant) return null

  // Filter out base currency and already added currencies from the dropdown
  const availableCurrencies = SUPPORTED_CURRENCIES.filter(
    c => c.code !== baseCurrency && !rates.find(r => r.currency === c.code)
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Exchange Rates</CardTitle>
          <CardDescription>
            Manage custom exchange rates relative to your base currency ({baseCurrency}).
          </CardDescription>
        </div>
        {canEdit && !isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Rate
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Header */}
          <div className="grid grid-cols-3 gap-4 font-medium text-sm text-gray-500 pb-2 border-b">
            <div>Currency</div>
            <div>Rate (1 Unit = ? {baseCurrency})</div>
            <div className="text-right">Actions</div>
          </div>

          {/* List */}
          {rates.map((rate) => (
            <div key={rate.id} className="grid grid-cols-3 gap-4 items-center py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{rate.currency}</span>
                <span className="text-xs text-gray-500">
                  {SUPPORTED_CURRENCIES.find(c => c.code === rate.currency)?.name}
                </span>
              </div>
              <div>
                <Input
                  type="number"
                  step="0.000001"
                  defaultValue={rate.rate}
                  className="h-8 w-32"
                  disabled={!canEdit}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value)
                    if (val !== rate.rate) handleUpdateRate(rate.id, val)
                  }}
                />
              </div>
              <div className="text-right">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => handleDeleteRate(rate.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {rates.length === 0 && !isAdding && (
            <div className="text-center py-4 text-gray-500 text-sm">
              No custom exchange rates defined. System defaults will be used.
            </div>
          )}

          {/* Add New Form */}
          {isAdding && (
            <div className="grid grid-cols-3 gap-4 items-center py-4 bg-gray-50 rounded-md px-2">
              <div>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={newRate.currency}
                  onChange={(e) => setNewRate({ ...newRate, currency: e.target.value })}
                >
                  {availableCurrencies.map(c => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="Rate"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={handleAddRate} disabled={saving || !newRate.rate}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
