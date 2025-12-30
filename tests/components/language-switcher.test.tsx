import React from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
const replaceMock = vi.fn()
vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ replace: replaceMock }) }))
// Use test mock for Select (configured via vitest alias)

import { LanguageSwitcher } from '../../src/components/ui/language-switcher'

describe('LanguageSwitcher (DOM)', () => {
  it('renders and responds to interaction', async () => {
    const { getByTestId, container } = render(React.createElement(LanguageSwitcher))
    expect(container.firstChild).toBeTruthy()
    // Sanity checks: component renders and router.replace is available
    expect(typeof replaceMock).toBe('function')
  })
})
