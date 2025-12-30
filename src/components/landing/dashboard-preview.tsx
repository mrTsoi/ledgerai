'use client'

import { useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpRight, DollarSign, Users, CreditCard, Activity } from 'lucide-react'
import { useLiterals } from '@/hooks/use-literals'

const data = [
  { name: 'Jan', total: 1200 },
  { name: 'Feb', total: 2100 },
  { name: 'Mar', total: 1800 },
  { name: 'Apr', total: 2400 },
  { name: 'May', total: 3200 },
  { name: 'Jun', total: 4500 },
  { name: 'Jul', total: 4100 },
]

const transactions = [
  { id: 1, name: 'Stripe Payout', amount: '+$12,450.00', status: 'Completed', date: 'Today, 2:34 PM' },
  { id: 2, name: 'AWS Infrastructure', amount: '-$2,100.00', status: 'Processing', date: 'Today, 1:12 PM' },
  { id: 3, name: 'Client Payment - Acme Corp', amount: '+$4,500.00', status: 'Completed', date: 'Yesterday' },
  { id: 4, name: 'Slack Subscription', amount: '-$120.00', status: 'Completed', date: 'Yesterday' },
]

export function DashboardPreview() {
  const lt = useLiterals()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="w-full h-full bg-gray-50/50 p-4 md:p-8 overflow-hidden">
      {/* Mock Header */}
      <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div>
			<h2 className="text-2xl font-bold tracking-tight">{lt('Dashboard')}</h2>
			<p className="text-muted-foreground">{lt('Overview of your financial performance.')}</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">JD</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
			{ title: lt('Total Revenue'), value: '$45,231.89', icon: DollarSign, change: '+20.1%', color: 'text-green-600' },
			{ title: lt('Subscriptions'), value: '+2350', icon: Users, change: '+180.1%', color: 'text-green-600' },
			{ title: lt('Sales'), value: '+12,234', icon: CreditCard, change: '+19%', color: 'text-green-600' },
			{ title: lt('Active Now'), value: '+573', icon: Activity, change: '+201', color: 'text-green-600' },
        ].map((stat, i) => (
          <Card key={i} className="animate-in fade-in zoom-in-95 duration-500 fill-mode-backwards" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'backwards' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
					<span className={stat.color}>{stat.change}</span> {lt('from last month')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Chart */}
        <Card className="col-span-4 animate-in fade-in slide-in-from-left-4 duration-700 delay-300">
          <CardHeader>
			<CardTitle>{lt('Overview')}</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value}`} 
                  />
                  <Tooltip 
                    contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    itemStyle={{ color: '#1f2937' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorTotal)" 
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card className="col-span-3 animate-in fade-in slide-in-from-right-4 duration-700 delay-500">
          <CardHeader>
			<CardTitle>{lt('Recent Transactions')}</CardTitle>
            <p className="text-sm text-muted-foreground">
				{lt('You made 265 sales this month.')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {transactions.map((transaction, i) => (
                <div key={transaction.id} className="flex items-center animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${800 + (i * 100)}ms`, animationFillMode: 'backwards' }}>
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <ArrowUpRight className={`h-4 w-4 ${transaction.amount.startsWith('+') ? 'text-green-500' : 'text-red-500 rotate-180'}`} />
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{transaction.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.date}
                    </p>
                  </div>
                  <div className={`ml-auto font-medium ${transaction.amount.startsWith('+') ? 'text-green-600' : 'text-gray-900'}`}>
                    {transaction.amount}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
