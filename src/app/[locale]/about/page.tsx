import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

export default async function AboutPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const platformName = appearance?.chatbot || (appearance as any)?.platform?.name || null
  const name = platformName || 'LedgerAI'

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('About')} {name}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('LedgerAI is a multi-tenant accounting platform designed to automate bookkeeping workflows while preserving control, auditability, and tenant isolation.').replace(/LedgerAI/g, name)}
            </p>
            <div className="mt-10 grid gap-6">
              <div className="p-6 rounded-xl border bg-white">
                <h2 className="text-lg font-semibold text-gray-900">{lt('Our focus')}</h2>
                <p className="mt-2 text-gray-600">
                  {lt('Build reliable accounting foundations first, then layer AI responsibly: configurable, reviewable, and secured.')}
                </p>
              </div>
              <div className="p-6 rounded-xl border bg-white">
                <h2 className="text-lg font-semibold text-gray-900">{lt('Multi-tenant by design')}</h2>
                <p className="mt-2 text-gray-600">
                  {lt('Tenants are isolated using row-level security policies so teams can manage multiple entities safely from a single workspace.')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
