'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Landmark, CreditCard, ArrowRight, MoreVertical, Edit, Trash } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { useLiterals } from '@/hooks/use-literals'
import { BankAccountForm } from './bank-account-form'
import Link from 'next/link'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

export function BankAccountList() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | undefined>(undefined)

  const { currentTenant } = useTenant()
  const lt = useLiterals()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const fetchAccounts = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching bank accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId])

  useEffect(() => {
    if (tenantId) {
      fetchAccounts()
    }
  }, [fetchAccounts, tenantId])

  const handleDelete = async (id: string) => {
    if (!confirm(lt('Are you sure you want to delete this bank account?'))) return

    try {
      const { error } = await (supabase
        .from('bank_accounts') as any)
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      await fetchAccounts()
    } catch (error) {
      console.error('Error deleting account:', error)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">{lt('Loading accounts...')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{lt('Bank Accounts')}</h2>
        <Button onClick={() => { setEditingAccount(undefined); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {lt('Add Account')}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Landmark className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">{lt('No Bank Accounts')}</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              {lt('Connect your bank accounts to import statements and reconcile transactions automatically.')}
            </p>
            <Button onClick={() => { setEditingAccount(undefined); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {lt('Add Your First Account')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map(account => (
            <Card key={account.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Landmark className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {account.account_name}
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                      {account.bank_name} •••• {account.account_number}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => { setEditingAccount(account); setShowForm(true); }}
                  >
                    <Edit className="w-4 h-4 text-gray-500" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:text-red-600"
                    onClick={() => handleDelete(account.id)}
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {lt('Currency')}: <span className="font-medium text-gray-900">{account.currency}</span>
                  </div>
                  <Link href={`/dashboard/banking/${account.id}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      {lt('View Feed')}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <BankAccountForm 
          onClose={() => setShowForm(false)} 
          onSaved={fetchAccounts}
          initialData={editingAccount}
        />
      )}
    </div>
  )
}
