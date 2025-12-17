import crypto from 'crypto'

const VERSION = 'v1'

function getKey(): Buffer {
  const raw = process.env.DB_ENCRYPTION_KEY || ''
  if (!raw) throw new Error('DB_ENCRYPTION_KEY is not set')

  // Support base64 (recommended) or hex.
  const trimmed = raw.trim()
  let key: Buffer
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex')
  } else {
    key = Buffer.from(trimmed, 'base64')
  }

  if (key.length !== 32) throw new Error('DB_ENCRYPTION_KEY must be 32 bytes (base64 or hex)')
  return key
}

export function canEncryptAtRest(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptSecret(payload: string): string {
  const key = getKey()
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported secret payload format')

  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ciphertext = Buffer.from(parts[3], 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
