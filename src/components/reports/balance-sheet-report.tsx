'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Download, FileText, FileDown } from 'lucide-react'
import { format } from 'date-fns'
import { generateBalanceSheetPDF } from '@/lib/pdf-generator'
import { toast } from "sonner"

interface BSRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  amount: number
}

export function BalanceSheetReport() {
  const [data, setData] = useState<BSRow[]>([])
  const [loading, setLoading] = useState(false)
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const { currentTenant } = useTenant()
  const supabase = createClient()

  const generateReport = async () => {
    if (!currentTenant || !asOfDate) return

    try {
      setLoading(true)

      const { data: reportData, error } = await supabase.rpc('get_balance_sheet', {
        p_tenant_id: currentTenant.id,
        p_as_of_date: asOfDate
      })

      if (error) throw error
      setData(reportData || [])
    } catch (error) {
      console.error('Error generating balance sheet:', error)
      toast.error('Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentTenant) {
      generateReport()
    }
  }, [currentTenant])

  const assets = data.filter(row => row.account_type === 'ASSET')
  const liabilities = data.filter(row => row.account_type === 'LIABILITY')
  const equity = data.filter(row => row.account_type === 'EQUITY')

  const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0)
  const totalLiabilities = liabilities.reduce((sum, row) => sum + row.amount, 0)
  const totalEquity = equity.reduce((sum, row) => sum + row.amount, 0)

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01

  const exportToCSV = () => {
    const lines = [
      'Balance Sheet',
      `As of: ${format(new Date(asOfDate), 'MMM dd, yyyy')}`,
      '',
      'ASSETS',
      'Account Code,Account Name,Amount'
    ]

    assets.forEach(row => {
      lines.push(`${row.account_code},${row.account_name},${row.amount.toFixed(2)}`)
    })

    lines.push(`Total Assets,,${totalAssets.toFixed(2)}`)
    lines.push('')
    lines.push('LIABILITIES')
    lines.push('Account Code,Account Name,Amount')

    liabilities.forEach(row => {
      lines.push(`${row.account_code},${row.account_name},${row.amount.toFixed(2)}`)
    })

    lines.push(`Total Liabilities,,${totalLiabilities.toFixed(2)}`)
    lines.push('')
    lines.push('EQUITY')
    lines.push('Account Code,Account Name,Amount')

    equity.forEach(row => {
      lines.push(`${row.account_code},${row.account_name},${row.amount.toFixed(2)}`)
    })

    lines.push(`Total Equity,,${totalEquity.toFixed(2)}`)
    lines.push('')
    lines.push(`Total Liabilities & Equity,,${(totalLiabilities + totalEquity).toFixed(2)}`)

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-sheet-${asOfDate}.csv`
    a.click()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Balance Sheet</CardTitle>
            <CardDescription>
              View assets, liabilities, and equity at a point in time
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => generateBalanceSheetPDF(data, asOfDate, currentTenant?.name)} variant="outline" size="sm" disabled={data.length === 0}>
              <FileDown className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button onClick={exportToCSV} variant="outline" size="sm" disabled={data.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <Label htmlFor="asOfDate">As of Date</Label>
            <Input
              id="asOfDate"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={generateReport} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Generate Report
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
            <p>No data available as of this date</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Assets */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 text-blue-700">ASSETS</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-sm">Code</th>
                        <th className="text-left py-2 px-2 text-sm">Account</th>
                        <th className="text-right py-2 px-2 text-sm">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((row) => (
                        <tr key={row.account_id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-xs">{row.account_code}</td>
                          <td className="py-2 px-2 text-sm">{row.account_name}</td>
                          <td className="py-2 px-2 text-right font-mono text-sm">${row.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-blue-50">
                        <td colSpan={2} className="py-2 px-2 font-semibold">Total Assets</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-blue-700">
                          ${totalAssets.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Liabilities & Equity */}
            <div className="space-y-6">
              {/* Liabilities */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-red-700">LIABILITIES</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-sm">Code</th>
                        <th className="text-left py-2 px-2 text-sm">Account</th>
                        <th className="text-right py-2 px-2 text-sm">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liabilities.map((row) => (
                        <tr key={row.account_id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-xs">{row.account_code}</td>
                          <td className="py-2 px-2 text-sm">{row.account_name}</td>
                          <td className="py-2 px-2 text-right font-mono text-sm">${row.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-red-50">
                        <td colSpan={2} className="py-2 px-2 font-semibold">Total Liabilities</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-red-700">
                          ${totalLiabilities.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Equity */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-purple-700">EQUITY</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-sm">Code</th>
                        <th className="text-left py-2 px-2 text-sm">Account</th>
                        <th className="text-right py-2 px-2 text-sm">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equity.map((row) => (
                        <tr key={row.account_id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-xs">{row.account_code}</td>
                          <td className="py-2 px-2 text-sm">{row.account_name}</td>
                          <td className="py-2 px-2 text-right font-mono text-sm">${row.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-purple-50">
                        <td colSpan={2} className="py-2 px-2 font-semibold">Total Equity</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-purple-700">
                          ${totalEquity.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Total Liabilities & Equity */}
              <div className="p-4 bg-gray-100 rounded">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Liabilities & Equity</span>
                  <span className="font-mono font-semibold">${(totalLiabilities + totalEquity).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Balance Verification */}
            <div className="col-span-1 lg:col-span-2 mt-6">
              <div className={`p-6 rounded-lg ${isBalanced ? 'bg-green-100' : 'bg-red-100'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">Balance Verification</h3>
                    <p className="text-sm text-gray-600">As of {format(new Date(asOfDate), 'MMM dd, yyyy')}</p>
                  </div>
                  <div className="text-right">
                    {isBalanced ? (
                      <p className="text-green-700 font-semibold text-lg">✓ Balanced</p>
                    ) : (
                      <p className="text-red-700 font-semibold text-lg">
                        ✗ Out of Balance: ${Math.abs(totalAssets - (totalLiabilities + totalEquity)).toFixed(2)}
                      </p>
                    )}
                    <p className="text-sm text-gray-600 mt-1">
                      Assets: ${totalAssets.toFixed(2)} = Liabilities: ${totalLiabilities.toFixed(2)} + Equity: ${totalEquity.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
