import { NextResponse } from 'next/server'
import { resolveTxt } from 'dns/promises'
import { createClient } from '@/lib/supabase/server'
import { userHasFeature } from '@/lib/subscription/server'

export const runtime = 'nodejs'

function normalizeDomain(input: string): string {
  const trimmed = (input || '').trim().toLowerCase()
  if (!trimmed) return ''

  // Allow passing full URLs; extract hostname
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).hostname.toLowerCase()
    } catch {
      return ''
    }
  }

  // Strip any path/port if user pasted them
  const withoutPath = trimmed.split('/')[0]
  const withoutPort = withoutPath.split(':')[0]
  return withoutPort
}

async function hasVerificationTxt(domain: string, token: string): Promise<boolean> {
  const name = `_ledgerai.${domain}`
  const expected = `ledgerai-verify=${token}`

  try {
    const records = await resolveTxt(name)
    const flattened = records.flat().map((part) => part.trim())
    return flattened.some((value) => value === expected)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ok = await userHasFeature(supabase, user.id, 'custom_domain')
    if (!ok) {
      return NextResponse.json({ error: 'Custom domains are not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
  }

  let domain: string
  try {
    const body = await req.json()
    domain = normalizeDomain(body?.domain)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!domain) {
    return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
  }

  const { data: row, error } = await supabase
    .from('tenant_domains')
    .select('id, tenant_id, domain, verification_token, verified_at')
    .eq('domain', domain)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!row) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
  }

  const tenantId = (row as { tenant_id?: string } | null)?.tenant_id
  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 })
  }

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (row.verified_at) {
    return NextResponse.json({ verified: true, message: 'Domain already verified' })
  }

  const ok = await hasVerificationTxt(domain, row.verification_token)

  if (!ok) {
    return NextResponse.json({
      verified: false,
      message: 'Verification TXT record not found yet. Add TXT record and try again.',
      expected: {
        name: `_ledgerai.${domain}`,
        value: `ledgerai-verify=${row.verification_token}`,
      },
    })
  }

  const { error: updateError } = await supabase
    .from('tenant_domains')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', row.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ verified: true, message: 'Domain verified successfully' })
}
