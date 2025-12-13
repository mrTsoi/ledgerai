// Supabase Edge Function: external-sources-runner
// Invoked on a schedule; calls the app's /api/external-sources/run endpoint using a shared secret.

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Optional shared secret for scheduled trigger invocations
  const expected = Deno.env.get('EXTERNAL_SOURCES_CRON_SECRET')
  if (expected) {
    const provided = req.headers.get('x-ledgerai-runner-secret')
    if (!provided || provided !== expected) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const appUrlRaw = Deno.env.get('LEDGERAI_APP_URL') || Deno.env.get('APP_URL')
  if (!appUrlRaw) {
    return new Response('Missing LEDGERAI_APP_URL (or APP_URL)', { status: 500 })
  }

  const appUrl = appUrlRaw.endsWith('/') ? appUrlRaw.slice(0, -1) : appUrlRaw

  const cronSecret = Deno.env.get('EXTERNAL_FETCH_CRON_SECRET')

  const res = await fetch(`${appUrl}/api/external-sources/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { 'x-ledgerai-cron-secret': cronSecret } : {}),
    },
    body: '{}',
  })

  const contentType = res.headers.get('content-type') || 'application/json'
  const text = await res.text().catch(() => '')

  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': contentType },
  })
})
