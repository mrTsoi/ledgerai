"use client"

import React from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { TenantSettings } from '@/components/settings/tenant-settings'
import TenantManagement from '@/components/settings/tenant-management'
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
import { useUserRole } from '@/hooks/use-tenant'

export default function SettingsPage() {
  const lt = useLiterals()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
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
  const [tab, setTab] = React.useState<string>(defaultTab)

  // keep local tab state in sync with URL params
  React.useEffect(() => {
    const sp = searchParams.get('tab') || 'profile'
    const wanted = isAllowedTab(sp) ? sp : 'profile'
    if (wanted !== tab) setTab(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleTabChange = (v: string) => {
    if (!isAllowedTab(v)) return
    setTab(v)
    try {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      params.set('tab', v)
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`)
    } catch (e) {
      // fallback: simple replace
      router.replace(`${pathname}?tab=${encodeURIComponent(v)}`)
    }
  }
  const userRole = useUserRole()
  const canSeeTenantAdmin = ['COMPANY_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(userRole || '')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{lt('Settings')}</h1>
      </div>
      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">{lt('Profile')}</TabsTrigger>
          <TabsTrigger value="billing">{lt('Billing & Plans')}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-4">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="billing" className="space-y-4">
          <BillingSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
