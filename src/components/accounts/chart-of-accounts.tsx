'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Edit, Trash2, FolderTree } from 'lucide-react'
import { toast } from "sonner"

type Account = Database['public']['Tables']['chart_of_accounts']['Row']

export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<string>('ALL')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [showForm, setShowForm] = useState(false)
  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const fetchAccounts = useCallback(async () => {
    if (!tenantId) return

    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('code')

      if (error) throw error
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId])

  const filterAccounts = useCallback(() => {
    let filtered = accounts

    // Filter by type
    if (selectedType !== 'ALL') {
      filtered = filtered.filter(acc => acc.account_type === selectedType)
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(acc =>
        acc.code.toLowerCase().includes(search) ||
        acc.name.toLowerCase().includes(search) ||
        acc.description?.toLowerCase().includes(search)
      )
    }

    setFilteredAccounts(filtered)
  }, [accounts, searchTerm, selectedType])

  useEffect(() => {
    if (tenantId) {
      fetchAccounts()
    }
  }, [fetchAccounts, tenantId])

  useEffect(() => {
    filterAccounts()
  }, [filterAccounts])

  const saveAccount = async (account: Partial<Account>) => {
    if (!tenantId) return

    try {
      if (editingAccount) {
        // Update existing
        const { error } = await (supabase
          .from('chart_of_accounts') as any)
          .update({
            code: account.code,
            name: account.name,
            account_type: account.account_type,
            account_subtype: account.account_subtype,
            description: account.description,
            is_active: account.is_active,
            parent_account_id: account.parent_account_id
          })
          .eq('id', editingAccount.id)

        if (error) throw error
      } else {
        // Create new
        const { error } = await (supabase
          .from('chart_of_accounts') as any)
          .insert({
            tenant_id: tenantId,
            code: account.code!,
            name: account.name!,
            account_type: account.account_type!,
            account_subtype: account.account_subtype,
            description: account.description,
            is_active: account.is_active ?? true,
            parent_account_id: account.parent_account_id
          })

        if (error) throw error
      }

      setShowForm(false)
      setEditingAccount(null)
      await fetchAccounts()
      toast.success(editingAccount ? 'Account updated successfully' : 'Account created successfully')
    } catch (error: any) {
      console.error('Error saving account:', error)
      toast.error('Failed to save: ' + error.message)
    }
  }

  const deleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this account?')) return

    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchAccounts()
      toast.success('Account deleted successfully')
    } catch (error: any) {
      console.error('Error deleting account:', error)
      toast.error('Failed to delete: ' + error.message)
    }
  }

  const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

  const getTypeColor = (type?: string) => {
    const colors: Record<string, string> = {
      ASSET: 'bg-blue-100 text-blue-800',
      LIABILITY: 'bg-red-100 text-red-800',
      EQUITY: 'bg-purple-100 text-purple-800',
      REVENUE: 'bg-green-100 text-green-800',
      EXPENSE: 'bg-orange-100 text-orange-800'
    }
    return colors[type || ''] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  if (showForm) {
    return <AccountForm
      account={editingAccount}
      accounts={accounts}
      onSave={saveAccount}
      onCancel={() => {
        setShowForm(false)
        setEditingAccount(null)
      }}
    />
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Account List</CardTitle>
            <CardDescription>
              Manage your account hierarchy
            </CardDescription>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <Input
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:max-w-sm"
          />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border rounded-md w-full md:w-auto"
          >
            <option value="ALL">All Types</option>
            {accountTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Accounts Table */}
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FolderTree className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No accounts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Code</th>
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-left py-3 px-4">Subtype</th>
                  <th className="text-left py-3 px-4">Balance</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm">{account.code}</td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{account.name}</p>
                        {account.description && (
                          <p className="text-xs text-gray-500">{account.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(account.account_type)}`}>
                        {account.account_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{account.account_subtype || '-'}</td>
                    <td className="py-3 px-4 text-sm font-mono">
                      $0.00
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${account.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {account.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAccount(account)
                            setShowForm(true)
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAccount(account.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 pt-6 border-t">
          <p className="text-sm text-gray-600">
            Showing {filteredAccounts.length} of {accounts.length} accounts
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

interface AccountFormProps {
  account: Account | null
  accounts: Account[]
  onSave: (account: Partial<Account>) => void
  onCancel: () => void
}

function AccountForm({ account, accounts, onSave, onCancel }: AccountFormProps) {
  const [formData, setFormData] = useState<Partial<Account>>({
    code: account?.code || '',
    name: account?.name || '',
    account_type: account?.account_type || 'ASSET',
    account_subtype: account?.account_subtype || '',
    description: account?.description || '',
    is_active: account?.is_active ?? true,
    parent_account_id: account?.parent_account_id || null
  })

  const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account ? 'Edit Account' : 'Add Account'}</CardTitle>
        <CardDescription>
          {account ? 'Update account details' : 'Create a new account'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault()
          onSave(formData)
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="code">Account Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., 1000"
                required
              />
            </div>
            <div>
              <Label htmlFor="type">Type *</Label>
              <select
                id="type"
                value={formData.account_type}
                onChange={(e) => setFormData({ ...formData, account_type: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                {accountTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="name">Account Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Cash in Bank"
              required
            />
          </div>

          <div>
            <Label htmlFor="subtype">Subtype</Label>
            <Input
              id="subtype"
              value={formData.account_subtype || ''}
              onChange={(e) => setFormData({ ...formData, account_subtype: e.target.value })}
              placeholder="e.g., Current Asset"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div>
            <Label htmlFor="parent">Parent Account</Label>
            <select
              id="parent"
              value={formData.parent_account_id || ''}
              onChange={(e) => setFormData({ ...formData, parent_account_id: e.target.value || null })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">None (Top Level)</option>
              {accounts
                .filter(acc => acc.id !== account?.id && acc.account_type === formData.account_type)
                .map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4"
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit">
              {account ? 'Update' : 'Create'} Account
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
