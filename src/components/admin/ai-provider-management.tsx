"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, ShieldAlert, Settings2, Star } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useLiterals } from '@/hooks/use-literals'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type AIProvider = Database['public']['Tables']['ai_providers']['Row'] & {
  current_month_calls?: number
  per_minute_limit_default?: number
  per_hour_limit_default?: number
  per_day_limit_default?: number
}

export function AIProviderManagement() {
  const lt = useLiterals()
  const supabase = useMemo(() => createClient(), [])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string | null>>({})
  const [platformDefaultProviderId, setPlatformDefaultProviderId] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [editConfigJson, setEditConfigJson] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [editDefaultModel, setEditDefaultModel] = useState('')
  const [editPerMinute, setEditPerMinute] = useState<number | ''>('')
  const [editPerHour, setEditPerHour] = useState<number | ''>('')
  const [editPerDay, setEditPerDay] = useState<number | ''>('')

  const fetchPlatformDefaultProvider = useCallback(async () => {
    try {
      const { data, error } = await (supabase.from('system_settings') as any)
        .select('setting_value')
        .eq('setting_key', 'ai_default_provider')
        .maybeSingle()

      if (error) throw error
      const id = (data as any)?.setting_value?.ai_provider_id
      setPlatformDefaultProviderId(typeof id === 'string' && id.trim() ? id : null)
    } catch (err) {
      // Best-effort; don't block the page if the setting is missing or RLS blocks.
      console.warn('Platform default AI provider setting not available:', err)
    }
  }, [supabase])

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch providers and optional usage/limits from a view or RPC if available.
      // For now, we just load ai_providers and use config JSON for thresholds.
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) throw error

      const mapped: AIProvider[] = (data || []).map((p: any) => {
        const config = (p.config || {}) as any
        return {
          ...p,
          current_month_calls: config.current_month_calls ?? 0,
          per_minute_limit_default: config.per_minute_limit_default ?? 60,
          per_hour_limit_default: config.per_hour_limit_default ?? 1000,
          per_day_limit_default: config.per_day_limit_default ?? 20000,
        }
      })

      setProviders(mapped)
    } catch (err) {
      console.error('Error fetching AI providers:', err)
      setError(lt('Failed to load AI providers. Please try again later.'))
    } finally {
      setLoading(false)
    }
  }, [supabase, lt])

  const fetchAssignments = useCallback(async () => {
    try {
      const { data, error } = await (supabase.from('ai_provider_assignments') as any)
        .select('purpose, ai_provider_id')

      if (error) throw error
      const next: Record<string, string | null> = {}
      for (const row of data ?? []) {
        const purpose = String((row as any).purpose ?? '').trim()
        if (!purpose) continue
        next[purpose] = (row as any).ai_provider_id ? String((row as any).ai_provider_id) : null
      }
      setAssignments(next)
    } catch (err) {
      // If the table doesn't exist yet (migration not applied), don't hard-fail the page.
      console.warn('AI provider assignments not available:', err)
    }
  }, [supabase])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

  useEffect(() => {
    fetchPlatformDefaultProvider()
  }, [fetchPlatformDefaultProvider])

  const updateProviderConfig = (index: number, changes: Partial<AIProvider>) => {
    setProviders(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...changes }
      return copy
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      for (const provider of providers) {
        const { id, per_minute_limit_default, per_hour_limit_default, per_day_limit_default, config, is_active } = provider
        const nextConfig = {
          ...(config as any),
          per_minute_limit_default: per_minute_limit_default ?? 60,
          per_hour_limit_default: per_hour_limit_default ?? 1000,
          per_day_limit_default: per_day_limit_default ?? 20000,
        }

        const { error } = await (supabase
          .from('ai_providers') as any)
          .update({
            is_active,
            config: nextConfig,
          })
          .eq('id', id)

        if (error) throw error
      }

      await fetchProviders()

      // Save platform default provider (does not require per-purpose assignments)
      const { error: defaultProviderErr } = await (supabase.from('system_settings') as any).upsert(
        {
          setting_key: 'ai_default_provider',
          setting_value: {
            ai_provider_id: platformDefaultProviderId,
          },
        },
        { onConflict: 'setting_key' }
      )
      if (defaultProviderErr) throw defaultProviderErr

      // Save platform routing assignments (best-effort; requires migration)
      const rows = Object.entries(assignments).map(([purpose, ai_provider_id]) => ({
        purpose,
        ai_provider_id: ai_provider_id || null,
      }))

      if (rows.length > 0) {
        const { error } = await (supabase.from('ai_provider_assignments') as any).upsert(rows, {
          onConflict: 'purpose',
        })
        if (error) throw error
      }
    } catch (err) {
      console.error('Error saving AI providers:', err)
      setError(lt('Failed to save changes. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const purposes = useMemo(
    () =>
      [
        { id: 'TRANSLATION', label: lt('Translation') },
        { id: 'CHATBOT', label: lt('Chatbot / AI Agent') },
        { id: 'MARKETING', label: lt('Marketing / Website Copy') },
        { id: 'DOCUMENT_PROCESSING', label: lt('Document Processing') },
        { id: 'TRANSACTION_CATEGORIZATION', label: lt('Transaction Categorization') },
        { id: 'BANK_RECONCILIATION', label: lt('Bank Statement Reconciliation') },
      ] as const,
    [lt]
  )

  const activeProviders = useMemo(() => providers.filter((p) => p.is_active), [providers])

  const openEditConfig = (provider: AIProvider) => {
    setEditingProvider(provider)
    const cfg = (provider.config || {}) as any
    setEditConfigJson(JSON.stringify(cfg, null, 2))
    setEditApiKey(cfg.platform_api_key || '')
    setEditIsDefault(cfg.is_default === true)
    setEditDefaultModel(
      String(
        cfg.defaultModel ??
          cfg.default_model ??
          cfg.model ??
          (Array.isArray(cfg.models) ? (cfg.models[0] ?? '') : '')
      )
    )
    setEditPerMinute(provider.per_minute_limit_default ?? cfg.per_minute_limit_default ?? '')
    setEditPerHour(provider.per_hour_limit_default ?? cfg.per_hour_limit_default ?? '')
    setEditPerDay(provider.per_day_limit_default ?? cfg.per_day_limit_default ?? '')
  }

  const handleSaveConfig = async () => {
    if (!editingProvider) return

    let parsed: any
    try {
      parsed = editConfigJson.trim() ? JSON.parse(editConfigJson) : {}
    } catch {
      setError(lt('Invalid JSON in provider configuration. Please fix and try again.'))
      return
    }

    // Inject platform-level fields into config
    parsed.platform_api_key = editApiKey || null
    parsed.is_default = editIsDefault
    parsed.defaultModel = editDefaultModel.trim() ? editDefaultModel.trim() : null
    parsed.per_minute_limit_default = typeof editPerMinute === 'number' ? editPerMinute : null
    parsed.per_hour_limit_default = typeof editPerHour === 'number' ? editPerHour : null
    parsed.per_day_limit_default = typeof editPerDay === 'number' ? editPerDay : null

    try {
      setSaving(true)
      setError(null)

      const { error } = await (supabase
        .from('ai_providers') as any)
        .update({ config: parsed })
        .eq('id', editingProvider.id)

      if (error) throw error

      setEditingProvider(null)
      await fetchProviders()
    } catch (err) {
      console.error('Error saving provider config:', err)
      setError(lt('Failed to save provider configuration.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{lt('AI Providers')}</h2>
          <p className="text-sm text-gray-600">
            {lt('Configure which AI providers are available and set monthly call limits to avoid hitting provider quotas.')}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {lt('Save Changes')}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-red-700">
            <ShieldAlert className="w-4 h-4" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{lt('Platform Default Provider')}</CardTitle>
          <CardDescription>
            {lt('Used when a purpose does not have an explicit routing assignment.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-sm font-medium">{lt('Default')}</div>
            <div className="w-full md:w-[360px]">
              <Select
                value={platformDefaultProviderId ?? '__AUTO__'}
                onValueChange={(v) => setPlatformDefaultProviderId(v === '__AUTO__' ? null : v)}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lt('Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__AUTO__">
                    {lt('Auto (use provider marked default, else first active)')}
                  </SelectItem>
                  {activeProviders.map((prov) => (
                    <SelectItem key={prov.id} value={String(prov.id)}>
                      {prov.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Provider Routing')}</CardTitle>
          <CardDescription>
            {lt('Choose which AI provider is used for each platform function. Unset uses the platform default provider.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {purposes.map((p) => (
            <div key={p.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="w-full md:w-[360px]">
                <Select
                  value={assignments[p.id] ?? '__DEFAULT__'}
                  onValueChange={(v) =>
                    setAssignments((prev) => ({
                      ...prev,
                      [p.id]: v === '__DEFAULT__' ? null : v,
                    }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={lt('Select provider')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__DEFAULT__">{lt('Use platform default')}</SelectItem>
                    {activeProviders.map((prov) => (
                      <SelectItem key={prov.id} value={String(prov.id)}>
                        {prov.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Provider Configuration')}</CardTitle>
          <CardDescription>
            {lt('Enable/disable providers and control how many AI calls each provider can receive per month.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lt('Name')}</TableHead>
                <TableHead>{lt('Endpoint')}</TableHead>
                <TableHead className="w-40">{lt('Active')}</TableHead>
                <TableHead className="w-72">{lt('Rate Limits (Default)')}</TableHead>
                <TableHead className="w-40 text-right">{lt('Usage (This Month)')}</TableHead>
                <TableHead className="w-32 text-right">{lt('Config')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p, index) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{p.display_name}</div>
                      {(p.config as any)?.is_default === true && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          {lt('Default')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{p.name}</div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-gray-600">
                    {p.api_endpoint || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.is_active ?? true}
                        onCheckedChange={(value) => updateProviderConfig(index, { is_active: value })}
                      />
                      <span className="text-xs text-gray-600">{lt('Active')}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">{lt('/ min')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={p.per_minute_limit_default ?? ''}
                          onChange={(e) =>
                            updateProviderConfig(index, {
                              per_minute_limit_default: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">{lt('/ hour')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={p.per_hour_limit_default ?? ''}
                          onChange={(e) =>
                            updateProviderConfig(index, {
                              per_hour_limit_default: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">{lt('/ day')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={p.per_day_limit_default ?? ''}
                          onChange={(e) =>
                            updateProviderConfig(index, {
                              per_day_limit_default: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-600">
                    {p.current_month_calls ?? 0} {lt('calls this month')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditConfig(p)}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      {lt('Edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lt('Threshold Behavior')}</CardTitle>
          <CardDescription>
            {lt('When a provider approaches its per-minute, per-hour, or per-day limits, tenant AI calls should be throttled or routed to fallback providers.')}{' '}
            {lt('This UI stores default limits in provider config; backend enforcement can read')}{' '}
            <code>per_minute_limit_default</code>, <code>per_hour_limit_default</code>, {lt('and')}{' '}
            <code>per_day_limit_default</code> {lt('from')} <code>ai_providers.config</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
        <DialogContent className="max-w-2xl">
          {editingProvider && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  {lt('Edit Provider Configuration')}
                </DialogTitle>
                <DialogDescription>
                  {lt('Editing')}{' '}
                  <span className="font-medium">{editingProvider.display_name}</span> ({editingProvider.name}).{' '}
                  {lt('This acts as the platform default config and can be overridden per tenant.')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="endpoint">{lt('API Endpoint')}</Label>
                  <Input
                    id="endpoint"
                    value={editingProvider.api_endpoint || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setEditingProvider(prev => (prev ? { ...prev, api_endpoint: value } as AIProvider : prev))
                    }}
                    placeholder={lt('https://openrouter.ai/api/v1')}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="platform-key">{lt('Platform API Key (optional)')}</Label>
                  <Input
                    id="platform-key"
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder={lt('sk-...')}
                  />
                  <p className="text-xs text-gray-600">
                    {lt('If provided, this key will be used when a tenant has not set their own key.')}{' '}
                    {lt('Tenant-level API keys in')} <code>tenant_ai_configurations</code> {lt('always take precedence.')}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 border rounded-md px-3 py-2 bg-muted/40">
                  <div>
                    <Label className="flex items-center gap-1 text-sm font-medium">
                      <Star className="w-3 h-3 text-yellow-500" />
                      {lt('Default AI Provider')}
                    </Label>
                    <p className="text-xs text-gray-600">
                      {lt('Mark this provider as the default for the platform. Tenants can still override it.')}
                    </p>
                  </div>
                  <Switch checked={editIsDefault} onCheckedChange={setEditIsDefault} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="default-model">{lt('Default Model')}</Label>
                  <Input
                    id="default-model"
                    value={editDefaultModel}
                    onChange={(e) => setEditDefaultModel(e.target.value)}
                    placeholder={lt('e.g. google/gemini-2.0-flash-exp:free')}
                  />
                  <p className="text-xs text-gray-600">
                    {lt('Used when a tenant has not set a model.')}{' '}
                    {lt('If empty, the backend falls back to the first entry in')}{' '}
                    <code>models</code> {lt('(if present) or provider-specific defaults.')}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="config-json">{lt('Provider Config (JSON)')}</Label>
                  <Textarea
                    id="config-json"
                    className="font-mono text-xs min-h-[180px]"
                    value={editConfigJson}
                    onChange={(e) => setEditConfigJson(e.target.value)}
                  />
                  <p className="text-xs text-gray-600">
                    {lt('Define defaults such as')}{' '}
                    <code>models</code>, <code>baseUrl</code>, {lt('and other provider-specific options.')}{' '}
                    {lt('Platform-level config is merged with tenant-level overrides.')}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingProvider(null)}
                  disabled={saving}
                >
                  {lt('Cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!editingProvider) return
                    // Persist endpoint and config in one go
                    let parsed: any
                    try {
                      parsed = editConfigJson.trim() ? JSON.parse(editConfigJson) : {}
                    } catch {
                      setError(lt('Invalid JSON in provider configuration. Please fix and try again.'))
                      return
                    }

                    parsed.platform_api_key = editApiKey || null
                    parsed.is_default = editIsDefault
                    parsed.defaultModel = editDefaultModel.trim() ? editDefaultModel.trim() : null

                    try {
                      setSaving(true)
                      setError(null)

                      const { error } = await (supabase
                        .from('ai_providers') as any)
                        .update({
                          api_endpoint: editingProvider.api_endpoint,
                          config: parsed,
                        })
                        .eq('id', editingProvider.id)

                      if (error) throw error

                      setEditingProvider(null)
                      await fetchProviders()
                    } catch (err) {
                      console.error('Error saving provider config:', err)
                      setError(lt('Failed to save provider configuration.'))
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {lt('Save Config')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
