import { createServiceClient } from './service'
import { Database } from '@/types/database.types'
import { SupabaseClient } from '@supabase/supabase-js'

export async function insertPendingSubscription(payload: Database['public']['Tables']['pending_subscriptions']['Insert']) {
  const sb: any = createServiceClient()
  return sb.from('pending_subscriptions').insert(payload)
}

export function createService(): SupabaseClient<Database> {
  return createServiceClient()
}

export async function selectProfileIdByEmail(email: string) {
  const sb: any = createServiceClient()
  return sb.from('profiles').select('id').eq('email', email).limit(1).single()
}

export async function upsertUserSubscription(payload: Database['public']['Tables']['user_subscriptions']['Insert']) {
  const sb: any = createServiceClient()
  return sb.from('user_subscriptions').upsert(payload, { onConflict: 'user_id' })
}

export async function updatePendingSubscriptionById(id: string, payload: Database['public']['Tables']['pending_subscriptions']['Update']) {
  const sb: any = createServiceClient()
  return sb.from('pending_subscriptions').update(payload).eq('id', id)
}

export async function upsertBillingInvoice(payload: Database['public']['Tables']['billing_invoices']['Insert']) {
  const sb: any = createServiceClient()
  return sb.from('billing_invoices').upsert(payload, { onConflict: 'stripe_invoice_id' })
}

export async function findUserSubscriptionByStripeSubscriptionId(subscriptionId?: string) {
  const sb: any = createServiceClient()
  if (!subscriptionId) return { data: null }
  return sb.from('user_subscriptions').select('user_id').eq('stripe_subscription_id', subscriptionId).single()
}

export async function findUserSubscriptionByCustomerId(customerId?: string) {
  const sb: any = createServiceClient()
  if (!customerId) return { data: null }
  return sb.from('user_subscriptions').select('user_id').eq('stripe_customer_id', customerId).single()
}

export async function findDocumentsByTenantAndHash(tenantId: string, hash: string, excludeId?: string) {
  const sb: any = createServiceClient()
  let q = sb.from('documents').select('id').eq('tenant_id', tenantId).eq('content_hash', hash)
  if (excludeId) q = q.neq('id', excludeId)
  return q
}

export async function findTransactionByDocumentId(documentId: string) {
  const sb: any = createServiceClient()
  return sb.from('transactions').select('id').eq('document_id', documentId).maybeSingle()
}

export async function updateDocumentById(documentId: string, payload: Database['public']['Tables']['documents']['Update']) {
  const sb: any = createServiceClient()
  return sb.from('documents').update(payload).eq('id', documentId)
}

export async function insertAIUsageLog(payload: { tenant_id: string | null; ai_provider_id: string; model: string; status: string; tokens_input?: number; tokens_output?: number }) {
  const sb: any = createServiceClient()
  return sb.from('ai_usage_logs').insert(payload)
}

export async function getTenantById(tenantId: string) {
  const sb: any = createServiceClient()
  return sb.from('tenants').select('*').eq('id', tenantId).maybeSingle()
}

export async function findBankAccountByTenantAndAccountNumber(tenantId: string, accountNumber?: string) {
  const sb: any = createServiceClient()
  if (!accountNumber) return { data: null }
  return sb.from('bank_accounts').select('id').eq('tenant_id', tenantId).ilike('account_number', `%${accountNumber}%`).maybeSingle()
}

export async function upsertDocumentData(payload: Database['public']['Tables']['document_data']['Insert']) {
  const sb: any = createServiceClient()
  return sb.from('document_data').upsert(payload, { onConflict: 'document_id' })
}

export async function rpc<R = any, P = any>(fnName: string, params?: P) {
  const sb: any = createServiceClient()
  return sb.rpc(fnName, params)
}
