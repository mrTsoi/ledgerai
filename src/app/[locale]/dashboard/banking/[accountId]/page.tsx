'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { BankStatementUpload } from '@/components/banking/bank-statement-upload'
import { ReconciliationFeed } from '@/components/banking/reconciliation-feed'
import { BankStatementList } from '@/components/banking/bank-statement-list'
import { BankAccountSettings } from '@/components/banking/bank-account-settings'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

export default function BankAccountPage() {
  const params = useParams()
  const accountId = params.accountId as string
  const [account, setAccount] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    currentBalance: 0,
    unreconciledCount: 0,
    lastStatementDate: null as string | null
  })
  const supabase = useMemo(() => createClient(), [])

  const fetchStats = useCallback(async () => {
    try {
      // 1. Get latest statement for balance and date
      const { data: latestStatement } = await supabase
        .from('bank_statements')
        .select('closing_balance, end_date')
        .eq('bank_account_id', accountId as string)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 2. Get unreconciled count
      // We filter transactions by joining with bank_statements
      const { count: pendingCount } = await supabase
        .from('bank_transactions')
        .select('id, bank_statements!inner(bank_account_id)', { count: 'exact', head: true })
        .eq('status', 'PENDING')
        .eq('bank_statements.bank_account_id', accountId as string)

      const latest = latestStatement as unknown as { closing_balance?: number; end_date?: string } | null
      setStats({
        currentBalance: latest?.closing_balance ?? 0,
        lastStatementDate: latest?.end_date ?? null,
        unreconciledCount: pendingCount || 0
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [accountId, supabase])

  const fetchAccount = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', accountId)
        .single()

      if (error) throw error
      setAccount(data)
    } catch (error) {
      console.error('Error fetching account:', error)
    } finally {
      setLoading(false)
    }
  }, [accountId, supabase])

  useEffect(() => {
    if (accountId) {
      fetchAccount()
      fetchStats()
    }
  }, [accountId, fetchAccount, fetchStats])

  if (loading) return <div className="p-8">Loading...</div>
  if (!account) return <div className="p-8">Account not found</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/banking">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{account.account_name}</h1>
          <p className="text-muted-foreground">
            {account.bank_name} • {account.currency}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <BankStatementUpload 
            accountId={accountId} 
            onUploadComplete={() => {
              // Refresh feed logic could go here
              window.location.reload() // Simple reload for now
            }} 
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.currentBalance.toLocaleString('en-US', { style: 'currency', currency: account.currency })}
            </div>
            <p className="text-xs text-muted-foreground">
              Calculated from statements
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unreconciled Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unreconciledCount}</div>
            <p className="text-xs text-muted-foreground">
              Transactions pending review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Statement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastStatementDate ? new Date(stats.lastStatementDate).toLocaleDateString() : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.lastStatementDate ? 'Statement end date' : 'No statements uploaded'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="feed" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feed">Transaction Feed</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="feed" className="space-y-4">
          <ReconciliationFeed accountId={accountId} />
        </TabsContent>
        <TabsContent value="statements">
          <BankStatementList accountId={accountId} />
        </TabsContent>
        <TabsContent value="settings">
          <BankAccountSettings accountId={accountId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
