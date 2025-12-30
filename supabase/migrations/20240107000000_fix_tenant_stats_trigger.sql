-- Fix for tenant creation error: "new row violates row-level security policy for table tenant_statistics"
-- The trigger function needs to be SECURITY DEFINER to bypass RLS when inserting the initial statistics row.

CREATE OR REPLACE FUNCTION trigger_create_tenant_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_statistics (tenant_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
