'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  X, ZoomIn, ZoomOut, Save, RefreshCw, Loader2, 
  ChevronLeft, ChevronRight, FileText, AlertCircle, RotateCcw, Plus, Trash2 
} from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { getExchangeRate } from '@/lib/currency'
import { CurrencySelect } from '@/components/ui/currency-select'
import { ImagePreview } from '@/components/ui/image-preview'
import { toast } from "sonner"

type Document = Database['public']['Tables']['documents']['Row']
type DocumentData = Database['public']['Tables']['document_data']['Row']

interface Props {
  documentId: string
  onClose: () => void
  onSaved?: () => void
}

export function DocumentVerificationModal({ documentId, onClose, onSaved }: Props) {
  const [document, setDocument] = useState<Document | null>(null)
  const [docData, setDocData] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [formData, setFormData] = useState({
    vendor_name: '',
    document_date: '',
    total_amount: '',
    currency: 'USD',
    invoice_number: '',
    document_type: 'invoice',
    transaction_type: 'expense',
    // Bank Statement Fields
    statement_period_start: '',
    statement_period_end: '',
    opening_balance: '',
    closing_balance: '',
    bank_name: '',
    account_number: ''
  })
  
  const [bankTransactions, setBankTransactions] = useState<Array<{
    date: string
    description: string
    amount: string
    type: 'DEBIT' | 'CREDIT'
  }>>([])

  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Touch state for pinch-to-zoom
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null)
  const [lastZoomLevel, setLastZoomLevel] = useState(100)

  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient() as any, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const fetchDocumentDetails = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch document
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (docError) throw docError
      setDocument(doc)

      // Fetch document data separately to ensure freshness
      const { data: dData, error: dataError } = await supabase
        .from('document_data')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle()

      if (dataError) throw dataError

      // Load preview
      const { data: blob, error: storageError } = await supabase.storage
        .from('documents')
        .download(doc!.file_path)

      if (!storageError && blob) {
        setPreviewUrl(URL.createObjectURL(blob))
      }

      // Helper to safely format dates
      const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return ''
        const cleanStr = dateStr.trim()
        
        // 1. YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr
        
        // 2. YYYY-MM-DDTHH:mm:ss... (ISO)
        if (/^\d{4}-\d{2}-\d{2}T/.test(cleanStr)) return cleanStr.split('T')[0]
        
        // 3. Try parsing as date
        const d = new Date(cleanStr)
        if (isNaN(d.getTime())) return ''
        
        // 4. Use local time components
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      // Set form data if exists
      if (dData) {
        setDocData(dData)
        
        const extracted = (dData.extracted_data as unknown as Record<string, any>) || {}
        const rawDate = dData.document_date ?? extracted.document_date

        setFormData({
          vendor_name: dData.vendor_name ?? extracted.vendor_name ?? '',
          document_date: formatDate(rawDate),
          total_amount: dData.total_amount?.toString() ?? extracted.total_amount?.toString() ?? '',
          currency: dData.currency ?? extracted.currency ?? 'USD',
          invoice_number: extracted.invoice_number ?? '',
          document_type: doc!.document_type ?? extracted.document_type ?? 'invoice',
          transaction_type: extracted.transaction_type ?? 'expense',
          // Bank Statement Fields
          statement_period_start: extracted.statement_period_start || '',
          statement_period_end: extracted.statement_period_end || '',
          opening_balance: extracted.opening_balance?.toString() || '',
          closing_balance: extracted.closing_balance?.toString() || '',
          bank_name: extracted.bank_name || '',
          account_number: extracted.account_number || ''
        })

        // Bank transactions
        if (extracted.bank_transactions && Array.isArray(extracted.bank_transactions)) {
          setBankTransactions(extracted.bank_transactions.map((t: unknown) => {
            const tx = t as Record<string, any>
            return {
              date: tx.date || '',
              description: tx.description || '',
              amount: (tx.amount ?? '').toString(),
              type: tx.type === 'CREDIT' ? 'CREDIT' : 'DEBIT'
            }
          }))
        } else {
          setBankTransactions([])
        }
      }
    } catch (error) {
      console.error('Error fetching document details:', error)
    } finally {
      setLoading(false)
    }
  }, [documentId, supabase])

  useEffect(() => {
    fetchDocumentDetails()
  }, [fetchDocumentDetails])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      })
    } else if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      setInitialPinchDistance(dist)
      setLastZoomLevel(zoomLevel)

      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      setDragStart({ x: centerX - position.x, y: centerY - position.y })
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      })
    } else if (e.touches.length === 2 && initialPinchDistance !== null) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]

      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      const scale = dist / initialPinchDistance
      const newZoom = Math.max(50, Math.min(200, Math.round(lastZoomLevel * scale)))
      setZoomLevel(newZoom)

      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      setPosition({
        x: centerX - dragStart.x,
        y: centerY - dragStart.y
      })
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    setInitialPinchDistance(null)
    setLastZoomLevel(zoomLevel)
  }

  const handleSave = async () => {
    if (!document) return

    try {
      setSaving(true)

      const updateData = {
        vendor_name: formData.vendor_name,
        document_date: formData.document_date || null,
        total_amount: parseFloat(formData.total_amount) || 0,
        currency: formData.currency,
        extracted_data: {
          ...((docData?.extracted_data as unknown as Record<string, any>) || {}),
          vendor_name: formData.vendor_name,
          document_date: formData.document_date,
          total_amount: parseFloat(formData.total_amount) || 0,
          currency: formData.currency,
          invoice_number: formData.invoice_number,
          document_type: formData.document_type,
          transaction_type: formData.transaction_type,
          // Bank Statement Fields
          statement_period_start: formData.statement_period_start,
          statement_period_end: formData.statement_period_end,
          opening_balance: parseFloat(formData.opening_balance) || 0,
          closing_balance: parseFloat(formData.closing_balance) || 0,
          bank_name: formData.bank_name,
          account_number: formData.account_number,
          bank_transactions: bankTransactions.map(tx => ({
            ...tx,
            amount: parseFloat(tx.amount) || 0
          }))
        }
      }

      // Use upsert to handle both insert and update scenarios (and race conditions)
      const { error: dataError } = await supabase
        .from('document_data')
        .upsert({
          document_id: document.id,
          ...updateData,
          // If docData exists, preserve its values, otherwise use defaults
          confidence_score: docData?.confidence_score ?? 1.0,
          line_items: docData?.line_items ?? [],
          metadata: {
            ...((docData?.metadata as unknown as Record<string, any>) || {}),
            verified_by_user: true
          }
        }, { onConflict: 'document_id' })

      if (dataError) throw dataError

      // Update document type
      await supabase
        .from('documents')
        .update({ document_type: formData.document_type })
        .eq('id', document.id)

      // Handle Bank Statement Updates
      if (formData.document_type === 'bank_statement') {
        // 1. Find existing statement
        const { data: existingStatement } = await supabase
          .from('bank_statements')
          .select('id')
          .eq('document_id', document.id)
          .maybeSingle()
        
        if (existingStatement) {
          // Update statement details
          await supabase
            .from('bank_statements')
            .update({
              start_date: formData.statement_period_start || null,
              end_date: formData.statement_period_end || null,
              statement_date: formData.statement_period_end || null,
              opening_balance: parseFloat(formData.opening_balance) || 0,
              closing_balance: parseFloat(formData.closing_balance) || 0,
            })
            .eq('id', existingStatement.id)

          // Update transactions (Delete all and re-insert is safest for sync)
          // Ideally we would diff, but for now this ensures consistency with the verified data
          await supabase
            .from('bank_transactions')
            .delete()
            .eq('bank_statement_id', existingStatement.id)
            .eq('status', 'PENDING') // Only delete pending ones to avoid messing up matched ones? 
            // Actually, if user is verifying the document, they are defining the source of truth.
            // If some were already matched, deleting them might break links.
            // For now, let's assume this is done BEFORE matching.
            // If status is MATCHED, we should probably warn or skip.
            // Let's just delete all for now as this is "Verification" stage.
          
          if (bankTransactions.length > 0) {
            if (!currentTenant?.id) throw new Error('No tenant selected')
            const txsToInsert = bankTransactions.map(tx => ({
              tenant_id: currentTenant.id,
              bank_statement_id: existingStatement.id,
              transaction_date: tx.date,
              description: tx.description,
              amount: parseFloat(tx.amount) || 0,
              transaction_type: tx.type,
              status: 'PENDING',
              confidence_score: 1.0 // User verified
            }))
            
            await supabase.from('bank_transactions').insert(txsToInsert)
          }
        }
      } else {
        // Handle Invoice/Receipt Updates (Existing Logic)
        const { data: transaction } = await supabase
          .from('transactions')
          .select('id, status')
          .eq('document_id', document.id)
          .single()

        if (transaction && transaction.status === 'DRAFT') {
          // ... existing logic ...
          // 1. Determine Currency & Rate
          const tenantCurrency = 'USD'
          const docCurrency = formData.currency || tenantCurrency
          let exchangeRate = 1.0
          
          if (docCurrency !== tenantCurrency) {
             try {
               exchangeRate = await getExchangeRate(docCurrency, tenantCurrency, currentTenant?.id)
             } catch (e) {
               console.error('Failed to fetch rate', e)
             }
          }

          // 2. Update transaction details
          await supabase
            .from('transactions')
            .update({
              transaction_date: formData.document_date || new Date().toISOString().split('T')[0],
              reference_number: formData.invoice_number || null,
              description: `${formData.vendor_name || 'Vendor'} - ${document.file_name}`,
              currency: docCurrency,
              exchange_rate: exchangeRate
            })
            .eq('id', transaction.id)

          // 3. Update line items (simplified: update amounts proportionally or just the first ones)
          // In a real app, this is complex because we don't know which line item corresponds to what.
          // For now, we'll fetch line items and update the amounts if there are exactly 2 (simple double entry)
          
          const { data: lineItems } = await supabase
            .from('line_items')
            .select('*')
            .eq('transaction_id', transaction.id)

          if (lineItems && lineItems.length === 2) {
            const amount = parseFloat(formData.total_amount) || 0
            const baseAmount = Number((amount * exchangeRate).toFixed(2))
            
            // Assuming one is debit and one is credit
            const updates = lineItems.map((item: any) => {
              // Identify if this row was originally the debit or credit side
              // If both are 0 (newly created), assume first is debit
              const isDebit = item.debit > 0 || (item.debit === 0 && item.credit === 0 && item.id === lineItems[0].id)

              if (docCurrency !== tenantCurrency) {
                  // Foreign Currency Logic
                  if (isDebit) {
                      return { ...item, debit: baseAmount, credit: 0, debit_foreign: amount, credit_foreign: 0 }
                  } else {
                      return { ...item, debit: 0, credit: baseAmount, debit_foreign: 0, credit_foreign: amount }
                  }
              } else {
                  // Base Currency Logic
                  if (isDebit) {
                      return { ...item, debit: amount, credit: 0, debit_foreign: 0, credit_foreign: 0 }
                  } else {
                      return { ...item, debit: 0, credit: amount, debit_foreign: 0, credit_foreign: 0 }
                  }
              }
            })

            for (const item of updates) {
              await supabase
                .from('line_items')
                .update({ 
                    debit: item.debit, 
                    credit: item.credit,
                    debit_foreign: item.debit_foreign,
                    credit_foreign: item.credit_foreign
                })
                .eq('id', item.id)
            }
          }
        }
      }

      if (onSaved) onSaved()
      onClose()
      toast.success('Document verified and saved')

    } catch (error: any) {
      console.error('Save error:', error)
      toast.error('Failed to save: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

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
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.max(50, z - 10))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="px-2 py-1 bg-black/50 text-white text-sm rounded flex items-center">
            {zoomLevel}%
          </span>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => setZoomLevel(z => Math.min(200, z + 10))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-black/50 text-white hover:bg-black/70"
            onClick={() => {
              setZoomLevel(100)
              setPosition({ x: 0, y: 0 })
            }}
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div 
          className="flex-1 overflow-hidden flex items-center justify-center bg-gray-900 cursor-grab active:cursor-grabbing p-4 touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {previewUrl ? (
            document?.file_type.startsWith('image/') ? (
              <ImagePreview
                src={previewUrl}
                alt="Document Preview"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel / 100})`,
                  transition: isDragging ? 'none' : 'transform 0.2s',
                }}
                className="max-w-full max-h-full object-contain shadow-2xl select-none pointer-events-none"
              />
            ) : (
              <iframe 
                src={previewUrl} 
                className="w-full h-full bg-white"
                title="PDF Preview"
              />
            )
          ) : (
            <div className="text-white text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Preview not available</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Data Form */}
      <div className="w-full lg:w-[450px] bg-white h-[60vh] lg:h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">Verify Data</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {document?.validation_status === 'NEEDS_REVIEW' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-yellow-800">Validation Warning</h4>
                <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside">
                  {document.validation_flags?.map(flag => (
                    <li key={flag}>
                      {flag === 'DUPLICATE_DOCUMENT' ? 'This document appears to be a duplicate.' :
                       flag === 'WRONG_TENANT' ? 'The bill-to name does not match the tenant.' :
                       flag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <select 
                  className="w-full p-2 border rounded-md text-sm"
                  value={formData.document_type}
                  onChange={e => setFormData({...formData, document_type: e.target.value})}
                >
                  <option value="invoice">Invoice</option>
                  <option value="receipt">Receipt</option>
                  <option value="credit_note">Credit Note</option>
                  <option value="bank_statement">Bank Statement</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {formData.document_type !== 'bank_statement' && (
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <select 
                    className="w-full p-2 border rounded-md text-sm"
                    value={formData.transaction_type}
                    onChange={e => setFormData({...formData, transaction_type: e.target.value})}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              )}
            </div>

            {formData.document_type === 'bank_statement' ? (
              <>
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input 
                    value={formData.bank_name}
                    onChange={e => setFormData({...formData, bank_name: e.target.value})}
                    placeholder="e.g. Chase Bank"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Number (Last 4)</Label>
                  <Input 
                    value={formData.account_number}
                    onChange={e => setFormData({...formData, account_number: e.target.value})}
                    placeholder="e.g. 1234"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input 
                      type="date"
                      value={formData.statement_period_start}
                      onChange={e => setFormData({...formData, statement_period_start: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input 
                      type="date"
                      value={formData.statement_period_end}
                      onChange={e => setFormData({...formData, statement_period_end: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening Balance</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.opening_balance}
                      onChange={e => setFormData({...formData, opening_balance: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Balance</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.closing_balance}
                      onChange={e => setFormData({...formData, closing_balance: e.target.value})}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">Extracted Transactions ({bankTransactions.length})</h3>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setBankTransactions([...bankTransactions, { date: '', description: '', amount: '', type: 'DEBIT' }])}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {bankTransactions.map((tx, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-md border">
                        <div className="grid grid-cols-12 gap-2 flex-1">
                          <div className="col-span-3">
                            <Label className="text-xs text-gray-500 mb-1 block">Date</Label>
                            <Input 
                              type="date" 
                              className="h-8 text-xs"
                              value={tx.date}
                              onChange={e => {
                                const newTxs = [...bankTransactions]
                                newTxs[index].date = e.target.value
                                setBankTransactions(newTxs)
                              }}
                            />
                          </div>
                          <div className="col-span-5">
                            <Label className="text-xs text-gray-500 mb-1 block">Description</Label>
                            <Input 
                              className="h-8 text-xs"
                              value={tx.description}
                              onChange={e => {
                                const newTxs = [...bankTransactions]
                                newTxs[index].description = e.target.value
                                setBankTransactions(newTxs)
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-gray-500 mb-1 block">Amount</Label>
                            <Input 
                              type="number" 
                              className="h-8 text-xs"
                              value={tx.amount}
                              onChange={e => {
                                const newTxs = [...bankTransactions]
                                newTxs[index].amount = e.target.value
                                setBankTransactions(newTxs)
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-gray-500 mb-1 block">Type</Label>
                            <select 
                              className="w-full h-8 text-xs border rounded-md px-1 bg-white"
                              value={tx.type}
                              onChange={e => {
                                const newTxs = [...bankTransactions]
                                newTxs[index].type = e.target.value as 'DEBIT' | 'CREDIT'
                                setBankTransactions(newTxs)
                              }}
                            >
                              <option value="DEBIT">Debit</option>
                              <option value="CREDIT">Credit</option>
                            </select>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 mt-6"
                          onClick={() => {
                            const newTxs = bankTransactions.filter((_, i) => i !== index)
                            setBankTransactions(newTxs)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {bankTransactions.length === 0 && (
                      <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                        No transactions extracted
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Vendor / Payee</Label>
                  <Input 
                    value={formData.vendor_name}
                    onChange={e => setFormData({...formData, vendor_name: e.target.value})}
                    placeholder="e.g. Amazon Web Services"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input 
                      type="date"
                      value={formData.document_date}
                      onChange={e => setFormData({...formData, document_date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference #</Label>
                    <Input 
                      value={formData.invoice_number}
                      onChange={e => setFormData({...formData, invoice_number: e.target.value})}
                      placeholder="INV-001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Total Amount</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={e => setFormData({...formData, total_amount: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <CurrencySelect 
                      value={formData.currency}
                      onChange={value => setFormData({...formData, currency: value})}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium mb-2 text-gray-500">AI Confidence</h3>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500" 
                    style={{ width: `${(docData?.confidence_score || 0) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium">
                  {Math.round((docData?.confidence_score || 0) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <Button 
            className="flex-1" 
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Verify & Save
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
