import type { ExternalFetchedFile } from './types'
import { guessMimeType } from './mime'

type GoogleTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token?: string
}

type GoogleDriveItem = {
  id: string
  name: string
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

  const json = await res.json() as unknown
  if (!res.ok) {
    const errMsg = (json as Record<string, unknown>)['error_description'] ?? (json as Record<string, unknown>)['error'] ?? 'Failed to refresh Google token'
    throw new Error(String(errMsg))
  }

  return json as unknown as GoogleTokenResponse
}

export async function googleDriveGetAccount(params: { refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url = new URL('https://www.googleapis.com/drive/v3/about')
  url.searchParams.set('fields', 'user(emailAddress,displayName)')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = await res.json() as unknown
  if (!res.ok) {
    const err = (json as Record<string, unknown>)['error'] as Record<string, unknown> | undefined
    throw new Error(String((err && err['message']) || 'Failed to get Google Drive account'))
  }

  const user = (json as Record<string, unknown>)['user'] as Record<string, unknown> | undefined
  return {
    email: (user && (user['emailAddress'] as string)) || null,
    displayName: (user && (user['displayName'] as string)) || null,
  }
}

export async function googleDriveGetItemName(params: { fileId: string; refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url = new URL(`https://www.googleapis.com/drive/v3/files/${params.fileId}`)
  url.searchParams.set('fields', 'name')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = await res.json() as unknown
  if (!res.ok) {
    const err = (json as Record<string, unknown>)['error'] as Record<string, unknown> | undefined
    throw new Error(String((err && err['message']) || 'Failed to resolve Google Drive item'))
  }

  return (json as Record<string, unknown>)['name'] as string | undefined || null
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
  url.searchParams.set('spaces', 'drive')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  url.searchParams.set('corpora', 'allDrives')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = await res.json() as unknown
  if (!res.ok) {
    const err = (json as Record<string, unknown>)['error'] as Record<string, unknown> | undefined
    throw new Error(String((err && err['message']) || 'Failed to list Google Drive files'))
  }

  const filesArr = ((json as Record<string, unknown>)['files'] as unknown[]) || []
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    files: filesArr.map((f) => {
      const fr = f as Record<string, unknown>
      return {
        id: String(fr['id'] ?? ''),
        name: String(fr['name'] ?? ''),
        mimeType: String(fr['mimeType'] ?? ''),
        modifiedTime: fr['modifiedTime'] ? String(fr['modifiedTime']) : undefined,
        size: fr['size'] ? Number(fr['size']) : undefined,
        md5Checksum: fr['md5Checksum'] ? String(fr['md5Checksum']) : undefined,
      }
    }),
  }
}

export async function googleDriveListFolders(params: {
  parentId: string
  refreshToken: string
}) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  // Support showing Shared Drives as pseudo-folders at the top level.
  // - parentId === 'root' => list My Drive root folders + shared drives.
  // - parentId === 'drive:<driveId>' => list folders at the root of that Shared Drive.
  let driveId: string | null = null
  let parentId = params.parentId
  if (parentId.startsWith('drive:')) {
    driveId = parentId.slice('drive:'.length) || null
    parentId = 'root'
  }

  async function listSharedDrives(): Promise<GoogleDriveItem[]> {
    const url = new URL('https://www.googleapis.com/drive/v3/drives')
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('fields', 'drives(id,name)')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })

    const json = await res.json() as unknown
    if (!res.ok) {
      // If the account has no Shared Drives, Google may still return ok with empty list.
      // If it errors (e.g., not supported), treat as none.
      return []
    }

    const drivesArr = ((json as Record<string, unknown>)['drives'] as unknown[]) || []
    return drivesArr.map((d) => {
      const dr = d as Record<string, unknown>
      return {
        id: `drive:${String(dr['id'] ?? '')}`,
        name: `[Shared Drive] ${String(dr['name'] ?? '')}`,
      }
    })
  }

  const q = [
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')

  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', q)
  url.searchParams.set('pageSize', '200')
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('spaces', 'drive')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')

  // Root browsing is different:
  // - For My Drive root, use corpora=user (more reliable than allDrives + root).
  // - For Shared Drive root, use corpora=drive + driveId.
  if (driveId) {
    url.searchParams.set('corpora', 'drive')
    url.searchParams.set('driveId', driveId)
  } else if (parentId === 'root') {
    url.searchParams.set('corpora', 'user')
  } else {
    url.searchParams.set('corpora', 'allDrives')
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = await res.json() as unknown
  if (!res.ok) {
    throw new Error('Failed to list Google Drive folders')
  }

  const foldersArr = ((json as Record<string, unknown>)['files'] as unknown[]) || []
  const driveEntries = parentId === 'root' && !driveId ? await listSharedDrives() : []

  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    folders: [
      ...driveEntries,
      ...foldersArr.map((f) => {
        const fr = f as Record<string, unknown>
        return {
          id: String(fr['id'] ?? ''),
          name: String(fr['name'] ?? ''),
        }
      }),
    ],
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
