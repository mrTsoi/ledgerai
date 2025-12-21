import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database.types'

export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']

export async function getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const supabase = await createClient()

  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  if (error) {
    console.error('Failed to load subscription_plans:', error)
    return []
  }

  return (plans || []) as SubscriptionPlan[]
}
