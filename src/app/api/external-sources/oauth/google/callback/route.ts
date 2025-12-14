import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyOAuthState } from '@/lib/external-sources/oauth-state'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'

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
  const origin = new URL(req.url).origin
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin}/api/external-sources/oauth/google/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 })
  }

  let parsed
  try {
    parsed = verifyOAuthState(state)
  } catch (e: any) {
    const message = e?.message || 'Invalid state'
    if (typeof message === 'string' && message.toLowerCase().includes('oauth state signing')) {
      return NextResponse.json(
        {
          error: message,
          hint: 'Set EXTERNAL_OAUTH_STATE_SECRET (>=32 chars) consistently across all app instances.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Must be logged in as the same user who started the flow
  if (!user || user.id !== parsed.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
    if (!ok) {
      return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
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
    // Helpful diagnostics for dev environments (Google often returns redirect_uri mismatch here).
    const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
    return NextResponse.json(
      {
        error: tokenJson?.error_description || tokenJson?.error || 'Token exchange failed',
        details,
        hint:
          'Verify GOOGLE_OAUTH_CLIENT_ID/SECRET and that the exact redirect URI is allowed in Google Cloud Console. Expected redirect_uri: ' +
          redirectUri,
      },
      { status: 400 }
    )
  }

  const refreshToken = tokenJson.refresh_token as string | undefined
  if (!refreshToken) {
    // This can happen if the user previously consented without prompt=consent.
    const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
    return NextResponse.json(
      {
        error: 'No refresh_token returned. Try again with re-consent.',
        details,
        hint:
          'In Google Account → Security → Third-party access, remove this app and try Connect again (we request prompt=consent + access_type=offline).',
      },
      { status: 400 }
    )
  }

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }
  const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
    .select('id, tenant_id, provider')
    .eq('id', parsed.source_id)
    .single()

  if (sourceError) {
    if (isPostgrestRelationMissing(sourceError, 'external_document_sources')) {
      return NextResponse.json(
        {
          error: sourceError.message,
          ...missingRelationHint('external_document_sources'),
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: sourceError.message }, { status: 400 })
  }
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

  const origin2 = new URL(req.url).origin
  const targetPath = returnTo || '/en/dashboard/settings?tab=external-sources'
  return NextResponse.redirect(new URL(targetPath, origin2))
}
