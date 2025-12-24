'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { FileText, Download, Trash2, Search, Filter, Loader2, Eye, RefreshCw, X, CheckSquare, Square, AlertTriangle, Sparkles, ArrowRightLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { DocumentVerificationModal } from './document-verification-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ImagePreview } from '@/components/ui/image-preview'
import { useLiterals } from '@/hooks/use-literals'
import { TenantSettings } from '../settings/tenant-settings'

type Document = Database['public']['Tables']['documents']['Row'] & {
  document_data?: {
    confidence_score: number | null
    extracted_data: any
    bank_transactions?: any[] // Helper for type safety
  }[] | any // Allow for potential single object return or array
}

const STATUS_COLORS = {
  UPLOADED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  PROCESSED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
}

interface Props {
  onVerify?: (documentId: string) => void
  refreshKey?: number
}


export function DocumentsList({ onVerify, refreshKey }: Props) {
  const lt = useLiterals()
  const ltVars = (english: string, vars?: Record<string, string | number>) => lt(english, vars)

  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)

  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Responsive state
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])


  // Long-press for mobile selection
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null)
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false)
  const handleRowTouchStart = (id: string) => {
    if (!isMobile) return
    longPressTimeout.current = setTimeout(() => {
      toggleSelection(id)
      setMobileSelectionMode(true)
    }, 400)
  }
  const handleRowTouchEnd = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current)
  }

  // When selection is cleared, exit mobile selection mode
  useEffect(() => {
    if (!isMobile) return
    if (selectedIds.size === 0 && mobileSelectionMode) setMobileSelectionMode(false)
  }, [selectedIds, isMobile, mobileSelectionMode])

  // Expand/collapse row
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Check if any selected documents have tenant mismatches
  const hasTenantMismatchesSelected = useMemo(() => {
    return documents.some(d => 
      selectedIds.has(d.id) && 
      d.validation_flags?.includes('WRONG_TENANT')
    )
  }, [documents, selectedIds])

  // Confirmation Dialog State
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmWorking, setConfirmWorking] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<null | {
    label: string
    total: number
    completed: number
    moved: number
    created: number
    failed: number
  }>(null)
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string
    description: string
    action: () => Promise<void>
    actionLabel: string
    variant?: 'default' | 'destructive'
  } | null>(null)

  const { currentTenant, refreshTenants } = useTenant()
  const { batchSize } = useBatchConfig()
  const supabase = useMemo((): import('@supabase/supabase-js').SupabaseClient<Database> => createClient(), [])

  const runConfirmAction = async () => {
    if (!confirmConfig?.action) return
    try {
      setConfirmWorking(true)
      await confirmConfig.action()
    } finally {
      setConfirmWorking(false)
      setBulkProgress(null)
    }
  }

  const fetchDocuments = useCallback(async () => {
    if (!currentTenant) return

    try {
      setLoading(true)
      // Prefer including related extracted data, but fall back gracefully if the
      // relationship/table isn't available in the current environment.
      const primary = await supabase
        .from('documents')
        .select('*, document_data(confidence_score, extracted_data)')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })

      if (!primary.error) {
        setDocuments((primary.data as unknown as Document[]) || [])
        return
      }

      const code = String((primary.error as any)?.code ?? '')
      const msg = String((primary.error as any)?.message ?? '')

      // Common local/dev case: migrations not applied (table/relationship missing).
      if (code === '42P01' || code === '42883' || /document_data/i.test(msg)) {
        const fallback = await supabase
          .from('documents')
          .select('*')
          .eq('tenant_id', currentTenant.id)
          .order('created_at', { ascending: false })

        if (fallback.error) throw fallback.error
        setDocuments((fallback.data as unknown as Document[]) || [])
        return
      }

      throw primary.error
    } catch (error) {
      console.error('Error fetching documents:', error)
      const msg =
        error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
          ? String((error as any).message)
          : typeof error === 'string'
            ? error
            : 'Failed to load documents'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [currentTenant, supabase])

  useEffect(() => {
    if (!currentTenant) return

    fetchDocuments()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        () => {
          fetchDocuments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentTenant, refreshKey, fetchDocuments, supabase])

  const downloadDocument = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path)

      if (error) throw error

      // Create download link
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Download error:', error)
      toast.error(`${lt('Failed to download document')}: ${error.message}`)
    }
  }

  const checkAssociations = async (docId: string) => {
    const { count: txCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', docId)

    const { data: statements } = await supabase
      .from('bank_statements')
      .select('id')
      .eq('document_id', docId)

    const statementIds = (statements as { id: string }[] | null)?.map(s => s.id) || []
    let bankTxCount = 0
    
    if (statementIds.length > 0) {
      const { count } = await supabase
        .from('bank_transactions')
        .select('*', { count: 'exact', head: true })
        .in('bank_statement_id', statementIds)
      bankTxCount = count || 0
    }

    return {
      transactions: txCount || 0,
      bankStatements: statementIds.length,
      bankTransactions: bankTxCount
    }
  }

  const checkBulkAssociations = async (docIds: string[]) => {
    const { count: txCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .in('document_id', docIds)

    const { data: statements } = await supabase
      .from('bank_statements')
      .select('id')
      .in('document_id', docIds)

    const statementIds = (statements as { id: string }[] | null)?.map(s => s.id) || []
    let bankTxCount = 0
    
    if (statementIds.length > 0) {
      const { count } = await supabase
        .from('bank_transactions')
        .select('*', { count: 'exact', head: true })
        .in('bank_statement_id', statementIds)
      bankTxCount = count || 0
    }

    return {
      transactions: txCount || 0,
      bankStatements: statementIds.length,
      bankTransactions: bankTxCount
    }
  }

  const deleteDocument = async (doc: Document) => {
    const associations = await checkAssociations(doc.id)
    const hasAssociations = associations.transactions > 0 || associations.bankStatements > 0

    let description = ltVars('Are you sure you want to delete "{fileName}"?', { fileName: doc.file_name })
    if (hasAssociations) {
      description += ` ${lt('This will also delete:')}`
      if (associations.transactions > 0) description += `\n• ${ltVars('{count} Transaction(s)', { count: associations.transactions })}`
      if (associations.bankStatements > 0) description += `\n• ${ltVars('{count} Bank Statement(s)', { count: associations.bankStatements })}`
      if (associations.bankTransactions > 0) description += `\n• ${ltVars('{count} Bank Transaction(s)', { count: associations.bankTransactions })}`
    }

    setConfirmConfig({
      title: lt('Delete Document'),
      description: description,
      action: async () => {
        try {
          // 1. Delete Transactions
          if (associations.transactions > 0) {
            const { error: txError } = await supabase
              .from('transactions')
              .delete()
              .eq('document_id', doc.id)
            if (txError) throw txError
          }

          // 2. Delete Bank Statements (Cascades to Bank Transactions)
          if (associations.bankStatements > 0) {
            const { error: bsError } = await supabase
              .from('bank_statements')
              .delete()
              .eq('document_id', doc.id)
            if (bsError) throw bsError
          }

          // 3. Delete from storage
          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([doc.file_path])

          if (storageError) throw storageError

          // 4. Delete from database
          const { error: dbError } = await supabase
            .from('documents')
            .delete()
            .eq('id', doc.id)

          if (dbError) throw dbError

          setDocuments(prev => prev.filter(d => d.id !== doc.id))
          setShowConfirmDialog(false)
          toast.success(lt('Document and associated records deleted'))
        } catch (error: any) {
          console.error('Delete error:', error)
          toast.error(`${lt('Failed to delete document')}: ${error.message}`)
        }
      },
      actionLabel: lt('Delete'),
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const previewDocument = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path)

      if (error) throw error

      const url = URL.createObjectURL(data)
      setPreviewUrl(url)
      setPreviewDoc(doc)
    } catch (error: any) {
      console.error('Preview error:', error)
      toast.error(`${lt('Failed to load preview')}: ${error.message}`)
    }
  }

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setPreviewDoc(null)
    }
  }

  const getDocData = (doc: Document) => {
    if (Array.isArray(doc.document_data) && doc.document_data.length > 0) {
      return doc.document_data[0]
    }
    // Handle case where Supabase might return a single object instead of array
    if (doc.document_data && !Array.isArray(doc.document_data)) {
      return doc.document_data as Document['document_data']
    }
    return null
  }

  const reprocessDocument = async (doc: Document) => {
    try {
      setReprocessingIds(prev => new Set(prev).add(doc.id))
      
      // Optimistically update status immediately
      setDocuments(prev => prev.map(d => 
        d.id === doc.id ? { ...d, status: 'PROCESSING' } : d
      ))

      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as unknown)) as Record<string, unknown>
        const msg = (data['error'] as string) || (data['message'] as string) || lt('Failed to start processing')
        throw new Error(msg)
      }
      
      // Fetch the updated document to get the new AI data
      const { data: updatedDoc, error: fetchError } = await supabase
        .from('documents')
        .select('*, document_data(confidence_score, extracted_data)')
        .eq('id', doc.id)
        .single()

      if (fetchError) throw fetchError

      // Update state with fresh data
      if (updatedDoc) {
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? (updatedDoc as unknown as Document) : d
        ))
      }
      
    } catch (error: any) {
      console.error('Reprocess error:', error)
      toast.error(`${lt('Failed to reprocess')}: ${error.message}`)
      // Set to FAILED on error
      setDocuments(prev => prev.map(d => 
        d.id === doc.id ? { ...d, status: 'FAILED' } : d
      ))
    } finally {
      setReprocessingIds(prev => {
        const next = new Set(prev)
        next.delete(doc.id)
        return next
      })
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDocuments.map(d => d.id)))
    }
  }

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    const associations = await checkBulkAssociations(ids)
    const hasAssociations = associations.transactions > 0 || associations.bankStatements > 0

    let description = ltVars('Are you sure you want to delete {count} documents?', { count: selectedIds.size })
    if (hasAssociations) {
      description += ` ${lt('This will also delete:')}`
      if (associations.transactions > 0) description += `\n• ${ltVars('{count} Transaction(s)', { count: associations.transactions })}`
      if (associations.bankStatements > 0) description += `\n• ${ltVars('{count} Bank Statement(s)', { count: associations.bankStatements })}`
      if (associations.bankTransactions > 0) description += `\n• ${ltVars('{count} Bank Transaction(s)', { count: associations.bankTransactions })}`
    }

    setConfirmConfig({
      title: lt('Delete Documents'),
      description: description,
      action: async () => {
        try {
          const docsToDelete = documents.filter(d => selectedIds.has(d.id))
          
          // 1. Delete Transactions
          if (associations.transactions > 0) {
            const { error: txError } = await supabase
              .from('transactions')
              .delete()
              .in('document_id', ids)
            if (txError) throw txError
          }

          // 2. Delete Bank Statements (Cascades to Bank Transactions)
          if (associations.bankStatements > 0) {
            const { error: bsError } = await supabase
              .from('bank_statements')
              .delete()
              .in('document_id', ids)
            if (bsError) throw bsError
          }

          // 3. Delete from storage
          const paths = docsToDelete.map(d => d.file_path)
          if (paths.length > 0) {
            await supabase.storage.from('documents').remove(paths)
          }

          // 4. Delete from DB
          const { error } = await supabase
            .from('documents')
            .delete()
            .in('id', ids)

          if (error) throw error

          setDocuments(prev => prev.filter(d => !selectedIds.has(d.id)))
          setSelectedIds(new Set())
          setShowConfirmDialog(false)
          toast.success(lt('Documents and associated records deleted'))
        } catch (error: any) {
          console.error('Bulk delete error:', error)
          toast.error(`${lt('Failed to delete documents')}: ${error.message}`)
        }
      },
      actionLabel: lt('Delete'),
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const bulkReprocess = async () => {
    try {
      const ids = Array.from(selectedIds)
      
      // Add all to reprocessing set
      setReprocessingIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      })

      // Optimistic update
      setDocuments(prev => prev.map(d => 
        selectedIds.has(d.id) ? { ...d, status: 'PROCESSING' } : d
      ))
      
      setSelectedIds(new Set())
      toast.info(ltVars('Bulk processing started. Processing in batches of {batchSize}.', { batchSize }))

      // Process in batches
      const chunks = chunkArray(ids, batchSize)

      for (const chunk of chunks) {
        await Promise.all(chunk.map(async (id) => {
          try {
            const response = await fetch('/api/documents/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documentId: id }),
            })

            if (response.ok) {
              // Fetch updated doc
              const { data: updatedDoc } = await supabase
                .from('documents')
                .select('*, document_data(confidence_score, extracted_data)')
                .eq('id', id)
                .single()

              if (updatedDoc) {
                setDocuments(prev => prev.map(d => 
                  d.id === id ? (updatedDoc as unknown as Document) : d
                ))
              }
            } else {
              setDocuments(prev => prev.map(d => 
                d.id === id ? { ...d, status: 'FAILED' } : d
              ))
            }
          } catch (e) {
            console.error(`Failed to process ${id}`, e)
            setDocuments(prev => prev.map(d => 
                d.id === id ? { ...d, status: 'FAILED' } : d
              ))
          } finally {
            // Remove from set as they finish
            setReprocessingIds(prev => {
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          }
        }))
      }
      
    } catch (error: any) {
      console.error('Bulk reprocess error:', error)
      toast.error(`${lt('Failed to reprocess')}: ${error.message}`)
    }
  }

  const bulkResolveTenants = async () => {
    const docsToResolve = documents.filter(d => 
      selectedIds.has(d.id) && 
      d.validation_flags?.includes('WRONG_TENANT')
    )

    if (docsToResolve.length === 0) {
      toast.info(lt("No documents with 'Wrong Tenant' flag selected."))
      return
    }

    setConfirmConfig({
      title: lt('Auto-Resolve Tenant Mismatches'),
      description: ltVars("Attempt to automatically reassign or create tenants for {count} documents? \n\nDocuments successfully moved will disappear from this tenant's list.", { count: docsToResolve.length }),
      action: async () => {
        try {
          setBulkProgress({
            label: lt('Resolving tenant mismatches…'),
            total: docsToResolve.length,
            completed: 0,
            moved: 0,
            created: 0,
            failed: 0,
          })

          setReprocessingIds(prev => {
            const next = new Set(prev)
            docsToResolve.forEach(d => next.add(d.id))
            return next
          })

          let movedCount = 0
          let createdCount = 0
          let failedCount = 0

          const chunks = chunkArray(docsToResolve.map(d => d.id), batchSize)

          for (const chunk of chunks) {
            await Promise.all(chunk.map(async (id) => {
              try {
                const response = await fetch('/api/documents/process', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentId: id }),
                })

                const result = await response.json().catch(() => ({} as any))

                if (response.ok) {
                  const actionTaken = result?.tenantCorrection?.actionTaken as
                    | 'NONE'
                    | 'REASSIGNED'
                    | 'CREATED'
                    | 'LIMIT_REACHED'
                    | 'SKIPPED_MULTI_TENANT'
                    | 'FAILED'
                    | undefined

                  if (actionTaken === 'REASSIGNED') movedCount++
                  else if (actionTaken === 'CREATED') createdCount++

                  // If the document was moved away, remove it from this tenant's list.
                  if (actionTaken === 'REASSIGNED' || actionTaken === 'CREATED') {
                    setDocuments((prev) => prev.filter((d) => d.id !== id))
                  } else {
                    // Otherwise, refresh this document row (it stayed in the current tenant).
                    const { data: updatedDoc } = await supabase
                      .from('documents')
                      .select('*, document_data(confidence_score, extracted_data)')
                      .eq('id', id)
                      .single()

                    if (updatedDoc) {
                      setDocuments((prev) => prev.map((d) => (d.id === id ? (updatedDoc as unknown as Document) : d)))
                    }
                  }
                } else {
                  failedCount++
                }
              } catch (e) {
                failedCount++
              } finally {
                setBulkProgress((prev) => {
                  if (!prev) return prev
                  const next = {
                    ...prev,
                    completed: prev.completed + 1,
                    moved: movedCount,
                    created: createdCount,
                    failed: failedCount,
                  }
                  return next
                })

                setReprocessingIds(prev => {
                  const next = new Set(prev)
                  next.delete(id)
                  return next
                })
              }
            }))
          }

          setSelectedIds(new Set())
          setShowConfirmDialog(false)
          
          if (failedCount === 0) {
            toast.success(ltVars('Resolution complete: {moved} moved, {created} tenants created.', { moved: movedCount, created: createdCount }))
          } else {
            toast.warning(ltVars('Resolution finished with issues: {moved} moved, {created} created, {failed} failed.', { moved: movedCount, created: createdCount, failed: failedCount }))
          }

          if (createdCount > 0) {
            try {
              await refreshTenants()
            } catch (e) {
              console.error('Failed to refresh tenants after creation:', e)
            }
          }
          
          fetchDocuments()
        } catch (error: any) {
          console.error('Bulk resolution error:', error)
          toast.error(`${lt('Bulk resolution failed')}: ${error.message}`)
        }
      },
      actionLabel: lt('Resolve All'),
      variant: 'default'
    })
    setShowConfirmDialog(true)
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.file_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const statusLabels: Record<string, string> = {
    UPLOADED: lt('Uploaded'),
    PROCESSING: lt('Processing'),
    PROCESSED: lt('Processed'),
    FAILED: lt('Failed'),
  }

  const docTypeLables: Record<string, string> = {
    bank_statement: lt('Bank Statement'),
    invoice: lt('Invoice'),
    receipt: lt('Receipt')
  }

  const transTypeLabels: Record<string, string> = {
    expense: lt('Expense'),
    income: lt('Income')
  }

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{lt('Documents')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">{lt('Please select a tenant first')}</p>
        </CardContent>
      </Card>
    )
  }


  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{ltVars('All Documents ({count})', { count: documents.length })}</CardTitle>
        </div>
        <div className="flex flex-col gap-2 mt-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder={lt('Search documents...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-auto"
          >
            <option value="all">{lt('All Status')}</option>
            <option value="UPLOADED">{lt('Uploaded')}</option>
            <option value="PROCESSING">{lt('Processing')}</option>
            <option value="PROCESSED">{lt('Processed')}</option>
            <option value="FAILED">{lt('Failed')}</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
                <div className="flex gap-2">
                  <Skeleton className="w-8 h-8 rounded" />
                  <Skeleton className="w-8 h-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {documents.length === 0 
                ? lt('No documents yet. Upload your first document above.') 
                : lt('No documents match your search.')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Desktop/tablet header */}
            <div className="hidden md:grid grid-cols-[40px_1fr_120px_120px] items-center p-2 border-b text-sm font-medium text-gray-500">
              <Checkbox 
                checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                onCheckedChange={toggleAll}
              />
              <span>{lt('Document Name')}</span>
              <span>{lt('Status')}</span>
              <span className="text-right">{lt('Actions')}</span>
            </div>
            {/* Mobile/desktop card layout, expandable details */}
            {filteredDocuments.map(doc => {
              const expanded = expandedIds.has(doc.id)
              const showCheckbox = !isMobile || mobileSelectionMode
              // Extract transaction type and currency from document_data.extracted_data if available
              const docData = getDocData(doc)
              const transactionType = docData?.extracted_data?.transaction_type || ''
              // Default currency to tenant's currency if not found in extraction
              const currency = docData?.extracted_data?.currency_code || currentTenant?.currency || ''
              return (
                <div key={doc.id} className="group">
                  
                  {/* Main row: grid for desktop, flex for mobile */}
                  <div
                    className={
                      `p-4 border rounded-lg transition-colors ${
                        selectedIds.has(doc.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      } ` +
                      (isMobile ? 'flex flex-row items-center gap-3 md:grid md:grid-cols-[40px_1fr_120px_120px] md:items-center md:gap-4' : 'grid grid-cols-[40px_1fr_120px_120px] items-center gap-4')
                    }
                    onClick={e => {
                      if (isMobile) {
                        if (mobileSelectionMode && (e.target as HTMLElement).closest('input[type="checkbox"]')) return
                        toggleExpand(doc.id)
                      } else {
                        toggleExpand(doc.id)
                      }
                    }}
                    onTouchStart={() => handleRowTouchStart(doc.id)}
                    onTouchEnd={handleRowTouchEnd}
                  >
                    {/* Checkbox, icon, and name in a row for mobile; icon+name flex for desktop */}
                    <div className="flex items-center gap-2">
                      {showCheckbox && (
                        <Checkbox 
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelection(doc.id)}
                          className="scale-125"
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </div>
                    {/* Document icon and name (desktop: flex row, mobile: handled above) */}
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-10 h-10 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-medium truncate">{doc.file_name}</h3>
                          {((doc.validation_status === 'NEEDS_REVIEW') || (Array.isArray(doc.validation_flags) && doc.validation_flags.length > 0)) && (
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full" title={doc.validation_flags?.join(', ')}>
                              <AlertTriangle className="w-3 h-3" />
                              <span>
                                {doc.validation_flags?.includes('DUPLICATE_DOCUMENT') ? ltVars('Duplicate  ') : ''}
                                {doc.validation_flags?.includes('WRONG_TENANT') ? ltVars('Wrong Tenant ') : ''} 
                                {doc.validation_flags?.includes('Review Needed') ? ltVars('Review Needed') : ''} 
                              </span>
                            </div>
                          )}
                          {((doc.validation_status === 'NEEDS_REVIEW') || (Array.isArray(doc.validation_flags) && doc.validation_flags.length > 0)) && (
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full" title={doc.validation_flags?.join(', ')}>
                              <AlertTriangle className="w-3 h-3" />
                              <span>
                                {doc.validation_flags?.includes('WRONG_TENANT') ? ltVars('Wrong Tenant ') : ''} 
                              </span>
                            </div>
                          )}
                          {((doc.validation_status === 'NEEDS_REVIEW') || (Array.isArray(doc.validation_flags) && doc.validation_flags.length > 0)) && (
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full" title={doc.validation_flags?.join(', ')}>
                              <AlertTriangle className="w-3 h-3" />
                              <span>
                                {doc.validation_flags?.includes('Review Needed') ? ltVars('Review Needed') : ''} 
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs text-gray-500 mt-1">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span className="hidden md:inline">•</span>
                          <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                          <span className="hidden md:inline">•</span>
                          <span className="capitalize">
                            {doc.document_type
                              ? docTypeLables[doc.document_type.toLowerCase()] || doc.document_type
                              : ''}
                          </span>
                          <span className="hidden md:inline">•</span>
                          <span className="capitalize">
                            {transactionType
                              ? transTypeLabels[transactionType.toLowerCase()] || transactionType
                              : ''}
                          </span>
                          <span className="hidden md:inline">•</span>
                          <span className="capitalize">
                            {docData.extracted_data
                              ? '$' + docData.extracted_data.total_amount + ' ' + lt(currency)
                              : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Status */}
                    <div className="flex items-center">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[doc.status]}`}>{statusLabels[doc.status] || doc.status}</span>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap md:flex-nowrap justify-end">
                      <Button
                        size={isMobile ? 'icon' : 'sm'}
                        variant="ghost"
                        onClick={e => { e.stopPropagation(); onVerify?.(doc.id) }}
                        title={lt('Verify Data')}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <CheckSquare className="w-5 h-5" />
                      </Button>
                      <Button
                        size={isMobile ? 'icon' : 'sm'}
                        variant="ghost"
                        onClick={e => { e.stopPropagation(); reprocessDocument(doc) }}
                        disabled={reprocessingIds.has(doc.id) || doc.status === 'PROCESSING'}
                        title={lt('Reprocess with AI')}
                      >
                        {reprocessingIds.has(doc.id) ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-5 h-5" />
                        )}
                      </Button>
                      <Button
                        size={isMobile ? 'icon' : 'sm'}
                        variant="ghost"
                        onClick={e => { e.stopPropagation(); downloadDocument(doc) }}
                        title={lt('Download')}
                      >
                        <Download className="w-5 h-5" />
                      </Button>
                      <Button
                        size={isMobile ? 'icon' : 'sm'}
                        variant="ghost"
                        onClick={e => { e.stopPropagation(); deleteDocument(doc) }}
                        title={lt('Delete')}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                  {/* Expandable details: always below the row, full width */}
                  {expanded && (
                    <div className="w-full bg-gray-50 border-t px-8 py-4 text-sm text-gray-700 rounded-b-lg">
                      {(() => {
                        const data = getDocData(doc)
                        if (!data) return null
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                            {data.extracted_data?.vendor_name && (
                              <div>
                                <span className="font-semibold text-gray-900">{lt('Vendor')}:</span> <span>{data.extracted_data.vendor_name}</span>
                              </div>
                            )}
                            {data.extracted_data?.customer_name && (
                              <div>
                                <span className="font-semibold text-gray-900">{lt('Customer')}:</span> <span>{data.extracted_data.customer_name}</span>
                              </div>
                            )}
                            {data.extracted_data?.total_amount && (
                              <div>
                                <span className="font-semibold text-gray-900">{lt('Total')}:</span> <span>{data.extracted_data.total_amount} {data.extracted_data?.currency_code || currency}</span>
                              </div>
                            )}
                            {data.extracted_data?.bank_transactions?.length > 0 && (
                              <div>
                                <span className="font-semibold text-gray-900">{lt('Bank Transactions')}:</span> <span className="inline-block bg-blue-100 text-blue-800 rounded px-2 py-0.5 ml-1 text-xs font-medium">{data.extracted_data.bank_transactions.length}</span>
                              </div>
                            )}
                            {data.confidence_score != null && (
                              <div>
                                <span className="font-semibold text-gray-900">{lt('AI Confidence')}:</span> <span className={
                                  data.confidence_score >= 0.8
                                    ? 'inline-block bg-green-100 text-green-800 rounded px-2 py-0.5 ml-1 text-xs font-medium'
                                    : data.confidence_score >= 0.5
                                      ? 'inline-block bg-yellow-100 text-yellow-800 rounded px-2 py-0.5 ml-1 text-xs font-medium'
                                      : 'inline-block bg-red-100 text-red-800 rounded px-2 py-0.5 ml-1 text-xs font-medium'
                                }>{Math.round(data.confidence_score * 100)}%</span>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Sticky bottom bulk action bar for all screens */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg flex items-center justify-between px-4 py-3 gap-2 animate-in fade-in slide-in-from-bottom-4">
          {hasTenantMismatchesSelected && (
            <Button size="sm" variant="outline" onClick={bulkResolveTenants} className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 flex-1">
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              {lt('Resolve Tenants')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={bulkReprocess} className="flex-1">
            <RefreshCw className="w-4 h-4 mr-2" />
            {lt('Reprocess')} ({selectedIds.size})
          </Button>
          <Button size="sm" variant="destructive" onClick={bulkDelete} className="flex-1">
            <Trash2 className="w-4 h-4 mr-2" />
            {lt('Delete')} ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium">{previewDoc.file_name}</h3>
              <Button variant="ghost" size="sm" onClick={closePreview}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 bg-gray-100 p-4 overflow-auto flex items-center justify-center">
              {previewDoc.file_type.startsWith('image/') ? (
                <ImagePreview
                  src={previewUrl}
                  alt={previewDoc.file_name}
                  className="max-w-full max-h-full object-contain shadow-md"
                />
              ) : previewDoc.file_type === 'application/pdf' ? (
                <iframe 
                  src={previewUrl} 
                  className="w-full h-full bg-white shadow-md" 
                  title={previewDoc.file_name}
                />
              ) : (
                <div className="text-center">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">{lt('Preview not available for this file type.')}</p>
                  <Button onClick={() => downloadDocument(previewDoc)}>
                    {lt('Download to View')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={showConfirmDialog}
        onOpenChange={(open) => {
          if (confirmWorking) return
          setShowConfirmDialog(open)
        }}
      >
        <DialogContent
          onEscapeKeyDown={(e) => {
            if (confirmWorking) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (confirmWorking) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>{confirmConfig?.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">
              {confirmConfig?.description}
              {confirmWorking && bulkProgress && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm text-muted-foreground">{bulkProgress.label}</div>
                  <Progress value={bulkProgress.total > 0 ? (bulkProgress.completed / bulkProgress.total) * 100 : 0} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div>
                      {ltVars('{completed} / {total} processed', { completed: bulkProgress.completed, total: bulkProgress.total })}
                    </div>
                    <div>
                      {ltVars('Moved: {moved}', { moved: bulkProgress.moved })} • {ltVars('Created: {created}', { created: bulkProgress.created })} • {ltVars('Failed: {failed}', { failed: bulkProgress.failed })}
                    </div>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={confirmWorking}>
              {lt('Cancel')}
            </Button>
            <Button 
              variant={confirmConfig?.variant || 'default'} 
              onClick={runConfirmAction}
              disabled={confirmWorking}
            >
              {confirmWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {lt('Working…')}
                </>
              ) : (
                confirmConfig?.actionLabel
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
