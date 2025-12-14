import crypto from 'crypto'

type Payload = {
  source_id: string
  user_id: string
  ts: number
  return_to?: string
}

function getSecret() {
  // Prefer a dedicated secret for OAuth state signing.
  // Fall back to common app-level secrets if present.
  const secret =
    process.env.EXTERNAL_OAUTH_STATE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error(
      'OAuth state signing is not configured. Set EXTERNAL_OAUTH_STATE_SECRET (recommended), or provide AUTH_SECRET / NEXTAUTH_SECRET.'
    )
  }

  // Avoid trivially short secrets.
  if (secret.length < 32) {
    throw new Error('OAuth state signing secret is too short. Use at least 32 characters.')
  }

  return secret
}

export function signOAuthState(payload: Payload) {
  const json = JSON.stringify(payload)
  const data = Buffer.from(json).toString('base64url')
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url')
  return `${data}.${sig}`
}

export function verifyOAuthState(state: string): Payload {
  const [data, sig] = state.split('.')
  if (!data || !sig) throw new Error('Invalid state')

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url')

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid state signature')
  }

  const json = Buffer.from(data, 'base64url').toString('utf8')
  const payload = JSON.parse(json) as Payload

  if (!payload?.source_id || !payload?.user_id || !payload?.ts) {
    throw new Error('Invalid state payload')
  }

  if (payload.return_to && typeof payload.return_to !== 'string') {
    throw new Error('Invalid return_to')
  }

  // 15 min expiry
  if (Date.now() - payload.ts > 15 * 60 * 1000) {
    throw new Error('State expired')
  }

  return payload
}
