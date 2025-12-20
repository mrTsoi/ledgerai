-- ============================================================================
-- Tenant Mismatch & Multi-Tenant Document Handling
-- ============================================================================

-- 1. Update Documents table for multi-tenant support
ALTER TABLE documents ADD COLUMN IF NOT EXISTS shared_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_documents_shared_group ON documents(shared_group_id);

-- 2. Create Tenant Identifiers table for matching
CREATE TABLE IF NOT EXISTS tenant_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('TAX_ID', 'DOMAIN', 'NAME_ALIAS', 'BANK_ACCOUNT')),
  identifier_value TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS idx_tenant_identifiers_value ON tenant_identifiers(identifier_value);

-- RLS for tenant_identifiers
ALTER TABLE tenant_identifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can manage their identifiers" ON tenant_identifiers;

CREATE POLICY "Tenant admins can manage their identifiers"
  ON tenant_identifiers
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

DROP POLICY IF EXISTS "Platform admins can view all identifiers" ON tenant_identifiers;

CREATE POLICY "Platform admins can view all identifiers"
  ON tenant_identifiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );

-- 3. Create Document Tenant Candidates table
CREATE TABLE IF NOT EXISTS document_tenant_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  candidate_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  suggested_tenant_name TEXT, -- For auto-creation
  confidence DECIMAL(3,2) NOT NULL,
  reasons TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'IGNORED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_candidates_doc_id ON document_tenant_candidates(document_id);

-- RLS for document_tenant_candidates
ALTER TABLE document_tenant_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view candidates for their documents" ON document_tenant_candidates;

CREATE POLICY "Users can view candidates for their documents"
  ON document_tenant_candidates
  USING (
    document_id IN (
      SELECT id FROM documents 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 4. Add default settings to system_settings
INSERT INTO system_settings (setting_key, setting_value, description, is_public)
VALUES (
  'tenant_mismatch_policy',
  '{"allow_auto_tenant_creation": false, "allow_auto_reassignment": false, "min_confidence": 0.90}',
  'Platform-wide policy for handling document tenant mismatches',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- 5. Function to transfer document between tenants
CREATE OR REPLACE FUNCTION transfer_document_tenant(
  p_document_id UUID,
  p_target_tenant_id UUID,
  p_mode TEXT DEFAULT 'MOVE' -- 'MOVE' or 'DUPLICATE'
)
RETURNS UUID AS $$
DECLARE
  v_source_doc RECORD;
  v_new_doc_id UUID;
  v_shared_group_id UUID;
BEGIN
  -- Get source document
  SELECT * INTO v_source_doc FROM documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF p_mode = 'MOVE' THEN
    UPDATE documents 
    SET tenant_id = p_target_tenant_id,
        updated_at = NOW()
    WHERE id = p_document_id;
    
    -- Also update associated data if any (e.g. document_data)
    -- document_data has document_id as FK, so it stays linked.
    -- But if there are tenant_id columns in other tables, they need update.
    
    RETURN p_document_id;
  ELSIF p_mode = 'DUPLICATE' THEN
    -- Ensure shared_group_id exists
    v_shared_group_id := COALESCE(v_source_doc.shared_group_id, gen_random_uuid());
    
    -- Update source if it didn't have shared_group_id
    IF v_source_doc.shared_group_id IS NULL THEN
      UPDATE documents SET shared_group_id = v_shared_group_id WHERE id = p_document_id;
    END IF;

    -- Insert new document record referencing same file
    INSERT INTO documents (
      tenant_id, file_path, file_name, file_size, file_type, 
      status, document_type, uploaded_by, shared_group_id
    )
    VALUES (
      p_target_tenant_id, v_source_doc.file_path, v_source_doc.file_name, 
      v_source_doc.file_size, v_source_doc.file_type, 
      v_source_doc.status, v_source_doc.document_type, 
      v_source_doc.uploaded_by, v_shared_group_id
    )
    RETURNING id INTO v_new_doc_id;

    -- Duplicate document_data if exists
    INSERT INTO document_data (
      document_id, extracted_data, confidence_score, vendor_name, 
      document_date, total_amount, currency, line_items, metadata
    )
    SELECT 
      v_new_doc_id, extracted_data, confidence_score, vendor_name, 
      document_date, total_amount, currency, line_items, metadata
    FROM document_data WHERE document_id = p_document_id;

    RETURN v_new_doc_id;
  ELSE
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
