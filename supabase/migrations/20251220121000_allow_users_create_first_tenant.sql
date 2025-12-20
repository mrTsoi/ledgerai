-- Allow regular authenticated users to create their first tenant/company safely.
--
-- Problem:
-- - `tenants` INSERT is restricted to SUPER_ADMIN only.
-- - New users therefore hit: "new row violates row-level security policy for table tenants".
--
-- Fix:
-- - Allow authenticated users to INSERT a tenant only when they set `owner_id = auth.uid()`.
-- - Allow tenant owners to SELECT their tenants by `owner_id` (important for INSERT ... RETURNING).
-- - Allow tenant owners to INSERT their own initial membership (COMPANY_ADMIN) for their tenant.

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant owners can view their tenants" ON tenants;
CREATE POLICY "Tenant owners can view their tenants" ON tenants
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create their own tenants" ON tenants;
CREATE POLICY "Users can create their own tenants" ON tenants
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant owners can create initial membership" ON memberships;
CREATE POLICY "Tenant owners can create initial membership" ON memberships
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND role = 'COMPANY_ADMIN'
    AND is_active = true
    AND tenant_id IN (
      SELECT id FROM tenants WHERE owner_id = auth.uid()
    )
  );
