-- ============================================================================
-- Super Admin Source of Truth: auth.users.is_super_admin
--
-- Goal:
--   Make SUPER_ADMIN checks depend on a dedicated flag in auth.users.
--   This aligns application authorization and RLS helper usage.
--
-- Notes:
--   - Adding a column to auth.users requires elevated privileges (available in migrations).
--   - We keep the function in public schema because it is referenced by many RLS policies.
-- ============================================================================

-- 2) Update helper function used by RLS and app authorization.
--    SECURITY DEFINER is required because auth.users is not directly readable by normal roles.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT COALESCE(
    (SELECT u.is_super_admin FROM auth.users u WHERE u.id = auth.uid()),
    false
  );
$$;

-- 3) Lock down execution to authenticated users.
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
