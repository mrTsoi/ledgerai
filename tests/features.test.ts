import { describe, it, expect } from 'vitest'
import { isFeatureEnabled, getFeatureLabel } from '../src/lib/subscription/features'

describe('subscription features helpers', () => {
  it('returns false for missing features', () => {
    expect(isFeatureEnabled(null, 'ai_access')).toBe(false)
  })

  it('detects enabled feature by key', () => {
    const features = { ai_access: true, ai_agent: false }
    expect(isFeatureEnabled(features, 'ai_access')).toBe(true)
    expect(isFeatureEnabled(features, 'ai_agent')).toBe(false)
  })

  it('returns label for known feature key', () => {
    expect(getFeatureLabel('ai_access')).toBe('AI Automation')
  })

  it('falls back to key when label missing', () => {
    // @ts-expect-error - simulate unknown key
    expect(getFeatureLabel('unknown_feature')).toBe('unknown_feature')
  })
})