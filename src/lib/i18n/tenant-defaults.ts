import { locales } from '@/i18n/navigation'

export type AppLocale = (typeof locales)[number]

function normalizeLocaleTag(tag: string): string {
  return String(tag || '').trim()
}

function pickSupportedLocale(candidate: string): AppLocale {
  const tag = normalizeLocaleTag(candidate)

  // Direct match
  if ((locales as readonly string[]).includes(tag)) return tag as AppLocale

  // Normalize Chinese variants
  const lower = tag.toLowerCase()
  if (lower.startsWith('zh')) {
    // Prefer Simplified for Mainland/SG, Traditional for HK/TW/MO.
    if (/(^zh[-_](cn|hans|sg))/.test(lower)) return 'zh-CN'
    if (/(^zh[-_](hk|hant|tw|mo))/.test(lower)) return 'zh-HK'
    // Fallback for generic zh
    return 'zh-CN'
  }

  // Default locale
  return 'en'
}

function inferCurrencyFromLocaleTag(tag: string): string {
  const normalized = normalizeLocaleTag(tag).replace('_', '-')
  const parts = normalized.split('-')
  const language = (parts[0] || '').toLowerCase()
  const region = (parts[1] || '').toUpperCase()

  // Exact mappings for our supported Chinese locales
  if (language === 'zh') {
    if (region === 'CN' || normalized.toLowerCase().includes('hans')) return 'CNY'
    if (region === 'HK') return 'HKD'
    if (region === 'TW' || normalized.toLowerCase().includes('hant')) return 'TWD'
    if (region === 'MO') return 'MOP'
    if (region === 'SG') return 'SGD'
    return 'CNY'
  }

  // Common English regions
  if (language === 'en') {
    if (region === 'US') return 'USD'
    if (region === 'GB') return 'GBP'
    if (region === 'AU') return 'AUD'
    if (region === 'CA') return 'CAD'
    if (region === 'NZ') return 'NZD'
    if (region === 'SG') return 'SGD'
    if (region === 'HK') return 'HKD'
    if (region === 'IN') return 'INR'
    if (region === 'MY') return 'MYR'
    if (region === 'PH') return 'PHP'
    if (region === 'ZA') return 'ZAR'
    if (region === 'IE') return 'EUR'
    if (region === 'DE' || region === 'FR' || region === 'ES' || region === 'IT' || region === 'NL') return 'EUR'
  }

  // Generic region-based fallback
  switch (region) {
    case 'CN':
      return 'CNY'
    case 'HK':
      return 'HKD'
    case 'TW':
      return 'TWD'
    case 'JP':
      return 'JPY'
    case 'KR':
      return 'KRW'
    case 'SG':
      return 'SGD'
    case 'MY':
      return 'MYR'
    case 'TH':
      return 'THB'
    case 'VN':
      return 'VND'
    case 'ID':
      return 'IDR'
    case 'IN':
      return 'INR'
    case 'GB':
      return 'GBP'
    case 'EU':
      return 'EUR'
    default:
      return 'USD'
  }
}

export function getTenantDefaultsFromBrowser(): { locale: AppLocale; currency: string; browserLocale: string } {
  // Safe defaults when executed during SSR or in non-browser contexts.
  if (typeof window === 'undefined') {
    return { locale: 'en', currency: 'USD', browserLocale: 'en' }
  }

  const browserLocale =
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    navigator.language ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    'en'

  const locale = pickSupportedLocale(browserLocale)
  const currency = inferCurrencyFromLocaleTag(browserLocale)

  return { locale, currency, browserLocale }
}
