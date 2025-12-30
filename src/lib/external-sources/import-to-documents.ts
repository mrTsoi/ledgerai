import crypto from 'crypto'
import path from 'path'
import { createServiceClient } from '@/lib/supabase/service'
import type { ExternalFetchedFile, ExternalSourceConfig } from './types'
import { validateUploadBytes } from '@/lib/uploads/validate-upload'

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function importFetchedFile(params: {
  tenantId: string
  fetched: ExternalFetchedFile
  config: ExternalSourceConfig
  sourceId: string
}) {
  const { tenantId, fetched, config, sourceId } = params
  const supabase = createServiceClient()

  const documentId = crypto.randomUUID()

  const validation = validateUploadBytes({
    filename: fetched.filename,
    contentType: fetched.mimeType,
    bytes: fetched.bytes,
  })
  if (!validation.ok) {
    throw new Error(`External file rejected: ${validation.error}`)
  }

  const ext = `.${validation.canonicalExt}`
  const safeName = sanitizeFileName(fetched.filename)
  const filePath = `${tenantId}/${documentId}${ext}`

  // Upload bytes to Supabase storage bucket
  const { error: storageError } = await supabase.storage
    .from('documents')
    .upload(filePath, fetched.bytes, {
      contentType: validation.canonicalMime,
      upsert: false,
    })

  if (storageError) {
    throw new Error(storageError.message)
  }

  const documentType = config.document_type ?? null

  const svc = supabase
  const { error: docError } = await svc.from('documents').insert({
    id: documentId,
    tenant_id: tenantId,
    file_path: filePath,
    file_name: safeName,
    file_size: fetched.bytes.byteLength,
    file_type: validation.canonicalMime,
    status: 'UPLOADED',
    document_type: documentType,
    uploaded_by: null,
  })

  if (docError) {
    // best-effort cleanup
    await supabase.storage.from('documents').remove([filePath])
    throw new Error(docError.message)
  }

  if (documentType === 'bank_statement' && config.bank_account_id) {
    await svc.from('bank_statements').insert({
      tenant_id: tenantId,
      bank_account_id: config.bank_account_id,
      document_id: documentId,
      status: 'IMPORTED',
    })
  }

  // Record source item ledger link (caller will provide identity via upsert)
  return {
    documentId,
    filePath,
    originalName: safeName,
    sourceId,
  }
}
