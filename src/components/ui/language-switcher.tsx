'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { useTransition, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Language {
  code: string;
  name: string;
  flag_emoji: string;
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [languages, setLanguages] = useState<Language[]>([
    { code: 'en', name: 'English', flag_emoji: '🇺🇸' },
    { code: 'zh-CN', name: '简体中文', flag_emoji: '🇨🇳' },
    { code: 'zh-TW', name: '繁體中文', flag_emoji: '🇹🇼' }
  ]);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchLanguages = async () => {
      const { data } = await supabase
        .from('system_languages')
        .select('code, name, flag_emoji')
        .eq('is_active', true);
      
      if (data && data.length > 0) {
        setLanguages(data);
      }
    };
    fetchLanguages();
  }, [supabase]);

  const handleChange = (nextLocale: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale as any });
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select defaultValue={locale} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-[140px] h-9 border-none bg-transparent focus:ring-0 hover:bg-gray-100">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <SelectValue placeholder="Language" />
          </div>
        </SelectTrigger>
        <SelectContent align="end">
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.flag_emoji} {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
