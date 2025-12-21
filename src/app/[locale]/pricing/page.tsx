import MarketingShell from '@/components/landing/marketing-shell'
import { PricingSection } from '@/components/landing/pricing-section'
import { getLt } from '@/lib/i18n/lt-server'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { HeroBackground } from '@/components/landing/hero-background'
import { getPublicPlatformAppearance } from '@/lib/platform-appearance/public'

export default async function PricingPage() {
  const lt = await getLt()
  const appearance = await getPublicPlatformAppearance()
  const landing = appearance?.landing_page

  return (
    <MarketingShell>
      <section className="relative py-16 overflow-hidden">
        <HeroBackground
          className="absolute inset-0"
          media={landing?.hero_media}
          rotationSeconds={landing?.hero_rotation_seconds}
          overlayOpacity={landing?.hero_overlay_opacity}
        />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 motion-safe:animate-in motion-safe:fade-in">{lt('Pricing')}</h1>
            <p className="mt-4 text-lg text-gray-600 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
              {lt('Choose a plan that matches your workflow. Every plan is multi-tenant and secured with row-level isolation.')}
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/signup">
                <Button>{lt('Start Free Trial')}</Button>
              </Link>
              <Link href="/features">
                <Button variant="outline">{lt('Browse features')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PricingSection />
    </MarketingShell>
  )
}
