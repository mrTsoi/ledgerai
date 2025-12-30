export type UploadKind = 'pdf' | 'jpeg' | 'png' | 'webp' | 'xls' | 'xlsx' | 'csv' | 'ico'

export type UploadValidationOk = {
  ok: true
  kind: UploadKind
  canonicalMime: string
  canonicalExt: string
  safeFileName: string
  size: number
}

export type UploadValidationError = {
  ok: false
  error: string
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50MB

const EXT_ALLOWLIST = new Set<UploadKind>(['pdf', 'jpeg', 'png', 'webp', 'xls', 'xlsx', 'csv', 'ico'])

const MIME_ALLOWLIST = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'text/plain',
])

function sanitizeFileName(name: string): string {
  // Keep display safe: remove slashes/control chars; keep simple ASCII.
  const base = String(name || '').split(/[/\\]/).pop() || 'upload'
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return cleaned.replace(/[^a-zA-Z0-9._()\- ]/g, '_') || 'upload'
}

function getLowerExt(filename: string): string {
  const base = String(filename || '')
  const m = base.match(/\.([A-Za-z0-9]{1,8})$/)
  return m ? m[1].toLowerCase() : ''
}

function bufStartsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false
  }
  return true
}

function sniffKind(bytes: Buffer): { kind: UploadKind; canonicalMime: string; canonicalExt: string } | null {
  // PDF: %PDF-
  if (bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-') {
    return { kind: 'pdf', canonicalMime: 'application/pdf', canonicalExt: 'pdf' }
  }

  // PNG signature
  if (bufStartsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'png', canonicalMime: 'image/png', canonicalExt: 'png' }
  }

  // JPEG signature
  if (bufStartsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: 'jpeg', canonicalMime: 'image/jpeg', canonicalExt: 'jpg' }
  }

  // WEBP: RIFF....WEBP
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return { kind: 'webp', canonicalMime: 'image/webp', canonicalExt: 'webp' }
  }

  // ICO: header 00 00 01 00 (or CUR 00 00 02 00)
  if (bufStartsWith(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return { kind: 'ico', canonicalMime: 'image/x-icon', canonicalExt: 'ico' }
  }

  // XLS (OLE CF)
  if (bufStartsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { kind: 'xls', canonicalMime: 'application/vnd.ms-excel', canonicalExt: 'xls' }
  }

  // ZIP container (xlsx and others). We'll only accept when the file extension is xlsx.
  if (bufStartsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || bufStartsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || bufStartsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    return { kind: 'xlsx', canonicalMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', canonicalExt: 'xlsx' }
  }

  // CSV heuristic: no NUL bytes and mostly printable.
  // (We do this last to avoid misclassifying binary files.)
  const sample = bytes.subarray(0, Math.min(bytes.length, 32 * 1024))
  let printable = 0
  for (const b of sample) {
    if (b === 0x00) return null
    if (b === 0x09 || b === 0x0a || b === 0x0d) {
      printable++
      continue
    }
    if (b >= 0x20 && b <= 0x7e) {
      printable++
      continue
    }
    // Allow UTF-8 bytes (best-effort)
    if (b >= 0x80) {
      printable++
      continue
    }
  }
  const ratio = sample.length ? printable / sample.length : 0
  if (ratio >= 0.95) {
    return { kind: 'csv', canonicalMime: 'text/csv', canonicalExt: 'csv' }
  }

  return null
}

export function validateUploadBytes(input: {
  filename: string
  contentType?: string | null
  bytes: ArrayBuffer | Uint8Array | Buffer
  maxBytes?: number
}): UploadValidationOk | UploadValidationError {
  const safeFileName = sanitizeFileName(input.filename)

  const buf = Buffer.isBuffer(input.bytes)
    ? input.bytes
    : input.bytes instanceof Uint8Array
      ? Buffer.from(input.bytes)
      : Buffer.from(input.bytes)

  const size = buf.byteLength
  const max = typeof input.maxBytes === 'number' ? input.maxBytes : MAX_UPLOAD_BYTES

  if (!size) return { ok: false, error: 'Empty file' }
  if (size > max) return { ok: false, error: `File too large (max ${(max / (1024 * 1024)).toFixed(0)}MB)` }

  const declared = (input.contentType || '').toLowerCase().trim()
  if (declared && !MIME_ALLOWLIST.has(declared)) {
    return { ok: false, error: 'File type not allowed' }
  }

  const ext = getLowerExt(safeFileName)
  if (ext && !EXT_ALLOWLIST.has(ext as UploadKind) && ext !== 'jpg' && ext !== 'jpeg') {
    return { ok: false, error: 'File extension not allowed' }
  }

  const sniffed = sniffKind(buf)
  if (!sniffed) return { ok: false, error: 'Unsupported or unrecognized file content' }

  // Extension/content coherence rules
  if (sniffed.kind === 'jpeg') {
    if (ext && ext !== 'jpg' && ext !== 'jpeg') return { ok: false, error: 'File extension does not match JPEG content' }
  } else if (sniffed.kind === 'xlsx') {
    if (ext && ext !== 'xlsx') return { ok: false, error: 'Only .xlsx is allowed for spreadsheet ZIP files' }
  } else if (sniffed.kind === 'csv') {
    if (ext && ext !== 'csv') return { ok: false, error: 'Only .csv is allowed for CSV uploads' }
  } else if (sniffed.kind === 'ico') {
    if (ext && ext !== 'ico') return { ok: false, error: 'File extension does not match ICO content' }
  } else {
    if (ext && ext !== sniffed.canonicalExt) return { ok: false, error: 'File extension does not match file content' }
  }

  // Declared mime coherence (best-effort; browsers sometimes send empty/incorrect values)
  if (declared) {
    const acceptable = new Set<string>([
      sniffed.canonicalMime,
      // Common browser variants
      sniffed.kind === 'jpeg' ? 'image/jpg' : '',
      sniffed.kind === 'ico' ? 'image/vnd.microsoft.icon' : '',
      sniffed.kind === 'csv' ? 'text/plain' : '',
      sniffed.kind === 'csv' ? 'application/csv' : '',
    ].filter(Boolean))

    if (!acceptable.has(declared)) {
      return { ok: false, error: 'Declared MIME type does not match file content' }
    }
  }

  return {
    ok: true,
    kind: sniffed.kind,
    canonicalMime: sniffed.canonicalMime,
    canonicalExt: sniffed.canonicalExt,
    safeFileName,
    size,
  }
}
