'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { useBatchConfig, chunkArray } from '@/hooks/use-batch-config'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Search, 
  Trash2, 
  Ban, 
  FileText,
  RefreshCw,
  ShieldCheck,
  ChevronDown, 
  ChevronRight,
  Sparkles,
  Loader2
} from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { useLiterals } from '@/hooks/use-literals'
import { TransactionMatchModal } from './transaction-match-modal'
import { DuplicateResolutionModal } from './duplicate-resolution-modal'
import { StatementVerificationModal } from './statement-verification-modal'
import { StatementDetailModal } from './statement-detail-modal'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']

// Extended type for UI logic
type TransactionWithMeta = BankTransaction & {
  source_file?: string;
  document_id?: string;
  is_duplicate?: boolean;
  duplicate_reason?: string;
}

interface DuplicateGroup {
  key: string
  items: TransactionWithMeta[]
}

interface Props {
  accountId: string
}

export function ReconciliationFeed({ accountId }: Props) {
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isValidating, setIsValidating] = useState(false)
  const [isAutoMatching, setIsAutoMatching] = useState(false)
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 })
  const [unmatchTx, setUnmatchTx] = useState<BankTransaction | null>(null)
  
  // New State for Enhanced Features
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [isResolveDuplicatesOpen, setIsResolveDuplicatesOpen] = useState(false)
  const [isVerifyStatementsOpen, setIsVerifyStatementsOpen] = useState(false)
  const [verifyDocumentId, setVerifyDocumentId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  
  const { currentTenant } = useTenant()
  const lt = useLiterals()
  const { batchSize } = useBatchConfig()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const fetchTransactions = useCallback(async () => {
    if (!tenantId || !accountId) return

    try {
      setLoading(true)
      // Join with bank_statements to filter by accountId and get source file
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_statements!inner (
            bank_account_id,
            documents (
              id,
              file_name
            )
          )
        `)
        .eq('bank_statements.bank_account_id', accountId)
        .order('transaction_date', { ascending: false })

      if (error) throw error
      
      // Transform data to include source file
      const transformedData = (data || []).map((tx: any) => ({
        ...tx,
        source_file: tx.bank_statements?.documents?.file_name || lt('Unknown Source'),
        document_id: tx.bank_statements?.documents?.id
      }))

      setTransactions(transformedData)
      
      // Auto-expand all groups initially
      const allDocIds = new Set(transformedData.map((t: any) => t.document_id || 'unknown'))
      setExpandedGroups(allDocIds)
      
      setSelectedIds(new Set()) // Clear selection on refresh
    } catch (error) {
      console.error('Error fetching transactions:', error)
      toast.error(lt('Failed to load transactions'))
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase, tenantId, lt])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handleMatch = (transaction: BankTransaction) => {
    setSelectedTransaction(transaction)
    setIsMatchModalOpen(true)
  }

  const handleMatchComplete = () => {
    fetchTransactions()
    setIsMatchModalOpen(false)
    setSelectedTransaction(null)
  }

  const handleUnmatch = (transaction: BankTransaction) => {
    setUnmatchTx(transaction)
  }

  const confirmUnmatch = async () => {
    if (!unmatchTx) return

    try {
      // 1. Update bank_transaction status
      const { error: btError } = await supabase
        .from('bank_transactions')
        .update({
          status: 'PENDING',
          matched_transaction_id: null
        })
        .eq('id', unmatchTx.id)

      if (btError) throw btError

      // 2. Remove from junction table (if exists)
      const { error: junctionError } = await supabase
        .from('bank_transaction_matches')
        .delete()
        .eq('bank_transaction_id', unmatchTx.id)
        
      if (junctionError) {
          console.warn('Could not delete from junction table (might not exist)', junctionError)
      }

      toast.success(lt('Transaction unmatched'))
      fetchTransactions()
    } catch (error: any) {
      console.error('Error unmatching transaction:', error)
      toast.error(lt('Failed to unmatch: {message}', { message: error.message }))
    } finally {
      setUnmatchTx(null)
    }
  }

  const handleAutoMatch = async () => {
    try {
      setIsAutoMatching(true)
      const pendingTxs = transactions.filter(t => t.status === 'PENDING')
      
      if (pendingTxs.length === 0) {
        toast.info(lt('No pending transactions to match'))
        return
      }

      toast.info(lt('Auto-matching {count} transactions...', { count: pendingTxs.length }))
      setMatchProgress({ current: 0, total: pendingTxs.length })
      
      let matchedCount = 0
      
      // Process in chunks of 5 to avoid overwhelming
      const chunkSize = 5
      for (let i = 0; i < pendingTxs.length; i += chunkSize) {
        const chunk = pendingTxs.slice(i, i + chunkSize)
        
        await Promise.all(chunk.map(async (tx) => {
          try {
            // 1. Find candidates locally first (simple date/amount query)
            const date = new Date(tx.transaction_date)
            const startDate = new Date(date)
            startDate.setDate(date.getDate() - 7)
            const endDate = new Date(date)
            endDate.setDate(date.getDate() + 7)

            const { data: candidates } = await supabase
              .from('transactions')
              .select('*, line_items(debit, credit)')
              .gte('transaction_date', startDate.toISOString().split('T')[0])
              .lte('transaction_date', endDate.toISOString().split('T')[0])
              .order('transaction_date', { ascending: false })
              .limit(10)

            if (!candidates || candidates.length === 0) return

            // Calculate amounts
            const candidatesWithAmount = candidates.map((c: any) => ({
              ...c,
              amount: c.line_items?.reduce((sum: number, item: any) => sum + (item.debit || 0), 0) || 0
            }))

            // 2. Call AI Service
            const response = await fetch('/api/banking/reconcile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bankTransaction: tx,
                candidates: candidatesWithAmount,
                tenantId: tx.tenant_id
              })
            })

            if (!response.ok) return
            const result = await response.json()
            
            // 3. Check for high confidence match
            const bestMatch = result.matches?.[0]
            if (bestMatch && bestMatch.confidence_score >= 0.9) {
               // Auto match!
               await supabase
                .from('bank_transactions')
                .update({
                  status: 'MATCHED',
                  matched_transaction_id: bestMatch.transaction.id,
                  confidence_score: bestMatch.confidence_score
                })
                .eq('id', tx.id)
               
               await supabase.from('bank_transaction_matches').insert({
                  bank_transaction_id: tx.id,
                  transaction_id: bestMatch.transaction.id,
                  match_type: 'EXACT' // AI Exact
               })
               
               matchedCount++
            }
          } catch (e) {
            console.error('Error auto-matching tx:', tx.id, e)
          }
        }))
        
        // Update progress after chunk
        setMatchProgress(prev => ({ 
          ...prev, 
          current: Math.min(prev.current + chunk.length, prev.total) 
        }))
      }

      if (matchedCount > 0) {
        toast.success(lt('Auto-matched {count} transactions', { count: matchedCount }))
        fetchTransactions()
      } else {
        toast.info(lt('No high-confidence matches found'))
      }

    } catch (error) {
      console.error('Auto match error:', error)
      toast.error(lt('Auto match failed'))
    } finally {
      setIsAutoMatching(false)
    }
  }

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // Bulk Actions
  const handleBulkDelete = async () => {
    if (!confirm(lt('Are you sure you want to delete {count} transactions?', { count: selectedIds.size }))) return

    try {
      const ids = Array.from(selectedIds)
      const chunks = chunkArray(ids, batchSize)

      for (const chunk of chunks) {
        const { error } = await supabase
          .from('bank_transactions')
          .delete()
          .in('id', chunk)

        if (error) throw error
      }

      toast.success(lt('Deleted {count} transactions', { count: selectedIds.size }))
      fetchTransactions()
    } catch (error) {
      console.error('Error deleting transactions:', error)
      toast.error(lt('Failed to delete transactions'))
    }
  }

  const handleBulkExclude = async () => {
    try {
      const ids = Array.from(selectedIds)
      const chunks = chunkArray(ids, batchSize)

        for (const chunk of chunks) {
        const { error } = await supabase
          .from('bank_transactions')
          .update({ status: 'EXCLUDED' })
          .in('id', chunk)

        if (error) throw error
      }

      toast.success(lt('Excluded {count} transactions', { count: selectedIds.size }))
      fetchTransactions()
    } catch (error) {
      console.error('Error excluding transactions:', error)
      toast.error(lt('Failed to exclude transactions'))
    }
  }

  // Validation Logic
  const validateTransactions = () => {
    setIsValidating(true)
    
    // 1. Group by (date, amount, description) to find internal duplicates
    const groups = new Map<string, TransactionWithMeta[]>()
    const duplicates = new Set<string>()

    transactions.forEach(tx => {
      // Create a key for comparison
      const key = `${tx.transaction_date}|${tx.amount}|${tx.description?.trim().toLowerCase()}`
      
      if (groups.has(key)) {
        const existingItems = groups.get(key)!
        existingItems.push(tx)
        // Mark all in this group as duplicates
        existingItems.forEach(item => duplicates.add(item.id))
      } else {
        groups.set(key, [tx])
      }
    })

    // Filter groups to only those with > 1 item
    const dupGroups: DuplicateGroup[] = []
    groups.forEach((items, key) => {
      if (items.length > 1) {
        dupGroups.push({ key, items })
      }
    })
    setDuplicateGroups(dupGroups)

    // Update state with validation results
    const validatedTransactions = transactions.map(tx => ({
      ...tx,
      is_duplicate: duplicates.has(tx.id),
      duplicate_reason: duplicates.has(tx.id) ? lt('Duplicate found in current feed') : undefined
    }))

    setTransactions(validatedTransactions)
    setIsValidating(false)
    
    if (duplicates.size > 0) {
      toast.warning(lt('Found {count} potential duplicates', { count: duplicates.size }))
    } else {
      toast.success(lt('No duplicates found in current feed'))
    }
  }

  const handleResolveDuplicates = async (idsToDelete: string[]) => {
    try {
      const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .in('id', idsToDelete)

      if (error) throw error

      toast.success(lt('Deleted {count} duplicates', { count: idsToDelete.length }))
      setDuplicateGroups([]) // Clear groups
      fetchTransactions() // Refresh list
    } catch (error: any) {
      console.error('Error resolving duplicates:', error)
      toast.error(lt('Failed to delete duplicates: {message}', { message: error.message }))
    }
  }

  const toggleGroup = (docId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId)
    } else {
      newExpanded.add(docId)
    }
    setExpandedGroups(newExpanded)
  }

  // Group transactions by document
  const groupedTransactions = transactions.reduce((acc, tx) => {
    const docId = tx.document_id || 'unknown'
    if (!acc[docId]) {
      acc[docId] = {
        id: docId,
        fileName: tx.source_file || lt('Unknown Source'),
        transactions: []
      }
    }
    acc[docId].transactions.push(tx)
    return acc
  }, {} as Record<string, { id: string, fileName: string, transactions: TransactionWithMeta[] }>)

  if (loading) {
    return <div className="p-8 text-center">{lt('Loading feed...')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{lt('Transaction Feed')}</h3>
        <div className="flex gap-2">
          {duplicateGroups.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setIsResolveDuplicatesOpen(true)}>
              <AlertCircle className="w-4 h-4 mr-2" />
              {lt('Fix Duplicates ({count})', { count: duplicateGroups.length })}
            </Button>
          )}

          {selectedIds.size > 0 ? (
            <>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                {lt('Delete ({count})', { count: selectedIds.size })}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleBulkExclude}>
                <Ban className="w-4 h-4 mr-2" />
                {lt('Exclude ({count})', { count: selectedIds.size })}
              </Button>
            </>
          ) : isAutoMatching ? (
            <div className="flex items-center gap-3 bg-white border rounded-md px-3 py-1.5 shadow-sm">
              <div className="flex flex-col gap-1 w-[180px]">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{lt('AI Matching...')}</span>
                  <span>{Math.round((matchProgress.current / matchProgress.total) * 100)}%</span>
                </div>
                <Progress value={(matchProgress.current / matchProgress.total) * 100} className="h-1.5" />
              </div>
              <span className="text-xs font-medium text-gray-700 whitespace-nowrap border-l pl-3">
                {matchProgress.current} / {matchProgress.total}
              </span>
            </div>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleAutoMatch} disabled={isValidating}>
                <Sparkles className="w-4 h-4 mr-2" />
                {lt('Auto Match')}
              </Button>
              <Button variant="outline" size="sm" onClick={validateTransactions} disabled={isValidating}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {isValidating ? lt('Scanning...') : lt('Validate Feed')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {Object.values(groupedTransactions).map((group) => (
          <div key={group.id} className="border rounded-md overflow-hidden">
            <div className="bg-gray-50 p-3 flex items-center justify-between border-b">
              <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => toggleGroup(group.id)}
              >
                {expandedGroups.has(group.id) ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="w-4 h-4 text-blue-500" />
                  {group.fileName}
                  <span className="text-xs text-gray-500 font-normal">
                    {lt('({count} items)', { count: group.transactions.length })}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {group.id !== 'unknown' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setVerifyDocumentId(group.id)}
                  >
                    {lt('Verify Source')}
                  </Button>
                )}
              </div>
            </div>

            {expandedGroups.has(group.id) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        checked={group.transactions.every(t => selectedIds.has(t.id))}
                        onCheckedChange={() => {
                          const allSelected = group.transactions.every(t => selectedIds.has(t.id))
                          const newSelected = new Set(selectedIds)
                          group.transactions.forEach(t => {
                            if (allSelected) newSelected.delete(t.id)
                            else newSelected.add(t.id)
                          })
                          setSelectedIds(newSelected)
                        }}
                      />
                    </TableHead>
                    <TableHead>{lt('Date')}</TableHead>
                    <TableHead>{lt('Description')}</TableHead>
                    <TableHead>{lt('Amount')}</TableHead>
                    <TableHead>{lt('Status')}</TableHead>
                    <TableHead className="text-right">{lt('Action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.transactions.map((tx) => (
                    <TableRow key={tx.id} className={tx.is_duplicate ? 'bg-red-50' : ''}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(tx.id)}
                          onCheckedChange={() => toggleSelect(tx.id)}
                        />
                      </TableCell>
                      <TableCell>{tx.transaction_date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tx.description}
                          {tx.is_duplicate && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{tx.duplicate_reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {tx.confidence_score && tx.confidence_score > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                    tx.confidence_score >= 0.9 ? 'bg-green-50 text-green-700 border-green-200' :
                                    tx.confidence_score >= 0.7 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                    'bg-red-50 text-red-700 border-red-200'
                                  }`}>
                                    <Sparkles className="w-3 h-3" />
                                    {Math.round(tx.confidence_score * 100)}%
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{lt('AI Confidence Score: {percent}%', { percent: Math.round(tx.confidence_score * 100) })}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </TableCell>
                      <TableCell>
                        {tx.status === 'MATCHED' ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {lt('Matched')}
                          </Badge>
                        ) : tx.status === 'EXCLUDED' ? (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                            {lt('Excluded')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            {lt('Pending')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.status === 'MATCHED' ? (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleUnmatch(tx)}>
                            {lt('Unmatch')}
                          </Button>
                        ) : tx.status !== 'EXCLUDED' && (
                          <Button size="sm" variant="outline" onClick={() => handleMatch(tx)}>
                            {lt('Match')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ))}
        
        {transactions.length === 0 && (
          <div className="text-center py-8 text-gray-500 border rounded-md bg-gray-50">
            {lt('No transactions found. Upload a statement to get started.')}
          </div>
        )}
      </div>

      {selectedTransaction && (
        <TransactionMatchModal 
          bankTransaction={selectedTransaction}
          isOpen={isMatchModalOpen}
          onClose={() => setIsMatchModalOpen(false)}
          onMatch={handleMatchComplete}
        />
      )}

      <DuplicateResolutionModal 
        isOpen={isResolveDuplicatesOpen}
        onClose={() => setIsResolveDuplicatesOpen(false)}
        duplicateGroups={duplicateGroups}
        onResolve={handleResolveDuplicates}
      />

      <StatementVerificationModal 
        isOpen={isVerifyStatementsOpen}
        onClose={() => setIsVerifyStatementsOpen(false)}
        accountId={accountId}
      />
      
      {verifyDocumentId && (
        <StatementDetailModal 
          documentId={verifyDocumentId}
          onClose={() => setVerifyDocumentId(null)}
          onSaved={fetchTransactions}
        />
      )}

      <Dialog open={!!unmatchTx} onOpenChange={(open) => !open && setUnmatchTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lt('Unmatch Transaction')}</DialogTitle>
            <DialogDescription>
              {lt('Are you sure you want to unmatch this transaction? It will return to the pending list.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnmatchTx(null)}>{lt('Cancel')}</Button>
            <Button variant="destructive" onClick={confirmUnmatch}>{lt('Unmatch')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}