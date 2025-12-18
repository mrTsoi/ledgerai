'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CurrencySelect } from '@/components/ui/currency-select'
import { toast } from "sonner"

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

interface Props {
  accountId: string
}

export function BankAccountSettings({ accountId }: Props) {
  const [account, setAccount] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    account_name: '',
    account_number: '',
    bank_name: '',
    currency: 'USD'
  })
  
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const fetchAccount = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', accountId)
        .single()

      if (error) throw error
      setAccount(data)
      setFormData({
        account_name: data?.account_name || '',
        account_number: data?.account_number || '',
        bank_name: data?.bank_name || '',
        currency: data?.currency || 'USD'
      })
    } catch (error) {
      console.error('Error fetching account:', error)
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase])

  useEffect(() => {
    fetchAccount()
  }, [fetchAccount])

  const handleSave = async () => {
    try {
      setSaving(true)
      const { error } = await supabase
        .from('bank_accounts')
        .update({
          account_name: formData.account_name,
          account_number: formData.account_number,
          bank_name: formData.bank_name,
          currency: formData.currency
        })
        .eq('id', accountId)

      if (error) throw error
      toast.success('Settings saved successfully')
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this bank account? This action cannot be undone.')) return

    try {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', accountId)

      if (error) throw error
      router.push('/dashboard/banking')
      toast.success('Account deleted successfully')
    } catch (error: any) {
      console.error('Error deleting account:', error)
      toast.error('Failed to delete account: ' + error.message)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>Manage the basic information for this bank account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input 
                value={formData.account_name}
                onChange={e => setFormData({...formData, account_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input 
                value={formData.bank_name}
                onChange={e => setFormData({...formData, bank_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number (Last 4)</Label>
              <Input 
                value={formData.account_number}
                onChange={e => setFormData({...formData, account_number: e.target.value})}
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
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Delete Bank Account</h4>
              <p className="text-sm text-gray-500">This will permanently delete the account and all associated data.</p>
            </div>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
