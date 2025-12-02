'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Users, Building2, FileText, CreditCard, HardDrive, TrendingUp, DollarSign, Activity } from 'lucide-react'
import { DashboardCustomizer } from './dashboard-customizer'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts'

interface SystemStats {
  total_tenants: number
  active_tenants: number
  total_users: number
  total_documents: number
  total_transactions: number
  storage_used_gb: number
}

interface TrendData {
  date: string
  new_tenants: number
  new_users: number
  new_documents: number
  new_transactions: number
}

interface RevenueStats {
  total_mrr: number
  active_subscriptions: number
  plan_breakdown: { name: string; count: number; revenue: number }[]
}

export function SystemOverview() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [trends, setTrends] = useState<TrendData[]>([])
  const [revenue, setRevenue] = useState<RevenueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>({
    total_tenants: true,
    total_users: true,
    documents: true,
    transactions: true,
    storage_used: true,
    growth_rate: true,
    revenue: true,
    active_subs: true
  })
  const supabase = createClient()

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [statsRes, trendsRes, revenueRes] = await Promise.all([
        supabase.rpc('get_system_overview'),
        supabase.rpc('get_system_trends'),
        supabase.rpc('get_subscription_stats')
      ])

      if (statsRes.data && statsRes.data.length > 0) setStats(statsRes.data[0])
      if (trendsRes.data) setTrends(trendsRes.data)
      if (revenueRes.data && revenueRes.data.length > 0) setRevenue(revenueRes.data[0])

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCard = (key: string, value: boolean) => {
    setVisibleCards(prev => ({ ...prev, [key]: value }))
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  const statCards = [
    {
      key: 'total_tenants',
      title: 'Total Tenants',
      value: stats?.total_tenants || 0,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      subtitle: `${stats?.active_tenants || 0} active this month`
    },
    {
      key: 'total_users',
      title: 'Total Users',
      value: stats?.total_users || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      subtitle: 'Across all tenants'
    },
    {
      key: 'revenue',
      title: 'Monthly Revenue',
      value: `$${revenue?.total_mrr?.toLocaleString() || '0'}`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
      subtitle: 'Estimated MRR'
    },
    {
      key: 'active_subs',
      title: 'Active Subscriptions',
      value: revenue?.active_subscriptions || 0,
      icon: Activity,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-100',
      subtitle: 'Paying customers'
    },
    {
      key: 'documents',
      title: 'Documents',
      value: stats?.total_documents.toLocaleString() || 0,
      icon: FileText,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      subtitle: 'Total uploaded'
    },
    {
      key: 'transactions',
      title: 'Transactions',
      value: stats?.total_transactions.toLocaleString() || 0,
      icon: CreditCard,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      subtitle: 'Posted transactions'
    },
    {
      key: 'storage_used',
      title: 'Storage Used',
      value: `${stats?.storage_used_gb.toFixed(2) || 0} GB`,
      icon: HardDrive,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      subtitle: 'Total storage'
    },
    {
      key: 'growth_rate',
      title: 'Growth Rate',
      value: `${Math.round(((stats?.active_tenants || 0) / Math.max(stats?.total_tenants || 1, 1)) * 100)}%`,
      icon: TrendingUp,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
      subtitle: 'Active tenant ratio'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">System Overview</h2>
          <p className="text-gray-600">Platform-wide statistics and health metrics</p>
        </div>
        <DashboardCustomizer visibleCards={visibleCards} onToggle={toggleCard} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.filter(c => visibleCards[c.key]).map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.key} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold mt-2">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Growth Trends (30 Days)</CardTitle>
            <CardDescription>New tenants, users, and documents over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="colorTenants" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                  />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <Tooltip 
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="new_tenants" name="New Tenants" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTenants)" />
                  <Area type="monotone" dataKey="new_users" name="New Users" stroke="#22c55e" fillOpacity={1} fill="url(#colorUsers)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Volume</CardTitle>
            <CardDescription>Document processing and transaction volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends}>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                  />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <Tooltip 
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  <Bar dataKey="new_documents" name="Documents" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="new_transactions" name="Transactions" fill="#ffc658" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
