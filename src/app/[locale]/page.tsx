import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight, BarChart3, CheckCircle2, FileText, Shield, Users, Zap } from 'lucide-react'
import { PricingSection } from '@/components/landing/pricing-section'
import { DashboardPreview } from '@/components/landing/dashboard-preview'
import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { FEATURE_DEFINITIONS, featureKeyToSlug } from '@/lib/subscription/features'
import { HeroBackground } from '@/components/landing/hero-background'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

function renderTitleWithHighlight(title: string, highlight?: string) {
  const h = (highlight || '').trim()
  if (!h) return title
  const idx = title.toLowerCase().indexOf(h.toLowerCase())
  if (idx < 0) return title
  const before = title.slice(0, idx)
  const mid = title.slice(idx, idx + h.length)
  const after = title.slice(idx + h.length)
  return (
    <>
      {before}
      <span className="text-blue-600">{mid}</span>
      {after}
    </>
  )
}

export default async function Home() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const landing = appearance?.landing_page
  const name = (appearance as any)?.platform?.name || 'LedgerAI'

  return (
    <MarketingShell>
        {/* Hero Section */}
        <section className="relative py-20 md:py-32 overflow-hidden">
          <HeroBackground
            className="absolute inset-0"
            media={landing?.hero_media}
            rotationSeconds={landing?.hero_rotation_seconds}
            overlayOpacity={landing?.hero_overlay_opacity}
          />
          <div className="container mx-auto px-4 text-center relative">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/70 backdrop-blur px-4 py-2 text-xs font-semibold text-gray-700 motion-safe:animate-in motion-safe:fade-in">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
                {lt(landing?.hero_badge || 'AI-powered multi-tenant accounting')}
            </div>

            <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
      				{renderTitleWithHighlight(
                 lt(landing?.hero_title || 'Accounting Reimagined with AI Intelligence'),
                 landing?.hero_title_highlight
                )}
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:[animation-delay:120ms]">
      				{lt(
                 landing?.hero_subtitle ||
                  "Automate your financial workflows, gain real-time insights, and manage multiple entities with the world's most advanced multi-tenant accounting platform."
                )}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:[animation-delay:200ms]">
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
              <div className="aspect-[16/10] bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:[animation-delay:260ms]">
                <DashboardPreview />
              </div>
              <div className="pointer-events-none absolute -inset-1 rounded-xl bg-gradient-to-r from-blue-600/10 via-transparent to-blue-600/10" />
            </div>
          </div>
        </section>

        {/* Core Platform Features */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
				<h2 className="text-3xl font-bold text-gray-900 mb-4">{lt('Everything you need to scale')}</h2>
				<p className="text-lg text-gray-600">{lt('Powerful features built for modern businesses and accounting firms.')}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard 
                icon={<Zap className="w-6 h-6 text-yellow-500" />}
				title={lt('AI Automation')}
				description={lt('Extract invoices and receipts, propose categorization, and keep an auditable trail of decisions.')}
              />
              <FeatureCard 
                icon={<Users className="w-6 h-6 text-blue-500" />}
				title={lt('Multi-Tenant Operations')}
				description={lt('Manage multiple companies or clients from a single workspace with strict data isolation.')}
              />
              <FeatureCard 
                icon={<Shield className="w-6 h-6 text-green-500" />}
				title={lt('Security & Auditability')}
				description={lt('Role-based access control, row-level security, and comprehensive audit logs keep your data safe.')}
              />
              <FeatureCard 
                icon={<BarChart3 className="w-6 h-6 text-purple-500" />}
				title={lt('Real-time Reporting')}
				description={lt('Generate balance sheets, P&L, and cash flow statements instantly with export-friendly outputs.')}
              />
              <FeatureCard 
                icon={<FileText className="w-6 h-6 text-indigo-500" />}
				title={lt('Accounting Workflows')}
				description={lt('Charts of accounts, transactions, documents, approvals, and review-ready trails in one place.')}
              />
              <FeatureCard 
                icon={<CheckCircle2 className="w-6 h-6 text-teal-500" />}
				title={lt('Team Collaboration')}
				description={lt('Invite teammates, assign roles, and standardize processes across clients and entities.')}
              />
            </div>

            <div className="mt-10 text-center">
              <Link href="/features">
                <Button variant="outline">{lt('Explore all features')}</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Advanced (Subscription) Features */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{lt('Advanced features for paid subscriptions')}</h2>
              <p className="text-lg text-gray-600">{lt('See what each plan unlocks and how it works inside LedgerAI.').replace(/LedgerAI/g, name)}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {FEATURE_DEFINITIONS.map((f) => (
                <FeatureLinkCard
                  key={f.key}
                  title={lt(f.label)}
                  href={`/features/${featureKeyToSlug(f.key)}`}
                  badge={f.isNew ? lt('New') : undefined}
                  description={lt('Learn how this feature works, where to configure it, and which plans include it.')}
                />
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link href="/pricing">
                <Button>{lt('Compare plans')}</Button>
              </Link>
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
              {lt('Join thousands of businesses that trust LedgerAI for their financial management.').replace(/LedgerAI/g, name)}
            </p>
            <Link href="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-lg text-blue-600">
					{lt('Get Started Now')}
              </Button>
            </Link>
          </div>
        </section>
    </MarketingShell>
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

function FeatureLinkCard({
  title,
  description,
  href,
  badge,
}: {
  title: string
  description: string
  href: string
  badge?: string
}) {
  return (
    <Link href={href} className="block">
      <div className="p-6 rounded-xl border bg-white hover:shadow-lg transition-shadow h-full">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {badge ? (
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-gray-600">{description}</p>
      </div>
    </Link>
  )
}

