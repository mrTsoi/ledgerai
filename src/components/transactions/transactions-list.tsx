'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, FileText, CheckCircle, XCircle, Edit, Trash2, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { TransactionEditor } from './transaction-editor'
import { format } from 'date-fns'
import { auditTransactions } from '@/app/actions/audit'
import { AuditIssue } from '@/types/audit'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

type Transaction = Database['public']['Tables']['transactions']['Row']

interface Props {
  status?: 'DRAFT' | 'POSTED' | 'VOID'
}

export function TransactionsList({ status }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>(status || 'ALL')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  
  // Audit State
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditIssue[]>([])
  const [showAuditResults, setShowAuditResults] = useState(false)
  const [auditIssuesMap, setAuditIssuesMap] = useState<Record<string, AuditIssue[]>>({})
  
  // Audit Dialog State
  const [returnToAudit, setReturnToAudit] = useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = useState('')
  const [selectedAuditKeys, setSelectedAuditKeys] = useState<Set<string>>(new Set())

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
  const supabase = useMemo(() => createClient(), [])

  const fetchTransactions = useCallback(async () => {
    if (!currentTenant) return

    try {
      setLoading(true)
      let query = supabase
        .from('transactions')
        .select(`
          *,
          documents (
            validation_status,
            validation_flags,
            document_data (
              confidence_score,
              total_amount,
              currency,
              extracted_data
            )
          ),
          line_items (
            debit,
            credit,
            chart_of_accounts (
              name,
              account_type
            )
          )
        `)
        .eq('tenant_id', currentTenant.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setTransactions(data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }, [currentTenant, supabase])

  useEffect(() => {
    if (currentTenant) {
      fetchTransactions()
      
      // Subscribe to real-time updates for transactions
      const txChannel = supabase
        .channel('transactions_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `tenant_id=eq.${currentTenant.id}`
          },
          () => {
            fetchTransactions()
          }
        )
        .subscribe()

      // Subscribe to real-time updates for documents (to catch validation flag changes)
      const docChannel = supabase
        .channel('documents_changes_tx_list')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: `tenant_id=eq.${currentTenant.id}`
          },
          () => {
            fetchTransactions()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(txChannel)
        supabase.removeChannel(docChannel)
      }
    }
  }, [currentTenant, fetchTransactions, supabase])

  const filterTransactions = useCallback(() => {
    let filtered = transactions

    // Filter by status
    if (selectedStatus !== 'ALL') {
      filtered = filtered.filter(tx => tx.status === selectedStatus)
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.description?.toLowerCase().includes(search) ||
        tx.reference_number?.toLowerCase().includes(search)
      )
    }

    setFilteredTransactions(filtered)
  }, [transactions, selectedStatus, searchTerm])

  useEffect(() => {
    filterTransactions()
  }, [filterTransactions])

  const voidTransaction = async (id: string) => {
    setConfirmConfig({
      title: 'Void Transaction',
      description: 'Are you sure you want to void this transaction?',
      action: async () => {
        try {
          const { error } = await supabase
            .from('transactions')
            .update({ status: 'VOID' })
            .eq('id', id)

          if (error) throw error
          fetchTransactions()
          setAuditResults(prev => prev.filter(i => i.transactionId !== id))
          setShowConfirmDialog(false)
        } catch (error: any) {
          console.error('Error voiding transaction:', error)
          toast.error('Failed to void: ' + error.message)
        }
      },
      actionLabel: 'Void',
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const deleteTransaction = async (id: string) => {
    setConfirmConfig({
      title: 'Delete Transaction',
      description: 'Are you sure you want to delete this transaction?',
      action: async () => {
        try {
            const { error } = await supabase
              .from('transactions')
              .delete()
              .eq('id', id)

          if (error) throw error
          
          toast.success('Transaction deleted')
          fetchTransactions()
          setAuditResults(prev => prev.filter(i => i.transactionId !== id))
          setShowConfirmDialog(false)
        } catch (error: any) {
          console.error('Error deleting transaction:', error)
          toast.error('Failed to delete: ' + error.message)
        }
      },
      actionLabel: 'Delete',
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
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
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTransactions.map(t => t.id)))
    }
  }

  const selectVerified = () => {
    const verifiedIds = new Set<string>()
    filteredTransactions.forEach(tx => {
      if (tx.status !== 'DRAFT') return

      // Check confidence score
      const doc = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
      const docData = doc?.document_data
      const confidence = Array.isArray(docData) && docData.length > 0 ? docData[0].confidence_score : null
      
      // Check validation flags (read from nested document_data)
      const hasValidationIssues = doc?.document_data?.validation_flags?.some((flag: string) => 
        ['DUPLICATE_DOCUMENT', 'WRONG_TENANT'].includes(flag)
      )

      // Check audit issues if available
      const auditIssues = auditIssuesMap[tx.id] || []
      const hasHighSeverityAuditIssues = auditIssues.some(i => i.severity === 'HIGH')

      // Criteria for "Verified":
      // 1. High confidence (> 0.8) OR Manual entry (no doc)
      // 2. No validation issues
      // 3. No high severity audit issues
      
      const isHighConfidence = confidence !== null ? confidence >= 0.8 : true // If no doc, assume manual entry is ok? Or maybe require review? Let's say if no doc, we don't auto-select unless we are sure. But for now, let's focus on AI ones.
      // Actually, if no doc, confidence is null.
      
      if (isHighConfidence && !hasValidationIssues && !hasHighSeverityAuditIssues) {
        verifiedIds.add(tx.id)
      }
    })
    
    setSelectedIds(verifiedIds)
    toast.success(`Selected ${verifiedIds.size} verified transactions`)
  }

  const bulkPost = async () => {
    setConfirmConfig({
      title: 'Post Transactions',
      description: `Post ${selectedIds.size} transactions?`,
      action: async () => {
        try {
          const ids = Array.from(selectedIds)
          // Only allow posting drafts
          const draftsToPost = transactions.filter(t => selectedIds.has(t.id) && t.status === 'DRAFT')
          
          if (draftsToPost.length === 0) {
            toast.warning('No DRAFT transactions selected.')
            return
          }

          // Process in batches
          const chunks = chunkArray(draftsToPost.map(t => t.id), batchSize)
          let processedCount = 0

          for (const chunk of chunks) {
            const { error } = await supabase
              .from('transactions')
              .update({ status: 'POSTED', posted_at: new Date().toISOString() })
              .in('id', chunk)

            if (error) throw error
            processedCount += chunk.length
          }
          
          fetchTransactions()
          setSelectedIds(new Set())
          toast.success(`Posted ${processedCount} transactions`)
          setShowConfirmDialog(false)
        } catch (error: any) {
          console.error('Bulk post error:', error)
          toast.error('Failed to post transactions: ' + error.message)
        }
      },
      actionLabel: 'Post',
      variant: 'default'
    })
    setShowConfirmDialog(true)
  }

  const bulkVoid = async () => {
    setConfirmConfig({
      title: 'Void Transactions',
      description: `Void ${selectedIds.size} transactions?`,
      action: async () => {
        try {
          const ids = Array.from(selectedIds)
          const chunks = chunkArray(ids, batchSize)

          for (const chunk of chunks) {
            const { error } = await supabase
              .from('transactions')
              .update({ status: 'VOID' })
              .in('id', chunk)

            if (error) throw error
          }
          
          fetchTransactions()
          setSelectedIds(new Set())
          setShowConfirmDialog(false)
        } catch (error: any) {
          console.error('Bulk void error:', error)
          toast.error('Failed to void transactions: ' + error.message)
        }
      },
      actionLabel: 'Void',
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const bulkDeleteDrafts = async () => {
    setConfirmConfig({
      title: 'Delete Draft Transactions',
      description: `Delete ${selectedIds.size} draft transactions?`,
      action: async () => {
        try {
          const ids = Array.from(selectedIds)
          // Only allow deleting drafts
          const draftsToDelete = transactions.filter(t => selectedIds.has(t.id) && t.status === 'DRAFT')
          
          if (draftsToDelete.length !== ids.length) {
            toast.warning('Only DRAFT transactions can be deleted. Others will be skipped.')
          }

          if (draftsToDelete.length === 0) return

          const chunks = chunkArray(draftsToDelete.map(t => t.id), batchSize)

          for (const chunk of chunks) {
            const { error } = await supabase
              .from('transactions')
              .delete()
              .in('id', chunk)

            if (error) throw error
          }
          
          fetchTransactions()
          setSelectedIds(new Set())
          setShowConfirmDialog(false)
        } catch (error: any) {
          console.error('Bulk delete error:', error)
          toast.error('Failed to delete transactions: ' + error.message)
        }
      },
      actionLabel: 'Delete',
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  const runAudit = async () => {
    if (!currentTenant) return
    setIsAuditing(true)
    try {
      const issues = await auditTransactions(currentTenant.id)
      setAuditResults(issues)
      setSelectedAuditKeys(new Set()) // Reset selection
      setAuditSearchTerm('') // Reset search
      
      // Group issues by transaction ID
      const issuesMap: Record<string, AuditIssue[]> = {}
      issues.forEach(issue => {
        if (!issuesMap[issue.transactionId]) {
          issuesMap[issue.transactionId] = []
        }
        issuesMap[issue.transactionId].push(issue)
      })
      setAuditIssuesMap(issuesMap)

      setShowAuditResults(true)
    } catch (e) {
      console.error(e)
      toast.error('Audit failed')
    } finally {
      setIsAuditing(false)
    }
  }

  // Audit Helper Functions
  const getAuditKey = (issue: AuditIssue) => `${issue.transactionId}-${issue.issueType}`

  const filteredAuditResults = auditResults.filter(issue => {
    if (!auditSearchTerm) return true
    const search = auditSearchTerm.toLowerCase()
    const tx = transactions.find(t => t.id === issue.transactionId)
    return (
      issue.description.toLowerCase().includes(search) ||
      issue.issueType.toLowerCase().includes(search) ||
      tx?.description?.toLowerCase().includes(search) ||
      tx?.reference_number?.toLowerCase().includes(search)
    )
  })

  const toggleAuditSelection = (key: string) => {
    const newSelected = new Set(selectedAuditKeys)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedAuditKeys(newSelected)
  }

  const toggleAllAuditSelection = () => {
    const allKeys = new Set(filteredAuditResults.map(issue => getAuditKey(issue)))
    const allSelected = allKeys.size > 0 && Array.from(allKeys).every(key => selectedAuditKeys.has(key))

    if (allSelected) {
      setSelectedAuditKeys(new Set())
    } else {
      setSelectedAuditKeys(allKeys)
    }
  }

  const bulkFixAudit = async () => {
    if (selectedAuditKeys.size === 0) return
    
    // Identify actionable issues (Duplicate/Wrong Tenant)
    const issuesToFix = auditResults.filter(issue => 
      selectedAuditKeys.has(getAuditKey(issue)) && 
      ['DUPLICATE', 'WRONG_TENANT'].includes(issue.issueType)
    )

    if (issuesToFix.length === 0) {
      toast.warning('No auto-fixable issues selected (Duplicate or Wrong Tenant).')
      return
    }

    setConfirmConfig({
      title: 'Fix Selected Issues',
      description: `Auto-fix ${issuesToFix.length} selected issues? This will Delete drafts and Void posted transactions.`,
      action: async () => {
        try {
          const txIdsToDelete: string[] = []
          const txIdsToVoid: string[] = []

          issuesToFix.forEach(issue => {
            const tx = transactions.find(t => t.id === issue.transactionId)
            if (!tx) return
            
            if (tx.status === 'DRAFT') {
              txIdsToDelete.push(tx.id)
            } else {
              txIdsToVoid.push(tx.id)
            }
          })

          // Perform Delete in batches
          if (txIdsToDelete.length > 0) {
            const deleteChunks = chunkArray(txIdsToDelete, batchSize)
            for (const chunk of deleteChunks) {
              const { error } = await supabase
                .from('transactions')
                .delete()
                .in('id', chunk)
              if (error) throw error
            }
          }

          // Perform Void in batches
          if (txIdsToVoid.length > 0) {
            const voidChunks = chunkArray(txIdsToVoid, batchSize)
            for (const chunk of voidChunks) {
              const { error } = await supabase
                .from('transactions')
                .update({ status: 'VOID' })
                .in('id', chunk)
              if (error) throw error
            }
          }

          toast.success(`Fixed ${issuesToFix.length} issues`)
          
          // Refresh and update local state
          await fetchTransactions()
          
          // Remove fixed issues from the list
          const fixedTxIds = new Set([...txIdsToDelete, ...txIdsToVoid])
          setAuditResults(prev => prev.filter(i => !fixedTxIds.has(i.transactionId)))
          setSelectedAuditKeys(new Set())
          setShowConfirmDialog(false)

        } catch (error: any) {
          console.error('Bulk fix error:', error)
          toast.error('Failed to fix issues: ' + error.message)
        }
      },
      actionLabel: 'Fix Issues',
      variant: 'destructive'
    })
    setShowConfirmDialog(true)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <FileText className="w-4 h-4 text-yellow-500" />
      case 'POSTED':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'VOID':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      DRAFT: 'bg-yellow-100 text-yellow-800',
      POSTED: 'bg-green-100 text-green-800',
      VOID: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    )
  }

  const getTransactionDetails = (tx: any) => {
    const lineItems = tx.line_items || []
    // Handle potential array/object structure for documents
    const doc = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
    const rawDocData = doc?.document_data
    const docData = Array.isArray(rawDocData) ? rawDocData[0] : rawDocData
    
    // 1. Determine Amount & Currency
    let amount = 0
    // Prioritize the structured currency column as it's the canonical source
    let currency = docData?.currency || 
             (docData?.extracted_data as { currency?: string } | null)?.currency || 
             tx.currency || 
             currentTenant?.currency || 
             'USD'
    
    // Try explicit column first
    if (docData?.total_amount != null) {
      amount = docData.total_amount
    } 
    // Try extracted_data JSON as fallback
    else if (docData?.extracted_data?.total_amount != null) {
       const rawAmount = docData.extracted_data.total_amount
       amount = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount) || 0
    }
    // Fallback to line items
    else if (lineItems.length > 0) {
      amount = lineItems.reduce((sum: number, item: any) => sum + (item.debit || 0), 0)
    }

    // 2. Determine Category (Account) & Type
    // Strategy: Find the line item that is NOT the bank/cash account.
    // For now, we just take the first line item that has a name, or "Uncategorized"
    // Ideally, we'd know which account is the "source" (bank) and which is "destination" (expense).
    // Heuristic: If it's an expense, the category is the Debit side (usually).
    
    let category = 'Uncategorized'
    let type = 'Expense' // Default
    
    // Try to find a non-asset account (likely the expense/revenue category)
    const categoryItem = lineItems.find((item: any) => 
      item.chart_of_accounts?.account_type !== 'ASSET' && 
      item.chart_of_accounts?.account_type !== 'LIABILITY' // Exclude AP/CreditCard for now if possible, but often CC is Liability.
    )
    
    if (categoryItem) {
      category = categoryItem.chart_of_accounts?.name || 'Unknown Account'
      // If the category account was credited, it's likely Revenue
      if (categoryItem.credit > 0) {
        type = 'Income'
      }
    } else if (lineItems.length > 0) {
      // Fallback to first item
      category = lineItems[0].chart_of_accounts?.name || 'Unknown'
    }

    return { amount, currency, category, type }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Transactions</CardTitle>
              <CardDescription>
                View and manage accounting transactions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runAudit} disabled={isAuditing}>
                {isAuditing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
                AI Audit
              </Button>
              <Button size="sm" variant="outline" onClick={selectVerified}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Select Verified
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button size="sm" variant="default" onClick={bulkPost}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Post ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkVoid}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Void ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="destructive" onClick={bulkDeleteDrafts}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Drafts
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:max-w-sm"
            />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border rounded-md w-full md:w-auto"
            >
              <option value="ALL">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No transactions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden md:flex items-center gap-4 p-2 border-b text-sm font-medium text-gray-500">
                <Checkbox 
                  checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="flex-[2]">Description</span>
                <span className="flex-1">Category</span>
                <span className="flex-1 text-right">Amount</span>
                <span className="w-32 text-right">Actions</span>
              </div>
              {filteredTransactions.map((tx) => {
                // Combine audit issues with document validation issues
                const auditIssues = auditIssuesMap[tx.id] || []
                const docIssues: AuditIssue[] = []
                
                // Check document validation status
                const doc = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
                const docData = doc?.document_data
                const confidence = Array.isArray(docData) && docData.length > 0 ? docData[0].confidence_score : null

                if (doc && doc.document_data && doc.document_data.validation_flags && Array.isArray(doc.document_data.validation_flags)) {
                  doc.document_data.validation_flags.forEach((flag: string) => {
                    if (flag === 'DUPLICATE_DOCUMENT') {
                      docIssues.push({
                        transactionId: tx.id,
                        description: 'Duplicate Document',
                        issueType: 'DUPLICATE',
                        severity: 'HIGH',
                        details: 'Duplicate document file detected during upload'
                      })
                    } else if (flag === 'WRONG_TENANT') {
                      docIssues.push({
                        transactionId: tx.id,
                        description: 'Wrong Tenant',
                        issueType: 'WRONG_TENANT',
                        severity: 'HIGH',
                        details: 'Document does not appear to belong to this tenant'
                      })
                    }
                  })
                }

                // Merge issues, avoiding duplicates if audit already ran
                const allIssues = [...auditIssues]
                docIssues.forEach(docIssue => {
                  if (!allIssues.some(i => i.issueType === docIssue.issueType)) {
                    allIssues.push(docIssue)
                  }
                })

                const hasHighSeverity = allIssues.some(i => i.severity === 'HIGH')
                const hasIssues = allIssues.length > 0
                const isExpanded = expandedIds.has(tx.id)
                
                const { amount, currency, category, type } = getTransactionDetails(tx)

                return (
                <div
                  key={tx.id}
                  className={`flex flex-col border rounded-lg transition-colors ${
                    selectedIds.has(tx.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  } ${hasIssues ? (hasHighSeverity ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-yellow-500') : ''}`}
                >
                  <div 
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer"
                    onClick={(e) => {
                      // Prevent toggling if clicking interactive elements
                      if (
                        (e.target as HTMLElement).closest('button') || 
                        (e.target as HTMLElement).closest('[role="checkbox"]') ||
                        (e.target as HTMLElement).closest('a')
                      ) {
                        return
                      }
                      toggleExpand(tx.id)
                    }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Checkbox 
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelection(tx.id)}
                      />
                      {hasIssues ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                {hasHighSeverity ? (
                                  <XCircle className="w-4 h-4 text-red-500" />
                                ) : (
                                  <ShieldAlert className="w-4 h-4 text-yellow-500" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs p-3 bg-white border shadow-lg z-50">
                              <div className="space-y-2">
                                <p className="font-semibold text-sm border-b pb-1 mb-2">Detected Issues</p>
                                {allIssues.map((issue, idx) => (
                                  <div key={idx} className="text-xs">
                                    <div className="flex items-center gap-2 mb-1">
                                      {issue.severity === 'HIGH' ? (
                                        <XCircle className="w-3 h-3 text-red-500" />
                                      ) : (
                                        <ShieldAlert className="w-3 h-3 text-yellow-500" />
                                      )}
                                      <span className="font-medium text-gray-900">{issue.description}</span>
                                    </div>
                                    <p className="text-gray-500 pl-5">{issue.details}</p>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        getStatusIcon(tx.status ?? '')
                      )}
                      
                      {/* Description & Meta */}
                      <div className="flex-[2]">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{tx.description || 'No description'}</p>
                          {getStatusBadge(tx.status ?? '')}
                          {confidence !== null && (
                            <Badge variant="outline" className={`
                              ${confidence >= 0.8 ? 'text-green-600 border-green-200 bg-green-50' : 
                                confidence >= 0.5 ? 'text-yellow-600 border-yellow-200 bg-yellow-50' : 
                                'text-red-600 border-red-200 bg-red-50'}
                            `}>
                              {Math.round(confidence * 100)}% AI
                            </Badge>
                          )}
                          {hasIssues && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`cursor-help ${hasHighSeverity ? "text-red-600 border-red-200 bg-red-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}`}>
                                    {allIssues.length} Issue{allIssues.length > 1 ? 's' : ''}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3 bg-white border shadow-lg z-50">
                                  <div className="space-y-2">
                                    <p className="font-semibold text-sm border-b pb-1 mb-2">Detected Issues</p>
                                    {allIssues.map((issue, idx) => (
                                      <div key={idx} className="text-xs">
                                        <div className="flex items-center gap-2 mb-1">
                                          {issue.severity === 'HIGH' ? (
                                            <XCircle className="w-3 h-3 text-red-500" />
                                          ) : (
                                            <ShieldAlert className="w-3 h-3 text-yellow-500" />
                                          )}
                                          <span className="font-medium text-gray-900">{issue.description}</span>
                                        </div>
                                        <p className="text-gray-500 pl-5">{issue.details}</p>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {format(new Date(tx.transaction_date), 'MMM dd, yyyy')}
                          {tx.reference_number && ` • Ref: ${tx.reference_number}`}
                        </p>
                      </div>

                      {/* Category */}
                      <div className="flex-1 hidden md:block">
                        <p className="text-sm font-medium">{category}</p>
                        <p className="text-xs text-gray-500">{type}</p>
                      </div>

                      {/* Amount */}
                      <div className="flex-1 text-right hidden md:block">
                        <p className={`font-medium ${type === 'Income' ? 'text-green-600' : ''}`}>
                          {type === 'Income' ? '+' : ''}
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount)}
                        </p>
                        <p className="text-xs text-gray-500">{currency}</p>
                      </div>

                    </div>
                    <div className="flex items-center gap-4 mt-4 md:mt-0 md:ml-4 pl-8 md:pl-0">
                      <div className="flex gap-2 flex-1 md:flex-none">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(tx.id)}
                          className="flex-1 md:flex-none"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          {tx.status === 'DRAFT' ? 'Edit' : 'View'}
                        </Button>
                        {tx.status === 'POSTED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => voidTransaction(tx.id)}
                            className="flex-1 md:flex-none"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Void
                          </Button>
                        )}
                      </div>
                      <div className="text-gray-400">
                         {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 pl-14 animate-in slide-in-from-top-2">
                        <div className="pt-4 border-t border-gray-100">
                            {/* Mobile View Details */}
                            <div className="md:hidden grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p className="text-xs text-gray-500">Category</p>
                                    <p className="text-sm font-medium">{category}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Amount</p>
                                    <p className={`text-sm font-medium ${type === 'Income' ? 'text-green-600' : ''}`}>
                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(amount)}
                                        <span className="ml-1 text-xs text-gray-500">{currency}</span>
                                    </p>
                                </div>
                            </div>

                            {hasIssues ? (
                                <div className="space-y-2">
                                    <p className="font-semibold text-sm text-gray-700">Detected Issues</p>
                                    {allIssues.map((issue, idx) => (
                                        <div key={idx} className="text-sm bg-white p-3 rounded border border-gray-200">
                                            <div className="flex items-center gap-2 mb-1">
                                                {issue.severity === 'HIGH' ? (
                                                    <XCircle className="w-4 h-4 text-red-500" />
                                                ) : (
                                                    <ShieldAlert className="w-4 h-4 text-yellow-500" />
                                                )}
                                                <span className="font-medium text-gray-900">{issue.description}</span>
                                            </div>
                                            <p className="text-gray-600 ml-6">{issue.details}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No issues detected for this transaction.</p>
                            )}
                        </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}

          {/* Summary */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600">
              Showing {filteredTransactions.length} of {transactions.length} transactions
            </p>
          </div>
        </CardContent>
      </Card>

      {editingId && (
        <TransactionEditor
          transactionId={editingId}
          onClose={() => {
            setEditingId(null)
            if (returnToAudit) {
              setShowAuditResults(true)
              setReturnToAudit(false)
            }
          }}
          onSaved={() => {
            setEditingId(null)
            fetchTransactions()
            if (returnToAudit) {
              setShowAuditResults(true)
              setReturnToAudit(false)
            }
          }}
        />
      )}

      <Dialog open={showAuditResults} onOpenChange={setShowAuditResults}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>Transaction Audit Results</DialogTitle>
                <DialogDescription>
                  AI-powered analysis found {auditResults.length} potential issues.
                </DialogDescription>
              </div>
              {selectedAuditKeys.size > 0 && (
                <Button variant="destructive" size="sm" onClick={bulkFixAudit}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Fix Selected ({selectedAuditKeys.size})
                </Button>
              )}
            </div>
            
            <div className="mt-4 flex gap-2">
              <Input 
                placeholder="Search issues..." 
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto mt-2 pr-4 -mr-4 pl-1">
            {filteredAuditResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {auditResults.length === 0 ? (
                  <>
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
                    <p className="font-medium text-green-600">No issues found!</p>
                    <p className="text-sm">Your transactions look healthy.</p>
                  </>
                ) : (
                  <p>No issues match your search.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-2 border-b text-sm font-medium text-gray-500 sticky top-0 bg-white z-10">
                  <Checkbox 
                    checked={filteredAuditResults.length > 0 && Array.from(new Set(filteredAuditResults.map(i => getAuditKey(i)))).every(k => selectedAuditKeys.has(k))}
                    onCheckedChange={toggleAllAuditSelection}
                  />
                  <span>Select All</span>
                </div>

                {filteredAuditResults.map((issue, i) => {
                  const tx = transactions.find(t => t.id === issue.transactionId)
                  if (!tx) return null
                  const selectionKey = getAuditKey(issue)
                  const uniqueKey = `${selectionKey}-${i}`

                  return (
                  <div key={uniqueKey} className={`p-4 border rounded-lg flex gap-4 transition-colors ${selectedAuditKeys.has(selectionKey) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}`}>
                    <div className="mt-1">
                      <Checkbox 
                        checked={selectedAuditKeys.has(selectionKey)}
                        onCheckedChange={() => toggleAuditSelection(selectionKey)}
                      />
                    </div>
                    <div className="mt-1">
                      {issue.severity === 'HIGH' ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-yellow-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{issue.issueType.replace('_', ' ')}</h4>
                          <span className="text-xs text-gray-500">• {tx.description || 'No Description'}</span>
                        </div>
                        <Badge variant={issue.severity === 'HIGH' ? 'destructive' : 'secondary'}>
                          {issue.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{issue.description}</p>
                      <p className="text-xs text-gray-500 bg-white p-2 rounded border">
                        {issue.details}
                      </p>
                      
                      <div className="flex gap-2 mt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setReturnToAudit(true)
                            setShowAuditResults(false)
                            setEditingId(issue.transactionId)
                          }}
                        >
                          Review
                        </Button>
                        
                        {issue.issueType === 'DUPLICATE' && (
                          tx.status === 'DRAFT' ? (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => deleteTransaction(tx.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete Duplicate
                            </Button>
                          ) : (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => voidTransaction(tx.id)}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Void Duplicate
                            </Button>
                          )
                        )}

                         {issue.issueType === 'WRONG_TENANT' && (
                          tx.status === 'DRAFT' ? (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => deleteTransaction(tx.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          ) : (
                             <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => voidTransaction(tx.id)}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Void
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig?.title}</DialogTitle>
            <DialogDescription>
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
    </>
  )
}