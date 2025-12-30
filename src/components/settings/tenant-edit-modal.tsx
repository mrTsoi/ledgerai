"use client";

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'
import { CurrencySelect } from '@/components/ui/currency-select'
import { LocaleSelect } from '@/components/ui/locale-select'
import { toast } from 'sonner'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { useLiterals } from '@/hooks/use-literals'
import { createClient } from '@/lib/supabase/client'

type Tenant = {
  id: string
  name: string
  slug: string
  locale?: string
  currency?: string
}

export default function TenantEditModal({ tenant, open, onOpenChange, onSaved }: { tenant: Tenant | null, open: boolean, onOpenChange: (open: boolean) => void, onSaved?: () => void }) {
  const lt = useLiterals()
  const { refreshTenants, isSuperAdmin } = useTenant()
  const userRole = useUserRole()
  const canEdit = isSuperAdmin || userRole === 'COMPANY_ADMIN' || userRole === 'SUPER_ADMIN'

  const [formData, updateFormData] = useState<{ name: string; slug: string; locale: string; currency: string }>({ name: '', slug: '', locale: 'en-US', currency: 'USD' })
  const [saving, setSaving] = useState(false)
  const [aliases, setAliases] = useState<string[]>([])
  const [newAlias, setNewAlias] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (tenant) {
        updateFormData({ name: tenant.name || '', slug: tenant.slug || '', locale: tenant.locale || 'en-US', currency: tenant.currency || 'USD' });
        // Load existing aliases via server API (avoids RLS / client-side Supabase reads)
        (async () => {
          try {
            const res = await fetch(`/api/tenants?tenant_id=${encodeURIComponent(tenant.id)}`)
            if (res.ok) {
              const json = await res.json().catch(() => ({}))
              if (Array.isArray(json?.aliases)) setAliases(json.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
              else setAliases([])
            } else {
              setAliases([])
            }
          } catch (e) {
            setAliases([])
          }
        })()
    }
  }, [tenant, supabase])

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!tenant) return
    if (!canEdit) return toast.error(lt('Permission denied'))

    try {
      setSaving(true)
      // Include aliases in payload; backend should handle upsert of tenant_identifiers
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id, name: formData.name, locale: formData.locale, currency: formData.currency, aliases }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || lt('Failed to save settings'))

      // Update local modal state from server response first so UI reflects persisted data
      try {
        if (json?.tenant) {
          updateFormData({ name: json.tenant.name || formData.name, slug: json.tenant.slug || formData.slug, locale: json.tenant.locale || formData.locale, currency: json.tenant.currency || formData.currency })
        }

        if (Array.isArray(json?.insertedAliases) && json.insertedAliases.length > 0) {
          setAliases((prev) => {
            const merged = Array.from(new Set([...(prev || []), ...json.insertedAliases.map((a: any) => String(a || '').trim())]))
            return merged
          })
          toast.success(lt('Alias saved to database'))
        } else if (Array.isArray(json?.deletedAliasIds) && json.deletedAliasIds.length > 0) {
          if (Array.isArray(json?.aliases)) setAliases(json.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
          toast.success(lt('Aliases updated'))
        } else {
          if (Array.isArray(json?.aliases)) setAliases(json.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
          toast.success(lt('Settings saved'))
        }
      } catch (e) {
        // ignore parsing errors
      }

      // Debug: update local UI and refresh global tenant list in background to avoid parent-triggered remount
      console.debug('[TenantEditModal] saved, updating local UI; scheduling background refresh', { tenantId: tenant.id, aliases })
      // Schedule a background refresh to update global tenant list without forcing immediate parent re-render
      setTimeout(() => {
        try {
          refreshTenants()
          console.debug('[TenantEditModal] background refreshTenants called')
        } catch (e) {
          console.warn('[TenantEditModal] background refresh failed', e)
        }
      }, 600)
    } catch (err: any) {
      console.error(err)
      toast.error(lt('Failed to save settings: {message}', { message: err.message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lt('Edit Company')}</DialogTitle>
          <DialogDescription>{lt('Edit tenant company settings.')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{lt('Company Name')}</Label>
            <Input id="name" value={formData.name} onChange={(e) => updateFormData({ ...formData, name: e.target.value })} disabled={!canEdit} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="slug">{lt('URL Slug')}</Label>
            <Input id="slug" value={formData.slug} disabled className="bg-gray-100" />
            <p className="text-xs text-muted-foreground">{lt('The URL slug cannot be changed.')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="locale">{lt('Locale / Region')}</Label>
              <LocaleSelect value={formData.locale} onChange={(v) => updateFormData({ ...formData, locale: v })} disabled={!canEdit} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currency">{lt('Base Currency')}</Label>
              <CurrencySelect value={formData.currency} onChange={(v) => updateFormData({ ...formData, currency: v })} disabled={!canEdit} />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>{lt('Alternate Company Names')}</Label>
              <p className="text-xs text-muted-foreground mb-2">{lt('Add alternate or localized company names to help AI matching.')}</p>
              <div className="flex gap-2">
                <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder={lt('Add alternate name')} />
                <Button type="button" onClick={() => {
                  const v = String(newAlias || '').trim()
                  if (!v) return
                  if (!aliases.includes(v)) setAliases(prev => [...prev, v])
                  setNewAlias('')
                }}>{lt('Add')}</Button>
              </div>
              <div className="mt-2 space-y-2">
                {aliases.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="text-sm truncate">{a}</div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setAliases(prev => prev.filter(x => x !== a))}>{lt('Remove')}</Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} type="button">{lt('Cancel')}</Button>
            {canEdit && (
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {lt('Save Changes')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
