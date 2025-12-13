'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'

export type SubscriptionDetails = {
  plan_name: string
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
  refreshSubscription: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined)

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchSubscription = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await (supabase.rpc as any)('get_user_subscription_details', {
        p_user_id: user.id
      })

      if (error) throw error
      if (data && data.length > 0) {
        console.log('Subscription Data:', data[0])
        setSubscription(data[0])
      } else {
        setSubscription(null)
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
      setSubscription(null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

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
