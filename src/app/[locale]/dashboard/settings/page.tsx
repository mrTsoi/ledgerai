"use client"

import { useSearchParams } from 'next/navigation'
import { TenantSettings } from '@/components/settings/tenant-settings'
import { ExchangeRateList } from '@/components/settings/exchange-rate-list'
import { AISettings } from '@/components/settings/ai-settings'
import { ProfileSettings } from '@/components/settings/profile-settings'
import { BillingSettings } from '@/components/settings/billing-settings'
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
          <TabsTrigger value="general">Tenant</TabsTrigger>
          <TabsTrigger value="billing">Billing & Plans</TabsTrigger>
          <TabsTrigger value="ai">AI Integration</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile" className="space-y-4">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <TenantSettings />
          <ExchangeRateList />
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
