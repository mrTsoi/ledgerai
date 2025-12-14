'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/hooks/use-tenant'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'

interface UploadFile {
  file: File
  id: string
  documentId?: string // Added DB ID
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error' | 'needs_review'
  error?: string
  statusMessage?: string
  validationFlags?: string[]
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
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('none')
  const [bankAccounts, setBankAccounts] = useState<import('@/types/database.types').Database['public']['Tables']['bank_accounts']['Row'][]>([])
  const { currentTenant } = useTenant()
  const { batchSize } = useBatchConfig()
  const router = useRouter()
  const supabase = useMemo(() => createClient() as any, [])
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

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not supported. Please upload PDF, images, or spreadsheets.'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 50MB limit.'
    }
    return null
  }

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || !currentTenant) return

    const newFiles: UploadFile[] = Array.from(fileList).map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: 'pending' as const,
      error: validateFile(file) || undefined
    }))

    setFiles(prev => [...prev, ...newFiles])
  }, [currentTenant])

  const uploadFile = async (uploadFile: UploadFile) => {
    if (!currentTenant || uploadFile.error) return

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 10, statusMessage: 'Starting upload...' } : f
      ))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Generate unique file path
      const fileExt = uploadFile.file.name.split('.').pop()
      const documentId = crypto.randomUUID()
      const filePath = `${currentTenant.id}/${documentId}.${fileExt}`

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, progress: 30, statusMessage: 'Uploading to storage...', documentId } : f
      ))

      // Upload to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(filePath, uploadFile.file, {
          cacheControl: '3600',
          upsert: false
        })

      if (storageError) throw storageError

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, progress: 60, statusMessage: 'Saving metadata...' } : f
      ))

      // Determine document type based on bank account selection
      const isBankStatement = selectedBankAccountId !== 'none'
      const documentType = isBankStatement ? 'bank_statement' : null

      // Create document record
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          id: documentId,
          tenant_id: currentTenant.id,
          file_path: filePath,
          file_name: uploadFile.file.name,
          file_size: uploadFile.file.size,
          file_type: uploadFile.file.type,
          uploaded_by: user.id,
          status: 'UPLOADED',
          document_type: documentType
        })

      if (dbError) {
        // Cleanup storage if database insert fails
        await supabase.storage.from('documents').remove([filePath])
        throw dbError
      }

      // If bank account selected, create bank_statement record immediately
      if (isBankStatement) {
        await supabase
          .from('bank_statements')
          .insert({
            tenant_id: currentTenant.id,
            bank_account_id: selectedBankAccountId,
            document_id: documentId,
            status: 'IMPORTED'
          })
      }

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, progress: 80, statusMessage: 'Triggering AI processing...' } : f
      ))

      // Trigger AI processing
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Processing failed')
      }

      const needsReview = result.validationStatus === 'NEEDS_REVIEW'
      const flags = result.validationFlags || []

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { 
          ...f, 
          status: needsReview ? 'needs_review' : 'success', 
          progress: 100, 
          statusMessage: needsReview ? `Needs Review: ${flags.join(', ')}` : 'Complete',
          validationFlags: flags
        } : f
      ))

      if (onUploadComplete) {
        onUploadComplete()
      }
      
    } catch (error: any) {
      console.error('Upload error:', error)
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' as const, error: error.message || 'Upload failed', progress: 0, statusMessage: 'Failed' } 
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
          <CardTitle>Upload Documents</CardTitle>
          <CardDescription>Please select a tenant first</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Documents</CardTitle>
        <CardDescription>
          Upload invoices, receipts, or other financial documents for processing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bank Account Selection */}
        {bankAccounts.length > 0 && (
          <div className="mb-4">
            <Label className="mb-2 block">Associate with Bank Account (Optional)</Label>
            <select
              className="w-full p-2 border rounded-md text-sm"
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
            >
              <option value="none">-- No Bank Account (General Document) --</option>
              {bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} ({acc.bank_name})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select a bank account if you are uploading bank statements.
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
            Drag and drop files here
          </p>
          <p className="text-sm text-gray-500 mb-4">
            or click to browse
          </p>
          <input
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload">
            <Button type="button" variant="outline" asChild>
              <span>Choose Files</span>
            </Button>
          </label>
          <p className="text-xs text-gray-500 mt-4">
            Supported: PDF, Images, Excel/CSV • Max 50MB per file
          </p>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Files ({files.length})</h3>
              <Button
                onClick={handleUploadAll}
                disabled={!files.some(f => f.status === 'pending' && !f.error)}
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload All
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
                      Review
                    </Button>
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
                        {file.error || file.statusMessage}
                      </span>
                      <span className="text-gray-400">{file.progress}%</span>
                    </div>
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
