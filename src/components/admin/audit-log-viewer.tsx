'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Filter, Download, RefreshCw, Copy } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from "sonner"
import { useLiterals } from '@/hooks/use-literals'

type AuditLog = Database['public']['Tables']['audit_logs']['Row']

interface AuditLogWithUser extends AuditLog {
  user_email?: string
  user_full_name?: string
}

export function AuditLogViewer() {
  const lt = useLiterals()
  const [logs, setLogs] = useState<AuditLogWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: ''
  })
  const supabase = useMemo(() => createClient(), [])

  const fetchLogs = useCallback(async (nextFilters: typeof filters) => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      // Apply filters
      if (nextFilters.action) {
        query = query.eq('action', nextFilters.action)
      }
      if (nextFilters.userId) {
        query = query.eq('user_id', nextFilters.userId)
      }
      if (nextFilters.startDate) {
        query = query.gte('created_at', nextFilters.startDate)
      }
      if (nextFilters.endDate) {
        query = query.lte('created_at', nextFilters.endDate)
      }

      const { data, error } = await query

      if (error) throw error

      // Flatten profile data
      const logsWithUser = (data || []).map((log: any) => ({
        ...log,
        user_email: log.profiles?.email,
        user_full_name: log.profiles?.full_name
      }))

      setLogs(logsWithUser)
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchLogs(filters)
  }, [fetchLogs, filters])

  const exportToCSV = () => {
    const headers = ['Timestamp', 'User', 'Email', 'Action', 'Table', 'Record ID', 'IP Address', 'Old Data', 'New Data']
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
      log.user_full_name || 'Unknown',
      log.user_email || 'Unknown',
      log.action,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
      log.old_data ? JSON.stringify(log.old_data) : '',
      log.new_data ? JSON.stringify(log.new_data) : ''
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const filteredLogs = logs.filter(log => {
    if (!filters.search) return true
    const searchLower = filters.search.toLowerCase()
    return (
      log.action.toLowerCase().includes(searchLower) ||
      log.resource_type?.toLowerCase().includes(searchLower) ||
      log.user_email?.toLowerCase().includes(searchLower) ||
      log.user_full_name?.toLowerCase().includes(searchLower)
    )
  })

  const actionTypes = [...new Set(logs.map(log => log.action))].sort()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{lt('Audit Logs')}</CardTitle>
            <CardDescription>
              {lt('Track all system changes and user actions')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchLogs(filters)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {lt('Refresh')}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="w-4 h-4 mr-2" />
              {lt('Export CSV')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-600" />
            <span className="font-medium text-sm">{lt('Filters')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search" className="text-xs">{lt('Search')}</Label>
              <Input
                id="search"
                placeholder={lt('Search logs...')}
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="action" className="text-xs">{lt('Action')}</Label>
              <select
                id="action"
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="w-full h-9 px-3 border rounded-md text-sm"
              >
                <option value="">{lt('All Actions')}</option>
                {actionTypes.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="startDate" className="text-xs">{lt('Start Date')}</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="endDate" className="text-xs">{lt('End Date')}</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const cleared = { search: '', action: '', userId: '', startDate: '', endDate: '' }
                  setFilters(cleared)
                  fetchLogs(cleared)
                }}
                className="h-9 w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Table</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Record ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <p className="font-medium">{log.user_full_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{log.user_email || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                          log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                          log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                          log.action === 'LOGIN' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">
                        {log.resource_type || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">
                        {log.resource_id ? log.resource_id.substring(0, 8) + '...' : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.ip_address || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {log.old_data || log.new_data ? (
                          <button
                            onClick={() => {
                              const data = JSON.stringify({ old: log.old_data, new: log.new_data }, null, 2)
                              navigator.clipboard.writeText(data)
                              toast.success('Audit data copied to clipboard')
                            }}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Details
                          </button>
                        ) : (
                          <span className="text-gray-400">No changes</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLogs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p>No audit logs found</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredLogs.length} of {logs.length} logs
        </div>
      </CardContent>
    </Card>
  )
}
