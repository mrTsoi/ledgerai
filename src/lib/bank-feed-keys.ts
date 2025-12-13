import crypto from 'crypto'

export function generateTenantWebhookKey() {
  const raw = crypto.randomBytes(32).toString('hex')
  const key = `bfk_${raw}`
  const prefix = key.slice(0, 12)
  return { key, prefix }
}

export function hashTenantWebhookKey(key: string) {
  const pepper = process.env.BANK_FEED_KEY_PEPPER
  if (!pepper) {
    throw new Error('BANK_FEED_KEY_PEPPER is not set')
  }

  return crypto
    .createHash('sha256')
    .update(`${pepper}:${key}`)
    .digest('hex')
}

export function timingSafeEqualHex(a: string, b: string) {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}
