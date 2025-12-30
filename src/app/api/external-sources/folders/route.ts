import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { googleDriveListFolders } from '@/lib/external-sources/google-drive'
import { googleDriveList } from '@/lib/external-sources/google-drive'
import { oneDriveListFolders } from '@/lib/external-sources/onedrive'
import { oneDriveList } from '@/lib/external-sources/onedrive'
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
    const parentId = url.searchParams.get('parent_id') || 'root'

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

    const { data: membership } = await (supabase.from('memberships') as any)
      .select('role')
      .eq('tenant_id', (source as any).tenant_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: secretsRow } = await (service.from('external_document_source_secrets') as any)
      .select('secrets')
      .eq('source_id', sourceId)
      .maybeSingle()

    const secrets = (secretsRow as any)?.secrets || {}
    const refreshToken = secrets.refresh_token as string | undefined
    if (!refreshToken) return NextResponse.json({ error: 'Not connected' }, { status: 400 })

    const provider = (source as any).provider as string

    if (provider === 'GOOGLE_DRIVE') {
      try {
        const { folders } = await googleDriveListFolders({ parentId, refreshToken })

        // File preview: only works for real folder ids (not our synthetic shared-drive entries).
        let files: Array<{ id: string; name: string; mimeType?: string; size?: number; modifiedTime?: string }> = []
        if (!parentId.startsWith('drive:')) {
          const listed = await googleDriveList({ folderId: parentId, refreshToken })
          files = (listed.files || [])
            .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder')
            .slice(0, 50)
            .map((f) => ({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              modifiedTime: f.modifiedTime,
            }))
        }

        return NextResponse.json({ parent_id: parentId, folders, files })
      } catch (e: any) {
        return NextResponse.json(
          {
            error: e?.message || 'Failed to list Google Drive folders',
          },
          { status: 400 }
        )
      }
    }

    if (provider === 'ONEDRIVE') {
      try {
        const { folders, refreshToken: newRefreshToken } = await oneDriveListFolders({ parentId, refreshToken })

        if (newRefreshToken && newRefreshToken !== refreshToken) {
          await (service.from('external_document_source_secrets') as any).upsert(
            {
              source_id: sourceId,
              secrets: {
                ...secrets,
                refresh_token: newRefreshToken,
              },
            },
            { onConflict: 'source_id' }
          )
        }

        const listed = await oneDriveList({ folderId: parentId, refreshToken: newRefreshToken || refreshToken })
        const files = (listed.files || []).slice(0, 50).map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          modifiedTime: f.modifiedTime,
        }))

        return NextResponse.json({ parent_id: parentId, folders, files })
      } catch (e: any) {
        return NextResponse.json(
          {
            error: e?.message || 'Failed to list OneDrive folders',
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ error: 'Folder picker only supported for cloud providers' }, { status: 400 })
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/folders', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
