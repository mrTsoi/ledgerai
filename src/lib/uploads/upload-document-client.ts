'use client'

export type UploadDocumentResponse = {
  success: boolean
  documentId: string
  filePath: string
  fileType: string
  fileSize: number
  fileName: string
}

export async function uploadDocumentViaApi(params: {
  tenantId: string
  file: File
  documentType?: string | null
  bankAccountId?: string | null
}): Promise<UploadDocumentResponse> {
  const tenantId = String(params.tenantId || '').trim()
  if (!tenantId || tenantId === 'undefined' || tenantId === 'null') {
    throw new Error('No company selected')
  }

  const form = new FormData()
  form.set('tenantId', tenantId)
  form.set('file', params.file)
  if (params.documentType) form.set('documentType', params.documentType)
  if (params.bankAccountId) form.set('bankAccountId', params.bankAccountId)

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    body: form,
  })

  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    throw new Error(String(json?.error || 'Upload failed'))
  }

  const documentId = String(json?.documentId || '')
  if (!documentId) throw new Error('Upload failed')

  return {
    success: true,
    documentId,
    filePath: String(json?.filePath || ''),
    fileType: String(json?.fileType || ''),
    fileSize: Number(json?.fileSize || 0),
    fileName: String(json?.fileName || ''),
  }
}
