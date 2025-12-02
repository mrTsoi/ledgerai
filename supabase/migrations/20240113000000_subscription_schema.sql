-- Add subscription fields to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active';

-- Add check constraint for subscription status
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_subscription_status') THEN 
        ALTER TABLE tenants ADD CONSTRAINT check_subscription_status 
        CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trial'));
    END IF;
END $$;

-- Create a view for user management (profiles + memberships)
-- This helps the admin see who belongs to which tenant and their role
CREATE OR REPLACE VIEW admin_user_view AS
SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    p.created_at as user_created_at,
    m.tenant_id,
    t.name as tenant_name,
    m.role,
    m.is_active as membership_active
FROM profiles p
LEFT JOIN memberships m ON p.id = m.user_id
LEFT JOIN tenants t ON m.tenant_id = t.id;
