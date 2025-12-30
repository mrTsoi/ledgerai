Provisioning a disposable Supabase test instance

This document explains how to provision a temporary Supabase project for running the integration Playwright tests.

Prerequisites
- A Supabase account and an organization you can create projects in.
- `supabase` CLI installed (https://supabase.com/docs/guides/cli)
- A Stripe test account (https://dashboard.stripe.com/test) with a test price ID to use.

Recommended workflow
1. Create a temporary Supabase project (manual via dashboard or CLI):

   # Using the Supabase CLI (requires SUPABASE_ACCESS_TOKEN and ORG flag)
   supabase projects create --name my-e2e-test-$(date +%s) --org-ref <ORG_REF>

   # The CLI will return project metadata including API URL and keys.

2. Retrieve the REST URL and a service role key for the project (available in Project Settings -> API).

3. Seed the database schema used by the app. You can run the SQL migrations found in `supabase/migrations`:

   supabase db remote set <YOUR_DB_URL>
   supabase db reset # CAREFUL: ensure this is the test DB
   psql <DATABASE_URL> -f supabase/migrations/20240101000000_initial_schema.sql
   # and subsequent migrations in order

4. Create Stripe test data:
   - Create a price/product and copy the Price ID (e.g. `price_test`)
   - Note your Stripe test secret key and webhook signing secret

5. Add GitHub repository secrets (Repository Settings -> Secrets):
   - `STRIPE_SECRET_KEY` = sk_test_...
   - `STRIPE_WEBHOOK_SECRET` = whsec_...
   - `STRIPE_TEST_PRICE_ID` = price_...
   - `SUPABASE_URL` = https://<project>.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY` = <service_role_key>

6. Run the Playwright job in CI. The workflow will use these secrets to run the integration test.

Cleanup
- Delete the Supabase project via the Supabase dashboard or CLI when finished.
- Revoke any test Stripe objects if needed.

Notes
- The integration test will insert rows into the test DB. The test now attempts to clean up created Stripe objects and DB rows, but validate the cleanup in your environment.
- If you prefer not to use a live Supabase/Stripe, consider running stripe-mock and a local Postgres instance instead.