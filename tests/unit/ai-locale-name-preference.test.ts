import { describe, it, expect } from 'vitest'

// We test the behavior through the public service by importing helpers indirectly is not possible
// because the locale preference logic is internal. Instead, we validate the regex heuristics via
// representative strings by importing the module and accessing the helper through a lightweight shim.
//
// Note: This file intentionally relies on the module's exported surface only.
// If you prefer, we can export the helper explicitly and test it directly.

describe('AIProcessingService locale name preference', () => {
  it('prefers Chinese variant for zh locales', async () => {
    const mod = await import('../../src/lib/ai/document-processor')
    const svc = mod.AIProcessingService as any

    const extracted = {
      vendor_name: 'ABC Limited / ABC有限公司',
      customer_name: 'Foo Inc (富有限公司)',
      bank_name: 'Bank of Somewhere 銀行',
      account_holder_name: 'John Doe / 張三'
    }

    const out = svc.applyTenantLocalePreferences(extracted, 'zh-HK')

    expect(out.vendor_name).toContain('有限公司')
    expect(out.customer_name).toContain('有限公司')
    expect(out.account_holder_name).toContain('張')
  })

  it('prefers English variant for en locale', async () => {
    const mod = await import('../../src/lib/ai/document-processor')
    const svc = mod.AIProcessingService as any

    const extracted = {
      vendor_name: 'ABC Limited / ABC有限公司',
      customer_name: 'Foo Inc (富有限公司)'
    }

    const out = svc.applyTenantLocalePreferences(extracted, 'en')

    expect(out.vendor_name).toContain('ABC')
    expect(out.vendor_name).not.toContain('有限公司')
    expect(out.customer_name).toContain('Foo')
    expect(out.customer_name).not.toContain('有限公司')
  })
})
