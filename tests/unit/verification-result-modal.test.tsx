import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock next/link to render a simple anchor for href checks
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }))

import VerificationResultModal from '@/components/documents/verification-result-modal'

describe('VerificationResultModal', () => {
  beforeEach(() => {
    // Mock clipboard in a way compatible with the test transformer
    // @ts-ignore
    if (!global.navigator) (global as any).navigator = {}
    // @ts-ignore
    global.navigator.clipboard = { writeText: vi.fn() }
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('renders result details and link buttons, and copies IDs', async () => {
    const result = {
      bankAccountId: 'acct_123',
      bankStatementId: 'stmt_456',
      transactionsInserted: 3,
      transactionId: 'tx_789',
      transactionStatus: 'PENDING',
      message: 'Saved successfully'
    }

    const onClose = vi.fn()
    render(<VerificationResultModal result={result} onClose={onClose} />)

    // Texts
    expect(screen.getByText(/Bank account created\/linked:/i)).toBeTruthy()
    expect(screen.getByText(/Bank statement created\/updated:/i)).toBeTruthy()
    expect(screen.getByText(/3 transaction\(s\) inserted/i)).toBeTruthy()
    expect(screen.getByText(/Transaction updated\/created:/i)).toBeTruthy()
    expect(screen.getByText(/Transaction status:/i)).toBeTruthy()
    expect(screen.getByText('Saved successfully')).toBeTruthy()

    // Link buttons
    const acctLink = screen.getByRole('link', { name: /Open Bank Account/i }) as HTMLAnchorElement
    expect(acctLink).toBeTruthy()
    expect(acctLink.getAttribute('href')).toBe('/dashboard/banking/acct_123')

    const stmtButton = screen.getByRole('link', { name: /View Statement/i }) as HTMLAnchorElement
    expect(stmtButton.getAttribute('href')).toBe('/dashboard/banking/acct_123#statements')

    const txLink = screen.getByRole('link', { name: /Open Transaction/i }) as HTMLAnchorElement
    expect(txLink.getAttribute('href')).toBe('/dashboard/transactions')

    // Copy IDs
    const copyBtn = screen.getByRole('button', { name: /Copy IDs/i })
    await fireEvent.click(copyBtn)
    expect((navigator.clipboard.writeText as any)).toHaveBeenCalled()
  })

  it('renders minimal result without links gracefully', () => {
    const result = { message: 'Nothing created' }
    const onClose = vi.fn()
    render(<VerificationResultModal result={result} onClose={onClose} />)
    expect(screen.getByText('Nothing created')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Close/i })).toBeTruthy()
  })
})
