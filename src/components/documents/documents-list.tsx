'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FileText, Download, Trash2, Search, Filter, Loader2, Eye, RefreshCw, X, CheckSquare, Square, AlertTriangle, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { DocumentVerificationModal } from './document-verification-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ImagePreview } from '@/components/ui/image-preview'

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
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set())
  // const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null) // Moved to parent
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Confirmation Dialog State
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string
    description: string
    action: () => Promise<void>
    actionLabel: string
    variant?: 'default' | 'destructive'
  } | null>(null)

  const { currentTenant } = useTenant()
  const { batchSize } = useBatchConfig()
  const supabase = useMemo((): import('@supabase/supabase-js').SupabaseClient<Database> => createClient(), [])

  const fetchDocuments = useCallback(async () => {
    if (!currentTenant) return

    try {
      setLoading(true)
      let query = supabase
        .from('documents')
        .select('*, document_data(confidence_score, extracted_data)')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setDocuments((data as unknown as Document[]) || [])
    } catch (error) {
      console.error('Error fetching documents:', error)
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
      toast.error('Failed to download document: ' + error.message)
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

    let description = `Are you sure you want to delete "${doc.file_name}"?`
    if (hasAssociations) {
      description += ` This will also delete:`
      if (associations.transactions > 0) description += `\n• ${associations.transactions} Transaction(s)`
      if (associations.bankStatements > 0) description += `\n• ${associations.bankStatements} Bank Statement(s)`
      if (associations.bankTransactions > 0) description += `\n• ${associations.bankTransactions} Bank Transaction(s)`
    }

    setConfirmConfig({
      title: 'Delete Document',
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
          toast.success('Document and associated records deleted')
        } catch (error: any) {
          console.error('Delete error:', error)
          toast.error('Failed to delete document: ' + error.message)
        }
      },
      actionLabel: 'Delete',
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
      toast.error('Failed to load preview: ' + error.message)
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
        const msg = (data['error'] as string) || (data['message'] as string) || 'Failed to start processing'
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
      toast.error('Failed to reprocess: ' + error.message)
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

    let description = `Are you sure you want to delete ${selectedIds.size} documents?`
    if (hasAssociations) {
      description += ` This will also delete:`
      if (associations.transactions > 0) description += `\n• ${associations.transactions} Transaction(s)`
      if (associations.bankStatements > 0) description += `\n• ${associations.bankStatements} Bank Statement(s)`
      if (associations.bankTransactions > 0) description += `\n• ${associations.bankTransactions} Bank Transaction(s)`
    }

    setConfirmConfig({
      title: 'Delete Documents',
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
          toast.success('Documents and associated records deleted')
        } catch (error: any) {
          console.error('Bulk delete error:', error)
          toast.error('Failed to delete documents: ' + error.message)
        }
      },
      actionLabel: 'Delete',
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
      toast.info(`Bulk processing started. Processing in batches of ${batchSize}.`)

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
      toast.error('Failed to reprocess: ' + error.message)
    }
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

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Please select a tenant first</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>All Documents ({documents.length})</CardTitle>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={bulkReprocess}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reprocess ({selectedIds.size})
              </Button>
              <Button size="sm" variant="destructive" onClick={bulkDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col md:flex-row gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full md:w-auto"
          >
            <option value="all">All Status</option>
            <option value="UPLOADED">Uploaded</option>
            <option value="PROCESSING">Processing</option>
            <option value="PROCESSED">Processed</option>
            <option value="FAILED">Failed</option>
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
                ? 'No documents yet. Upload your first document above.' 
                : 'No documents match your search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:flex items-center gap-4 p-2 border-b text-sm font-medium text-gray-500">
              <Checkbox 
                checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                onCheckedChange={toggleAll}
              />
              <span className="flex-1">Document Name</span>
              <span className="w-24">Status</span>
              <span className="w-32 text-right">Actions</span>
            </div>
            {filteredDocuments.map(doc => (
              <div
                key={doc.id}
                className={`flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-lg transition-colors ${
                  selectedIds.has(doc.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Checkbox 
                    checked={selectedIds.has(doc.id)}
                    onCheckedChange={() => toggleSelection(doc.id)}
                  />
                  <FileText className="w-10 h-10 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium truncate">{doc.file_name}</h3>
                      {doc.validation_status === 'NEEDS_REVIEW' && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full" title={doc.validation_flags?.join(', ')}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>
                            {doc.validation_flags?.includes('DUPLICATE_DOCUMENT') ? 'Duplicate' : 
                             doc.validation_flags?.includes('WRONG_TENANT') ? 'Wrong Tenant' : 'Review Needed'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs text-gray-500 mt-1">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span className="hidden md:inline">•</span>
                      <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                      {doc.document_type && (
                        <>
                          <span className="hidden md:inline">•</span>
                          <span className="capitalize">{doc.document_type}</span>
                        </>
                      )}
                      {(() => {
                        const data = getDocData(doc)
                        if (data?.confidence_score != null) {
                          const score = data.confidence_score * 100
                          return (
                            <>
                              <span className="hidden md:inline">•</span>
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${
                                score >= 80 
                                  ? 'bg-green-50 text-green-700 border-green-200' 
                                  : score >= 50 
                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
                                    : 'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                <Sparkles className="w-3 h-3" />
                                <span>{Math.round(score)}% AI Confidence</span>
                              </div>
                            </>
                          )
                        }
                        return null
                      })()}
                      {(() => {
                        const data = getDocData(doc)
                        if (doc.document_type === 'BANK_STATEMENT' && data?.extracted_data?.bank_transactions?.length > 0) {
                           return (
                             <>
                              <span className="hidden md:inline">•</span>
                              <span>{data.extracted_data.bank_transactions.length} Txns</span>
                             </>
                           )
                        }
                        return null
                      })()}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between md:justify-end gap-4 pl-8 md:pl-0">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[doc.status]}`}>
                    {doc.status}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onVerify?.(doc.id)}
                      title="Verify Data"
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reprocessDocument(doc)}
                      disabled={reprocessingIds.has(doc.id) || doc.status === 'PROCESSING'}
                      title="Reprocess with AI"
                    >
                      {reprocessingIds.has(doc.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadDocument(doc)}
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteDocument(doc)}
                      title="Delete"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Verification Modal - Moved to parent */}
      {/* {verifyingDocId && (
        <DocumentVerificationModal
          documentId={verifyingDocId}
          onClose={() => setVerifyingDocId(null)}
          onSaved={() => {
            fetchDocuments()
            setVerifyingDocId(null)
          }}
        />
      )} */}

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
                  <p className="text-gray-500 mb-4">Preview not available for this file type.</p>
                  <Button onClick={() => downloadDocument(previewDoc)}>
                    Download to View
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig?.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">
              {confirmConfig?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant={confirmConfig?.variant || 'default'} 
              onClick={confirmConfig?.action}
            >
              {confirmConfig?.actionLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
