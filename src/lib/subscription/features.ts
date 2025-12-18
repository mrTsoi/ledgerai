export type FeatureKey =
  | 'ai_access'
  | 'ai_agent'
  | 'bank_integration'
  | 'tax_automation'
  | 'custom_domain'
  | 'sso'
  | 'concurrent_batch_processing'
  | 'custom_features'

export type FeatureDefinition = {
  key: FeatureKey
  label: string
  isNew?: boolean
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: 'ai_access', label: 'AI Automation' },
  { key: 'ai_agent', label: 'AI Agent (Voice/Text)' },
  { key: 'bank_integration', label: 'Bank Feed Integration' },
  { key: 'tax_automation', label: 'Tax Automation' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'sso', label: 'SSO / Enterprise Security' },
  { key: 'concurrent_batch_processing', label: 'Concurrent Batch Processing', isNew: true },
  { key: 'custom_features', label: 'Custom features and more' },
]

export function isFeatureEnabled(features: unknown, featureKey: FeatureKey): boolean {
  if (!features || typeof features !== 'object') return false
  const obj = features as Record<string, unknown>
  return obj[featureKey] === true
}

export function getFeatureLabel(featureKey: FeatureKey): string {
  return FEATURE_DEFINITIONS.find((f) => f.key === featureKey)?.label || featureKey
}
