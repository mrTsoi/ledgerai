import crypto from 'crypto'

export function generateExternalSourcesCronKey() {
  const raw = crypto.randomBytes(32).toString('hex')
  const key = `esc_${raw}`
  const prefix = key.slice(0, 12)
  return { key, prefix }
}

function getPepper() {
  const pepper = process.env.EXTERNAL_SOURCES_CRON_KEY_PEPPER
  if (!pepper) {
    throw new Error('EXTERNAL_SOURCES_CRON_KEY_PEPPER is not set')
  }
  return pepper
}

export function hashExternalSourcesCronKey(key: string) {
  return crypto
    .createHash('sha256')
    .update(`${getPepper()}:${key}`)
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
