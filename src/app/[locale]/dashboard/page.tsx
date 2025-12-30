'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/hooks/use-tenant'
import { useDashboardPersonalization } from '@/hooks/use-dashboard-personalization'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FileText, CreditCard, TrendingUp, Users, ArrowRight, Clock, CheckCircle, XCircle, Crown, ChevronUp, ChevronDown, Plus } from 'lucide-react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useSubscription } from '@/hooks/use-subscription'
import { useLiterals } from '@/hooks/use-literals'
import type { DashboardLayoutV1, DashboardWidgetType, WidgetSize, UserRole } from '@/lib/dashboard/registry'
import { getTemplateByKey } from '@/lib/dashboard/registry'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { OnboardingView } from '@/components/dashboard/onboarding-view'

interface DashboardStats {
  documentCount: number
  pendingTransactions: number
  monthlyRevenue: number
  teamMembers: number
}

type DashboardExtraStats = {
  documentsProcessed: number
  documentsFailed: number
  documentsProcessing: number
  transactionsDraft: number
  transactionsPosted: number
  transactionsVoid: number
  monthRevenue: number
  monthExpenses: number
  monthNet: number
}

type ExternalSourceRow = {
  id: string
  name: string
  provider: string
  enabled: boolean | null
  schedule_minutes: number | null
  last_run_at: string | null
  config?: {
    remote_path?: string
    file_glob?: string
    folder_id?: string
    folder_name?: string
  } | null
}

type ExternalSourceRunRow = {
  source_id: string
  status: 'RUNNING' | 'SUCCESS' | 'ERROR' | 'SKIPPED' | string
  started_at: string | null
  finished_at: string | null
  inserted_count: number | null
  message: string | null
}

type ExternalCronConfig = {
  configured: boolean
  enabled: boolean
  default_run_limit: number
  key_prefix?: string | null
}

type UsageSummary = {
  total_calls: number
  success_calls: number
  error_calls: number
  tokens_input: number
  tokens_output: number
}

type TrendSummary = {
  docs_current_7d: number
  docs_prev_7d: number
  revenue_current_month: number
  revenue_prev_month: number
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
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const {
    tenantId: personalizationTenantId,
    selectedTemplateKey,
    layout,
    setLayout,
    isCustomizing,
  } = useDashboardPersonalization()
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
        const res = await fetch(`/api/subscriptions/pending/lookup`)
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
  const [extraStats, setExtraStats] = useState<DashboardExtraStats>({
    documentsProcessed: 0,
    documentsFailed: 0,
    documentsProcessing: 0,
    transactionsDraft: 0,
    transactionsPosted: 0,
    transactionsVoid: 0,
    monthRevenue: 0,
    monthExpenses: 0,
    monthNet: 0,
  })
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  const templateRole: UserRole | null = useMemo(() => {
    if (!selectedTemplateKey) return null
    const tpl = getTemplateByKey(selectedTemplateKey)
    return tpl?.role ?? null
  }, [selectedTemplateKey])

  const widgetLabels: Record<DashboardWidgetType, string> = {
    kpis: lt('KPIs'),
    quick_actions: lt('Quick Actions'),
    recent_activity: lt('Recent Activity'),
    subscription_status: lt('Subscription Status'),
    admin_shortcuts: lt('Admin Shortcuts'),
    alerts: lt('Alerts'),
    work_queue: lt('Work Queue'),
    document_pipeline: lt('Document Pipeline'),
    transaction_health: lt('Transaction Health'),
    profit_loss_snapshot: lt('Profit & Loss Snapshot'),
    external_import_schedule: lt('Import Schedule'),
    next_steps: lt('What to do next'),
    usage: lt('Usage'),
    reports_overview: lt('Reports'),
    trends: lt('Trends'),
  }

  const addableWidgets: DashboardWidgetType[] = useMemo(() => {
    const role = templateRole
    if (!role) {
      return ['kpis', 'quick_actions', 'recent_activity', 'subscription_status', 'alerts', 'work_queue', 'document_pipeline', 'transaction_health', 'profit_loss_snapshot']
    }
    switch (role) {
      case 'OPERATOR':
        return ['quick_actions', 'recent_activity', 'alerts', 'work_queue', 'document_pipeline', 'external_import_schedule', 'next_steps', 'reports_overview', 'trends', 'subscription_status', 'kpis']
      case 'ACCOUNTANT':
        return ['transaction_health', 'profit_loss_snapshot', 'work_queue', 'recent_activity', 'alerts', 'external_import_schedule', 'next_steps', 'reports_overview', 'trends', 'usage', 'subscription_status', 'kpis', 'quick_actions']
      case 'SUPER_ADMIN':
        return ['admin_shortcuts', 'alerts', 'usage', 'trends', 'recent_activity', 'subscription_status', 'kpis']
      case 'COMPANY_ADMIN':
      default:
        return ['kpis', 'profit_loss_snapshot', 'transaction_health', 'work_queue', 'document_pipeline', 'alerts', 'external_import_schedule', 'next_steps', 'reports_overview', 'trends', 'usage', 'quick_actions', 'recent_activity', 'subscription_status']
    }
  }, [templateRole])

  const [addWidgetOpen, setAddWidgetOpen] = useState(false)

  const [externalSources, setExternalSources] = useState<ExternalSourceRow[]>([])
  const [externalRunsBySourceId, setExternalRunsBySourceId] = useState<Record<string, ExternalSourceRunRow | null>>({})
  const [externalCronConfig, setExternalCronConfig] = useState<ExternalCronConfig | null>(null)

  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null)
  const [trendSummary, setTrendSummary] = useState<TrendSummary>({
    docs_current_7d: 0,
    docs_prev_7d: 0,
    revenue_current_month: 0,
    revenue_prev_month: 0,
  })

  const fetchDashboardData = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd')

      const now = new Date()
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

      // 1. Fetch Counts
      const [docsRes, txDraftRes, membersRes] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'DRAFT'),
        supabase.from('memberships').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      ])

      const [docProcessedRes, docFailedRes, docProcessingRes, txPostedRes, txVoidRes] = await Promise.all([
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'PROCESSED'),
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'FAILED'),
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'PROCESSING'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'POSTED'),
        supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'VOID'),
      ])

      // 2. Fetch Revenue (server-side RPC via secure API)
      let plData: Array<{ account_type?: string; amount?: number }> | null = null
      try {
        const res = await fetch(`/api/dashboard/profit-loss?p_tenant_id=${encodeURIComponent(tenantId)}&p_start_date=${encodeURIComponent(startDate)}&p_end_date=${encodeURIComponent(endDate)}`)
        if (res.ok) {
          const json = await res.json()
          plData = json?.data as Array<{ account_type?: string; amount?: number }> | null
        } else {
          plData = null
        }
      } catch (e) {
        plData = null
      }

      const revenue = plData
        ? plData.filter((row) => row.account_type === 'REVENUE').reduce((sum: number, row) => sum + (row.amount || 0), 0)
        : 0

      const expenses = plData
        ? plData.filter((row) => row.account_type === 'EXPENSE').reduce((sum: number, row) => sum + (row.amount || 0), 0)
        : 0

      const net = revenue - expenses

      // 2b. Previous month revenue for trend
      let prevRevenue = 0
      try {
        const prevStart = format(prevMonthStart, 'yyyy-MM-dd')
        const prevEnd = format(new Date(currentMonthStart.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
        const resPrev = await fetch(
          `/api/dashboard/profit-loss?p_tenant_id=${encodeURIComponent(tenantId)}&p_start_date=${encodeURIComponent(prevStart)}&p_end_date=${encodeURIComponent(prevEnd)}`
        )
        if (resPrev.ok) {
          const jsonPrev = await resPrev.json()
          const prevData = (jsonPrev?.data || []) as Array<{ account_type?: string; amount?: number }>
          prevRevenue = prevData
            .filter((row) => row.account_type === 'REVENUE')
            .reduce((sum: number, row) => sum + (row.amount || 0), 0)
        }
      } catch {
        prevRevenue = 0
      }

      setStats({
        documentCount: docsRes.count || 0,
        pendingTransactions: txDraftRes.count || 0,
        monthlyRevenue: revenue,
        teamMembers: membersRes.count || 0
      })

      setExtraStats({
        documentsProcessed: docProcessedRes.count || 0,
        documentsFailed: docFailedRes.count || 0,
        documentsProcessing: docProcessingRes.count || 0,
        transactionsDraft: txDraftRes.count || 0,
        transactionsPosted: txPostedRes.count || 0,
        transactionsVoid: txVoidRes.count || 0,
        monthRevenue: revenue,
        monthExpenses: expenses,
        monthNet: net,
      })

      // 4. External import schedule (sources + last run)
      try {
        const sourcesRes = await supabase
          .from('external_document_sources')
          .select('id, name, provider, enabled, schedule_minutes, last_run_at, config')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })

        if (!sourcesRes.error) {
          const sources = (sourcesRes.data || []) as any as ExternalSourceRow[]
          setExternalSources(sources)

          if (sources.length > 0) {
            const runsRes = await supabase
              .from('external_document_source_runs')
              .select('source_id, status, started_at, finished_at, inserted_count, message')
              .eq('tenant_id', tenantId)
              .order('started_at', { ascending: false })
              .limit(50)

            if (!runsRes.error) {
              const runs = (runsRes.data || []) as any as ExternalSourceRunRow[]
              const map: Record<string, ExternalSourceRunRow | null> = {}
              for (const s of sources) map[s.id] = null
              for (const r of runs) {
                if (!map[r.source_id]) map[r.source_id] = r
              }
              setExternalRunsBySourceId(map)
            }
          } else {
            setExternalRunsBySourceId({})
          }
        }
      } catch {
        // ignore
      }

      try {
        const cronRes = await fetch(`/api/external-sources/cron?tenant_id=${encodeURIComponent(tenantId)}`)
        if (cronRes.ok) {
          const json = await cronRes.json()
          setExternalCronConfig({
            configured: !!json.configured,
            enabled: !!json.enabled,
            default_run_limit: Number(json.default_run_limit ?? 10),
            key_prefix: json.key_prefix ?? null,
          })
        } else {
          setExternalCronConfig(null)
        }
      } catch {
        setExternalCronConfig(null)
      }

      // 5. Usage summary (AI)
      try {
        const u = await fetch(`/api/dashboard/usage?tenant_id=${encodeURIComponent(tenantId)}`)
        if (u.ok) {
          const json = await u.json()
          setUsageSummary(json?.usage ?? null)
        } else {
          setUsageSummary(null)
        }
      } catch {
        setUsageSummary(null)
      }

      // 6. Simple trends
      try {
        const [docsCurrent7d, docsPrev7d] = await Promise.all([
          supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', sevenDaysAgo.toISOString()),
          supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .gte('created_at', fourteenDaysAgo.toISOString())
            .lt('created_at', sevenDaysAgo.toISOString()),
        ])

        setTrendSummary({
          docs_current_7d: docsCurrent7d.count || 0,
          docs_prev_7d: docsPrev7d.count || 0,
          revenue_current_month: revenue,
          revenue_prev_month: prevRevenue,
        })
      } catch {
        setTrendSummary((prev) => ({ ...prev, revenue_current_month: revenue, revenue_prev_month: prevRevenue }))
      }

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
          title: d.file_name || lt('Unnamed Document'),
          subtitle: lt('Document Upload'),
          status: d.status,
          date: d.created_at
        })),
        ...((recentTx.data as { id: string; description?: string; created_at: string; status: string; reference_number?: string }[] ) || []).map(t => ({
          id: t.id,
          type: 'TRANSACTION' as const,
          title: t.description || lt('Untitled Transaction'),
          subtitle: t.reference_number ? lt('Ref: {ref}', { ref: t.reference_number }) : lt('Transaction'),
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
  }, [supabase, tenantId, lt])


  useEffect(() => {
    if (tenantId) {
      fetchDashboardData()
    }
  }, [fetchDashboardData, tenantId])

  const statCards = [
    {
      title: lt('Total Documents'),
      value: stats.documentCount.toString(),
      icon: <FileText className="w-8 h-8 text-blue-600" />,
      description: lt('All time'),
    },
    {
      title: lt('Pending Transactions'),
      value: stats.pendingTransactions.toString(),
      icon: <CreditCard className="w-8 h-8 text-yellow-600" />,
      description: lt('Draft status'),
    },
    {
      title: lt('Monthly Revenue'),
      value: `$${stats.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <TrendingUp className="w-8 h-8 text-green-600" />,
      description: lt('Current month'),
    },
    {
      title: lt('Team Members'),
      value: stats.teamMembers.toString(),
      icon: <Users className="w-8 h-8 text-purple-600" />,
      description: lt('Active users'),
    },
  ]

  const getStatusIcon = (status: string) => {
    if (['PROCESSED', 'POSTED'].includes(status)) return <CheckCircle className="w-4 h-4 text-green-500" />
    if (['FAILED', 'VOID'].includes(status)) return <XCircle className="w-4 h-4 text-red-500" />
    return <Clock className="w-4 h-4 text-yellow-500" />
  }

  // If tenant context and personalization get out of sync, prefer tenant context.
  const effectiveTenantId = tenantId || personalizationTenantId

  const updateLayout = (fn: (l: DashboardLayoutV1) => DashboardLayoutV1) => {
    setLayout((prev) => {
      if (!prev) return prev
      const next = fn(JSON.parse(JSON.stringify(prev)) as DashboardLayoutV1)
      return next
    })
  }

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    updateLayout((l) => {
      const idx = l.order.indexOf(widgetId)
      if (idx < 0) return l
      const swapWith = direction === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= l.order.length) return l
      const nextOrder = [...l.order]
      ;[nextOrder[idx], nextOrder[swapWith]] = [nextOrder[swapWith], nextOrder[idx]]
      return { ...l, order: nextOrder }
    })
  }

  const setWidgetHidden = (widgetId: string, hidden: boolean) => {
    updateLayout((l) => {
      return {
        ...l,
        widgets: l.widgets.map((w) => (w.id === widgetId ? { ...w, hidden } : w)),
      }
    })
  }

  const setWidgetSize = (widgetId: string, size: WidgetSize) => {
    updateLayout((l) => {
      return {
        ...l,
        widgets: l.widgets.map((w) => (w.id === widgetId ? { ...w, size } : w)),
      }
    })
  }

  const addWidget = (type: DashboardWidgetType) => {
    if (!layout) return

    const makeId = () => {
      const c: any = globalThis as any
      const suffix = typeof c?.crypto?.randomUUID === 'function'
        ? c.crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      return `w_${type}_${suffix}`
    }

    updateLayout((l) => {
      const existing = new Set(l.widgets.map(w => w.id))
      let id = makeId()
      while (existing.has(id)) id = makeId()

      return {
        ...l,
        widgets: [...l.widgets, { id, type, size: 'M' as WidgetSize }],
        order: [...l.order, id],
      }
    })
  }

  const colSpanClass = (size: WidgetSize) => {
    if (size === 'S') return 'col-span-12 lg:col-span-4'
    if (size === 'M') return 'col-span-12 lg:col-span-6'
    return 'col-span-12'
  }

  const renderWidget = (type: DashboardWidgetType) => {
    switch (type) {
      case 'kpis':
        return (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat, index) => (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                  {stat.icon}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{loading ? '-' : stat.value}</div>
                  <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      case 'quick_actions':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Quick Actions')}</CardTitle>
              <CardDescription>{lt('Get started with these common tasks')}</CardDescription>
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
                  <p className="text-sm text-gray-500">{lt('Add a new invoice or receipt')}</p>
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
                  <p className="text-sm text-gray-500">{lt('Manually add a transaction')}</p>
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
                  <p className="text-sm text-gray-500">{lt('Check financial reports')}</p>
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
                  <p className="text-sm text-gray-500">{subscription?.plan_name || lt('Free Plan')}</p>
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'recent_activity':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Recent Activity')}</CardTitle>
              <CardDescription>{lt('Your latest transactions and documents')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">{lt('Loading activity...')}</div>
              ) : recentActivity.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>{lt('No recent activity')}</p>
                  <p className="text-sm mt-1">{lt('Start by uploading your first document')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${item.type === 'DOCUMENT' ? 'bg-blue-100' : 'bg-green-100'}`}
                        >
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
        )
      case 'subscription_status':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Subscription')}</CardTitle>
              <CardDescription>{lt('Plan and access status')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-600">{lt('Plan')}</div>
                  <div className="text-base font-medium">{subscription?.plan_name || lt('Free Plan')}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">{lt('Status')}</div>
                  <Badge variant={subscription?.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                    {subscription?.status || lt('unknown')}
                  </Badge>
                </div>
              </div>
              <div className="mt-4">
                <Link href="/dashboard/settings?tab=billing" className="text-sm text-primary underline">
                  {lt('Manage billing')}
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'admin_shortcuts':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Admin Shortcuts')}</CardTitle>
              <CardDescription>{lt('Platform administration')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Link href="/admin">
                  <Button variant="outline" size="sm">{lt('Go to Admin')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'alerts':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Alerts')}</CardTitle>
              <CardDescription>{lt('What needs attention right now')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {subscription && !['active', 'trialing'].includes(subscription.status) && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Billing issue')}</div>
                      <div className="text-gray-500">Subscription is {subscription.status}</div>
                    </div>
                    <Link href="/dashboard/settings?tab=billing" className="text-primary underline">{lt('Fix')}</Link>
                  </div>
                )}

                {extraStats.documentsFailed > 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Failed documents')}</div>
                      <div className="text-gray-500">{extraStats.documentsFailed} need review</div>
                    </div>
                    <Link href="/dashboard/documents" className="text-primary underline">{lt('View')}</Link>
                  </div>
                )}

                {extraStats.transactionsDraft > 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Draft transactions')}</div>
                      <div className="text-gray-500">{extraStats.transactionsDraft} pending</div>
                    </div>
                    <Link href="/dashboard/transactions" className="text-primary underline">{lt('Review')}</Link>
                  </div>
                )}

                {subscription && ['active', 'trialing'].includes(subscription.status) && extraStats.documentsFailed === 0 && extraStats.transactionsDraft === 0 && (
                  <div className="text-gray-500">{lt('No urgent alerts.')}</div>
                )}

                {!subscription && (
                  <div className="text-gray-500">{lt('Loading alerts…')}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      case 'profit_loss_snapshot':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Profit & Loss')}</CardTitle>
              <CardDescription>{lt('Current month snapshot')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Revenue')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : `$${extraStats.monthRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Expenses')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : `$${extraStats.monthExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Net')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : `$${extraStats.monthNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                </div>
              </div>
              <div className="mt-4">
                <Link href="/dashboard/reports" className="text-sm text-primary underline">{lt('Open reports')}</Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'document_pipeline':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Document Pipeline')}</CardTitle>
              <CardDescription>{lt('Status breakdown')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Processing')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.documentsProcessing}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Processed')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.documentsProcessed}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Failed')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.documentsFailed}</div>
                </div>
              </div>
              <div className="mt-4">
                <Link href="/dashboard/documents" className="text-sm text-primary underline">{lt('Go to documents')}</Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'transaction_health':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Transaction Health')}</CardTitle>
              <CardDescription>{lt('Status breakdown')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Draft')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.transactionsDraft}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Posted')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.transactionsPosted}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Void')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : extraStats.transactionsVoid}</div>
                </div>
              </div>
              <div className="mt-4">
                <Link href="/dashboard/transactions" className="text-sm text-primary underline">{lt('Go to transactions')}</Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'work_queue':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Work Queue')}</CardTitle>
              <CardDescription>{lt('Next actions for this tenant')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">{lt('Draft transactions')}</div>
                    <div className="text-gray-500">{loading ? '-' : extraStats.transactionsDraft} pending</div>
                  </div>
                  <Link href="/dashboard/transactions" className="text-primary underline">{lt('Open')}</Link>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">{lt('Failed documents')}</div>
                    <div className="text-gray-500">{loading ? '-' : extraStats.documentsFailed} need review</div>
                  </div>
                  <Link href="/dashboard/documents" className="text-primary underline">{lt('Open')}</Link>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">{lt('Documents processing')}</div>
                    <div className="text-gray-500">{loading ? '-' : extraStats.documentsProcessing} in progress</div>
                  </div>
                  <Link href="/dashboard/documents" className="text-primary underline">{lt('View')}</Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case 'reports_overview':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Reports')}</CardTitle>
              <CardDescription>{lt('Financial reporting shortcuts')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link href="/dashboard/reports" className="rounded-md border p-3 hover:bg-gray-50">
                  <div className="font-medium text-sm">{lt('Financial Reports')}</div>
                  <div className="text-xs text-gray-500">{lt('P&L, balance sheet, exports')}</div>
                </Link>
                <Link href="/dashboard/transactions" className="rounded-md border p-3 hover:bg-gray-50">
                  <div className="font-medium text-sm">{lt('Transactions')}</div>
                  <div className="text-xs text-gray-500">{lt('Review drafts and postings')}</div>
                </Link>
              </div>
              <div className="mt-4">
                <Link href="/dashboard/reports" className="text-sm text-primary underline">{lt('Open reports')}</Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'external_import_schedule':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Import Schedule')}</CardTitle>
              <CardDescription>{lt('External sources and next runs')}</CardDescription>
            </CardHeader>
            <CardContent>
              {externalSources.length === 0 ? (
                <div className="text-sm text-gray-500">
                  {lt('No external sources configured.')}
                  <div className="mt-2">
                    <Link href="/dashboard/settings?tab=external-sources" className="text-primary underline">{lt('Set up External Sources')}</Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {externalCronConfig ? (
                    <div className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Scheduler</div>
                        <Badge variant={externalCronConfig.enabled ? 'default' : 'secondary'}>
                          {externalCronConfig.configured ? (externalCronConfig.enabled ? 'Enabled' : 'Disabled') : 'Not configured'}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Default run limit: {externalCronConfig.default_run_limit}
                      </div>
                    </div>
                  ) : null}

                  {externalSources.map((s) => {
                    const schedule = Number(s.schedule_minutes || 60)
                    const lastRun = s.last_run_at ? new Date(s.last_run_at) : null
                    const nextRun = lastRun ? new Date(lastRun.getTime() + schedule * 60 * 1000) : null
                    const run = externalRunsBySourceId[s.id] || null

                    const cfg = (s.config || {}) as any
                    const remotePath = typeof cfg.remote_path === 'string' && cfg.remote_path.trim().length > 0 ? cfg.remote_path : null
                    const fileGlob = typeof cfg.file_glob === 'string' && cfg.file_glob.trim().length > 0 ? cfg.file_glob : null
                    const folderName = typeof cfg.folder_name === 'string' && cfg.folder_name.trim().length > 0 ? cfg.folder_name : null
                    const folderId = typeof cfg.folder_id === 'string' && cfg.folder_id.trim().length > 0 ? cfg.folder_id : null

                    const detail = (() => {
                      if (s.provider === 'GOOGLE_DRIVE' || s.provider === 'ONEDRIVE') {
                        if (folderName) return `Folder: ${folderName}`
                        if (folderId) return `Folder ID: ${folderId}`
                        return 'Folder: not set'
                      }
                      const parts: string[] = []
                      if (remotePath) parts.push(`Path: ${remotePath}`)
                      if (fileGlob) parts.push(`Glob: ${fileGlob}`)
                      if (parts.length === 0) return 'Path/glob not set'
                      return parts.join(' • ')
                    })()

                    return (
                      <div key={s.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">{s.name}</div>
                            <div className="text-xs text-gray-500">
                              {s.provider} • every {schedule} min • {s.enabled === false ? 'disabled' : 'enabled'}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">{detail}</div>
                          </div>
                          {run ? (
                            <Badge variant={run.status === 'SUCCESS' ? 'default' : run.status === 'ERROR' ? 'destructive' : 'secondary'}>
                              {run.status}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">No runs yet</Badge>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-gray-600">
                          <div>
                            Last run: {lastRun ? format(lastRun, 'MMM dd, HH:mm') : '—'}
                          </div>
                          <div>
                            Next run: {nextRun ? format(nextRun, 'MMM dd, HH:mm') : '—'}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div>
                    <Link href="/tenant-admin?tab=external-sources" className="text-sm text-primary underline">{lt('Manage external sources')}</Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      case 'next_steps':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('What to do next')}</CardTitle>
              <CardDescription>{lt('Suggested actions based on your activity')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {stats.documentCount === 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Upload your first document')}</div>
                      <div className="text-gray-500">{lt('Start building your records')}</div>
                    </div>
                    <Link href="/dashboard/documents" className="text-primary underline">{lt('Upload')}</Link>
                  </div>
                )}

                {externalSources.length === 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Connect an import source')}</div>
                      <div className="text-gray-500">{lt('Schedule folder/SFTP imports')}</div>
                    </div>
                    <Link href="/dashboard/settings?tab=external-sources" className="text-primary underline">{lt('Set up')}</Link>
                  </div>
                )}

                {extraStats.transactionsDraft > 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Review draft transactions')}</div>
                      <div className="text-gray-500">{extraStats.transactionsDraft} drafts waiting</div>
                    </div>
                    <Link href="/dashboard/transactions" className="text-primary underline">{lt('Review')}</Link>
                  </div>
                )}

                {extraStats.documentsFailed > 0 && (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="font-medium">{lt('Fix failed documents')}</div>
                      <div className="text-gray-500">{extraStats.documentsFailed} failed</div>
                    </div>
                    <Link href="/dashboard/documents" className="text-primary underline">{lt('View')}</Link>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">{lt('Generate a report')}</div>
                    <div className="text-gray-500">{lt('P&L, balance sheet, exports')}</div>
                  </div>
                  <Link href="/dashboard/reports" className="text-primary underline">{lt('Open')}</Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      case 'usage':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Usage')}</CardTitle>
              <CardDescription>{lt('AI usage for this tenant (this month)')}</CardDescription>
            </CardHeader>
            <CardContent>
              {!usageSummary ? (
                <div className="text-sm text-gray-500">{lt('Usage data not available.')}</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-gray-600">{lt('Calls')}</div>
                    <div className="text-lg font-semibold">{usageSummary.total_calls.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{usageSummary.success_calls.toLocaleString()} {lt('success')} • {usageSummary.error_calls.toLocaleString()} {lt('error')}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-gray-600">{lt('Tokens')}</div>
                    <div className="text-lg font-semibold">{(usageSummary.tokens_input + usageSummary.tokens_output).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{lt('In')} {usageSummary.tokens_input.toLocaleString()} • {lt('Out')} {usageSummary.tokens_output.toLocaleString()}</div>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <Link href="/dashboard/settings?tab=ai" className="text-sm text-primary underline">{lt('AI settings')}</Link>
              </div>
            </CardContent>
          </Card>
        )
      case 'trends':
        return (
          <Card>
            <CardHeader>
              <CardTitle>{lt('Trends')}</CardTitle>
              <CardDescription>{lt('Recent activity signals')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Documents (7 days)')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : trendSummary.docs_current_7d}</div>
                  <div className="text-xs text-gray-500">{lt('Prev 7 days:')} {loading ? '-' : trendSummary.docs_prev_7d}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-gray-600">{lt('Revenue (month)')}</div>
                  <div className="text-lg font-semibold">{loading ? '-' : `$${trendSummary.revenue_current_month.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                  <div className="text-xs text-gray-500">{lt('Prev month:')} {loading ? '-' : `$${trendSummary.revenue_prev_month.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      default:
        return null
    }
  }

  
  return (
    <>
      {/* Payment Required Modal */}
      <Dialog open={showPaymentModal} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lt('Subscription Required')}</DialogTitle>
            <DialogDescription>
              {subLoading ? lt('Checking your subscription...') : (
                <div>
                  {subscription?.plan_name ? (
                    <>
                      <div className="mb-2">{lt('Your current plan:')} <b>{subscription.plan_name}</b></div>
                      <div className="mb-2">{lt('Status:')} <span className="capitalize">{subscription.status}</span></div>
                    </>
                  ) : (
                    <div className="mb-2">{lt('No active subscription found.')}</div>
                  )}
                  <div className="mb-4 text-red-600 font-medium">{lt('You must complete payment to access the dashboard.')}</div>
                  {checkoutError && <div className="mb-2 text-red-500 text-sm">{checkoutError}</div>}
                  <Button onClick={handleCheckout} disabled={checkoutLoading} className="w-full">
                    {checkoutLoading ? lt('Redirecting to Payment...') : lt('Complete Payment')}
                  </Button>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      {/* Main Dashboard */}
      <TooltipProvider>
        <div
          className="space-y-4"
          aria-hidden={showPaymentModal}
          style={showPaymentModal ? { filter: 'blur(2px)', pointerEvents: 'none', userSelect: 'none' } : {}}
        >
          {!effectiveTenantId ? (
            <OnboardingView />
          ) : !layout || !selectedTemplateKey ? (
            <Card>
              <CardHeader>
                <CardTitle>{lt('Loading dashboard…')}</CardTitle>
                <CardDescription>{lt('Fetching your template and layout.')}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-600">
                  {lt('Template:')}{' '}
                  <span className="font-medium">
                    {(() => {
                      const template = getTemplateByKey(selectedTemplateKey)
                      const title = (template as any)?.name
                      return title ? lt(String(title)) : selectedTemplateKey
                    })()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isCustomizing && layout && (
                    <Popover open={addWidgetOpen} onOpenChange={setAddWidgetOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          {lt('Add widget')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder={lt('Search widgets…')} />
                          <CommandList>
                            <CommandEmpty>{lt('No widgets found.')}</CommandEmpty>
                            <CommandGroup heading={lt('Widgets')}>
                              {addableWidgets
                                .filter((type) => {
                                  const existingTypes = new Set(layout.widgets.map(w => w.type))
                                  return !existingTypes.has(type)
                                })
                                .map((type) => (
                                  <CommandItem
                                    key={type}
                                    value={type}
                                    keywords={[widgetLabels[type]]}
                                    className="cursor-pointer"
                                    onSelect={() => {
                                      addWidget(type)
                                      setAddWidgetOpen(false)
                                    }}
                                  >
                                    {widgetLabels[type]}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}

                  {isCustomizing && (
                    <Badge variant="secondary">{lt('Customizing')}</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6">
                {layout.order
                  .map((id) => layout.widgets.find((w) => w.id === id))
                  .filter(Boolean)
                  .map((w) => {
                    const widget = w as DashboardLayoutV1['widgets'][number]
                    const hidden = widget.hidden === true

                    if (hidden && !isCustomizing) return null

                    return (
                      <div key={widget.id} className={colSpanClass(widget.size)}>
                        <div className={hidden ? 'opacity-60' : ''}>
                          {isCustomizing && (
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => moveWidget(widget.id, 'up')}
                                      aria-label={lt('Move widget up')}
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{lt('Move up')}</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => moveWidget(widget.id, 'down')}
                                      aria-label={lt('Move widget down')}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{lt('Move down')}</TooltipContent>
                                </Tooltip>

                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600">{lt('Hide')}</span>
                                  <Switch
                                    checked={!hidden}
                                    onCheckedChange={(checked) => setWidgetHidden(widget.id, !checked)}
                                    aria-label={lt('Toggle widget visibility')}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">{lt('Size')}</span>
                                <Select
                                  value={widget.size}
                                  onValueChange={(v) => setWidgetSize(widget.id, v as WidgetSize)}
                                >
                                  <SelectTrigger className="h-9 w-[110px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="S">{lt('Small')}</SelectItem>
                                    <SelectItem value="M">{lt('Medium')}</SelectItem>
                                    <SelectItem value="L">{lt('Large')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          {hidden ? (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">{lt('Hidden widget')}</CardTitle>
                                <CardDescription>{widget.type}</CardDescription>
                              </CardHeader>
                            </Card>
                          ) : (
                            renderWidget(widget.type)
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}
        </div>
      </TooltipProvider>
    </>
  )
}
