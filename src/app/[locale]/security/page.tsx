import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'

export default async function SecurityPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Security')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('LedgerAI is built around tenant isolation, role-based access, and auditable changes so teams can operate confidently across multiple entities.')}
            </p>

            <div className="mt-6 flex gap-3">
              <Link href="/features/sso">
                <Button>{lt('Learn about SSO')}</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline">{lt('Compare plans')}</Button>
              </Link>
            </div>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Tenant isolation')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Row-level security ensures tenant data is isolated even when multiple entities are managed in the same workspace.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Access control')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Role-based permissions help teams delegate tasks while maintaining least-privilege access.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Audit logs')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Critical actions can be tracked and reviewed with metadata and change context to support compliance workflows.')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
