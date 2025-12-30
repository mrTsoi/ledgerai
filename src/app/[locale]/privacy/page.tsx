import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

export default async function PrivacyPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const name = (appearance as any)?.platform?.name || 'LedgerAI'

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Privacy Policy')}</h1>
            <p className="mt-3 text-sm text-gray-500">{lt('Effective date: December 21, 2025')}</p>

            <div className="mt-6 rounded-xl border bg-white p-5">
              <div className="text-sm font-semibold text-gray-900">{lt('Important')}</div>
              <p className="mt-2 text-sm text-gray-600">
                {lt('This Privacy Policy is a general template provided for convenience. It may not reflect your legal obligations. You should review and adapt it for your organization, jurisdiction, and data practices.')}
              </p>
            </div>

            <div className="mt-10 space-y-10">
              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('1. Who we are')}</h2>
                <p className="text-gray-600">
                  {lt('LedgerAI (“we”, “us”, “our”) is operated by SophieSoft Company Limited and provides a multi-tenant accounting platform that helps users manage financial workflows, documents, and reporting.').replace(/LedgerAI/g, name)}
                </p>
                <p className="text-gray-600">
                  {lt('In many deployments, LedgerAI is operated by an organization (for example, an accounting firm or a company) that invites users and configures tenants. That organization may act as the data controller for your account and tenant data.').replace(/LedgerAI/g, name)}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('2. Information we collect')}</h2>
                <p className="text-gray-600">{lt('Depending on how the platform is configured, we may collect:')}</p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('Account information (name, email address, authentication identifiers).')}</li>
                  <li>{lt('Tenant/workspace information (company name, locale, settings).')}</li>
                  <li>{lt('Accounting data you enter or import (transactions, accounts, reports).')}</li>
                  <li>{lt('Uploaded files and metadata (invoices, receipts, statements).')}</li>
                  <li>{lt('Usage and device data (log events, IP address, browser/device identifiers).')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('3. How we use information')}</h2>
                <p className="text-gray-600">{lt('We use information to:')}</p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('Provide, operate, and maintain the platform and its features.')}</li>
                  <li>{lt('Authenticate users and enforce access controls (including tenant isolation).')}</li>
                  <li>{lt('Process documents and data to deliver requested functionality (e.g., extraction, categorization, reports).')}</li>
                  <li>{lt('Monitor performance, debug issues, and improve reliability and security.')}</li>
                  <li>{lt('Communicate with you about service updates and support.')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('4. AI and automated processing')}</h2>
                <p className="text-gray-600">
                  {lt('If enabled, the platform may use automated processing to extract or classify data from uploaded documents. Outputs are intended to assist workflows and may require human review. Administrators may configure AI providers and models.')}
                </p>
                <p className="text-gray-600">
                  {lt('Where AI features are enabled, data sent to third-party AI providers depends on configuration. Your administrator controls which providers are used and what data is submitted for processing.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('5. How we share information')}</h2>
                <p className="text-gray-600">{lt('We may share information:')}</p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('With service providers that support platform functionality (hosting, storage, email delivery, analytics) as configured.')}</li>
                  <li>{lt('Within your tenant/workspace, according to user roles and permissions.')}</li>
                  <li>{lt('To comply with applicable law, lawful requests, or to protect rights and safety.')}</li>
                  <li>{lt('In connection with a corporate transaction (e.g., merger, acquisition), subject to appropriate safeguards.')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('6. Data retention')}</h2>
                <p className="text-gray-600">
                  {lt('We retain information for as long as needed to provide the service, meet contractual obligations, and comply with legal requirements. Retention periods may be configured by your administrator depending on tenant and compliance needs.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('7. Security')}</h2>
                <p className="text-gray-600">
                  {lt('We use administrative, technical, and organizational safeguards designed to protect information. However, no system can be guaranteed 100% secure.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('8. Your choices and rights')}</h2>
                <p className="text-gray-600">
                  {lt('Depending on your location and role (end-user vs. tenant admin), you may have rights to access, correct, export, or delete your information. Some requests may need to be handled by your organization’s administrator if they are the controller.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('9. International transfers')}</h2>
                <p className="text-gray-600">
                  {lt('Your information may be processed in locations different from where you live, depending on your deployment and service providers. Where required, appropriate safeguards should be used.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('10. Changes to this policy')}</h2>
                <p className="text-gray-600">
                  {lt('We may update this Privacy Policy from time to time. If changes are material, we will provide reasonable notice through the platform or other channels.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('11. Contact')}</h2>
                <p className="text-gray-600">
                  {lt('If you have questions about privacy, contact us at support@sophiesofts.com or use the Contact page to reach the configured support or sales channels.')}
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
