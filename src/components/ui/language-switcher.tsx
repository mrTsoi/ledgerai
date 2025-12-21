'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { useTransition, useEffect, useState } from 'react';
import { useLiterals } from '@/hooks/use-literals';

interface Language {
  code: string;
  name: string;
  flag_emoji: string;
}

export function LanguageSwitcher() {
  const lt = useLiterals();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [languages, setLanguages] = useState<Language[]>([
    { code: 'en', name: 'English', flag_emoji: '🇺🇸' },
    { code: 'zh-CN', name: '简体中文', flag_emoji: '🇨🇳' },
    { code: 'zh-HK', name: '繁體中文', flag_emoji: '🇭🇰' }
  ]);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const res = await fetch('/api/system/languages');
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const active = (json?.languages || []).filter((l: any) => l?.is_active !== false);
        if (active.length > 0) {
          const mapped: Language[] = (active as any[]).map((l: any) => {
            const next: Language = {
              code: String(l?.code ?? ''),
              name: String(l?.name ?? ''),
              flag_emoji: String(l?.flag_emoji ?? ''),
            }
            return next.code === 'zh-TW' ? { ...next, code: 'zh-HK', flag_emoji: '🇭🇰' } : next
          });
          const uniq: Language[] = Array.from(new Map(mapped.map((l) => [l.code, l])).values());
          setLanguages(uniq);
        }
      } catch {
        // Keep default languages on failure
      }
    };
    fetchLanguages();
  }, []);

  const handleChange = (nextLocale: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale as 'en' | 'zh-CN' | 'zh-HK' | undefined });
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select defaultValue={locale} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-[140px] h-9 border-none bg-transparent focus:ring-0 hover:bg-gray-100">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <SelectValue placeholder={lt('Language')} />
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
