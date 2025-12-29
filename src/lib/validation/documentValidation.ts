export type ValidationResult = {
  isValid: boolean
  missingFields: string[]
  messages: string[]
}

export function validateDocument(formData: Record<string, any>, bankTransactions: Array<any> = []): ValidationResult {
  const missingFields: string[] = []
  const messages: string[] = []

  const docType = formData.document_type || ''

  // Common required fields for non-bank documents
  if (docType !== 'bank_statement') {
    if (!formData.currency || String(formData.currency).trim() === '') {
      missingFields.push('currency')
      messages.push('Currency is required')
    }
    if (!formData.vendor_name || String(formData.vendor_name).trim() === '') {
      missingFields.push('vendor_name')
      messages.push('Vendor / Payee is required')
    }
    if (!formData.total_amount || Number(formData.total_amount) === 0) {
      missingFields.push('total_amount')
      messages.push('Total amount is required')
    }
    if (!formData.transaction_type || String(formData.transaction_type).trim() === '') {
      missingFields.push('transaction_type')
      messages.push('Transaction type is required')
    }
  }

  // Bank statement required fields
  if (docType === 'bank_statement') {
    // Bank statements must have extracted bank transactions at minimum.
    if (!bankTransactions || bankTransactions.length === 0) {
      missingFields.push('bank_transactions')
      messages.push('At least one bank transaction is required to create statement transactions')
    }
    // Require statement-level data when saving via verification UI so users
    // are prompted to confirm/complete critical statement metadata.
    /*
    if (!formData.statement_period_start || String(formData.statement_period_start).trim() === '') {
      missingFields.push('statement_period_start')
      messages.push('Statement start date is required')
    }
    if (!formData.statement_period_end || String(formData.statement_period_end).trim() === '') {
      missingFields.push('statement_period_end')
      messages.push('Statement end date is required')
    }
    if (formData.opening_balance === undefined || formData.opening_balance === null || String(formData.opening_balance).trim() === '') {
      missingFields.push('opening_balance')
      messages.push('Opening balance is required')
    }
    if (formData.closing_balance === undefined || formData.closing_balance === null || String(formData.closing_balance).trim() === '') {
      missingFields.push('closing_balance')
      messages.push('Closing balance is required')
    }*/

    if(formData.bank_name && String(formData.bank_name).trim() === ''){
      missingFields.push('bank_name')
      messages.push('Bank name is required to link bank account')
    }
    // bank_name/account_number are helpful but not strictly required — bank account
    // may be created later or left null.
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    messages
  }
}

export default validateDocument
