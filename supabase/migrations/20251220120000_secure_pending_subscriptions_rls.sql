-- Secure pending_subscriptions (contains emails + tokens)
--
-- Goals:
--  - Remove "unrestricted" access by enabling RLS.
--  - Allow authenticated users to read only their own pending rows (by email claim).
--  - Allow SUPER_ADMIN to read all rows.
--  - Keep write paths server-side via service_role (no client writes).

ALTER TABLE IF EXISTS public.pending_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pending_subscriptions FORCE ROW LEVEL SECURITY;

-- Defense in depth: remove anonymous/public table grants.
REVOKE ALL ON TABLE public.pending_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.pending_subscriptions FROM anon;

-- Authenticated can SELECT (RLS still applies). No client-side writes.
GRANT SELECT ON TABLE public.pending_subscriptions TO authenticated;

-- Service role is used by server routes/webhooks to insert/update/consume.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_subscriptions TO service_role;

DROP POLICY IF EXISTS "pending_subscriptions_select_self" ON public.pending_subscriptions;
CREATE POLICY "pending_subscriptions_select_self"
ON public.pending_subscriptions
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR lower(email) = lower((auth.jwt() ->> 'email'))
);

DROP POLICY IF EXISTS "pending_subscriptions_update_super" ON public.pending_subscriptions;
CREATE POLICY "pending_subscriptions_update_super"
ON public.pending_subscriptions
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "pending_subscriptions_delete_super" ON public.pending_subscriptions;
CREATE POLICY "pending_subscriptions_delete_super"
ON public.pending_subscriptions
FOR DELETE
TO authenticated
USING (public.is_super_admin());
