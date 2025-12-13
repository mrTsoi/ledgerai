import crypto from 'crypto'

type Payload = {
  source_id: string
  user_id: string
  ts: number
  return_to?: string
}

function getSecret() {
  const secret = process.env.EXTERNAL_OAUTH_STATE_SECRET
  if (!secret) throw new Error('EXTERNAL_OAUTH_STATE_SECRET is not set')
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
