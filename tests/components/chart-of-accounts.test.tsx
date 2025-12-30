import React from 'react'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// Mock tenant hook
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ currentTenant: { id: 'tenant-1' } }) }))

// Mock supabase client used by the component
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [
            { id: 'a1', tenant_id: 'tenant-1', code: '1000', name: 'Cash', account_type: 'ASSET' },
            { id: 'a2', tenant_id: 'tenant-1', code: '2000', name: 'Revenue', account_type: 'REVENUE' }
          ], error: null })
        })
      })
    })
  })
}))

import { ChartOfAccounts } from '../../src/components/accounts/chart-of-accounts'

describe('ChartOfAccounts (interaction)', () => {
  it('opens Add Account form when Add Account clicked', async () => {
    const { getByText, queryByLabelText } = render(React.createElement(ChartOfAccounts))

    // Wait for the Add Account button to appear
    await waitFor(() => expect(getByText('Add Account')).toBeTruthy())

    await userEvent.click(getByText('Add Account'))

    // Form should appear with Account Code input
    await waitFor(() => expect(queryByLabelText('Account Code *')).toBeTruthy())
  })
})
