import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyOAuthState } from '@/lib/external-sources/oauth-state'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    const originTop = (process.env.NEXT_PUBLIC_SITE_URL as string) || url.origin
    const sendResultHtml = (payload: any, targetPath?: string) => {
      const tp = targetPath || '/en/dashboard/settings?tab=external-sources'
      const relayBase = originTop.replace(/\/$/, '') + '/oauth/relay'
      const params = new URLSearchParams()
      params.set('type', payload?.type || 'external_oauth')
      params.set('ok', payload?.ok ? '1' : '0')
      if (payload?.source_id) params.set('source_id', String(payload.source_id))
      if (payload?.error) params.set('error', String(payload.error))
      if (payload?.hint) params.set('hint', String(payload.hint))
      params.set('return_to', tp)
      const relayUrl = relayBase + '?' + params.toString()
      return new Response('', { status: 302, headers: { Location: relayUrl } })
    }

    if (!code || !state) {
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Missing code/state' })
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || new URL(req.url).origin
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin.replace(/\/$/, '')}/api/external-sources/oauth/google/callback`

    if (!clientId || !clientSecret) {
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Google OAuth is not configured' })
    }

    let parsed
    try {
      parsed = verifyOAuthState(state)
    } catch (e: any) {
      const message = e?.message || 'Invalid state'
      const hint = typeof message === 'string' && message.toLowerCase().includes('oauth state signing') ? 'Set EXTERNAL_OAUTH_STATE_SECRET (>=32 chars) consistently across all app instances.' : undefined
      return sendResultHtml({ type: 'external_oauth', ok: false, error: message, hint })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Must be logged in as the same user who started the flow
    if (!user || user.id !== parsed.user_id) {
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Unauthorized' })
    }

    try {
      const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
      if (!ok) {
        return sendResultHtml({ type: 'external_oauth', ok: false, error: 'AI automation is not available on your plan' })
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
      const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
      return sendResultHtml({ type: 'external_oauth', ok: false, error: tokenJson?.error_description || tokenJson?.error || 'Token exchange failed', details, hint: 'Verify GOOGLE_OAUTH_CLIENT_ID/SECRET and that the exact redirect URI is allowed in Google Cloud Console. Expected redirect_uri: ' + redirectUri })
    }

    const refreshToken = tokenJson.refresh_token as string | undefined
    if (!refreshToken) {
      const details = process.env.NODE_ENV !== 'production' ? tokenJson : undefined
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'No refresh_token returned. Try again with re-consent.', details, hint: 'In Google Account → Security → Third-party access, remove this app and try Connect again (we request prompt=consent + access_type=offline).' })
    }

    let service: ReturnType<typeof createServiceClient>
    try {
      service = createServiceClient()
    } catch {
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' })
    }
    const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
      .select('id, tenant_id, provider')
      .eq('id', parsed.source_id)
      .single()

    if (sourceError) {
      if (isPostgrestRelationMissing(sourceError, 'external_document_sources')) {
        return sendResultHtml({ type: 'external_oauth', ok: false, error: sourceError.message, ...missingRelationHint('external_document_sources') })
      }
      return sendResultHtml({ type: 'external_oauth', ok: false, error: sourceError.message })
    }
    if ((source as any).provider !== 'GOOGLE_DRIVE') {
      return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Source is not Google Drive' })
    }

    const { data: membership } = await (supabase.from('memberships') as any)
      .select('role')
      .eq('tenant_id', (source as any).tenant_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
      .maybeSingle()

    if (!membership) return sendResultHtml({ type: 'external_oauth', ok: false, error: 'Forbidden' })

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

    // Log on the server so the dev terminal shows callback activity
    try {
      console.info('[oauth/google/callback] success, source_id=', String(parsed.source_id))
    } catch (e) {}

    const relayBase = origin2.replace(/\/$/, '') + '/oauth/relay'
    const okParams = new URLSearchParams()
    okParams.set('type', 'external_oauth')
    okParams.set('ok', '1')
    okParams.set('source_id', String(parsed.source_id))
    okParams.set('return_to', targetPath)
    const relayUrl = relayBase + '?' + okParams.toString()

    return new Response('', { status: 302, headers: { Location: relayUrl } })
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/oauth/google/callback', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
