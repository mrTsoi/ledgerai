import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SecuritySettings } from '@/components/settings/security-settings';
import { TenantSettings } from '@/components/settings/tenant-settings';
import { DomainSettings } from '@/components/settings/domain-settings';
import { BankFeedSettings } from '@/components/settings/bank-feed-settings';
import { ExternalSourcesSettings } from '@/components/settings/external-sources-settings';
import { AISettings } from '@/components/settings/ai-settings';
import { TaxSettings } from '@/components/settings/tax-settings';
import { BatchProcessingConfig } from '@/components/settings/batch-processing-config';
import { TenantMismatchPolicyTenantSettings } from '@/components/settings/tenant-mismatch-policy-settings';
import { ExchangeRateList } from '@/components/settings/exchange-rate-list';
import { useLiterals } from '@/hooks/use-literals';
import { useSubscription } from '@/hooks/use-subscription';
import { TenantManagement } from '@/components/admin/tenant-management';
import TenantAdminDashboard from '@/app/tenant-admin/tenant-admin-client';
import { useTenant } from '@/hooks/use-tenant';
export function TenantAdminSettingsTabs({ tab, onTabChange }: { tab: string, onTabChange: (v: string) => void }) {
  const lt = useLiterals();
  const { subscription, loading } = useSubscription();
  const { isSuperAdmin } = useTenant();

  // Feature flags from subscription
  const features = subscription?.features || {};

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="tenant-admin">{lt('Tenant Admin')}</TabsTrigger>
        <TabsTrigger value="security">{lt('Security')}</TabsTrigger>
        {features.custom_domain && <TabsTrigger value="domains">{lt('Domains')}</TabsTrigger>}
        {features.bank_integration && <TabsTrigger value="bank-feeds">{lt('Bank Feeds')}</TabsTrigger>}
        <TabsTrigger value="external-sources">{lt('External Sources')}</TabsTrigger>
        {features.custom_ai_provider && <TabsTrigger value="ai">{lt('AI Integration')}</TabsTrigger>}
        {features.tax_automation && <TabsTrigger value="tax">{lt('Tax')}</TabsTrigger>}
        {features.concurrent_batch_processing && <TabsTrigger value="batch-processing">{lt('Batch Processing')}</TabsTrigger>}
        <TabsTrigger value="tenant-mismatch-policy">{lt('Tenant Mismatch Policy')}</TabsTrigger>
        <TabsTrigger value="exchange-rates">{lt('Exchange Rates')}</TabsTrigger>
      </TabsList>
      <TabsContent value="tenant-admin">
        {isSuperAdmin ? <TenantManagement /> : <TenantAdminDashboard />}
      </TabsContent>
      <TabsContent value="security"><SecuritySettings /></TabsContent>
      {features.custom_domain && <TabsContent value="domains"><DomainSettings /></TabsContent>}
      {features.bank_integration && <TabsContent value="bank-feeds"><BankFeedSettings /></TabsContent>}
      <TabsContent value="external-sources"><ExternalSourcesSettings /></TabsContent>
      {features.custom_ai_provider && <TabsContent value="ai"><AISettings /></TabsContent>}
      {features.tax_automation && <TabsContent value="tax"><TaxSettings /></TabsContent>}
      {features.concurrent_batch_processing && <TabsContent value="batch-processing"><BatchProcessingConfig /></TabsContent>}
      <TabsContent value="tenant-mismatch-policy"><TenantMismatchPolicyTenantSettings /></TabsContent>
      <TabsContent value="exchange-rates"><ExchangeRateList /></TabsContent>
    </Tabs>
  );
}
