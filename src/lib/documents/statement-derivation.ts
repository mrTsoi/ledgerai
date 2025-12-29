export interface DerivedFlags {
  start: boolean
  end: boolean
  opening: boolean
  closing: boolean
}

export interface DerivedStatement {
  statement_period_start: string | null
  statement_period_end: string | null
  opening_balance: string | number | null
  closing_balance: string | number | null
  derived: DerivedFlags
}

// existingValues may have any of the fields; transactions is an array of tx objects
export default function deriveStatementFromTransactions(
  existingValues: Partial<Record<string, any>>,
  transactions: Array<Record<string, any>>
): DerivedStatement {
  const txs = Array.isArray(transactions) ? transactions : []
  const first = txs.length > 0 ? txs[0] : null
  const last = txs.length > 0 ? txs[txs.length - 1] : null

  const start = existingValues.statement_period_start ?? (first?.date ?? null)
  const end = existingValues.statement_period_end ?? (last?.date ?? null)

  const opening = (existingValues.opening_balance !== undefined && existingValues.opening_balance !== null)
    ? existingValues.opening_balance
    : (first?.balance ?? null)

  const closing = (existingValues.closing_balance !== undefined && existingValues.closing_balance !== null)
    ? existingValues.closing_balance
    : (last?.balance ?? null)

  const derived: DerivedFlags = {
    start: (existingValues.statement_period_start === undefined || existingValues.statement_period_start === null || String(existingValues.statement_period_start).trim() === '') && !!(first?.date),
    end: (existingValues.statement_period_end === undefined || existingValues.statement_period_end === null || String(existingValues.statement_period_end).trim() === '') && !!(last?.date),
    opening: (existingValues.opening_balance === undefined || existingValues.opening_balance === null || String(existingValues.opening_balance).trim() === '') && !!(first?.balance),
    closing: (existingValues.closing_balance === undefined || existingValues.closing_balance === null || String(existingValues.closing_balance).trim() === '') && !!(last?.balance)
  }

  return {
    statement_period_start: start === '' ? null : start,
    statement_period_end: end === '' ? null : end,
    opening_balance: opening === '' ? null : opening,
    closing_balance: closing === '' ? null : closing,
    derived
  }
}
