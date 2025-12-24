'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/use-tenant'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, PieChart as PieChartIcon, BarChart as BarChartIcon, LineChart as LineChartIcon } from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts'
import { useLiterals } from '@/hooks/use-literals'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export function FinancialCharts() {
  const lt = useLiterals()
  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('year') // month, quarter, year
  
  const [trendData, setTrendData] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [vendorData, setVendorData] = useState<any[]>([])

  const processData = useCallback((transactions: any[]) => {
    const trends: Record<string, { income: number, expense: number }> = {}
    const categories: Record<string, number> = {}
    const vendors: Record<string, number> = {}

    transactions.forEach(tx => {
      const date = new Date(tx.transaction_date)
      // Format date key based on range
      let key = ''
      if (timeRange === 'month') key = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) // 1 Jan
      else key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) // Jan 24

      if (!trends[key]) trends[key] = { income: 0, expense: 0 }

      // Process Line Items
      tx.line_items.forEach((item: any) => {
        const type = item.chart_of_accounts?.account_type;
        const name = item.chart_of_accounts?.name;

        if (type === 'REVENUE') {
          trends[key].income += item.credit;
        } else if (type === 'EXPENSE') {
          // For expenses, sum (debit - credit) to handle COGS and similar cases
          const expenseAmount = (item.debit || 0) - (item.credit || 0);
          trends[key].expense += expenseAmount;

          // Category Aggregation
          if (name) {
            categories[name] = (categories[name] || 0) + expenseAmount;
          }

          // Vendor Aggregation (from linked document)
          const vendorName = tx.documents?.document_data?.vendor_name || 'Uncategorized';
          if (vendorName) {
            vendors[vendorName] = (vendors[vendorName] || 0) + expenseAmount;
          }
        }
      });
    })

    // Format Trend Data
    const trendArray = Object.entries(trends).map(([name, val]) => ({
      name,
      [lt('Income')]: val.income,
      [lt('Expense')]: val.expense,
      [lt('Profit')]: val.income - val.expense
    }))
    setTrendData(trendArray)

    // Format Category Data
    const categoryArray = Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) // Top 10
    setCategoryData(categoryArray)

    // Format Vendor Data
    const vendorArray = Object.entries(vendors)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) // Top 10
    setVendorData(vendorArray)
  }, [timeRange, lt])

  const fetchData = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)
      
      // 1. Fetch Transactions with Line Items for Trend & Category
      // We need to join transactions -> line_items -> chart_of_accounts
      // Supabase JS client doesn't support deep nested joins easily for aggregation
      // So we'll fetch raw data and aggregate client-side (assuming reasonable volume for now)
      
      const startDate = new Date()
      if (timeRange === 'month') startDate.setMonth(startDate.getMonth() - 1)
      if (timeRange === 'quarter') startDate.setMonth(startDate.getMonth() - 3)
      if (timeRange === 'year') startDate.setFullYear(startDate.getFullYear() - 1)

      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select(`
          id,
          transaction_date,
          line_items (
            debit,
            credit,
            chart_of_accounts (
              name,
              account_type
            )
          ),
          documents (
            document_data (
              vendor_name
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'POSTED')
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .order('transaction_date')

      if (txError) throw txError


      // Debug: Log the structure of fetched transactions and their line_items
      console.log('Fetched transactions:', JSON.stringify(transactions, null, 2));
      if (transactions && transactions.length > 0) {
        transactions.forEach((tx, i) => {
          console.log(`Transaction[${i}] id:`, tx.id, 'line_items:', tx.line_items);
        });
      }

      processData(transactions)

    } catch (error) {
      console.error('Error fetching chart data:', error)
    } finally {
      setLoading(false)
    }
  }, [processData, supabase, tenantId, timeRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={lt('Select range')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{lt('Last 30 Days')}</SelectItem>
            <SelectItem value="quarter">{lt('Last Quarter')}</SelectItem>
            <SelectItem value="year">{lt('Last Year')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Income vs Expense Trend */}
      <Card>
        <CardHeader>
          <CardTitle>{lt('Income vs Expenses')}</CardTitle>
          <CardDescription>{lt('Financial performance over time')}</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
              />
              <Legend />
              <Bar dataKey={lt("Income")} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey={lt("Expense")} fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey={lt("Profit")} fill="#cfe015ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expenses by Category */}
        <Card>
          <CardHeader>
            <CardTitle>{lt('Expenses by Category')}</CardTitle>
            <CardDescription>{lt('Top expense categories')}</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, lt('Amount')]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expenses by Vendor */}
        <Card>
          <CardHeader>
            <CardTitle>{lt('Top Vendors')}</CardTitle>
            <CardDescription>{lt('Highest spending by vendor')}</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, lt('Amount')]} />
                <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
