'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'

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
  const didEnsureFreeRef = useRef(false)

  const fetchSubscription = useCallback(async () => {
    setLoading(true)

    const fetchMe = async () => {
      const res = await fetch('/api/subscription/me', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false as const, subscription: null as SubscriptionDetails | null }
      return { ok: true as const, subscription: (json?.subscription as SubscriptionDetails) || null }
    }

    try {
      const first = await fetchMe()
      if (first.ok && first.subscription) {
        setSubscription(first.subscription)
        return first.subscription
      }

      // New users may not have a row in user_subscriptions yet.
      // Best-effort: auto-assign Free plan once, then refetch.
      if (!didEnsureFreeRef.current) {
        didEnsureFreeRef.current = true
        try {
          await fetch('/api/subscription/ensure-free', { method: 'POST' })
        } catch {
          // Non-fatal: fall through and keep subscription as null.
        }

        const second = await fetchMe()
        if (second.ok && second.subscription) {
          setSubscription(second.subscription)
          return second.subscription
        }
      }

      setSubscription(null)
      return null
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
