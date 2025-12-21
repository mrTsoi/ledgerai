import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const MAX_MARKETING_VIDEO_BYTES = 100 * 1024 * 1024 // 100MB

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isSuperAdmin, error } = await (supabase as any).rpc('is_super_admin')
  if (error || isSuperAdmin !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const filename = String(file.name || '').trim()
  const contentType = String(file.type || '').trim().toLowerCase()

  const looksLikeMp4 = contentType === 'video/mp4' || filename.toLowerCase().endsWith('.mp4')
  if (!looksLikeMp4) {
    return NextResponse.json({ error: 'Only MP4 videos are supported' }, { status: 400 })
  }

  if (!file.size) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (file.size > MAX_MARKETING_VIDEO_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Server is not configured (missing NEXT_PUBLIC_SUPABASE_URL)' }, { status: 503 })
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

  const bytes = Buffer.from(await file.arrayBuffer())
  const objectPath = `hero/${crypto.randomUUID()}.mp4`

  const { error: uploadError } = await service.storage.from('marketing').upload(objectPath, bytes, {
    contentType: 'video/mp4',
    upsert: false,
    cacheControl: '31536000',
  })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/marketing/${objectPath}`

  return NextResponse.json({
    success: true,
    bucket: 'marketing',
    filePath: objectPath,
    publicUrl,
  })
}
