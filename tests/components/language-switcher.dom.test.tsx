import React from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ replace: () => {} }) }))
// Use test mock for Select (configured via vitest alias)

import { LanguageSwitcher } from '../../src/components/ui/language-switcher'

describe('LanguageSwitcher (DOM)', () => {
  it('renders and does not crash', async () => {
    const { container } = render(React.createElement(LanguageSwitcher))
    expect(container.firstChild).toBeTruthy()
  })
})
