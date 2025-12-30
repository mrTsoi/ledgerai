import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// Mock the onSaved callback and any external dependencies
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null })
            })
          })
        })
      }),
      insert: async () => ({ data: null, error: null })
    })
  })
}))
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ currentTenant: { id: 'tenant-1' } }) }))

import { BankAccountForm } from '../../src/components/banking/bank-account-form'

describe('BankAccountForm (interaction)', () => {
  it('fills and submits the bank account form', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(React.createElement(BankAccountForm, { onSaved, onClose }))

    const nameInput = screen.getByPlaceholderText('e.g. Chase Operating')
    const numberInput = screen.getByPlaceholderText('1234')

    await userEvent.type(nameInput, 'Test Bank')
    await userEvent.type(numberInput, '1234')

    const saveButton = screen.getByText(/Save Account/i)
    await userEvent.click(saveButton)

    // The mock insert returns success; ensure callback was invoked
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(saveButton).toBeTruthy()
  })
})
