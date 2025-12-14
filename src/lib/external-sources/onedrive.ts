import type { ExternalFetchedFile } from './types'
import { guessMimeType } from './mime'

type MicrosoftTokenResponse = {
  token_type: string
  scope?: string
  expires_in: number
  access_token: string
  refresh_token?: string
}

async function refreshAccessToken(params: { refreshToken: string }) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth is not configured')
  }

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      scope: 'offline_access Files.Read User.Read',
    }),
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'Failed to refresh Microsoft token')
  }

  return json as MicrosoftTokenResponse
}

export async function oneDriveGetAccount(params: { refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url = new URL('https://graph.microsoft.com/v1.0/me')
  url.searchParams.set('$select', 'displayName,mail,userPrincipalName')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to get OneDrive account')
  }

  return {
    email: (json?.mail as string | undefined) || (json?.userPrincipalName as string | undefined) || null,
    displayName: (json?.displayName as string | undefined) || null,
  }
}

export async function oneDriveGetItemName(params: { itemId: string; refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${params.itemId}`)
  url.searchParams.set('$select', 'name')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to resolve OneDrive item')
  }

  return (json?.name as string | undefined) || null
}

export async function oneDriveList(params: { folderId: string; refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url =
    params.folderId === 'root'
      ? new URL('https://graph.microsoft.com/v1.0/me/drive/root/children')
      : new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${params.folderId}/children`)
  url.searchParams.set('$select', 'id,name,size,file,folder,lastModifiedDateTime,@microsoft.graph.downloadUrl')
  url.searchParams.set('$top', '200')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to list OneDrive files')
  }

  const items = (json.value || []) as any[]
  const files = items
    .filter((i) => !!i.file)
    .map((i) => ({
      id: i.id as string,
      name: i.name as string,
      size: typeof i.size === 'number' ? i.size : undefined,
      modifiedTime: i.lastModifiedDateTime as string | undefined,
      downloadUrl: i['@microsoft.graph.downloadUrl'] as string | undefined,
    }))

  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    refreshToken: token.refresh_token,
    files,
  }
}

export async function oneDriveListFolders(params: { parentId: string; refreshToken: string }) {
  const token = await refreshAccessToken({ refreshToken: params.refreshToken })

  const url =
    params.parentId === 'root'
      ? new URL('https://graph.microsoft.com/v1.0/me/drive/root/children')
      : new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${params.parentId}/children`)
  url.searchParams.set('$select', 'id,name,folder')
  url.searchParams.set('$top', '200')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const json = (await res.json()) as any
  if (!res.ok) {
    throw new Error(json?.error?.message || 'Failed to list OneDrive folders')
  }

  const items = (json.value || []) as any[]
  const folders = items
    .filter((i) => !!i.folder)
    .map((i) => ({
      id: i.id as string,
      name: i.name as string,
    }))

  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    refreshToken: token.refresh_token,
    folders,
  }
}

export async function oneDriveDownload(params: {
  fileId: string
  fileName: string
  accessToken: string
}): Promise<ExternalFetchedFile> {
  // Prefer Graph content endpoint (works without @microsoft.graph.downloadUrl)
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${params.fileId}/content`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    redirect: 'follow',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Failed to download OneDrive file')
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
