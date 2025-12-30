-- Create billing_invoices table
CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  amount_paid NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT,
  invoice_pdf TEXT, -- URL to Stripe hosted invoice
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own invoices" ON billing_invoices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all invoices" ON billing_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );

-- Add fields for scheduled changes to user_subscriptions
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS next_plan_id UUID REFERENCES subscription_plans(id),
ADD COLUMN IF NOT EXISTS next_plan_start_date TIMESTAMP WITH TIME ZONE;

-- Update get_user_subscription_details function to include next plan info
DROP FUNCTION IF EXISTS get_user_subscription_details(uuid);

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
  current_period_end TIMESTAMP WITH TIME ZONE,
  next_plan_name TEXT,
  next_plan_start_date TIMESTAMP WITH TIME ZONE
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
    us.current_period_end,
    (SELECT name FROM subscription_plans WHERE id = us.next_plan_id) as next_plan_name,
    us.next_plan_start_date
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
