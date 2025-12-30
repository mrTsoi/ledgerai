import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlaidClient } from '@/lib/plaid'
import { userHasFeature } from '@/lib/subscription/server'
import { CountryCode, Products } from 'plaid'

export const runtime = 'nodejs'

type Body = {
  tenant_id: string
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
  try {
    const body = (await req.json()) as Body
    tenantId = body?.tenant_id
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

  try {
    const plaid = getPlaidClient()

    const redirectUri = process.env.PLAID_REDIRECT_URI || undefined

    const res = await plaid.linkTokenCreate({
      user: { client_user_id: `${tenantId}:${user.id}` },
      client_name: 'LedgerAI',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      redirect_uri: redirectUri,
    })

    return NextResponse.json({ link_token: res.data.link_token })
  } catch (e: any) {
    const message = e?.message || 'Plaid error'
    if (typeof message === 'string' && message.includes('PLAID_CLIENT_ID/PLAID_SECRET')) {
      return NextResponse.json({ error: 'Plaid is not configured' }, { status: 503 })
    }

    console.error('Plaid linkTokenCreate error:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
