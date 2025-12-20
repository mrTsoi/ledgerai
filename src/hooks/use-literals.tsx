'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { literalKeyFromText } from '@/lib/i18n/literal-key'

export function useLiterals() {
  const locale = useLocale()
  const t = useTranslations('literals')

  const applyFallbackVars = (template: string, values?: Record<string, unknown>) => {
    if (!values) return template
    let result = template
    for (const [key, value] of Object.entries(values)) {
      result = result.split(`{${key}}`).join(String(value))
    }
    return result
  }

  return useCallback((english: string, values?: Record<string, unknown>) => {
    // English is the source-of-truth for literals.
    // Avoid calling next-intl for `en` to prevent missing-key errors and key-echo fallbacks.
    if (locale === 'en') return applyFallbackVars(english, values)

    const key = literalKeyFromText(english)

    const has = (t as any)?.has
    if (typeof has === 'function' && !has.call(t, key)) return applyFallbackVars(english, values)

    let value = ''
    try {
      value = String((t as any)(key as any, values as any) ?? '').trim()
    } catch {
      return applyFallbackVars(english, values)
    }
    // Some configurations return the key path instead of throwing.
    if (!value) return applyFallbackVars(english, values)
    if (value === key) return applyFallbackVars(english, values)
    if (value === `literals.${key}`) return applyFallbackVars(english, values)
    if (value.startsWith('literals.literal.')) return applyFallbackVars(english, values)
    return value
  }, [locale, t])
}
