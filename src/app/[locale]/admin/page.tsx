import { Metadata } from 'next'
import { SystemOverview } from '@/components/admin/system-overview'
import { TenantManagement } from '@/components/admin/tenant-management'
import { UserManagement } from '@/components/admin/user-management'
import { SubscriptionManagement } from '@/components/admin/subscription-management'
import { AuditLogViewer } from '@/components/admin/audit-log-viewer'
import { LanguageManagement } from '@/components/admin/language-management'
import { TranslationManagement } from '@/components/admin/translation-management'
import { AIProviderManagement } from '@/components/admin/ai-provider-management'
import { PlatformCustomizer } from '@/components/admin/platform-customizer'
import { ProcessingSettings } from '@/components/admin/processing-settings'
import { SecuritySettings } from '@/components/admin/security-settings'
import { PendingSubscriptionsAdmin } from '@/components/admin/pending-subscriptions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Platform Admin - LedgerAI',
  description: 'Super admin dashboard for platform management'
}

export default function AdminPage() {
  const t = useTranslations('admin')

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
          <p className="text-gray-600">{t('description')}</p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="tenants">{t('tabs.tenants')}</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="pending">Pending Subscriptions</TabsTrigger>
          <TabsTrigger value="audit">{t('tabs.audit')}</TabsTrigger>
          <TabsTrigger value="languages">{t('tabs.languages')}</TabsTrigger>
          <TabsTrigger value="translations">Translations</TabsTrigger>
          <TabsTrigger value="ai-providers">AI Providers</TabsTrigger>
          <TabsTrigger value="processing">{t('tabs.processing')}</TabsTrigger>
          <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
          <TabsTrigger value="customization">Customization</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SystemOverview />
        </TabsContent>

        <TabsContent value="tenants">
          <TenantManagement />
        </TabsContent>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionManagement />
        </TabsContent>
        <TabsContent value="pending">
          <PendingSubscriptionsAdmin />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer />
        </TabsContent>

        <TabsContent value="languages">
          <LanguageManagement />
        </TabsContent>

        <TabsContent value="translations">
          <TranslationManagement />
        </TabsContent>

        <TabsContent value="ai-providers">
          <AIProviderManagement />
        </TabsContent>

        <TabsContent value="processing">
          <ProcessingSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="customization">
          <PlatformCustomizer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
