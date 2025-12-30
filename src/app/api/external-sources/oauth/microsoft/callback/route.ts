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

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || new URL(req.url).origin
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI || `${origin.replace(/\/$/, '')}/api/external-sources/oauth/microsoft/callback`

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Microsoft OAuth is not configured' }, { status: 503 })
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

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
      scope: 'offline_access Files.Read User.Read',
    }),
  })

  const tokenJson = (await tokenRes.json()) as any
  if (!tokenRes.ok) {
    const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
    return NextResponse.json(
      {
        error: tokenJson?.error_description || tokenJson?.error || 'Token exchange failed',
        details,
        hint:
          'Verify MICROSOFT_OAUTH_CLIENT_ID/SECRET and that the exact redirect URI is configured in Azure App Registration. Expected redirect_uri: ' +
          redirectUri,
      },
      { status: 400 }
    )
  }

  const refreshToken = tokenJson.refresh_token as string | undefined
  if (!refreshToken) {
    const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
    return NextResponse.json(
      {
        error: 'No refresh_token returned',
        details,
        hint: 'Ensure you requested offline_access and that the user granted consent. Try disconnecting and reconnecting.',
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
  if ((source as any).provider !== 'ONEDRIVE') {
    return NextResponse.json({ error: 'Source is not OneDrive' }, { status: 400 })
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

  const origin2 = (process.env.NEXT_PUBLIC_SITE_URL as string) || new URL(req.url).origin
  const targetPath = returnTo || '/en/dashboard/settings?tab=external-sources'
  return NextResponse.redirect(new URL(targetPath, origin2))
}
