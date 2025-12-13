-- Add concurrent_batch_processing to subscription_plans features
-- This is a JSONB column, so we don't strictly need a migration for the column itself,
-- but we might want to update existing rows or just rely on the UI to set it.
-- However, we need a place to store the "batch size threshold".

-- 1. Add batch_processing_config to system_settings for Platform Default
INSERT INTO system_settings (setting_key, setting_value, description, is_public)
VALUES (
  'batch_processing_config',
  '{"default_batch_size": 10, "max_batch_size": 100}',
  'Configuration for concurrent batch processing limits',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- 2. Add batch_processing_config to tenant_ai_configurations (or a new table?)
-- Since the user said "Tenant admin will override platform admin setting", 
-- and it's likely related to AI/Document processing, let's add it to tenant_ai_configurations
-- or create a generic tenant_settings table if one doesn't exist.
-- Looking at the file list, there isn't a generic tenant_settings table visible in migrations list.
-- But tenant_ai_configurations exists. Let's check if there is a better place.
-- Actually, let's just add a column to `tenants` or create `tenant_settings`.
-- Let's create a `tenant_settings` table to be clean and future-proof.

CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, setting_key)
);

-- Enable RLS
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Tenant admins can manage their settings"
  ON tenant_settings
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Platform admins can manage all tenant settings"
  ON tenant_settings
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );
