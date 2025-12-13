// @ts-nocheck
// Supabase Edge Function: bank-feed-sync
// Syncs Plaid transactions for all active connections.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

type ConnectionRow = {
  id: string
  tenant_id: string
  provider: string
  provider_cursor: string | null
}

type SecretRow = {
  access_token: string
}

type AccountMapRow = {
  provider_account_id: string
  bank_account_id: string | null
}

function plaidBaseUrl() {
  const env = (Deno.env.get('PLAID_ENV') || 'sandbox').toLowerCase()
  if (env === 'production') return 'https://production.plaid.com'
  if (env === 'development') return 'https://development.plaid.com'
  return 'https://sandbox.plaid.com'
}

async function plaidPost(path: string, body: Record<string, unknown>) {
  const clientId = Deno.env.get('PLAID_CLIENT_ID')
  const secret = Deno.env.get('PLAID_SECRET')

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID/PLAID_SECRET are not set')
  }

  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': clientId,
      'PLAID-SECRET': secret,
      'Plaid-Version': '2020-09-14',
    },
    body: JSON.stringify({ ...body, client_id: clientId, secret }),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.error_message || json?.display_message || json?.error_code || res.statusText
    throw new Error(`Plaid error: ${msg}`)
  }

  return json
}

function toTxType(amount: number): 'DEBIT' | 'CREDIT' {
  return amount < 0 ? 'CREDIT' : 'DEBIT'
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceKey) {
    return json(
      { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
      { status: 503 }
    )
  }

  const supabase = createClient(url, serviceKey)

  // Optional shared secret for cron invocations
  const expected = Deno.env.get('BANK_FEED_CRON_SECRET')
  if (expected) {
    const provided = req.headers.get('x-ledgerai-cron-secret')
    if (!provided || provided !== expected) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const { data: connections, error: connError } = await supabase
    .from('bank_feed_connections')
    .select('id, tenant_id, provider, provider_cursor')
    .eq('provider', 'PLAID')
    .eq('status', 'ACTIVE')

  if (connError) {
    return json({ error: connError.message }, { status: 500 })
  }

  const conns = (connections || []) as unknown as ConnectionRow[]

  let synced = 0
  let inserted = 0
  const errors: Array<{ connection_id: string; error: string }> = []

  for (const conn of conns) {
    try {
      const { data: secret, error: secretError } = await supabase
        .from('bank_feed_connection_secrets')
        .select('access_token')
        .eq('connection_id', conn.id)
        .single()

      if (secretError) throw secretError

      const accessToken = (secret as unknown as SecretRow).access_token

      const { data: mapRows, error: mapError } = await supabase
        .from('bank_feed_accounts')
        .select('provider_account_id, bank_account_id')
        .eq('connection_id', conn.id)

      if (mapError) throw mapError

      const map = new Map<string, string>()
      for (const r of (mapRows || []) as unknown as AccountMapRow[]) {
        if (r.provider_account_id && r.bank_account_id) {
          map.set(r.provider_account_id, r.bank_account_id)
        }
      }

      let cursor: string | null = conn.provider_cursor
      let hasMore = true
      let nextCursor: string | null = cursor

      while (hasMore) {
        const syncRes = await plaidPost('/transactions/sync', {
          access_token: accessToken,
          cursor: cursor || undefined,
          count: 500,
        })

        const added = (syncRes?.added || []) as any[]

        const rows = added
          .filter((t) => !!t?.transaction_id && !!t?.date)
          .map((t) => {
            const amount = typeof t.amount === 'number' ? t.amount : 0
            const bankAccountId = t.account_id ? map.get(t.account_id) : undefined

            return {
              tenant_id: conn.tenant_id,
              bank_account_id: bankAccountId || null,
              bank_statement_id: null,
              transaction_date: t.authorized_date || t.date,
              description: t.merchant_name || t.name || null,
              amount: Math.abs(amount),
              transaction_type: toTxType(amount),
              reference_number: null,
              status: 'PENDING',
              source: 'FEED',
              provider: 'PLAID',
              external_transaction_id: t.transaction_id,
              metadata: {
                plaid: {
                  category: t.category || null,
                  pending: t.pending || false,
                },
              } as Json,
              external_raw: t as Json,
            }
          })

        if (rows.length > 0) {
          const { data: insertedCount, error: rpcError } = await (supabase as any).rpc(
            'insert_bank_feed_transactions',
            { p_rows: rows }
          )

          if (rpcError) throw rpcError
          inserted += Number(insertedCount || 0)
        }

        nextCursor = syncRes?.next_cursor || null
        hasMore = !!syncRes?.has_more
        cursor = nextCursor
      }

      await supabase
        .from('bank_feed_connections')
        .update({
          provider_cursor: nextCursor,
          last_synced_at: new Date().toISOString(),
          status: 'ACTIVE',
          error_message: null,
        })
        .eq('id', conn.id)

      synced += 1
    } catch (e: any) {
      errors.push({ connection_id: conn.id, error: e?.message || 'Sync failed' })
      await supabase
        .from('bank_feed_connections')
        .update({
          status: 'ERROR',
          error_message: e?.message || 'Sync failed',
        })
        .eq('id', conn.id)
    }
  }

  return json({ synced, inserted, errors })
})
