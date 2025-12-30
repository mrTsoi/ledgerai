'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/hooks/use-tenant'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { useLiterals } from '@/hooks/use-literals'
import { uploadDocumentViaApi } from '@/lib/uploads/upload-document-client'
import { CloudImportDialog } from '@/components/documents/cloud-import-dialog'

interface UploadFile {
  file: File
  id: string
  documentId?: string // Added DB ID
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error' | 'needs_review'
  error?: string
  statusMessage?: string
  validationFlags?: string[]
  tenantCandidates?: Array<{ tenantId?: string; confidence: number; reasons?: string[] }>
  isMultiTenant?: boolean
  tenantCorrection?: {
    actionTaken: 'NONE' | 'REASSIGNED' | 'CREATED' | 'LIMIT_REACHED' | 'SKIPPED_MULTI_TENANT' | 'FAILED'
    fromTenantId?: string
    toTenantId?: string
    toTenantName?: string
    message?: string
  }
  recordsCreated?: boolean
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

interface Props {
  onVerify?: (documentId: string) => void
  onUploadComplete?: () => void
}

export function DocumentUpload({ onVerify, onUploadComplete }: Props) {
  const lt = useLiterals()
  const ltVars = (english: string, vars?: Record<string, string | number>) => {
    return lt(english, vars)
  }
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('none')
  const [bankAccounts, setBankAccounts] = useState<Partial<import('@/types/database.types').Database['public']['Tables']['bank_accounts']['Row']>[]>([])
  const { currentTenant } = useTenant()
  const { batchSize } = useBatchConfig()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const fetchBankAccounts = useCallback(async () => {
    if (!tenantId) return

    const { data } = await supabase
      .from('bank_accounts')
      .select('id, account_name, bank_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
    
    if (data) setBankAccounts(data)
  }, [supabase, tenantId])

  useEffect(() => {
    fetchBankAccounts()
  }, [fetchBankAccounts])

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || !currentTenant) return

    const validateFile = (file: File): string | null => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return lt('File type not supported. Please upload PDF, images, or spreadsheets.')
      }
      if (file.size > MAX_FILE_SIZE) {
        return lt('File size exceeds 50MB limit.')
      }
      return null
    }

    const newFiles: UploadFile[] = Array.from(fileList).map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: 'pending' as const,
      error: validateFile(file) || undefined
    }))

    setFiles(prev => [...prev, ...newFiles])
  }, [currentTenant, lt])

  const uploadFile = async (uploadFile: UploadFile) => {
    if (!currentTenant || uploadFile.error) return

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 10, statusMessage: lt('Starting upload...') } : f
      ))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error(lt('Not authenticated'))

      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, progress: 30, statusMessage: lt('Uploading to storage...') } : f
      ))

      const isBankStatement = selectedBankAccountId !== 'none'
      const uploaded = await uploadDocumentViaApi({
        tenantId: currentTenant.id,
        file: uploadFile.file,
        documentType: isBankStatement ? 'bank_statement' : null,
        bankAccountId: isBankStatement ? selectedBankAccountId : null,
      })

      const documentId = uploaded.documentId

      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, progress: 60, statusMessage: lt('Saving metadata...'), documentId } : f
      ))

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, progress: 80, statusMessage: lt('Triggering AI processing...') } : f
      ))

      // Trigger AI processing
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || lt('Processing failed'))
      }

      const needsReview = result.validationStatus === 'NEEDS_REVIEW'
      const flags = result.validationFlags || []
      const tenantCandidates = Array.isArray(result.tenantCandidates) ? result.tenantCandidates : []
      const isMultiTenant = Boolean(result.isMultiTenant)
      const tenantCorrection = (result?.tenantCorrection || { actionTaken: 'NONE' }) as UploadFile['tenantCorrection']
      const recordsCreated = typeof result.recordsCreated === 'boolean' ? result.recordsCreated : true

      const hasWrongTenantFlag = flags.includes('WRONG_TENANT')
      const tenantHint =
        hasWrongTenantFlag && tenantCandidates.length > 0
          ? isMultiTenant
            ? ltVars('Tenant mismatch: multiple companies detected ({count} matches)', { count: tenantCandidates.length })
            : ltVars('Tenant mismatch detected ({count} possible matches)', { count: tenantCandidates.length })
          : null

      const correctionHint =
        tenantCorrection?.actionTaken === 'REASSIGNED'
          ? ltVars('Moved to {company}', { company: tenantCorrection?.toTenantName || lt('another company') })
          : tenantCorrection?.actionTaken === 'CREATED'
            ? ltVars('Created {company} and moved', { company: tenantCorrection?.toTenantName || lt('a new company') })
            : tenantCorrection?.actionTaken === 'LIMIT_REACHED'
              ? lt('Tenant limit reached — upgrade to create a new company')
              : tenantCorrection?.actionTaken === 'FAILED'
                ? (tenantCorrection?.message || lt('Tenant correction failed'))
                : null

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { 
          ...f, 
          status: needsReview ? 'needs_review' : 'success', 
          progress: 100, 
          statusMessage: needsReview
            ? (correctionHint || tenantHint || ltVars('Needs Review: {flags}', { flags: flags.join(', ') }))
            : (correctionHint || lt('Complete')),
          validationFlags: flags,
          tenantCandidates,
          isMultiTenant,
          tenantCorrection,
          recordsCreated
        } : f
      ))

      if (onUploadComplete) {
        onUploadComplete()
      }
      
    } catch (error: any) {
      console.error('Upload error:', error)
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' as const, error: error.message || lt('Upload failed'), progress: 0, statusMessage: lt('Failed') } 
          : f
      ))
    }
  }

  const handleUploadAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' && !f.error)
    const chunks = chunkArray(pendingFiles, batchSize)

    for (const chunk of chunks) {
      await Promise.all(chunk.map(file => uploadFile(file)))
    }

    setTimeout(() => {
      router.refresh()
    }, 1000)
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{lt('Upload Documents')}</CardTitle>
          <CardDescription>{lt('Please select a tenant first')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Upload Documents')}</CardTitle>
        <CardDescription>
          {lt('Upload invoices, receipts, or other financial documents for processing')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bank Account Selection */}
        {bankAccounts.length > 0 && (
          <div className="mb-4">
            <Label className="mb-2 block">{lt('Associate with Bank Account (Optional)')}</Label>
            <select
              className="w-full p-2 border rounded-md text-sm"
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
            >
              <option value="none">{lt('-- No Bank Account (General Document) --')}</option>
              {bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} ({acc.bank_name})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {lt('Select a bank account if you are uploading bank statements.')}
            </p>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 hover:border-gray-400'
            }
          `}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {lt('Drag and drop files here')}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            {lt('or click to browse')}
          </p>
          <input
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="file-upload"
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="camera-upload"
          />
          <label htmlFor="file-upload">
            <Button type="button" variant="outline" asChild>
              <span>{lt('Choose Files')}</span>
            </Button>
          </label>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <label htmlFor="camera-upload">
              <Button type="button" variant="outline" asChild>
                <span>{lt('Camera')}</span>
              </Button>
            </label>

            <CloudImportDialog
              tenantId={currentTenant.id}
              documentType={selectedBankAccountId !== 'none' ? 'bank_statement' : null}
              bankAccountId={selectedBankAccountId !== 'none' ? selectedBankAccountId : null}
              triggerLabel={lt('Cloud Storage')}
              onImported={() => {
                if (onUploadComplete) onUploadComplete()
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-4">
            {lt('Supported: PDF, Images, Excel/CSV • Max 50MB per file')}
          </p>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{ltVars('Files ({count})', { count: files.length })}</h3>
              <Button
                onClick={handleUploadAll}
                disabled={!files.some(f => f.status === 'pending' && !f.error)}
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                {lt('Upload All')}
              </Button>
            </div>
            {files.map(file => (
              <div
                key={file.id}
                className="p-3 border rounded-lg space-y-2"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {file.status === 'uploading' && (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  {file.status === 'needs_review' && (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                  {file.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  {file.status === 'pending' && !file.error && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {/* Review Action */}
                  {file.status === 'needs_review' && file.documentId && onVerify && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 h-7 text-xs border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-800"
                      onClick={() => onVerify(file.documentId!)}
                    >
                      {lt('Review')}
                    </Button>
                  )}
                  {/* If processing skipped creating records, surface to user */}
                  {file.recordsCreated === false && file.documentId && (
                    <div className="ml-2 flex items-center gap-2">
                      <span className="text-xs text-red-600">{lt('No transaction created — review required')}</span>
                      {onVerify && (
                        <Button size="sm" variant="outline" onClick={() => onVerify(file.documentId!)}>
                          {lt('Review')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Progress Bar & Status Message */}
                {(file.status === 'uploading' || file.status === 'success' || file.status === 'needs_review' || file.error) && (
                  <div className="space-y-1">
                    <Progress value={file.progress} className="h-2" />
                    <div className="flex justify-between text-xs">
                      <span className={
                        file.error ? "text-red-600" : 
                        file.status === 'needs_review' ? "text-yellow-600 font-medium" :
                        "text-gray-500"
                      }>
                        {lt(file.error || '') || lt(file.statusMessage || '')}
                      </span>
                      <span className="text-gray-400">{file.progress}%</span>
                    </div>
                  </div>
                )}
                {/* Tenant Candidate Details */}
                {file.status === 'needs_review' && file.tenantCandidates && file.tenantCandidates.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-yellow-700">{lt('Possible tenant matches:')}</div>
                    <ul className="mt-2 space-y-2">
                      {file.tenantCandidates.map((c, idx) => (
                        <li key={idx} className="p-2 border rounded bg-yellow-50">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold truncate">{(c as any).tenantName || c.tenantId || lt('Unknown')}</div>
                            <div className="text-xs text-gray-600">{Math.round((c.confidence || 0) * 100)}%</div>
                          </div>
                          {c.reasons && c.reasons.length > 0 && (
                            <div className="text-xs text-gray-600 mt-1">{c.reasons.join('; ')}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
