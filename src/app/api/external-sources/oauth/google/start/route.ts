import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signOAuthState } from '@/lib/external-sources/oauth-state'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    const url = new URL(req.url)
    const sourceId = url.searchParams.get('source_id')
    const returnToRaw = url.searchParams.get('return_to')
    if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

    const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : null

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const origin = (process.env.NEXT_PUBLIC_SITE_URL as string) || new URL(req.url).origin
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${origin.replace(/\/$/, '')}/api/external-sources/oauth/google/callback`
    if (!clientId) {
      return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 })
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
      .eq('id', sourceId)
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

    let state: string
    try {
      state = signOAuthState({ source_id: sourceId, user_id: user.id, ts: Date.now(), return_to: returnTo || undefined })
    } catch (e: any) {
      return NextResponse.json(
        {
          error: e?.message || 'OAuth state signing failed',
          hint: 'Set EXTERNAL_OAUTH_STATE_SECRET (>=32 chars). Example: node -e "console.log(require("crypto").randomBytes(32).toString("hex"))"',
        },
        { status: 503 }
      )
    }
    const nonce = crypto.randomBytes(8).toString('hex')

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('include_granted_scopes', 'true')
    authUrl.searchParams.set('nonce', nonce)

    const mode = url.searchParams.get('mode')
    if (mode === 'json') {
      return NextResponse.json({ auth_url: authUrl.toString(), redirect_uri: redirectUri })
    }

    return NextResponse.redirect(authUrl.toString())
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/oauth/google/start', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
