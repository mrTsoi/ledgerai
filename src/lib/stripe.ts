import Stripe from 'stripe'
import { createServiceClient } from './supabase/service'

export async function getStripeConfig() {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'stripe_config')
    .single()

  if (error || !data) {
    throw new Error('Stripe configuration not found')
  }

  const settingValue = (data as unknown as { setting_value: unknown }).setting_value

  return settingValue as unknown as {
    mode: 'test' | 'live'
    publishable_key: string
    secret_key: string
    webhook_secret: string
  }
}

export async function getStripe() {
  const config = await getStripeConfig()

  if (!config.secret_key) {
    throw new Error('Stripe secret key not configured')
  }

  return new Stripe(config.secret_key, {
    apiVersion: '2025-11-17.clover',
    typescript: true,
  })
}
