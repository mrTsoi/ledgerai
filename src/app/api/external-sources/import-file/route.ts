import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { importFetchedFile } from '@/lib/external-sources/import-to-documents'
import { googleDriveList, googleDriveDownload } from '@/lib/external-sources/google-drive'
import { oneDriveList, oneDriveDownload } from '@/lib/external-sources/onedrive'

export const runtime = 'nodejs'

type Body = {
  tenant_id?: string
  source_id?: string
  files?: Array<{ id: string; name?: string }>
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: Body = {}
    try {
      body = (await req.json()) as Body
    } catch {
      // ignore
    }

    const sourceId = String(body.source_id || '')
    if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 })

    const service = createServiceClient()

    const { data: srcRow, error: srcErr } = await (service.from('external_document_sources') as any)
      .select('id, tenant_id, provider, config')
      .eq('id', sourceId)
      .maybeSingle()

    if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
    if (!srcRow) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

    // verify membership: require COMPANY_ADMIN or SUPER_ADMIN on tenant
    const { data: membership } = await (supabase.from('memberships') as any)
      .select('role')
      .eq('tenant_id', srcRow.tenant_id)
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
    const config = (srcRow as any).config || {}

    const files = Array.isArray(body.files) ? body.files : []
    if (files.length === 0) return NextResponse.json({ ok: true, inserted: 0, results: [] })

    let accessToken: string | undefined
    if (srcRow.provider === 'GOOGLE_DRIVE') {
      const folderId = config.folder_id as string | undefined
      if (!folderId) return NextResponse.json({ error: 'folder_id is required for provider' }, { status: 400 })
      const gd = await googleDriveList({ folderId, refreshToken: secrets.refresh_token })
      accessToken = gd.accessToken
    } else if (srcRow.provider === 'ONEDRIVE') {
      const folderId = config.folder_id as string | undefined
      if (!folderId) return NextResponse.json({ error: 'folder_id is required for provider' }, { status: 400 })
      const od = await oneDriveList({ folderId, refreshToken: secrets.refresh_token })
      accessToken = od.accessToken
      if (od.refreshToken && od.refreshToken !== secrets.refresh_token) {
        await (service.from('external_document_source_secrets') as any).upsert(
          {
            source_id: sourceId,
            secrets: {
              ...secrets,
              refresh_token: od.refreshToken,
            },
          },
          { onConflict: 'source_id' }
        )
      }
    } else {
      return NextResponse.json({ error: 'Provider not implemented' }, { status: 400 })
    }

    let inserted = 0
    const results: any[] = []

    for (const f of files) {
      const remoteId = String(f.id)

      const { data: existing } = await (service.from('external_document_source_items') as any)
        .select('id')
        .eq('source_id', sourceId)
        .eq('remote_id', remoteId)
        .maybeSingle()

      if (existing) {
        results.push({ id: remoteId, status: 'SKIPPED' })
        continue
      }

      try {
        let fetched
        if (srcRow.provider === 'GOOGLE_DRIVE') {
          fetched = await googleDriveDownload({ fileId: remoteId, fileName: f.name || String(remoteId), accessToken: accessToken! })
        } else {
          fetched = await oneDriveDownload({ fileId: remoteId, fileName: f.name || String(remoteId), accessToken: accessToken! })
        }

        const imported = await importFetchedFile({ tenantId: srcRow.tenant_id, fetched, config, sourceId })

        await (service.from('external_document_source_items') as any).insert({
          tenant_id: srcRow.tenant_id,
          source_id: sourceId,
          remote_id: remoteId,
          remote_modified_at: null,
          remote_size: fetched.bytes ? fetched.bytes.byteLength : null,
          imported_document_id: imported.documentId,
          imported_at: new Date().toISOString(),
        })

        inserted += 1
        results.push({ id: remoteId, status: 'IMPORTED', documentId: imported.documentId })
      } catch (e: any) {
        results.push({ id: remoteId, status: 'ERROR', message: e?.message || 'Error' })
      }
    }

    return NextResponse.json({ ok: true, inserted, results })
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/import-file', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
