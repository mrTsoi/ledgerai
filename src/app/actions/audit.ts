'use server'

import { createClient } from '@/lib/supabase/server'
import { AuditIssue } from '@/types/audit'

export async function auditTransactions(tenantId: string): Promise<AuditIssue[]> {
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
          customer_name,
          extracted_data
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .neq('status', 'VOID') // Ignore voided

  if (error || !transactions) return []

  // 2. Fetch Tenant Name for validation
  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).single()
  const tenantName = tenant?.name?.toLowerCase() || ''

  // 3. Analyze
  const seenRefs = new Map<string, string>() // ref -> txId
  const seenHashes = new Map<string, string>() // content_hash -> txId
  const seenFingerprints = new Map<string, string>() // date|amount -> txId
  const seenVendorDateAmount = new Map<string, string>() // vendor|date|amount -> txId
  
  // For fuzzy duplicate detection
  const transactionsByAmount = new Map<number, any[]>()

  for (const tx of transactions) {
    const totalDebits = tx.line_items.reduce((sum: number, li: any) => sum + (li.debit || 0), 0)
    const totalCredits = tx.line_items.reduce((sum: number, li: any) => sum + (li.credit || 0), 0)
    const amount = Math.max(totalDebits, totalCredits)
    
    // Group by amount for fuzzy date check
    if (amount > 0) {
      const existing = transactionsByAmount.get(amount) || []
      existing.push(tx)
      transactionsByAmount.set(amount, existing)
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
      const key = tx.reference_number.toLowerCase().trim()
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

    // C. Check Duplicates (Document Content Hash)
    if (tx.documents && (tx.documents as any).content_hash) {
      const hash = (tx.documents as any).content_hash
      if (seenHashes.has(hash)) {
         issues.push({
          transactionId: tx.id,
          description: tx.description || 'Unknown Transaction',
          issueType: 'DUPLICATE',
          severity: 'HIGH',
          details: `Duplicate Document File: Identical file content detected`
        })
      } else {
        seenHashes.set(hash, tx.id)
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
    const docData = (tx.documents as any)?.document_data
    const dd = Array.isArray(docData) ? docData[0] : docData

    if (dd && tenantName) {
       const vendor = dd.vendor_name?.toLowerCase() || ''
       const customer = dd.customer_name?.toLowerCase() || ''
       
       const isTenantInvolved = vendor.includes(tenantName) || customer.includes(tenantName) || tenantName.includes(vendor) || tenantName.includes(customer)
       
       if (!isTenantInvolved) {
          const docType = (dd.extracted_data as any)?.document_type
          if (docType !== 'receipt') {
             issues.push({
              transactionId: tx.id,
              description: tx.description || 'Unknown Transaction',
              issueType: 'WRONG_TENANT',
              severity: 'MEDIUM',
              details: `Tenant '${tenant?.name}' not found in document vendor/customer`
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

  return issues
}
