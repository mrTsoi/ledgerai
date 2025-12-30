-- Drop the existing function first because we are changing the return type
DROP FUNCTION IF EXISTS get_user_subscription_details(uuid);

-- Re-create the function with the new return type (including current_period_start)
CREATE OR REPLACE FUNCTION get_user_subscription_details(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  max_tenants INTEGER,
  current_tenants INTEGER,
  max_documents INTEGER,
  max_storage_bytes BIGINT,
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
    sp.max_storage_bytes,
    sp.price_monthly,
    us.status,
    us.current_period_start,
    us.current_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
