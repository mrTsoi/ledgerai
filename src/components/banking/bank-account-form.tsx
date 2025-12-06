'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Loader2, Save } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { CurrencySelect } from '@/components/ui/currency-select'
import { toast } from "sonner"

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
  
  const [formData, setFormData] = useState({
    account_name: initialData?.account_name || '',
    account_number: initialData?.account_number || '',
    bank_name: initialData?.bank_name || '',
    currency: initialData?.currency || 'USD',
    gl_account_id: initialData?.gl_account_id || ''
  })

  const { currentTenant } = useTenant()
  const supabase = createClient()

  useEffect(() => {
    fetchChartOfAccounts()
  }, [])

  const fetchChartOfAccounts = async () => {
    if (!currentTenant) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .eq('account_type', 'ASSET') // Only show Asset accounts
        .eq('is_active', true)
        .order('code')

      if (error) throw error
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!currentTenant) return
    if (!formData.account_name) {
      toast.error('Account Name is required')
      return
    }

    try {
      setSaving(true)

      const dataToSave = {
        tenant_id: currentTenant.id,
        account_name: formData.account_name,
        account_number: formData.account_number || null,
        bank_name: formData.bank_name || null,
        currency: formData.currency,
        gl_account_id: formData.gl_account_id || null,
        is_active: true
      }

      let error
      if (initialData?.id) {
        const { error: updateError } = await supabase
          .from('bank_accounts')
          .update(dataToSave)
          .eq('id', initialData.id)
        error = updateError
      } else {
        const { error: insertError } = await supabase
          .from('bank_accounts')
          .insert(dataToSave)
        error = insertError
      }

      if (error) throw error

      onSaved()
      onClose()
      toast.success('Bank account saved successfully')
    } catch (error: any) {
      console.error('Error saving bank account:', error)
      toast.error('Failed to save: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">
            {initialData ? 'Edit Bank Account' : 'Add Bank Account'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Account Name *</Label>
            <Input 
              value={formData.account_name}
              onChange={e => setFormData({...formData, account_name: e.target.value})}
              placeholder="e.g. Chase Operating"
            />
          </div>

          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input 
              value={formData.bank_name}
              onChange={e => setFormData({...formData, bank_name: e.target.value})}
              placeholder="e.g. Chase Bank"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Number (Last 4)</Label>
              <Input 
                value={formData.account_number}
                onChange={e => setFormData({...formData, account_number: e.target.value})}
                placeholder="1234"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <CurrencySelect 
                value={formData.currency}
                onChange={value => setFormData({...formData, currency: value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Linked GL Account (Asset)</Label>
            <select 
              className="w-full p-2 border rounded-md text-sm"
              value={formData.gl_account_id}
              onChange={e => setFormData({...formData, gl_account_id: e.target.value})}
            >
              <option value="">-- Select Account --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              Select the General Ledger asset account that represents this bank account.
            </p>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Account
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
