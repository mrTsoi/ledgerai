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
import { useLiterals } from '@/hooks/use-literals'
import VerificationResultModal from './verification-result-modal'
import validateDocument from '@/lib/validation/documentValidation'
import deriveStatementFromTransactions from '@/lib/documents/statement-derivation'

type Document = Database['public']['Tables']['documents']['Row']
type DocumentData = Database['public']['Tables']['document_data']['Row']

interface Props {
  documentId: string
  onClose: () => void
  onSaved?: () => void
}

export function DocumentVerificationModal({ documentId, onClose, onSaved }: Props) {
  const lt = useLiterals()
  const ltVars = (english: string, vars?: Record<string, string | number>) => lt(english, vars)

  const [document, setDocument] = useState<Document | null>(null)
  const [docData, setDocData] = useState<DocumentData | null>(null)
  const [tenantCandidates, setTenantCandidates] = useState<Array<any>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<null | {
    bankAccountId?: string | null
    bankStatementId?: string | null
    transactionsInserted?: number
    transactionId?: string | null
    transactionStatus?: string | null
    message?: string
  }>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; missingFields: string[]; messages: string[] }>({ isValid: true, missingFields: [], messages: [] })
  const [showValidationModal, setShowValidationModal] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [formData, setFormData] = useState({
    vendor_name: '',
    customer_name: '',
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
    balance?: string
    type: 'DEBIT' | 'CREDIT'
  }>>([])

  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Touch state for pinch-to-zoom
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null)
  const [lastZoomLevel, setLastZoomLevel] = useState(100)

  const [derivedFields, setDerivedFields] = useState<{ start?: boolean; end?: boolean; opening?: boolean; closing?: boolean }>({})

  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return ''
    const cleanStr = (String(dateStr) || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) return cleanStr
    if (/^\d{4}-\d{2}-\d{2}T/.test(cleanStr)) return cleanStr.split('T')[0]
    const d = new Date(cleanStr)
    if (isNaN(d.getTime())) return ''
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const fetchDocumentDetails = useCallback(async () => {
    try {
      setLoading(true)

      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (docError) throw docError
      setDocument(doc)

      // Fetch document_data separately
      const { data: dData, error: dataError } = await supabase
        .from('document_data')
        .select('*')
        .eq('document_id', documentId)
        .maybeSingle()

      if (dataError) throw dataError

      // Load preview from storage
      try {
        const { data: blob, error: storageError } = await supabase.storage
          .from('documents')
          .download(doc!.file_path)
        if (!storageError && blob) setPreviewUrl(URL.createObjectURL(blob))
      } catch (e) {
        // ignore preview errors
      }

      if (dData) {
        setDocData(dData)
        const extracted = (dData.extracted_data as unknown as Record<string, any>) || {}
        const rawDate = dData.document_date ?? extracted.document_date

        setFormData({
          vendor_name: dData.vendor_name ?? extracted.vendor_name ?? '',
          customer_name: dData.customer_name ?? extracted.customer_name ?? '',
          document_date: formatDate(rawDate),
          total_amount: dData.total_amount?.toString() ?? extracted.total_amount?.toString() ?? '',
          currency: dData.currency ?? extracted.currency ?? 'USD',
          invoice_number: extracted.invoice_number ?? '',
          document_type: doc!.document_type ?? extracted.document_type ?? 'invoice',
          transaction_type: extracted.transaction_type ?? 'expense',
          statement_period_start: extracted.statement_period_start || '',
          statement_period_end: extracted.statement_period_end || '',
          opening_balance: extracted.opening_balance?.toString() || '',
          closing_balance: extracted.closing_balance?.toString() || '',
          bank_name: extracted.bank_name || '',
          account_number: extracted.account_number || ''
        })

        if (extracted.bank_transactions && Array.isArray(extracted.bank_transactions)) {
          setBankTransactions(extracted.bank_transactions.map((t: unknown) => {
            const tx = t as Record<string, any>
            return {
              date: tx.date || '',
              description: tx.description || '',
              amount: (tx.amount ?? '').toString(),
              balance: (tx.balance ?? tx.running_balance ?? tx.runningBalance ?? tx.amount ?? '').toString(),
              type: tx.type === 'CREDIT' ? 'CREDIT' : 'DEBIT'
            }
          }))
        } else {
          setBankTransactions([])
        }

        // Derive statement-level defaults from transactions via shared util
        try {
          const txs = (extracted.bank_transactions && Array.isArray(extracted.bank_transactions)) ? extracted.bank_transactions as any[] : []
          if (txs.length > 0) {
            const derived = deriveStatementFromTransactions({
              statement_period_start: extracted.statement_period_start,
              statement_period_end: extracted.statement_period_end,
              opening_balance: extracted.opening_balance,
              closing_balance: extracted.closing_balance
            }, txs)

            setFormData(fd => ({
              ...fd,
              statement_period_start: fd.statement_period_start || (derived.statement_period_start ? String(derived.statement_period_start) : ''),
              statement_period_end: fd.statement_period_end || (derived.statement_period_end ? String(derived.statement_period_end) : ''),
              opening_balance: fd.opening_balance || (derived.opening_balance !== null && derived.opening_balance !== undefined ? String(derived.opening_balance) : ''),
              closing_balance: fd.closing_balance || (derived.closing_balance !== null && derived.closing_balance !== undefined ? String(derived.closing_balance) : '')
            }))

            setDerivedFields(derived.derived)
          }
        } catch (e) {
          console.error('Error deriving statement fields:', e)
        }

        // Fetch tenant candidates (if any)
        try {
          const { data: candidates } = await supabase
            .from('document_tenant_candidates')
            .select('candidate_tenant_id, suggested_tenant_name, confidence, reasons')
            .eq('document_id', documentId)

          const rows = Array.isArray(candidates) ? candidates : []
          // Enrich with tenant names for display
          const tenantIds = rows.map((r: any) => r.candidate_tenant_id).filter(Boolean)
          if (tenantIds.length > 0) {
            const { data: tenants } = await supabase
              .from('tenants')
              .select('id, name')
              .in('id', tenantIds)
            const nameMap = new Map<string, string>()
            if (Array.isArray(tenants)) tenants.forEach((t: any) => nameMap.set(String(t.id), t.name))
            const enriched = rows.map((r: any) => ({
              ...r,
              tenantName: r.candidate_tenant_id ? nameMap.get(String(r.candidate_tenant_id)) : null
            }))
            setTenantCandidates(enriched)
          } else {
            setTenantCandidates(rows)
          }
        } catch (e) {
          setTenantCandidates([])
        }
      } else {
        setDocData(null)
        setBankTransactions([])
        setTenantCandidates([])
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

  useEffect(() => {
    const res = validateDocument(formData, bankTransactions)
    setValidationResult(res)
  }, [formData, bankTransactions])

  // Ensure missing statement-level fields are auto-filled when transactions load/changed.
  useEffect(() => {
    if (formData.document_type !== 'bank_statement') return
    if (!bankTransactions || bankTransactions.length === 0) return

    const first = bankTransactions[0]
    const last = bankTransactions[bankTransactions.length - 1]

    setFormData(fd => {
      let changed = false
      const next = { ...fd }

      if ((!next.statement_period_start || String(next.statement_period_start).trim() === '') && (first?.date)) {
        next.statement_period_start = String(first.date)
        changed = true
      }
      if ((!next.statement_period_end || String(next.statement_period_end).trim() === '') && (last?.date)) {
        next.statement_period_end = String(last.date)
        changed = true
      }
      if ((next.opening_balance === '0' || next.opening_balance === null || String(next.opening_balance).trim() === '') && ((first?.balance !== undefined && first?.balance !== null && String(first.balance).trim() !== '') || (first?.amount !== undefined && first?.amount !== null && String(first.amount).trim() !== ''))) {
        next.opening_balance = String(first.balance ?? first.amount)
        changed = true
      }
      if ((next.closing_balance === '0' || next.closing_balance === null || String(next.closing_balance).trim() === '') && ((last?.balance !== undefined && last?.balance !== null && String(last.balance).trim() !== '') || (last?.amount !== undefined && last?.amount !== null && String(last.amount).trim() !== ''))) {
        next.closing_balance = String(last.balance ?? last.amount)
        changed = true
      }

      return changed ? next : fd
    })
    // Also set derived flags for UI indication (ensure booleans)
    setDerivedFields({
      start: (!formData.statement_period_start || String(formData.statement_period_start).trim() === '') && !!(first?.date),
      end: (!formData.statement_period_end || String(formData.statement_period_end).trim() === '') && !!(last?.date),
      opening: (formData.opening_balance === undefined || formData.opening_balance === null || String(formData.opening_balance).trim() === '') && ((first?.balance !== undefined && first?.balance !== null) || (first?.amount !== undefined && first?.amount !== null)),
      closing: (formData.closing_balance === undefined || formData.closing_balance === null || String(formData.closing_balance).trim() === '') && ((last?.balance !== undefined && last?.balance !== null) || (last?.amount !== undefined && last?.amount !== null))
    })
  }, [bankTransactions, formData.document_type, formData.statement_period_start, formData.statement_period_end, formData.opening_balance, formData.closing_balance])

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

  const handleSave = async (forceSave = false) => {
    if (!document) return
    // Ensure we have the latest fetched document data before validating
    if (!docData) {
      try {
        await fetchDocumentDetails()
      } catch (e) {
        // ignore
      }
    }

    // If this is a bank statement, derive missing statement-level fields from
    // the first/last extracted transactions so validation can consider them.
    let modifiedForm = { ...formData }
    if (formData.document_type === 'bank_statement') {
      try {
        const txs = Array.isArray(bankTransactions) ? bankTransactions : []
        if (txs.length > 0) {
          const first = txs[0]
          const last = txs[txs.length - 1]
          const derivedStart = modifiedForm.statement_period_start || first?.date || ''
          const derivedEnd = modifiedForm.statement_period_end || last?.date || ''
          const derivedOpening = (modifiedForm.opening_balance !== undefined && modifiedForm.opening_balance !== '') ? modifiedForm.opening_balance : (first?.amount ?? '')
          const derivedClosing = (modifiedForm.closing_balance !== undefined && modifiedForm.closing_balance !== '') ? modifiedForm.closing_balance : (last?.amount ?? '')

          modifiedForm = {
            ...modifiedForm,
            statement_period_start: String(derivedStart || ''),
            statement_period_end: String(derivedEnd || ''),
            opening_balance: String(derivedOpening !== undefined && derivedOpening !== null ? derivedOpening : ''),
            closing_balance: String(derivedClosing !== undefined && derivedClosing !== null ? derivedClosing : '')
          }
        }
      } catch (e) {
        // ignore derivation errors
        console.error('Error deriving statement fields for save validation:', e);
      }
    }

    // Run validation and block if missing required fields unless forceSave is true
    const currentValidation = validateDocument(modifiedForm, bankTransactions)
    setValidationResult(currentValidation)
    if (!currentValidation.isValid && !forceSave) {
      // Show a modal that lists missing fields and lets the user either fill them
      // or explicitly force-save. This is more visible than a toast.
      setValidationResult(currentValidation)
      setShowValidationModal(true)
      return
    }

    try {
      setSaving(true)
      let shouldClose = true
      const usedForceSave = !validationResult.isValid && forceSave

      const updateData = {
        vendor_name: formData.vendor_name,
        document_date: formData.document_date || null,
        total_amount: parseFloat(formData.total_amount) || 0,
        currency: formData.currency,
        extracted_data: {
          ...((docData?.extracted_data as unknown as Record<string, any>) || {}),
          vendor_name: modifiedForm.vendor_name,
          document_date: modifiedForm.document_date,
          total_amount: parseFloat(modifiedForm.total_amount) || 0,
          currency: modifiedForm.currency,
          invoice_number: modifiedForm.invoice_number,
          document_type: modifiedForm.document_type,
          transaction_type: modifiedForm.transaction_type,
          // Bank Statement Fields (use derived values if necessary)
          statement_period_start: modifiedForm.statement_period_start,
          statement_period_end: modifiedForm.statement_period_end,
          opening_balance: modifiedForm.opening_balance !== '' ? parseFloat(modifiedForm.opening_balance) || 0 : 0,
          closing_balance: modifiedForm.closing_balance !== '' ? parseFloat(modifiedForm.closing_balance) || 0 : 0,
          bank_name: modifiedForm.bank_name,
          account_number: modifiedForm.account_number,
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

        const result: any = { bankAccountId: null, bankStatementId: null, transactionsInserted: 0 }

        if (existingStatement) {
              // Update statement details (use derived values from modifiedForm)
              await supabase
                .from('bank_statements')
                .update({
                  start_date: modifiedForm.statement_period_start || null,
                  end_date: modifiedForm.statement_period_end || null,
                  statement_date: modifiedForm.statement_period_end || null,
                  opening_balance: parseFloat(modifiedForm.opening_balance) || 0,
                  closing_balance: parseFloat(modifiedForm.closing_balance) || 0,
                })
                .eq('id', existingStatement.id)

          // Delete pending transactions to resync, then insert verified ones
          try {
            await supabase.from('bank_transactions').delete().eq('bank_statement_id', existingStatement.id)
          } catch (e) {
            // ignore
          }

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
              confidence_score: 1.0
            }))

            const { error: insertErr } = await supabase.from('bank_transactions').insert(txsToInsert)
            if (!insertErr) result.transactionsInserted = txsToInsert.length
          }

          // Fetch linked bank account id for display
          try {
            const { data: stmtRow } = await supabase.from('bank_statements').select('id,bank_account_id').eq('document_id', document.id).maybeSingle()
            result.bankStatementId = stmtRow?.id ?? existingStatement.id
            result.bankAccountId = stmtRow?.bank_account_id ?? null
          } catch (e) {
            result.bankStatementId = existingStatement.id
          }
        } else {
          // No existing bank_statement record — create one and associated records
          if (!currentTenant?.id) throw new Error('No tenant selected')

          let bankAccountId: string | null = null

          // Try to find existing bank account by account number or bank name
          try {
            let query: any = supabase
              .from('bank_accounts')
              .select('id')
              .eq('tenant_id', currentTenant.id)
              .eq('is_active', true)

            if (modifiedForm.account_number) {
              query = query.ilike('account_number', `%${modifiedForm.account_number}%`)
            } else if (modifiedForm.bank_name) {
              query = query.ilike('bank_name', `%${modifiedForm.bank_name}%`)
            }

            const { data: accounts } = await query.limit(1)
            if (accounts && accounts.length > 0) bankAccountId = accounts[0].id
          } catch (e) {
            console.warn('Failed to query bank accounts', e)
          }

          // Create bank account if not found and we have identifying info
          if (!bankAccountId && (modifiedForm.account_number || modifiedForm.bank_name)) {
            try {
              const { data: newAccount, error: accError } = await supabase
                .from('bank_accounts')
                .insert({
                  tenant_id: currentTenant.id,
                  account_name: `${modifiedForm.bank_name || 'Bank'}${modifiedForm.account_number ? ' - ' + modifiedForm.account_number : ''}`,
                  bank_name: modifiedForm.bank_name || 'Unknown Bank',
                  account_number: modifiedForm.account_number || null,
                  currency: modifiedForm.currency || 'USD',
                  is_active: true
                })
                .select()
                .single()

              if (!accError && newAccount) bankAccountId = newAccount.id
            } catch (e) {
              console.warn('Failed to create bank account', e)
            }
          }

          // If we couldn't find or create a bank account, prompt user before
          // creating an unlinked bank_statement so we don't silently import
          // unlinked transactions.
          if (!bankAccountId && (modifiedForm.account_number || modifiedForm.bank_name)) {
            setValidationResult({ isValid: false, missingFields: ['bank_account'], messages: [lt('No matching bank account found. Save without linking?')] })
            setShowValidationModal(true)
            console.warn('No bank account info provided, showValidationModal', modifiedForm.account_number, modifiedForm.bank_name);
            return
          }else{
            console.warn('No bank account info provided, creating unlinked bank statement', modifiedForm.account_number, modifiedForm.bank_name);
          }

          // Create the bank_statement record
          try {
            const { data: stmt, error: stmtError } = await supabase
              .from('bank_statements')
              .insert({
                tenant_id: currentTenant.id,
                document_id: document.id,
                bank_account_id: bankAccountId,
                statement_date: modifiedForm.statement_period_end || null,
                start_date: modifiedForm.statement_period_start || null,
                end_date: modifiedForm.statement_period_end || null,
                opening_balance: parseFloat(modifiedForm.opening_balance) || 0,
                closing_balance: parseFloat(modifiedForm.closing_balance) || 0,
                status: 'IMPORTED'
              })
              .select()
              .single()

            if (stmt) {
              result.bankStatementId = stmt.id
              result.bankAccountId = bankAccountId
              if (bankTransactions.length > 0) {
                const txsToInsert = bankTransactions.map(tx => ({
                  tenant_id: currentTenant.id,
                  bank_statement_id: stmt.id,
                  transaction_date: tx.date,
                  description: tx.description,
                  amount: parseFloat(tx.amount) || 0,
                  transaction_type: tx.type,
                  status: 'PENDING',
                  confidence_score: 1.0
                }))

                const { error: txErr } = await supabase.from('bank_transactions').insert(txsToInsert)
                if (!txErr) result.transactionsInserted = txsToInsert.length
              }
            }
          } catch (e) {
            console.error('Failed to create bank statement from verification modal', e)
          }
        }

        if (usedForceSave) result.message = 'Force-saved with missing required fields'
        setSaveResult(result)
        setShowResultModal(true)
        shouldClose = false
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
               const { rate: fetched, ok } = await getExchangeRate(docCurrency, tenantCurrency, currentTenant?.id)
               if (ok) {
                 exchangeRate = fetched
               } else {
                 console.error('Failed to fetch exchange rate, falling back to 1.0')
               }
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
              description: `${formData.vendor_name || lt('Vendor')} - ${document.file_name}`,
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
              await (supabase
                .from('line_items') as any)
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

      // For non-bank documents, surface the transaction result so the user sees what happened
      if (formData.document_type !== 'bank_statement') {
        try {
          const { data: txRow } = await supabase
            .from('transactions')
            .select('id, status')
            .eq('document_id', document.id)
            .maybeSingle()

          const txResult: any = {
            transactionId: txRow?.id ?? null,
            transactionStatus: txRow?.status ?? null
          }
          if (usedForceSave) txResult.message = 'Force-saved with missing required fields'
          setSaveResult(txResult)
          setShowResultModal(true)
          shouldClose = false
              // Do not call `onSaved()` here — calling the parent saved handler
              // may unmount this component and prevent the result modal from
              // being shown. `onSaved` will be called when the modal closes or
              // when the dialog actually closes (via the `shouldClose` path).
        } catch (e) {
          // ignore errors fetching transaction result
        }
      }

      if (shouldClose) {
        if (onSaved) onSaved()
        onClose()
      }
      toast.success(lt('Document verified and saved'))

    } catch (error: any) {
      console.error('Save error:', error)
      toast.error(ltVars('Failed to save: {message}', { message: error?.message ?? '' }))
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
            title={lt('Reset View')}
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
                alt={lt('Document Preview')}
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
                title={lt('PDF Preview')}
              />
            )
          ) : (
            <div className="text-white text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>{lt('Preview not available')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Data Form */}
      <div className="w-full lg:w-[450px] bg-white h-[60vh] lg:h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="font-semibold text-lg">{lt('Verify Data')}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {document?.validation_status === 'NEEDS_REVIEW' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-yellow-800">{lt('Validation Warning')}</h4>
                <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside">
                  {document.validation_flags?.map(flag => (
                    <li key={flag}>
                      {flag === 'DUPLICATE_DOCUMENT' ? lt('This document appears to be a duplicate.') :
                       flag === 'WRONG_TENANT' ? lt('The bill-to name does not match the tenant.') :
                       flag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tenantCandidates && tenantCandidates.length > 0 && (
            <div className="bg-yellow-25 border border-yellow-100 rounded-md p-3">
              <h4 className="text-sm font-medium text-yellow-800">{lt('Possible tenant matches')}</h4>
              <ul className="mt-2 space-y-2">
                {tenantCandidates.map((c: any, i: number) => (
                  <li key={i} className="p-2 bg-yellow-50 border rounded">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold truncate">{c.tenantName || c.suggested_tenant_name || c.candidate_tenant_id || lt('Unknown')}</div>
                      <div className="text-xs text-gray-600">{Math.round((c.confidence || 0) * 100)}%</div>
                    </div>
                    {c.reasons && c.reasons.length > 0 && (
                      <div className="text-xs text-gray-600 mt-1">{(c.reasons || []).join('; ')}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{lt('Document Type')}</Label>
                <select 
                  className="w-full p-2 border rounded-md text-sm"
                  value={formData.document_type}
                  onChange={e => setFormData({...formData, document_type: e.target.value})}
                >
                  <option value="invoice">{lt('Invoice')}</option>
                  <option value="receipt">{lt('Receipt')}</option>
                  <option value="credit_note">{lt('Credit Note')}</option>
                  <option value="bank_statement">{lt('Bank Statement')}</option>
                  <option value="other">{lt('Other')}</option>
                </select>
              </div>
              {formData.document_type !== 'bank_statement' && (
                <div className="space-y-2">
                  <Label>{lt('Transaction Type')}</Label>
                  <select 
                    className="w-full p-2 border rounded-md text-sm"
                    value={formData.transaction_type}
                    onChange={e => setFormData({...formData, transaction_type: e.target.value})}
                  >
                    <option value="expense">{lt('Expense')}</option>
                    <option value="income">{lt('Income')}</option>
                  </select>
                </div>
              )}
            </div>

            {formData.document_type === 'bank_statement' ? (
              <>
                <div className="space-y-2">
                  <Label>{lt('Bank Name')}</Label>
                  <Input 
                    value={formData.bank_name}
                    onChange={e => setFormData({...formData, bank_name: e.target.value})}
                    placeholder={lt('e.g. Chase Bank')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{lt('Account Number (Last 4)')}</Label>
                  <Input 
                    value={formData.account_number}
                    onChange={e => setFormData({...formData, account_number: e.target.value})}
                    placeholder={lt('e.g. 1234')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Start Date')}</Label>
                    <Input 
                      type="date"
                      value={formData.statement_period_start}
                      onChange={e => setFormData({...formData, statement_period_start: e.target.value})}
                    />
                    {derivedFields.start && <div className="text-xs text-gray-500 italic">{lt('Derived from first transaction')}</div>}
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('End Date')}</Label>
                    <Input 
                      type="date"
                      value={formData.statement_period_end}
                      onChange={e => setFormData({...formData, statement_period_end: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Opening Balance')}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.opening_balance}
                      onChange={e => setFormData({...formData, opening_balance: e.target.value})}
                    />
                    {derivedFields.opening && <div className="text-xs text-gray-500 italic">{lt('Derived from first transaction')}</div>}
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Closing Balance')}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.closing_balance}
                      onChange={e => setFormData({...formData, closing_balance: e.target.value})}
                    />
                    {derivedFields.closing && <div className="text-xs text-gray-500 italic">{lt('Derived from last transaction')}</div>}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      {ltVars('Extracted Transactions ({count})', { count: bankTransactions.length })}
                    </h3>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setBankTransactions([...bankTransactions, { date: '', description: '', amount: '', type: 'DEBIT' }])}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {lt('Add Item')}
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {bankTransactions.map((tx, index) => (
                      <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-md border">
                        <div className="grid grid-cols-12 gap-2 flex-1">
                          <div className="col-span-3">
                            <Label className="text-xs text-gray-500 mb-1 block">{lt('Date')}</Label>
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
                            <Label className="text-xs text-gray-500 mb-1 block">{lt('Description')}</Label>
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
                            <Label className="text-xs text-gray-500 mb-1 block">{lt('Amount')}</Label>
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
                            <Label className="text-xs text-gray-500 mb-1 block">{lt('Type')}</Label>
                            <select 
                              className="w-full h-8 text-xs border rounded-md px-1 bg-white"
                              value={tx.type}
                              onChange={e => {
                                const newTxs = [...bankTransactions]
                                newTxs[index].type = e.target.value as 'DEBIT' | 'CREDIT'
                                setBankTransactions(newTxs)
                              }}
                            >
                              <option value="DEBIT">{lt('Debit')}</option>
                              <option value="CREDIT">{lt('Credit')}</option>
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
                        {lt('No transactions extracted')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{lt('Vendor / Payee')}</Label>
                  <Input 
                    value={formData.vendor_name}
                    onChange={e => setFormData({...formData, vendor_name: e.target.value})}
                    placeholder={lt('e.g. Amazon Web Services')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{lt('Customer') + ' / ' + lt('Payer')}</Label>
                  <Input 
                    value={formData.customer_name}
                    onChange={e => setFormData({...formData, customer_name: e.target.value})}
                    placeholder={lt('e.g. Amazon Web Services')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{lt('Date')}</Label>
                    <Input 
                      type="date"
                      value={formData.document_date}
                      onChange={e => setFormData({...formData, document_date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{lt('Reference #')}</Label>
                    <Input 
                      value={formData.invoice_number}
                      onChange={e => setFormData({...formData, invoice_number: e.target.value})}
                      placeholder={lt('INV-001')}
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="grid col-span-2 space-y-2">
                    <Label>{lt('Total Amount')}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={e => setFormData({...formData, total_amount: e.target.value})}
                    />
                  </div>
                  <div className="grid col-span-2 space-y-2">
                    <Label>{lt('Currency')}</Label>
                    <CurrencySelect 
                      value={formData.currency}
                      onChange={value => setFormData({...formData, currency: value})}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium mb-2 text-gray-500">{lt('AI Confidence')}</h3>
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

        {saveResult && (
          <div className="p-4 border-t bg-white">
            <Card>
              <CardHeader>
                <CardTitle>{lt('Verification Result')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700 space-y-2">
                    {saveResult.bankAccountId ? (
                      <div>{ltVars('Bank account created/linked: {id}', { id: saveResult.bankAccountId })}</div>
                    ) : (
                      <div className="text-sm text-red-600">{lt('No bank account was found or created; transactions are not linked to a bank account.')}</div>
                    )}
                  {saveResult.bankStatementId && (
                    <div>{ltVars('Bank statement created/updated: {id}', { id: saveResult.bankStatementId })}</div>
                  )}
                  {typeof saveResult.transactionsInserted === 'number' && (
                    <div>{ltVars('{count} transaction(s) inserted', { count: saveResult.transactionsInserted })}</div>
                  )}
                  {saveResult.transactionId && (
                    <div>{ltVars('Transaction updated/created: {id}', { id: saveResult.transactionId })}</div>
                  )}
                  {saveResult.transactionStatus && (
                    <div className="text-xs text-gray-500">{ltVars('Transaction status: {status}', { status: saveResult.transactionStatus })}</div>
                  )}

                  <div className="pt-2 text-xs text-gray-500">{lt('Next steps:')}</div>
                  <ul className="list-disc list-inside text-xs text-gray-600">
                    <li>{lt('Review the Bank Account and Bank Statement pages to match transactions.')}</li>
                    <li>{lt('If transactions need manual matching, open the Transactions view.')}</li>
                  </ul>

                  <div className="pt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        const text = `bankAccountId:${saveResult.bankAccountId || ''}\nbankStatementId:${saveResult.bankStatementId || ''}\ntransactions:${saveResult.transactionsInserted || 0}\ntransactionId:${saveResult.transactionId || ''}\ntransactionStatus:${saveResult.transactionStatus || ''}`
                        await navigator.clipboard.writeText(text)
                        toast.success(lt('Copied IDs to clipboard'))
                      } catch (e) {
                        toast.error(lt('Failed to copy'))
                      }
                    }}>{lt('Copy IDs')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { onClose(); }}>{lt('Close')}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {showResultModal && saveResult && (
          <VerificationResultModal
            result={saveResult}
            onClose={() => {
              setShowResultModal(false)
              // after the user closes the result modal, trigger parent saved handler
              if (onSaved) onSaved()
            }}
          />
        )}

        {/* Validation banner: show missing required fields and allow force-save */}
        {validationResult && !validationResult.isValid && (
          <div className="p-3 bg-yellow-50 border-t border-yellow-100">
            <div className="text-sm text-yellow-900 font-medium">{lt('Missing required data')}</div>
            <ul className="text-xs text-yellow-800 list-disc list-inside mt-2">
              {validationResult.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{lt('Fill required fields')}</Button>
              <Button size="sm" className="bg-yellow-500 text-white" onClick={() => setShowValidationModal(true)}>{lt('Force Save')}</Button>
            </div>
          </div>
        )}

        {showValidationModal && (
          <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md p-4">
              <Card>
                <CardHeader>
                  <CardTitle>{lt('Missing required data')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-700 space-y-2">
                    <div>{lt('The following required fields are missing:')}</div>
                    <ul className="list-disc list-inside text-xs text-gray-600">
                      {validationResult.messages.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>

                    <div className="pt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowValidationModal(false)}>{lt('Cancel')}</Button>
                      <Button size="sm" className="bg-yellow-500 text-white" onClick={() => { setShowValidationModal(false); handleSave(true); }}>{lt('Force Save')}</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <Button 
            className="flex-1" 
            onClick={() => handleSave(false)} 
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {lt('Saving...')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {lt('Verify & Save')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
