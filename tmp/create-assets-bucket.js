#!/usr/bin/env node
// Create the `assets` bucket in the Supabase project using the service role key.
// Load .env.local if present (dotenv is a dev dependency in this repo)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // ignore if dotenv not available
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing environment variables. Please ensure .env.local contains:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const endpoint = url.replace(/\/?$/, '') + '/storage/v1/bucket'

;(async () => {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ name: 'assets', public: true })
    })

    const text = await res.text()
    console.log('Status:', res.status)
    console.log('Response:', text)
    if (res.ok) process.exit(0)
    process.exit(1)
  } catch (e) {
    console.error('Request failed:', e)
    process.exit(1)
  }
})()
