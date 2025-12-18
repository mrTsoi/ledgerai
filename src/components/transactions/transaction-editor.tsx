'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, X, Check, ZoomIn, ZoomOut, RotateCcw, FileText, Info } from 'lucide-react'
import { CurrencySelect } from '@/components/ui/currency-select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"

import { getExchangeRate } from '@/lib/currency'
import { ImagePreview } from '@/components/ui/image-preview'

type Transaction = Database['public']['Tables']['transactions']['Row'] & {
  currency?: string
  exchange_rate?: number
}
type LineItem = Database['public']['Tables']['line_items']['Row'] & {
  debit_foreign?: number
  credit_foreign?: number
}
type Account = Database['public']['Tables']['chart_of_accounts']['Row']

interface TransactionWithLineItems extends Transaction {
  line_items: LineItem[]
}

interface Props {
  transactionId: string
  onClose: () => void
  onSaved: () => void
}

export function TransactionEditor({ transactionId, onClose, onSaved }: Props) {
  const [transaction, setTransaction] = useState<TransactionWithLineItems | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tenantCurrency, setTenantCurrency] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rateFetchFailed, setRateFetchFailed] = useState(false)
  const [rateRetrying, setRateRetrying] = useState(false)

  const retryFetchRate = async () => {
    if (!transaction || !currentTenant) return
    setRateRetrying(true)
    try {
      const { rate: fetched, ok } = await getExchangeRate(transaction.currency || tenantCurrency, tenantCurrency, currentTenant.id)
      if (ok) {
        setTransaction({ ...transaction, exchange_rate: fetched })
        setRateFetchFailed(false)
        toast.success('Exchange rate auto-fetch succeeded')
      } else {
        setRateFetchFailed(true)
        toast.error('Auto-fetch failed — please enter rate manually')
      }
    } catch (e) {
      console.error('Retry fetch failed', e)
      setRateFetchFailed(true)
      toast.error('Auto-fetch failed — please enter rate manually')
    } finally {
      setRateRetrying(false)
    }
  }
  
  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileType, setFileType] = useState<string>('')
  const [zoomLevel, setZoomLevel] = useState(100)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  // Touch state for pinch-to-zoom
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null)
  const [lastZoomLevel, setLastZoomLevel] = useState(100)

  const { currentTenant } = useTenant()
  const supabase = createClient()

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

  // Touch Event Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - start dragging
      setIsDragging(true)
      setDragStart({ 
        x: e.touches[0].clientX - position.x, 
        y: e.touches[0].clientY - position.y 
      })
    } else if (e.touches.length === 2) {
      // Two touches - start pinch/zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      setInitialPinchDistance(dist)
      setLastZoomLevel(zoomLevel)
      
      // Also track center for panning with two fingers
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      setDragStart({ 
        x: centerX - position.x, 
        y: centerY - position.y 
      })
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // e.preventDefault() - Removed to avoid passive event listener error. 
    // 'touch-none' CSS class handles scroll prevention.
    
    if (e.touches.length === 1 && isDragging) {
      // Single touch pan
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      })
    } else if (e.touches.length === 2 && initialPinchDistance !== null) {
      // Two touch pinch zoom & pan
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      
      // 1. Calculate new zoom
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)
      const scaleFactor = dist / initialPinchDistance
      const newZoom = Math.min(Math.max(lastZoomLevel * scaleFactor, 50), 300) // Limit zoom 50% - 300%
      setZoomLevel(newZoom)
      
      // 2. Calculate new position (pan)
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      
      if (isDragging) {
        setPosition({
          x: centerX - dragStart.x,
          y: centerY - dragStart.y
        })
      }
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    setInitialPinchDistance(null)
    setLastZoomLevel(zoomLevel)
  }

  const fetchTransaction = useCallback(async () => {
    try {
      // 1. Fetch Transaction with related line_items and document_data to avoid multiple round-trips
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select(`
          *,
          documents (
            file_path,
            file_type,
            document_data (
              currency,
              confidence_score,
              total_amount,
              extracted_data
            )
          ),
          line_items (*)
        `)
        .eq('id', transactionId)
        .single()

      if (txError) throw txError

      const tx = txData as TransactionWithLineItems
      const lineData = tx?.line_items || []

      // Extract currency from related document_data if available
      let extractedCurrency = null
      const docRel = tx?.documents
      const doc = Array.isArray(docRel) ? docRel[0] : docRel
      const rawDocData = doc?.document_data
      const docData = Array.isArray(rawDocData) ? rawDocData[0] : rawDocData
      if (docData?.currency) extractedCurrency = docData.currency
      else if (docData?.extracted_data && (docData.extracted_data as { currency?: string }).currency) extractedCurrency = (docData.extracted_data as { currency?: string }).currency

      // 3. Ensure we have tenant currency before auto-fetching rates
      let currentTenantCurrency = tenantCurrency
      if (!currentTenantCurrency && currentTenant) {
        if (currentTenant?.currency) {
          currentTenantCurrency = currentTenant.currency
        } else {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('currency')
            .eq('id', currentTenant.id)
            .single()
          if (tenantData?.currency) currentTenantCurrency = tenantData.currency
        }
        if (currentTenantCurrency) setTenantCurrency(currentTenantCurrency)
      }
      
      // Fallback to USD only if we really couldn't find anything
      if (!currentTenantCurrency) currentTenantCurrency = 'USD'

      // 4. Process Line Items (Fix for Foreign Currency Extraction)
      // If transaction is foreign but line items lack foreign amounts, 
      // assume the stored 'debit'/'credit' are actually the foreign face values.
      
      // Determine effective currency: prefer document data (structured then extracted), then transaction, then tenant
      const txCurrency = txData?.currency
      const effectiveCurrency = docData?.currency || (docData?.extracted_data as { currency?: string } | null)?.currency || txCurrency || currentTenantCurrency
      
      const isForeign = effectiveCurrency && effectiveCurrency !== currentTenantCurrency
      let rate = txData.exchange_rate || 1.0

      // Auto-fetch rate if it looks like a default (1.0) for a foreign transaction
      if (isForeign && rate === 1.0 && currentTenant) {
        try {
           const { rate: fetchedRate, ok } = await getExchangeRate(effectiveCurrency, currentTenantCurrency, currentTenant.id)
           if (ok && fetchedRate !== 1.0) {
             rate = fetchedRate
             setRateFetchFailed(false)
           } else if (!ok) {
             setRateFetchFailed(true)
           }
        } catch (e) {
           console.error('Auto-fetch rate failed', e)
           setRateFetchFailed(true)
        }
      }

      const processedLines = (lineData || []).map((line: any) => {
        if (isForeign) {
           const hasForeign = line.debit_foreign || line.credit_foreign
           if (!hasForeign) {
             // Migration/Fix: Move 'debit' to 'debit_foreign'
             const foreignDebit = line.debit || 0
             const foreignCredit = line.credit || 0
             
             return {
               ...line,
               debit_foreign: foreignDebit,
               credit_foreign: foreignCredit,
               // Recalculate Base Amount = Foreign * Rate
               debit: Number((foreignDebit * rate).toFixed(2)),
               credit: Number((foreignCredit * rate).toFixed(2))
             }
           }
        }
        return line
      })

      setTransaction({
        ...txData,
        currency: effectiveCurrency, // Ensure currency is populated
        exchange_rate: rate,
        line_items: processedLines
      })

      // Fetch document preview if exists
      if (txData?.document_id) {
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .select('file_path, file_type')
          .eq('id', txData.document_id)
          .single()

        if (doc && !docError) {
           const { data: blob } = await supabase.storage
            .from('documents')
            .download(doc.file_path as string)
           
           if (blob) {
             setPreviewUrl(URL.createObjectURL(blob))
             setFileType(doc.file_type)
           }
        }
      }

    } catch (error) {
      console.error('Error fetching transaction:', error)
    } finally {
      setLoading(false)
    }
  }, [currentTenant, supabase, tenantCurrency, transactionId])

  const fetchAccounts = useCallback(async () => {
    if (!currentTenant) return

    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .eq('is_active', true)
        .order('code')

      if (error) throw error
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }, [currentTenant, supabase])

  useEffect(() => {
    if (currentTenant && transactionId) {
      fetchTransaction()
      fetchAccounts()
      // Fetch tenant currency
        if (currentTenant?.currency) {
        setTenantCurrency(currentTenant.currency)
      } else {
        // Fallback fetch if not in context yet
        supabase.from('tenants').select('currency').eq('id', currentTenant.id).single()
          .then(({ data }: any) => {
            if (data?.currency) setTenantCurrency(data.currency)
          })
      }
    }
  }, [currentTenant, transactionId, fetchTransaction, fetchAccounts, supabase])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleCurrencyChange = async (newCurrency: string) => {
    if (!transaction) return
    
    // 1. Determine the source amounts (what the user sees as the "face value")
    // If we are currently in Base mode, the source is 'debit'.
    // If we are currently in Foreign mode, the source is 'debit_foreign'.
    const isCurrentlyBase = !transaction.currency || transaction.currency === tenantCurrency
    
    // 2. Determine the new rate
    let newRate = 1.0
    if (newCurrency !== tenantCurrency) {
      try {
        const { rate: fetched, ok } = await getExchangeRate(newCurrency, tenantCurrency, currentTenant?.id)
        newRate = fetched
        setRateFetchFailed(!ok)
      } catch (error) {
        console.error('Error fetching rate:', error)
        setRateFetchFailed(true)
      }
    } else {
      setRateFetchFailed(false)
    }

    // 3. Calculate new line items
    const updatedLineItems = transaction.line_items.map(item => {
      let sourceDebit = isCurrentlyBase ? item.debit : (item.debit_foreign || 0)
      let sourceCredit = isCurrentlyBase ? item.credit : (item.credit_foreign || 0)

      // Fallback for legacy/migration data: 
      // If we are in foreign mode but foreign amount is missing, assume the existing base amount 
      // is actually the intended foreign amount (face value) that hasn't been migrated yet.
      if (!isCurrentlyBase) {
        if (!sourceDebit && item.debit) sourceDebit = item.debit
        if (!sourceCredit && item.credit) sourceCredit = item.credit
      }

      // Ensure we are working with numbers
      sourceDebit = Number(sourceDebit) || 0
      sourceCredit = Number(sourceCredit) || 0

      if (newCurrency === tenantCurrency) {
        // Switching TO Base
        return {
          ...item,
          debit: sourceDebit,
          credit: sourceCredit,
          debit_foreign: 0,
          credit_foreign: 0
        }
      } else {
        // Switching TO Foreign
        return {
          ...item,
          debit_foreign: sourceDebit,
          credit_foreign: sourceCredit,
          debit: Number((sourceDebit * newRate).toFixed(2)),
          credit: Number((sourceCredit * newRate).toFixed(2))
        }
      }
    })

    setTransaction({
      ...transaction,
      currency: newCurrency,
      exchange_rate: newRate,
      line_items: updatedLineItems
    })
  }

  const handleRateChange = (newRate: number) => {
    if (!transaction) return
    
    const updatedLineItems = transaction.line_items.map(item => ({
      ...item,
      debit: item.debit_foreign ? Number((Number(item.debit_foreign) * newRate).toFixed(2)) : 0,
      credit: item.credit_foreign ? Number((Number(item.credit_foreign) * newRate).toFixed(2)) : 0
    }))

    setTransaction({
      ...transaction,
      exchange_rate: newRate,
      line_items: updatedLineItems
    })
  }

  const [autoBalance, setAutoBalance] = useState(true)

  const updateLineItem = (index: number, field: string, value: any) => {
    if (!transaction) return

    let updatedLineItems = [...transaction.line_items]
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value
    }

    const rate = transaction.exchange_rate || 1.0
    const isForeign = transaction.currency && transaction.currency !== tenantCurrency

    // Helper to update base/foreign pair
    const updatePair = (idx: number, type: 'debit' | 'credit', val: number) => {
       if (isForeign) {
         if (type === 'debit') {
            updatedLineItems[idx].debit_foreign = val
            updatedLineItems[idx].debit = Number((val * rate).toFixed(2))
            if (val > 0) {
               updatedLineItems[idx].credit_foreign = 0
               updatedLineItems[idx].credit = 0
            }
         } else {
            updatedLineItems[idx].credit_foreign = val
            updatedLineItems[idx].credit = Number((val * rate).toFixed(2))
            if (val > 0) {
               updatedLineItems[idx].debit_foreign = 0
               updatedLineItems[idx].debit = 0
            }
         }
       } else {
         if (type === 'debit') {
            updatedLineItems[idx].debit = val
            if (val > 0) updatedLineItems[idx].credit = 0
         } else {
            updatedLineItems[idx].credit = val
            if (val > 0) updatedLineItems[idx].debit = 0
         }
       }
    }

    // 1. Update the modified line
    if (field === 'debit' || field === 'credit' || field === 'debit_foreign' || field === 'credit_foreign') {
       const numVal = parseFloat(value) || 0
       // Map field to type
       const type = field.includes('debit') ? 'debit' : 'credit'
       updatePair(index, type, numVal)

       // 2. Auto-balance logic
       // Only applies if we have exactly 2 lines, and we are editing an amount
       if (autoBalance && transaction.line_items.length === 2) {
          const otherIndex = index === 0 ? 1 : 0
          const currentLine = updatedLineItems[index]
          const otherLine = updatedLineItems[otherIndex]
          
          // If current line is Debit, make other line Credit with same amount
          // Check if current line has Debit value
          const currentDebit = isForeign ? currentLine.debit_foreign : currentLine.debit
          const currentCredit = isForeign ? currentLine.credit_foreign : currentLine.credit
          
          if ((currentDebit || 0) > 0) {
             updatePair(otherIndex, 'credit', currentDebit || 0)
          } else if ((currentCredit || 0) > 0) {
             updatePair(otherIndex, 'debit', currentCredit || 0)
          }
       }
    } else {
       // Non-amount field update (e.g. account_id)
       // No special logic needed
    }

    setTransaction({
      ...transaction,
      line_items: updatedLineItems
    })
  }

  const addLineItem = async () => {
    if (!transaction) return
    
    try {
      setSaving(true)
      // Create a new line item locally (don't insert to DB yet) to avoid DB check constraint
      const clientId = `new-${Date.now()}`
      const newLine: any = {
        id: clientId,
        __clientId: clientId,
        transaction_id: transaction.id,
        account_id: accounts[0]?.id || null,
        debit: 0,
        credit: 0,
        description: 'New line item'
      }

      setTransaction({
        ...transaction,
        line_items: [...transaction.line_items, newLine]
      })

      // Disable auto-balance if we have more than 2 lines now
      if (transaction.line_items.length + 1 > 2) {
        setAutoBalance(false)
      }
    } catch (error: any) {
      console.error('Error adding line item:', error)
      toast.error('Failed to add line item: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const saveTransaction = async () => {
    if (!transaction) return

    try {
      setSaving(true)

      // Update transaction
      const { error: txError } = await supabase
        .from('transactions')
        .update({
          transaction_date: transaction.transaction_date,
          description: transaction.description,
          reference_number: transaction.reference_number,
          notes: transaction.notes,
          currency: transaction.currency,
          exchange_rate: transaction.exchange_rate
        })
        .eq('id', transaction.id)

      if (txError) throw txError

      // Update line items
      // Separate new lines (created locally) from existing DB lines
      const newLines = transaction.line_items.filter(l => typeof l.id === 'string' && l.id.startsWith('new-'))
      const existingLines = transaction.line_items.filter(l => !(typeof l.id === 'string' && l.id.startsWith('new-')))

      // Insert new lines to DB one-by-one and replace in state
      for (const nl of newLines) {
        const payload: any = {
          transaction_id: nl.transaction_id,
          account_id: nl.account_id,
          debit: nl.debit || 0,
          credit: nl.credit || 0,
          description: nl.description || null
        }
        const { data: inserted, error: insertErr } = await supabase.from('line_items').insert(payload).select().single()

        if (insertErr) throw insertErr

        // Replace the temp line in transaction.line_items with the inserted row
        transaction.line_items = transaction.line_items.map(li => (li.id === nl.id ? inserted : li))
      }

      // Update existing lines
      for (const line of existingLines) {
        const { error: lineError } = await supabase
          .from('line_items')
          .update({
            account_id: line.account_id,
            debit: line.debit,
            credit: line.credit,
            debit_foreign: line.debit_foreign,
            credit_foreign: line.credit_foreign,
            description: line.description
          })
          .eq('id', line.id)

        if (lineError) throw lineError
      }

      onSaved()
      toast.success('Transaction saved successfully')
    } catch (error: any) {
      console.error('Error saving transaction:', error)
      toast.error('Failed to save: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const postTransaction = async () => {
    if (!transaction) return

    // Validate balance
    const totalDebits = transaction.line_items.reduce((sum, li) => sum + li.debit, 0)
    const totalCredits = transaction.line_items.reduce((sum, li) => sum + li.credit, 0)

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      toast.error('Transaction is not balanced!', {
        description: `Debits: $${totalDebits.toFixed(2)} | Credits: $${totalCredits.toFixed(2)}`
      })
      return
    }

    if (!confirm('Post this transaction? This action cannot be easily undone.')) return

    try {
      setSaving(true)

      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'POSTED',
          posted_by: user?.id || null,
          posted_at: new Date().toISOString()
        })
        .eq('id', transaction.id)

      if (error) throw error

      onSaved()
      toast.success('Transaction posted successfully')
    } catch (error: any) {
      console.error('Error posting transaction:', error)
      toast.error('Failed to post: ' + error.message)
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

  if (!transaction) {
    return <div className="p-4 text-center text-gray-500">Transaction not found</div>
  }

  const totalDebits = transaction.line_items.reduce((sum, li) => sum + li.debit, 0)
  const totalCredits = transaction.line_items.reduce((sum, li) => sum + li.credit, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-black/80 backdrop-blur-sm">
      {/* Left Pane: Preview (Only if document exists) */}
      {previewUrl ? (
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
            {fileType.startsWith('image/') ? (
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
            )}
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-900 text-white">
          <div className="text-center opacity-50">
            <FileText className="w-16 h-16 mx-auto mb-4" />
            <p>No source document attached</p>
          </div>
        </div>
      )}

      {/* Right Pane: Editor Form */}
      <div className="w-full lg:w-[600px] bg-white h-[60vh] lg:h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="font-semibold text-lg">Edit Transaction</h2>
            <p className="text-xs text-gray-500">
              Status: <span className={`font-medium ${
                transaction.status === 'POSTED' ? 'text-green-600' : 
                transaction.status === 'VOID' ? 'text-red-600' : 'text-yellow-600'
              }`}>{transaction.status}</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Transaction Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={transaction.transaction_date}
                onChange={(e) => setTransaction({ ...transaction, transaction_date: e.target.value })}
                disabled={transaction.status === 'POSTED'}
              />
            </div>
            <div>
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                value={transaction.reference_number || ''}
                onChange={(e) => setTransaction({ ...transaction, reference_number: e.target.value })}
                disabled={transaction.status === 'POSTED'}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={transaction.description || ''}
              onChange={(e) => setTransaction({ ...transaction, description: e.target.value })}
              disabled={transaction.status === 'POSTED'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="currency">Currency</Label>
              <CurrencySelect
                value={transaction.currency || tenantCurrency}
                onChange={(value) => handleCurrencyChange(value)}
                className="h-10"
              />
            </div>
            {transaction.currency && transaction.currency !== tenantCurrency && (
              <div>
                <Label htmlFor="exchange_rate">Exchange Rate (1 {transaction.currency} = ? {tenantCurrency})</Label>
                {rateFetchFailed && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm text-red-600">Auto-fetch failed — please enter the exchange rate manually.</div>
                    <Button size="sm" variant="outline" onClick={retryFetchRate} disabled={rateRetrying}>
                      {rateRetrying ? 'Retrying...' : 'Retry'}
                    </Button>
                  </div>
                )}
                <Input
                  id="exchange_rate"
                  type="number"
                  step="0.000001"
                  value={transaction.exchange_rate ?? ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    handleRateChange(isNaN(val) ? 0 : val)
                  }}
                  onFocus={(e) => e.target.select()}
                  disabled={transaction.status === 'POSTED'}
                  className={rateFetchFailed ? 'border-red-500' : ''}
                />
              </div>
            )}
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-medium">Line Items</h3>
                {transaction.line_items.length === 2 && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="autoBalance"
                      checked={autoBalance}
                      onChange={(e) => setAutoBalance(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="autoBalance" className="text-xs font-normal text-gray-500 cursor-pointer flex items-center gap-1">
                      Auto-balance
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-gray-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="w-[200px] text-xs">When enabled, editing one side (Debit/Credit) automatically updates the other side to keep the transaction balanced.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                  </div>
                )}
              </div>
              {transaction.status === 'DRAFT' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={addLineItem}
                  title="Add Line Item"
                >
                  Add Line
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {transaction.line_items.map((line, index) => {
                const account = accounts.find(a => a.id === line.account_id)
                const isForeign = transaction.currency && transaction.currency !== tenantCurrency
                
                return (
                  <div key={line.id} className="grid grid-cols-12 gap-2 p-3 border rounded-lg bg-gray-50/50">
                    <div className="col-span-12 md:col-span-4">
                      <Label className="text-xs text-gray-500">Account</Label>
                      <select
                        value={line.account_id ?? undefined}
                        onChange={(e) => updateLineItem(index, 'account_id', e.target.value)}
                        disabled={transaction.status === 'POSTED'}
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                      >
                        <option value="">Select account...</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {isForeign ? (
                      <>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs text-gray-500">Debit ({transaction.currency})</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.debit_foreign || 0}
                            onChange={(e) => updateLineItem(index, 'debit_foreign', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            disabled={transaction.status === 'POSTED'}
                            className="text-sm h-8"
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs text-gray-500">Credit ({transaction.currency})</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.credit_foreign || 0}
                            onChange={(e) => updateLineItem(index, 'credit_foreign', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            disabled={transaction.status === 'POSTED'}
                            className="text-sm h-8"
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs text-gray-500">Debit ({tenantCurrency})</Label>
                          <div className="text-sm h-8 flex items-center px-3 bg-gray-100 rounded border text-gray-600">
                            {line.debit?.toFixed(2)}
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Label className="text-xs text-gray-500">Credit ({tenantCurrency})</Label>
                          <div className="text-sm h-8 flex items-center px-3 bg-gray-100 rounded border text-gray-600">
                            {line.credit?.toFixed(2)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-5 md:col-span-3">
                          <Label className="text-xs text-gray-500">Debit</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => updateLineItem(index, 'debit', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            disabled={transaction.status === 'POSTED'}
                            className="text-sm h-8"
                          />
                        </div>
                        <div className="col-span-5 md:col-span-3">
                          <Label className="text-xs text-gray-500">Credit</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => updateLineItem(index, 'credit', parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            disabled={transaction.status === 'POSTED'}
                            className="text-sm h-8"
                          />
                        </div>
                        <div className="col-span-2 md:col-span-2 flex items-end justify-center pb-2">
                          <div className={`w-3 h-3 rounded-full ${line.debit === line.credit ? 'bg-red-500' : 'bg-green-500'}`} title={line.debit === line.credit ? 'Zero amount' : 'Active'} />
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-between items-center p-4 bg-gray-100 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">Total Debits: <span className="font-medium">${totalDebits.toFixed(2)}</span></p>
              <p className="text-sm text-gray-600">Total Credits: <span className="font-medium">${totalCredits.toFixed(2)}</span></p>
            </div>
            <div>
              {isBalanced ? (
                <div className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded">
                  <Check className="w-4 h-4 mr-1" />
                  <span className="text-sm font-medium">Balanced</span>
                </div>
              ) : (
                <div className="text-red-600 font-medium text-sm bg-red-50 px-2 py-1 rounded">
                  Diff: ${Math.abs(totalDebits - totalCredits).toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-gray-50 flex gap-3">
          {transaction.status === 'DRAFT' ? (
            <>
              <Button className="flex-1" variant="outline" onClick={saveTransaction} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Draft
              </Button>
              <Button className="flex-1" onClick={postTransaction} disabled={saving || !isBalanced} variant="default">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Post
              </Button>
            </>
          ) : (
            <Button className="w-full" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
