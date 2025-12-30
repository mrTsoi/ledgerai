import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { FEATURE_DEFINITIONS, featureKeyToSlug } from '@/lib/subscription/features'
import { getActiveSubscriptionPlans } from '@/lib/subscription/public-pricing'
import { HeroBackground } from '@/components/landing/hero-background'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

const FEATURE_SUMMARIES: Record<string, string> = {
  ai_access: 'Automate extraction and categorization to reduce manual accounting work.',
  ai_agent: 'Ask questions and take actions via voice or chat inside your workspace.',
  custom_ai_provider: 'Bring your own AI provider keys, endpoints, and models.',
  bank_integration: 'Connect bank feeds and streamline reconciliation workflows.',
  tax_automation: 'Estimate tax/VAT, apply rules, and keep auditable calculations.',
  custom_domain: 'Use your own domain for a branded, tenant-safe experience.',
  sso: 'Enterprise-ready access controls and single sign-on options.',
  concurrent_batch_processing: 'Process documents and jobs faster with parallel workers.',
  custom_features: 'Need something specific? Unlock custom feature flags and add-ons.',
}

export default async function FeaturesPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const name = (appearance as any)?.platform?.name || 'LedgerAI'
  const landing = appearance?.landing_page
  const plans = await getActiveSubscriptionPlans()

  return (
    <MarketingShell>
      <section className="relative py-16 overflow-hidden">
        <HeroBackground
          className="absolute inset-0"
          media={landing?.hero_media}
          rotationSeconds={landing?.hero_rotation_seconds}
          overlayOpacity={landing?.hero_overlay_opacity}
        />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 motion-safe:animate-in motion-safe:fade-in">{lt('Features')}</h1>
            <p className="mt-4 text-lg text-gray-600 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
              {lt('LedgerAI combines multi-tenant accounting workflows with subscription-based advanced automation. Explore what each capability does and where it lives in the product.').replace(/LedgerAI/g, name)}
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/pricing">
                <Button>{lt('Compare plans')}</Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline">{lt('Start Free Trial')}</Button>
              </Link>
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900">{lt('Advanced subscription features')}</h2>
            <p className="mt-2 text-gray-600">{lt('These are plan-gated capabilities designed for teams that need more power and control.')}</p>

            <div className="mt-8 grid md:grid-cols-3 gap-6">
              {FEATURE_DEFINITIONS.map((f) => (
                (() => {
                  const includedCount = plans.filter((p) => (p.features as any)?.[f.key] === true).length
                  const includedText =
                    includedCount === 0
                      ? lt('Not enabled in active plans')
                      : includedCount === 1
                        ? lt('Included in 1 active plan')
                        : lt('Included in {count} active plans', { count: includedCount })

                  return (
                <Link
                  key={f.key}
                  href={`/features/${featureKeyToSlug(f.key)}`}
                  className="block"
                >
                  <div className="p-6 rounded-xl border bg-white hover:shadow-lg transition-shadow h-full">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-semibold text-gray-900">{lt(f.label)}</h3>
                      {f.isNew ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                          {lt('New')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-gray-600">{lt(FEATURE_SUMMARIES[f.key] || 'Learn more about this capability.')}</p>
                    <div className="mt-3 text-xs text-gray-500">{includedText}</div>
                  </div>
                </Link>
                  )
                })()
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
