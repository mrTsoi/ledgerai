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
import { Loader2, ShieldAlert, Settings2, Star } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

type AIProvider = Database['public']['Tables']['ai_providers']['Row'] & {
  current_month_calls?: number
  per_minute_limit_default?: number
  per_hour_limit_default?: number
  per_day_limit_default?: number
}

export function AIProviderManagement() {
  const supabase = useMemo(() => createClient(), [])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [editConfigJson, setEditConfigJson] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [editPerMinute, setEditPerMinute] = useState<number | ''>('')
  const [editPerHour, setEditPerHour] = useState<number | ''>('')
  const [editPerDay, setEditPerDay] = useState<number | ''>('')

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
      setError('Failed to load AI providers. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

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
    } catch (err) {
      console.error('Error saving AI providers:', err)
      setError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const openEditConfig = (provider: AIProvider) => {
    setEditingProvider(provider)
    const cfg = (provider.config || {}) as any
    setEditConfigJson(JSON.stringify(cfg, null, 2))
    setEditApiKey(cfg.platform_api_key || '')
    setEditIsDefault(cfg.is_default === true)
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
      setError('Invalid JSON in provider configuration. Please fix and try again.')
      return
    }

    // Inject platform-level fields into config
    parsed.platform_api_key = editApiKey || null
    parsed.is_default = editIsDefault
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
      setError('Failed to save provider configuration.')
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
          <h2 className="text-2xl font-bold">AI Providers</h2>
          <p className="text-sm text-gray-600">
            Configure which AI providers are available and set monthly call limits to avoid hitting provider quotas.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Changes
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
          <CardTitle>Provider Configuration</CardTitle>
          <CardDescription>
            Enable/disable providers and control how many AI calls each provider can receive per month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead className="w-40">Active</TableHead>
                <TableHead className="w-72">Rate Limits (Default)</TableHead>
                <TableHead className="w-40 text-right">Usage (This Month)</TableHead>
                <TableHead className="w-32 text-right">Config</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p, index) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.display_name}</div>
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
                      <span className="text-xs text-gray-600">Active</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">/ min</Label>
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
                        <Label className="text-xs text-gray-500">/ hour</Label>
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
                        <Label className="text-xs text-gray-500">/ day</Label>
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
                    {p.current_month_calls ?? 0} calls this month
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditConfig(p)}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      Edit
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
          <CardTitle>Threshold Behavior</CardTitle>
          <CardDescription>
            When a provider approaches its per-minute, per-hour, or per-day limits, tenant AI calls should be throttled
            or routed to fallback providers. This UI stores default limits in provider config; backend enforcement can
            read <code>per_minute_limit_default</code>, <code>per_hour_limit_default</code>, and
            <code>per_day_limit_default</code> from <code>ai_providers.config</code>.
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
                  Edit Provider Configuration
                </DialogTitle>
                <DialogDescription>
                  Editing <span className="font-medium">{editingProvider.display_name}</span> ({editingProvider.name}).
                  This acts as the platform default config and can be overridden per tenant.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="endpoint">API Endpoint</Label>
                  <Input
                    id="endpoint"
                    value={editingProvider.api_endpoint || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setEditingProvider(prev => (prev ? { ...prev, api_endpoint: value } as AIProvider : prev))
                    }}
                    placeholder="https://openrouter.ai/api/v1"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="platform-key">Platform API Key (optional)</Label>
                  <Input
                    id="platform-key"
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  <p className="text-xs text-gray-600">
                    If provided, this key will be used when a tenant has not set their own key. Tenant-level
                    API keys in <code>tenant_ai_configurations</code> always take precedence.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 border rounded-md px-3 py-2 bg-muted/40">
                  <div>
                    <Label className="flex items-center gap-1 text-sm font-medium">
                      <Star className="w-3 h-3 text-yellow-500" />
                      Default AI Provider
                    </Label>
                    <p className="text-xs text-gray-600">
                      Mark this provider as the default for the platform. Tenants can still override it.
                    </p>
                  </div>
                  <Switch checked={editIsDefault} onCheckedChange={setEditIsDefault} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="config-json">Provider Config (JSON)</Label>
                  <Textarea
                    id="config-json"
                    className="font-mono text-xs min-h-[180px]"
                    value={editConfigJson}
                    onChange={(e) => setEditConfigJson(e.target.value)}
                  />
                  <p className="text-xs text-gray-600">
                    Define defaults such as <code>models</code>, <code>baseUrl</code>, and other
                    provider-specific options. Platform-level config is merged with tenant-level overrides.
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
                  Cancel
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
                      setError('Invalid JSON in provider configuration. Please fix and try again.')
                      return
                    }

                    parsed.platform_api_key = editApiKey || null
                    parsed.is_default = editIsDefault

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
                      setError('Failed to save provider configuration.')
                    } finally {
                      setSaving(false)
                    }
                  }}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Config
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
