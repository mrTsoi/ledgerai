import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { FeatureKey } from './features'
import { isFeatureEnabled } from './features'

export async function getUserSubscriptionFeatures(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Record<string, any>> {
  const { rpc } = await import('@/lib/supabase/typed')
  const rpcRes = await rpc('get_user_subscription_details', { p_user_id: userId })

  if (rpcRes.error) {
    throw new Error(rpcRes.error.message || 'Failed to load subscription details')
  }

  const dataArray = Array.isArray(rpcRes.data) ? rpcRes.data : undefined
  const first = dataArray ? (dataArray[0] as { features?: Record<string, any> } | undefined) : undefined
  return first?.features || {}
}

export async function userHasFeature(
  supabase: SupabaseClient<Database>,
  userId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const features = await getUserSubscriptionFeatures(supabase, userId)
  return isFeatureEnabled(features, featureKey)
}
