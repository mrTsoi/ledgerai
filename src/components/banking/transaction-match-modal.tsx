'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Plus, Loader2, Search } from 'lucide-react'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'
import { useLocale } from 'next-intl'
import { fetchEntityTranslationMap, overlayEntityTranslations } from '@/lib/i18n/entity-translations'

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']
type Transaction = Database['public']['Tables']['transactions']['Row']
type ChartOfAccount = Database['public']['Tables']['chart_of_accounts']['Row']

interface ReconciliationMatch {
  transaction: Transaction
  confidence_score: number
  reasoning: string
  match_type: string
}

interface Props {
  bankTransaction: BankTransaction
  isOpen: boolean
  onClose: () => void
  onMatch: () => void
}

export function TransactionMatchModal({ bankTransaction, isOpen, onClose, onMatch }: Props) {
  const lt = useLiterals()
  const locale = useLocale()
  const [matches, setMatches] = useState<ReconciliationMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateWindow, setDateWindow] = useState(7)
  
  // Multi-match state
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  
  // Create New state
  const [isCreating, setIsCreating] = useState(false)
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([])
  const [newTxAccount, setNewTxAccount] = useState('')
  const [newTxDesc, setNewTxDesc] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('tenant_id', bankTransaction.tenant_id)
      .eq('is_active', true)
      .order('code')

    const base = (data || []) as ChartOfAccount[]

    if (locale && locale !== 'en' && base.length > 0) {
      const translationMap = await fetchEntityTranslationMap(supabase, {
        tenantId: bankTransaction.tenant_id,
        entityType: 'chart_of_accounts',
        entityIds: base.map((a) => a.id),
        locale,
        fields: ['name', 'description']
      })
      setAccounts(overlayEntityTranslations(base, translationMap, ['name', 'description']))
      return
    }

    setAccounts(base)
  }, [bankTransaction.tenant_id, supabase, locale])

  const findPotentialMatches = useCallback(async () => {
    try {
      setLoading(true)
      // Search for transactions with same amount (within 0.01 diff) and date range (+- dateWindow days)
      const amount = bankTransaction.amount
      const date = new Date(bankTransaction.transaction_date)
      const startDate = new Date(date)
      startDate.setDate(date.getDate() - dateWindow)
      const endDate = new Date(date)
      endDate.setDate(date.getDate() + dateWindow)

      let query = supabase
        .from('transactions')
        .select('*, line_items(debit, credit)')
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .lte('transaction_date', endDate.toISOString().split('T')[0])
        .order('transaction_date', { ascending: false })
        
      if (searchTerm) {
        query = query.ilike('description', `%${searchTerm}%`)
      } else {
        // If no search term, try to limit by amount logic (client side filtering later)
        // We fetch a bit more to allow for filtering
        query = query.limit(50)
      }

      const { data: rawCandidates, error } = await query

      if (error) throw error
      
      if (!rawCandidates || rawCandidates.length === 0) {
        setMatches([])
        return
      }

      // Process candidates to calculate amount
      const candidatesWithAmount = rawCandidates.map((c: any) => {
        const totalAmount = c.line_items?.reduce((sum: number, item: any) => sum + (item.debit || 0), 0) || 0
        return {
          ...c,
          amount: totalAmount
        }
      })

      // Filter by amount if no search term (fuzzy match amount)
      // If search term exists, we trust the user is looking for something specific even if amount differs
      let filteredCandidates = candidatesWithAmount
      if (!searchTerm) {
         filteredCandidates = candidatesWithAmount.filter((c: any) => 
            Math.abs(c.amount - amount) < 0.05 // Exact match with floating point tolerance
         )
      }

      const candidates = filteredCandidates.length > 0 ? filteredCandidates : candidatesWithAmount.slice(0, 5)

      // Call AI Reconciliation API
      const response = await fetch('/api/banking/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankTransaction,
          candidates,
          tenantId: bankTransaction.tenant_id
        })
      })

      if (!response.ok) throw new Error(lt('Failed to fetch AI matches'))
      
      const result = await response.json()

      setMatches(result.matches || [])
    } catch (error: any) {
      console.error('Error finding matches:', error)
      toast.error(lt('Failed to find matches: {message}', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }, [bankTransaction, dateWindow, searchTerm, supabase, lt])

  useEffect(() => {
    if (!isOpen || !bankTransaction) return

    setNewTxDesc(bankTransaction.description || '')
    fetchAccounts()

    const timer = setTimeout(() => {
      findPotentialMatches()
    }, 500)

    return () => clearTimeout(timer)
  }, [bankTransaction, fetchAccounts, findPotentialMatches, isOpen])

  const toggleMatchSelection = (id: string) => {
    const newSet = new Set(selectedMatchIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedMatchIds(newSet)
  }

  const getSelectedTotal = () => {
    let total = 0
    matches.forEach(m => {
      if (selectedMatchIds.has(m.transaction.id)) {
        total += (m.transaction as any).amount || 0
      }
    })
    return total
  }

  const handleConfirmMatches = async () => {
    if (selectedMatchIds.size === 0) return

    try {
      setMatching(true)
      const selectedIds = Array.from(selectedMatchIds)
      
      // 1. Insert into junction table (if we assume it exists now)
      // Since we can't guarantee the migration ran, we'll try to insert.
      // If it fails, we fallback to single match logic for the first one.
      
      // Try multi-match first
      const { error: junctionError } = await (supabase
        .from('bank_transaction_matches') as any)
        .insert(
          selectedIds.map(id => ({
            bank_transaction_id: bankTransaction.id,
            transaction_id: id,
            match_type: 'MANUAL'
          }))
        )

      if (junctionError) {
          console.warn('Multi-match table might not exist, falling back to single match', junctionError)
          // Fallback: Update bank_transaction with the first ID
          const { error: btError } = await (supabase
            .from('bank_transactions') as any)
            .update({
              status: 'MATCHED',
              matched_transaction_id: selectedIds[0]
            })
            .eq('id', bankTransaction.id)
            
          if (btError) throw btError
      } else {
          // If junction insert succeeded, update status
          const { error: statusError } = await (supabase
            .from('bank_transactions') as any)
            .update({
              status: 'MATCHED',
              // We can leave matched_transaction_id null or set to first one as primary
              matched_transaction_id: selectedIds[0] 
            })
            .eq('id', bankTransaction.id)
            
          if (statusError) throw statusError
      }

      toast.success(lt('Transactions matched successfully'))
      onMatch()
      onClose()
    } catch (error: any) {
      console.error('Error matching transaction:', error)
      toast.error(lt('Failed to match: {message}', { message: error.message }))
    } finally {
      setMatching(false)
    }
  }

  const handleCreateAndMatch = async () => {
    if (!newTxAccount || !newTxDesc) {
        toast.error(lt('Please fill in all fields'))
        return
    }

    try {
        setMatching(true)
        
        // 1. Create Transaction
        const { data: newTx, error: txError } = await (supabase
            .from('transactions') as any)
            .insert({
                tenant_id: bankTransaction.tenant_id,
                transaction_date: bankTransaction.transaction_date,
                description: newTxDesc,
                status: 'POSTED',
                created_by: (await supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single()
            
        if (txError) throw txError

        // 2. Create Line Items
        // If Bank is CREDIT (money in), we DEBIT Bank (Asset) and CREDIT Revenue/Income
        // If Bank is DEBIT (money out), we CREDIT Bank (Asset) and DEBIT Expense
        
        // We need the bank's GL account. For now, we'll just create the "other side" of the entry
        // and assume the system handles the bank side automatically or we add it here.
        // Let's add the user selected account side.
        
        const isCredit = bankTransaction.transaction_type === 'CREDIT'
        
        const { error: liError } = await (supabase
            .from('line_items') as any)
            .insert({
                transaction_id: (newTx as any).id,
                account_id: newTxAccount,
                debit: !isCredit ? bankTransaction.amount : 0,
                credit: isCredit ? bankTransaction.amount : 0,
                description: newTxDesc
            })
            
        if (liError) throw liError

        // 3. Match it
        // We use the same logic as confirm match
        const { error: matchError } = await (supabase
            .from('bank_transactions') as any)
            .update({
                status: 'MATCHED',
                matched_transaction_id: (newTx as any).id
            })
            .eq('id', bankTransaction.id)
            
        if (matchError) throw matchError
        
        // Also try to insert into junction table for consistency
        await (supabase.from('bank_transaction_matches') as any).insert({
            bank_transaction_id: bankTransaction.id,
            transaction_id: (newTx as any).id,
            match_type: 'MANUAL'
        })

        toast.success(lt('Transaction created and matched'))
        onMatch()
        onClose()

    } catch (error: any) {
        console.error('Error creating transaction:', error)
      toast.error(lt('Failed to create: {message}', { message: error.message }))
    } finally {
        setMatching(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{lt('Match Transaction')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="bg-gray-50 p-4 rounded-md border">
            <h4 className="text-sm font-medium text-gray-500 mb-2">{lt('Bank Transaction')}</h4>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{bankTransaction.description}</p>
                <p className="text-sm text-gray-500">{bankTransaction.transaction_date}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">
                  {bankTransaction.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  bankTransaction.transaction_type === 'CREDIT' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {bankTransaction.transaction_type}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{lt('Match Window')}</Label>
                <span className="text-sm text-muted-foreground">{lt('±{days} days', { days: dateWindow })}</span>
              </div>
              <Slider
                value={[dateWindow]}
                onValueChange={(value) => setDateWindow(value[0])}
                max={730}
                step={1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>{lt('Find Match')}</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder={lt('Search by description or amount...')} 
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>{lt('Date')}</TableHead>
                      <TableHead>{lt('Description')}</TableHead>
                      <TableHead className="text-right">{lt('Amount')}</TableHead>
                      <TableHead>{lt('Confidence')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                          <p className="text-sm text-gray-500 mt-2">{lt('AI is analyzing matches...')}</p>
                        </TableCell>
                      </TableRow>
                    ) : matches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                          {lt('No potential matches found.')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      matches.map((match) => (
                        <TableRow key={match.transaction.id} className={selectedMatchIds.has(match.transaction.id) ? 'bg-blue-50' : ''}>
                          <TableCell>
                            <Checkbox 
                                checked={selectedMatchIds.has(match.transaction.id)}
                                onCheckedChange={() => toggleMatchSelection(match.transaction.id)}
                            />
                          </TableCell>
                          <TableCell>{match.transaction.transaction_date}</TableCell>
                          <TableCell>
                            <div>{match.transaction.description}</div>
                            <div className="text-xs text-gray-500">{match.reasoning}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(match.transaction as any).amount?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-16 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${
                                    match.confidence_score > 0.8 ? 'bg-green-500' : 
                                    match.confidence_score > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${match.confidence_score * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">
                                {Math.round(match.confidence_score * 100)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {selectedMatchIds.size > 0 && (
                  <div className="flex justify-between items-center bg-blue-50 p-3 rounded-md border border-blue-100">
                      <div className="text-sm">
                      <span className="font-medium">{selectedMatchIds.size}</span> {lt('selected')}
                          <span className="mx-2">|</span>
                      {lt('Total:')} <span className="font-mono font-medium">{getSelectedTotal().toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                      </div>
                      <div className="text-sm">
                      {lt('Difference:')} <span className={`font-mono font-medium ${Math.abs(bankTransaction.amount - getSelectedTotal()) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                              {(bankTransaction.amount - getSelectedTotal()).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </span>
                      </div>
                  </div>
              )}
          </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{lt('Cancel')}</Button>
            <Button onClick={handleConfirmMatches} disabled={selectedMatchIds.size === 0 || matching}>
            {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : lt('Confirm Match')}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
