-- ============================================================================
-- FIX: Tenant Creation Error (RLS Violation)
-- ============================================================================
-- The error "new row violates row-level security policy for table tenant_statistics"
-- occurs because the trigger function runs with the permissions of the user
-- creating the tenant (who doesn't have INSERT permission on tenant_statistics).
--
-- We fix this by adding SECURITY DEFINER to the function, which makes it run
-- with the permissions of the database owner (who has full access).
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_create_tenant_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert the statistics row. 
  -- Because this function is SECURITY DEFINER, it bypasses RLS.
  INSERT INTO tenant_statistics (tenant_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verify the trigger exists (idempotent)
DROP TRIGGER IF EXISTS create_tenant_statistics ON tenants;
CREATE TRIGGER create_tenant_statistics
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_tenant_statistics();
