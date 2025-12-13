import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signOAuthState } from '@/lib/external-sources/oauth-state'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sourceId = url.searchParams.get('source_id')
  const returnToRaw = url.searchParams.get('return_to')
  if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : null

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Microsoft OAuth is not configured' }, { status: 503 })
  }

  const service = createServiceClient()
  const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
    .select('id, tenant_id, provider')
    .eq('id', sourceId)
    .single()

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 400 })
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

  const state = signOAuthState({ source_id: sourceId, user_id: user.id, ts: Date.now(), return_to: returnTo || undefined })
  const nonce = crypto.randomBytes(12).toString('hex')

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('response_mode', 'query')
  authUrl.searchParams.set('scope', 'offline_access Files.Read User.Read')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('nonce', nonce)

  return NextResponse.redirect(authUrl.toString())
}
