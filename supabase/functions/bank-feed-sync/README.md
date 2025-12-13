Bank Feed Sync (Plaid)

This Supabase Edge Function syncs Plaid transactions for all ACTIVE connections.

Environment variables (Supabase secrets)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PLAID_CLIENT_ID
- PLAID_SECRET
- PLAID_ENV: sandbox | development | production
- BANK_FEED_CRON_SECRET (optional): if set, callers must send header x-ledgerai-cron-secret

Invoke
- POST /functions/v1/bank-feed-sync

Scheduling
- Use Supabase Scheduled Triggers to call this function on an interval.
- If you set BANK_FEED_CRON_SECRET, configure the trigger to include the header.
