'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Download, FileText, FileDown } from 'lucide-react'
import { format } from 'date-fns'
import { generateProfitLossPDF } from '@/lib/pdf-generator'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

interface PLRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  amount: number
}

export function ProfitLossReport() {
  const lt = useLiterals()
  const [data, setData] = useState<PLRow[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const generateReport = useCallback(async () => {
    if (!tenantId || !startDate || !endDate) return

    try {
      setLoading(true)

      const { data: reportData, error } = await (supabase.rpc as any)('get_profit_loss', {
        p_tenant_id: tenantId,
        p_start_date: startDate,
        p_end_date: endDate
      })

      if (error) throw error
      setData(reportData || [])
    } catch (error) {
      console.error('Error generating P&L:', error)
      toast.error(lt('Failed to generate report'))
    } finally {
      setLoading(false)
    }
  }, [endDate, startDate, supabase, tenantId, lt])

  useEffect(() => {
    generateReport()
  }, [generateReport])

  const revenues = data.filter(row => row.account_type === 'REVENUE')
  const expenses = data.filter(row => row.account_type === 'EXPENSE')

  // Always treat expenses as positive for calculation and display
  const totalRevenue = revenues.reduce((sum, row) => sum + row.amount, 0)
  const totalExpense = expenses.reduce((sum, row) => sum + Math.abs(row.amount), 0)
  const netIncome = totalRevenue - totalExpense

  const exportToCSV = () => {
    const formattedStart = format(new Date(startDate), 'MMM dd, yyyy')
    const formattedEnd = format(new Date(endDate), 'MMM dd, yyyy')

    const lines = [
      lt('Profit & Loss Statement'),
      lt('Period: {start} - {end}', { start: formattedStart, end: formattedEnd }),
      '',
      lt('REVENUE'),
      lt('Account Code,Account Name,Amount')
    ]

    revenues.forEach(row => {
      lines.push(`${row.account_code},${row.account_name},${row.amount.toFixed(2)}`)
    })

    lines.push(`,,${totalRevenue.toFixed(2)}`)
    lines.push('')
    lines.push(lt('EXPENSES'))
    lines.push(lt('Account Code,Account Name,Amount'))

    expenses.forEach(row => {
      lines.push(`${row.account_code},${row.account_name},${row.amount.toFixed(2)}`)
    })

    lines.push(`,,${totalExpense.toFixed(2)}`)
    lines.push('')
    lines.push(`${lt('NET INCOME')},,${netIncome.toFixed(2)}`)

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profit-loss-${startDate}-${endDate}.csv`
    a.click()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{lt('Profit & Loss Statement')}</CardTitle>
            <CardDescription>
              {lt('View revenue and expenses for a period')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => generateProfitLossPDF(data, startDate, endDate, currentTenant?.name)} variant="outline" size="sm" disabled={data.length === 0}>
              <FileDown className="w-4 h-4 mr-2" />
              {lt('Export PDF')}
            </Button>
            <Button onClick={exportToCSV} variant="outline" size="sm" disabled={data.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              {lt('Export CSV')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <Label htmlFor="startDate">{lt('Start Date')}</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="endDate">{lt('End Date')}</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={generateReport} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              {lt('Generate Report')}
            </Button>
          </div>
        </div>

        {/* Report */}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{lt('No data available for the selected period')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Revenue Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-green-700">{lt('REVENUE')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">{lt('Code')}</th>
                      <th className="text-left py-2 px-4">{lt('Account Name')}</th>
                      <th className="text-right py-2 px-4">{lt('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenues.map((row) => (
                      <tr key={row.account_id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-4 font-mono text-sm">{row.account_code}</td>
                        <td className="py-2 px-4">{lt(row.account_name)}</td>
                        <td className="py-2 px-4 text-right font-mono">${row.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-green-50">
                      <td colSpan={2} className="py-2 px-4 font-semibold">{lt('Total Revenue')}</td>
                      <td className="py-2 px-4 text-right font-mono font-semibold text-green-700">
                        ${totalRevenue.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Expenses Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4 text-red-700">{lt('EXPENSES')}</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">{lt('Code')}</th>
                      <th className="text-left py-2 px-4">{lt('Account Name')}</th>
                      <th className="text-right py-2 px-4">{lt('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((row) => (
                      <tr key={row.account_id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-4 font-mono text-sm">{row.account_code}</td>
                        <td className="py-2 px-4">{lt(row.account_name)}</td>
                        <td className="py-2 px-4 text-right font-mono">${Math.abs(row.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-red-50">
                      <td colSpan={2} className="py-2 px-4 font-semibold">{lt('Total Expenses')}</td>
                      <td className="py-2 px-4 text-right font-mono font-semibold text-red-700">
                        ${totalExpense.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Net Income */}
            <div className={`p-6 rounded-lg ${netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{lt('NET INCOME')}</h3>
                <p className={`text-3xl font-bold ${netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  ${Math.abs(netIncome).toFixed(2)}
                  {netIncome < 0 && lt(' (Loss)')}
                </p>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {lt('Period: {start} - {end}', {
                  start: format(new Date(startDate), 'MMM dd, yyyy'),
                  end: format(new Date(endDate), 'MMM dd, yyyy'),
                })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
