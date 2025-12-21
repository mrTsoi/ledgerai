"use client"

import { useSearchParams } from 'next/navigation'
import { TenantSettings } from '@/components/settings/tenant-settings'
import { BatchProcessingConfig } from '@/components/settings/batch-processing-config'
import { ExchangeRateList } from '@/components/settings/exchange-rate-list'
import { AISettings } from '@/components/settings/ai-settings'
import { ProfileSettings } from '@/components/settings/profile-settings'
import { BillingSettings } from '@/components/settings/billing-settings'
import { SecuritySettings } from '@/components/settings/security-settings'
import { DomainSettings } from '@/components/settings/domain-settings'
import { BankFeedSettings } from '@/components/settings/bank-feed-settings'
import { ExternalSourcesSettings } from '@/components/settings/external-sources-settings'
import { AutomatedSyncSettings } from '@/components/settings/automated-sync-settings'
import { TenantMismatchPolicyTenantSettings } from '@/components/settings/tenant-mismatch-policy-settings'
import { TaxSettings } from '@/components/settings/tax-settings'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLiterals } from '@/hooks/use-literals'
import { useSubscription } from '@/hooks/use-subscription'

export default function SettingsPage() {
  const lt = useLiterals()
  const searchParams = useSearchParams()
  const { subscription, loading: subLoading } = useSubscription()

  const hasCustomDomain = subscription?.features?.custom_domain === true
  const hasBankFeeds = subscription?.features?.bank_integration === true
  const hasCustomAiProvider = subscription?.features?.custom_ai_provider === true
  const hasTaxAutomation = subscription?.features?.tax_automation === true

  const requestedTab = searchParams.get('tab') || 'profile'
  const allowedPaidTabs = new Set<string>([
    ...(hasCustomDomain ? ['domains'] : []),
    ...(hasBankFeeds ? ['bank-feeds'] : []),
    ...(hasCustomAiProvider ? ['ai'] : []),
    ...(hasTaxAutomation ? ['tax'] : []),
  ])

  const isAllowedTab = (tab: string) => {
    if (tab === 'domains' || tab === 'bank-feeds' || tab === 'ai' || tab === 'tax') return allowedPaidTabs.has(tab)
    return true
  }

  const defaultTab = isAllowedTab(requestedTab) ? requestedTab : 'profile'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{lt('Settings')}</h1>
      </div>
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">{lt('Profile')}</TabsTrigger>
          <TabsTrigger value="security">{lt('Security')}</TabsTrigger>
          <TabsTrigger value="general">{lt('Tenant')}</TabsTrigger>
          {!subLoading && hasCustomDomain && <TabsTrigger value="domains">{lt('Domains')}</TabsTrigger>}
          {!subLoading && hasBankFeeds && <TabsTrigger value="bank-feeds">{lt('Bank Feeds')}</TabsTrigger>}
          <TabsTrigger value="external-sources">{lt('External Sources')}</TabsTrigger>
          <TabsTrigger value="billing">{lt('Billing & Plans')}</TabsTrigger>
          {!subLoading && hasCustomAiProvider && <TabsTrigger value="ai">{lt('AI Integration')}</TabsTrigger>}
          {!subLoading && hasTaxAutomation && <TabsTrigger value="tax">{lt('Tax')}</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="profile" className="space-y-4">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <TenantSettings />
          <BatchProcessingConfig />
          <TenantMismatchPolicyTenantSettings />
          <ExchangeRateList />
        </TabsContent>

        {!subLoading && hasCustomDomain && (
          <TabsContent value="domains" className="space-y-4">
            <DomainSettings />
          </TabsContent>
        )}

        {!subLoading && hasBankFeeds && (
          <TabsContent value="bank-feeds" className="space-y-4">
            <BankFeedSettings />
          </TabsContent>
        )}

        <TabsContent value="external-sources" className="space-y-4">
          <AutomatedSyncSettings />
          <ExternalSourcesSettings />
        </TabsContent>
        
        <TabsContent value="billing" className="space-y-4">
          <BillingSettings />
        </TabsContent>

        {!subLoading && hasCustomAiProvider && (
          <TabsContent value="ai" className="space-y-4">
            <AISettings />
          </TabsContent>
        )}

        {!subLoading && hasTaxAutomation && (
          <TabsContent value="tax" className="space-y-4">
            <TaxSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
