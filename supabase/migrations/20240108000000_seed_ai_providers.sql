-- ============================================================================
-- Seed AI Providers
-- ============================================================================

-- 1. Create AI Providers Table if it doesn't exist (it should be in initial schema but let's be safe)
CREATE TABLE IF NOT EXISTS ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  api_endpoint TEXT,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Authenticated users can view active AI providers"
  ON ai_providers FOR SELECT
  USING (is_active = true AND auth.role() = 'authenticated');

-- 2. Create Tenant AI Configurations Table
CREATE TABLE IF NOT EXISTS tenant_ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ai_provider_id UUID REFERENCES ai_providers(id),
  api_key_encrypted TEXT, -- In production, use Vault or similar
  model_name TEXT,
  custom_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE tenant_ai_configurations ENABLE ROW LEVEL SECURITY;

-- Allow tenant admins to view/manage their config
CREATE POLICY "Tenant admins can view their AI config"
  ON tenant_ai_configurations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Tenant admins can manage their AI config"
  ON tenant_ai_configurations FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

-- 3. Insert Default Providers
INSERT INTO ai_providers (name, display_name, is_active, config) VALUES
  (
    'google-document-ai', 
    'Google Cloud Document AI', 
    true, 
    '{"supported_types": ["invoice", "receipt"], "requires_service_account": true}'
  ),
  (
    'qwen-vision', 
    'Qwen Vision (Alibaba Cloud)', 
    true, 
    '{"supported_types": ["invoice", "receipt", "general"], "models": ["qwen-vl-max", "qwen-vl-plus"]}'
  ),
  (
    'deepseek-ocr', 
    'DeepSeek OCR', 
    true, 
    '{"supported_types": ["invoice", "receipt"], "models": ["deepseek-chat"]}'
  ),
  (
    'openai-vision',
    'OpenAI GPT-4 Vision',
    true,
    '{"supported_types": ["invoice", "receipt", "general"], "models": ["gpt-4-vision-preview", "gpt-4o"]}'
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  config = EXCLUDED.config,
  is_active = true;
