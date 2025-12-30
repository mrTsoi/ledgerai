import { notFound } from 'next/navigation'

import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { FeatureKey, featureSlugToKey, getFeatureLabel } from '@/lib/subscription/features'
import { getActiveSubscriptionPlans } from '@/lib/subscription/public-pricing'

type FeatureContent = {
  overview: string
  where: string[]
  bestFor: string[]
  notes?: string[]
}

const FEATURE_CONTENT: Record<FeatureKey, FeatureContent> = {
  ai_access: {
    overview:
      'Use AI to accelerate document intake and transaction categorization while keeping human review and auditability.',
    where: ['Dashboard → Documents', 'Dashboard → Transactions', 'Settings → AI'],
    bestFor: ['High-volume bookkeeping teams', 'Faster month-end close', 'Consistent categorization standards'],
    notes: ['Availability depends on your subscription plan and tenant settings.'],
  },
  ai_agent: {
    overview:
      'Interact with LedgerAI using chat or voice to navigate, ask questions, and trigger supported actions from within the app.',
    where: ['Dashboard (AI Agent widget)', 'Settings → AI'],
    bestFor: ['Hands-free workflows', 'Team Q&A about financials', 'Guided automation'],
    notes: ['Some actions may require additional permissions depending on role.'],
  },
  custom_ai_provider: {
    overview:
      'Bring your own AI provider by configuring keys, endpoints, and model choices to match your security and cost requirements.',
    where: ['Admin → AI Provider Management', 'Settings → AI'],
    bestFor: ['Enterprise procurement requirements', 'Model governance', 'Regional compliance needs'],
    notes: ['Requires platform-level configuration and secure key management.'],
  },
  bank_integration: {
    overview:
      'Connect bank feeds to streamline reconciliation, reduce manual uploads, and keep transactions up-to-date.',
    where: ['Dashboard → Banking', 'Settings → External Sources / Integrations'],
    bestFor: ['Daily reconciliation', 'Multi-account operations', 'Reducing CSV imports'],
  },
  tax_automation: {
    overview:
      'Automate VAT/GST and tax estimation using configurable rules so documents and transactions carry consistent tax treatment.',
    where: ['Dashboard → Settings → Tax', 'Documents → Review/Verification'],
    bestFor: ['Multi-region operations', 'Reducing tax errors', 'Audit-ready calculations'],
    notes: ['Tax automation supports configuration and estimation; validate against your local requirements.'],
  },
  custom_domain: {
    overview:
      'Use a custom domain for a branded experience while keeping tenant routing and isolation intact.',
    where: ['Dashboard → Settings → Domain'],
    bestFor: ['Accounting firms', 'White-label deployments', 'Enterprise rollouts'],
    notes: ['DNS + certificate setup is required.'],
  },
  sso: {
    overview:
      'Enable enterprise access patterns with single sign-on options and stricter authentication controls.',
    where: ['Dashboard → Settings → Security', 'Admin → Platform Settings'],
    bestFor: ['IT-managed teams', 'Centralized identity governance', 'Compliance-driven organizations'],
  },
  concurrent_batch_processing: {
    overview:
      'Speed up heavy workloads by processing multiple jobs in parallel (e.g., bulk document imports or automated sync runs).',
    where: ['Settings → Batch Processing', 'Admin → Processing Settings'],
    bestFor: ['High document volumes', 'Faster turnaround times', 'Background automation'],
    notes: ['Concurrency limits vary by plan and infrastructure configuration.'],
  },
  custom_features: {
    overview:
      'Unlock tailored add-ons and feature flags for specialized workflows or integrations that your team needs.',
    where: ['Admin → Subscription Management', 'Admin → System Settings'],
    bestFor: ['Custom integrations', 'Pilot rollouts', 'Bespoke accounting workflows'],
    notes: ['Work with sales/support to scope and enable custom functionality.'],
  },
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const featureKey = featureSlugToKey(slug)
  if (!featureKey) notFound()

  const lt = await getLt()
  const appearance = await (await import('@/lib/platform-appearance/public')).getPublicPlatformAppearance()
  const name = (appearance as any)?.platform?.name || 'LedgerAI'
  const content = FEATURE_CONTENT[featureKey]

  const plans = await getActiveSubscriptionPlans()
  const includedPlans = plans.filter((p) => (p.features as any)?.[featureKey] === true)
  const includedPlanNames = includedPlans.map((p) => lt(String(p.name ?? ''))).filter((v) => String(v).trim())

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <div className="text-sm text-gray-500">{lt('Feature')}</div>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-900">{lt(getFeatureLabel(featureKey))}</h1>
            <p className="mt-4 text-lg text-gray-600">{lt(content.overview).replace(/LedgerAI/g, name)}</p>

            <div className="mt-6 flex gap-3">
              <Link href="/pricing">
                <Button>{lt('Compare plans')}</Button>
              </Link>
              <Link href="/features">
                <Button variant="outline">{lt('Back to features')}</Button>
              </Link>
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Where you’ll find it')}</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {content.where.map((item) => (
                  <li key={item}>{lt(item)}</li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Best for')}</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {content.bestFor.map((item) => (
                  <li key={item}>{lt(item)}</li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Included in')}</h2>
              {includedPlanNames.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">{lt('This feature is not currently enabled in any active plan.')}</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  {includedPlanNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-gray-900">{lt('Notes')}</h3>
                <ul className="mt-2 space-y-2 text-sm text-gray-600">
                  {(content.notes || [lt('Availability depends on your subscription plan.')]).map((item) => (
                    <li key={item}>{lt(item)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
