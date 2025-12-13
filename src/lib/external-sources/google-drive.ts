import type { ExternalFetchedFile } from './types'
import { guessMimeType } from './mime'

type GoogleTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token?: string
}

async function refreshAccessToken(params: {
  refreshToken: string
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
    }),
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Failed to refresh Google token')
  }

  return json as GoogleTokenResponse
}

export async function googleDriveList(params: {
  folderId: string
  refreshToken: string
}) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const q = `'${params.folderId}' in parents and trashed = false`

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('pageSize', '200')
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size,md5Checksum)')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to list Google Drive files')
  }

  const files = (json.files || []) as any[]
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    files: files.map((f) => ({
      id: f.id as string,
      name: f.name as string,
      mimeType: f.mimeType as string,
      modifiedTime: f.modifiedTime as string | undefined,
      size: f.size ? Number(f.size) : undefined,
      md5Checksum: f.md5Checksum as string | undefined,
    })),
  }
}

export async function googleDriveListFolders(params: {
  parentId: string
  refreshToken: string
}) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const q = [
    `'${params.parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('pageSize', '200')
  url.searchParams.set('fields', 'files(id,name)')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to list Google Drive folders')
  }

  const folders = (json.files || []) as any[]
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    folders: folders.map((f) => ({
      id: f.id as string,
      name: f.name as string,
    })),
  }
}

export async function googleDriveDownload(params: {
  fileId: string
  fileName: string
  accessToken: string
}): Promise<ExternalFetchedFile> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${params.fileId}`)
  url.searchParams.set('alt', 'media')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Failed to download Google Drive file')
  }

  const arrayBuffer = await res.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  return {
    identity: { remote_id: params.fileId },
    filename: params.fileName,
    mimeType: guessMimeType(params.fileName),
    bytes,
  }
}
