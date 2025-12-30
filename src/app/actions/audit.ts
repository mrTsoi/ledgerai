'use server'

import { createClient } from '@/lib/supabase/server'
import { AuditIssue } from '@/types/audit'

export async function auditTransactions(tenantId: string): Promise<AuditIssue[]> {
  console.log('Starting auditTransactions for tenant:', tenantId)
  const supabase = await createClient()
  const issues: AuditIssue[] = []

  // 1. Fetch all transactions with line items and document data
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      *,
      line_items (
        *,
        chart_of_accounts (
          name,
          code
        )
      ),
      documents (
        id,
        content_hash,
        validation_flags,
        document_data (
          vendor_name,
          extracted_data,
          confidence_score
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .neq('status', 'VOID') // Ignore voided
    .order('created_at', { ascending: true }) // Process oldest first to flag newer duplicates

  if (error) {
    console.error('Error fetching transactions for audit:', error)
  }
  console.log('Fetched transactions:', transactions?.length)

  if (error || !transactions) return []

  // 2. Fetch Tenant Name for validation
  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).single()
  const primaryTenantName = (tenant as any)?.name || ''
  // Also load any configured name aliases for robust matching
  let tenantAliasRows: any[] = []
  try {
    const { data: aliasData } = await supabase
      .from('tenant_identifiers')
      .select('identifier_value')
      .eq('tenant_id', tenantId)
      .in('identifier_type', ['NAME_ALIAS'])
      .limit(50)
    tenantAliasRows = Array.isArray(aliasData) ? aliasData : []
  } catch (e) {
    tenantAliasRows = []
  }

  const tenantNames = [primaryTenantName, ...tenantAliasRows.map((r: any) => r.identifier_value || '')]
    .map((s: any) => String(s || '').toLowerCase())
    .filter(Boolean)

  // 3. Analyze
  const seenRefs = new Map<string, string>() // ref -> txId
  // const seenHashes = new Map<string, string>() // REMOVED: We use txByHash for smarter duplicate detection
  const seenFingerprints = new Map<string, string>() // date|amount -> txId
  const seenVendorDateAmount = new Map<string, string>() // vendor|date|amount -> txId
  
  // For fuzzy duplicate detection
  const transactionsByAmount = new Map<number, any[]>()
  // For same-document duplicate detection
  const txByHash = new Map<string, any[]>()

  for (const tx of (transactions as any[] || [])) {
    const totalDebits = tx.line_items.reduce((sum: number, li: any) => sum + (li.debit || 0), 0)
    const totalCredits = tx.line_items.reduce((sum: number, li: any) => sum + (li.credit || 0), 0)
    const amount = Math.max(totalDebits, totalCredits)
    
    // Robust Document Access
    const doc = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
    const docData = doc?.document_data
    const dd = Array.isArray(docData) ? docData[0] : docData

    // Debug: Log first transaction structure
    if ((transactions as any[]).indexOf(tx) === 0) {
      console.log('Sample Transaction Structure:', JSON.stringify({
        id: tx.id,
        documents: tx.documents,
        docData: docData,
        dd: dd
      }, null, 2))
    }

    // Group by amount for fuzzy date check
    if (amount > 0) {
      const existing = transactionsByAmount.get(amount) || []
      existing.push(tx)
      transactionsByAmount.set(amount, existing)
    }

    // Group by Content Hash for Same-Document check
    if (doc && doc.content_hash) {
      const hash = doc.content_hash
      const group = txByHash.get(hash) || []
      group.push(tx)
      txByHash.set(hash, group)
    }

    // A. Check Missing Data
    if (!tx.currency) {
      issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'MISSING_DATA',
        severity: 'HIGH',
        details: 'Missing currency'
      })
    }
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
       issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'UNBALANCED',
        severity: 'HIGH',
        details: `Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`
      })
    }

    if (totalDebits === 0 && totalCredits === 0) {
       issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'MISSING_DATA',
        severity: 'MEDIUM',
        details: 'Zero amount transaction'
      })
    }

    // Check for Uncategorized Accounts
    const hasUncategorized = tx.line_items.some((li: any) => 
      li.chart_of_accounts?.name?.toLowerCase().includes('uncategorized') || 
      li.chart_of_accounts?.name?.toLowerCase().includes('ask my accountant')
    )
    if (hasUncategorized) {
      issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'MISSING_DATA',
        severity: 'LOW',
        details: 'Transaction uses "Uncategorized" or placeholder account'
      })
    }

    // Check for Generic Descriptions
    if (tx.description && ['expense', 'payment', 'invoice', 'bill'].includes(tx.description.toLowerCase().trim())) {
      issues.push({
        transactionId: tx.id,
        description: tx.description,
        issueType: 'MISSING_DATA',
        severity: 'LOW',
        details: 'Generic description detected'
      })
    }

    // B. Check Duplicates (Ref Number)
    if (tx.reference_number) {
      // Normalize ref number: remove special chars, lowercase
      const key = tx.reference_number.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (key.length > 0) {
        if (seenRefs.has(key)) {
           issues.push({
            transactionId: tx.id,
            description: tx.description || 'Unknown Transaction',
            issueType: 'DUPLICATE',
            severity: 'HIGH',
            details: `Duplicate Reference Number: ${tx.reference_number}`
          })
        } else {
          seenRefs.set(key, tx.id)
        }
      }
    }

    // C. Check Duplicates (Document Content Hash & Document ID)
    // Replaced by smarter logic at the end of the function (txByHash processing)
    // This allows us to compare all duplicates and suggest the best one to keep.

    // Check Vendor + Date + Amount (Strong Duplicate)
    // docData and dd are already defined above
    const vendor = dd?.vendor_name?.toLowerCase() || tx.description?.toLowerCase() || ''
    
    if (vendor && amount > 0) {
        const dateStr = new Date(tx.transaction_date).toISOString().split('T')[0]
        const key = `${vendor}|${dateStr}|${amount}`
        
        if (seenVendorDateAmount.has(key)) {
             console.log('Found Strong Duplicate:', key, 'Current:', tx.id, 'Existing:', seenVendorDateAmount.get(key))
             issues.push({
              transactionId: tx.id,
              description: tx.description || 'Unknown Transaction',
              issueType: 'DUPLICATE',
              severity: 'HIGH',
              details: `Duplicate Transaction: Same Vendor, Date, and Amount`
            })
        } else {
            seenVendorDateAmount.set(key, tx.id)
        }
    }

    // D. Check Suspicious Timing (Weekend)
    const date = new Date(tx.transaction_date)
    const day = date.getDay()
    if (day === 0 || day === 6) {
      // Only flag if it's a significant amount or manually entered (no document)
      if (amount > 100 && !tx.document_id) {
        issues.push({
          transactionId: tx.id,
          description: tx.description || 'Unknown Transaction',
          issueType: 'SUSPICIOUS',
          severity: 'LOW',
          details: `Large transaction recorded on a weekend (${date.toLocaleDateString('en-US', { weekday: 'long' })}) without supporting document`
        })
      }
    }

    // E. Check Future Dates
    if (date > new Date()) {
      issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'ANOMALY',
        severity: 'MEDIUM',
        details: `Transaction date is in the future`
      })
    }

    // F. Check Round Amounts (often estimates/fraud)
    if (amount > 100 && amount % 100 === 0 && !tx.document_id) {
       issues.push({
        transactionId: tx.id,
        description: tx.description || 'Unknown Transaction',
        issueType: 'SUSPICIOUS',
        severity: 'LOW',
        details: `Round amount ($${amount}) without supporting document`
      })
    }

    // G. Check Wrong Tenant (using existing document data)
    // docData and dd are already defined above

     if (dd && tenantNames.length > 0) {
       const vendor = dd.vendor_name?.toLowerCase() || ''
       // customer_name is not a column, try to get from extracted_data
       const customer = (dd.extracted_data as any)?.customer_name?.toLowerCase() || 
                  (dd.extracted_data as any)?.receiver_name?.toLowerCase() || 
                  (dd.extracted_data as any)?.client_name?.toLowerCase() || ''

       const isTenantInvolved = tenantNames.some(tn => (
        (vendor && (vendor.includes(tn) || tn.includes(vendor))) ||
        (customer && (customer.includes(tn) || tn.includes(customer)))
       ))

       if (!isTenantInvolved) {
         const docType = (dd.extracted_data as any)?.document_type
         if (docType !== 'receipt') {
           issues.push({
            transactionId: tx.id,
            description: tx.description || 'Unknown Transaction',
            issueType: 'WRONG_TENANT',
            severity: 'MEDIUM',
            details: `Tenant '${(tenant as any)?.name}' not found in document vendor/customer`
          })
         }
       }
     }
    // I. Check Document Validation Flags (from initial processing)
    if (tx.documents && (tx.documents as any).validation_flags) {
      const flags = (tx.documents as any).validation_flags as string[]
      if (Array.isArray(flags)) {
        flags.forEach(flag => {
          // Map flag to issue type
          let issueType: AuditIssue['issueType'] = 'ANOMALY'
          let severity: AuditIssue['severity'] = 'MEDIUM'
          let details = 'Issue detected during document processing'

          if (flag === 'DUPLICATE_DOCUMENT') {
            issueType = 'DUPLICATE'
            severity = 'HIGH'
            details = 'Duplicate document file detected during upload'
          } else if (flag === 'WRONG_TENANT') {
            issueType = 'WRONG_TENANT'
            severity = 'HIGH'
            details = 'Document does not appear to belong to this tenant'
          }

          // Avoid adding duplicate issues if we already caught them above
          const alreadyExists = issues.some(i => i.transactionId === tx.id && i.issueType === issueType)
          if (!alreadyExists) {
            issues.push({
              transactionId: tx.id,
              description: tx.description || 'Unknown Transaction',
              issueType,
              severity,
              details
            })
          }
        })
      }
    }
  }

  // H. Fuzzy Duplicate Detection (Same Amount, Date +/- 2 days)
  for (const [amount, txs] of transactionsByAmount.entries()) {
    if (txs.length < 2) continue
    
    // Sort by date
    txs.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime())
    
    for (let i = 0; i < txs.length - 1; i++) {
      const current = txs[i]
      const next = txs[i+1]
      
      const date1 = new Date(current.transaction_date).getTime()
      const date2 = new Date(next.transaction_date).getTime()
      const diffDays = Math.abs(date2 - date1) / (1000 * 60 * 60 * 24)
      
      if (diffDays <= 2) {
        // Check if we already flagged these as exact duplicates
        const isAlreadyFlagged = issues.some(issue => 
          (issue.transactionId === current.id || issue.transactionId === next.id) && 
          issue.issueType === 'DUPLICATE' && 
          issue.severity === 'HIGH'
        )

        if (!isAlreadyFlagged) {
          issues.push({
            transactionId: next.id, // Flag the later one
            description: next.description || 'Unknown Transaction',
            issueType: 'DUPLICATE',
            severity: 'MEDIUM',
            details: `Potential Duplicate: Matches amount ($${amount}) and is within 2 days of another transaction`
          })
        }
      }
    }
  }

  // I. Same Document Duplicate Detection (Smart Suggestion)
  console.log('Checking Same Document Duplicates. Groups found:', txByHash.size)
  for (const [hash, group] of txByHash.entries()) {
    if (group.length > 1) {
      console.log('Found Same Document Group:', hash, 'Count:', group.length)
      // Sort to find the "Best" transaction to keep
      // Criteria:
      // 1. Status: POSTED > DRAFT (Always keep the one that is already processed/verified)
      // 2. Confidence Score: Higher is better
      // 3. Created At: Older is better (Original) - unless newer has significantly better confidence? 
      //    Let's stick to: Keep High Confidence. If equal, keep Original.
      
      const sorted = [...group].sort((a, b) => {
        // Helper to get confidence
        const getConf = (tx: any) => {
            const d = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
            const dd = Array.isArray(d?.document_data) ? d?.document_data[0] : d?.document_data
            return dd?.confidence_score || 0
        }

        // 1. Status
        if (a.status === 'POSTED' && b.status !== 'POSTED') return -1
        if (b.status === 'POSTED' && a.status !== 'POSTED') return 1
        
        // 2. Confidence Score
        const confA = getConf(a)
        const confB = getConf(b)
        if (Math.abs(confA - confB) > 0.01) return confB - confA // Descending
        
        // 3. Created At (Ascending - Keep Original)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      const winner = sorted[0]
      const losers = sorted.slice(1)

      for (const loser of losers) {
        // Avoid double-flagging if already caught by Ref ID check
        const alreadyFlagged = issues.some(i => i.transactionId === loser.id && i.issueType === 'DUPLICATE')
        if (alreadyFlagged) continue

        const getConf = (tx: any) => {
            const d = Array.isArray(tx.documents) ? tx.documents[0] : tx.documents
            const dd = Array.isArray(d?.document_data) ? d?.document_data[0] : d?.document_data
            return dd?.confidence_score || 0
        }

        const winnerConf = getConf(winner)
        const loserConf = getConf(loser)
        
        let suggestion = `Suggestion: Keep transaction dated ${formatDate(winner.transaction_date)}`
        if (winner.reference_number) suggestion = `Suggestion: Keep transaction ${winner.reference_number}`
        
        if (winnerConf > loserConf) {
            suggestion += ` (Higher Confidence: ${Math.round(winnerConf * 100)}% vs ${Math.round(loserConf * 100)}%)`
        } else if (winner.status === 'POSTED') {
            suggestion += ` (Already Posted)`
        } else {
            suggestion += ` (Original Record)`
        }

        issues.push({
            transactionId: loser.id,
            description: loser.description || 'Duplicate Transaction',
            issueType: 'DUPLICATE',
            severity: 'HIGH',
            details: `Duplicate Source Document. ${suggestion}`
        })
      }
    }
  }

  console.log('Audit complete. Issues found:', issues.length)
  return issues
}

function formatDate(dateStr: string) {
    try {
        return new Date(dateStr).toLocaleDateString()
    } catch {
        return dateStr
    }
}
