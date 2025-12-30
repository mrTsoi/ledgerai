import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'
import { googleDriveGetAccount, googleDriveGetItemName } from '@/lib/external-sources/google-drive'
import { oneDriveGetAccount, oneDriveGetItemName } from '@/lib/external-sources/onedrive'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
      const ok = await userHasFeature(supabase, user.id, 'ai_access')
      if (!ok) {
        return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
    }

    const url = new URL(req.url)
    const sourceId = url.searchParams.get('source_id')
    if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

    let service: ReturnType<typeof createServiceClient>
    try {
      service = createServiceClient()
    } catch {
      return NextResponse.json(
        { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 503 }
      )
    }

    const { data: source, error: sourceError } = await service
      .from('external_document_sources')
      .select('id, tenant_id, provider, config')
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

    const sourceTenantId = (source as { tenant_id?: string } | null)?.tenant_id
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('tenant_id', sourceTenantId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: secretsRow } = await service
      .from('external_document_source_secrets')
      .select('secrets')
      .eq('source_id', sourceId)
      .maybeSingle()

    const secrets = (secretsRow as { secrets?: any } | null)?.secrets || {}
    const refreshToken = secrets.refresh_token as string | undefined

    const provider = String((source as { provider?: string } | null)?.provider || '')
    const folderId = ((source as { config?: any } | null)?.config || {})?.folder_id as string | undefined

    if (!refreshToken) {
      return NextResponse.json({ provider, connected: false, folder_id: folderId || null })
    }

    if (provider === 'GOOGLE_DRIVE') {
      const account = await googleDriveGetAccount({ refreshToken })
      const folderName = folderId ? await googleDriveGetItemName({ fileId: folderId, refreshToken }).catch(() => null) : null
      return NextResponse.json({ provider, connected: true, account, folder_id: folderId || null, folder_name: folderName })
    }

    if (provider === 'ONEDRIVE') {
      const account = await oneDriveGetAccount({ refreshToken })
      const folderName = folderId ? await oneDriveGetItemName({ itemId: folderId, refreshToken }).catch(() => null) : null
      return NextResponse.json({ provider, connected: true, account, folder_id: folderId || null, folder_name: folderName })
    }

    return NextResponse.json({ provider, connected: true, folder_id: folderId || null })
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/whoami', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
