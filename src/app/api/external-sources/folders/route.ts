import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { googleDriveListFolders } from '@/lib/external-sources/google-drive'
import { oneDriveListFolders } from '@/lib/external-sources/onedrive'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sourceId = url.searchParams.get('source_id')
  const parentId = url.searchParams.get('parent_id') || 'root'

  if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

  const service = createServiceClient()

  const { data: source, error: sourceError } = await (service.from('external_document_sources') as any)
    .select('id, tenant_id, provider')
    .eq('id', sourceId)
    .single()

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 400 })

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
    const { folders } = await googleDriveListFolders({ parentId, refreshToken })
    return NextResponse.json({ parent_id: parentId, folders })
  }

  if (provider === 'ONEDRIVE') {
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

    return NextResponse.json({ parent_id: parentId, folders })
  }

  return NextResponse.json({ error: 'Folder picker only supported for cloud providers' }, { status: 400 })
}
