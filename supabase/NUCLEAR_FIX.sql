-- ============================================================================
-- NUCLEAR OPTION: Reset RLS completely for memberships and tenants
-- This script will:
-- 1. Disable RLS temporarily
-- 2. Delete ALL policies on these tables (regardless of name)
-- 3. Re-create helper functions
-- 4. Re-enable RLS with minimal non-recursive policies
-- ============================================================================

BEGIN;

-- 1. Disable RLS to stop the recursion immediately
ALTER TABLE public.memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL policies dynamically
DO $$ 
DECLARE 
  pol record;
BEGIN 
  -- Drop all policies on memberships
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'memberships' AND schemaname = 'public'
  LOOP 
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.memberships', pol.policyname); 
  END LOOP; 
  
  -- Drop all policies on tenants
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tenants' AND schemaname = 'public'
  LOOP 
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenants', pol.policyname); 
  END LOOP; 
END $$;

-- 3. Ensure columns exist
ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- 4. Re-create Helper Functions (SECURITY DEFINER is key)
DROP FUNCTION IF EXISTS public.user_has_role(text[]);
DROP FUNCTION IF EXISTS public.get_user_tenant_ids();

CREATE OR REPLACE FUNCTION public.user_has_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS TABLE(tenant_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT m.tenant_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.user_has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids TO authenticated;

-- 5. Re-enable RLS
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 6. Create Minimal Policies (No Recursion)

-- Memberships: Users can only see their own rows
CREATE POLICY "allow_read_own_memberships"
  ON public.memberships FOR SELECT
  USING (user_id = auth.uid());

-- Tenants: Users can see tenants they belong to (via helper function)
CREATE POLICY "allow_read_own_tenants"
  ON public.tenants FOR SELECT
  USING (
    id IN (SELECT public.get_user_tenant_ids())
  );

-- Super Admin Policies (using helper function)
CREATE POLICY "allow_super_admin_all_tenants"
  ON public.tenants FOR ALL
  USING (public.user_has_role(ARRAY['SUPER_ADMIN']));

CREATE POLICY "allow_super_admin_all_memberships"
  ON public.memberships FOR ALL
  USING (public.user_has_role(ARRAY['SUPER_ADMIN']));

COMMIT;

-- Verification
SELECT count(*) as policy_count FROM pg_policies WHERE tablename IN ('tenants', 'memberships');
