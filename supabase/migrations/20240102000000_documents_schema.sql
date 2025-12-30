-- Phase 2: Document Management & AI Integration
-- This migration creates tables for document storage, AI processing, and data extraction

-- Create Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL, -- Path in Supabase Storage
  file_name TEXT NOT NULL, -- Original filename
  file_size BIGINT NOT NULL, -- File size in bytes
  file_type TEXT NOT NULL, -- MIME type
  status TEXT DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  document_type TEXT, -- e.g., 'invoice', 'receipt', 'bank_statement'
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on Documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- RLS Policies for Documents
CREATE POLICY "Users can view documents in their tenant" ON documents
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Users can insert documents in their tenant" ON documents
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Users can update documents in their tenant" ON documents
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Users can delete documents in their tenant" ON documents
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

-- Create Document Data table (stores AI-extracted data)
CREATE TABLE IF NOT EXISTS document_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL UNIQUE,
  extracted_data JSONB NOT NULL DEFAULT '{}', -- AI-extracted structured data
  confidence_score DECIMAL(3,2), -- AI confidence (0.00 to 1.00)
  vendor_name TEXT,
  document_date DATE,
  total_amount DECIMAL(12,2),
  currency TEXT DEFAULT 'USD',
  line_items JSONB DEFAULT '[]', -- Array of line items
  metadata JSONB DEFAULT '{}', -- Additional extracted metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on Document Data
ALTER TABLE document_data ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_data_document_id ON document_data(document_id);
CREATE INDEX IF NOT EXISTS idx_document_data_vendor_name ON document_data(vendor_name);
CREATE INDEX IF NOT EXISTS idx_document_data_document_date ON document_data(document_date DESC);

-- RLS Policies for Document Data
CREATE POLICY "Users can view document data in their tenant" ON document_data
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

CREATE POLICY "Users can insert document data in their tenant" ON document_data
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT id FROM documents 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

CREATE POLICY "Users can update document data in their tenant" ON document_data
  FOR UPDATE USING (
    document_id IN (
      SELECT id FROM documents 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- Create AI Providers table (for Platform Admin configuration)
CREATE TABLE IF NOT EXISTS ai_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE, -- e.g., 'openai', 'anthropic', 'azure-openai'
  display_name TEXT NOT NULL,
  api_endpoint TEXT,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}', -- Provider-specific configuration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on AI Providers
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for AI Providers (Super Admin only)
CREATE POLICY "Super admins can manage AI providers" ON ai_providers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );

CREATE POLICY "Users can view active AI providers" ON ai_providers
  FOR SELECT USING (is_active = true);

-- Create Tenant AI Configuration table
CREATE TABLE IF NOT EXISTS tenant_ai_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ai_provider_id UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
  api_key_encrypted TEXT, -- Encrypted API key (tenant-specific)
  model_name TEXT, -- e.g., 'gpt-4', 'claude-3-opus'
  custom_config JSONB DEFAULT '{}', -- Tenant-specific AI settings
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on Tenant AI Configurations
ALTER TABLE tenant_ai_configurations ENABLE ROW LEVEL SECURITY;

-- Create index
CREATE INDEX IF NOT EXISTS idx_tenant_ai_config_tenant_id ON tenant_ai_configurations(tenant_id);

-- RLS Policies for Tenant AI Configurations
CREATE POLICY "Company admins can manage their tenant AI config" ON tenant_ai_configurations
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

-- Trigger for updated_at timestamp on documents
CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for updated_at timestamp on document_data
CREATE TRIGGER set_updated_at_document_data
  BEFORE UPDATE ON document_data
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for updated_at timestamp on ai_providers
CREATE TRIGGER set_updated_at_ai_providers
  BEFORE UPDATE ON ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for updated_at timestamp on tenant_ai_configurations
CREATE TRIGGER set_updated_at_tenant_ai_configurations
  BEFORE UPDATE ON tenant_ai_configurations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create Storage Bucket Policy Functions
-- Note: Storage bucket must be created in Supabase Dashboard first

-- Function to check if user can access tenant's documents
CREATE OR REPLACE FUNCTION public.user_can_access_tenant_documents(tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND memberships.tenant_id = user_can_access_tenant_documents.tenant_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Insert default AI provider (placeholder)
INSERT INTO ai_providers (name, display_name, api_endpoint, is_active, config)
VALUES 
  ('openai', 'OpenAI', 'https://api.openai.com/v1', false, '{"models": ["gpt-4", "gpt-3.5-turbo"]}'),
  ('anthropic', 'Anthropic Claude', 'https://api.anthropic.com/v1', false, '{"models": ["claude-3-opus", "claude-3-sonnet"]}')
ON CONFLICT (name) DO NOTHING;
