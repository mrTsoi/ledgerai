'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus } from 'lucide-react'
import { useSubscription } from '@/hooks/use-subscription'
import { useTenant } from '@/hooks/use-tenant'

export function CreateTenantModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ name: '', slug: '', locale: 'en' })
  const { subscription, refreshSubscription, loading: subLoading } = useSubscription()
  const { refreshTenants } = useTenant()
  const supabase = createClient()

  const handleCreate = async () => {
    try {
      setLoading(true)
      
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 2. Create Tenant (Trigger will check limits)
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: formData.name,
          slug: formData.slug,
          locale: formData.locale,
          owner_id: user.id,
          is_active: true
        })
        .select()
        .single()

      if (tenantError) throw tenantError

      // 3. Create Membership for creator
      const { error: memberError } = await supabase
        .from('memberships')
        .insert({
          user_id: user.id,
          tenant_id: tenant.id,
          role: 'COMPANY_ADMIN',
          is_active: true
        })

      if (memberError) throw memberError

      alert('Company created successfully!')
      setOpen(false)
      setFormData({ name: '', slug: '', locale: 'en' })
      refreshSubscription() // Update usage counts
      refreshTenants() // Update tenant list
    } catch (error: any) {
      console.error('Creation error:', error)
      alert('Failed to create company: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const canCreate = subscription && (subscription.max_tenants === -1 || subscription.current_tenants < subscription.max_tenants)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={(!canCreate && !subLoading) || subLoading} title={!canCreate ? 'Subscription limit reached' : 'Create new company'}>
          {subLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Add Company
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Company</DialogTitle>
          <DialogDescription>
            Add a new organization to your account.
            {subscription && (
              <span className="block mt-1 text-sm text-blue-600">
                Usage: {subscription.current_tenants} / {subscription.max_tenants === -1 ? 'Unlimited' : subscription.max_tenants} companies used.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Company Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="acme-corp"
            />
            <p className="text-xs text-gray-500 mt-1">Only lowercase letters, numbers, and hyphens.</p>
          </div>
          <div>
            <Label htmlFor="locale">Language</Label>
            <select
              id="locale"
              className="w-full p-2 border rounded-md"
              value={formData.locale}
              onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
            >
              <option value="en">English</option>
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="zh-TW">Chinese (Traditional)</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
