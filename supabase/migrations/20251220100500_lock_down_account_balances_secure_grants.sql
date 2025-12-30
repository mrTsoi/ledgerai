-- ============================================================================
-- Lock down account_balances_secure grants
--
-- Supabase UI can show views as "unrestricted" because RLS does not apply to
-- (materialized) views. Access must be controlled via GRANT/REVOKE.
--
-- This migration ensures the secure view is NOT readable by anon/PUBLIC.
-- ============================================================================

-- Make sure no implicit PUBLIC/anon privileges exist.
REVOKE ALL ON TABLE public.account_balances_secure FROM PUBLIC;
REVOKE ALL ON TABLE public.account_balances_secure FROM anon;

-- Authenticated users may read (filtered by the view definition).
GRANT SELECT ON TABLE public.account_balances_secure TO authenticated;

-- Service role can read for internal/admin operations.
GRANT SELECT ON TABLE public.account_balances_secure TO service_role;
