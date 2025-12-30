import type { Metadata } from "next";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from "@/components/ui/sonner";
import { createClient } from '@/lib/supabase/server'

const DEFAULT_DESCRIPTION = 'Multi-tenant SaaS platform for automated accounting workflows'

export async function generateMetadata({ params }: any): Promise<Metadata> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('system_settings').select('setting_value').eq('setting_key', 'platform_appearance').single()
    const raw = (data as any)?.setting_value
    let platform: any = null
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        platform = parsed?.platform || null
      } catch {
        platform = (raw as any)?.platform || null
      }
    }

    const title = platform?.name ? `${platform.name} - AI-Powered Accounting` : 'LedgerAI - AI-Powered Accounting Platform'
    const icons = platform?.favicon_url ? [{ rel: 'icon', url: platform.favicon_url }] : undefined

    return {
      title,
      description: DEFAULT_DESCRIPTION,
      icons: icons as any,
    }
  } catch (e) {
    return {
      title: 'LedgerAI - AI-Powered Accounting Platform',
      description: DEFAULT_DESCRIPTION,
    }
  }
}

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
