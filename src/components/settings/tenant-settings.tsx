'use client'

import { useState, useEffect } from 'react'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Save } from 'lucide-react'
import { CurrencySelect } from '@/components/ui/currency-select'
import { LocaleSelect } from '@/components/ui/locale-select'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

export function TenantSettings() {
  const lt = useLiterals()
  const { currentTenant, refreshTenants, isSuperAdmin } = useTenant()
  const userRole = useUserRole()
  const [loading, setLoading] = useState(false)
  
  const canEdit = isSuperAdmin || userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    locale: 'en-US',
    currency: 'USD'
  })

  useEffect(() => {
    if (currentTenant) {
      setFormData({
        name: currentTenant.name,
        slug: currentTenant.slug,
        locale: currentTenant.locale || 'en-US',
        currency: currentTenant.currency || 'USD'
      })
    }
  }, [currentTenant])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentTenant) return

    try {
      setLoading(true)
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: currentTenant.id,
          name: formData.name,
          locale: formData.locale,
          currency: formData.currency,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to save settings'))
      
      await refreshTenants()
      toast.success(lt('Settings saved successfully'))
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(lt('Failed to save settings: {message}', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }

  if (!currentTenant) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Company Profile')}</CardTitle>
        <CardDescription>{lt("Manage your company's basic information.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{lt('Company Name')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={!canEdit}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="slug">{lt('URL Slug')}</Label>
            <Input
              id="slug"
              value={formData.slug}
              disabled
              className="bg-gray-100"
            />
            <p className="text-xs text-muted-foreground">{lt('The URL slug cannot be changed.')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="locale">{lt('Locale / Region')}</Label>
              <LocaleSelect
                value={formData.locale}
                onChange={(value) => setFormData({ ...formData, locale: value })}
                disabled={!canEdit}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currency">{lt('Base Currency')}</Label>
              <CurrencySelect
                value={formData.currency}
                onChange={(value) => setFormData({ ...formData, currency: value })}
                disabled={!canEdit}
              />
            </div>
          </div>

          {canEdit && (
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {lt('Save Changes')}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
