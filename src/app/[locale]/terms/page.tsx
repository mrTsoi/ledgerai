import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

export default async function TermsPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const name = (appearance as any)?.platform?.name || 'LedgerAI'

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Terms of Service')}</h1>
            <p className="mt-3 text-sm text-gray-500">{lt('Effective date: December 21, 2025')}</p>

            <div className="mt-6 rounded-xl border bg-white p-5">
              <div className="text-sm font-semibold text-gray-900">{lt('Important')}</div>
              <p className="mt-2 text-sm text-gray-600">
                {lt('These Terms are a general template. They may not reflect your legal obligations or business model. Review and adapt them with qualified counsel before relying on them.')}
              </p>
            </div>

            <div className="mt-10 space-y-10">
              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('1. Agreement to terms')}</h2>
                <p className="text-gray-600">
                  {lt('By accessing or using LedgerAI (the “Service”), you agree to these Terms of Service (the “Terms”). The Service is operated by SophieSoft Company Limited. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.').replace(/LedgerAI/g, name)}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('2. Who can use the service')}</h2>
                <p className="text-gray-600">
                  {lt('You must comply with applicable laws and any additional rules set by your organization’s administrator. You are responsible for ensuring your account information remains accurate.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('3. Accounts, roles, and tenant access')}</h2>
                <p className="text-gray-600">
                  {lt('Access to tenants and features is controlled by roles, permissions, and subscription plans. Your administrator may provision, suspend, or remove accounts within their tenant(s).')}
                </p>
                <p className="text-gray-600">{lt('You are responsible for all activity that occurs under your account credentials.')}</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('4. Subscriptions, billing, and payments')}</h2>
                <p className="text-gray-600">
                  {lt('Some features require a paid subscription. Pricing, plan limits, and included features are described in the pricing page and may be updated from time to time.')}
                </p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('Trials: trial availability and duration may vary by plan or promotion.')}</li>
                  <li>{lt('Renewals: paid subscriptions may renew automatically unless cancelled, depending on configuration.')}</li>
                  <li>{lt('Taxes: you are responsible for any applicable taxes unless stated otherwise.')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('5. Acceptable use')}</h2>
                <p className="text-gray-600">{lt('You agree not to:')}</p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('Reverse engineer, decompile, or attempt to discover source code except where permitted by law.')}</li>
                  <li>{lt('Use the Service to transmit malware or to interfere with the integrity or performance of the Service.')}</li>
                  <li>{lt('Access the Service in a way intended to avoid plan limits or bypass security controls.')}</li>
                  <li>{lt('Use the Service in violation of law or third-party rights.')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('6. Customer data and content')}</h2>
                <p className="text-gray-600">
                  {lt('You (or your organization) retain ownership of data you upload or generate in the Service (“Customer Data”). You grant us the rights necessary to host, process, and display Customer Data solely to provide and improve the Service.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('7. AI features')}</h2>
                <p className="text-gray-600">
                  {lt('If enabled, AI features may produce outputs based on provided inputs. Outputs may be inaccurate and should be reviewed by qualified personnel. You are responsible for decisions made using the Service.')}
                </p>
                <p className="text-gray-600">
                  {lt('Your administrator may configure third-party AI providers. Use of those providers may be subject to separate terms.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('8. Confidentiality')}</h2>
                <p className="text-gray-600">
                  {lt('The Service may contain confidential information (including non-public product features). You agree to protect confidential information and use it only as needed to use the Service.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('9. Termination')}</h2>
                <p className="text-gray-600">
                  {lt('We may suspend or terminate access if you violate these Terms, if your subscription lapses, or if required to protect the Service or other users. Your administrator may also terminate your access to their tenant(s).')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('10. Disclaimers')}</h2>
                <p className="text-gray-600">
                  {lt('The Service is provided “as is” and “as available.” We do not warrant that the Service will be uninterrupted, error-free, or that outputs (including AI outputs) will be accurate or complete.')}
                </p>
                <p className="text-gray-600">{lt('The Service does not provide legal, tax, or accounting advice.')}</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('11. Limitation of liability')}</h2>
                <p className="text-gray-600">
                  {lt('To the maximum extent permitted by law, we will not be liable for indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill.')}
                </p>
                <p className="text-gray-600">
                  {lt('To the maximum extent permitted by law, our total liability for any claim related to the Service will not exceed the amounts paid for the Service by you (or your organization) during the twelve (12) months immediately preceding the event giving rise to the claim (or such other cap as required by applicable law).')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('12. Governing law and venue')}</h2>
                <p className="text-gray-600">
                  {lt('These Terms are governed by the laws of the Hong Kong Special Administrative Region, without regard to conflict of laws principles. You agree to submit to the exclusive jurisdiction of the courts of Hong Kong SAR for disputes arising out of or relating to these Terms or the Service, except where applicable law requires otherwise.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('13. Changes to terms')}</h2>
                <p className="text-gray-600">
                  {lt('We may update these Terms from time to time. If changes are material, we will provide reasonable notice. Continued use of the Service after the effective date means you accept the updated Terms.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('14. Contact')}</h2>
                <p className="text-gray-600">
                  {lt('For questions about these Terms, contact support@sophiesofts.com or use the Contact page to reach the configured support or sales channels.')}
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
