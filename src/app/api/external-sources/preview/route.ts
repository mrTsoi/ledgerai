import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { googleDriveDownload, googleDriveList } from '@/lib/external-sources/google-drive'
import { oneDriveDownload, oneDriveList } from '@/lib/external-sources/onedrive'
import sharp from 'sharp'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sourceId = String(url.searchParams.get('source_id') || '')
    const fileId = String(url.searchParams.get('file_id') || '')
    const streamRequested = String(url.searchParams.get('stream') || '') === '1'

    if (!sourceId || !fileId) return NextResponse.json({ error: 'source_id and file_id are required' }, { status: 400 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const service = createServiceClient()
    const { data: srcRow } = await (service.from('external_document_sources') as any)
      .select('id, tenant_id, provider, config')
      .eq('id', sourceId)
      .maybeSingle()

    if (!srcRow) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

    // verify membership
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

    // Try to serve cached thumbnail from storage first (return signed URL)
    const thumbPath = `thumbnails/${sourceId}/${fileId}.png`
    try {
      const { data: existingThumb, error: existingErr } = await (service.storage.from('thumbnails') as any).download(thumbPath)
      if (!existingErr && existingThumb) {
        if (streamRequested) {
          const arrayBuffer = await existingThumb.arrayBuffer()
          return new NextResponse(Buffer.from(arrayBuffer), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000', 'Content-Disposition': 'inline' } })
        }
        try {
          const { data: signedData, error: signedErr } = await (service.storage.from('thumbnails') as any).createSignedUrl(thumbPath, 60)
          if (!signedErr && signedData?.signedUrl) {
            return NextResponse.json({ url: signedData.signedUrl })
          }
        } catch (e) {
          // fall back to streaming the cached bytes if signed URL creation fails
          const arrayBuffer = await existingThumb.arrayBuffer()
          return new NextResponse(Buffer.from(arrayBuffer), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' } })
        }
      }
    } catch (e) {
      // ignore, will generate
    }

    let fetched
    if (srcRow.provider === 'GOOGLE_DRIVE') {
      const folderId = (config.folder_id as string) || 'root'
      const gd = await googleDriveList({ folderId, refreshToken: secrets.refresh_token })
      const accessToken = gd.accessToken
      fetched = await googleDriveDownload({ fileId, fileName: fileId, accessToken })
    } else if (srcRow.provider === 'ONEDRIVE') {
      const folderId = (config.folder_id as string) || 'root'
      const od = await oneDriveList({ folderId, refreshToken: secrets_refresh_token(secrets) })
      fetched = await oneDriveDownload({ fileId, fileName: fileId, accessToken: od.accessToken })
    } else {
      return NextResponse.json({ error: 'Provider not supported for preview' }, { status: 400 })
    }

    if (!fetched || !fetched.bytes) return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })

    const inputBuf = Buffer.from(fetched.bytes)
    const mime = fetched.mimeType || ''

    // Generate PNG thumbnail for images and PDFs; otherwise return original bytes
    let outBuf: Buffer | null = null
    try {
      if (mime.startsWith('image/')) {
        outBuf = await sharp(inputBuf).resize({ width: 800, height: 800, fit: 'inside' }).png().toBuffer()
      } else if (mime === 'application/pdf' || previewFileLooksLikePdf(fileId)) {
        // render first page of PDF
        outBuf = await sharp(inputBuf, { density: 150 }).resize({ width: 800, height: 800, fit: 'inside' }).png().toBuffer()
      }
    } catch (e) {
      console.error('Thumbnail generation failed', e)
      outBuf = null
    }

    if (outBuf) {
      // upload thumbnail to storage for caching and return signed URL (or stream if requested)
      try {
        await (service.storage.from('thumbnails') as any).upload(thumbPath, outBuf, { contentType: 'image/png', upsert: true })
        if (streamRequested) {
          return new NextResponse(outBuf as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000', 'Content-Disposition': 'inline' } })
        }
        const { data: signedData, error: signedErr } = await (service.storage.from('thumbnails') as any).createSignedUrl(thumbPath, 60)
        if (!signedErr && signedData?.signedUrl) {
          return NextResponse.json({ url: signedData.signedUrl })
        }
      } catch (e) {
        console.error('Failed to upload thumbnail', e)
      }
      // if signed URL creation failed, stream the thumbnail bytes as fallback
      return new NextResponse(outBuf as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000', 'Content-Disposition': 'inline' } })
    }

    // Always return a PNG thumbnail for preview (even for non-image files)
    let thumbBuf: Buffer | null = null
    try {
      thumbBuf = await sharp(inputBuf).resize({ width: 800, height: 800, fit: 'inside' }).png().toBuffer()
    } catch (e) {
      // If sharp fails (not an image/PDF), generate a placeholder PNG
      thumbBuf = await generatePlaceholderPng()
    }
    return new NextResponse(thumbBuf as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000', 'Content-Disposition': 'inline' } })
  // Generates a simple gray PNG placeholder (400x300)
  async function generatePlaceholderPng(): Promise<Buffer> {
    return await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 220, g: 220, b: 220 }
      }
    })
      .png()
      .toBuffer()
  }
  } catch (e: any) {
    console.error('Unhandled error in /api/external-sources/preview', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

function previewFileLooksLikePdf(id: string) {
  return id.toLowerCase().endsWith('.pdf')
}

function secrets_refresh_token(secrets: any) {
  return (secrets && (secrets.refresh_token || secrets.refreshToken)) || ''
}

function detectMimeFromBuffer(buf: Buffer | Uint8Array | ArrayBuffer | null): string | null {
  if (!buf) return null
  const b = Buffer.from(buf as any)
  if (b.length >= 4) {
    // PDF
    if (b.slice(0, 4).toString() === '%PDF') return 'application/pdf'
    // PNG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
    // JPEG
    if (b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9) return 'image/jpeg'
    // GIF
    if (b.slice(0, 3).toString() === 'GIF') return 'image/gif'
  }
  return null
}

function detectMimeFromFilename(name?: string | null): string | null {
  if (!name) return null
  const n = String(name).toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.txt')) return 'text/plain'
  return null
}
