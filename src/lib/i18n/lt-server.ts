import { getLocale, getTranslations } from 'next-intl/server'

import { literalKeyFromText } from '@/lib/i18n/literal-key'

function applyFallbackVars(template: string, values?: Record<string, unknown>) {
  if (!values) return template
  let result = template
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{${key}}`).join(String(value))
  }
  return result
}

export type LtFn = (english: string, values?: Record<string, unknown>) => string

export async function getLt(): Promise<LtFn> {
  const locale = await getLocale()
  const t = await getTranslations('literals')

  return (english: string, values?: Record<string, unknown>) => {
    // English is the source-of-truth for literals.
    // Avoid calling next-intl for `en` to prevent missing-key errors and key-echo fallbacks.
    if (locale === 'en') return applyFallbackVars(english, values)

    const key = literalKeyFromText(english)
    const has = (t as any)?.has

    const hasKey = (k: string) => (typeof has === 'function' ? !!has.call(t, k) : true)

    // If the exact key is missing, try a case-normalized fallback key.
    let lookupKey = key
    if (!hasKey(lookupKey)) {
      const lowered = String(english ?? '').toLowerCase()
      if (lowered !== english) {
        const altKey = literalKeyFromText(lowered)
        if (hasKey(altKey)) lookupKey = altKey
      }
    }

    if (!hasKey(lookupKey)) return applyFallbackVars(english, values)

    let value = ''
    try {
      value = String((t as any)(lookupKey as any, values as any) ?? '').trim()
    } catch {
      return applyFallbackVars(english, values)
    }

    if (!value) return applyFallbackVars(english, values)
    if (value === lookupKey) return applyFallbackVars(english, values)
    if (value === `literals.${lookupKey}`) return applyFallbackVars(english, values)
    if (value.startsWith('literals.literal.')) return applyFallbackVars(english, values)
    return value
  }
}
