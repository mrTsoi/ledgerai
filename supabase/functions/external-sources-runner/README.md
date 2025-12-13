External Sources Runner

This Supabase Edge Function is intended to be invoked by a Supabase Scheduled Trigger.
It calls your Next.js app endpoint `POST /api/external-sources/run` (which imports any due external sources).

Supabase secrets (Edge Function env vars)
- LEDGERAI_APP_URL (or APP_URL): Base URL of your deployed Next.js app, e.g. https://ledgerai.example.com
- EXTERNAL_FETCH_CRON_SECRET (optional): Global cron secret, must match the Next.js app env var of the same name
- EXTERNAL_SOURCES_CRON_SECRET (optional): If set, callers must send header `x-ledgerai-runner-secret`

Per-tenant cron keys
- If you want per-tenant cron auth stored in the app database, generate a tenant cron secret in the UI (External Sources settings).
- Configure the scheduled call to send:
  - header: `x-ledgerai-cron-secret: <tenant cron secret>`
  - JSON body containing: `{ "tenant_id": "<tenant_uuid>" }`

Invoke
- POST /functions/v1/external-sources-runner

Scheduling
- In Supabase Dashboard → Edge Functions → external-sources-runner → Scheduled Triggers
- Recommended: every 5 minutes
- If you set EXTERNAL_SOURCES_CRON_SECRET, configure the trigger to include header:
  - x-ledgerai-runner-secret: <your secret>
