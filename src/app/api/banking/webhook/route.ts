import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashTenantWebhookKey, timingSafeEqualHex } from '@/lib/bank-feed-keys'

export const runtime = 'nodejs'

type IncomingTransaction = {
  external_id: string
  date: string
  description?: string
  amount: number
  transaction_type?: 'DEBIT' | 'CREDIT'
  reference_number?: string
  metadata?: Record<string, unknown>
  raw?: Record<string, unknown>
}

type WebhookPayload = {
  tenant_id: string
  bank_account_id: string
  provider: string
  transactions: IncomingTransaction[]
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WebhookPayload

    if (!payload?.tenant_id || !payload?.bank_account_id || !payload?.provider) {
      return NextResponse.json(
        { error: 'Missing tenant_id, bank_account_id, or provider' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Auth: allow either a platform-wide secret OR a per-tenant API key.
    const globalSecret = process.env.BANK_FEED_WEBHOOK_SECRET
    const providedGlobal = request.headers.get('x-ledgerai-webhook-secret')
    const providedTenantKey = request.headers.get('x-ledgerai-tenant-api-key')

    const globalOk = !!globalSecret && !!providedGlobal && providedGlobal === globalSecret
    let tenantKeyOk = false

    if (!globalOk && providedTenantKey) {
      let hashed: string
      try {
        hashed = hashTenantWebhookKey(providedTenantKey)
      } catch {
        return NextResponse.json(
          { error: 'Server is missing BANK_FEED_KEY_PEPPER' },
          { status: 500 }
        )
      }

      const { data: keyRows, error: keyError } = await (supabase
        .from('bank_feed_api_keys') as any)
        .select('id')
        .eq('tenant_id', payload.tenant_id)
        .is('revoked_at', null)

      if (keyError) {
        return NextResponse.json({ error: keyError.message }, { status: 500 })
      }

      const ids = (keyRows || []).map((r: any) => r.id)
      if (ids.length > 0) {
        const { data: secretRows, error: secretError } = await (supabase
          .from('bank_feed_api_key_secrets') as any)
          .select('api_key_id, key_hash')
          .in('api_key_id', ids)

        if (secretError) {
          return NextResponse.json({ error: secretError.message }, { status: 500 })
        }

        tenantKeyOk = (secretRows || []).some((s: any) => timingSafeEqualHex(s.key_hash, hashed))

        if (tenantKeyOk) {
          const apiKeyId = (secretRows || []).find((s: any) => timingSafeEqualHex(s.key_hash, hashed))?.api_key_id
          if (apiKeyId) {
            await (supabase.from('bank_feed_api_keys') as any)
              .update({ last_used_at: new Date().toISOString() })
              .eq('id', apiKeyId)
          }
        }
      }
    }

    if (!globalOk && !tenantKeyOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const txs = Array.isArray(payload.transactions) ? payload.transactions : []
    if (txs.length === 0) {
      return NextResponse.json({ inserted: 0 })
    }

    const rows = txs
      .filter((t) => !!t.external_id && !!t.date && typeof t.amount === 'number')
      .map((t) => {
        const derivedType: 'DEBIT' | 'CREDIT' =
          t.transaction_type ?? (t.amount < 0 ? 'DEBIT' : 'CREDIT')

        return {
          tenant_id: payload.tenant_id,
          bank_account_id: payload.bank_account_id,
          bank_statement_id: null,
          transaction_date: t.date,
          description: t.description ?? null,
          amount: Math.abs(t.amount),
          transaction_type: derivedType,
          reference_number: t.reference_number ?? null,
          status: 'PENDING',
          source: 'FEED',
          provider: payload.provider,
          external_transaction_id: t.external_id,
          metadata: t.metadata ?? {},
          external_raw: t.raw ?? {}
        }
      })

    const { data, error } = await (supabase
      .from('bank_transactions') as any)
      .upsert(rows, {
        onConflict: 'tenant_id,provider,external_transaction_id',
        ignoreDuplicates: true
      })
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ inserted: (data as any[])?.length ?? 0 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    )
  }
}
