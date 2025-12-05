import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, BarChart3, Shield, Globe2, Zap } from 'lucide-react';
import { PricingSection } from '@/components/landing/pricing-section';
import { DashboardPreview } from '@/components/landing/dashboard-preview';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">L</div>
            <span className="text-xl font-bold text-gray-900">LedgerAI</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#about" className="text-sm font-medium text-gray-600 hover:text-gray-900">About</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link to="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 md:py-32 bg-gradient-to-b from-white to-gray-50">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
              Accounting Reimagined with <span className="text-blue-600">AI Intelligence</span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Automate your financial workflows, gain real-time insights, and manage multiple entities with the world's most advanced multi-tenant accounting platform.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup">
                <Button size="lg" className="h-12 px-8 text-lg">
                  Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="lg" variant="outline" className="h-12 px-8 text-lg">
                  View Demo
                </Button>
              </Link>
            </div>
            <div className="mt-16 relative mx-auto max-w-6xl">
              <div className="aspect-[16/10] bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to scale</h2>
              <p className="text-lg text-gray-600">Powerful features built for modern businesses and accounting firms.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard 
                icon={<Zap className="w-6 h-6 text-yellow-500" />}
                title="AI Automation"
                description="Automatically categorize transactions and reconcile accounts with 99% accuracy using our advanced AI models."
              />
              <FeatureCard 
                icon={<Globe2 className="w-6 h-6 text-blue-500" />}
                title="Multi-Currency"
                description="Handle transactions in any currency with real-time exchange rates and automatic gain/loss calculation."
              />
              <FeatureCard 
                icon={<Shield className="w-6 h-6 text-green-500" />}
                title="Enterprise Security"
                description="Bank-grade encryption, role-based access control, and comprehensive audit logs keep your data safe."
              />
              <FeatureCard 
                icon={<BarChart3 className="w-6 h-6 text-purple-500" />}
                title="Real-time Reporting"
                description="Generate balance sheets, P&L, and cash flow statements instantly. Export to PDF, Excel, or CSV."
              />
              <FeatureCard 
                icon={<CheckCircle2 className="w-6 h-6 text-indigo-500" />}
                title="Multi-Tenant Support"
                description="Manage multiple companies or clients from a single dashboard with strict data isolation."
              />
              <FeatureCard 
                icon={<Globe2 className="w-6 h-6 text-teal-500" />}
                title="Global Compliance"
                description="Built-in support for international accounting standards and tax regulations across multiple regions."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />

        {/* CTA Section */}
        <section className="py-20 bg-blue-600 text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to transform your accounting?</h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join thousands of businesses that trust LedgerAI for their financial management.
            </p>
            <Link to="/signup">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-lg text-blue-600">
                Get Started Now
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">L</div>
                <span className="text-lg font-bold text-white">LedgerAI</span>
              </div>
              <p className="text-sm">
                The next generation of accounting software powered by artificial intelligence.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
                <li><a href="#" className="hover:text-white">Roadmap</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">About Us</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            © {new Date().getFullYear()} LedgerAI Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-xl border bg-white hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 bg-gray-50 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
