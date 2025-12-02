'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertCircle, Search } from 'lucide-react'
import { useTenant } from '@/hooks/use-tenant'
import { TransactionMatchModal } from './transaction-match-modal'

type BankTransaction = Database['public']['Tables']['bank_transactions']['Row']

interface Props {
  accountId: string
}

export function ReconciliationFeed({ accountId }: Props) {
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false)
  const { currentTenant } = useTenant()
  const supabase = createClient()

  useEffect(() => {
    if (currentTenant && accountId) {
      fetchTransactions()
    }
  }, [currentTenant, accountId])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      // Join with bank_statements to filter by accountId
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_statements!inner (
            bank_account_id
          )
        `)
        .eq('bank_statements.bank_account_id', accountId)
        .order('transaction_date', { ascending: false })

      if (error) throw error
      setTransactions(data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMatch = (transaction: BankTransaction) => {
    setSelectedTransaction(transaction)
    setIsMatchModalOpen(true)
  }

  const handleMatchComplete = () => {
    fetchTransactions()
    setIsMatchModalOpen(false)
    setSelectedTransaction(null)
  }

  if (loading) {
    return <div className="p-8 text-center">Loading feed...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Transaction Feed</h3>
        <div className="flex gap-2">
          {/* Filters could go here */}
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No transactions found. Upload a statement to get started.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.transaction_date}</TableCell>
                  <TableCell>{tx.description}</TableCell>
                  <TableCell className="font-mono">
                    {tx.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.transaction_type === 'CREDIT' ? 'default' : 'secondary'}>
                      {tx.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tx.status === 'MATCHED' ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Matched
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.status !== 'MATCHED' && (
                      <Button size="sm" variant="outline" onClick={() => handleMatch(tx)}>
                        Match
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedTransaction && (
        <TransactionMatchModal 
          bankTransaction={selectedTransaction}
          isOpen={isMatchModalOpen}
          onClose={() => setIsMatchModalOpen(false)}
          onMatch={handleMatchComplete}
        />
      )}
    </div>
  )
}
