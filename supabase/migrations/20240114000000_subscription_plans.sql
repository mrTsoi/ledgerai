-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  max_tenants INTEGER NOT NULL DEFAULT 1,
  max_documents INTEGER NOT NULL DEFAULT 1000,
  max_storage_bytes BIGINT NOT NULL DEFAULT 5368709120, -- 5GB
  features JSONB DEFAULT '{}',
  price_monthly NUMERIC(10, 2) DEFAULT 0,
  price_yearly NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trial')),
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add owner_id to tenants to track quota
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans
CREATE POLICY "Everyone can view active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Super admins can manage plans" ON subscription_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscription" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all subscriptions" ON user_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );

-- Seed Data
INSERT INTO subscription_plans (name, description, max_tenants, max_documents, max_storage_bytes, price_monthly, features) VALUES
('Free', 'Perfect for individuals getting started', 1, 1000, 5368709120, 0, '{"ai_access": false, "custom_domain": false}'),
('Agency Starter', 'For small agencies managing multiple clients', 10, 10000, 53687091200, 49.99, '{"ai_access": true, "custom_domain": false}'),
('Agency Pro', 'For growing firms with more clients', 50, 50000, 268435456000, 199.99, '{"ai_access": true, "custom_domain": true}'),
('Enterprise', 'Unlimited scale for large organizations', -1, -1, -1, 999.99, '{"ai_access": true, "custom_domain": true, "sso": true}');

-- Function to check tenant limit before creation
CREATE OR REPLACE FUNCTION check_tenant_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
  user_plan_id UUID;
BEGIN
  -- Get user's plan
  SELECT plan_id INTO user_plan_id FROM user_subscriptions WHERE user_id = NEW.owner_id;
  
  -- If no plan, assume free (or handle as error, but let's default to free logic if we auto-assign)
  -- For now, if no subscription record, we block or allow 1. Let's allow 1 if no record found (implicit free).
  
  IF user_plan_id IS NULL THEN
     -- Check if they already have any tenant as owner
     SELECT COUNT(*) INTO current_count FROM tenants WHERE owner_id = NEW.owner_id;
     IF current_count >= 1 THEN
       RAISE EXCEPTION 'No subscription found. Free limit of 1 tenant reached.';
     END IF;
  ELSE
     SELECT max_tenants INTO max_allowed FROM subscription_plans WHERE id = user_plan_id;
     
     -- -1 means unlimited
     IF max_allowed != -1 THEN
       SELECT COUNT(*) INTO current_count FROM tenants WHERE owner_id = NEW.owner_id;
       IF current_count >= max_allowed THEN
         RAISE EXCEPTION 'Tenant limit reached for your current subscription plan.';
       END IF;
     END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for tenant creation limit
CREATE TRIGGER check_tenant_creation_limit
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION check_tenant_limit();

-- Function to auto-assign Free plan on user creation (optional, but good for UX)
CREATE OR REPLACE FUNCTION handle_new_user_subscription()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
  
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO user_subscriptions (user_id, plan_id)
    VALUES (NEW.id, free_plan_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to assign free plan
CREATE TRIGGER on_auth_user_created_sub
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_subscription();

-- Helper function to get user subscription details
CREATE OR REPLACE FUNCTION get_user_subscription_details(p_user_id UUID)
RETURNS TABLE (
  plan_name TEXT,
  max_tenants INTEGER,
  current_tenants INTEGER,
  max_documents INTEGER,
  max_storage_bytes BIGINT,
  price_monthly NUMERIC,
  status TEXT,
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
    us.current_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
