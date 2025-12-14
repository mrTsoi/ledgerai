'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, CreditCard, TrendingUp, Users, ArrowRight, Clock, CheckCircle, XCircle, Crown } from 'lucide-react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useSubscription } from '@/hooks/use-subscription'

interface DashboardStats {
  documentCount: number
  pendingTransactions: number
  monthlyRevenue: number
  teamMembers: number
}

interface ActivityItem {
  id: string
  type: 'DOCUMENT' | 'TRANSACTION'
  title: string
  subtitle: string
  status: string
  date: string
}

export default function DashboardPage() {
  const { currentTenant } = useTenant()
  const { subscription, loading: subLoading, refreshSubscription } = useSubscription()
    // Payment Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [checkoutLoading, setCheckoutLoading] = useState(false)
    const [checkoutError, setCheckoutError] = useState<string | null>(null)

    // Show modal if subscription is not active or trialing
    useEffect(() => {
      if (!subLoading && subscription && !['active', 'trialing'].includes(subscription.status)) {
        setShowPaymentModal(true)
      } else {
        setShowPaymentModal(false)
      }
    }, [subscription, subLoading])

    // Stripe Checkout Handler
    const [pendingToken, setPendingToken] = useState<string | null>(null)

    const handleCheckout = async () => {
      setCheckoutLoading(true)
      setCheckoutError(null)
      try {
        if (pendingToken) {
          const res = await fetch('/api/subscriptions/pending/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: pendingToken, returnUrl: window.location.origin + '/dashboard' }),
          })
          if (!res.ok) throw new Error(await res.text())
          const { url } = await res.json()
          window.location.href = url
          return
        }

        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              planId: subscription?.plan_id,
            interval: subscription?.current_period_end && subscription?.current_period_start ?
              (new Date(subscription.current_period_end).getFullYear() - new Date(subscription.current_period_start).getFullYear() >= 1 ? 'year' : 'month') : 'month',
            returnUrl: window.location.origin + '/dashboard',
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        const { url } = await res.json()
        window.location.href = url
      } catch (err: any) {
        setCheckoutError(err.message || 'Failed to start checkout')
      } finally {
        setCheckoutLoading(false)
      }
    }
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id
  // Check for pending subscription after login
  useEffect(() => {
    const checkPending = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email
        if (!email) return
        const res = await fetch(`/api/subscriptions/pending/lookup?email=${encodeURIComponent(email)}`)
        if (!res.ok) return
        const json = await res.json()
        if (json && json.pending) {
          setPendingToken(json.pending.token || null)
          setShowPaymentModal(true)
        }
      } catch (e) {
        // ignore
      }
    }
    checkPending()
  }, [supabase])
  const [stats, setStats] = useState<DashboardStats>({
    documentCount: 0,
    pendingTransactions: 0,
    monthlyRevenue: 0,
    teamMembers: 0
  })
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboardData = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd')

      // 1. Fetch Counts
      const [docsRes, txRes, membersRes] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'DRAFT'),
        supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      ])

      // 2. Fetch Revenue
          const { rpc } = await import('@/lib/supabase/typed')
          const { data: plDataRaw } = await rpc('get_profit_loss', {
        p_tenant_id: tenantId,
        p_start_date: startDate,
        p_end_date: endDate
      })
      
      const plData = plDataRaw as Array<{ account_type?: string; amount?: number }> | null

      const revenue = plData 
        ? plData.filter((row) => row.account_type === 'REVENUE').reduce((sum: number, row) => sum + (row.amount || 0), 0)
        : 0

      setStats({
        documentCount: docsRes.count || 0,
        pendingTransactions: txRes.count || 0,
        monthlyRevenue: revenue,
        teamMembers: membersRes.count || 0
      })

      // 3. Fetch Recent Activity
      const [recentDocs, recentTx] = await Promise.all([
        supabase.from('documents')
          .select('id, file_name, created_at, status')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('transactions')
          .select('id, description, created_at, status, reference_number')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(5)
      ])

      const activities: ActivityItem[] = [
        ...((recentDocs.data as { id: string; file_name: string; created_at: string; status: string }[] ) || []).map(d => ({
          id: d.id,
          type: 'DOCUMENT' as const,
          title: d.file_name,
          subtitle: 'Document Upload',
          status: d.status,
          date: d.created_at
        })),
        ...((recentTx.data as { id: string; description?: string; created_at: string; status: string; reference_number?: string }[] ) || []).map(t => ({
          id: t.id,
          type: 'TRANSACTION' as const,
          title: t.description || 'Untitled Transaction',
          subtitle: t.reference_number ? `Ref: ${t.reference_number}` : 'Transaction',
          status: t.status,
          date: t.created_at
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
       .slice(0, 5)

      setRecentActivity(activities)

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, tenantId])

  useEffect(() => {
    if (tenantId) {
      fetchDashboardData()
    }
  }, [fetchDashboardData, tenantId])

  const statCards = [
    {
      title: 'Total Documents',
      value: stats.documentCount.toString(),
      icon: <FileText className="w-8 h-8 text-blue-600" />,
      description: 'All time',
    },
    {
      title: 'Pending Transactions',
      value: stats.pendingTransactions.toString(),
      icon: <CreditCard className="w-8 h-8 text-yellow-600" />,
      description: 'Draft status',
    },
    {
      title: 'Monthly Revenue',
      value: `$${stats.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <TrendingUp className="w-8 h-8 text-green-600" />,
      description: 'Current month',
    },
    {
      title: 'Team Members',
      value: stats.teamMembers.toString(),
      icon: <Users className="w-8 h-8 text-purple-600" />,
      description: 'Active users',
    },
  ]

  const getStatusIcon = (status: string) => {
    if (['PROCESSED', 'POSTED'].includes(status)) return <CheckCircle className="w-4 h-4 text-green-500" />
    if (['FAILED', 'VOID'].includes(status)) return <XCircle className="w-4 h-4 text-red-500" />
    return <Clock className="w-4 h-4 text-yellow-500" />
  }

  
  return (
    <>
      {/* Payment Required Modal */}
      <Dialog open={showPaymentModal} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscription Required</DialogTitle>
            <DialogDescription>
              {subLoading ? 'Checking your subscription...' : (
                <div>
                  {subscription?.plan_name ? (
                    <>
                      <div className="mb-2">Your current plan: <b>{subscription.plan_name}</b></div>
                      <div className="mb-2">Status: <span className="capitalize">{subscription.status}</span></div>
                    </>
                  ) : (
                    <div className="mb-2">No active subscription found.</div>
                  )}
                  <div className="mb-4 text-red-600 font-medium">You must complete payment to access the dashboard.</div>
                  {checkoutError && <div className="mb-2 text-red-500 text-sm">{checkoutError}</div>}
                  <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full">
                    {checkoutLoading ? 'Redirecting to Payment...' : 'Complete Payment'}
                  </Button>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      {/* Main Dashboard */}
      <div className="space-y-4" aria-hidden={showPaymentModal} style={showPaymentModal ? { filter: 'blur(2px)', pointerEvents: 'none', userSelect: 'none' } : {}}>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '-' : stat.value}</div>
              <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
        </div>
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with these common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link 
              href="/dashboard/documents"
              className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <FileText className="w-6 h-6 text-blue-600" />
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <h3 className="font-medium">Upload Document</h3>
              <p className="text-sm text-gray-500">Add a new invoice or receipt</p>
            </Link>
            
            <Link 
              href="/dashboard/transactions"
              className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <CreditCard className="w-6 h-6 text-green-600" />
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
              <h3 className="font-medium">Create Transaction</h3>
              <p className="text-sm text-gray-500">Manually add a transaction</p>
            </Link>
            
            <Link 
              href="/dashboard/reports"
              className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-6 h-6 text-purple-600" />
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
              </div>
              <h3 className="font-medium">View Reports</h3>
              <p className="text-sm text-gray-500">Check financial reports</p>
            </Link>

            <Link 
              href="/dashboard/settings?tab=billing"
              className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <Crown className="w-6 h-6 text-yellow-600" />
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-yellow-600 transition-colors" />
              </div>
              <h3 className="font-medium">Subscription</h3>
              <p className="text-sm text-gray-500">{subscription?.plan_name || 'Free Plan'}</p>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest transactions and documents</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading activity...</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No recent activity</p>
              <p className="text-sm mt-1">Start by uploading your first document</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${item.type === 'DOCUMENT' ? 'bg-blue-100' : 'bg-green-100'}`}>
                      {item.type === 'DOCUMENT' ? (
                        <FileText className="w-4 h-4 text-blue-600" />
                      ) : (
                        <CreditCard className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      {getStatusIcon(item.status)}
                      <span className="capitalize">{item.status.toLowerCase()}</span>
                    </div>
                    <p className="text-xs text-gray-400 hidden sm:block">
                      {format(new Date(item.date), 'MMM dd, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  )
}
