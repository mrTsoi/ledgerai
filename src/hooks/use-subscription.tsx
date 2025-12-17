'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'

export type SubscriptionDetails = {
  plan_name: string
  plan_id?: string
  max_tenants: number
  current_tenants: number
  max_documents: number
  current_documents: number
  max_storage_bytes: number
  current_storage_bytes: number
  price_monthly: number
  status: string
  current_period_start: string
  current_period_end: string
  next_plan_name?: string
  next_plan_start_date?: string
  next_billing_interval?: 'month' | 'year' | null
  features?: {
    ai_agent?: boolean
    bank_integration?: boolean
    tax_automation?: boolean
    [key: string]: any
  }
}

type SubscriptionContextType = {
  subscription: SubscriptionDetails | null
  loading: boolean
  refreshSubscription: () => Promise<SubscriptionDetails | null>
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription/me')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubscription(null)
        return null
      }

      const next = (json?.subscription as SubscriptionDetails) || null
      setSubscription(next)
      return next
    } catch (error) {
      console.error('Error fetching subscription:', error)
      setSubscription(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, refreshSubscription: fetchSubscription }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return context
}
