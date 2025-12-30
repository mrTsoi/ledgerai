import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { MAX_UPLOAD_BYTES, validateUploadBytes } from '@/lib/uploads/validate-upload'

export const runtime = 'nodejs'

function coerceString(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const tenantId = coerceString(form.get('tenantId'))
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })

  const documentTypeRaw = coerceString(form.get('documentType'))
  const bankAccountId = coerceString(form.get('bankAccountId'))

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  if (!file.size) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 })
  }

  // Verify user can upload into this tenant
  const { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const validation = validateUploadBytes({ filename: file.name, contentType: file.type, bytes })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const allowedDocTypes = new Set(['bank_statement', 'INVOICE'])
  const documentType = documentTypeRaw && allowedDocTypes.has(documentTypeRaw) ? documentTypeRaw : null

  // Store under a server-generated name to avoid path tricks and collisions
  const documentId = crypto.randomUUID()
  const filePath = `${tenantId}/${documentId}.${validation.canonicalExt}`

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return NextResponse.json(
      { error: 'Server is not configured for this action (missing SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 }
    )
  }
  const { error: storageError } = await service.storage.from('documents').upload(filePath, bytes, {
    contentType: validation.canonicalMime,
    upsert: false,
    cacheControl: '3600',
  })

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 400 })
  }

  // Create document record under user context (RLS enforced)
  const { error: docError } = await (supabase.from('documents') as any).insert({
    id: documentId,
    tenant_id: tenantId,
    file_path: filePath,
    file_name: validation.safeFileName,
    file_size: validation.size,
    file_type: validation.canonicalMime,
    uploaded_by: user.id,
    status: 'UPLOADED',
    document_type: documentType,
  })

  if (docError) {
    // Best-effort cleanup
    await service.storage.from('documents').remove([filePath])
    return NextResponse.json({ error: docError.message }, { status: 400 })
  }

  if (documentType === 'bank_statement' && bankAccountId) {
    await (supabase.from('bank_statements') as any).insert({
      tenant_id: tenantId,
      bank_account_id: bankAccountId,
      document_id: documentId,
      status: 'IMPORTED',
    })
  }

  return NextResponse.json({
    success: true,
    documentId,
    filePath,
    fileType: validation.canonicalMime,
    fileSize: validation.size,
    fileName: validation.safeFileName,
  })
}
