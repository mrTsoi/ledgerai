import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchFromSftp } from '@/lib/external-sources/sftp'
import { fetchFromFtps } from '@/lib/external-sources/ftps'
import { importFetchedFile } from '@/lib/external-sources/import-to-documents'
import { googleDriveList, googleDriveDownload } from '@/lib/external-sources/google-drive'
import { oneDriveList, oneDriveDownload } from '@/lib/external-sources/onedrive'
import { hashExternalSourcesCronKey, timingSafeEqualHex } from '@/lib/external-sources/cron-keys'
import { minimatch } from 'minimatch'
import { userHasFeature } from '@/lib/subscription/server'
import { isPostgrestRelationMissing, missingRelationHint } from '@/lib/supabase/postgrest-errors'

export const runtime = 'nodejs'

type Body = {
  tenant_id?: string
  source_id?: string
  limit?: number
}

function minutesSince(iso: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  return (Date.now() - t) / 60000
}

export async function POST(req: Request) {
  try {
    const globalCronSecret = process.env.EXTERNAL_FETCH_CRON_SECRET
    const provided = req.headers.get('x-ledgerai-cron-secret')

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const hasGlobalCronAuth = !!globalCronSecret && !!provided && provided === globalCronSecret

    if (!hasGlobalCronAuth && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Body = {}
    try {
      body = (await req.json()) as Body
    } catch {
      // allow empty
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

    let hasTenantCronAuth = false
    let tenantCronDefaults: { enabled: boolean; default_run_limit: number } | null = null

    if (!hasGlobalCronAuth && provided) {
      if (!body.tenant_id) {
        return NextResponse.json({ error: 'tenant_id is required for tenant cron auth' }, { status: 400 })
      }

      const { data: cronRow, error: cronError } = await (service.from('external_sources_cron_secrets') as any)
        .select('enabled, default_run_limit, key_hash')
        .eq('tenant_id', body.tenant_id)
        .maybeSingle()

      if (cronError) return NextResponse.json({ error: cronError.message }, { status: 500 })

      if (cronRow?.key_hash) {
        const candidateHash = hashExternalSourcesCronKey(provided)
        const ok = timingSafeEqualHex(candidateHash, String((cronRow as any).key_hash))
        if (ok) {
          hasTenantCronAuth = true
          tenantCronDefaults = {
            enabled: !!(cronRow as any).enabled,
            default_run_limit: Math.max(1, Math.min(50, Number((cronRow as any).default_run_limit || 10))),
          }
        }
      }
    }

    const hasCronAuth = hasGlobalCronAuth || hasTenantCronAuth

    if (!hasCronAuth && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Enforce tenant_id for all non-global/cron requests (tenant isolation)
    if (!hasCronAuth && user) {
      if (!body.tenant_id) {
        return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
      }
      try {
        const ok = await userHasFeature(supabase as any, user.id, 'ai_access')
        if (!ok) {
          return NextResponse.json({ error: 'AI automation is not available on your plan' }, { status: 403 })
        }
      } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? 'Failed to verify subscription' }, { status: 500 })
      }
    }

    let sourcesQuery = (service.from('external_document_sources') as any)
      .select('id, tenant_id, provider, enabled, schedule_minutes, last_run_at, config')
      .eq('enabled', true)

    if (body.tenant_id) sourcesQuery = sourcesQuery.eq('tenant_id', body.tenant_id)
    if (body.source_id) sourcesQuery = sourcesQuery.eq('id', body.source_id)

    const { data: sources, error: sourcesError } = await sourcesQuery

    if (sourcesError) {
      if (isPostgrestRelationMissing(sourcesError, 'external_document_sources')) {
        return NextResponse.json(
          {
            error: sourcesError.message,
            ...missingRelationHint('external_document_sources'),
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: sourcesError.message }, { status: 500 })
    }

    const defaultLimit = hasTenantCronAuth ? tenantCronDefaults?.default_run_limit ?? 10 : 10
    const limit = Math.max(1, Math.min(50, Number(typeof body.limit === 'number' || typeof body.limit === 'string' ? body.limit : defaultLimit)))

    let totalInserted = 0
    const results: any[] = []

    for (const src of (sources || []) as any[]) {
      const due = minutesSince(src.last_run_at) >= Number(src.schedule_minutes || 60)
      if (!hasCronAuth && user) {
        // interactive run: enforce tenant admin
        const { data: membership } = await (supabase.from('memberships') as any)
          .select('role')
          .eq('tenant_id', src.tenant_id)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .in('role', ['COMPANY_ADMIN', 'SUPER_ADMIN'])
          .maybeSingle()

        if (!membership) {
          results.push({ source_id: src.id, status: 'SKIPPED', message: 'Forbidden' })
          continue
        }
      }

      if (hasTenantCronAuth && tenantCronDefaults && tenantCronDefaults.enabled === false) {
        results.push({ source_id: src.id, status: 'SKIPPED', message: 'Tenant cron disabled' })
        continue
      }

      if (hasCronAuth && !due) {
        results.push({ source_id: src.id, status: 'SKIPPED', message: 'Not due yet' })
        continue
      }

      const { data: runRow } = await (service.from('external_document_source_runs') as any)
        .insert({ tenant_id: src.tenant_id, source_id: src.id, status: 'RUNNING' })
        .select('id')
        .single()

      const runId = (runRow as any)?.id

      try {
        const { data: secretsRow } = await (service.from('external_document_source_secrets') as any)
          .select('secrets')
          .eq('source_id', src.id)
          .maybeSingle()

        const secrets = (secretsRow as any)?.secrets || {}
        const config = src.config || {}

        const glob = (config.file_glob as string | undefined) || '**/*'

        let inserted = 0

        if (src.provider === 'SFTP' || src.provider === 'FTPS') {
          const connector = src.provider === 'SFTP' ? await fetchFromSftp(config, secrets) : await fetchFromFtps(config, secrets)
          const toCheck = connector.list.slice(0, limit)

          for (const item of toCheck) {
            const remotePath = item.fullPath
            const { data: existing } = await (service.from('external_document_source_items') as any)
              .select('id')
              .eq('source_id', src.id)
              .eq('remote_path', remotePath)
              .maybeSingle()

            if (existing) continue

            const fetched = await connector.download(remotePath)

            const imported = await importFetchedFile({
              tenantId: src.tenant_id,
              fetched,
              config,
              sourceId: src.id,
            })

            await (service.from('external_document_source_items') as any).insert({
              tenant_id: src.tenant_id,
              source_id: src.id,
              remote_path: remotePath,
              remote_modified_at: item.modifiedAt || null,
              remote_size: item.size || null,
              imported_document_id: imported.documentId,
              imported_at: new Date().toISOString(),
            })

            inserted += 1
            totalInserted += 1
          }
        } else if (src.provider === 'GOOGLE_DRIVE') {
          const folderId = config.folder_id as string | undefined
          const refreshToken = secrets.refresh_token as string | undefined
          if (!folderId) throw new Error('folder_id is required')
          if (!refreshToken) throw new Error('Not connected')

          const { accessToken, files } = await googleDriveList({ folderId, refreshToken })
          const toCheck = files
            .filter((f) => minimatch(f.name, glob, { dot: true, nocase: true }))
            .slice(0, limit)

          for (const item of toCheck) {
            const remoteId = item.id
            const { data: existing } = await (service.from('external_document_source_items') as any)
              .select('id')
              .eq('source_id', src.id)
              .eq('remote_id', remoteId)
              .maybeSingle()

            if (existing) continue

            const fetched = await googleDriveDownload({ fileId: remoteId, fileName: item.name, accessToken })

            const imported = await importFetchedFile({
              tenantId: src.tenant_id,
              fetched,
              config,
              sourceId: src.id,
            })

            await (service.from('external_document_source_items') as any).insert({
              tenant_id: src.tenant_id,
              source_id: src.id,
              remote_id: remoteId,
              remote_modified_at: item.modifiedTime || null,
              remote_size: item.size || null,
              imported_document_id: imported.documentId,
              imported_at: new Date().toISOString(),
            })

            inserted += 1
            totalInserted += 1
          }
        } else if (src.provider === 'ONEDRIVE') {
          const folderId = config.folder_id as string | undefined
          const refreshToken = secrets.refresh_token as string | undefined
          if (!folderId) throw new Error('folder_id is required')
          if (!refreshToken) throw new Error('Not connected')

          const { accessToken, refreshToken: newRefreshToken, files } = await oneDriveList({ folderId, refreshToken })

          if (newRefreshToken && newRefreshToken !== refreshToken) {
            await (service.from('external_document_source_secrets') as any).upsert(
              {
                source_id: src.id,
                secrets: {
                  ...secrets,
                  refresh_token: newRefreshToken,
                },
              },
              { onConflict: 'source_id' }
            )
          }

          const toCheck = files
            .filter((f) => minimatch(f.name, glob, { dot: true, nocase: true }))
            .slice(0, limit)

          for (const item of toCheck) {
            const remoteId = item.id
            const { data: existing } = await (service.from('external_document_source_items') as any)
              .select('id')
              .eq('source_id', src.id)
              .eq('remote_id', remoteId)
              .maybeSingle()

            if (existing) continue

            const fetched = await oneDriveDownload({ fileId: remoteId, fileName: item.name, accessToken })

            const imported = await importFetchedFile({
              tenantId: src.tenant_id,
              fetched,
              config,
              sourceId: src.id,
            })

            await (service.from('external_document_source_items') as any).insert({
              tenant_id: src.tenant_id,
              source_id: src.id,
              remote_id: remoteId,
              remote_modified_at: item.modifiedTime || null,
              remote_size: item.size || null,
              imported_document_id: imported.documentId,
              imported_at: new Date().toISOString(),
            })

            inserted += 1
            totalInserted += 1
          }
        } else {
          throw new Error('Provider not implemented yet')
        }

        await (service.from('external_document_sources') as any)
          .update({ last_run_at: new Date().toISOString() })
          .eq('id', src.id)

        await (service.from('external_document_source_runs') as any)
          .update({
            status: 'SUCCESS',
            finished_at: new Date().toISOString(),
            inserted_count: inserted,
            message: inserted ? `Imported ${inserted} file(s)` : 'No new files',
          })
          .eq('id', runId)

        results.push({ source_id: src.id, status: 'SUCCESS', inserted })
      } catch (e: any) {
        await (service.from('external_document_source_runs') as any)
          .update({
            status: 'ERROR',
            finished_at: new Date().toISOString(),
            message: e?.message || 'Error',
          })
          .eq('id', runId)

        results.push({ source_id: src.id, status: 'ERROR', message: e?.message || 'Error' })
      }
    }

    return NextResponse.json({ ok: true, inserted: totalInserted, results })
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/run', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
