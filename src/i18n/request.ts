import {getRequestConfig} from 'next-intl/server';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default getRequestConfig(async ({requestLocale}) => {
  // This typically comes from the URL or a cookie
  let locale = await requestLocale;
 
  // Ensure that a valid locale is used
  if (!locale || !['en', 'zh-CN', 'zh-TW'].includes(locale)) {
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

  // 2. Load DB messages
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = await createServerSupabaseClient()
      const { data: dbTranslations } = await supabase
        .from('app_translations')
        .select('namespace, key, value')
        .eq('locale', locale);

      // 3. Merge
      if (dbTranslations && dbTranslations.length > 0) {
        // Deep merge or namespace merge
        // Our structure is { namespace: { key: value } }
        dbTranslations.forEach((t: any) => {
          if (!fileMessages[t.namespace]) {
            fileMessages[t.namespace] = {};
          }
          fileMessages[t.namespace][t.key] = t.value;
        });
      }
    } catch (error) {
      console.error('Error loading translations from DB:', error);
      // Fallback to file messages only
    }
  }
 
  return {
    locale,
    messages: fileMessages
  };
});
