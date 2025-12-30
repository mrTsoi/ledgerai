import { minimatch } from 'minimatch'
import { guessMimeType } from './mime'
import type { ExternalFetchedFile, ExternalSourceConfig, ExternalSourceSecrets } from './types'

type SftpListItem = {
  type: string
  name: string
  size: number
  modifyTime: number
}

export async function fetchFromSftp(config: ExternalSourceConfig, secrets: ExternalSourceSecrets) {
  const host = config.host
  const port = config.port || 22
  const remotePath = config.remote_path || '/'
  const fileGlob = config.file_glob || '**/*'

  if (!host) throw new Error('SFTP host is required')
  if (!secrets.username) throw new Error('SFTP username is required')

  const sftpModule: any = await import('ssh2-sftp-client')
  const SftpClient = sftpModule && (sftpModule.default ?? sftpModule)
  const sftp = new SftpClient()

  try {
    await sftp.connect({
      host,
      port,
      username: secrets.username,
      password: secrets.password || undefined,
      privateKey: secrets.private_key_pem || undefined,
      passphrase: secrets.passphrase || undefined,
      hostHash: secrets.host_key ? 'sha256' : undefined,
      hostVerifier: secrets.host_key
        ? (hashedKey: string) => hashedKey === secrets.host_key
        : undefined,
      readyTimeout: 20_000,
    })

    const items = (await sftp.list(remotePath)) as unknown as SftpListItem[]

    const candidates = items
      .filter((i) => i.type === '-' || i.type === 'file')
      .map((i) => {
        const fullPath = remotePath.endsWith('/')
          ? `${remotePath}${i.name}`
          : `${remotePath}/${i.name}`

        return {
          name: i.name,
          fullPath,
          size: i.size,
          modifiedAt: new Date(i.modifyTime).toISOString(),
        }
      })
      .filter((i) => minimatch(i.name, fileGlob, { nocase: true }))

    // Return lazy list; caller decides dedupe/which to download.
    return {
      list: candidates,
      download: async (remoteFilePath: string): Promise<ExternalFetchedFile> => {
        const buf = (await sftp.get(remoteFilePath)) as Buffer
        const pathMod: any = await import('path')
        const filename = pathMod.posix.basename(remoteFilePath)
        return {
          identity: {
            remote_path: remoteFilePath,
          },
          filename,
          mimeType: guessMimeType(filename),
          bytes: new Uint8Array(buf),
        }
      },
    }
  } finally {
    try {
      await sftp.end()
    } catch {
      // ignore
    }
  }
}
