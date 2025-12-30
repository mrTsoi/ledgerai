import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPlaidClient } from '@/lib/plaid'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

type Body = {
  tenant_id: string
  public_token: string
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
  let publicToken: string

  try {
    const body = (await req.json()) as Body
    tenantId = body?.tenant_id
    publicToken = body?.public_token
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!tenantId || !publicToken) {
    return NextResponse.json({ error: 'tenant_id and public_token are required' }, { status: 400 })
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

  try {
    const plaid = getPlaidClient()

    const exchange = await plaid.itemPublicTokenExchange({
      public_token: publicToken,
    })

    const accessToken = exchange.data.access_token
    const itemId = exchange.data.item_id

    // Create connection row (RLS enforced)
    const { data: connection, error: connectionError } = await (supabase.from('bank_feed_connections') as any)
      .upsert(
        {
          tenant_id: tenantId,
          provider: 'PLAID',
          provider_item_id: itemId,
          status: 'ACTIVE',
          error_message: null,
        },
        { onConflict: 'tenant_id,provider,provider_item_id' }
      )
      .select('id')
      .single()

    if (connectionError) {
      return NextResponse.json({ error: connectionError.message }, { status: 400 })
    }

    const connectionId = (connection as any).id as string

    // Store secret using service role (secrets table is deny-all)
    let service: ReturnType<typeof createServiceClient>
    try {
      service = createServiceClient()
    } catch {
      return NextResponse.json(
        { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 503 }
      )
    }
    const { error: secretError } = await (service.from('bank_feed_connection_secrets') as any)
      .upsert(
        {
          connection_id: connectionId,
          access_token: accessToken,
        },
        { onConflict: 'connection_id' }
      )

    if (secretError) {
      return NextResponse.json({ error: secretError.message }, { status: 500 })
    }

    // Fetch accounts and auto-create corresponding bank_accounts + mappings
    const accountsRes = await plaid.accountsGet({ access_token: accessToken })
    const accounts = accountsRes.data.accounts || []

    for (const acct of accounts) {
      const { data: bankAccount, error: bankAccountError } = await (supabase.from('bank_accounts') as any)
        .insert({
          tenant_id: tenantId,
          account_name: acct.name,
          account_number: acct.mask || null,
          currency: acct.balances?.iso_currency_code || 'USD',
          bank_name: null,
          is_active: true,
        })
        .select('id')
        .single()

      if (bankAccountError) {
        console.warn('Error creating bank_account for Plaid account:', bankAccountError)
        continue
      }

      await (supabase.from('bank_feed_accounts') as any).upsert(
        {
          tenant_id: tenantId,
          connection_id: connectionId,
          provider_account_id: acct.account_id,
          bank_account_id: (bankAccount as any).id,
          account_name: acct.name,
          account_mask: acct.mask || null,
          currency: acct.balances?.iso_currency_code || null,
        },
        { onConflict: 'connection_id,provider_account_id' }
      )
    }

    return NextResponse.json({ success: true, connection_id: connectionId })
  } catch (e: any) {
    const message = e?.message || 'Plaid error'
    if (typeof message === 'string' && message.includes('PLAID_CLIENT_ID/PLAID_SECRET')) {
      return NextResponse.json({ error: 'Plaid is not configured' }, { status: 503 })
    }

    console.error('Plaid exchange error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
