// Minimal test environment setup
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role'
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key'

// Provide a default Stripe webhook secret if tests need it
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test'

import React from 'react'
import { vi } from 'vitest'
;(globalThis as any).React = React

// Many components rely on `useLiterals()` which depends on next-intl hooks.
// In unit tests we don't mount the Next Intl provider, so we mock these hooks.
vi.mock('next-intl', () => {
	return {
		useLocale: () => 'en',
		useTranslations: () => {
			const t: any = (key: string) => key
			t.has = () => false
			return t
		},
		NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children
	}
})
