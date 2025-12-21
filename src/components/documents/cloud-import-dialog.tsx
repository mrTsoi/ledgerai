'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useLiterals } from '@/hooks/use-literals'

type Provider = 'GOOGLE_DRIVE' | 'ONEDRIVE'

type SourceRow = {
  id: string
  tenant_id: string
  name: string
  provider: Provider
  enabled: boolean
  schedule_minutes: number
  last_run_at: string | null
  config: any
}

type CloudWhoAmI = {
  connected: boolean
  account?: { email?: string; displayName?: string } | null
  folder_id?: string | null
  folder_name?: string | null
}

type FolderItem = { id: string; name: string }

type Props = {
  tenantId: string
  documentType?: string | null
  bankAccountId?: string | null
  triggerLabel?: string
  onImported?: () => void
}

function providerToOauthStart(provider: Provider) {
  return provider === 'GOOGLE_DRIVE' ? '/api/external-sources/oauth/google/start' : '/api/external-sources/oauth/microsoft/start'
}

export function CloudImportDialog(props: Props) {
  const lt = useLiterals()
  const { tenantId, documentType = null, bankAccountId = null, triggerLabel, onImported } = props

  const [open, setOpen] = useState(false)

  const [loadingSources, setLoadingSources] = useState(false)
  const [sources, setSources] = useState<SourceRow[]>([])
  const [sourcesError, setSourcesError] = useState<string | null>(null)

  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const selectedSource = useMemo(
    () => (sources || []).find((s) => s.id === selectedSourceId) || null,
    [sources, selectedSourceId]
  )

  const [whoami, setWhoami] = useState<CloudWhoAmI | null>(null)
  const [loadingWhoami, setLoadingWhoami] = useState(false)

  const [parentId, setParentId] = useState<string>('root')
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [trail, setTrail] = useState<Array<{ id: string; name: string }>>([{ id: 'root', name: lt('Root') }])

  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState<string | null>(null)

  const [scheduleMinutes, setScheduleMinutes] = useState<number>(60)
  const [enabled, setEnabled] = useState<boolean>(true)

  const [createMode, setCreateMode] = useState(false)
  const [creatingSource, setCreatingSource] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProvider, setNewProvider] = useState<Provider>('GOOGLE_DRIVE')

  const loadSources = useCallback(async () => {
    if (!tenantId) return
    setLoadingSources(true)
    setSourcesError(null)
    try {
      const res = await fetch(`/api/external-sources?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSourcesError(String(json?.error || lt('Failed to load cloud sources')))
        setSources([])
        return
      }

      const rows = Array.isArray(json?.data) ? (json.data as any[]) : []
      const cloud = rows.filter((r) => r?.provider === 'GOOGLE_DRIVE' || r?.provider === 'ONEDRIVE')
      setSources(cloud)
    } catch (e: any) {
      setSourcesError(e?.message || lt('Failed to load cloud sources'))
      setSources([])
    } finally {
      setLoadingSources(false)
    }
  }, [tenantId, lt])

  const loadWhoami = useCallback(async (sourceId: string) => {
    setLoadingWhoami(true)
    try {
      const res = await fetch(`/api/external-sources/whoami?source_id=${encodeURIComponent(sourceId)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWhoami(null)
        return
      }
      setWhoami(json as CloudWhoAmI)
    } finally {
      setLoadingWhoami(false)
    }
  }, [])

  const loadFolders = useCallback(
    async (sourceId: string, pid: string) => {
      setLoadingFolders(true)
      try {
        const res = await fetch(
          `/api/external-sources/folders?source_id=${encodeURIComponent(sourceId)}&parent_id=${encodeURIComponent(pid)}`
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(json?.error || lt('Failed to load folders')))
        }
        const listed = Array.isArray(json?.folders) ? (json.folders as any[]) : []
        setFolders(listed.map((f) => ({ id: String(f.id), name: String(f.name) })))
      } catch (e: any) {
        toast.error(e?.message || lt('Failed to load folders'))
        setFolders([])
      } finally {
        setLoadingFolders(false)
      }
    },
    [lt]
  )

  useEffect(() => {
    if (!open) return
    void loadSources()
  }, [open, loadSources])

  useEffect(() => {
    if (!selectedSource) return
    setScheduleMinutes(Number(selectedSource.schedule_minutes || 60))
    setEnabled(!!selectedSource.enabled)

    const cfg = (selectedSource.config || {}) as any
    const cfgFolderId = typeof cfg.folder_id === 'string' ? cfg.folder_id : null
    const cfgFolderName = typeof cfg.folder_name === 'string' ? cfg.folder_name : null
    setFolderId(cfgFolderId)
    setFolderName(cfgFolderName)

    setParentId('root')
    setTrail([{ id: 'root', name: lt('Root') }])
    setFolders([])
    void loadWhoami(selectedSource.id)
  }, [selectedSource, loadWhoami, lt])

  useEffect(() => {
    if (!open) return
    if (!selectedSource) return
    if (!whoami?.connected) return
    void loadFolders(selectedSource.id, parentId)
  }, [open, selectedSource, whoami?.connected, parentId, loadFolders])

  const connect = async () => {
    if (!selectedSource) return
    const returnTo = window.location.pathname + window.location.search
    const url = `${providerToOauthStart(selectedSource.provider)}?source_id=${encodeURIComponent(selectedSource.id)}&return_to=${encodeURIComponent(returnTo)}`
    window.location.href = url
  }

  const canSelectCurrentFolder = useMemo(() => {
    if (!selectedSource) return false
    if (selectedSource.provider === 'GOOGLE_DRIVE') {
      // Google Drive import requires a real folder id; synthetic ids like "root" and "drive:<id>" won't work.
      if (parentId === 'root') return false
      if (parentId.startsWith('drive:')) return false
    }
    return true
  }, [selectedSource, parentId])

  const goRoot = () => {
    setParentId('root')
    setTrail([{ id: 'root', name: lt('Root') }])
  }

  const goInto = (f: FolderItem) => {
    setParentId(f.id)
    setTrail((prev) => [...prev, { id: f.id, name: f.name }])
  }

  const goBack = () => {
    setTrail((prev) => {
      if (prev.length <= 1) {
        setParentId('root')
        return [{ id: 'root', name: lt('Root') }]
      }
      const next = prev.slice(0, -1)
      setParentId(next[next.length - 1].id)
      return next
    })
  }

  const saveRecurring = async () => {
    if (!selectedSource) return
    try {
      const nextConfig = {
        ...(selectedSource.config || {}),
        folder_id: folderId || null,
        folder_name: folderName || null,
        document_type: documentType,
        bank_account_id: documentType === 'bank_statement' ? bankAccountId : null,
        file_glob: (selectedSource.config || {})?.file_glob || '**/*',
      }

      const res = await fetch('/api/external-sources/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedSource.id,
          tenant_id: tenantId,
          name: selectedSource.name,
          provider: selectedSource.provider,
          enabled,
          schedule_minutes: scheduleMinutes,
          config: nextConfig,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || lt('Failed to save recurring import')))

      toast.success(lt('Recurring import saved'))
      await loadSources()
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to save recurring import'))
    }
  }

  const runNow = async () => {
    if (!selectedSource) return
    try {
      const res = await fetch('/api/external-sources/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, source_id: selectedSource.id, limit: 10 }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || lt('Import failed')))

      toast.success(lt('Import started'))
      if (onImported) onImported()
    } catch (e: any) {
      toast.error(e?.message || lt('Import failed'))
    }
  }

  const createSource = async () => {
    if (!newName.trim()) {
      toast.error(lt('Name is required'))
      return
    }

    try {
      setCreatingSource(true)
      const res = await fetch('/api/external-sources/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: newName.trim(),
          provider: newProvider,
          enabled: true,
          schedule_minutes: scheduleMinutes,
          config: {
            file_glob: '**/*',
            document_type: documentType,
            bank_account_id: documentType === 'bank_statement' ? bankAccountId : null,
            folder_id: null,
            folder_name: null,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || lt('Failed to create source')))

      const id = String(json?.id || json?.data?.id || '')
      toast.success(lt('Source created'))
      await loadSources()
      if (id) setSelectedSourceId(id)
      setNewName('')
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to create source'))
    } finally {
      setCreatingSource(false)
    }
  }

  const showFolderPicker = !!selectedSource && !!whoami?.connected

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">{triggerLabel || lt('Cloud Storage')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lt('Import from Cloud Storage')}</DialogTitle>
          <DialogDescription>{lt('Select a connected drive folder and optionally enable recurring imports.')}</DialogDescription>
        </DialogHeader>

        {sourcesError ? <div className="text-sm text-destructive">{sourcesError}</div> : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{lt('Cloud source')}</Label>
            <Select value={selectedSourceId} onValueChange={setSelectedSourceId} disabled={loadingSources}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSources ? lt('Loading…') : lt('Select a source')} />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.provider === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{lt('Create a new cloud source')}</Label>
              <Switch checked={createMode} onCheckedChange={setCreateMode} />
            </div>
            {createMode ? (
              <div className="grid gap-3 rounded-md border p-3">
                <div className="grid gap-2">
                  <Label>{lt('Name')}</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={lt('e.g. Google Drive Imports')} />
                </div>
                <div className="grid gap-2">
                  <Label>{lt('Provider')}</Label>
                  <Select value={newProvider} onValueChange={(v) => setNewProvider(v as Provider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                      <SelectItem value="ONEDRIVE">OneDrive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={createSource} disabled={creatingSource}>
                  {creatingSource ? lt('Creating…') : lt('Create')}
                </Button>
              </div>
            ) : null}
          </div>

          {selectedSource ? (
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm">
                <span className="font-medium">{lt('Status:')}</span>{' '}
                {loadingWhoami ? lt('Loading…') : whoami?.connected ? lt('Connected') : lt('Not connected')}
                {whoami?.account?.email || whoami?.account?.displayName ? (
                  <span className="text-muted-foreground">
                    {' '}
                    • {lt('Connected as')} {whoami.account.email || whoami.account.displayName}
                  </span>
                ) : null}
              </div>
              {!whoami?.connected ? (
                <Button onClick={connect}>{lt('Connect')}</Button>
              ) : null}
            </div>
          ) : null}

          {showFolderPicker ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{lt('Folder')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFolderId(parentId)
                    setFolderName(parentId === 'root' ? lt('Root') : null)
                  }}
                  disabled={!canSelectCurrentFolder}
                >
                  {lt('Select current folder')}
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>{lt('Current folder id:')} {parentId}</div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={goBack}>
                    {lt('Back')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={goRoot}>
                    {lt('Root')}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {trail.map((t, idx) => (
                  <span key={t.id}>
                    {idx === 0 ? '' : ' / '}
                    {t.name}
                  </span>
                ))}
              </div>

              {loadingFolders ? (
                <div className="text-sm text-muted-foreground">{lt('Loading folders…')}</div>
              ) : folders.length === 0 ? (
                <div className="text-sm text-muted-foreground">{lt('No folders found.')}</div>
              ) : (
                <div className="max-h-56 overflow-auto rounded-md border">
                  {folders.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 p-2 border-b last:border-b-0">
                      <button type="button" className="text-left text-sm flex-1" onClick={() => goInto(f)}>
                        {f.name}
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFolderId(f.id)
                          setFolderName(f.name)
                        }}
                      >
                        {lt('Select')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {folderId ? (
                <div className="text-sm">
                  <span className="font-medium">{lt('Selected:')}</span> {folderName || folderId}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">{lt('No folder selected yet.')}</div>
              )}
            </div>
          ) : null}

          {selectedSource ? (
            <div className="grid gap-3 rounded-md border p-3">
              <div className="grid gap-2">
                <Label>{lt('Schedule (minutes)')}</Label>
                <Input
                  inputMode="numeric"
                  value={String(scheduleMinutes)}
                  onChange={(e) => setScheduleMinutes(Math.max(5, Number(e.target.value || 60)))}
                />
                <div className="text-xs text-muted-foreground">{lt('Used for recurring imports (minimum 5 minutes).')}</div>
              </div>

              <div className="flex items-center justify-between">
                <Label>{lt('Enabled')}</Label>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={runNow} disabled={!whoami?.connected || !folderId}>
                  {lt('Import now')}
                </Button>
                <Button type="button" onClick={saveRecurring} disabled={!folderId}>
                  {lt('Save recurring import')}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                {lt('Tip: recurring imports are executed by the external-sources runner schedule.')}
              </div>
            </div>
          ) : null}

          {!selectedSource && !loadingSources ? (
            <div className="text-sm text-muted-foreground">
              {lt('No cloud sources yet. Create one here or configure them in Settings → External Sources.')}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
