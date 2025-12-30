'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, TrendingUp, Scale, BarChart3 } from 'lucide-react'
import { TrialBalanceReport } from '@/components/reports/trial-balance-report'
import { ProfitLossReport } from '@/components/reports/profit-loss-report'
import { BalanceSheetReport } from '@/components/reports/balance-sheet-report'
import { FinancialCharts } from '@/components/reports/financial-charts'
import { useLiterals } from '@/hooks/use-literals'

type ReportType = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'charts'

export default function ReportsPage() {
  const lt = useLiterals()
  const [selectedReport, setSelectedReport] = useState<ReportType>('charts')

  const reports = [
    {
      id: 'charts' as ReportType,
      name: lt('Financial Analysis'),
      description: lt('Interactive charts for income, expenses, and trends'),
      icon: BarChart3,
      color: 'text-indigo-600'
    },
    {
      id: 'trial-balance' as ReportType,
      name: lt('Trial Balance'),
      description: lt('View all account balances to verify debits equal credits'),
      icon: Scale,
      color: 'text-blue-600'
    },
    {
      id: 'profit-loss' as ReportType,
      name: lt('Profit & Loss'),
      description: lt('View revenue and expenses for a period'),
      icon: TrendingUp,
      color: 'text-green-600'
    },
    {
      id: 'balance-sheet' as ReportType,
      name: lt('Balance Sheet'),
      description: lt('View assets, liabilities, and equity at a point in time'),
      icon: FileText,
      color: 'text-purple-600'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Report Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon
          const isSelected = selectedReport === report.id
          return (
            <Card
              key={report.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-gray-400'
              }`}
              onClick={() => setSelectedReport(report.id)}
            >
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg bg-gray-100 ${report.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{report.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-primary"></div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Report Display */}
      <div>
        {selectedReport === 'charts' && <FinancialCharts />}
        {selectedReport === 'trial-balance' && <TrialBalanceReport />}
        {selectedReport === 'profit-loss' && <ProfitLossReport />}
        {selectedReport === 'balance-sheet' && <BalanceSheetReport />}
      </div>
    </div>
  )
}
