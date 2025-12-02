-- ============================================================================
-- EMERGENCY FIX: Add is_active column and fix recursive RLS policies
-- Copy and paste this entire script into Supabase SQL Editor and run it
-- ============================================================================

-- Add is_active to memberships table
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- Add is_active to tenants table  
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- Update existing rows to have is_active = true
UPDATE memberships SET is_active = true WHERE is_active IS NULL;
UPDATE tenants SET is_active = true WHERE is_active IS NULL;

-- ============================================================================
-- FIX RECURSIVE RLS POLICIES
-- ============================================================================

-- Drop all existing RLS policies on memberships
DROP POLICY IF EXISTS "Users can view their own memberships" ON memberships;
DROP POLICY IF EXISTS "Company admins can view memberships in their tenant" ON memberships;
DROP POLICY IF EXISTS "Company admins can manage memberships" ON memberships;
DROP POLICY IF EXISTS "Super admins can manage all memberships" ON memberships;
DROP POLICY IF EXISTS "Super admins can view all memberships" ON memberships;
DROP POLICY IF EXISTS "Super admins can insert memberships" ON memberships;
DROP POLICY IF EXISTS "Super admins can update memberships" ON memberships;
DROP POLICY IF EXISTS "Super admins can delete memberships" ON memberships;

-- Temporarily disable RLS to create helper function
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;

-- Create a security definer function to check user role (breaks recursion)
CREATE OR REPLACE FUNCTION public.user_has_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the user's role from any membership (using security definer to bypass RLS)
  SELECT role INTO user_role
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  -- Check if user's role is in the required roles array
  RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION public.user_has_role TO authenticated;

-- Re-enable RLS on memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies for memberships using the helper function
CREATE POLICY "Users can view their own memberships"
  ON memberships FOR SELECT
  USING (user_id = auth.uid());

-- NO OTHER POLICIES ON MEMBERSHIPS - keep it simple to avoid recursion

-- ============================================================================
-- FIX TENANTS RLS POLICIES (remove is_active from recursive check)
-- ============================================================================

-- Drop problematic tenant policies
DROP POLICY IF EXISTS "Users can view their tenants" ON tenants;
DROP POLICY IF EXISTS "Super admins can view all tenants" ON tenants;
DROP POLICY IF EXISTS "Super admins can insert tenants" ON tenants;
DROP POLICY IF EXISTS "Super admins can update all tenants" ON tenants;
DROP POLICY IF EXISTS "Company admins can update their tenants" ON tenants;
DROP POLICY IF EXISTS "Admins can update tenants" ON tenants;

-- Temporarily disable RLS on tenants to avoid recursion during policy creation
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

-- Create helper function to get user's tenant IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS TABLE(tenant_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT m.tenant_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to all authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids TO authenticated;

-- Recreate tenant policies using helper functions only (NO direct table queries)
CREATE POLICY "Users can view their tenants"
  ON tenants FOR SELECT
  USING (
    id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Super admins can insert tenants"
  ON tenants FOR INSERT
  WITH CHECK (public.user_has_role(ARRAY['SUPER_ADMIN']));

CREATE POLICY "Admins can update tenants"
  ON tenants FOR UPDATE
  USING (
    id IN (SELECT get_user_tenant_ids())
  );

-- Re-enable RLS on tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Verify the fix worked
SELECT 
  table_name, 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('tenants', 'memberships') 
  AND column_name = 'is_active'
ORDER BY table_name;

-- Show your memberships to verify data is accessible
SELECT id, user_id, tenant_id, role, is_active, created_at 
FROM memberships 
LIMIT 5;
