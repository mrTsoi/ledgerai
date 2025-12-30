"use client";

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, useUserRole } from '@/hooks/use-tenant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useLiterals } from '@/hooks/use-literals'

type Provider = 'SFTP' | 'FTPS' | 'GOOGLE_DRIVE' | 'ONEDRIVE'

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

type FolderItem = {
  id: string
  name: string
}

type FileItem = {
  id: string
  name: string
  size?: number
  modifiedTime?: string
  mimeType?: string
}

export function ExternalSourcesSettings() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const role = useUserRole()
  const canManage = role === 'COMPANY_ADMIN' || role === 'SUPER_ADMIN'
  const supabase = useMemo(() => createClient(), [])

  const tenantId = currentTenant?.id

  const [sources, setSources] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)

  const [statusById, setStatusById] = useState<Record<string, boolean>>({})
  const [cloudInfoById, setCloudInfoById] = useState<
    Record<
      string,
      {
        account?: { email: string | null; displayName: string | null } | null
        folder_id?: string | null
        folder_name?: string | null
      }
    >
  >({})
  const [tokenErrorById, setTokenErrorById] = useState<Record<string, string>>({})

  const [cronConfigured, setCronConfigured] = useState<boolean>(false)
  const [cronEnabled, setCronEnabled] = useState<boolean>(true)
  const [cronDefaultLimit, setCronDefaultLimit] = useState<string>('10')
  const [cronKeyPrefix, setCronKeyPrefix] = useState<string | null>(null)
  const [generatedCronSecret, setGeneratedCronSecret] = useState<string | null>(null)

  const [pickerSourceId, setPickerSourceId] = useState<string | null>(null)
  const [pickerParentId, setPickerParentId] = useState<string>('root')
  const [pickerStack, setPickerStack] = useState<string[]>([])
  const [pickerFolders, setPickerFolders] = useState<FolderItem[]>([])
  const [pickerFiles, setPickerFiles] = useState<FileItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  // Wizard state (persisted so OAuth redirect can resume)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [wizardSourceId, setWizardSourceId] = useState<string | null>(null)

  // Minimal "create" form
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<Provider>('SFTP')
  const [enabled, setEnabled] = useState(true)
  const [scheduleMinutes, setScheduleMinutes] = useState('60')

  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [remotePath, setRemotePath] = useState('/')
  const [fileGlob, setFileGlob] = useState('**/*')

  const [folderId, setFolderId] = useState('')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')

  const [clientCertPem, setClientCertPem] = useState('')
  const [clientKeyPem, setClientKeyPem] = useState('')
  const [caCertPem, setCaCertPem] = useState('')

  const [documentType, setDocumentType] = useState<'invoice' | 'receipt' | 'bank_statement' | 'other' | 'none'>('none')
  const [bankAccountId, setBankAccountId] = useState<string>('')
  const [bankAccounts, setBankAccounts] = useState<any[]>([])

  const persistWizard = useCallback((next: { open?: boolean; step?: number; sourceId?: string | null }) => {
    if (typeof window === 'undefined') return
    const payload = {
      open: typeof next.open === 'boolean' ? next.open : wizardOpen,
      step: typeof next.step === 'number' ? next.step : wizardStep,
      sourceId: typeof next.sourceId !== 'undefined' ? next.sourceId : wizardSourceId,
    }
    window.localStorage.setItem('externalSourcesWizard', JSON.stringify(payload))
  }, [wizardOpen, wizardStep, wizardSourceId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('externalSourcesWizard')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.open) setWizardOpen(true)
      if (parsed?.step) setWizardStep(parsed.step)
      if (parsed?.sourceId) setWizardSourceId(parsed.sourceId)
    } catch {
      // ignore
    }
  }, [])

  const resetWizard = useCallback(() => {
    setWizardOpen(false)
    setWizardStep(1)
    setWizardSourceId(null)
    if (typeof window !== 'undefined') window.localStorage.removeItem('externalSourcesWizard')
  }, [])

  const wizardSource = wizardSourceId ? sources.find((s) => s.id === wizardSourceId) || null : null

  const startWizard = () => {
    setWizardOpen(true)
    setWizardStep(1)
    setWizardSourceId(null)
    persistWizard({ open: true, step: 1, sourceId: null })
  }

  const fetchSources = useCallback(async () => {
    if (!tenantId || !canManage) return

    try {
      setLoading(true)
      const res = await fetch(`/api/external-sources?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to load sources'))
      setSources(json.data || [])
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to load external sources: {message}', { message: e.message }) : lt('Failed to load external sources'))
    } finally {
      setLoading(false)
    }
  }, [tenantId, canManage, lt])

  const fetchCronConfig = useCallback(async () => {
    if (!tenantId || !canManage) return

    try {
      const res = await fetch(`/api/external-sources/cron?tenant_id=${encodeURIComponent(tenantId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to load cron config'))

      if (!json.configured) {
        setCronConfigured(false)
        setCronEnabled(true)
        setCronDefaultLimit('10')
        setCronKeyPrefix(null)
        return
      }

      setCronConfigured(true)
      setCronEnabled(!!json.enabled)
      setCronDefaultLimit(String(json.default_run_limit ?? 10))
      setCronKeyPrefix(json.key_prefix || null)
    } catch {
      // ignore
    }
  }, [tenantId, canManage, lt])

  const fetchBankAccounts = useCallback(async () => {
    if (!tenantId || !canManage) return

    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)

      if (error) return
      setBankAccounts(data || [])
    } catch {
      // ignore
    }
  }, [supabase, tenantId, canManage])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  useEffect(() => {
    fetchCronConfig()
  }, [fetchCronConfig])

  const fetchStatuses = useCallback(async () => {
    if (!canManage) return
    if (!sources.length) {
      setStatusById({})
      return
    }

    try {
      const entries = await Promise.all(
        sources.map(async (s) => {
          if (s.provider !== 'GOOGLE_DRIVE' && s.provider !== 'ONEDRIVE') return [s.id, true] as const
          const res = await fetch(`/api/external-sources/status?source_id=${encodeURIComponent(s.id)}`)
          const json = await res.json()
          if (!res.ok) return [s.id, false] as const
          return [s.id, !!json.connected] as const
        })
      )

      setStatusById(Object.fromEntries(entries))
    } catch {
      // ignore
    }
  }, [sources, canManage])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  // Helper to trigger reconnect (moved to component scope)
  const handleReconnect = async (source: SourceRow) => {
    await disconnectSource(source.id)
    await connectSource(source)
    await fetchCloudWhoAmI()
  }

  const fetchCloudWhoAmI = useCallback(async () => {
    if (!canManage) return
    const cloud = sources.filter((s) => s.provider === 'GOOGLE_DRIVE' || s.provider === 'ONEDRIVE')
    if (!cloud.length) {
      setCloudInfoById({})
      return
    }

    try {
      const entries: [string, any][] = []
      const tokenErrors: Record<string, string> = {}
      for (const s of cloud) {
        try {
          const res = await fetch(`/api/external-sources/whoami?source_id=${encodeURIComponent(s.id)}`)
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            // Detect token error
            if (json?.error && /token has been expired|token has been revoked|refresh token/i.test(json.error)) {
              tokenErrors[s.id] = lt('Token expired or revoked. Please reconnect.')
            }
            entries.push([s.id, null])
            continue
          }
          entries.push([
            s.id,
            {
              account: json.account || null,
              folder_id: json.folder_id ?? null,
              folder_name: json.folder_name ?? null,
            },
          ])
        } catch (err: any) {
          entries.push([s.id, null])
        }
      }
      setTokenErrorById(tokenErrors)
      setCloudInfoById(Object.fromEntries(entries.filter((e) => e[1] !== null)) as typeof cloudInfoById)
    } catch {
      // ignore
    }
  }, [sources, canManage, lt])

  useEffect(() => {
    fetchCloudWhoAmI()
  }, [fetchCloudWhoAmI])

  useEffect(() => {
    fetchBankAccounts()
  }, [fetchBankAccounts])

  const rotateCronSecret = async () => {
    if (!tenantId) return
    try {
      setWorking(true)
      setGeneratedCronSecret(null)

      const res = await fetch('/api/external-sources/cron/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to rotate cron secret'))

      setGeneratedCronSecret(json.cron_secret)
      setCronKeyPrefix(json.key_prefix || null)
      setCronConfigured(true)
      toast.success(lt('Cron secret rotated'))
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to rotate cron secret: {message}', { message: e.message }) : lt('Failed to rotate cron secret'))
    } finally {
      setWorking(false)
    }
  }

  const saveCronConfig = async () => {
    if (!tenantId) return
    try {
      setWorking(true)
      const res = await fetch('/api/external-sources/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          enabled: cronEnabled,
          default_run_limit: Number(cronDefaultLimit || 10),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to save cron config'))
      toast.success(lt('Cron configuration saved'))
      await fetchCronConfig()
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to save cron config: {message}', { message: e.message }) : lt('Failed to save cron config'))
    } finally {
      setWorking(false)
    }
  }

  const copyCronSecret = async () => {
    if (!generatedCronSecret) return
    try {
      await navigator.clipboard.writeText(generatedCronSecret)
      toast.success(lt('Copied cron secret'))
    } catch {
      toast.error(lt('Failed to copy'))
    }
  }

  const isCloud = (s: SourceRow) => s.provider === 'GOOGLE_DRIVE' || s.provider === 'ONEDRIVE'

  const cloudConnected = (s: SourceRow) => {
    if (!isCloud(s)) return true
    return !!statusById[s.id]
  }

  const cloudHasFolder = (s: SourceRow) => {
    if (!isCloud(s)) return true
    const folder = s.config?.folder_id
    return typeof folder === 'string' && folder.trim().length > 0
  }

  const canRunSource = (s: SourceRow) => {
    if (!isCloud(s)) return true
    return cloudConnected(s) && cloudHasFolder(s)
  }

  const loadFolders = useCallback(
    async (sourceId: string, parentId: string) => {
      try {
        setPickerLoading(true)
        const res = await fetch(
          `/api/external-sources/folders?source_id=${encodeURIComponent(sourceId)}&parent_id=${encodeURIComponent(parentId)}`
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('Failed to load folders'))
        setPickerFolders((json.folders || []) as FolderItem[])
        setPickerFiles((json.files || []) as FileItem[])
      } catch (e: any) {
        toast.error(e?.message ? lt('Failed to load folders: {message}', { message: e.message }) : lt('Failed to load folders'))
        setPickerFolders([])
        setPickerFiles([])
      } finally {
        setPickerLoading(false)
      }
    },
    [lt]
  )

  const openFolderPicker = async (s: SourceRow) => {
    setPickerSourceId(s.id)
    setPickerParentId('root')
    setPickerStack([])
    setPickerFolders([])
    setPickerFiles([])
    await loadFolders(s.id, 'root')
  }

  const closeFolderPicker = () => {
    setPickerSourceId(null)
    setPickerParentId('root')
    setPickerStack([])
    setPickerFolders([])
    setPickerFiles([])
  }

  const navigateIntoFolder = async (folderId: string) => {
    if (!pickerSourceId) return
    setPickerStack((prev) => [...prev, pickerParentId])
    setPickerParentId(folderId)
    await loadFolders(pickerSourceId, folderId)
  }

  const navigateBackFolder = async () => {
    if (!pickerSourceId) return
    setPickerStack((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const parent = next.pop()!
      setPickerParentId(parent)
      void loadFolders(pickerSourceId, parent)
      return next
    })
  }

  const updateCloudFolder = async (s: SourceRow, newFolderId: string) => {
    try {
      setWorking(true)

      const nextConfig = {
        ...(s.config || {}),
        folder_id: newFolderId,
      }

      const res = await fetch('/api/external-sources/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.id,
          tenant_id: s.tenant_id,
          name: s.name,
          provider: s.provider,
          enabled: s.enabled,
          schedule_minutes: s.schedule_minutes,
          config: nextConfig,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to save folder'))

      toast.success(lt('Folder selected'))

      setSources((prev) =>
        prev.map((row) => (row.id === s.id ? { ...row, config: nextConfig } : row))
      )
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to save folder: {message}', { message: e.message }) : lt('Failed to save folder'))
    } finally {
      setWorking(false)
      closeFolderPicker()
    }
  }

  const upsertSource = async (override?: { id?: string; enabled?: boolean }) => {
    if (!tenantId) return
    if (!name.trim()) {
      toast.error(lt('Name is required'))
      return
    }

    try {
      setWorking(true)

      const config: any = {
        file_glob: fileGlob.trim() || '**/*',
        document_type: documentType === 'none' ? null : documentType,
        bank_account_id: documentType === 'bank_statement' ? bankAccountId || null : null,
      }

      let secrets: any | undefined

      if (provider === 'SFTP' || provider === 'FTPS') {
        config.host = host.trim() || undefined
        config.port = port.trim() ? Number(port.trim()) : undefined
        config.remote_path = remotePath.trim() || '/'

        secrets = {
          username: username.trim() || undefined,
          password: password || undefined,
        }

        if (provider === 'SFTP') {
          if (privateKeyPem.trim()) secrets.private_key_pem = privateKeyPem
        }

        if (provider === 'FTPS') {
          if (clientCertPem.trim()) secrets.client_cert_pem = clientCertPem
          if (clientKeyPem.trim()) secrets.client_key_pem = clientKeyPem
          if (caCertPem.trim()) secrets.ca_cert_pem = caCertPem
        }
      } else {
        config.folder_id = folderId.trim() || undefined
      }

      const payload: any = {
        id: override?.id,
        tenant_id: tenantId,
        name: name.trim(),
        provider,
        enabled: typeof override?.enabled === 'boolean' ? override.enabled : enabled,
        schedule_minutes: Number(scheduleMinutes || 60),
        config,
      }

      if (typeof secrets !== 'undefined') payload.secrets = secrets

      const res = await fetch('/api/external-sources/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to save'))

      toast.success(lt('Saved external source'))
      setName('')
      setHost('')
      setPort('')
      setRemotePath('/')
      setFileGlob('**/*')
      setFolderId('')
      setUsername('')
      setPassword('')
      setPrivateKeyPem('')
      setClientCertPem('')
      setClientKeyPem('')
      setCaCertPem('')
      setDocumentType('none')
      setBankAccountId('')
      await fetchSources()
      return json?.id as string | undefined
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to save: {message}', { message: e.message }) : lt('Failed to save'))
      return undefined
    } finally {
      setWorking(false)
    }
  }

  const connectSource = async (s: SourceRow) => {
    const returnTo = window.location.pathname + window.location.search
    const startPath =
      s.provider === 'GOOGLE_DRIVE'
        ? `/api/external-sources/oauth/google/start?mode=json&source_id=${encodeURIComponent(s.id)}&return_to=${encodeURIComponent(returnTo)}`
        : `/api/external-sources/oauth/microsoft/start?mode=json&source_id=${encodeURIComponent(s.id)}&return_to=${encodeURIComponent(returnTo)}`

    try {
      setWorking(true)
      persistWizard({ open: true, step: wizardStep, sourceId: s.id })
      const res = await fetch(startPath)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || lt('Failed to start OAuth'))
      if (!json?.auth_url) throw new Error(lt('OAuth URL not returned'))
      window.location.href = String(json.auth_url)
    } catch (e: any) {
      toast.error(e?.message ? lt('Failed to start OAuth: {message}', { message: e.message }) : lt('Failed to start OAuth'))
    } finally {
      setWorking(false)
    }
  }

  const ensureWizardSource = async () => {
    if (!tenantId) return null
    const createdId = await upsertSource({ enabled: false })
    if (createdId) {
      setWizardSourceId(createdId)
      persistWizard({ open: true, step: 2, sourceId: createdId })
      await fetchSources()
      return createdId
    }
    return null
  }

  const saveWizardSource = async (opts?: { enabled?: boolean }) => {
    if (!tenantId) return null
    const id = wizardSourceId
    if (!id) return null
    const savedId = await upsertSource({ id, enabled: opts?.enabled })
    if (savedId) {
      await fetchSources()
      await fetchStatuses()
      await fetchCloudWhoAmI()
    }
    return savedId || null
  }

  const wizardNext = async () => {
    if (!wizardOpen) return

    if (wizardStep === 1) {
      const createdId = await ensureWizardSource()
      if (!createdId) return
      setWizardStep(2)
      persistWizard({ open: true, step: 2, sourceId: createdId })
      return
    }

    if (wizardStep === 2) {
      // For SFTP/FTPS we require a successful test before moving on.
      if (provider === 'SFTP' || provider === 'FTPS') {
        const savedId = await saveWizardSource({ enabled: false })
        if (!savedId) return
        await testSource(savedId)
      } else {
        // Cloud: user must connect in this step.
        if (!wizardSourceId) return
        const connected = statusById[wizardSourceId]
        if (!connected) {
          toast.error(lt('Please connect the account first'))
          return
        }
      }

      setWizardStep(3)
      persistWizard({ open: true, step: 3 })
      return
    }

    if (wizardStep === 3) {
      // Save folder/glob/doc mapping
      const savedId = await saveWizardSource({ enabled: false })
      if (!savedId) return

      // Cloud providers need a folder selected
      if ((provider === 'GOOGLE_DRIVE' || provider === 'ONEDRIVE') && !(folderId || wizardSource?.config?.folder_id)) {
        toast.error(lt('Please select a folder'))
        return
      }

      setWizardStep(4)
      persistWizard({ open: true, step: 4 })
      return
    }
  }

  const wizardBack = () => {
    const prev = wizardStep === 1 ? 1 : wizardStep - 1
    setWizardStep(prev as 1 | 2 | 3 | 4)
    persistWizard({ open: true, step: prev as 1 | 2 | 3 | 4 })
  }

  const wizardFinish = async () => {
    if (!wizardSourceId) return
    const savedId = await saveWizardSource({ enabled: true })
    if (!savedId) return
    toast.success(lt('External source is ready'))
    resetWizard()
    await fetchSources()
  }

  const disconnectSource = async (sourceId: string) => {
    try {
      setWorking(true)
      const res = await fetch('/api/external-sources/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      })
      const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('Disconnect failed'))
        toast.success(lt('Disconnected'))
      await fetchStatuses()
    } catch (e: any) {
        toast.error(e?.message ? lt('Disconnect failed: {message}', { message: e.message }) : lt('Disconnect failed'))
    } finally {
      setWorking(false)
    }
  }

  const deleteSource = async (sourceId: string) => {
    if (!confirm(lt('Delete this external source? This will remove its configuration and any import history.'))) return

    try {
      setWorking(true)
      const res = await fetch('/api/external-sources/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || lt('Delete failed'))

      if (pickerSourceId === sourceId) {
        closeFolderPicker()
      }

      toast.success(lt('Deleted external source'))
      await fetchSources()
      await fetchStatuses()
      await fetchCloudWhoAmI()
    } catch (e: any) {
      toast.error(e?.message ? lt('Delete failed: {message}', { message: e.message }) : lt('Delete failed'))
    } finally {
      setWorking(false)
    }
  }

  const testSource = async (sourceId: string) => {
    try {
      setWorking(true)
      const res = await fetch('/api/external-sources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId }),
      })
      const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('Test failed'))
        toast.success(lt('Connected. Found {count} file(s).', { count: json.list?.length ?? 0 }))
    } catch (e: any) {
        toast.error(e?.message ? lt('Test failed: {message}', { message: e.message }) : lt('Test failed'))
    } finally {
      setWorking(false)
    }
  }

  const runSource = async (sourceId: string) => {
    if (!tenantId) return

    try {
      setWorking(true)
      const res = await fetch('/api/external-sources/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, source_id: sourceId, limit: 10 }),
      })
      const json = await res.json()
        if (!res.ok) throw new Error(json?.error || lt('Run failed'))
        toast.success(lt('Run complete. Imported {count} file(s).', { count: json.inserted ?? 0 }))
      await fetchSources()
    } catch (e: any) {
        toast.error(e?.message ? lt('Run failed: {message}', { message: e.message }) : lt('Run failed'))
    } finally {
      setWorking(false)
    }
  }

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{lt('External Sources')}</CardTitle>
          <CardDescription>{lt('Select a tenant first.')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{lt('External Sources')}</CardTitle>
          <CardDescription>
            {lt('Schedule automatic document ingestion from SFTP/FTPS and cloud drives.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
            <b>{lt('Important for Google Drive & OneDrive:')}</b> {lt('Scheduled jobs for Google Drive and Microsoft OneDrive require a valid OAuth connection. If the connection is revoked, expires, or the user changes their password, scheduled imports will stop until you reconnect. Refresh tokens for Google Drive usually last indefinitely unless revoked, while OneDrive tokens may expire after 90 days of inactivity. SFTP/FTPS scheduled jobs are not affected by these limitations.')}
          </div>
          {!canManage ? (
            <div className="text-sm text-muted-foreground">{lt('Only Company Admins can manage external sources.')}</div>
          ) : (
            <>
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{lt('Setup Wizard')}</div>
                    <div className="text-muted-foreground">
                      {lt('A guided setup flow to help you connect the correct account and verify what will be imported.')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!wizardOpen ? (
                      <Button onClick={startWizard} disabled={working || loading}>
                        {lt('Start Wizard')}
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={resetWizard} disabled={working}>
                        {lt('Cancel')}
                      </Button>
                    )}
                  </div>
                </div>

                {wizardOpen ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      {lt('Step {step} of {total}', { step: wizardStep, total: 4 })}
                    </div>

                    {wizardStep === 1 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="wiz-name">{lt('Source name')}</Label>
                          <Input
                            id="wiz-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={lt('e.g. Finance Google Drive')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{lt('Provider')}</Label>
                          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                            <SelectTrigger>
                              <SelectValue placeholder={lt('Select provider')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SFTP">SFTP (SSH)</SelectItem>
                              <SelectItem value="FTPS">FTPS (TLS / mTLS)</SelectItem>
                              <SelectItem value="GOOGLE_DRIVE">Google Drive</SelectItem>
                              <SelectItem value="ONEDRIVE">OneDrive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="md:col-span-2 text-xs text-muted-foreground">
                          {lt('Tip: for cloud drives, this wizard will show “Connected as” so you can confirm the exact account being used.')}
                        </div>
                      </div>
                    ) : null}

                    {wizardStep === 2 ? (
                      <div className="space-y-3">
                        {!wizardSourceId ? (
                          <div className="text-sm text-muted-foreground">{lt('Creating the source…')}</div>
                        ) : provider === 'GOOGLE_DRIVE' || provider === 'ONEDRIVE' ? (
                          <div className="space-y-3">
                            <div className="text-sm">
                              <div className="font-medium">{lt('Connect account')}</div>
                              <div className="text-muted-foreground">
                                {lt('This decides which {drive} will be accessed.', {
                                  drive: provider === 'GOOGLE_DRIVE' ? 'Google Drive' : 'OneDrive',
                                })}
                              </div>
                            </div>

                            <div className="rounded-md bg-muted p-3 text-sm">
                              {lt('Status:')}{' '}
                              {statusById[wizardSourceId] ? (
                                <span className="font-medium">{lt('connected')}</span>
                              ) : (
                                <span className="font-medium">{lt('not connected')}</span>
                              )}
                              {cloudInfoById[wizardSourceId]?.account?.email || cloudInfoById[wizardSourceId]?.account?.displayName ? (
                                <>
                                  {' '}
                                  • {lt('Connected as')}{' '}
                                  <span className="font-medium">
                                    {cloudInfoById[wizardSourceId]?.account?.email || cloudInfoById[wizardSourceId]?.account?.displayName}
                                  </span>
                                </>
                              ) : null}
                              {tokenErrorById[wizardSourceId] && (
                                <div className="mt-2 text-red-600 flex items-center gap-2">
                                  <span>{lt('Google Drive access has expired or been revoked. Please reconnect.')}</span>
                                  <Button size="sm" variant="destructive" onClick={() => handleReconnect(wizardSource!)}>
                                    {lt('Reconnect')}
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {statusById[wizardSourceId] ? (
                                <Button variant="outline" onClick={() => disconnectSource(wizardSourceId)} disabled={working}>
                                  {lt('Disconnect')}
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => connectSource({
                                    id: wizardSourceId,
                                    tenant_id: tenantId!,
                                    name,
                                    provider,
                                    enabled,
                                    schedule_minutes: Number(scheduleMinutes || 60),
                                    last_run_at: null,
                                    config: {},
                                  })}
                                  disabled={working}
                                >
                                  {lt('Connect')}
                                </Button>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground">
                              {lt('Your OAuth app must allow redirect URI:')}{' '}
                              <span className="font-mono">{window.location.origin}/api/external-sources/oauth/{provider === 'GOOGLE_DRIVE' ? 'google' : 'microsoft'}/callback</span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="ext-host">{lt('Host')}</Label>
                              <Input id="ext-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="sftp.example.com" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ext-port">{lt('Port')}</Label>
                              <Input id="ext-port" value={port} onChange={(e) => setPort(e.target.value)} placeholder={provider === 'SFTP' ? '22' : '21'} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ext-path">{lt('Remote Path')}</Label>
                              <Input id="ext-path" value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ext-user">{lt('Username')}</Label>
                              <Input id="ext-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ext-pass">{lt('Password (optional)')}</Label>
                              <Input id="ext-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>

                            {provider === 'SFTP' ? (
                              <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="ext-key">{lt('SSH Private Key PEM (optional)')}</Label>
                                <Textarea id="ext-key" value={privateKeyPem} onChange={(e) => setPrivateKeyPem(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                              </div>
                            ) : null}

                            {provider === 'FTPS' ? (
                              <>
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor="ftps-cert">{lt('Client Certificate PEM (mTLS optional)')}</Label>
                                  <Textarea id="ftps-cert" value={clientCertPem} onChange={(e) => setClientCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor="ftps-key">{lt('Client Key PEM (mTLS optional)')}</Label>
                                  <Textarea id="ftps-key" value={clientKeyPem} onChange={(e) => setClientKeyPem(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor="ftps-ca">{lt('CA Certificate PEM (optional)')}</Label>
                                  <Textarea id="ftps-ca" value={caCertPem} onChange={(e) => setCaCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
                                </div>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {wizardStep === 3 ? (
                      <div className="space-y-3">
                        {(provider === 'GOOGLE_DRIVE' || provider === 'ONEDRIVE') ? (
                          <div className="space-y-2">
                            <div className="text-sm">
                              <div className="font-medium">{lt('Select folder & file pattern')}</div>
                              <div className="text-muted-foreground">{lt('Pick a folder so you know exactly what will be scanned.')}</div>
                            </div>

                            <div className="space-y-2">
                              <Label>{lt('File Pattern (glob)')}</Label>
                              <Input value={fileGlob} onChange={(e) => setFileGlob(e.target.value)} placeholder="**/*.pdf" />
                            </div>

                            <div className="rounded-md border p-3 text-sm">
                              {lt('Current folder:')}{' '}
                              <span className="font-mono text-xs break-all">
                                {folderId || (wizardSource?.config?.folder_id as string | undefined) || lt('(not set)')}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => wizardSource && openFolderPicker(wizardSource)}
                                disabled={working || pickerLoading || !wizardSource}
                              >
                                {lt('Pick Folder')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>{lt('File Pattern (glob)')}</Label>
                            <Input value={fileGlob} onChange={(e) => setFileGlob(e.target.value)} placeholder="**/*" />
                          </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{lt('Document Type')}</Label>
                            <Select value={documentType} onValueChange={(v) => setDocumentType(v as 'invoice' | 'receipt' | 'bank_statement' | 'other' | 'none') }>
                              <SelectTrigger>
                                <SelectValue placeholder={lt('Select type')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">{lt('Auto/Unknown')}</SelectItem>
                                <SelectItem value="invoice">{lt('Invoice')}</SelectItem>
                                <SelectItem value="receipt">{lt('Receipt')}</SelectItem>
                                <SelectItem value="bank_statement">{lt('Bank Statement')}</SelectItem>
                                <SelectItem value="other">{lt('Other')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>{lt('Bank Account (for statements)')}</Label>
                            <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={documentType !== 'bank_statement'}>
                              <SelectTrigger>
                                <SelectValue placeholder={lt('Select bank account')} />
                              </SelectTrigger>
                              <SelectContent>
                                {bankAccounts.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {(a.bank_name ? `${a.bank_name} - ` : '') + a.account_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {wizardStep === 4 ? (
                      <div className="space-y-3">
                        <div className="text-sm">
                          <div className="font-medium">{lt('Review & enable')}</div>
                          <div className="text-muted-foreground">{lt('Turn it on and optionally run a quick test.')}</div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="ext-schedule">{lt('Schedule (minutes)')}</Label>
                            <Input id="ext-schedule" value={scheduleMinutes} onChange={(e) => setScheduleMinutes(e.target.value)} />
                          </div>
                          <div className="flex items-center gap-2 pt-6">
                            <Switch checked={enabled} onCheckedChange={setEnabled} />
                            <span className="text-sm">{lt('Enabled')}</span>
                          </div>
                        </div>

                        {wizardSourceId ? (
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => testSource(wizardSourceId)} disabled={working}>
                              {lt('Test')}
                            </Button>
                            <Button onClick={wizardFinish} disabled={working}>
                              {lt('Finish')}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex justify-between gap-2">
                      <Button variant="outline" onClick={wizardBack} disabled={working || wizardStep === 1}>
                        {lt('Back')}
                      </Button>
                      {wizardStep < 4 ? (
                        <Button onClick={wizardNext} disabled={working}>
                          {lt('Next')}
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={resetWizard} disabled={working}>
                          {lt('Close')}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm">
                  <div className="font-medium">{lt('Supabase Cron (per-tenant)')}</div>
                  <div className="text-muted-foreground">
                    {lt('Generate a tenant-specific cron secret (stored as a hash) and use it in your scheduled trigger.')}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    {lt('Status:')} {cronConfigured ? lt('configured') : lt('not configured')}
                    {cronKeyPrefix ? lt(' • key prefix {prefix}', { prefix: cronKeyPrefix }) : ''}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lt('Enabled')}</Label>
                    <div className="flex items-center gap-2">
                      <Switch checked={cronEnabled} onCheckedChange={setCronEnabled} disabled={!cronConfigured} />
                      <span className="text-sm text-muted-foreground">{lt('Allow scheduled imports for this tenant')}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cron-limit">{lt('Default run limit')}</Label>
                    <Input
                      id="cron-limit"
                      value={cronDefaultLimit}
                      onChange={(e) => setCronDefaultLimit(e.target.value)}
                      disabled={!cronConfigured}
                    />
                    <p className="text-sm text-muted-foreground">{lt('Used when cron calls omit a limit (1–50).')}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={rotateCronSecret} disabled={working}>
                    {cronConfigured ? lt('Rotate Cron Secret') : lt('Generate Cron Secret')}
                  </Button>
                  <Button variant="outline" onClick={saveCronConfig} disabled={working || !cronConfigured}>
                    {lt('Save Cron Config')}
                  </Button>
                  {generatedCronSecret ? (
                    <Button onClick={copyCronSecret} disabled={working}>
                      {lt('Copy Secret')}
                    </Button>
                  ) : null}
                </div>

                {generatedCronSecret ? (
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <div className="font-medium">{lt('New cron secret (shown once)')}</div>
                    <div className="font-mono break-all text-xs">{generatedCronSecret}</div>
                    <div className="text-muted-foreground text-xs">
                      {lt('Use this as header')}{' '}
                      <span className="font-mono">x-ledgerai-cron-secret</span>{' '}
                      {lt('when calling')}
                      <span className="font-mono"> /api/external-sources/run</span>{' '}
                      {lt('with')}{' '}
                      <span className="font-mono">tenant_id</span>.
                    </div>
                  </div>
                ) : null}

                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {lt('Scheduled call body example:')}
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify({ tenant_id: tenantId, limit: 10 }, null, 2)}</pre>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchSources} disabled={working || loading}>
                  {lt('Refresh')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Configuration checklist: consolidated guidance to reduce confusion */}
      {canManage && sources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{lt('Configuration Checklist')}</CardTitle>
            <CardDescription>
              {lt('High-level guidance to finish setup for each configured source.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {lt('Each source shows a concise next-step and quick actions to complete configuration.')}
            </div>

            <div className="space-y-2">
              {sources.map((s) => {
                const connected = isCloud(s) ? !!statusById[s.id] : true
                const folderSet = isCloud(s) ? cloudInfoById[s.id]?.folder_id || !!s.config?.folder_id : true
                const tokenErr = !!tokenErrorById[s.id]
                const ready = connected && folderSet && !tokenErr

                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lt('{provider} • every {minutes}m', { provider: s.provider, minutes: s.schedule_minutes })}
                      </div>
                      <div className="mt-2 flex gap-2 text-xs">
                        <div className={`px-2 py-1 rounded ${ready ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-yellow-50 text-yellow-900 border border-yellow-100'}`}>
                          {ready ? lt('Ready') : lt('Needs attention')}
                        </div>
                        {isCloud(s) && !connected ? <div className="px-2 py-1 rounded bg-red-50 text-red-800 border border-red-100">{lt('Not connected')}</div> : null}
                        {isCloud(s) && connected && !folderSet ? <div className="px-2 py-1 rounded bg-yellow-50 text-yellow-900 border border-yellow-100">{lt('Folder not selected')}</div> : null}
                        {tokenErr ? <div className="px-2 py-1 rounded bg-red-50 text-red-800 border border-red-100">{lt('Reconnect required')}</div> : null}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isCloud(s) && (!connected ? (
                        <Button variant="outline" onClick={() => connectSource(s)} disabled={working}>{lt('Connect')}</Button>
                      ) : (
                        <Button variant="outline" onClick={() => disconnectSource(s.id)} disabled={working}>{lt('Disconnect')}</Button>
                      ))}

                      {isCloud(s) && connected ? (
                        <Button variant="outline" onClick={() => openFolderPicker(s)} disabled={working || pickerLoading}>{lt('Pick Folder')}</Button>
                      ) : null}

                      <Button variant={ready ? undefined : 'outline'} onClick={() => testSource(s.id)} disabled={working || !canRunSource(s)}>{lt('Test')}</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{lt('Configured Sources')}</CardTitle>
          <CardDescription>
            {loading ? lt('Loading…') : lt('{count} source(s)', { count: sources.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canManage ? null : sources.length === 0 ? (
            <div className="text-sm text-muted-foreground">{lt('No external sources configured.')}</div>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="rounded-md border p-3 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-muted-foreground">
                      {lt('{provider} • every {minutes}m • {state}', {
                        provider: s.provider,
                        minutes: s.schedule_minutes,
                        state: s.enabled ? lt('enabled') : lt('disabled'),
                      })}
                      {s.last_run_at ? lt(' • last run {datetime}', { datetime: new Date(s.last_run_at).toLocaleString() }) : ''}
                      {isCloud(s)
                        ? lt(' • folder {folder}', {
                            folder: (s.config?.folder_id as string | undefined) || lt('(not set)'),
                          })
                        : ''}
                    </div>

                    {isCloud(s) ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {!cloudConnected(s) ? (
                          <>{lt('Step 1: Connect • Step 2: Pick Folder • Step 3: Test')}</>
                        ) : (
                          <>
                            {lt('Connected as')}{' '}
                            <span className="font-medium">
                              {cloudInfoById[s.id]?.account?.email || cloudInfoById[s.id]?.account?.displayName || lt('unknown')}
                            </span>
                            {cloudInfoById[s.id]?.folder_id ? (
                              <>
                                {' '}
                                • {lt('Folder:')}{' '}
                                <span className="font-medium">
                                  {cloudInfoById[s.id]?.folder_name || cloudInfoById[s.id]?.folder_id}
                                </span>
                              </>
                            ) : (
                              <> • {lt('Folder: not selected')}</>
                            )}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isCloud(s) ? (
                      cloudConnected(s) ? (
                        <Button variant="outline" onClick={() => disconnectSource(s.id)} disabled={working}>
                          {lt('Disconnect')}
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => connectSource(s)} disabled={working}>
                          {lt('Connect')}
                        </Button>
                      )
                    ) : null}

                    {isCloud(s) && cloudConnected(s) ? (
                      <Button
                        variant="outline"
                        onClick={() => openFolderPicker(s)}
                        disabled={working || pickerLoading}
                      >
                        {lt('Pick Folder')}
                      </Button>
                    ) : null}

                    <Button variant="outline" onClick={() => testSource(s.id)} disabled={working || !canRunSource(s)}>
                      {lt('Test')}
                    </Button>
                    <Button onClick={() => runSource(s.id)} disabled={working || !canRunSource(s)}>
                      {lt('Run Now')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => deleteSource(s.id)}
                      disabled={working}
                    >
                      {lt('Delete')}
                    </Button>
                  </div>
                </div>

                {/* Cloud storage token/session error notification */}
                {isCloud(s) && tokenErrorById[s.id] && (
                  <div className="rounded bg-red-50 border border-red-200 p-2 text-sm text-red-800 flex items-center gap-2 mb-2">
                    <span>{lt('Cloud storage access for this source has expired or been revoked. Scheduled jobs and manual imports will not work until you reconnect.')}</span>
                    <Button size="sm" variant="destructive" onClick={() => handleReconnect(s)}>
                      {lt('Reconnect')}
                    </Button>
                  </div>
                )}
                {pickerSourceId === s.id ? (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-muted-foreground">
                        {lt('Browse folders (starting at root)')}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={navigateBackFolder}
                          disabled={pickerLoading || pickerStack.length === 0}
                        >
                          {lt('Back')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => loadFolders(s.id, pickerParentId)}
                          disabled={pickerLoading}
                        >
                          {lt('Refresh')}
                        </Button>
                        <Button variant="outline" onClick={closeFolderPicker} disabled={pickerLoading}>
                          {lt('Close')}
                        </Button>
                      </div>
                    </div>

                    <div className="text-sm">
                      <div className="text-muted-foreground">{lt('Current folder:')}</div>
                      <div className="font-mono text-xs break-all">{pickerParentId}</div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => updateCloudFolder(s, pickerParentId)}
                        disabled={working || pickerLoading}
                      >
                        {lt('Select This Folder')}
                      </Button>
                    </div>

                    {pickerLoading ? (
                      <div className="text-sm text-muted-foreground">{lt('Loading folders…')}</div>
                    ) : pickerFolders.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {lt('No folders found under this location. You can still click “Select This Folder” to use the current folder (including root).')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pickerFolders.map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 rounded border bg-background p-2">
                            <Button
                              variant="ghost"
                              className="h-8 px-2 justify-start flex-1"
                              onClick={() => navigateIntoFolder(f.id)}
                              disabled={pickerLoading}
                            >
                              {f.name}
                            </Button>
                            <Button
                              variant="outline"
                              className="h-8"
                              onClick={() => updateCloudFolder(s, f.id)}
                              disabled={working || pickerLoading}
                            >
                              {lt('Select')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                      {!pickerLoading ? (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">{lt('Files (preview)')}</div>
                          {pickerFiles.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              {lt('No files found in this folder.')}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {pickerFiles.slice(0, 20).map((f) => (
                                <div key={f.id} className="text-sm flex items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                                  <div className="truncate">{f.name}</div>
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {typeof f.size === 'number' ? lt('{size} KB', { size: Math.round(f.size / 1024) }) : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
