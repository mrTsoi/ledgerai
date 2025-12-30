import {getRequestConfig} from 'next-intl/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function setNested(target: any, path: string, value: any) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (parts.length === 0) return

  let cur = target
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (i === parts.length - 1) {
      cur[p] = value
      return
    }
    if (!cur[p] || typeof cur[p] !== 'object') {
      cur[p] = {}
    }
    cur = cur[p]
  }
}

function normalizeDotKeys(obj: any) {
  if (!obj || typeof obj !== 'object') return

  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key]

    if (key.includes('.')) {
      delete (obj as any)[key]
      setNested(obj, key, value)
      continue
    }

    if (value && typeof value === 'object') {
      normalizeDotKeys(value)
    }
  }
}

export default getRequestConfig(async ({requestLocale}) => {
  // This typically comes from the URL or a cookie
  let locale = await requestLocale;

  // Legacy alias: treat zh-TW as zh-HK
  if (locale === 'zh-TW') {
    locale = 'zh-HK'
  }
 
  // Ensure that a valid locale is used
  if (!locale || !['en', 'zh-CN', 'zh-HK'].includes(locale)) {
    locale = 'en';
  }

  // 1. Load file messages
  let fileMessages: any = {};
  try {
    fileMessages = (await import(`../../src/i18n/${locale}.json`)).default;
  } catch (error) {
    console.error(`Error loading i18n file for locale ${locale}:`, error);
    // Fallback to empty object or default locale if needed
    if (locale !== 'en') {
      try {
        fileMessages = (await import(`../../src/i18n/en.json`)).default;
      } catch (e) {
        console.error('Error loading fallback en.json:', e);
      }
    }
  }

  // Normalize any dot-notation keys in JSON messages into nested objects.
  // next-intl rejects message objects that contain literal '.' characters in keys.
  normalizeDotKeys(fileMessages)

  // 2. Load DB messages
  if (supabaseUrl && supabaseKey) {
    try {
      // Dynamically import Supabase to avoid pulling Node-only APIs into modules
      // that may run in the Edge runtime. The package reads `process.version` on
      // import which triggers Next.js Edge runtime warnings.
      const { createClient } = await import('@supabase/supabase-js')

      // Use a plain client to avoid cookie/header issues during i18n loading.
      // RLS policies on app_translations allow public read, so anon key is sufficient.
      const supabase = createClient(supabaseUrl, supabaseKey as string)

      // Legacy alias handling:
      // - If DB still contains zh-TW rows, treat them as fallback.
      // - Ensure zh-HK overrides zh-TW (so legacy values never overwrite canonical).
      const localesToFetch = locale === 'zh-HK' ? ['zh-TW', 'zh-HK'] : [locale]

      // Supabase/PostgREST commonly enforces a default max of ~1000 rows per request.
      // If we only fetch one page, some translations will never be loaded into next-intl,
      // which shows up as "some literals not translated" even though rows exist in DB.
      const dbTranslations: any[] = []
      const pageSize = 1000
      for (let offset = 0; offset < 100000; offset += pageSize) {
        const { data, error: dbError } = await supabase
          .from('app_translations')
          .select('locale, namespace, key, value')
          .in('locale', localesToFetch)
          .order('locale')
          .order('namespace')
          .order('key')
          .range(offset, offset + pageSize - 1)

        if (dbError) {
          console.error('Error loading translations from DB:', dbError)
          break
        }

        if (data && data.length > 0) {
          dbTranslations.push(...data)
        }

        if (!data || data.length < pageSize) {
          break
        }
      }

      // 3. Merge
      if (dbTranslations && dbTranslations.length > 0) {
        const order = new Map<string, number>()
        localesToFetch.forEach((l, idx) => order.set(l, idx))
        const sorted = [...dbTranslations].sort((a: any, b: any) => {
          return (order.get(String(a.locale)) ?? 0) - (order.get(String(b.locale)) ?? 0)
        })

        // Deep merge by namespace. Later entries override earlier ones.
        sorted.forEach((t: any) => {
          if (!fileMessages[t.namespace]) {
            fileMessages[t.namespace] = {};
          }

          // Support nested keys via dot-notation (e.g. admin.tabs.overview stored as namespace=admin, key=tabs.overview)
          // Backward compatible for flat keys.
          setNested(fileMessages[t.namespace], t.key, t.value)
        });
      }
    } catch (error) {
      console.error('Error loading translations from DB:', error);
      // Fallback to file messages only
    }
  }

  // Defensive: DB merges may also bring in dotted paths.
  normalizeDotKeys(fileMessages)
 
  return {
    locale,
    messages: fileMessages
  };
});
