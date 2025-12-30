import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function insertPendingSubscription(payload: any) {
  const svc = createService()
  return (svc as any).from('pending_subscriptions').insert(payload)
}

export function createService(): SupabaseClient<any> {
  return createServiceClient() as unknown as SupabaseClient<any>
}

export async function selectProfileIdByEmail(email: string) {
  const svc = createService()
  return svc.from('profiles').select('id').eq('email', email).limit(1).single()
}

export async function upsertUserSubscription(payload: any) {
  const svc = createService()
  return (svc as any).from('user_subscriptions').upsert(payload, { onConflict: 'user_id' })
}

export async function updatePendingSubscriptionById(id: string, payload: any) {
  const svc = createService()
  return (svc as any).from('pending_subscriptions').update(payload).eq('id', id)
}

export async function upsertBillingInvoice(payload: any) {
  const svc = createService()
  return (svc as any).from('billing_invoices').upsert(payload, { onConflict: 'stripe_invoice_id' })
}

export async function findUserSubscriptionByStripeSubscriptionId(subscriptionId?: string) {
  if (!subscriptionId) return { data: null }
  const svc = createService()
  return svc.from('user_subscriptions').select('user_id').eq('stripe_subscription_id', subscriptionId).single()
}

export async function findUserSubscriptionByCustomerId(customerId?: string) {
  if (!customerId) return { data: null }
  const svc = createService()
  return svc.from('user_subscriptions').select('user_id').eq('stripe_customer_id', customerId).single()
}

export async function findDocumentsByTenantAndHash(tenantId: string, hash: string, excludeId?: string) {
  const svc = createService()
  let q = svc.from('documents').select('id').eq('tenant_id', tenantId).eq('content_hash', hash)
  if (excludeId) q = q.neq('id', excludeId)
  return q
}

export async function findTransactionByDocumentId(documentId: string) {
  const svc = createService()
  return svc.from('transactions').select('id').eq('document_id', documentId).maybeSingle()
}

export async function updateDocumentById(documentId: string, payload: any) {
  const svc = createService()
  return (svc as any).from('documents').update(payload).eq('id', documentId)
}

export async function insertAIUsageLog(payload: any) {
  const svc = createService()
  return (svc as any).from('ai_usage_logs').insert(payload)
}

export async function getTenantById(tenantId: string) {
  const svc = createService()
  return svc.from('tenants').select('*').eq('id', tenantId).maybeSingle()
}

export async function findBankAccountByTenantAndAccountNumber(tenantId: string, accountNumber?: string) {
  if (!accountNumber) return { data: null }
  const svc = createService()
  return svc.from('bank_accounts').select('id').eq('tenant_id', tenantId).ilike('account_number', `%${accountNumber}%`).maybeSingle()
}

export async function upsertDocumentData(payload: any) {
  const svc = createService()
  return (svc as any).from('document_data').upsert(payload, { onConflict: 'document_id' })
}

export async function rpc<R = any, P = any>(fnName: string, params?: P) {
  const svc = createService()
  // Use `any` for RPC call params/results until Database.Functions typings are complete
  return (svc as any).rpc(fnName, params)
}
