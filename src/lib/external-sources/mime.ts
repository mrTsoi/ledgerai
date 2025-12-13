import path from 'path'

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return EXT_TO_MIME[ext] || 'application/octet-stream'
}
