-- Drop the existing function first
DROP FUNCTION IF EXISTS get_user_subscription_details(uuid);

-- Re-create the function with storage calculation
CREATE OR REPLACE FUNCTION get_user_subscription_details(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  max_tenants INTEGER,
  current_tenants INTEGER,
  max_documents INTEGER,
  current_documents INTEGER,
  max_storage_bytes BIGINT,
  current_storage_bytes BIGINT,
  price_monthly NUMERIC,
  status TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.name,
    sp.max_tenants,
    (SELECT COUNT(*)::INTEGER FROM tenants t WHERE t.owner_id = p_user_id),
    sp.max_documents,
    (
      SELECT COUNT(*)::INTEGER 
      FROM documents d
      JOIN tenants t ON d.tenant_id = t.id
      WHERE t.owner_id = p_user_id
    ),
    sp.max_storage_bytes,
    (
      SELECT COALESCE(SUM(d.file_size), 0)::BIGINT
      FROM documents d
      JOIN tenants t ON d.tenant_id = t.id
      WHERE t.owner_id = p_user_id
    ),
    sp.price_monthly,
    us.status,
    us.current_period_start,
    us.current_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
