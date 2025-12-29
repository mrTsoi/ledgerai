import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

export default async function SecurityPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const name = (appearance as any)?.platform?.name || 'LedgerAI'

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Security')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('LedgerAI is built around tenant isolation, role-based access, and auditable changes so teams can operate confidently across multiple entities.').replace(/LedgerAI/g, name)}
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
              <h2 className="text-lg font-semibold text-gray-900">{lt('Access control & SSO')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Role-based permissions, SAML/OIDC SSO, and MFA help teams delegate tasks while preserving least-privilege access and strong identity controls.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Audit logs & Monitoring')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Comprehensive audit trails, alerting, and centralized log retention support investigations, compliance, and long-term forensics.')}
              </p>
            </div>

            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Encryption')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Encryption in transit and at rest with managed key rotation protects sensitive financial and personal data across storage and backups.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Secrets & Key Management')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Secure secrets storage, environment isolation, and automated key rotation reduce the risk of leaked credentials and improve operational security.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('CI/CD & Scans')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Automated CI/CD pipelines include static analysis, dependency vulnerability scanning, container image checks, and pre-deploy gates.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Pentests & Vulnerability Management')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('Regular third-party penetration tests, bug bounty programs, and a tracked remediation process ensure emerging risks are addressed promptly.')}
              </p>
            </div>
            <div className="p-6 rounded-xl border bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{lt('Network & Platform Protection')}</h2>
              <p className="mt-2 text-gray-600">
                {lt('WAF, DDoS protection, rate limiting, secure headers, and CSP reduce exposure to web and network attacks.')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
