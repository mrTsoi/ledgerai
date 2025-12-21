import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'

export default async function RoadmapPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Roadmap')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('We prioritize security, reliability, and tenant-safe automation. This page summarizes upcoming focus areas.')}
            </p>
          </div>

          <div className="mt-12 grid gap-6 max-w-3xl">
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Platform admin')}</h2>
              <p className="mt-2 text-gray-600">{lt('Continue expanding cross-tenant administration, analytics, and policy controls.')}</p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('AI provider governance')}</h2>
              <p className="mt-2 text-gray-600">{lt('Add more controls for models, prompts, rate limits, and audit trails for AI-driven workflows.')}</p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Production hardening')}</h2>
              <p className="mt-2 text-gray-600">{lt('Security review, monitoring, backups, and performance optimizations for large tenants.')}</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
