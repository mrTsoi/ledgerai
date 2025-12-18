'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  X, ZoomIn, ZoomOut, Save, Loader2, 
  RotateCcw, Plus, Trash2, AlertCircle,
  ArrowUpDown, Search
} from 'lucide-react'
import { toast } from "sonner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImagePreview } from '@/components/ui/image-preview'

type Document = Database['public']['Tables']['documents']['Row']
type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']

interface Props {
  documentId: string
  onClose: () => void
  onSaved?: () => void
}

export function StatementDetailModal({ documentId, onClose, onSaved }: Props) {
  const [document, setDocument] = useState<Document | null>(null)
  const [transactions, setTransactions] = useState<Partial<BankTransaction>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  
  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: keyof BankTransaction; direction: 'asc' | 'desc' } | null>(null)

  // Drag & Zoom State
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const fetchDetails = useCallback(async () => {
    if (!documentId) return

    try {
      setLoading(true)
      console.log('Fetching details for document:', documentId)
      
      // 1. Fetch Document
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (docError) {
        console.error('Error fetching document:', docError)
        throw docError
      }
      setDocument(doc)

      // 2. Fetch Transactions linked to this document
      // First get the statement ID associated with this document
      const { data: statement, error: stmtError } = await supabase
        .from('bank_statements')
        .select('id')
        .eq('document_id', documentId)
        .maybeSingle()

      if (stmtError) {
        console.error('Error fetching statement:', stmtError)
        // Don't throw, we might still find data in document_data
      }

      let txs: any[] = []
        if (statement) {
        const { data: dbTxs, error: txError } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('bank_statement_id', statement.id)
          .order('transaction_date', { ascending: false })

        if (txError) {
          console.error('Error fetching transactions:', txError)
          throw txError
        }
        txs = dbTxs || []
      }
      
      // If no transactions found in DB, try to get from document_data (if not yet processed)
      if (!txs || txs.length === 0) {
         const { data: docData, error: docDataError } = await supabase
            .from('document_data')
            .select('extracted_data')
            .eq('document_id', documentId)
            .maybeSingle()
         
         if (!docDataError && (docData as { extracted_data?: any } | null)?.extracted_data?.bank_transactions) {
           const extracted = (docData as { extracted_data?: any }).extracted_data
           setTransactions(extracted.bank_transactions.map((t: any, i: number) => ({
                 id: `temp-${i}`,
                 transaction_date: t.date,
                 description: t.description,
                 amount: t.amount,
                 transaction_type: t.type || 'DEBIT',
                 status: 'PENDING'
             })))
         }
      } else {
          setTransactions(txs)
      }

      // 3. Load Preview
      if (doc?.file_path) {
        const { data: blob, error: storageError } = await supabase.storage
          .from('documents')
          .download(doc.file_path as string)

        if (storageError) {
          console.error('Error downloading preview:', storageError)
          // Don't throw here, just log it so we can still see the transactions
        } else if (blob) {
          setPreviewUrl(URL.createObjectURL(blob))
        }
      }

    } catch (error) {
      console.error('Error fetching details:', error)
      toast.error('Failed to load statement details')
    } finally {
      setLoading(false)
    }
  }, [documentId, supabase])

  useEffect(() => {
    fetchDetails()
  }, [fetchDetails])

  const handleSave = async () => {
    try {
      setSaving(true)

      // 1. Update existing transactions
      const updates = transactions.filter(t => !t.id?.toString().startsWith('temp-'))
      const newTxs = transactions.filter(t => t.id?.toString().startsWith('temp-'))

      for (const tx of updates) {
        const { error } = await supabase
          .from('bank_transactions')
          .update({
            transaction_date: tx.transaction_date,
            description: tx.description,
            amount: tx.amount,
            transaction_type: tx.transaction_type
          })
          .eq('id', tx.id!)
        
        if (error) throw error
      }

      // 2. Insert new transactions (if any added manually)
      // const newTxs = transactions.filter(t => t.id?.toString().startsWith('temp-')) // Already declared above
      
      if (newTxs.length > 0) {
          // We need the bank_statement_id. If we fetched it earlier, great.
          // If not, we need to find it or create it?
          // In fetchDetails, we tried to find it.
          
          let statementId: string | null = null
          const { data: statement } = await supabase
            .from('bank_statements')
            .select('id, bank_account_id, tenant_id')
            .eq('document_id', documentId)
            .maybeSingle()
            
          if (statement) {
              statementId = statement.id
              
              const toInsert = newTxs.map(tx => ({
                  bank_statement_id: statementId,
                  tenant_id: statement.tenant_id,
                  transaction_date: tx.transaction_date,
                  description: tx.description,
                  amount: tx.amount,
                  transaction_type: tx.transaction_type,
                  status: 'PENDING',
                  raw_data: { source: 'manual_entry' }
              }))
              
              const { error: insertError } = await supabase.from('bank_transactions').insert(toInsert)
              
              if (insertError) throw insertError
          } else {
              console.warn('No statement found for document, cannot insert new transactions yet')
              // This might happen if the document hasn't been processed into a statement yet.
              // In that case, we are just updating the extracted_data JSON below.
          }
      }

      // 3. Update document_data to reflect verified state
      const { data: currentData } = await supabase
        .from('document_data')
        .select('extracted_data')
        .eq('document_id', documentId)
        .single()

        if (currentData) {
          const updatedExtracted = {
            ...((currentData as { extracted_data?: any }).extracted_data || {}),
            bank_transactions: transactions.map(t => ({
              date: t.transaction_date,
              description: t.description,
              amount: t.amount,
              type: t.transaction_type
            }))
          }

          await supabase
          .from('document_data')
          .update({
            extracted_data: updatedExtracted,
            metadata: { verified_by_user: true }
          })
          .eq('document_id', documentId)
        }

      toast.success('Changes saved successfully')
      if (onSaved) onSaved()
      onClose()

    } catch (error: any) {
      console.error('Error saving:', error)
      toast.error('Failed to save: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSort = (key: keyof BankTransaction) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return current.direction === 'asc' 
          ? { key, direction: 'desc' } 
          : null
      }
      return { key, direction: 'asc' }
    })
  }

  const updateTransaction = (id: string, field: keyof BankTransaction, value: any) => {
    setTransactions(prev => prev.map(tx => 
      tx.id === id ? { ...tx, [field]: value } : tx
    ))
  }

  const deleteTransaction = async (id: string) => {
      const tx = transactions.find(t => t.id === id)
      if (!tx) return

        if (tx.id && !tx.id.toString().startsWith('temp-')) {
          if (!confirm('Delete this transaction permanently?')) return
          
          try {
          await supabase.from('bank_transactions').delete().eq('id', tx.id)
          } catch (e) {
              console.error(e)
              toast.error('Failed to delete')
              return
          }
      }
      
      setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const addNewTransaction = () => {
    const newTx: Partial<BankTransaction> = {
      id: `temp-new-${Date.now()}`,
      transaction_date: new Date().toISOString().split('T')[0],
      description: 'New Transaction',
      amount: 0,
      transaction_type: 'DEBIT',
      status: 'PENDING'
    }
    setTransactions(prev => [newTx, ...prev])
    // Scroll to top or highlight?
  }

  const getProcessedTransactions = () => {
    let result = [...transactions]

    // Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(tx => 
        tx.description?.toLowerCase().includes(query) ||
        tx.amount?.toString().includes(query) ||
        tx.transaction_date?.includes(query)
      )
    }

    // Sort
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]
        
        if (aValue === bValue) return 0
        
        // Handle nulls
        if (aValue === null || aValue === undefined) return 1
        if (bValue === null || bValue === undefined) return -1

        const comparison = aValue > bValue ? 1 : -1
        return sortConfig.direction === 'asc' ? comparison : -comparison
      })
    }

    return result
  }

  // Mouse/Touch handlers for preview (same as DocumentVerificationModal)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => setIsDragging(false)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white p-8 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-black/80 backdrop-blur-sm">
      {/* Left Pane: Preview */}
      <div className="relative flex-1 flex flex-col h-[40vh] lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900 overflow-hidden">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <Button 
            variant="secondary" size="sm" className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.max(50, z - 10))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="px-2 py-1 bg-black/50 text-white text-sm rounded flex items-center">
            {zoomLevel}%
          </span>
          <Button 
            variant="secondary" size="sm" className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.min(200, z + 10))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="secondary" size="sm" className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => { setZoomLevel(100); setPosition({ x: 0, y: 0 }) }}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div 
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 cursor-grab active:cursor-grabbing p-4"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {previewUrl ? (
            document?.file_type.startsWith('image/') ? (
              <ImagePreview
                src={previewUrl}
                alt="Preview"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel / 100})`,
                  transition: isDragging ? 'none' : 'transform 0.2s',
                }}
                className="max-w-full max-h-full object-contain pointer-events-none"
              />
            ) : (
              <iframe src={previewUrl} className="w-full h-full bg-white" title="PDF Preview" />
            )
          ) : (
            <div className="text-white opacity-50">No Preview</div>
          )}
        </div>
      </div>

      {/* Right Pane: Transaction List */}
      <div className="w-full lg:w-[700px] bg-white h-[60vh] lg:h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="font-semibold text-lg">Verify Transactions</h2>
            <p className="text-sm text-gray-500">{document?.file_name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 border-b bg-white flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={addNewTransaction}>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px] cursor-pointer hover:bg-gray-50" onClick={() => handleSort('transaction_date')}>
                  <div className="flex items-center gap-1">
                    Date
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-gray-50" onClick={() => handleSort('description')}>
                  <div className="flex items-center gap-1">
                    Description
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[100px] cursor-pointer hover:bg-gray-50" onClick={() => handleSort('transaction_type')}>
                  <div className="flex items-center gap-1">
                    Type
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[100px] text-right cursor-pointer hover:bg-gray-50" onClick={() => handleSort('amount')}>
                  <div className="flex items-center gap-1 justify-end">
                    Amount
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getProcessedTransactions().map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <Input 
                      type="date" 
                      value={tx.transaction_date || ''} 
                      onChange={(e) => updateTransaction(tx.id!, 'transaction_date', e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={tx.description || ''} 
                      onChange={(e) => updateTransaction(tx.id!, 'description', e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={tx.transaction_type || 'DEBIT'} 
                      onValueChange={(value) => updateTransaction(tx.id!, 'transaction_type', value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">Debit</SelectItem>
                        <SelectItem value="CREDIT">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      step="0.01"
                      value={tx.amount || ''} 
                      onChange={(e) => updateTransaction(tx.id!, 'amount', parseFloat(e.target.value))}
                      className="h-8 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => deleteTransaction(tx.id!)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {transactions.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No transactions found in this statement.
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Total: {transactions.length} items
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
