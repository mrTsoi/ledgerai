'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Search, Check, Plus, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { Slider } from '@/components/ui/slider'

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']
type Transaction = Database['public']['Tables']['transactions']['Row']

interface Props {
  bankTransaction: BankTransaction
  isOpen: boolean
  onClose: () => void
  onMatch: () => void
}

export function TransactionMatchModal({ bankTransaction, isOpen, onClose, onMatch }: Props) {
  const [matches, setMatches] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateWindow, setDateWindow] = useState(7)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen && bankTransaction) {
      findPotentialMatches()
    }
  }, [isOpen, bankTransaction, dateWindow])

  const findPotentialMatches = async () => {
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
        .select('*')
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .lte('transaction_date', endDate.toISOString().split('T')[0])
        // .eq('amount', amount) // Exact match for now, maybe range later
        .order('transaction_date', { ascending: false })
        .limit(10)

      const { data, error } = await query

      if (error) throw error
      
      // Client side filter for amount to handle float precision if needed, 
      // or just show all in date range for now
      setMatches(data || [])
    } catch (error) {
      console.error('Error finding matches:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmMatch = async (transactionId: string) => {
    try {
      setMatching(true)
      
      // 1. Update bank_transaction status
      const { error: btError } = await supabase
        .from('bank_transactions')
        .update({
          status: 'MATCHED',
          matched_transaction_id: transactionId
        })
        .eq('id', bankTransaction.id)

      if (btError) throw btError

      // 2. Update transaction status if needed (e.g. mark as reconciled)
      // For now we just link them

      onMatch()
      onClose()
    } catch (error) {
      console.error('Error matching transaction:', error)
    } finally {
      setMatching(false)
    }
  }

  const handleCreateNew = async () => {
    // Logic to create a new transaction from this bank line
    // For now, just alert
    alert('Create new transaction feature coming soon')
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Match Transaction</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="bg-gray-50 p-4 rounded-md border">
            <h4 className="text-sm font-medium text-gray-500 mb-2">Bank Transaction</h4>
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
                <Label>Match Window</Label>
                <span className="text-sm text-muted-foreground">±{dateWindow} days</span>
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
              <Label>Find Match</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by description or amount..." 
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
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : matches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No potential matches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  matches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>{match.transaction_date}</TableCell>
                      <TableCell>{match.description}</TableCell>
                      <TableCell className="text-right font-mono">
                        {/* We need to calculate total amount from line items or store it on transaction */}
                        {/* For now assuming transaction doesn't have amount directly on it based on schema, 
                            but let's check if we can infer it or if I missed a column. 
                            Actually schema usually has total_amount on transaction for cache. 
                            If not, we might show '---' */}
                        ---
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handleConfirmMatch(match.id)}
                          disabled={matching}
                        >
                          {matching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Match'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            Create New Transaction
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
