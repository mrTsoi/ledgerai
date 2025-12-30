-- ============================================================================
-- Platform Admin Schema
-- Phase 5: Super Admin Features and System Management
-- ============================================================================

-- ============================================================================
-- 1. TABLE: System Settings
-- ============================================================================
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_settings_key ON system_settings(setting_key);

-- RLS Policies for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage system settings"
  ON system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Public settings are readable by authenticated users"
  ON system_settings FOR SELECT
  USING (is_public = true AND auth.uid() IS NOT NULL);

-- ============================================================================
-- 2. TABLE: Audit Logs
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- RLS Policies for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Company admins can view their tenant's audit logs"
  ON audit_logs FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 3. TABLE: Tenant Statistics (Cached)
-- ============================================================================
CREATE TABLE tenant_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  user_count INTEGER DEFAULT 0,
  document_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  last_activity TIMESTAMPTZ,
  storage_used_bytes BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenant_statistics_tenant ON tenant_statistics(tenant_id);

-- RLS Policies for tenant_statistics
ALTER TABLE tenant_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all tenant statistics"
  ON tenant_statistics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );

CREATE POLICY "Company admins can view their tenant's statistics"
  ON tenant_statistics FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- 4. FUNCTION: Create Audit Log Entry
-- ============================================================================
CREATE OR REPLACE FUNCTION create_audit_log(
  p_tenant_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Insert audit log
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    v_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_data,
    p_new_data
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. FUNCTION: Update Tenant Statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION update_tenant_statistics(p_tenant_id UUID)
RETURNS void AS $$
DECLARE
  v_user_count INTEGER;
  v_document_count INTEGER;
  v_transaction_count INTEGER;
  v_total_revenue DECIMAL(15,2);
  v_total_expenses DECIMAL(15,2);
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- Count users
  SELECT COUNT(*) INTO v_user_count
  FROM memberships
  WHERE tenant_id = p_tenant_id;

  -- Count documents
  SELECT COUNT(*) INTO v_document_count
  FROM documents
  WHERE tenant_id = p_tenant_id;

  -- Count transactions
  SELECT COUNT(*) INTO v_transaction_count
  FROM transactions
  WHERE tenant_id = p_tenant_id
  AND status = 'POSTED';

  -- Calculate total revenue (YTD)
  SELECT COALESCE(SUM(
    CASE WHEN coa.account_type = 'REVENUE' THEN (li.credit - li.debit) ELSE 0 END
  ), 0) INTO v_total_revenue
  FROM line_items li
  JOIN transactions t ON li.transaction_id = t.id
  JOIN chart_of_accounts coa ON li.account_id = coa.id
  WHERE t.tenant_id = p_tenant_id
  AND t.status = 'POSTED'
  AND EXTRACT(YEAR FROM t.transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Calculate total expenses (YTD)
  SELECT COALESCE(SUM(
    CASE WHEN coa.account_type = 'EXPENSE' THEN (li.debit - li.credit) ELSE 0 END
  ), 0) INTO v_total_expenses
  FROM line_items li
  JOIN transactions t ON li.transaction_id = t.id
  JOIN chart_of_accounts coa ON li.account_id = coa.id
  WHERE t.tenant_id = p_tenant_id
  AND t.status = 'POSTED'
  AND EXTRACT(YEAR FROM t.transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Get last activity
  SELECT MAX(created_at) INTO v_last_activity
  FROM (
    SELECT created_at FROM documents WHERE tenant_id = p_tenant_id
    UNION ALL
    SELECT created_at FROM transactions WHERE tenant_id = p_tenant_id
    UNION ALL
    SELECT created_at FROM memberships WHERE tenant_id = p_tenant_id
  ) activities;

  -- Upsert statistics
  INSERT INTO tenant_statistics (
    tenant_id,
    user_count,
    document_count,
    transaction_count,
    total_revenue,
    total_expenses,
    last_activity,
    updated_at
  ) VALUES (
    p_tenant_id,
    v_user_count,
    v_document_count,
    v_transaction_count,
    v_total_revenue,
    v_total_expenses,
    v_last_activity,
    NOW()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    user_count = EXCLUDED.user_count,
    document_count = EXCLUDED.document_count,
    transaction_count = EXCLUDED.transaction_count,
    total_revenue = EXCLUDED.total_revenue,
    total_expenses = EXCLUDED.total_expenses,
    last_activity = EXCLUDED.last_activity,
    updated_at = NOW();
END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. FUNCTION: Get System Overview
-- ============================================================================
CREATE OR REPLACE FUNCTION get_system_overview()
RETURNS TABLE (
  total_tenants INTEGER,
  active_tenants INTEGER,
  total_users INTEGER,
  total_documents INTEGER,
  total_transactions INTEGER,
  storage_used_gb DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tenants) as total_tenants,
    (SELECT COUNT(*)::INTEGER FROM tenants WHERE created_at > NOW() - INTERVAL '30 days') as active_tenants,
    (SELECT COUNT(DISTINCT user_id)::INTEGER FROM memberships) as total_users,
    (SELECT COUNT(*)::INTEGER FROM documents) as total_documents,
    (SELECT COUNT(*)::INTEGER FROM transactions WHERE status = 'POSTED') as total_transactions,
    (SELECT COALESCE(SUM(storage_used_bytes), 0)::DECIMAL(10,2) / 1073741824 FROM tenant_statistics) as storage_used_gb;
END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. FUNCTION: Get Tenant Details (Admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_tenant_details(p_tenant_id UUID)
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  locale TEXT,
  created_at TIMESTAMPTZ,
  user_count INTEGER,
  document_count INTEGER,
  transaction_count INTEGER,
  total_revenue DECIMAL(15,2),
  total_expenses DECIMAL(15,2),
  net_income DECIMAL(15,2),
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  -- Update statistics first
  PERFORM update_tenant_statistics(p_tenant_id);

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.locale,
    t.created_at,
    ts.user_count,
    ts.document_count,
    ts.transaction_count,
    ts.total_revenue,
    ts.total_expenses,
    (ts.total_revenue - ts.total_expenses) as net_income,
    ts.last_activity
  FROM tenants t
  LEFT JOIN tenant_statistics ts ON t.id = ts.tenant_id
  WHERE t.id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 8. TRIGGER: Auto-create tenant statistics on tenant creation
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_create_tenant_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_statistics (tenant_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_tenant_statistics
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_tenant_statistics();

-- ============================================================================
-- 9. TRIGGER: Audit log for important changes
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_audit_tenant_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM create_audit_log(
      NEW.id,
      'UPDATE',
      'tenant',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM create_audit_log(
      OLD.id,
      'DELETE',
      'tenant',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_tenant_changes
  AFTER UPDATE OR DELETE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION trigger_audit_tenant_changes();

-- ============================================================================
-- 10. Add is_active field to tenants table
-- ============================================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION create_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION update_tenant_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION get_system_overview TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_details TO authenticated;

-- ============================================================================
-- 12. Insert Default System Settings
-- ============================================================================
INSERT INTO system_settings (setting_key, setting_value, description, is_public) VALUES
  ('platform_name', '"LedgerAI"', 'Platform display name', true),
  ('max_file_size_mb', '50', 'Maximum file upload size in MB', true),
  ('allowed_file_types', '["pdf", "png", "jpg", "jpeg", "xlsx", "csv"]', 'Allowed file types for upload', true),
  ('maintenance_mode', 'false', 'Enable maintenance mode', false),
  ('signup_enabled', 'true', 'Allow new user signups', false),
  ('default_locale', '"en"', 'Default platform locale', true)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds:
-- - System settings table for platform configuration
-- - Audit logs for tracking all important changes
-- - Tenant statistics for performance monitoring
-- - Admin functions for system overview and tenant management
-- - Triggers for automatic statistics updates and audit logging
-- - Default system settings
--
-- Usage Examples:
--
-- Get system overview:
-- SELECT * FROM get_system_overview();
--
-- Get tenant details:
-- SELECT * FROM get_tenant_details('<tenant-id>');
--
-- Update tenant statistics:
-- SELECT update_tenant_statistics('<tenant-id>');
--
-- Create audit log:
-- SELECT create_audit_log('<tenant-id>', 'UPDATE', 'transaction', '<tx-id>', '{}', '{}');
-- ============================================================================
