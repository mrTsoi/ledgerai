"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useLiterals } from '@/hooks/use-literals';
import { useTenant } from '@/hooks/use-tenant'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

// Placeholder types and API calls
// Replace with real types and API integration
interface ScheduledJob {
  id: string;
  tenantId?: string;
  source: string;
  frequency: string;
  lastRun: string;
  nextRun: string;
  status: 'success' | 'failure' | 'pending';
}

const FREQUENCIES = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Weekly', value: '0 0 * * 0' },
  { label: 'Custom (cron)', value: 'custom' },
];

export function AutomatedSyncSettings() {
  const lt = useLiterals();
  const [helpOpen, setHelpOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [rotating, setRotating] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const { currentTenant } = useTenant()
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [editFrequency, setEditFrequency] = useState('');
  const [editCustom, setEditCustom] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    // Fetch tenant-scoped state: enabled, webhookUrl, jobs
    // Server MUST return only tenant-scoped schedules and secrets (RLS enforced)
    const fetchJobs = async () => {
      setLoading(true)
      try {
        if (!currentTenant) return
        const tenantId = currentTenant.id
        // List external sources for tenant
        const res = await fetch(`/api/external-sources?tenant_id=${encodeURIComponent(tenantId)}`)
        if (!res.ok) {
          setEnabled(false)
          setJobs([])
          return
        }
        const listJson = await res.json()
        const sources = listJson?.data || []

        // Fetch cron config (contains whether cron is configured/enabled and key prefix)
        const cronRes = await fetch(`/api/external-sources/cron?tenant_id=${encodeURIComponent(tenantId)}`)
        const cronJson = cronRes.ok ? await cronRes.json() : null
        setEnabled(!!cronJson?.enabled)

        // If configured, we don't have the secret here (rotate endpoint returns it). Provide run URL without secret placeholder.
        const keyPrefix = cronJson?.key_prefix
        const secretPlaceholder = keyPrefix ? 'REDACTED' : ''
        setWebhookUrl(`${location.origin}/api/external-sources/run?tenant_id=${tenantId}${secretPlaceholder ? `&secret=${secretPlaceholder}` : ''}`)

        // Map sources to UI jobs
        const mapped = (sources || []).map((s: any) => ({
          id: String(s.id),
          tenantId: s.tenant_id,
          source: s.name || s.provider || 'Unknown',
          frequency: s.schedule_minutes ? `${s.schedule_minutes} min` : '—',
          lastRun: s.last_run_at || '-',
          nextRun: '-',
          status: s.last_run_at ? 'success' : 'pending',
        }))
        setJobs(mapped)
      } catch (err) {
        console.error('Error fetching automated sync settings', err)
        setEnabled(false)
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    fetchJobs()

    // listen for source changes (created/edited/deleted) so we can refresh jobs list
    const handler = () => {
      fetchJobs().catch((e) => console.error('Failed to refresh jobs after externalSourcesChanged', e))
    }
    window.addEventListener('externalSourcesChanged', handler)
    return () => window.removeEventListener('externalSourcesChanged', handler)
  }, [currentTenant]);

  // Helper to safely parse JSON or fallback to text for error messages
  const parseResponse = async (res: Response) => {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      try {
        return await res.json()
      } catch (e) {
        try {
          const txt = await res.text()
          const obj = { __raw: txt }
          ;(async () => {
            try {
              const payload = {
                event: 'api_parse_fallback',
                details: {
                  endpoint: (res as any).url || null,
                  status: res.status,
                  raw_snippet: String(txt).slice(0, 1024),
                  tenant_id: currentTenant?.id || null,
                  ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                  ts: new Date().toISOString(),
                },
              }
              await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            } catch (e) {
              // swallow telemetry errors
            }
          })()
          return obj
        } catch {
          return null
        }
      }
    }
    // not json: try text then attempt parse
    try {
      const txt = await res.text()
      try {
        return JSON.parse(txt)
      } catch {
        const obj = { __raw: txt }
        ;(async () => {
          try {
            const payload = {
              event: 'api_parse_fallback',
              details: {
                endpoint: (res as any).url || null,
                status: res.status,
                raw_snippet: String(txt).slice(0, 1024),
                tenant_id: currentTenant?.id || null,
                ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                ts: new Date().toISOString(),
              },
            }
            await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
          } catch (e) {
            // swallow telemetry errors
          }
        })()
        return obj
      }
    } catch {
      return null
    }
  }

  const handleRotateSecret = async () => {
    setRotating(true);
    try {
      if (!currentTenant) throw new Error('No tenant')
      const tenantId = currentTenant.id
      const res = await fetch(`/api/external-sources/cron/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      if (!res.ok) throw new Error('Rotate failed')
      const json = await res.json()
      const secret = json?.cron_secret
      setWebhookUrl(`${location.origin}/api/external-sources/run?tenant_id=${tenantId}&secret=${secret}`)
      toast.success(lt('Secret rotated. Update your scheduler with the new URL.'))
    } catch (err) {
      console.error(err)
      toast.error(lt('Failed to rotate secret'))
    } finally {
      setRotating(false)
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      if (!currentTenant) throw new Error('No tenant')
      const tenantId = currentTenant.id
      const res = await fetch(`/api/external-sources/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      if (!res.ok) {
        const parsed = await parseResponse(res)
        const msg = parsed && typeof parsed === 'object' ? (parsed.error || parsed.message || parsed.__raw) : (typeof parsed === 'string' ? parsed : null)
        throw new Error(msg || 'Run failed')
      }
      const json = await parseResponse(res) || {}
      toast.success(lt('Sync triggered.'))
      console.info('Run result', json)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || lt('Failed to trigger sync'))
    } finally {
      setRunning(false)
    }
  };

  const handleEditJob = (job: ScheduledJob) => {
    const tenantId = currentTenant?.id
    if (job.tenantId && tenantId && job.tenantId !== tenantId) {
      toast.error(lt('You do not have permission to edit this schedule.'))
      ;(async () => {
        try {
          const sup = createBrowserClient()
          const { data } = await sup.auth.getUser()
          const payload = {
            event: 'cross_tenant_block',
            details: {
              action: 'edit_attempt',
              target_tenant_id: job.tenantId,
              attempted_by_tenant_id: tenantId,
              user_id: data?.user?.id || null,
              user_email: data?.user?.email || null,
              source: 'automated-sync-ui',
            },
          }
          await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        } catch (e) {
          console.error('Failed to log security event', e)
        }
      })()
      return
    }
    setEditingJob(job)
    setEditFrequency(FREQUENCIES.find(f => f.value === job.frequency) ? job.frequency : 'custom')
    setEditCustom(FREQUENCIES.find(f => f.value === job.frequency) ? '' : job.frequency)
    setEditError('')
  };

  const handleSaveEdit = () => {
    const tenantId = currentTenant?.id
    if (!tenantId || !editingJob) {
      setEditError(lt('No tenant selected'))
      return
    }

    let freq = editFrequency === 'custom' ? editCustom.trim() : editFrequency
    if (!freq) {
      setEditError(lt('Frequency is required.'))
      return
    }

    const frequencyToMinutes = (f: string) => {
      // Map common cron expressions to minutes; fallback to numeric parse
      if (f === '*/15 * * * *') return 15
      if (f === '0 * * * *') return 60
      if (f === '0 0 * * *') return 1440
      if (f === '0 0 * * 0') return 10080
      const n = Number(f)
      return Number.isFinite(n) && n > 0 ? Math.max(5, Math.floor(n)) : 60
    }

    const schedule_minutes = frequencyToMinutes(freq)

    const payload: any = {
      tenant_id: tenantId,
      name: editingJob.source || 'Unnamed',
      provider: 'SFTP',
      enabled: true,
      schedule_minutes,
      config: {},
    }
    if (!editingJob.id.startsWith('new-')) payload.id = editingJob.id

    // Call upsert API
    fetch('/api/external-sources/upsert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const parsed = await parseResponse(res)
          const msg = parsed && typeof parsed === 'object' ? (parsed.error || parsed.message || parsed.__raw) : (typeof parsed === 'string' ? parsed : null)
          throw new Error(msg || 'Save failed')
        }
        const j = await parseResponse(res) || {}
        const id = j?.id || editingJob.id
        setJobs((prev) => {
          if (editingJob.id.startsWith('new-')) {
            return [{ id, tenantId: tenantId, source: editingJob.source, frequency: `${schedule_minutes} min`, lastRun: '-', nextRun: '-', status: 'pending' }, ...prev]
          }
          return prev.map((r) => (r.id === editingJob.id ? { ...r, id, frequency: `${schedule_minutes} min`, source: editingJob.source } : r))
        })
        setEditingJob(null)
        setEditFrequency('')
        setEditCustom('')
        setEditError('')
        try {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('externalSourcesChanged'))
        } catch {
          // ignore
        }
        toast.success(lt('Schedule updated.'))
      })
      .catch((err) => {
        console.error(err)
        setEditError(err?.message || lt('Failed to save'))
      })
  };

  const handleDeleteJob = (id: string) => {
    const job = jobs.find(j => j.id === id)
    const tenantId = currentTenant?.id
    if (job?.tenantId && tenantId && job.tenantId !== tenantId) {
      toast.error(lt('You do not have permission to delete this schedule.'))
      ;(async () => {
        try {
          const sup = createBrowserClient()
          const { data } = await sup.auth.getUser()
          const payload = {
            event: 'cross_tenant_block',
            details: {
              action: 'delete_attempt',
              target_tenant_id: job.tenantId,
              attempted_by_tenant_id: tenantId,
              user_id: data?.user?.id || null,
              user_email: data?.user?.email || null,
              source: 'automated-sync-ui',
            },
          }
          await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        } catch (e) {
          console.error('Failed to log security event', e)
        }
      })()
      return
    }
    // Call delete API
    fetch('/api/external-sources/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source_id: id }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const parsed = await parseResponse(res)
          const msg = parsed && typeof parsed === 'object' ? (parsed.error || parsed.message || parsed.__raw) : (typeof parsed === 'string' ? parsed : null)
          throw new Error(msg || 'Delete failed')
        }
        setJobs(jobs => jobs.filter(j => j.id !== id))
        try {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('externalSourcesChanged'))
        } catch {
          // ignore
        }
        toast.success(lt('Schedule deleted.'))
      })
      .catch((err) => {
        console.error(err)
        toast.error(err?.message || lt('Failed to delete'))
      })
  };

  const handleAddJob = () => {
    const tenantId = currentTenant?.id
    setEditingJob({
      id: 'new-' + Date.now(),
      tenantId,
      source: '',
      frequency: '0 * * * *',
      lastRun: '-',
      nextRun: '-',
      status: 'pending',
    });
    setEditFrequency('0 * * * *');
    setEditCustom('');
    setEditError('');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{lt('Automated Data Sync')}</CardTitle>
        <CardDescription>
          {lt('Automate your data imports by connecting a scheduler. No coding required.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm">{lt('Enable Automated Sync')}</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRunNow} disabled={running || !enabled}>
            {running ? lt('Running...') : lt('Run Now')}
          </Button>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-sm">{lt('Webhook URL')}</div>
          <Input
            className="font-mono text-xs"
            value={webhookUrl}
            readOnly
            onFocus={e => e.target.select()}
          />
          <div className="text-xs text-muted-foreground">
            {lt('Copy this URL into your scheduler to enable automated sync.')} <br />
            <span className="text-warning">{lt('Keep this URL secret.')}</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRotateSecret} disabled={rotating}>
            {rotating ? lt('Rotating...') : lt('Rotate Secret')}
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">{lt('Scheduled Jobs')}</div>
            <Button size="sm" variant="outline" onClick={handleAddJob}>{lt('Add Schedule')}</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-md">
              <thead>
                <tr>
                  <th className="p-2 text-left">{lt('Source')}</th>
                  <th className="p-2 text-left">{lt('Frequency')}</th>
                  <th className="p-2 text-left">{lt('Last Run')}</th>
                  <th className="p-2 text-left">{lt('Next Run')}</th>
                  <th className="p-2 text-left">{lt('Status')}</th>
                  <th className="p-2 text-left">{lt('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2">{job.source || <span className="italic text-muted-foreground">{lt('(not set)')}</span>}</td>
                    <td className="p-2">
                      {FREQUENCIES.find(f => f.value === job.frequency)?.label
                        ? lt(FREQUENCIES.find(f => f.value === job.frequency)!.label)
                        : job.frequency}
                    </td>
                    <td className="p-2">{job.lastRun}</td>
                    <td className="p-2">{job.nextRun}</td>
                    <td className="p-2">
                      <span className={
                        job.status === 'success'
                          ? 'text-green-600'
                          : job.status === 'failure'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }>
                        {job.status}
                      </span>
                    </td>
                    <td className="p-2 flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-primary"
                              onClick={() => handleEditJob(job)}
                              aria-label={lt('Edit schedule')}
                            >
                              <Pencil1Icon className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{lt('Edit')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeleteJob(job.id)}
                              aria-label={lt('Delete schedule')}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{lt('Delete')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit/Add Schedule Modal */}
        <Dialog open={!!editingJob} onOpenChange={open => { if (!open) setEditingJob(null); }}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>{editingJob?.id?.startsWith('new-') ? lt('Add Schedule') : lt('Edit Schedule')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">{lt('Source')}</label>
                <Input
                  value={editingJob?.source || ''}
                  onChange={e => setEditingJob(j => j ? { ...j, source: e.target.value } : j)}
                  placeholder={lt('e.g. Google Drive')}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lt('Frequency')}</label>
                <Select value={editFrequency} onValueChange={v => setEditFrequency(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={lt('Select frequency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => (
                      <SelectItem key={f.value} value={f.value}>{lt(f.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editFrequency === 'custom' && (
                  <Input
                    className="mt-2"
                    value={editCustom}
                    onChange={e => setEditCustom(e.target.value)}
                    placeholder={lt('Custom cron expression')}
                  />
                )}
              </div>
              {editError && <div className="text-xs text-red-600">{editError}</div>}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditingJob(null)}>{lt('Cancel')}</Button>
                <Button size="sm" onClick={handleSaveEdit}>{lt('Save')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            className="underline text-left text-xs text-muted-foreground hover:text-primary focus:outline-none"
            onClick={() => setHelpOpen(true)}
          >
            {lt('How does automated sync work?')}
          </button>
        </div>

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>{lt('How does automated sync work?')}</DialogTitle>
              <DialogDescription>
                {lt('Learn how to set up and manage automated data sync for your tenant.')}
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 space-y-2 text-sm mt-2">
              <li>
                <b>{lt('Automated sync')}</b> {lt('lets you schedule regular imports from your connected sources (e.g., Google Drive, SFTP) without manual action.')}
              </li>
              <li>
                <b>{lt('Setup:')}</b> {lt('Copy the provided Webhook URL into your preferred scheduler (such as Supabase Edge Functions, Zapier, or a cron service). The URL is unique to your tenant and securely triggers your data import.')}
              </li>
              <li>
                <b>{lt('Security:')}</b> {lt("Keep your Webhook URL secret. If you think it's been exposed, use \"Rotate Secret\" to generate a new one and update your scheduler.")}
              </li>
              <li>
                <b>{lt('Status:')}</b> {lt('You can see the last and next run times, and the result of each scheduled import in the table above.')}
              </li>
              <li>
                <b>{lt('Troubleshooting:')}</b> {lt('If a sync fails, check your source connection and try "Run Now" to test. Contact support if issues persist.')}
              </li>
            </ul>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
