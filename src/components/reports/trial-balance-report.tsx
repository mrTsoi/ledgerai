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
import { generateTrialBalancePDF } from '@/lib/pdf-generator'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

interface TrialBalanceRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  account_subtype: string
  debit_amount: number
  credit_amount: number
  balance: number
}

export function TrialBalanceReport() {
  const lt = useLiterals()
  const [data, setData] = useState<TrialBalanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const { currentTenant } = useTenant()
  const supabase = useMemo(() => createClient(), [])
  const tenantId = currentTenant?.id

  const generateReport = useCallback(async () => {
    if (!tenantId) return

    try {
      setLoading(true)

      const { data: reportData, error } = await (supabase.rpc as any)('get_trial_balance', {
        p_tenant_id: tenantId,
        p_start_date: startDate || null,
        p_end_date: endDate || null
      })

      if (error) throw error
      setData(reportData || [])
    } catch (error) {
      console.error('Error generating trial balance:', error)
      toast.error(lt('Failed to generate report'))
    } finally {
      setLoading(false)
    }
  }, [endDate, startDate, supabase, tenantId, lt])

  useEffect(() => {
    generateReport()
  }, [generateReport])

  const totalDebits = data.reduce((sum, row) => sum + row.debit_amount, 0)
  const totalCredits = data.reduce((sum, row) => sum + row.credit_amount, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  const exportToCSV = () => {
    const headers = [
      lt('Account Code'),
      lt('Account Name'),
      lt('Type'),
      lt('Subtype'),
      lt('Debit'),
      lt('Credit'),
      lt('Balance'),
    ]
    const rows = data.map(row => [
      row.account_code,
      row.account_name,
      row.account_type,
      row.account_subtype || '',
      row.debit_amount.toFixed(2),
      row.credit_amount.toFixed(2),
      row.balance.toFixed(2)
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trial-balance-${endDate}.csv`
    a.click()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{lt('Trial Balance')}</CardTitle>
            <CardDescription>
              {lt('View all account balances to verify debits equal credits')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => generateTrialBalancePDF(data, startDate, endDate, currentTenant?.name)} variant="outline" size="sm" disabled={data.length === 0}>
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
            <Label htmlFor="startDate">{lt('Start Date (Optional)')}</Label>
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

        {/* Report Table */}
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 px-4 font-semibold">{lt('Code')}</th>
                    <th className="text-left py-3 px-4 font-semibold">{lt('Account Name')}</th>
                    <th className="text-left py-3 px-4 font-semibold">{lt('Type')}</th>
                    <th className="text-right py-3 px-4 font-semibold">{lt('Debit')}</th>
                    <th className="text-right py-3 px-4 font-semibold">{lt('Credit')}</th>
                    <th className="text-right py-3 px-4 font-semibold">{lt('Balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.account_id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-sm">{row.account_code}</td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{lt(row.account_name)}</p>
                          {row.account_subtype && (
                            <p className="text-xs text-gray-500">{lt(row.account_subtype)}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">{lt(row.account_type)}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        ${row.debit_amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        ${row.credit_amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium">
                        ${Math.abs(row.balance).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td colSpan={3} className="py-3 px-4 font-semibold">{lt('TOTAL')}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      ${totalDebits.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      ${totalCredits.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isBalanced ? (
                        <span className="text-green-600 font-semibold">{lt('✓ Balanced')}</span>
                      ) : (
                        <span className="text-red-600 font-semibold">
                          {lt('✗ Out of Balance: {amount}', {
                            amount: `$${Math.abs(totalDebits - totalCredits).toFixed(2)}`,
                          })}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Summary */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold mb-2">{lt('Report Summary')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">{lt('Total Accounts')}</p>
                  <p className="font-semibold text-lg">{data.length}</p>
                </div>
                <div>
                  <p className="text-gray-600">{lt('Period')}</p>
                  <p className="font-semibold">
                    {lt('{start} - {end}', {
                      start: startDate ? format(new Date(startDate), 'MMM dd, yyyy') : lt('All Time'),
                      end: format(new Date(endDate), 'MMM dd, yyyy'),
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">{lt('Status')}</p>
                  <p className={`font-semibold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                    {isBalanced ? lt('Balanced') : lt('Out of Balance')}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
