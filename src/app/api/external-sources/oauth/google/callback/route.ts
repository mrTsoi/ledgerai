import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyOAuthState } from '@/lib/external-sources/oauth-state'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code/state' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 })
  }

  let parsed
  try {
    parsed = verifyOAuthState(state)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid state' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Must be logged in as the same user who started the flow
  if (!user || user.id !== parsed.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  })

  const tokenJson = (await tokenRes.json()) as any
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: tokenJson?.error_description || tokenJson?.error || 'Token exchange failed' },
      { status: 400 }
    )
  }

  const refreshToken = tokenJson.refresh_token as string | undefined
  if (!refreshToken) {
    // This can happen if the user previously consented without prompt=consent.
    return NextResponse.json(
      { error: 'No refresh_token returned. Try again with re-consent.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
    .select('id, tenant_id, provider')
    .eq('id', parsed.source_id)
    .single()

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 400 })
  if ((source as any).provider !== 'GOOGLE_DRIVE') {
    return NextResponse.json({ error: 'Source is not Google Drive' }, { status: 400 })
  }

  const { data: membership } = await (supabase.from('memberships') as any)
    .select('role')
    .eq('tenant_id', (source as any).tenant_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await (service.from('external_document_source_secrets') as any).upsert(
    {
      source_id: parsed.source_id,
      secrets: {
        refresh_token: refreshToken,
      },
    },
    { onConflict: 'source_id' }
  )

  const returnTo =
    parsed.return_to && parsed.return_to.startsWith('/') && !parsed.return_to.startsWith('//')
      ? parsed.return_to
      : null

  return NextResponse.redirect(returnTo || '/dashboard/settings?tab=external-sources')
}
