import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle2, BarChart3, Shield, Globe2, Zap } from 'lucide-react'
import { PricingSection } from '@/components/landing/pricing-section'
import { DashboardPreview } from '@/components/landing/dashboard-preview'
import { getLocale, getTranslations } from 'next-intl/server'
import { literalKeyFromText } from '@/lib/i18n/literal-key'

export default async function Home() {
  const locale = await getLocale()
  const t = await getTranslations('literals')

  const applyFallbackVars = (template: string, values?: Record<string, unknown>) => {
    if (!values) return template
    let result = template
    for (const [key, value] of Object.entries(values)) {
      result = result.split(`{${key}}`).join(String(value))
    }
    return result
  }

  const lt = (english: string, values?: Record<string, unknown>) => {
    if (locale === 'en') return applyFallbackVars(english, values)
    const key = literalKeyFromText(english)
    const has = (t as any)?.has

    const hasKey = (k: string) => (typeof has === 'function' ? !!has.call(t, k) : true)
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

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">L</div>
            <span className="text-xl font-bold text-gray-900">LedgerAI</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('Features')}</a>
            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('Pricing')}</a>
            <a href="#about" className="text-sm font-medium text-gray-600 hover:text-gray-900">{lt('About')}</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">{lt('Log in')}</Button>
            </Link>
            <Link href="/signup">
              <Button>{lt('Get Started')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 md:py-32 bg-gradient-to-b from-white to-gray-50">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
				{lt('Accounting Reimagined with')} <span className="text-blue-600">{lt('AI Intelligence')}</span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
				{lt(
					"Automate your financial workflows, gain real-time insights, and manage multiple entities with the world's most advanced multi-tenant accounting platform."
				)}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="h-12 px-8 text-lg">
					{lt('Start Free Trial')} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="outline" className="h-12 px-8 text-lg">
					{lt('View Demo')}
                </Button>
              </Link>
            </div>
            <div className="mt-16 relative mx-auto max-w-6xl">
              <div className="aspect-[16/10] bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
				<h2 className="text-3xl font-bold text-gray-900 mb-4">{lt('Everything you need to scale')}</h2>
				<p className="text-lg text-gray-600">{lt('Powerful features built for modern businesses and accounting firms.')}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard 
                icon={<Zap className="w-6 h-6 text-yellow-500" />}
				title={lt('AI Automation')}
				description={lt('Automatically categorize transactions and reconcile accounts with 99% accuracy using our advanced AI models.')}
              />
              <FeatureCard 
                icon={<Globe2 className="w-6 h-6 text-blue-500" />}
				title={lt('Multi-Currency')}
				description={lt('Handle transactions in any currency with real-time exchange rates and automatic gain/loss calculation.')}
              />
              <FeatureCard 
                icon={<Shield className="w-6 h-6 text-green-500" />}
				title={lt('Enterprise Security')}
				description={lt('Bank-grade encryption, role-based access control, and comprehensive audit logs keep your data safe.')}
              />
              <FeatureCard 
                icon={<BarChart3 className="w-6 h-6 text-purple-500" />}
				title={lt('Real-time Reporting')}
				description={lt('Generate balance sheets, P&L, and cash flow statements instantly. Export to PDF, Excel, or CSV.')}
              />
              <FeatureCard 
                icon={<CheckCircle2 className="w-6 h-6 text-indigo-500" />}
				title={lt('Multi-Tenant Support')}
				description={lt('Manage multiple companies or clients from a single dashboard with strict data isolation.')}
              />
              <FeatureCard 
                icon={<Globe2 className="w-6 h-6 text-teal-500" />}
				title={lt('Global Compliance')}
				description={lt('Built-in support for international accounting standards and tax regulations across multiple regions.')}
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />

        {/* CTA Section */}
        <section className="py-20 bg-blue-600 text-white">
          <div className="container mx-auto px-4 text-center">
				<h2 className="text-3xl md:text-4xl font-bold mb-6">{lt('Ready to transform your accounting?')}</h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
				{lt('Join thousands of businesses that trust LedgerAI for their financial management.')}
            </p>
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-lg text-blue-600">
					{lt('Get Started Now')}
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">L</div>
                <span className="text-lg font-bold text-white">LedgerAI</span>
              </div>
              <p className="text-sm">
				{lt('The next generation of accounting software powered by artificial intelligence.')}
              </p>
            </div>
            <div>
				<h3 className="text-white font-semibold mb-4">{lt('Product')}</h3>
              <ul className="space-y-2 text-sm">
					<li><a href="#" className="hover:text-white">{lt('Features')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Pricing')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Security')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Roadmap')}</a></li>
              </ul>
            </div>
            <div>
				<h3 className="text-white font-semibold mb-4">{lt('Company')}</h3>
              <ul className="space-y-2 text-sm">
					<li><a href="#" className="hover:text-white">{lt('About Us')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Careers')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Blog')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Contact')}</a></li>
              </ul>
            </div>
            <div>
				<h3 className="text-white font-semibold mb-4">{lt('Legal')}</h3>
              <ul className="space-y-2 text-sm">
					<li><a href="#" className="hover:text-white">{lt('Privacy Policy')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Terms of Service')}</a></li>
					<li><a href="#" className="hover:text-white">{lt('Cookie Policy')}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
			{lt('© {year} LedgerAI Inc. All rights reserved.', { year: new Date().getFullYear() })}
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-xl border bg-white hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}
