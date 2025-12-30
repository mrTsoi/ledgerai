"use client"

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Folder, File as FileIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AutomatedSyncSettings } from './automated-sync-settings'
import { useLiterals } from '@/hooks/use-literals'
import { useTenant } from '@/hooks/use-tenant'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ExternalSourcesSettings() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()

  const [sources, setSources] = useState<any[]>([])
  const [loadingSources, setLoadingSources] = useState(false)

  const fetchSources = useCallback(async () => {
    if (!currentTenant) return
    setLoadingSources(true)
    try {
      const res = await fetch(`/api/external-sources?tenant_id=${encodeURIComponent(currentTenant.id)}`)
      if (!res.ok) {
        setSources([])
        return
      }
      const json = await res.json().catch(() => ({ data: [] }))
      setSources(json?.data || [])
    } catch (e) {
      console.error('Failed to fetch external sources', e)
      setSources([])
    } finally {
      setLoadingSources(false)
    }
  }, [currentTenant])

  useEffect(() => {
    void fetchSources()
  }, [fetchSources])

  const createSource = async () => {
    if (!currentTenant) return
    const name = prompt(String(lt('Name for new source')))
    if (!name) return
    try {
      const payload = { tenant_id: currentTenant.id, name, provider: 'SFTP', enabled: false, schedule_minutes: 60 }
      const res = await fetch('/api/external-sources/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const parsed = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(parsed?.error || 'Create failed')
      toast.success(lt('Created source'))
      try { window.dispatchEvent(new CustomEvent('externalSourcesChanged')) } catch {}
      await fetchSources()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || lt('Failed to create source'))
    }
  }

  const deleteSource = async (id: string) => {
    if (!confirm(lt('Delete this external source? This will remove its configuration and any import history.'))) return
    try {
      const res = await fetch('/api/external-sources/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: id }) })
      const parsed = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(parsed?.error || 'Delete failed')
      toast.success(lt('Deleted external source'))
      try { window.dispatchEvent(new CustomEvent('externalSourcesChanged')) } catch {}
      await fetchSources()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || lt('Failed to delete source'))
    }
  }

  // Setup Wizard / Edit dialog state
  const [wizOpen, setWizOpen] = useState(false)
  const [wizStep, setWizStep] = useState<1|2|3>(1)
  const [wizId, setWizId] = useState<string | null>(null)
  const [wizName, setWizName] = useState('')
  const [wizProvider, setWizProvider] = useState<'SFTP'|'FTPS'|'GOOGLE_DRIVE'|'ONEDRIVE'>('SFTP')
  const [wizSchedule, setWizSchedule] = useState<number>(60)
  const [wizWorking, setWizWorking] = useState(false)
  const [wizConfig, setWizConfig] = useState<any>({})
  const [wizConnectingOAuth, setWizConnectingOAuth] = useState(false)

  const startOAuthConnect = async (): Promise<boolean> => {
    if (!currentTenant) {
      toast.error(lt('No tenant selected'))
      return false
    }
    try {
      setWizConnectingOAuth(true)
      // route differs per provider: google -> /oauth/google/start, onedrive -> /oauth/microsoft/start
      const providerPath = wizProvider === 'GOOGLE_DRIVE' ? 'google' : wizProvider === 'ONEDRIVE' ? 'microsoft' : null
      if (!providerPath) {
        setWizConnectingOAuth(false)
        toast.error(lt('Unsupported provider for OAuth'))
        return false
      }

      // Ensure we have a persisted source to attach the OAuth flow to (API requires `source_id`)
      let sourceId = wizId
      if (!sourceId) {
        try {
          const payload = {
            tenant_id: currentTenant.id,
            name: wizName || `${wizProvider} connection`,
            provider: wizProvider,
            enabled: false,
            schedule_minutes: wizSchedule,
          }
          const up = await fetch('/api/external-sources/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
          const upj = await up.json().catch(() => ({}))
          if (!up.ok) throw new Error(upj?.error || 'Failed to create source')
          sourceId = String(upj?.id || upj?.data?.id)
          if (sourceId) setWizId(sourceId)
        } catch (e: any) {
          console.error('Failed to create source for OAuth', e)
          setWizConnectingOAuth(false)
          toast.error(e?.message || lt('Failed to create source'))
          return false
        }
      }

      const url = `/api/external-sources/oauth/${providerPath}/start?source_id=${encodeURIComponent(sourceId)}&tenant_id=${encodeURIComponent(currentTenant.id)}`
      const width = 620
      const height = 720
      const left = Math.max(0, Math.floor((window.screen.width - width) / 2))
      const top = Math.max(0, Math.floor((window.screen.height - height) / 2))
      const popup = window.open(url, 'external_oauth', `width=${width},height=${height},left=${left},top=${top}`)
      if (!popup) {
        setWizConnectingOAuth(false)
        toast.error(lt('Popup blocked'))
        return false
      }
      return await new Promise<boolean>(async (resolve) => {
        const origin = window.location.origin;
        const cleanup = () => {
          try { window.removeEventListener('message', onMessage) } catch {}
        };

        const onMessage = async (ev: MessageEvent) => {
          try {
            if (ev.origin !== origin) return;
            const data = ev.data;
            if (data && data.type === 'external_oauth' && String(data.source_id) === String(sourceId)) {
              cleanup();
              // Fetch latest config for this source
              let config = {};
              try {
                const res = await fetch(`/api/external-sources?tenant_id=${encodeURIComponent(currentTenant.id)}`);
                const json = await res.json().catch(() => ({ data: [] }));
                const found = (json?.data || []).find((it: any) => String(it.id) === String(sourceId));
                if (found) config = found.config || {};
              } catch {}
              setWizConfig((prev: any) => ({ ...prev, ...config, oauth_connected: true }));
              setWizId(String(sourceId));
              toast.success(lt('Provider connected'));
              try { popup.close(); } catch (e) {}
              setWizConnectingOAuth(false);
              resolve(true);
            }
          } catch (e) {
            console.error('message handler error', e);
          }
        };

        window.addEventListener('message', onMessage);
      });
    } catch (e) {
      console.error(e)
      setWizConnectingOAuth(false)
      toast.error(lt('Failed to start OAuth'))
      return false
    }
  }

  function FolderPicker({ sourceId, onSelect, onClose }: { sourceId: string; onSelect: (folderId: string) => void; onClose: () => void }) {
    const [parentId, setParentId] = useState('root')
    const [loading, setLoading] = useState(false)
    const [folders, setFolders] = useState<any[]>([])
    const [files, setFiles] = useState<any[]>([])
    const [history, setHistory] = useState<string[]>([])
    const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([{ id: 'root', name: lt('Root') }])
    const [selected, setSelected] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [focusIndex, setFocusIndex] = useState<number>(-1)
    const itemRefs = useRef<Array<HTMLDivElement | null>>([])

    const storageKey = `external_sources_folderpicker_${sourceId}_crumbs`

    useEffect(() => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length) setCrumbs(parsed)
        }
      } catch (e) {
        // ignore
      }
    }, [storageKey])

    const fetchPage = useCallback(async (pid: string, pushCrumb?: { id: string; name: string } | null) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/external-sources/folders?source_id=${encodeURIComponent(sourceId)}&parent_id=${encodeURIComponent(pid)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Failed to list')
        setFolders(json.folders || [])
        setFiles(json.files || [])
        setParentId(json.parent_id || pid)
        if (pushCrumb) {
              setCrumbs((c) => {
                const next = [...c, pushCrumb]
                try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
                return next
              })
        }
      } catch (e: any) {
        toast.error(e?.message || 'Failed to list folders')
      } finally {
        setLoading(false)
      }
    }, [sourceId, storageKey])

    useEffect(() => { void fetchPage('root', null) }, [fetchPage])

    const enter = (f: any) => {
      setHistory((h) => [...h, parentId])
      void fetchPage(f.id, { id: f.id, name: f.name })
    }

    const goUp = () => {
      const prev = history[history.length - 1]
      if (!prev) return
      setHistory((h) => h.slice(0, -1))
      // pop last crumb
      setCrumbs((c) => {
        const next = c.length > 1 ? c.slice(0, -1) : c
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
        return next
      })
      void fetchPage(prev, null)
    }

    const gotoCrumb = (index: number) => {
      const crumb = crumbs[index]
      if (!crumb) return
      // navigate to crumb.id and trim crumbs
      setCrumbs((c) => {
        const next = c.slice(0, index + 1)
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
        return next
      })
      setHistory((h) => h.slice(0, index === 0 ? 0 : index - 0))
      void fetchPage(crumb.id, null)
    }

    const filteredFolders = useMemo(() => {
      if (!searchTerm) return folders
      const q = searchTerm.toLowerCase()
      return folders.filter((f: any) => (f.name || '').toLowerCase().includes(q))
    }, [folders, searchTerm])

    const filteredFiles = useMemo(() => {
      if (!searchTerm) return files
      const q = searchTerm.toLowerCase()
      return files.filter((f: any) => (f.name || '').toLowerCase().includes(q))
    }, [files, searchTerm])

    const onKeyDownItem = (e: React.KeyboardEvent, idx: number, f: any) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIndex((i) => Math.min(i + 1, filteredFolders.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        enter(f)
        return
      }
    }

    useEffect(() => {
      if (focusIndex >= 0 && itemRefs.current[focusIndex]) {
        try { itemRefs.current[focusIndex]?.focus() } catch {}
      }
    }, [focusIndex])

    return (
      <div className="mt-3 border rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">{lt('Folder Picker')}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={goUp} disabled={crumbs.length <= 1}>{lt('Up')}</Button>
            <Button variant="ghost" onClick={onClose}>{lt('Close')}</Button>
          </div>
        </div>

        <div className="mb-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground">{lt('Path')}:</div>
            <div className="flex items-center gap-1 overflow-auto">
              {crumbs.map((c, i) => (
                <button key={c.id} className="text-sm text-primary underline" onClick={() => gotoCrumb(i)}>{c.name}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Select Root button when at root */}
        {parentId === 'root' && (
          <div className="mb-2">
            <Button size="sm" variant="outline" onClick={() => { setSelected('root'); onSelect('root'); onClose(); }}>{lt('Select Root')}</Button>
          </div>
        )}

        <div className="mb-2 grid grid-cols-1 gap-2">
          <Input placeholder={lt('Filter folders and files')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">{lt('Folders')}</div>
            <ScrollArea className="h-56 border rounded p-2">
              {loading ? <div className="text-sm text-muted-foreground">{lt('Loading…')}</div> : (
                filteredFolders.length === 0 ? <div className="text-sm text-muted-foreground">{lt('No folders')}</div> : (
                  <div className="space-y-1">
                    {filteredFolders.map((f: any, idx: number) => (
                      <div
                        key={f.id}
                        ref={(el) => { itemRefs.current[idx] = el }}
                        tabIndex={0}
                        onKeyDown={(e) => onKeyDownItem(e as any, idx, f)}
                        className={`flex items-center justify-between p-1 rounded cursor-pointer focus:outline-none ${focusIndex === idx ? 'ring ring-primary' : ''} ${selected === f.id ? 'bg-muted' : ''}`}
                        onClick={() => enter(f)}
                        role="button"
                        aria-pressed={selected === f.id}
                      >
                        <div className="truncate flex items-center gap-2">
                          <Folder className="w-4 h-4 opacity-80" />
                          <span className="text-sm">{f.name}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={(ev) => { ev.stopPropagation(); enter(f) }}>{lt('Open')}</Button>
                          <Button size="sm" onClick={(ev) => { ev.stopPropagation(); setSelected(f.id); onSelect(f.id); onClose(); }}>{lt('Select')}</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </ScrollArea>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">{lt('Preview files')}</div>
            <ScrollArea className="h-56 border rounded p-2">
              {filteredFiles.length === 0 ? <div className="text-sm text-muted-foreground">{lt('No files')}</div> : (
                <div className="space-y-1 text-sm">
                  {filteredFiles.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between">
                      <div className="truncate flex items-center gap-2"><FileIcon className="w-4 h-4 opacity-70" />{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.size ?? ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    )
  }

  const [wizTesting, setWizTesting] = useState(false)
  const [wizTestResult, setWizTestResult] = useState<any | null>(null)
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  const testConnection = async () => {
    if (!currentTenant) return toast.error(lt('No tenant selected'))
    setWizTesting(true)
    setWizTestResult(null)
    try {
      let sourceId = wizId
      if (!sourceId) {
        // persist a draft source so we can test against server-side secrets handling
        const payload: any = {
          tenant_id: currentTenant.id,
          name: wizName || `temp-${Date.now()}`,
          provider: wizProvider,
          enabled: false,
          schedule_minutes: Number(wizSchedule || 60),
          config: { ...wizConfig },
          _test_only: true,
        }
        // move secret out of config into secrets if present, but server will not persist secrets when _test_only
        if (payload.config?.secret) {
          payload.secrets = { secret: payload.config.secret }
          delete payload.config.secret
        }

        const up = await fetch('/api/external-sources/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const upJson = await up.json().catch(() => ({}))
        if (!up.ok) throw new Error(upJson?.error || 'Failed to persist source')
        sourceId = upJson.id
        setWizId(String(sourceId))
        // fetchSources to refresh list
        void fetchSources()
      }

      const res = await fetch('/api/external-sources/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: sourceId }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.ok === false) {
        const err = json?.error || 'Test failed'
        setWizTestResult({ ok: false, error: err })
        toast.error(err)
      } else {
        setWizTestResult({ ok: true, list: json.list || [] })
        toast.success(lt('Connection test succeeded'))
      }
    } catch (e: any) {
      console.error('Test connection error', e)
      setWizTestResult({ ok: false, error: e?.message || 'Test failed' })
      toast.error(e?.message || lt('Test failed'))
    } finally {
      setWizTesting(false)
    }
  }

  const openWizardForNew = () => {
    setWizId(null)
    setWizName('')
    setWizProvider('SFTP')
    setWizSchedule(60)
    setWizConfig({})
    setWizStep(1)
    setWizOpen(true)
  }

  const openWizardForEdit = (s: any) => {
    setWizId(String(s.id))
    setWizName(s.name || '')
    setWizProvider(s.provider || 'SFTP')
    setWizSchedule(Number(s.schedule_minutes || 60))
    setWizConfig(s.config || {})
    setWizStep(1)
    setWizOpen(true)
  }

  const wizNext = () => setWizStep((p) => (p === 3 ? 3 : (p + 1) as 1|2|3))
  const wizBack = () => setWizStep((p) => (p === 1 ? 1 : (p - 1) as 1|2|3))

  const canProceed = useMemo(() => {
    if (wizStep === 1) {
      return String(wizName || '').trim().length > 0
    }
    if (wizStep === 2) {
      if (wizProvider === 'SFTP' || wizProvider === 'FTPS') {
        return Boolean((wizConfig?.host || '').toString().trim() && (wizConfig?.username || '').toString().trim())
      }
      // OAuth providers require both connected state and folder selection
      return Boolean(wizConfig?.oauth_connected && wizConfig?.folder_id)
    }
    return true
  }, [wizStep, wizName, wizProvider, wizConfig])

  const wizSave = async () => {
    if (!currentTenant) return toast.error(lt('No tenant selected'))
    if (!wizName) return toast.error(lt('Name is required'))
    setWizWorking(true)
    try {
      const payload: any = { tenant_id: currentTenant.id, name: wizName, provider: wizProvider, schedule_minutes: Number(wizSchedule), enabled: true, config: wizConfig }
      if (wizId) payload.id = wizId
      const res = await fetch('/api/external-sources/upsert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const parsed = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(parsed?.error || 'Save failed')
      toast.success(wizId ? lt('Updated source') : lt('Created source'))
      try { window.dispatchEvent(new CustomEvent('externalSourcesChanged')) } catch {}
      await fetchSources()
      setWizOpen(false)
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || lt('Failed to save'))
    } finally {
      setWizWorking(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{lt('External Sources')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="configuration">
            <TabsList>
              <TabsTrigger value="configuration">{lt('Configuration')}</TabsTrigger>
              <TabsTrigger value="scheduler">{lt('Scheduler')}</TabsTrigger>
              <TabsTrigger value="diagnostic">{lt('Test & Diagnostic')}</TabsTrigger>
            </TabsList>

            <TabsContent value="configuration">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{lt('Setup Wizard')}</CardTitle>
                    <CardDescription>{lt('Guided setup to add a new external source.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{lt('A small guided flow will help connect cloud drives and SFTP sources.')}</div>
                      <div className="flex gap-2">
                        <Button onClick={openWizardForNew}>{lt('Add Source')}</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{lt('Configured Sources')}</CardTitle>
                    <CardDescription>{lt('List of connected external sources for this tenant.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{loadingSources ? lt('Loading…') : lt('{count} source(s)', { count: sources.length })}</div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => fetchSources()}>{lt('Refresh')}</Button>
                      </div>
                    </div>
                    <div className="space-y-2 mt-3">
                      {sources.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{lt('No external sources configured.')}</div>
                      ) : (
                        <div className="space-y-2">
                          {sources.map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between rounded border p-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{s.name}</div>
                                <div className="text-xs text-muted-foreground">{s.provider} • {s.schedule_minutes}m</div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" onClick={() => openWizardForEdit(s)}>{lt('Edit')}</Button>
                                <Button variant="destructive" onClick={() => deleteSource(s.id)}>{lt('Delete')}</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="scheduler">
              <AutomatedSyncSettings />
            </TabsContent>

            <TabsContent value="diagnostic">
              <div className="py-2">
                <div className="mb-3 text-sm font-medium">{lt('Test & Debug External Source')}</div>
                <div className="flex flex-col gap-2 max-w-xl">
                  <Label>{lt('Select Source')}</Label>
                  <Select
                    value={String(wizId || '')}
                    onValueChange={v => {
                      setWizId(v);
                      const found = sources.find((s: any) => String(s.id) === v);
                      if (found) setWizConfig(found.config || {});
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={lt('Choose source...')} /></SelectTrigger>
                    <SelectContent>
                      {sources.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.provider})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 mt-2">
                    <Button
                      onClick={async () => {
                        if (!wizId) return toast.error(lt('Select a source'));
                        setWizTesting(true);
                        setWizTestResult(null);
                        try {
                          const res = await fetch('/api/external-sources/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: wizId }) });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok || json?.ok === false) {
                            setWizTestResult({ ok: false, error: json?.error || 'Test failed' });
                            toast.error(json?.error || 'Test failed');
                          } else {
                            setWizTestResult({ ok: true, list: json.list || [] });
                            toast.success(lt('Connection test succeeded'));
                          }
                        } catch (e: any) {
                          setWizTestResult({ ok: false, error: e?.message || 'Test failed' });
                          toast.error(e?.message || 'Test failed');
                        } finally {
                          setWizTesting(false);
                        }
                      }}
                      disabled={!wizId || wizTesting}
                    >{wizTesting ? lt('Testing…') : lt('Test Connection')}</Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!wizId) return toast.error(lt('Select a source'));
                        try {
                          const res = await fetch('/api/external-sources/trigger', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: wizId }) });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(json?.error || 'Failed to trigger');
                          toast.success(lt('Scheduled sync triggered'));
                        } catch (e: any) {
                          toast.error(e?.message || lt('Failed to trigger'));
                        }
                      }}
                      disabled={!wizId}
                    >{lt('Trigger Scheduled Sync')}</Button>
                  </div>
                  {wizTestResult && (
                    <div className="mt-3 p-3 border rounded bg-muted">
                      {wizTestResult.ok ? (
                        <div>
                          <div className="font-medium">{lt('Test succeeded')}</div>
                          <div className="text-sm text-muted-foreground">{lt('{count} file(s) found', { count: (wizTestResult.list || []).length })}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-destructive">{lt('Test failed')}</div>
                          <div className="text-sm text-muted-foreground">{wizTestResult.error}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Debug info: last run, last error, logs */}
                  {wizId && (() => {
                    const found = sources.find((s: any) => String(s.id) === String(wizId));
                    if (!found) return null;
                    return (
                      <div className="mt-4 p-3 border rounded bg-muted/50">
                        <div className="font-medium mb-1">{lt('Debug Info')}</div>
                        <div className="text-xs text-muted-foreground">{lt('Last Run')}: {found.last_run ? new Date(found.last_run).toLocaleString() : lt('Never')}</div>
                        <div className="text-xs text-muted-foreground">{lt('Last Error')}: {found.last_error || lt('None')}</div>
                        {found.logs && Array.isArray(found.logs) && found.logs.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-medium">{lt('Recent Logs')}:</div>
                            <div className="text-xs whitespace-pre-wrap max-h-40 overflow-auto bg-background border rounded p-2 mt-1">{found.logs.slice(-5).join('\n')}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        
        <Dialog open={wizOpen} onOpenChange={setWizOpen}>
          <DialogContent
            style={{
              maxHeight: '90vh',
              minWidth: 380,
              maxWidth: 1100,
              minHeight: 300,
              width: '60vw',
              overflowY: 'auto',
              resize: 'both',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <DialogHeader>
              <DialogTitle>{wizId ? lt('Edit External Source') : lt('Add External Source')}</DialogTitle>
              <DialogDescription>{lt('Use the wizard to add or edit an external source.')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              {wizStep === 1 && (
                <div>
                  <Label>{lt('Name')}</Label>
                  <Input value={wizName} onChange={(e) => setWizName(e.target.value)} />
                  {!wizName && <p className="text-xs text-destructive mt-1">{lt('Name is required')}</p>}
                  <div className="mt-2">
                    <Label>{lt('Provider')}</Label>
                    <Select value={wizProvider} onValueChange={(v) => setWizProvider(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SFTP">SFTP</SelectItem>
                        <SelectItem value="FTPS">FTPS</SelectItem>
                        <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                        <SelectItem value="ONEDRIVE">OneDrive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {wizStep === 2 && (
                <div>
                  {wizProvider === 'SFTP' ? (
                    <div className="space-y-2">
                      <Label>{lt('Host')}</Label>
                      <Input value={wizConfig.host || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, host: e.target.value }))} />
                      {!wizConfig?.host && <p className="text-xs text-destructive mt-1">{lt('Host is required')}</p>}
                      <Label>{lt('Port')}</Label>
                      <Input type="number" value={String(wizConfig.port || 22)} onChange={(e) => setWizConfig((p: any) => ({ ...p, port: Number(e.target.value || 0) }))} />
                      <Label>{lt('Username')}</Label>
                      <Input value={wizConfig.username || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, username: e.target.value }))} />
                      {!wizConfig?.username && <p className="text-xs text-destructive mt-1">{lt('Username is required')}</p>}
                      <Label>{lt('Password (optional)')}</Label>
                      <Input value={wizConfig.secret || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, secret: e.target.value }))} />
                      <Label>{lt('Client Private Key (PEM, optional)')}</Label>
                      <textarea className="w-full border rounded p-2 text-xs font-mono" rows={3} placeholder={lt('Paste private key (PEM)')}
                        value={wizConfig.client_key || ''}
                        onChange={e => setWizConfig((p: any) => ({ ...p, client_key: e.target.value }))}
                      />
                      <Label>{lt('Remote Server Public Key/Certificate (PEM, optional)')}</Label>
                      <textarea className="w-full border rounded p-2 text-xs font-mono" rows={3} placeholder={lt('Paste server public key/certificate (PEM)')}
                        value={wizConfig.server_cert || ''}
                        onChange={e => setWizConfig((p: any) => ({ ...p, server_cert: e.target.value }))}
                      />
                      <Label>{lt('Remote path')}</Label>
                      <Input value={wizConfig.remote_path || '/'} onChange={(e) => setWizConfig((p: any) => ({ ...p, remote_path: e.target.value }))} />
                    </div>
                  ) : wizProvider === 'FTPS' ? (
                    <div className="space-y-2">
                      <Label>{lt('Host')}</Label>
                      <Input value={wizConfig.host || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, host: e.target.value }))} />
                      {!wizConfig?.host && <p className="text-xs text-destructive mt-1">{lt('Host is required')}</p>}
                      <Label>{lt('Port')}</Label>
                      <Input type="number" value={String(wizConfig.port || 21)} onChange={(e) => setWizConfig((p: any) => ({ ...p, port: Number(e.target.value || 0) }))} />
                      <Label>{lt('Username')}</Label>
                      <Input value={wizConfig.username || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, username: e.target.value }))} />
                      {!wizConfig?.username && <p className="text-xs text-destructive mt-1">{lt('Username is required')}</p>}
                      <Label>{lt('Password')}</Label>
                      <Input value={wizConfig.secret || ''} onChange={(e) => setWizConfig((p: any) => ({ ...p, secret: e.target.value }))} />
                      <Label>{lt('Remote Server SSL Certificate (PEM, optional)')}</Label>
                      <textarea className="w-full border rounded p-2 text-xs font-mono" rows={3} placeholder={lt('Paste server SSL certificate (PEM)')}
                        value={wizConfig.server_cert || ''}
                        onChange={e => setWizConfig((p: any) => ({ ...p, server_cert: e.target.value }))}
                      />
                      <Label>{lt('Client Certificate (PEM, optional)')}</Label>
                      <textarea className="w-full border rounded p-2 text-xs font-mono" rows={3} placeholder={lt('Paste client certificate (PEM)')}
                        value={wizConfig.client_cert || ''}
                        onChange={e => setWizConfig((p: any) => ({ ...p, client_cert: e.target.value }))}
                      />
                      <Label>{lt('Client Private Key (PEM, optional)')}</Label>
                      <textarea className="w-full border rounded p-2 text-xs font-mono" rows={3} placeholder={lt('Paste client private key (PEM)')}
                        value={wizConfig.client_key || ''}
                        onChange={e => setWizConfig((p: any) => ({ ...p, client_key: e.target.value }))}
                      />
                      <div className="flex gap-2 mt-2">
                        <Button type="button" variant="outline" onClick={async () => {
                          toast.info(lt('Generating certificate...'));
                          try {
                            // Dynamically import forge for browser use
                            const forge = await import('node-forge');
                            const pki = forge.pki;
                            // Generate a keypair
                            const keys = pki.rsa.generateKeyPair(2048);
                            // Create a self-signed certificate
                            const cert = pki.createCertificate();
                            cert.publicKey = keys.publicKey;
                            cert.serialNumber = String(Math.floor(Math.random() * 1e16));
                            cert.validity.notBefore = new Date();
                            cert.validity.notAfter = new Date();
                            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
                            const attrs = [
                              { name: 'commonName', value: 'LedgerAI FTPS Client' },
                              { name: 'organizationName', value: 'LedgerAI' },
                            ];
                            cert.setSubject(attrs);
                            cert.setIssuer(attrs);
                            cert.sign(keys.privateKey, forge.md.sha256.create());
                            // Convert to PEM
                            const pemCert = pki.certificateToPem(cert);
                            const pemKey = pki.privateKeyToPem(keys.privateKey);
                            setWizConfig((p: any) => ({ ...p, client_cert: pemCert, client_key: pemKey }));
                            toast.success(lt('Generated client certificate & key'));
                          } catch (err) {
                            console.error(err);
                            toast.error(lt('Failed to generate certificate'));
                          }
                        }}>{lt('Generate Client Certificate')}</Button>
                        {wizConfig.client_cert && wizConfig.client_key && (
                          <Button type="button" variant="outline" onClick={() => {
                            // Download cert and key as files
                            const download = (filename: string, text: string) => {
                              const blob = new Blob([text], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = filename;
                              document.body.appendChild(a);
                              a.click();
                              setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                            };
                            download('client-cert.pem', wizConfig.client_cert);
                            download('client-key.pem', wizConfig.client_key);
                          }}>{lt('Download Cert & Key')}</Button>
                        )}
                      </div>
                      <Label>{lt('Remote path')}</Label>
                      <Input value={wizConfig.remote_path || '/'} onChange={(e) => setWizConfig((p: any) => ({ ...p, remote_path: e.target.value }))} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Show selected folder if any */}
                      {wizConfig.folder_id && (
                        <div className="mb-2 p-2 border rounded bg-muted text-sm flex items-center gap-2">
                          <Folder className="w-4 h-4 opacity-80" />
                          <span>{wizConfig.folder_id === 'root' ? lt('Root') : wizConfig.folder_id}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={async () => {
                          if (wizConfig?.oauth_connected && wizId) {
                            setShowFolderPicker(true)
                            return
                          }
                          // trigger OAuth flow automatically and open picker on success
                          const ok = await startOAuthConnect()
                          if (ok) {
                            // ensure latest sources fetched
                            try { await fetchSources() } catch {}
                            setShowFolderPicker(true)
                          }
                        }} disabled={wizConnectingOAuth}>{lt('Browse folders')}</Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <Label>{lt('Schedule (minutes)')}</Label>
                    <Input type="number" value={String(wizSchedule)} onChange={(e) => setWizSchedule(Number(e.target.value || 0))} />
                  </div>
                </div>
              )}


              {wizStep === 3 && (
                <div>
                  <p className="text-sm">{lt('Review settings before saving.')}</p>
                  <div className="mt-2 space-y-1">
                    <div><strong>{lt('Name')}:</strong> {wizName}</div>
                    <div><strong>{lt('Provider')}:</strong> {wizProvider}</div>
                    <div><strong>{lt('Schedule')}:</strong> {wizSchedule} {lt('minutes')}</div>
                  </div>
                  {wizTestResult && (
                    <div className="mt-3 p-3 border rounded">
                      {wizTestResult.ok ? (
                        <div>
                          <div className="font-medium">{lt('Test succeeded')}</div>
                          <div className="text-sm text-muted-foreground">{lt('{count} file(s) found', { count: (wizTestResult.list || []).length })}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-destructive">{lt('Test failed')}</div>
                          <div className="text-sm text-muted-foreground">{wizTestResult.error}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Always render FolderPicker modal if showFolderPicker is true and wizId is set */}
              {showFolderPicker && wizId && (
                <FolderPicker
                  sourceId={wizId}
                  onSelect={(fid) => {
                    setWizConfig((p: any) => {
                      // force new object to trigger re-render
                      return { ...p, folder_id: fid };
                    });
                    setTimeout(() => setShowFolderPicker(false), 0);
                    toast.success(lt('Folder selected'));
                  }}
                  onClose={() => setShowFolderPicker(false)}
                />
              )}

              <div className="flex justify-between mt-4">
                <div>
                  <Button variant="ghost" onClick={wizBack} disabled={wizStep === 1}>{lt('Back')}</Button>
                </div>
                <div className="flex gap-2">
                  {wizStep < 3 ? (
                    <Button onClick={wizNext} disabled={!canProceed}>{lt('Next')}</Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button onClick={testConnection} disabled={wizTesting}>{wizTesting ? lt('Testing…') : lt('Test Connection')}</Button>
                      <Button onClick={wizSave} disabled={wizWorking || (wizProvider !== 'SFTP' && !wizConfig?.oauth_connected)}>{wizWorking ? lt('Saving...') : lt('Save')}</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}

export default ExternalSourcesSettings
