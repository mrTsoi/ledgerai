import MarketingShell from '@/components/landing/marketing-shell'
import { DashboardPreview } from '@/components/landing/dashboard-preview'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'

export default async function DemoPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Product Demo')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('Explore the dashboard experience and see how LedgerAI brings documents, transactions, and reporting into one workflow.')}
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/signup">
                <Button>{lt('Get Started')}</Button>
              </Link>
              <Link href="/features">
                <Button variant="outline">{lt('See features')}</Button>
              </Link>
            </div>
          </div>

          <div className="mt-10 max-w-6xl">
            <div className="aspect-[16/10] bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
