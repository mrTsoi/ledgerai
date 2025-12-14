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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get('tab') || 'profile'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="general">Tenant</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="bank-feeds">Bank Feeds</TabsTrigger>
          <TabsTrigger value="external-sources">External Sources</TabsTrigger>
          <TabsTrigger value="billing">Billing & Plans</TabsTrigger>
          <TabsTrigger value="ai">AI Integration</TabsTrigger>
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
          <ExchangeRateList />
        </TabsContent>

        <TabsContent value="domains" className="space-y-4">
          <DomainSettings />
        </TabsContent>

        <TabsContent value="bank-feeds" className="space-y-4">
          <BankFeedSettings />
        </TabsContent>

        <TabsContent value="external-sources" className="space-y-4">
          <AutomatedSyncSettings />
          <ExternalSourcesSettings />
        </TabsContent>
        
        <TabsContent value="billing" className="space-y-4">
          <BillingSettings />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AISettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
