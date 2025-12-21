export type FeatureKey =
  | 'ai_access'
  | 'ai_agent'
  | 'custom_ai_provider'
  | 'bank_integration'
  | 'tax_automation'
  | 'custom_domain'
  | 'sso'
  | 'concurrent_batch_processing'
  | 'custom_features'

export const FEATURE_SLUGS: Record<FeatureKey, string> = {
  ai_access: 'ai-automation',
  ai_agent: 'ai-agent',
  custom_ai_provider: 'custom-ai-provider',
  bank_integration: 'bank-feed-integration',
  tax_automation: 'tax-automation',
  custom_domain: 'custom-domain',
  sso: 'sso',
  concurrent_batch_processing: 'concurrent-batch-processing',
  custom_features: 'custom-features',
}

export type FeatureDefinition = {
  key: FeatureKey
  label: string
  isNew?: boolean
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: 'ai_access', label: 'AI Automation' },
  { key: 'ai_agent', label: 'AI Agent (Voice/Text)' },
  { key: 'custom_ai_provider', label: 'Custom AI Provider' },
  { key: 'bank_integration', label: 'Bank Feed Integration' },
  { key: 'tax_automation', label: 'Tax Automation' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'sso', label: 'SSO / Enterprise Security' },
  { key: 'concurrent_batch_processing', label: 'Concurrent Batch Processing', isNew: true },
  { key: 'custom_features', label: 'Custom features and more' },
]

export function isFeatureImplemented(featureKey: FeatureKey): boolean {
  // Keep this hook for future rollout control.
  // Tax automation is now implemented (settings + estimation + auto-fill pipeline).
  void featureKey
  return true
}

export function isFeatureEnabled(features: unknown, featureKey: FeatureKey): boolean {
  if (!isFeatureImplemented(featureKey)) return false
  if (!features || typeof features !== 'object') return false
  const obj = features as Record<string, unknown>
  return obj[featureKey] === true
}

export function featureKeyToSlug(featureKey: FeatureKey): string {
  return FEATURE_SLUGS[featureKey]
}

export function featureSlugToKey(slug: string): FeatureKey | null {
  const normalized = String(slug || '').trim().toLowerCase()
  for (const [key, value] of Object.entries(FEATURE_SLUGS) as Array<[FeatureKey, string]>) {
    if (value === normalized) return key
  }
  return null
}

export function getFeatureLabel(featureKey: FeatureKey): string {
  return FEATURE_DEFINITIONS.find((f) => f.key === featureKey)?.label || featureKey
}
