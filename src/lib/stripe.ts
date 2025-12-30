import Stripe from 'stripe'
import { createServiceClient } from './supabase/service'
import { canEncryptAtRest, decryptSecret, encryptSecret } from './secret-crypto'

function normalizeEnvStyleAssignment(value: string, keyName: string): string {
  const trimmed = value.trim()
  const prefix = `${keyName}=`
  if (trimmed.toUpperCase().startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim()
  }
  return trimmed
}

function normalizeStripeSecretKey(value: string): string {
  let v = value.trim()
  v = normalizeEnvStyleAssignment(v, 'STRIPE_SECRET_KEY')
  // Handle accidental "Bearer sk_..." paste
  if (v.toLowerCase().startsWith('bearer ')) v = v.slice(7).trim()
  return v
}

function normalizeStripeWebhookSecret(value: string): string {
  let v = value.trim()
  v = normalizeEnvStyleAssignment(v, 'STRIPE_WEBHOOK_SECRET')
  return v
}

function looksLikeStripeSecretKey(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('sk_test_') || value.startsWith('sk_live_'))
}

function looksLikeStripeWebhookSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('whsec_')
}

export async function getStripeConfig() {
  // Allow overriding Stripe config from environment for tests/local runs
  const envConfig = process.env.STRIPE_CONFIG_JSON || process.env.STRIPE_CONFIG
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig)
      return parsed as {
        mode: 'test' | 'live'
        publishable_key: string
        secret_key: string
        webhook_secret: string
      }
    } catch (e) {
      // fall through to env vars below or DB
    }
  }

  // Prefer DB-stored platform admin settings.
  // This prevents a stale/mistyped STRIPE_SECRET_KEY in .env.local from overriding runtime configuration.
  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'stripe_config')
      .maybeSingle()

    if (!error && data) {
      const raw = (data as unknown as { setting_value: unknown }).setting_value
      const cfg = typeof raw === 'string' ? (() => {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      })() : (raw && typeof raw === 'object' ? raw : null)

      if (cfg) {
        const next = { ...(cfg as any) }

        // Prefer encrypted secrets (decrypt using DB_ENCRYPTION_KEY).
        if (typeof next.secret_key_encrypted === 'string' && next.secret_key_encrypted.trim()) {
          if (!canEncryptAtRest()) throw new Error('Stripe secret is encrypted but DB_ENCRYPTION_KEY is not set')
          next.secret_key = decryptSecret(next.secret_key_encrypted)
        }
        if (typeof next.webhook_secret_encrypted === 'string' && next.webhook_secret_encrypted.trim()) {
          if (!canEncryptAtRest()) throw new Error('Stripe webhook secret is encrypted but DB_ENCRYPTION_KEY is not set')
          next.webhook_secret = decryptSecret(next.webhook_secret_encrypted)
        }

        if (typeof next.secret_key === 'string') next.secret_key = normalizeStripeSecretKey(next.secret_key)
        if (typeof next.webhook_secret === 'string') next.webhook_secret = normalizeStripeWebhookSecret(next.webhook_secret)

        // Opportunistic migration: if plaintext exists and encryption is available, store encrypted + clear plaintext.
        if (canEncryptAtRest()) {
          const updates: any = {}
          if (typeof next.secret_key === 'string' && looksLikeStripeSecretKey(next.secret_key) && !next.secret_key_encrypted) {
            updates.secret_key_encrypted = encryptSecret(next.secret_key)
            updates.secret_key = null
          }
          if (typeof next.webhook_secret === 'string' && looksLikeStripeWebhookSecret(next.webhook_secret) && !next.webhook_secret_encrypted) {
            updates.webhook_secret_encrypted = encryptSecret(next.webhook_secret)
            updates.webhook_secret = null
          }
          if (Object.keys(updates).length > 0) {
            try {
              await supabase
                .from('system_settings')
                .update({ setting_value: { ...cfg, ...updates } })
                .eq('setting_key', 'stripe_config')
            } catch {
              // Non-fatal
            }
          }
        }

        if (looksLikeStripeSecretKey(next.secret_key)) {
          return {
            mode: (next.mode as 'test' | 'live') || 'test',
            publishable_key: typeof next.publishable_key === 'string' ? next.publishable_key : '',
            secret_key: next.secret_key,
            webhook_secret: typeof next.webhook_secret === 'string' ? next.webhook_secret : '',
          }
        }
      }
    }
  } catch {
    // ignore and fall back to env
  }

  // Fallback to individual env vars (local/dev). NOTE: these are used only when DB config is missing/unusable.
  if (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_WEBHOOK_SECRET) {
    const secret_key = normalizeStripeSecretKey(process.env.STRIPE_SECRET_KEY || '')
    const webhook_secret = normalizeStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET || '')

    // Fail fast with a clearer error if the value is clearly wrong.
    if (secret_key && !looksLikeStripeSecretKey(secret_key)) {
      throw new Error('Stripe secret key is invalid (expected sk_test_... or sk_live_...)')
    }
    if (webhook_secret && !looksLikeStripeWebhookSecret(webhook_secret)) {
      throw new Error('Stripe webhook secret is invalid (expected whsec_...)')
    }

    return {
      mode: (process.env.STRIPE_MODE as 'test' | 'live') || 'test',
      publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secret_key,
      webhook_secret,
    }
  }

  throw new Error('Stripe configuration not found')
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

// Helper: retrieve subscription (supports stripe-mock via STRIPE_USE_MOCK + STRIPE_API_BASE_URL)
export async function retrieveSubscription(subscriptionId: string) {
  const config = await getStripeConfig()
  if (process.env.STRIPE_USE_MOCK === 'true' && process.env.STRIPE_API_BASE_URL) {
    const base = process.env.STRIPE_API_BASE_URL.replace(/\/$/, '')
    const url = `${base}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.secret_key}` } })
    if (!res.ok) throw new Error('Failed to retrieve subscription from mock: ' + await res.text())
    return res.json()
  }

  const stripe = await getStripe()
  return stripe.subscriptions.retrieve(String(subscriptionId))
}

// Helper: retrieve invoice (supports stripe-mock via STRIPE_USE_MOCK + STRIPE_API_BASE_URL)
export async function retrieveInvoice(invoiceId: string) {
  const config = await getStripeConfig()
  if (process.env.STRIPE_USE_MOCK === 'true' && process.env.STRIPE_API_BASE_URL) {
    const base = process.env.STRIPE_API_BASE_URL.replace(/\/$/, '')
    const url = `${base}/v1/invoices/${encodeURIComponent(invoiceId)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.secret_key}` } })
    if (!res.ok) throw new Error('Failed to retrieve invoice from mock: ' + await res.text())
    return res.json()
  }

  const stripe = await getStripe()
  return stripe.invoices.retrieve(String(invoiceId))
}
