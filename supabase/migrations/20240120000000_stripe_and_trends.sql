-- Add Stripe fields to user_subscriptions
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Create index for stripe lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_cust ON user_subscriptions(stripe_customer_id);

-- Function to get daily system stats for trending charts
CREATE OR REPLACE FUNCTION get_system_trends(
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT (NOW() - INTERVAL '30 days'),
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  date DATE,
  new_tenants BIGINT,
  new_users BIGINT,
  new_documents BIGINT,
  new_transactions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT 
    dates.d,
    COUNT(DISTINCT t.id) FILTER (WHERE t.created_at::date = dates.d) as new_tenants,
    COUNT(DISTINCT p.id) FILTER (WHERE p.created_at::date = dates.d) as new_users,
    COUNT(DISTINCT d.id) FILTER (WHERE d.created_at::date = dates.d) as new_documents,
    COUNT(DISTINCT tr.id) FILTER (WHERE tr.created_at::date = dates.d) as new_transactions
  FROM dates
  LEFT JOIN tenants t ON t.created_at::date = dates.d
  LEFT JOIN profiles p ON p.created_at::date = dates.d
  LEFT JOIN documents d ON d.created_at::date = dates.d
  LEFT JOIN transactions tr ON tr.created_at::date = dates.d
  GROUP BY dates.d
  ORDER BY dates.d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get subscription revenue stats
CREATE OR REPLACE FUNCTION get_subscription_stats()
RETURNS TABLE (
  total_mrr NUMERIC,
  active_subscriptions BIGINT,
  plan_breakdown JSON
) AS $$
DECLARE
  v_total_mrr NUMERIC;
  v_active_subs BIGINT;
  v_breakdown JSON;
BEGIN
  -- Calculate MRR (Monthly Recurring Revenue)
  SELECT COALESCE(SUM(
    CASE 
      WHEN sp.price_yearly > 0 AND us.current_period_end > (NOW() + INTERVAL '30 days') THEN sp.price_yearly / 12
      ELSE sp.price_monthly 
    END
  ), 0)
  INTO v_total_mrr
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.status = 'active';

  -- Count active subscriptions
  SELECT COUNT(*) INTO v_active_subs
  FROM user_subscriptions
  WHERE status = 'active';

  -- Get breakdown by plan
  SELECT json_agg(row_to_json(t)) INTO v_breakdown
  FROM (
    SELECT sp.name, COUNT(*) as count, SUM(sp.price_monthly) as revenue
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.status = 'active'
    GROUP BY sp.name
  ) t;

  RETURN QUERY SELECT v_total_mrr, v_active_subs, COALESCE(v_breakdown, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant access to Super Admins
-- (RLS is already enabled, but functions need to be accessible)
GRANT EXECUTE ON FUNCTION get_system_trends TO authenticated;
GRANT EXECUTE ON FUNCTION get_subscription_stats TO authenticated;
