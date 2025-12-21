import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'

export default async function CareersPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Careers')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('Career listings are not configured yet for this deployment.')}
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
