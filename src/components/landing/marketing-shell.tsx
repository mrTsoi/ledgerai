import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { getLt } from '@/lib/i18n/lt-server'
import { getPlatformAppearance } from '@/lib/platform'

export default async function MarketingShell({
  children,
}: {
  children: React.ReactNode
}) {
  const lt = await getLt()
  const platform = await getPlatformAppearance()

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              {platform?.logo_url ? (
                <Image src={platform.logo_url} alt={platform?.name || 'Logo'} className="w-8 h-8 object-contain rounded-lg" width={32} height={32} />
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">{(platform?.name && platform.name[0]) ? String(platform.name[0]).toUpperCase() : 'L'}</div>
            )}
            <span className="text-xl font-bold text-gray-900">{platform?.name || 'LedgerAI'}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('Features')}</Link>
            <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('Pricing')}</Link>
            <Link href="/security" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('Security')}</Link>
          </nav>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost">{lt('Log in')}</Button>
            </Link>
            <Link href="/signup">
              <Button>{lt('Get Started')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
                <div className="flex items-center gap-2 mb-4">
                {platform?.logo_url ? (
                  <Image src={platform.logo_url} alt={platform?.name || 'Logo'} className="w-6 h-6 object-contain rounded" width={24} height={24} />
                ) : (
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">{(platform?.name && platform.name[0]) ? String(platform.name[0]).toUpperCase() : 'L'}</div>
                )}
                <span className="text-lg font-bold text-white">{platform?.name || 'LedgerAI'}</span>
              </div>
              <p className="text-sm">{lt('The next generation of accounting software powered by artificial intelligence.')}</p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">{lt('Product')}</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/features" className="hover:text-white">{lt('Features')}</Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-white">{lt('Pricing')}</Link>
                </li>
                <li>
                  <Link href="/security" className="hover:text-white">{lt('Security')}</Link>
                </li>
                <li>
                  <Link href="/roadmap" className="hover:text-white">{lt('Roadmap')}</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">{lt('Company')}</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/about" className="hover:text-white">{lt('About Us')}</Link>
                </li>
                <li>
                  <Link href="/careers" className="hover:text-white">{lt('Careers')}</Link>
                </li>
                <li>
                  <Link href="/blog" className="hover:text-white">{lt('Blog')}</Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white">{lt('Contact')}</Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">{lt('Legal')}</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="hover:text-white">{lt('Privacy Policy')}</Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white">{lt('Terms of Service')}</Link>
                </li>
                <li>
                  <Link href="/cookies" className="hover:text-white">{lt('Cookie Policy')}</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            {lt('© {year} SophieSoft Company Limited. All rights reserved.', { year: new Date().getFullYear() })}
          </div>
        </div>
      </footer>
    </div>
  )
}
