import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { FeatureKey } from './features'
import { isFeatureEnabled } from './features'

export async function getUserSubscriptionFeatures(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Record<string, any>> {
  const { data, error } = await (supabase.rpc as any)('get_user_subscription_details', {
    p_user_id: userId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to load subscription details')
  }

  const first = (data as any[])?.[0]
  return (first?.features as Record<string, any>) || {}
}

export async function userHasFeature(
  supabase: SupabaseClient<Database>,
  userId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const features = await getUserSubscriptionFeatures(supabase, userId)
  return isFeatureEnabled(features, featureKey)
}
