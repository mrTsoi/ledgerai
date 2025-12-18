import { Client } from 'basic-ftp'
import { minimatch } from 'minimatch'
import path from 'path'
import tls from 'tls'
import { guessMimeType } from './mime'
import type { ExternalFetchedFile, ExternalSourceConfig, ExternalSourceSecrets } from './types'
import { Writable } from 'stream'

type FtpsListItem = {
  name: string
  type: number
  size: number
  modifiedAt?: Date
}

export async function fetchFromFtps(config: ExternalSourceConfig, secrets: ExternalSourceSecrets) {
  const host = config.host
  const port = config.port || 21
  const remotePath = config.remote_path || '/'
  const fileGlob = config.file_glob || '**/*'

  if (!host) throw new Error('FTPS host is required')
  if (!secrets.username) throw new Error('FTPS username is required')

  const client = new Client(20_000)

  try {
    const secureOptions: tls.ConnectionOptions = {
      cert: secrets.client_cert_pem,
      key: secrets.client_key_pem,
      ca: secrets.ca_cert_pem,
    }

    await client.access({
      host,
      port,
      user: secrets.username,
      password: secrets.password,
      secure: true,
      secureOptions,
    })

    await client.cd(remotePath)
    const items = (await client.list()) as unknown as FtpsListItem[]

    const candidates = items
      .filter((i) => i.type === 0) // 0 = file
      .filter((i) => minimatch(i.name, fileGlob, { nocase: true }))
      .map((i) => {
        const fullPath = remotePath.endsWith('/') ? `${remotePath}${i.name}` : `${remotePath}/${i.name}`
        return {
          name: i.name,
          fullPath,
          size: i.size,
          modifiedAt: i.modifiedAt ? i.modifiedAt.toISOString() : null,
        }
      })

    return {
      list: candidates,
      download: async (remoteFilePath: string): Promise<ExternalFetchedFile> => {
        // basic-ftp can download to a Writable; easiest is to collect into a buffer.
        const chunks: Buffer[] = []
        const writable = new Writable({
          write(chunk: Buffer | string, _encoding, callback) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
            callback()
          },
        })

        await client.downloadTo(writable, remoteFilePath)

        const buf = Buffer.concat(chunks)
        const filename = path.posix.basename(remoteFilePath)
        return {
          identity: { remote_path: remoteFilePath },
          filename,
          mimeType: guessMimeType(filename),
          bytes: new Uint8Array(buf),
        }
      },
    }
  } finally {
    client.close()
  }
}
