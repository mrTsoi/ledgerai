'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus } from 'lucide-react'
import { useSubscription } from '@/hooks/use-subscription'
import { useTenant } from '@/hooks/use-tenant'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'
import { getTenantDefaultsFromBrowser } from '@/lib/i18n/tenant-defaults'

export function CreateTenantModal() {
  const lt = useLiterals()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(() => {
    const defaults = getTenantDefaultsFromBrowser()
    return { name: '', slug: '', locale: defaults.locale, currency: defaults.currency }
  })
  const { subscription, refreshSubscription, loading: subLoading } = useSubscription()
  const { refreshTenants, switchTenant } = useTenant()

  const handleCreate = async () => {
    try {
      setLoading(true)

      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          locale: formData.locale,
          currency: formData.currency,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to create company'))

      const tenantId = String(json?.tenant?.id || '')

      toast.success(lt('Company created successfully!'))
      setOpen(false)
      const defaults = getTenantDefaultsFromBrowser()
      setFormData({ name: '', slug: '', locale: defaults.locale, currency: defaults.currency })
      refreshSubscription() // Update usage counts
      // If API returns the created tenant id, switch to it immediately
      if (tenantId) {
        try {
          switchTenant(tenantId)
        } catch (e) {
          // ignore
        }
      }
      refreshTenants() // Update tenant list
    } catch (error: any) {
      console.error('Creation error:', error)
      toast.error(
        lt('Failed to create company: {message}', {
          message: error?.message || '',
        })
      )
    } finally {
      setLoading(false)
    }
  }

  const canCreate = !!subscription && (subscription.max_tenants === -1 || subscription.current_tenants < subscription.max_tenants)
  const isDisabled = subLoading || !canCreate
  const disabledTitle = subLoading
    ? lt('Loading…')
    : !subscription
      ? lt('Please select a subscription plan.')
      : lt('Subscription limit reached')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={isDisabled}
          title={isDisabled ? disabledTitle : lt('Create new company')}
        >
          {subLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          {lt('Add Company')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lt('Create New Company')}</DialogTitle>
          <DialogDescription>
            {lt('Add a new organization to your account.')}
            {subscription && (
              <span className="block mt-1 text-sm text-blue-600">
                {lt('Usage: {current} / {max} companies used.', {
                  current: subscription.current_tenants,
                  max: subscription.max_tenants === -1 ? lt('Unlimited') : subscription.max_tenants,
                })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">{lt('Company Name')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={lt('Acme Corp')}
            />
          </div>
          <div>
            <Label htmlFor="slug">{lt('URL Slug')}</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="acme-corp"
            />
            <p className="text-xs text-gray-500 mt-1">{lt('Only lowercase letters, numbers, and hyphens.')}</p>
          </div>
          <div>
            <Label htmlFor="locale">{lt('Language')}</Label>
            <select
              id="locale"
              className="w-full p-2 border rounded-md"
              value={formData.locale}
              onChange={(e) => setFormData({ ...formData, locale: e.target.value as typeof formData.locale })}
            >
              <option value="en">{lt('English')}</option>
              <option value="zh-CN">{lt('Chinese (Simplified)')}</option>
              <option value="zh-HK">{lt('Chinese (Traditional)')}</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{lt('Cancel')}</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : lt('Create Company')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
