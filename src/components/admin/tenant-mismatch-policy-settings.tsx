'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Save, ShieldAlert } from 'lucide-react'
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

export function TenantMismatchPolicySettings() {
  const lt = useLiterals()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<TenantMismatchPolicy>(DEFAULT_POLICY)

  const loadPolicy = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await (supabase.from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'tenant_mismatch_policy')
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      const next = normalizePolicy(data?.setting_value)
      setPolicy(next)
    } catch (e: any) {
      console.error('Error loading tenant mismatch policy:', e)
      toast.error(e?.message ? lt('Failed to load policy: {message}', { message: e.message }) : lt('Failed to load policy'))
    } finally {
      setLoading(false)
    }
  }, [supabase, lt])

  useEffect(() => {
    loadPolicy()
  }, [loadPolicy])

  const savePolicy = async () => {
    try {
      setSaving(true)
      const next = normalizePolicy(policy)

      const { error } = await (supabase.from('system_settings') as any).upsert(
        {
          setting_key: 'tenant_mismatch_policy',
          setting_value: next as any,
          description: 'Platform-wide policy for handling document tenant mismatches',
          is_public: true,
        },
        { onConflict: 'setting_key' }
      )

      if (error) throw error
      setPolicy(next)
      toast.success(lt('Tenant mismatch policy saved'))
    } catch (e: any) {
      console.error('Error saving tenant mismatch policy:', e)
      toast.error(e?.message ? lt('Failed to save policy: {message}', { message: e.message }) : lt('Failed to save policy'))
    } finally {
      setSaving(false)
    }
  }

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
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-orange-600" />
          <CardTitle>{lt('Tenant Mismatch Policy')}</CardTitle>
        </div>
        <CardDescription>
          {lt('Controls automatic reassignment / tenant creation when AI detects a document belongs to a different tenant.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <Label>{lt('Allow auto reassignment')}</Label>
            <p className="text-sm text-muted-foreground">
              {lt('Automatically move documents to an existing matching tenant from the user’s accessible tenant list.')}
            </p>
          </div>
          <Switch
            checked={policy.allow_auto_reassignment}
            onCheckedChange={(v) => setPolicy((p) => ({ ...p, allow_auto_reassignment: v }))}
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
            checked={policy.allow_auto_tenant_creation}
            onCheckedChange={(v) => setPolicy((p) => ({ ...p, allow_auto_tenant_creation: v }))}
          />
        </div>

        <div className="space-y-2">
          <Label>{lt('Minimum confidence')}</Label>
          <p className="text-sm text-muted-foreground">{lt('Range: 0.50 – 1.00')}</p>
          <div className="max-w-[220px]">
            <Input
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              value={policy.min_confidence}
              onChange={(e) => setPolicy((p) => ({ ...p, min_confidence: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={savePolicy} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {lt('Save Policy')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
