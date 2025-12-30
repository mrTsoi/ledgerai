import MarketingShell from '@/components/landing/marketing-shell'
import { getLt } from '@/lib/i18n/lt-server'
import { ContactUs } from '@/components/landing/contact-us'

export default async function ContactPage() {
  const lt = await getLt()

  return (
    <MarketingShell>
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{lt('Contact')}</h1>
            <p className="mt-4 text-lg text-gray-600">
              {lt('Send a sales enquiry using the contact methods configured by the platform admin.')}
            </p>
            <div className="mt-10">
              <ContactUs />
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
