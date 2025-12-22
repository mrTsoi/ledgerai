'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Loader2, Save } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { CurrencySelect } from '@/components/ui/currency-select'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'
import { useLocale } from 'next-intl'
import { fetchEntityTranslationMap, overlayEntityTranslations } from '@/lib/i18n/entity-translations'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']
type ChartOfAccount = Database['public']['Tables']['chart_of_accounts']['Row']

interface Props {
  onClose: () => void
  onSaved: () => void
  initialData?: BankAccount
}

export function BankAccountForm({ onClose, onSaved, initialData }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])

  const lt = useLiterals()
  const locale = useLocale()
  
  const [formData, setFormData] = useState({
    account_name: initialData?.account_name || '',
    account_number: initialData?.account_number || '',
    bank_name: initialData?.bank_name || '',
    currency: initialData?.currency || 'USD',
    gl_account_id: initialData?.gl_account_id || ''
  })

  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const fetchChartOfAccounts = useCallback(async () => {
    if (!tenantId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('account_type', 'ASSET') // Only show Asset accounts
        .eq('is_active', true)
        .order('code')

      if (error) throw error
      const base = (data || []) as ChartOfAccount[]

      if (locale && locale !== 'en' && base.length > 0) {
        const translationMap = await fetchEntityTranslationMap(supabase, {
          tenantId,
          entityType: 'chart_of_accounts',
          entityIds: base.map((a) => a.id),
          locale,
          fields: ['name', 'description']
        })
        setAccounts(overlayEntityTranslations(base, translationMap, ['name', 'description']))
      } else {
        setAccounts(base)
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId, locale])

  useEffect(() => {
    fetchChartOfAccounts()
  }, [fetchChartOfAccounts])

  const handleSave = async () => {
    if (!tenantId) return
    if (!formData.account_name) {
      toast.error(lt('Account Name is required'))
      return
    }

    try {
      setSaving(true)

      const dataToSave = {
        tenant_id: tenantId,
        account_name: formData.account_name,
        account_number: formData.account_number || null,
        bank_name: formData.bank_name || null,
        currency: formData.currency,
        gl_account_id: formData.gl_account_id || null,
        is_active: true
      }

      let error
      if (initialData?.id) {
        const { error: updateError } = await (supabase
          .from('bank_accounts') as any)
          .update(dataToSave)
          .eq('id', initialData.id)
        error = updateError
      } else {
        const { error: insertError } = await (supabase
          .from('bank_accounts') as any)
          .insert(dataToSave)
        error = insertError
      }

      if (error) throw error

      onSaved()
      onClose()
      toast.success(lt('Bank account saved successfully'))
    } catch (error: any) {
      console.error('Error saving bank account:', error)
      toast.error(lt('Failed to save: {message}', { message: error.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">
            {initialData ? lt('Edit Bank Account') : lt('Add Bank Account')}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{lt('Account Name')} *</Label>
            <Input 
              value={formData.account_name}
              onChange={e => setFormData({...formData, account_name: e.target.value})}
              placeholder={lt('e.g. Chase Operating')}
            />
          </div>

          <div className="space-y-2">
            <Label>{lt('Bank Name')}</Label>
            <Input 
              value={formData.bank_name}
              onChange={e => setFormData({...formData, bank_name: e.target.value})}
              placeholder={lt('e.g. Chase Bank')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lt('Account Number (Last 4)')}</Label>
              <Input 
                value={formData.account_number}
                onChange={e => setFormData({...formData, account_number: e.target.value})}
                placeholder={lt('1234')}
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>{lt('Currency')}</Label>
              <CurrencySelect 
                value={formData.currency}
                onChange={value => setFormData({...formData, currency: lt(value)})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{lt('Linked GL Account (Asset)')}</Label>
            <select 
              className="w-full p-2 border rounded-md text-sm"
              value={formData.gl_account_id}
              onChange={e => setFormData({...formData, gl_account_id: e.target.value})}
            >
              <option value="">{lt('-- Select Account --')}</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {lt(acc.name)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              {lt('Select the General Ledger asset account that represents this bank account.')}
            </p>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {lt('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {lt('Saving...')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {lt('Save Account')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
