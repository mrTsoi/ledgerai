'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Edit, Trash2, Building2, Users, FileText, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from "sonner"

type Tenant = Database['public']['Tables']['tenants']['Row'] & {
  is_active?: boolean
  subscription_plan?: string
  subscription_status?: string
}

interface TenantDetails {
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  locale: string
  created_at: string
  user_count: number
  document_count: number
  transaction_count: number
  total_revenue: number
  total_expenses: number
  net_income: number
  last_activity: string
  subscription_plan?: string
  subscription_status?: string
}

export function TenantManagement() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<TenantDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const fetchTenants = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTenants(data || [])
    } catch (error) {
      console.error('Error fetching tenants:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const fetchTenantDetails = async (tenantId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_tenant_details', {
        p_tenant_id: tenantId
      } as any)

      if (error) throw error
      if (data && (data as any).length > 0) {
        setSelectedTenant((data as any)[0])
      }
    } catch (error) {
      console.error('Error fetching tenant details:', error)
    }
  }

  const createTenant = async (formData: { name: string; slug: string; locale: string; plan: string }) => {
    try {
      const { error } = await (supabase
        .from('tenants') as any)
        .insert({
          name: formData.name,
          slug: formData.slug,
          locale: formData.locale,
          is_active: true,
          subscription_plan: formData.plan,
          subscription_status: 'active'
        })

      if (error) throw error
      
      setShowCreateForm(false)
      fetchTenants()
      toast.success('Tenant created successfully!')
    } catch (error: any) {
      console.error('Error creating tenant:', error)
      toast.error('Failed to create tenant: ' + error.message)
    }
  }

  const toggleTenantStatus = async (tenantId: string, currentStatus: boolean) => {
    try {
      const { error } = await (supabase
        .from('tenants') as any)
        .update({ is_active: !currentStatus })
        .eq('id', tenantId)

      if (error) throw error
      fetchTenants()
      toast.success(`Tenant ${!currentStatus ? 'activated' : 'deactivated'} successfully`)
    } catch (error: any) {
      console.error('Error updating tenant:', error)
      toast.error('Failed to update tenant: ' + error.message)
    }
  }

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  if (showCreateForm) {
    return <CreateTenantForm onSubmit={createTenant} onCancel={() => setShowCreateForm(false)} />
  }

  if (selectedTenant) {
    return (
      <TenantDetailsView
        tenant={selectedTenant}
        onClose={() => setSelectedTenant(null)}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tenant Management</CardTitle>
            <CardDescription>
              Manage all platform tenants and their settings
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Tenant
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:max-w-sm"
          />
        </div>

        {/* Tenants List */}
        <div className="space-y-3">
          {filteredTenants.map((tenant) => (
            <div
              key={tenant.id}
              className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold truncate">{tenant.name}</p>
                    <span className={`px-2 py-1 text-xs rounded-full ${tenant.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {tenant.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {tenant.subscription_plan && (
                      <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                        {tenant.subscription_plan}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {tenant.slug} • Created {format(new Date(tenant.created_at), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4 md:mt-0 md:ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchTenantDetails(tenant.id)}
                  className="flex-1 md:flex-none"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleTenantStatus(tenant.id, tenant.is_active || false)}
                  className="flex-1 md:flex-none"
                >
                  {tenant.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredTenants.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tenants found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreateTenantForm({ onSubmit, onCancel }: { onSubmit: (data: any) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState({ name: '', slug: '', locale: 'en', plan: 'free' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Tenant</CardTitle>
        <CardDescription>Add a new tenant to the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => {
          e.preventDefault()
          onSubmit(formData)
        }} className="space-y-4">
          <div>
            <Label htmlFor="name">Tenant Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Acme Corporation"
              required
            />
          </div>
          <div>
            <Label htmlFor="slug">Slug (URL-friendly) *</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="e.g., acme-corp"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Only lowercase letters, numbers, and hyphens</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="locale">Default Locale</Label>
              <select
                id="locale"
                value={formData.locale}
                onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="en">English</option>
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="zh-TW">Chinese (Traditional)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="plan">Subscription Plan</Label>
              <select
                id="plan"
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="free">Free Tier</option>
                <option value="pro">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit">Create Tenant</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function TenantDetailsView({ tenant, onClose }: { tenant: TenantDetails; onClose: () => void }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{tenant.tenant_name}</CardTitle>
            <CardDescription>{tenant.tenant_slug}</CardDescription>
          </div>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* Statistics Cards */}
          <div className="col-span-2 grid grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">Users</span>
              </div>
              <p className="text-2xl font-bold">{tenant.user_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Documents</span>
              </div>
              <p className="text-2xl font-bold">{tenant.document_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-orange-600 mb-2">
                <Building2 className="w-4 h-4" />
                <span className="text-sm font-medium">Transactions</span>
              </div>
              <p className="text-2xl font-bold">{tenant.transaction_count}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">Net Income</span>
              </div>
              <p className={`text-2xl font-bold ${tenant.net_income >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${Math.abs(tenant.net_income).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-gray-600">Tenant ID</Label>
              <p className="font-mono text-sm">{tenant.tenant_id}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Locale</Label>
              <p>{tenant.locale}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Created</Label>
              <p>{format(new Date(tenant.created_at), 'PPP')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-gray-600">Total Revenue (YTD)</Label>
              <p className="text-lg font-semibold text-green-600">${tenant.total_revenue.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Total Expenses (YTD)</Label>
              <p className="text-lg font-semibold text-red-600">${tenant.total_expenses.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Last Activity</Label>
              <p>{tenant.last_activity ? format(new Date(tenant.last_activity), 'PPp') : 'No activity'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
