import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const params = url.searchParams
    const originTop = (process.env.NEXT_PUBLIC_SITE_URL as string) || url.origin

    const payload: any = {
      type: params.get('type') || 'external_oauth',
      ok: params.get('ok') === '1',
    }
    const sourceId = params.get('source_id')
    if (sourceId) payload.source_id = sourceId
    const error = params.get('error')
    if (error) payload.error = error
    const hint = params.get('hint')
    if (hint) payload.hint = hint

    const returnTo = params.get('return_to') || '/en/dashboard/settings?tab=external-sources'

    const html = `<!doctype html><meta charset="utf-8"><title>OAuth Relay</title>
    <script>
      try {
        const payload = ${JSON.stringify(payload)}
        // Fallback: write a storage key so same-origin opener can detect via "storage" event
        try {
          if (payload && payload.source_id) {
            try { localStorage.setItem('external_oauth_' + payload.source_id, JSON.stringify(payload)) } catch(e) {}
          }
        } catch(e) {}
        if (window.opener) {
          try { window.opener.postMessage(payload, ${JSON.stringify(originTop)}); } catch(e) {}
        }
      } catch(e) {}
      try { window.location.href = ${JSON.stringify(returnTo)} } catch(e) {}
      setTimeout(()=>{ try{ window.close() }catch(e){} }, 600);
    </script>
    <body>${payload.ok ? 'Connected' : 'OAuth result'}</body>`

    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (e: any) {
    console.error('Unhandled error in /oauth/relay', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
