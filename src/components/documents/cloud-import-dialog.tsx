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
import { Link } from '@/i18n/navigation'

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
type FileItem = { id: string; name: string; size?: string | number }

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
  const [files, setFiles] = useState<FileItem[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<Record<string, boolean>>({})
  const [fileSearch, setFileSearch] = useState<string>('')
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({})
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({})
  const progressTimers = useMemo(() => ({} as Record<string, number>), [])
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
        const listedFiles = Array.isArray(json?.files) ? (json.files as any[]) : []
        setFiles(listedFiles.map((f) => ({ id: String(f.id), name: String(f.name), size: f.size })))
      } catch (e: any) {
        toast.error(e?.message || lt('Failed to load folders'))
        setFolders([])
        setFiles([])
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

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const formatBytes = (b: any) => {
    const n = Number(b || 0)
    if (!Number.isFinite(n) || n <= 0) return ''
    if (n < 1024) return `${n} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let i = -1
    let x = n
    do { x = x / 1024; i++ } while (x >= 1024 && i < units.length - 1)
    return `${x.toFixed(1)} ${units[i]}`
  }

  const startSimulatedProgress = (id: string) => {
    // avoid multiple timers
    if (progressTimers[id]) return
    setFileProgress((p) => ({ ...p, [id]: 0 }))
    let val = 0
    const tid = window.setInterval(() => {
      val = Math.min(80, val + Math.floor(5 + Math.random() * 10))
      setFileProgress((p) => ({ ...p, [id]: val }))
      if (val >= 80) {
        // stop increasing; finalization will set 100
        clearInterval(progressTimers[id])
        delete progressTimers[id]
      }
    }, 500) as unknown as number
    progressTimers[id] = tid
  }

  const stopSimulatedProgress = (id: string) => {
    const tid = progressTimers[id]
    if (tid) {
      clearInterval(tid)
      delete progressTimers[id]
    }
  }

  const fetchPreview = async (f: FileItem) => {
    if (!selectedSource) return
    try {
      // Request server to stream bytes from our origin to avoid signed-url CORS/content-disposition issues
      const res = await fetch(`/api/external-sources/preview?source_id=${encodeURIComponent(selectedSource.id)}&file_id=${encodeURIComponent(f.id)}&stream=1`)
      if (!res.ok) throw new Error('Preview failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      // revoke previous
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(url)
    } catch (e: any) {
      toast.error(e?.message || lt('Failed to fetch preview'))
    }
  }

  const importSelectedFiles = async () => {
    if (!selectedSource) return
    const selected = files.filter((f) => selectedFileIds[f.id])
    if (selected.length === 0) {
      toast.error(lt('Select at least one file to import'))
      return
    }

    // Import sequentially and show per-file progress
    for (const f of selected) {
      setFileStatuses((s) => ({ ...s, [f.id]: 'importing' }))
      // start simulated progress
      startSimulatedProgress(f.id)
      try {
        const res = await fetch('/api/external-sources/import-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, source_id: selectedSource.id, files: [f] }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || lt('Import failed')))
        stopSimulatedProgress(f.id)
        setFileProgress((p) => ({ ...p, [f.id]: 100 }))
        setFileStatuses((s) => ({ ...s, [f.id]: 'done' }))
      } catch (e: any) {
        stopSimulatedProgress(f.id)
        setFileStatuses((s) => ({ ...s, [f.id]: 'error' }))
        setFileProgress((p) => ({ ...p, [f.id]: 0 }))
        toast.error(`${f.name}: ${e?.message || lt('Import failed')}`)
      }
    }

    toast.success(lt('Import finished'))
    setSelectedFileIds({})
    if (onImported) onImported()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">{triggerLabel || lt('Cloud Storage')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] p-0">
        <div className="h-full max-h-[80vh] overflow-auto resize bg-background p-4">
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

          {/* Files list + search / select-all / preview / per-file progress */}
          {showFolderPicker ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{lt('Files')}</Label>
              </div>

              <div className="flex items-center gap-2">
                <Input placeholder={lt('Filter files by name')} value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      files.length > 0 &&
                      files.filter((fi) => (fi.name || '').toLowerCase().includes(fileSearch.toLowerCase())).every((fi) => selectedFileIds[fi.id])
                    }
                    onChange={(e) => {
                      const visible = files.filter((fi) => (fi.name || '').toLowerCase().includes(fileSearch.toLowerCase()))
                      if (e.target.checked) {
                        const next = { ...selectedFileIds }
                        visible.forEach((v) => { next[v.id] = true })
                        setSelectedFileIds(next)
                      } else {
                        const next = { ...selectedFileIds }
                        visible.forEach((v) => { delete next[v.id] })
                        setSelectedFileIds(next)
                      }
                    }}
                  />
                  <span>{lt('Select all')}</span>
                </label>
              </div>

              <div className="max-h-56 overflow-auto rounded-md border">
                {files.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">{lt('No files')}</div>
                ) : (
                  files
                    .filter((fi) => (fi.name || '').toLowerCase().includes(fileSearch.toLowerCase()))
                    .map((fi) => (
                      <div key={fi.id} className="flex items-center justify-between gap-2 p-2 border-b last:border-b-0">
                        <div className="flex items-center gap-2 flex-1">
                          <label className="flex items-center gap-2 text-sm flex-1 cursor-pointer">
                            <input type="checkbox" checked={!!selectedFileIds[fi.id]} onChange={() => toggleFile(fi.id)} />
                            <div className="flex flex-col w-full">
                              <span className="truncate font-medium">{fi.name}</span>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{formatBytes(fi.size)}</span>
                                {fileStatuses[fi.id] === 'importing' || fileProgress[fi.id] ? (
                                  <span className="text-xs text-muted-foreground">{`${Math.round(fileProgress[fi.id] ?? 0)}%`}</span>
                                ) : null}
                              </div>
                              {(fileStatuses[fi.id] === 'importing' || fileProgress[fi.id]) ? (
                                <div className="w-full h-2 bg-muted rounded mt-1">
                                  <div className="h-2 bg-primary rounded" style={{ width: `${fileProgress[fi.id] ?? 0}%` }} />
                                </div>
                              ) : null}
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          {fileStatuses[fi.id] === 'importing' ? (
                            <div className="text-xs text-primary">{lt('Importing…')}</div>
                          ) : fileStatuses[fi.id] === 'done' ? (
                            <div className="text-xs text-success">{lt('Imported')}</div>
                          ) : fileStatuses[fi.id] === 'error' ? (
                            <div className="text-xs text-destructive">{lt('Error')}</div>
                          ) : null}

                          <Button size="sm" variant="ghost" onClick={() => { setPreviewFile(fi); void fetchPreview(fi) }}>{lt('Preview')}</Button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" onClick={importSelectedFiles} disabled={!whoami?.connected || Object.keys(selectedFileIds).length === 0}>
                  {lt('Import selected files')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSelectedFileIds({})}>
                  {lt('Clear selection')}
                </Button>
              </div>

              {previewFile ? (
                <div className="mt-2 border rounded p-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{previewFile.name}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(previewFile.size)}</div>
                    </div>
                    <div>
                      <Button size="sm" variant="ghost" onClick={() => { setPreviewFile(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) } }}>{lt('Close')}</Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    {previewUrl ? (
                      // show image inline or embed pdf/object
                      previewUrl.endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.pdf') ? (
                        <object data={previewUrl} type="application/pdf" width="100%" height="400">{lt('Preview not available')}</object>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt={previewFile.name} className="max-h-80 w-auto" />
                      )
                    ) : (
                      <div className="text-sm text-muted-foreground">{lt('Loading preview…')}</div>
                    )}
                  </div>
                </div>
              ) : null}
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
              {lt('No cloud sources yet. ')}
              <button
                type="button"
                className="text-primary underline mr-1"
                onClick={() => setCreateMode(true)}
              >
                Create one here
              </button>
              {lt('or configure them in')} 
              <Link href="/tenant-admin?tab=external-sources" className="text-primary underline ml-1">
                {lt('Settings → External Sources')}
              </Link>
              .
            </div>
          ) : null}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
