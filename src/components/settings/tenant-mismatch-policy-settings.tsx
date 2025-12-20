'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

type TenantMismatchPolicy = {
  allow_auto_tenant_creation: boolean
  allow_auto_reassignment: boolean
  min_confidence: number
}

const DEFAULT_POLICY: TenantMismatchPolicy = {
  allow_auto_tenant_creation: false,
  allow_auto_reassignment: false,
  min_confidence: 0.9,
}

function normalizePolicy(input: unknown): TenantMismatchPolicy {
  const obj = (input && typeof input === 'object' ? (input as any) : {}) as Record<string, unknown>
  const allow_auto_tenant_creation = obj.allow_auto_tenant_creation === true
  const allow_auto_reassignment = obj.allow_auto_reassignment === true

  const rawMin = obj.min_confidence
  const min =
    typeof rawMin === 'number'
      ? rawMin
      : typeof rawMin === 'string'
        ? Number(rawMin)
        : DEFAULT_POLICY.min_confidence

  const bounded = Number.isFinite(min) ? Math.min(1, Math.max(0.5, min)) : DEFAULT_POLICY.min_confidence

  return {
    allow_auto_tenant_creation,
    allow_auto_reassignment,
    min_confidence: bounded,
  }
}

export function TenantMismatchPolicyTenantSettings() {
  const lt = useLiterals()
  const supabase = useMemo(() => createClient(), [])
  const { currentTenant } = useTenant()
  const role = useUserRole()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [systemPolicy, setSystemPolicy] = useState<TenantMismatchPolicy>(DEFAULT_POLICY)
  const [tenantOverride, setTenantOverride] = useState<TenantMismatchPolicy | null>(null)
  const [draft, setDraft] = useState<TenantMismatchPolicy>(DEFAULT_POLICY)

  const canEdit = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'

  const effectivePolicy = useMemo(() => {
    if (!tenantOverride) return systemPolicy
    return normalizePolicy({ ...systemPolicy, ...tenantOverride })
  }, [systemPolicy, tenantOverride])

  const load = useCallback(async () => {
    if (!currentTenant) return

    try {
      setLoading(true)

      const { data: sys, error: sysErr } = await (supabase.from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'tenant_mismatch_policy')
        .maybeSingle()

      if (sysErr && sysErr.code !== 'PGRST116') throw sysErr

      const sysPolicy = normalizePolicy(sys?.setting_value)
      setSystemPolicy(sysPolicy)

      const { data: ten, error: tenErr } = await (supabase.from('tenant_settings') as any)
        .select('setting_value')
        .eq('tenant_id', currentTenant.id)
        .eq('setting_key', 'tenant_mismatch_policy')
        .maybeSingle()

      if (tenErr && tenErr.code !== 'PGRST116') throw tenErr

      const override = ten?.setting_value ? normalizePolicy(ten.setting_value) : null
      setTenantOverride(override)

      const initialDraft = override ? normalizePolicy({ ...sysPolicy, ...override }) : sysPolicy
      setDraft(initialDraft)
    } catch (e: any) {
      console.error('Error loading tenant mismatch policy (tenant settings):', e)
      toast.error(e?.message ? lt('Failed to load policy: {message}', { message: e.message }) : lt('Failed to load policy'))
    } finally {
      setLoading(false)
    }
  }, [currentTenant, supabase, lt])

  useEffect(() => {
    load()
  }, [load])

  const saveOverride = async () => {
    if (!currentTenant) return

    if (!canEdit) {
      toast.error(lt('Only Company Admins can change this setting'))
      return
    }

    try {
      setSaving(true)
      const next = normalizePolicy(draft)

      const { error } = await (supabase.from('tenant_settings') as any).upsert(
        {
          tenant_id: currentTenant.id,
          setting_key: 'tenant_mismatch_policy',
          setting_value: next as any,
        },
        { onConflict: 'tenant_id,setting_key' }
      )

      if (error) throw error

      setTenantOverride(next)
      toast.success(lt('Tenant override saved'))
    } catch (e: any) {
      console.error('Error saving tenant override:', e)
      toast.error(e?.message ? lt('Failed to save: {message}', { message: e.message }) : lt('Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const clearOverride = async () => {
    if (!currentTenant) return

    if (!canEdit) {
      toast.error(lt('Only Company Admins can change this setting'))
      return
    }

    try {
      setSaving(true)

      const { error } = await (supabase.from('tenant_settings') as any)
        .delete()
        .eq('tenant_id', currentTenant.id)
        .eq('setting_key', 'tenant_mismatch_policy')

      if (error) throw error

      setTenantOverride(null)
      setDraft(systemPolicy)
      toast.success(lt('Tenant override cleared'))
    } catch (e: any) {
      console.error('Error clearing tenant override:', e)
      toast.error(e?.message ? lt('Failed to clear: {message}', { message: e.message }) : lt('Failed to clear'))
    } finally {
      setSaving(false)
    }
  }

  if (!currentTenant) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Document Processing: Tenant Mismatch')}</CardTitle>
        <CardDescription>
          {tenantOverride ? lt('Using tenant override.') : lt('Using platform default.')} {lt('Effective values shown below.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!canEdit && (
          <div className="text-sm text-muted-foreground">{lt('Only Company Admins can change these settings.')}</div>
        )}

        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label>{lt('Allow auto reassignment')}</Label>
            <p className="text-sm text-muted-foreground">
              {lt("Automatically move documents to an existing matching tenant from the user's accessible tenant list.")}
            </p>
          </div>
          <Switch
            disabled={!canEdit}
            checked={draft.allow_auto_reassignment}
            onCheckedChange={(v) => setDraft((p) => ({ ...p, allow_auto_reassignment: v }))}
          />
        </div>

        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label>{lt('Allow auto tenant creation')}</Label>
            <p className="text-sm text-muted-foreground">
              {lt('If no matching tenant exists and the tenancy limit allows it, create a tenant and move the document.')}
            </p>
          </div>
          <Switch
            disabled={!canEdit}
            checked={draft.allow_auto_tenant_creation}
            onCheckedChange={(v) => setDraft((p) => ({ ...p, allow_auto_tenant_creation: v }))}
          />
        </div>

        <div className="space-y-2">
          <Label>{lt('Minimum confidence')}</Label>
          <p className="text-sm text-muted-foreground">{lt('Range: 0.50 – 1.00')}</p>
          <div className="max-w-[220px]">
            <Input
              disabled={!canEdit}
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              value={draft.min_confidence}
              onChange={(e) => setDraft((p) => ({ ...p, min_confidence: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={saveOverride} disabled={!canEdit || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {lt('Save Override')}
          </Button>
          <Button variant="outline" onClick={clearOverride} disabled={!canEdit || saving || !tenantOverride}>
            <Trash2 className="mr-2 h-4 w-4" />
            {lt('Clear Override')}
          </Button>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium mb-1">{lt('Effective policy')}</div>
          <div className="text-muted-foreground">
            {lt('Auto reassignment:')} <span className="font-medium text-foreground">{String(effectivePolicy.allow_auto_reassignment)}</span>
            {' • '}{lt('Auto creation:')} <span className="font-medium text-foreground">{String(effectivePolicy.allow_auto_tenant_creation)}</span>
            {' • '}{lt('Min confidence:')} <span className="font-medium text-foreground">{effectivePolicy.min_confidence.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
