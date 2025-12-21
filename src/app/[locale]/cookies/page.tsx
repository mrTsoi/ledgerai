import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'

export default async function CookiesPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Cookie Policy')}</h1>
            <p className="mt-3 text-sm text-gray-500">{lt('Effective date: December 21, 2025')}</p>

            <div className="mt-6 rounded-xl border bg-white p-5">
              <div className="text-sm font-semibold text-gray-900">{lt('Important')}</div>
              <p className="mt-2 text-sm text-gray-600">
                {lt('This Cookie Policy is a general template. Your actual cookie usage depends on your deployment, analytics settings, and authentication configuration. Review and adapt as needed.')}
              </p>
            </div>

            <div className="mt-10 space-y-10">
              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('1. What cookies are')}</h2>
                <p className="text-gray-600">
                  {lt('Cookies are small text files stored on your device when you visit a website. Similar technologies include local storage and pixels. They help websites function, remember preferences, and provide analytics.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('2. How we use cookies')}</h2>
                <p className="text-gray-600">{lt('We may use cookies and similar technologies to:')}</p>
                <ul className="list-disc pl-5 text-gray-600 space-y-2">
                  <li>{lt('Enable core functionality such as login, session management, and security protections.')}</li>
                  <li>{lt('Remember preferences such as language and UI settings.')}</li>
                  <li>{lt('Measure usage and performance to improve reliability (if analytics is enabled).')}</li>
                  <li>{lt('Prevent fraud and abuse and protect user accounts.')}</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('3. Types of cookies')}</h2>
                <div className="space-y-4">
                  <div className="rounded-xl border p-5">
                    <div className="font-semibold text-gray-900">{lt('Strictly necessary cookies')}</div>
                    <p className="mt-2 text-gray-600">
                      {lt('These cookies are required for the Service to function (e.g., authentication, security, load balancing). Disabling them may prevent the Service from working properly.')}
                    </p>
                  </div>
                  <div className="rounded-xl border p-5">
                    <div className="font-semibold text-gray-900">{lt('Preference cookies')}</div>
                    <p className="mt-2 text-gray-600">
                      {lt('These cookies remember choices such as language or region so the Service can provide a more consistent experience.')}
                    </p>
                  </div>
                  <div className="rounded-xl border p-5">
                    <div className="font-semibold text-gray-900">{lt('Analytics cookies (optional)')}</div>
                    <p className="mt-2 text-gray-600">
                      {lt('If enabled by your administrator, analytics cookies help us understand usage patterns and improve performance. Deployments may vary in whether analytics is enabled and which provider is used.')}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('4. Third-party cookies')}</h2>
                <p className="text-gray-600">
                  {lt('Some deployments may use third-party services (such as payment providers or analytics) that set their own cookies. Their cookies are governed by their privacy/cookie policies.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('5. Your choices')}</h2>
                <p className="text-gray-600">
                  {lt('You can control cookies through your browser settings (block, delete, or limit cookies). If you disable cookies, some features may not work as intended.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('6. Updates to this policy')}</h2>
                <p className="text-gray-600">
                  {lt('We may update this Cookie Policy from time to time. If changes are material, we will provide reasonable notice through the platform or other channels.')}
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-semibold text-gray-900">{lt('7. Contact')}</h2>
                <p className="text-gray-600">
                  {lt('If you have questions about cookies, contact support@sophiesofts.com or use the Contact page to reach the configured support or sales channels.')}
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
