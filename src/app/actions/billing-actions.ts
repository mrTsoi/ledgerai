'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateUploadBytes } from '@/lib/uploads/validate-upload'

export async function importInvoiceToTransactions(invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // 1. Get the invoice details
  const { data: invoice, error: invoiceError } = await supabase
    .from('billing_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    return { error: 'Invoice not found' }
  }

  // 2. Find the user's primary tenant (Company)
  // We assume the user wants to import this into their "active" or "primary" tenant.
  // Since we don't have the tenant context here easily, we'll pick the first one they own or are admin of.
  // Ideally, the UI should pass the tenant ID, but let's try to find one.
  
  const { data: membership } = await supabase
    .from('memberships')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['OWNER', 'COMPANY_ADMIN', 'ACCOUNTANT'])
    .limit(1)
    .single()

  if (!membership) {
    return { error: 'No active company found to import expenses to.' }
  }

  const tenantId = (membership as any).tenant_id

  // 3. Check if already imported (optional, but good practice)
  // We can check if a transaction exists with this reference number
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('reference_number', (invoice as any).stripe_invoice_id)
    .single()

  if (existing) {
    return { error: 'This invoice has already been imported.' }
  }

  // 3.5 Download and Upload Invoice PDF
  let documentId = null
  if ((invoice as any).invoice_pdf) {
    try {
      const pdfUrl = (invoice as any).invoice_pdf
      const pdfResponse = await fetch(pdfUrl)
      
      if (pdfResponse.ok) {
        const pdfBuffer = await pdfResponse.arrayBuffer()
        const validation = validateUploadBytes({
          filename: 'invoice.pdf',
          contentType: 'application/pdf',
          bytes: Buffer.from(pdfBuffer),
        })
        if (!validation.ok) {
          throw new Error(`Invoice PDF rejected: ${validation.error}`)
        }
        const fileName = `invoice_${(invoice as any).stripe_invoice_id}.pdf`
        const filePath = `${tenantId}/${new Date().getFullYear()}/${fileName}`

        // Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, pdfBuffer, {
            contentType: validation.canonicalMime,
            upsert: true
          })

        if (!uploadError) {
          // Create Document Record
          const { data: doc } = await (supabase
            .from('documents') as any)
            .insert({
              tenant_id: tenantId,
              file_path: filePath,
              file_name: fileName,
              file_size: validation.size,
              file_type: validation.canonicalMime,
              status: 'PROCESSED',
              document_type: 'INVOICE',
              uploaded_by: user.id
            })
            .select()
            .single()

          if (doc) {
            documentId = doc.id
          }
        } else {
            console.error('Upload error:', uploadError)
        }
      }
    } catch (e) {
      console.error('Failed to process invoice PDF:', e)
    }
  }

  // 4. Create the Transaction (Expense)
  const { data: transaction, error: transError } = await (supabase
    .from('transactions') as any)
    .insert({
      tenant_id: tenantId,
      transaction_date: new Date((invoice as any).created_at).toISOString().split('T')[0],
      description: `Subscription Payment (Invoice #${(invoice as any).stripe_invoice_id.slice(-6)})`,
      reference_number: (invoice as any).stripe_invoice_id,
      status: 'DRAFT', // Start as draft so they can review
      document_id: documentId,
      created_by: user.id,
      notes: `Imported from Billing History. Amount: $${(invoice as any).amount_paid}`
    })
    .select()
    .single()

  if (transError) {
    console.error('Transaction creation error:', transError)
    return { error: 'Failed to create transaction record.' }
  }

  // 5. Create Line Items (Double Entry)
  // We need to find appropriate accounts.
  // Debit: Software Subscription Expense (or generic Expense)
  // Credit: Cash/Bank (or Accounts Payable if unpaid, but this is paid)
  
  // Let's try to find a "Software" or "Office Supplies" expense account
  const { data: expenseAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('account_type', 'EXPENSE')
    .ilike('name', '%Software%')
    .limit(1)
    .single()

  // Fallback to any expense
  let expenseAccountId = (expenseAccount as any)?.id
  if (!expenseAccountId) {
    const { data: anyExpense } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('account_type', 'EXPENSE')
      .limit(1)
      .single()
    expenseAccountId = (anyExpense as any)?.id
  }

  // Find Bank/Cash account
  const { data: bankAccount } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('account_type', 'ASSET')
    .ilike('name', '%Cash%')
    .limit(1)
    .single()
    
  let bankAccountId = (bankAccount as any)?.id
  if (!bankAccountId) {
     const { data: anyAsset } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('account_type', 'ASSET')
      .limit(1)
      .single()
    bankAccountId = (anyAsset as any)?.id
  }

  if (expenseAccountId && bankAccountId) {
    await supabase.from('line_items').insert([
      {
        transaction_id: (transaction as any).id,
        account_id: expenseAccountId,
        debit: (invoice as any).amount_paid,
        credit: 0,
        description: 'Subscription Expense'
      },
      {
        transaction_id: (transaction as any).id,
        account_id: bankAccountId,
        debit: 0,
        credit: (invoice as any).amount_paid,
        description: 'Payment from Bank'
      }
    ] as any)
  }

  revalidatePath('/dashboard/settings/billing')
  return { success: true, transactionId: (transaction as any).id }
}
