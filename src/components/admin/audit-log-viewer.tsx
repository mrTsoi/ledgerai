'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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
  const [analyzing, setAnalyzing] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([])
  const [selectedLog, setSelectedLog] = useState<AuditLogWithUser | null>(null)
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

  function isObject(v: any) {
    return v && typeof v === 'object' && !Array.isArray(v)
  }

  function renderJsonDiff(oldData: any, newData: any, indent = 0): any {
    // Build lines recursively
    const indentStr = (n: number) => '  '.repeat(n)

    const lines: any[] = []

    function pushLine(text: any, key?: string, cls?: string) {
      lines.push(
        <div key={lines.length} className={cls}>
          <span className="text-gray-400">{indentStr(indentLevelStack[0])}</span>
          {text}
        </div>
      )
    }

    const indentLevelStack: number[] = [indent]

    function walk(a: any, b: any, level: number) {
      const pad = indentStr(level)
      if (isObject(a) && isObject(b)) {
        const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort()
        lines.push(<div key={lines.length}><span className="text-gray-400">{pad}{"{"}</span></div>)
        keys.forEach((k) => {
          const va = a.hasOwnProperty(k) ? a[k] : undefined
          const vb = b.hasOwnProperty(k) ? b[k] : undefined
          if (typeof va === 'undefined') {
            // added
            lines.push(
              <div key={lines.length} className="text-green-700">
                <span className="text-gray-400">{pad}  </span>
                <span className="font-mono">{k}:</span> {formatValue(vb)}
              </div>
            )
          } else if (typeof vb === 'undefined') {
            // removed
            lines.push(
              <div key={lines.length} className="text-red-700">
                <span className="text-gray-400">{pad}  </span>
                <span className="font-mono">{k}:</span> {formatValue(va)}
              </div>
            )
          } else if (isObject(va) || isObject(vb)) {
            // recurse
            lines.push(
              <div key={lines.length} className="text-gray-700">
                <span className="text-gray-400">{pad}  </span>
                <span className="font-mono">{k}:</span>
              </div>
            )
            walk(va, vb, level + 1)
          } else if (Array.isArray(va) || Array.isArray(vb)) {
            // compare arrays by JSON
            if (JSON.stringify(va) === JSON.stringify(vb)) {
              lines.push(
                <div key={lines.length} className="text-gray-700">
                  <span className="text-gray-400">{pad}  </span>
                  <span className="font-mono">{k}:</span> {formatValue(vb)}
                </div>
              )
            } else {
              lines.push(
                <div key={lines.length} className="text-yellow-700">
                  <span className="text-gray-400">{pad}  </span>
                  <span className="font-mono">{k}:</span> {formatValue(va)} {'→'} {formatValue(vb)}
                </div>
              )
            }
          } else {
            if (String(va) === String(vb)) {
              lines.push(
                <div key={lines.length} className="text-gray-700">
                  <span className="text-gray-400">{pad}  </span>
                  <span className="font-mono">{k}:</span> {formatValue(vb)}
                </div>
              )
            } else {
              lines.push(
                <div key={lines.length} className="text-yellow-700">
                  <span className="text-gray-400">{pad}  </span>
                  <span className="font-mono">{k}:</span> {formatValue(va)} {'→'} {formatValue(vb)}
                </div>
              )
            }
          }
        })
        lines.push(<div key={lines.length}><span className="text-gray-400">{pad}{"}"}</span></div>)
      } else if (Array.isArray(a) || Array.isArray(b)) {
        // top-level arrays
        if (JSON.stringify(a) === JSON.stringify(b)) {
          lines.push(<div key={lines.length} className="text-gray-700">{pad}{formatValue(b)}</div>)
        } else {
          lines.push(<div key={lines.length} className="text-yellow-700">{pad}{formatValue(a)} {'→'} {formatValue(b)}</div>)
        }
      } else {
        if (String(a) === String(b)) {
          lines.push(<div key={lines.length} className="text-gray-700">{pad}{formatValue(b)}</div>)
        } else {
          lines.push(<div key={lines.length} className="text-yellow-700">{pad}{formatValue(a)} {'→'} {formatValue(b)}</div>)
        }
      }
    }

    function formatValue(v: any) {
      if (isObject(v) || Array.isArray(v)) return JSON.stringify(v)
      if (v === null || typeof v === 'undefined') return String(v)
      if (typeof v === 'string') return `"${v}"`
      return String(v)
    }

    walk(oldData || {}, newData || {}, indent)
    return <div className="space-y-0">{lines}</div>
  }

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
            <Button variant="outline" size="sm" onClick={async () => {
              setAnalyzing(true)
              try {
                const res = await fetch('/api/security/ai-analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ since_minutes: 60 }) })
                const j = await res.json()
                if (res.ok) {
                  setSecurityAlerts(j.alerts || [])
                  toast.success(lt('AI analysis completed'))
                } else {
                  toast.error(j?.error || lt('AI analysis failed'))
                }
              } catch (e) {
                console.error(e)
                toast.error(lt('AI analysis failed'))
              } finally {
                setAnalyzing(false)
              }
            }}>
              {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {lt('Run AI Analysis')}
            </Button>
            <Button variant="outline" size="sm" onClick={async () => {
              setMonitoring(true)
              try {
                const res = await fetch('/api/security/monitor/run', { method: 'POST' })
                const j = await res.json()
                if (res.ok) {
                  toast.success(lt('Monitor run completed'))
                } else {
                  toast.error(j?.error || lt('Monitor run failed'))
                }
              } catch (e) {
                console.error(e)
                toast.error(lt('Monitor run failed'))
              } finally {
                setMonitoring(false)
                fetchLogs(filters)
              }
            }}>
              {monitoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {lt('Run Monitor')}
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

        {/* Security Alerts */}
        <div className="mb-6 p-4 bg-red-50 rounded-lg space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 text-red-600" />
            <span className="font-medium text-sm">{lt('Security Alerts')}</span>
          </div>
          <div>
            <p className="text-sm text-gray-700">{lt('Run AI analysis to detect suspicious activity. Results appear below.')}</p>
          </div>
          <div className="space-y-2">
            {securityAlerts.length === 0 ? (
              <div className="text-sm text-gray-500">{lt('No alerts')}</div>
            ) : (
              securityAlerts.map((a) => (
                <div key={a.user_id} className="flex items-center justify-between p-2 bg-white rounded">
                  <div>
                    <div className="font-medium">{a.user_id}</div>
                    <div className="text-xs text-gray-600">{lt('Score')}: {a.score} • {lt('Events')}: {a.count} • {lt('IPs')}: {a.unique_ips}</div>
                    <div className="text-xs text-gray-500">{a.latest ? format(new Date(a.latest), 'yyyy-MM-dd HH:mm') : ''}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        const res = await fetch('/api/security/suspend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: a.user_id, reason: 'ai_admin_alert' }) })
                        const j = await res.json()
                        if (res.ok) { toast.success(lt('User suspended')); setSecurityAlerts(prev => prev.filter(x => x.user_id !== a.user_id)) } else { toast.error(j?.error || lt('Suspend failed')) }
                      } catch (e) { console.error(e); toast.error(lt('Suspend failed')) }
                    }}>{lt('Suspend')}</Button>
                    <Button size="sm" onClick={() => { navigator.clipboard.writeText(JSON.stringify(a)); toast.success(lt('Copied')) }}>{lt('Copy')}</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[50vh]">
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
                      <td className="px-4 py-3 text-sm whitespace-normal break-words">
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              {lt('View Details')}
                            </button>
                            <button
                              onClick={() => {
                                const data = JSON.stringify({ old: log.old_data, new: log.new_data }, null, 2)
                                navigator.clipboard.writeText(data)
                                toast.success(lt('Audit data copied to clipboard'))
                              }}
                              className="text-gray-600 hover:underline text-xs"
                            >
                              {lt('Copy')}
                            </button>
                          </div>
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

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
        <DialogContent className="max-w-6xl w-full max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{lt('Audit Log Details')}</DialogTitle>
            <DialogDescription>
              {lt('View structured metadata and changes for this audit log entry.')}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">{lt('Timestamp')}</div>
                  <div className="font-medium">{format(new Date(selectedLog.created_at), 'yyyy-MM-dd HH:mm:ss')}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{lt('User')}</div>
                  <div className="font-medium">{selectedLog.user_full_name || selectedLog.user_email || lt('Unknown')}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{lt('Action')}</div>
                  <div className="font-medium">{selectedLog.action}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{lt('Resource')}</div>
                  <div className="font-mono text-sm">{selectedLog.resource_type || 'N/A'} {selectedLog.resource_id ? ` • ${selectedLog.resource_id}` : ''}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{lt('IP Address')}</div>
                  <div className="font-medium">{selectedLog.ip_address || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">{lt('Recorded at')}</div>
                  <div className="font-medium">{selectedLog.created_at}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">{lt('Changes (diff)')}</div>

                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-green-200 border" />
                    <span className="text-xs text-gray-700">{lt('Added')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-red-200 border" />
                    <span className="text-xs text-gray-700">{lt('Removed')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-yellow-200 border" />
                    <span className="text-xs text-gray-700">{lt('Changed')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-gray-200 border" />
                    <span className="text-xs text-gray-700">{lt('Unchanged')}</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded border p-3 overflow-auto max-h-[60vh]">
                  <div className="font-mono text-xs whitespace-pre-wrap break-words">
                    {renderJsonDiff(selectedLog.old_data, selectedLog.new_data)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2)); toast.success(lt('Copied')) }}>{lt('Copy JSON')}</Button>
                <Button size="sm" onClick={async () => {
                  try {
                    await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'admin_mark_reviewed', details: { id: selectedLog.id } }) })
                    toast.success(lt('Marked as reviewed'))
                    setSelectedLog(null)
                    fetchLogs(filters)
                  } catch (e) { console.error(e); toast.error(lt('Failed')) }
                }}>{lt('Mark Reviewed')}</Button>
                <Button size="sm" variant="destructive" onClick={async () => {
                  try {
                    await fetch('/api/security/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'admin_escalate', details: { id: selectedLog.id } }) })
                    toast.success(lt('Escalated'))
                    setSelectedLog(null)
                    fetchLogs(filters)
                  } catch (e) { console.error(e); toast.error(lt('Failed')) }
                }}>{lt('Escalate')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
