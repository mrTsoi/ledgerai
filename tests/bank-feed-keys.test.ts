import { describe, it, expect, beforeAll } from 'vitest'
import { generateTenantWebhookKey, hashTenantWebhookKey, timingSafeEqualHex } from '../src/lib/bank-feed-keys'

beforeAll(() => {
  process.env.BANK_FEED_KEY_PEPPER = 'test-pepper'
})

describe('bank-feed-keys utilities', () => {
  it('generates a key and prefix', () => {
    const { key, prefix } = generateTenantWebhookKey()
    expect(typeof key).toBe('string')
    expect(key.startsWith('bfk_')).toBe(true)
    expect(prefix.length).toBeGreaterThan(0)
  })

  it('hashes a key deterministically', () => {
    const key = 'bfk_abc123'
    const h1 = hashTenantWebhookKey(key)
    const h2 = hashTenantWebhookKey(key)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('timingSafeEqualHex compares equal hex strings', () => {
    const h = hashTenantWebhookKey('bfk_equal_test')
    expect(timingSafeEqualHex(h, h)).toBe(true)
  })

  it('returns false for different lengths or invalid hex', () => {
    const a = 'deadbeef'
    const b = '00'
    expect(timingSafeEqualHex(a, b)).toBe(false)
    expect(timingSafeEqualHex('not-hex', '1234')).toBe(false)
  })
})