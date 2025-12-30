import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateUploadBytes } from '@/lib/uploads/validate-upload'

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('file') as unknown as File | null
    const assetType = String(form.get('assetType') || 'asset')

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const name = (file as any).name || 'upload'

    // Debugging: log received file shape when running locally to assist diagnosis
    try {
      // eslint-disable-next-line no-console
      console.log('upload-asset received file:', {
        constructor: file && (file as any).constructor ? (file as any).constructor.name : null,
        keys: file && typeof file === 'object' ? Object.keys(file) : null,
        hasArrayBuffer: file && typeof (file as any).arrayBuffer === 'function',
        hasStreamFn: file && typeof (file as any).stream === 'function',
        hasStreamProp: file && !!(file as any).stream,
        hasReadable: file && !!(file as any).readable,
      })
    } catch (e) {
      // ignore
    }

    // Normalize the incoming file to a Buffer. The incoming "file" can be a
    // browser File (has arrayBuffer), a Node Buffer, a stream-like object
    // (has stream() or .stream), or an object with `.buffer` (multer/busboy).
    async function fileToBuffer(f: any): Promise<Buffer> {
      if (!f) throw new Error('No file provided')

      // Browser File / Blob
      if (typeof f.arrayBuffer === 'function') {
        const ab = await f.arrayBuffer()
        return Buffer.from(ab)
      }

      // Node Buffer
      if (Buffer.isBuffer(f)) return f

      // Some libraries attach raw buffer on `.buffer`
      if (f.buffer && (f.buffer instanceof ArrayBuffer || Buffer.isBuffer(f.buffer))) {
        return Buffer.isBuffer(f.buffer) ? f.buffer : Buffer.from(f.buffer)
      }

      // If object exposes a readable stream (e.g. fetch-blob polyfills), read it
      const stream = typeof f.stream === 'function' ? f.stream() : f.stream
      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        const chunks: Buffer[] = []
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk))
        }
        return Buffer.concat(chunks)
      }

      // Handle web ReadableStream (has getReader)
      if (stream && typeof (stream as any).getReader === 'function') {
        const reader = (stream as any).getReader()
        const chunks: Buffer[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(Buffer.from(value))
        }
        return Buffer.concat(chunks)
      }

      // If file has `readable` stream (old-style Node Readable).
      if (f.readable && typeof f.on === 'function') {
        // Prefer async iterator if available
        if (typeof f[Symbol.asyncIterator] === 'function') {
          const chunks: Buffer[] = []
          for await (const chunk of f) chunks.push(Buffer.from(chunk))
          return Buffer.concat(chunks)
        }

        // Fallback to event-driven consumption for older stream implementations
        await new Promise<void>((resolve, reject) => {
          const chunks: Buffer[] = []
          f.on('data', (c: any) => chunks.push(Buffer.from(c)))
          f.on('end', () => {
            try {
              // attach result to function closure by returning via resolve
              ;(f as any).__collected = Buffer.concat(chunks)
              resolve()
            } catch (err) {
              reject(err)
            }
          })
          f.on('error', reject)
        })

        if ((f as any).__collected) return (f as any).__collected as Buffer
      }

      throw new Error('Unsupported file object')
    }

    const buf = await fileToBuffer(file as any)

    const validation = validateUploadBytes({ filename: name, contentType: (file as any).type || null, bytes: buf, maxBytes: 5 * 1024 * 1024 })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error, declaredType: (file as any).type || null, size: buf.length }, { status: 400 })
    }
    // Use a service client for storage operations to bypass RLS
    const supabase = createServiceClient()

    // Ensure file path includes canonical extension so storage/preview works reliably
    const baseSafe = validation.safeFileName.replace(/\.[^.]+$/, '')
    const filenameWithExt = `${Date.now()}-${baseSafe}.${validation.canonicalExt}`
    const filePath = `platform/${assetType}/${filenameWithExt}`

    // Upload bytes
    const uploadRes: any = await supabase.storage
      .from('assets')
      .upload(filePath, buf, {
        contentType: validation.canonicalMime,
        upsert: true,
      })

    if (uploadRes.error) {
      // include details to aid debugging
      return NextResponse.json({ error: uploadRes.error.message || 'Upload failed', details: uploadRes.error }, { status: 500 })
    }

    const pubRes: any = await supabase.storage.from('assets').getPublicUrl(filePath)
    if (pubRes.error) {
      return NextResponse.json({ error: 'Uploaded but failed to get public URL', details: pubRes.error }, { status: 500 })
    }

    return NextResponse.json({ publicUrl: pubRes.data.publicUrl, path: filePath })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || 'Upload failed'), stack: e?.stack }, { status: 500 })
  }
}
