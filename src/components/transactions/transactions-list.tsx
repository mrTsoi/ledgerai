'use client'

import { useEffect, useState } from 'react'
import { useTenant } from '@/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, FileText, CheckCircle, XCircle, Edit, Trash2, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { TransactionEditor } from './transaction-editor'
import { format } from 'date-fns'
import { auditTransactions } from '@/app/actions/audit'
import { AuditIssue } from '@/types/audit'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type Transaction = Database['public']['Tables']['transactions']['Row']

interface Props {
  status?: 'DRAFT' | 'POSTED' | 'VOID'
}

export function TransactionsList({ status }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>(status || 'ALL')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  
  // Audit State
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditIssue[]>([])
  const [showAuditResults, setShowAuditResults] = useState(false)
  const [auditIssuesMap, setAuditIssuesMap] = useState<Record<string, AuditIssue[]>>({})

  const { currentTenant } = useTenant()
  const supabase = createClient()

  useEffect(() => {
    if (currentTenant) {
      fetchTransactions()
      
      // Subscribe to real-time updates for transactions
      const txChannel = supabase
        .channel('transactions_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `tenant_id=eq.${currentTenant.id}`
          },
          () => {
            fetchTransactions()
          }
        )
        .subscribe()

      // Subscribe to real-time updates for documents (to catch validation flag changes)
      const docChannel = supabase
        .channel('documents_changes_tx_list')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: `tenant_id=eq.${currentTenant.id}`
          },
          () => {
            fetchTransactions()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(txChannel)
        supabase.removeChannel(docChannel)
      }
    }
  }, [currentTenant])

  useEffect(() => {
    filterTransactions()
  }, [transactions, searchTerm, selectedStatus])

  const fetchTransactions = async () => {
    if (!currentTenant) return

    try {
      let query = supabase
        .from('transactions')
        .select('*, documents(validation_status, validation_flags)')
        .eq('tenant_id', currentTenant.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      setTransactions(data || [])
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterTransactions = () => {
    let filtered = transactions

    // Filter by status
    if (selectedStatus !== 'ALL') {
      filtered = filtered.filter(tx => tx.status === selectedStatus)
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.description?.toLowerCase().includes(search) ||
        tx.reference_number?.toLowerCase().includes(search)
      )
    }

    setFilteredTransactions(filtered)
  }

  const voidTransaction = async (id: string) => {
    if (!confirm('Are you sure you want to void this transaction?')) return

    try {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'VOID' })
        .eq('id', id)

      if (error) throw error
      fetchTransactions()
    } catch (error: any) {
      console.error('Error voiding transaction:', error)
      alert('Failed to void: ' + error.message)
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTransactions.map(t => t.id)))
    }
  }

  const bulkVoid = async () => {
    if (!confirm(`Void ${selectedIds.size} transactions?`)) return

    try {
      const ids = Array.from(selectedIds)
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'VOID' })
        .in('id', ids)

      if (error) throw error
      
      fetchTransactions()
      setSelectedIds(new Set())
    } catch (error: any) {
      console.error('Bulk void error:', error)
      alert('Failed to void transactions: ' + error.message)
    }
  }

  const bulkDeleteDrafts = async () => {
    if (!confirm(`Delete ${selectedIds.size} draft transactions?`)) return

    try {
      const ids = Array.from(selectedIds)
      // Only allow deleting drafts
      const draftsToDelete = transactions.filter(t => selectedIds.has(t.id) && t.status === 'DRAFT')
      
      if (draftsToDelete.length !== ids.length) {
        alert('Only DRAFT transactions can be deleted. Others will be skipped.')
      }

      if (draftsToDelete.length === 0) return

      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', draftsToDelete.map(t => t.id))

      if (error) throw error
      
      fetchTransactions()
      setSelectedIds(new Set())
    } catch (error: any) {
      console.error('Bulk delete error:', error)
      alert('Failed to delete transactions: ' + error.message)
    }
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  const runAudit = async () => {
    if (!currentTenant) return
    setIsAuditing(true)
    try {
      const issues = await auditTransactions(currentTenant.id)
      setAuditResults(issues)
      
      // Group issues by transaction ID
      const issuesMap: Record<string, AuditIssue[]> = {}
      issues.forEach(issue => {
        if (!issuesMap[issue.transactionId]) {
          issuesMap[issue.transactionId] = []
        }
        issuesMap[issue.transactionId].push(issue)
      })
      setAuditIssuesMap(issuesMap)

      setShowAuditResults(true)
    } catch (e) {
      console.error(e)
      alert('Audit failed')
    } finally {
      setIsAuditing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <FileText className="w-4 h-4 text-yellow-500" />
      case 'POSTED':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'VOID':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      DRAFT: 'bg-yellow-100 text-yellow-800',
      POSTED: 'bg-green-100 text-green-800',
      VOID: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Transactions</CardTitle>
              <CardDescription>
                View and manage accounting transactions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runAudit} disabled={isAuditing}>
                {isAuditing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
                AI Audit
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={bulkVoid}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Void ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="destructive" onClick={bulkDeleteDrafts}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Drafts
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Input
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:max-w-sm"
            />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border rounded-md w-full md:w-auto"
            >
              <option value="ALL">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="VOID">Void</option>
            </select>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No transactions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden md:flex items-center gap-4 p-2 border-b text-sm font-medium text-gray-500">
                <Checkbox 
                  checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="flex-1">Description</span>
                <span className="w-32 text-right">Actions</span>
              </div>
              {filteredTransactions.map((tx) => {
                // Combine audit issues with document validation issues
                const auditIssues = auditIssuesMap[tx.id] || []
                const docIssues: AuditIssue[] = []
                
                // Check document validation status
                const doc = (tx as any).documents
                if (doc && doc.validation_flags && Array.isArray(doc.validation_flags)) {
                  doc.validation_flags.forEach((flag: string) => {
                    if (flag === 'DUPLICATE_DOCUMENT') {
                      docIssues.push({
                        transactionId: tx.id,
                        description: 'Duplicate Document',
                        issueType: 'DUPLICATE',
                        severity: 'HIGH',
                        details: 'Duplicate document file detected during upload'
                      })
                    } else if (flag === 'WRONG_TENANT') {
                      docIssues.push({
                        transactionId: tx.id,
                        description: 'Wrong Tenant',
                        issueType: 'WRONG_TENANT',
                        severity: 'HIGH',
                        details: 'Document does not appear to belong to this tenant'
                      })
                    }
                  })
                }

                // Merge issues, avoiding duplicates if audit already ran
                const allIssues = [...auditIssues]
                docIssues.forEach(docIssue => {
                  if (!allIssues.some(i => i.issueType === docIssue.issueType)) {
                    allIssues.push(docIssue)
                  }
                })

                const hasHighSeverity = allIssues.some(i => i.severity === 'HIGH')
                const hasIssues = allIssues.length > 0
                const isExpanded = expandedIds.has(tx.id)

                return (
                <div
                  key={tx.id}
                  className={`flex flex-col border rounded-lg transition-colors ${
                    selectedIds.has(tx.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  } ${hasIssues ? (hasHighSeverity ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-yellow-500') : ''}`}
                >
                  <div 
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer"
                    onClick={(e) => {
                      // Prevent toggling if clicking interactive elements
                      if (
                        (e.target as HTMLElement).closest('button') || 
                        (e.target as HTMLElement).closest('[role="checkbox"]') ||
                        (e.target as HTMLElement).closest('a')
                      ) {
                        return
                      }
                      toggleExpand(tx.id)
                    }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Checkbox 
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelection(tx.id)}
                      />
                      {hasIssues ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                {hasHighSeverity ? (
                                  <XCircle className="w-4 h-4 text-red-500" />
                                ) : (
                                  <ShieldAlert className="w-4 h-4 text-yellow-500" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs p-3 bg-white border shadow-lg z-50">
                              <div className="space-y-2">
                                <p className="font-semibold text-sm border-b pb-1 mb-2">Detected Issues</p>
                                {allIssues.map((issue, idx) => (
                                  <div key={idx} className="text-xs">
                                    <div className="flex items-center gap-2 mb-1">
                                      {issue.severity === 'HIGH' ? (
                                        <XCircle className="w-3 h-3 text-red-500" />
                                      ) : (
                                        <ShieldAlert className="w-3 h-3 text-yellow-500" />
                                      )}
                                      <span className="font-medium text-gray-900">{issue.description}</span>
                                    </div>
                                    <p className="text-gray-500 pl-5">{issue.details}</p>
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        getStatusIcon(tx.status)
                      )}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{tx.description || 'No description'}</p>
                          {getStatusBadge(tx.status)}
                          {hasIssues && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`cursor-help ${hasHighSeverity ? "text-red-600 border-red-200 bg-red-50" : "text-yellow-600 border-yellow-200 bg-yellow-50"}`}>
                                    {allIssues.length} Issue{allIssues.length > 1 ? 's' : ''}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3 bg-white border shadow-lg z-50">
                                  <div className="space-y-2">
                                    <p className="font-semibold text-sm border-b pb-1 mb-2">Detected Issues</p>
                                    {allIssues.map((issue, idx) => (
                                      <div key={idx} className="text-xs">
                                        <div className="flex items-center gap-2 mb-1">
                                          {issue.severity === 'HIGH' ? (
                                            <XCircle className="w-3 h-3 text-red-500" />
                                          ) : (
                                            <ShieldAlert className="w-3 h-3 text-yellow-500" />
                                          )}
                                          <span className="font-medium text-gray-900">{issue.description}</span>
                                        </div>
                                        <p className="text-gray-500 pl-5">{issue.details}</p>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {format(new Date(tx.transaction_date), 'MMM dd, yyyy')}
                          {tx.reference_number && ` • Ref: ${tx.reference_number}`}
                        </p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-sm text-gray-500">Created</p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(tx.created_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 md:mt-0 md:ml-4 pl-8 md:pl-0">
                      <div className="flex gap-2 flex-1 md:flex-none">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(tx.id)}
                          className="flex-1 md:flex-none"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          {tx.status === 'DRAFT' ? 'Edit' : 'View'}
                        </Button>
                        {tx.status === 'POSTED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => voidTransaction(tx.id)}
                            className="flex-1 md:flex-none"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Void
                          </Button>
                        )}
                      </div>
                      <div className="text-gray-400">
                         {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 pl-14 animate-in slide-in-from-top-2">
                        <div className="pt-4 border-t border-gray-100">
                            {hasIssues ? (
                                <div className="space-y-2">
                                    <p className="font-semibold text-sm text-gray-700">Detected Issues</p>
                                    {allIssues.map((issue, idx) => (
                                        <div key={idx} className="text-sm bg-white p-3 rounded border border-gray-200">
                                            <div className="flex items-center gap-2 mb-1">
                                                {issue.severity === 'HIGH' ? (
                                                    <XCircle className="w-4 h-4 text-red-500" />
                                                ) : (
                                                    <ShieldAlert className="w-4 h-4 text-yellow-500" />
                                                )}
                                                <span className="font-medium text-gray-900">{issue.description}</span>
                                            </div>
                                            <p className="text-gray-600 ml-6">{issue.details}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No issues detected for this transaction.</p>
                            )}
                        </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}

          {/* Summary */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-gray-600">
              Showing {filteredTransactions.length} of {transactions.length} transactions
            </p>
          </div>
        </CardContent>
      </Card>

      {editingId && (
        <TransactionEditor
          transactionId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null)
            fetchTransactions()
          }}
        />
      )}

      <Dialog open={showAuditResults} onOpenChange={setShowAuditResults}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Transaction Audit Results</DialogTitle>
            <DialogDescription>
              AI-powered analysis of your transactions found {auditResults.length} potential issues.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 mt-4 pr-4">
            {auditResults.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle className="w-12 h-12 mx-auto mb-4" />
                <p className="font-medium">No issues found!</p>
                <p className="text-sm text-gray-500">Your transactions look healthy.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {auditResults.map((issue, i) => (
                  <div key={i} className="p-4 border rounded-lg bg-gray-50 flex gap-4">
                    <div className="mt-1">
                      {issue.severity === 'HIGH' ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-yellow-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{issue.issueType.replace('_', ' ')}</h4>
                        <Badge variant={issue.severity === 'HIGH' ? 'destructive' : 'secondary'}>
                          {issue.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{issue.description}</p>
                      <p className="text-xs text-gray-500 bg-white p-2 rounded border">
                        {issue.details}
                      </p>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="px-0 mt-2 h-auto text-primary"
                        onClick={() => {
                          setShowAuditResults(false)
                          setEditingId(issue.transactionId)
                        }}
                      >
                        Review Transaction
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}