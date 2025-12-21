'use client'

import { BankFeedIntegration } from '@/components/banking/bank-feed-integration'
import { useSubscription } from '@/hooks/use-subscription'

export function BankFeedSettings() {
  const { subscription, loading } = useSubscription()
  const hasFeature = subscription?.features?.bank_integration === true
  if (loading || !hasFeature) return null
  return <BankFeedIntegration />
}
