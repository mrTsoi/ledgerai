import { useState, useCallback } from 'react'
import { AuditIssue } from '@/types/audit'
import { auditTransactions } from '@/app/actions/audit'
import { toast } from 'sonner'
import { chunkArray } from '@/hooks/use-batch-config'
import { createClient } from '@/lib/supabase/client'
import { useLiterals } from '@/hooks/use-literals'

export function useTransactionAudit(transactions: any[], tenantId: string | undefined, fetchTransactions: () => Promise<void>, batchSize: number) {
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditResults, setAuditResults] = useState<AuditIssue[]>([])
  const [showAuditResults, setShowAuditResults] = useState(false)
  const [auditIssuesMap, setAuditIssuesMap] = useState<Record<string, AuditIssue[]>>({})
  const [auditSearchTerm, setAuditSearchTerm] = useState('')
  const [selectedAuditKeys, setSelectedAuditKeys] = useState<Set<string>>(new Set())
  const [returnToAudit, setReturnToAudit] = useState(false)

  const lt = useLiterals()
  const supabase = createClient()

  const runAudit = useCallback(async () => {
    if (!tenantId) return
    setIsAuditing(true)
    try {
      const issues = await auditTransactions(tenantId)
      setAuditResults(issues)
      setSelectedAuditKeys(new Set())
      setAuditSearchTerm('')
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
      toast.error(lt('Audit failed'))
    } finally {
      setIsAuditing(false)
    }
  }, [tenantId, lt])

  const getAuditKey = (issue: AuditIssue) => `${issue.transactionId}-${issue.issueType}`

  const filteredAuditResults = auditResults.filter(issue => {
    if (!auditSearchTerm) return true
    const search = auditSearchTerm.toLowerCase()
    const tx = transactions.find(t => t.id === issue.transactionId)
    return (
      issue.description.toLowerCase().includes(search) ||
      issue.issueType.toLowerCase().includes(search) ||
      tx?.description?.toLowerCase().includes(search) ||
      tx?.reference_number?.toLowerCase().includes(search)
    )
  })

  const toggleAuditSelection = (key: string) => {
    setSelectedAuditKeys(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) newSet.delete(key)
      else newSet.add(key)
      return newSet
    })
  }

  const toggleAllAuditSelection = () => {
    const allKeys = new Set(filteredAuditResults.map(issue => getAuditKey(issue)))
    const allSelected = allKeys.size > 0 && Array.from(allKeys).every(key => selectedAuditKeys.has(key))
    setSelectedAuditKeys(allSelected ? new Set() : allKeys)
  }

  const bulkFixAudit = async () => {
    if (selectedAuditKeys.size === 0) return
    const issuesToFix = auditResults.filter(issue =>
      selectedAuditKeys.has(getAuditKey(issue)) &&
      ['DUPLICATE', 'WRONG_TENANT'].includes(issue.issueType)
    )
    if (issuesToFix.length === 0) {
      toast.warning(lt('No auto-fixable issues selected (Duplicate or Wrong Tenant).'))
      return
    }
    try {
      const txIdsToDelete: string[] = []
      const txIdsToVoid: string[] = []
      issuesToFix.forEach(issue => {
        const tx = transactions.find(t => t.id === issue.transactionId)
        if (!tx) return
        if (tx.status === 'DRAFT') txIdsToDelete.push(tx.id)
        else txIdsToVoid.push(tx.id)
      })
      if (txIdsToDelete.length > 0) {
        const deleteChunks = chunkArray(txIdsToDelete, batchSize)
        for (const chunk of deleteChunks) {
          const { error } = await supabase.from('transactions').delete().in('id', chunk)
          if (error) throw error
        }
      }
      if (txIdsToVoid.length > 0) {
        const voidChunks = chunkArray(txIdsToVoid, batchSize)
        for (const chunk of voidChunks) {
          const { error } = await supabase.from('transactions').update({ status: 'VOID' }).in('id', chunk)
          if (error) throw error
        }
      }
      toast.success(lt('Fixed {count} issues', { count: issuesToFix.length }))
      await fetchTransactions()
      const fixedTxIds = new Set([...txIdsToDelete, ...txIdsToVoid])
      setAuditResults(prev => prev.filter(i => !fixedTxIds.has(i.transactionId)))
      setSelectedAuditKeys(new Set())
      setShowAuditResults(false)
    } catch (error: any) {
      console.error('Bulk fix error:', error)
      toast.error(`${lt('Failed to fix issues')}: ${error.message}`)
    }
  }

  return {
    isAuditing,
    auditResults,
    setAuditResults,
    showAuditResults,
    setShowAuditResults,
    auditIssuesMap,
    auditSearchTerm,
    setAuditSearchTerm,
    selectedAuditKeys,
    setSelectedAuditKeys,
    runAudit,
    getAuditKey,
    filteredAuditResults,
    toggleAuditSelection,
    toggleAllAuditSelection,
    bulkFixAudit,
    returnToAudit,
    setReturnToAudit,
  }
}