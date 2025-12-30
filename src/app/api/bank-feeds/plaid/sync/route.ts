import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlaidClient } from '@/lib/plaid'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

type Body = {
  tenant_id: string
  connection_id?: string
}

function toTxType(amount: number): 'DEBIT' | 'CREDIT' {
  // Plaid amounts are typically positive for outflow/spend.
  return amount < 0 ? 'CREDIT' : 'DEBIT'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'bank_integration')
    if (!ok) {
      return NextResponse.json({ error: 'Bank feeds are not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  let tenantId: string
  let connectionId: string | undefined

  try {
    const body = (await req.json()) as Body
    tenantId = body?.tenant_id
    connectionId = body?.connection_id
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const { data: membership, error: membershipError } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load connections via service role so we can join secrets
  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }

  const connQuery = (service.from('bank_feed_connections') as any)
    .select('id, tenant_id, provider, provider_item_id, provider_cursor')
    .eq('tenant_id', tenantId)
    .eq('provider', 'PLAID')

  const { data: connections, error: connError } = connectionId
    ? await connQuery.eq('id', connectionId)
    : await connQuery

  if (connError) {
    return NextResponse.json({ error: connError.message }, { status: 500 })
  }

  const conns = (connections || []) as any[]
  if (conns.length === 0) {
    return NextResponse.json({ synced: 0, inserted: 0, message: 'No connections' })
  }

  let plaid: ReturnType<typeof getPlaidClient>
  try {
    plaid = getPlaidClient()
  } catch (e: any) {
    const message = e?.message || ''
    if (typeof message === 'string' && message.includes('PLAID_CLIENT_ID/PLAID_SECRET')) {
      return NextResponse.json({ error: 'Plaid is not configured' }, { status: 503 })
    }

    throw e
  }

  let totalInserted = 0

  for (const conn of conns) {
    try {
      const { data: secretRow, error: secretError } = await (service
        .from('bank_feed_connection_secrets') as any)
        .select('access_token')
        .eq('connection_id', conn.id)
        .single()

      if (secretError) throw secretError

      const accessToken = (secretRow as any).access_token as string

      // Map Plaid account_id -> LedgerAI bank_account_id
      const { data: mappings, error: mapError } = await (service
        .from('bank_feed_accounts') as any)
        .select('provider_account_id, bank_account_id')
        .eq('connection_id', conn.id)

      if (mapError) throw mapError

      const map = new Map<string, string>()
      for (const m of (mappings || []) as any[]) {
        if (m.provider_account_id && m.bank_account_id) {
          map.set(m.provider_account_id, m.bank_account_id)
        }
      }

      let cursor: string | null = conn.provider_cursor || null
      let hasMore = true
      let nextCursor: string | null = cursor

      while (hasMore) {
        const sync = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor || undefined,
          count: 500,
        })

        const added = sync.data.added || []

        const rows = added
          .filter((t) => !!t.transaction_id && !!t.date)
          .map((t) => {
            const amount = typeof t.amount === 'number' ? t.amount : 0
            const bankAccountId = t.account_id ? map.get(t.account_id) : undefined

            return {
              tenant_id: tenantId,
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
              },
              external_raw: t as any,
            }
          })

        if (rows.length > 0) {
          const { rpc } = await import('@/lib/supabase/typed')
          const { data: insertedCount, error: rpcError } = await rpc('insert_bank_feed_transactions', { p_rows: rows })

          if (rpcError) throw rpcError
          totalInserted += Number(insertedCount || 0)
        }

        nextCursor = sync.data.next_cursor
        hasMore = !!sync.data.has_more
        cursor = nextCursor
      }

      await (service.from('bank_feed_connections') as any)
        .update({
          provider_cursor: nextCursor,
          last_synced_at: new Date().toISOString(),
          status: 'ACTIVE',
          error_message: null,
        })
        .eq('id', conn.id)
    } catch (e: any) {
      console.error('Bank feed sync error:', e)
      await (service.from('bank_feed_connections') as any)
        .update({
          status: 'ERROR',
          error_message: e?.message || 'Sync failed',
        })
        .eq('id', conn.id)
    }
  }

  return NextResponse.json({ synced: conns.length, inserted: totalInserted })
}
