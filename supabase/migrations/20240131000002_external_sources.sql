-- ============================================================================
-- External Document Sources (SFTP/FTPS/Cloud Drives)
-- Allows tenants to schedule automatic ingestion of documents from external systems.
--
-- Notes:
-- - SFTP uses SSH auth (password or private key). It does NOT use mTLS.
-- - FTPS uses TLS and can support client certificates (mTLS).
-- - Cloud drive connectors (Google Drive / OneDrive) are modeled here but require OAuth wiring.
-- ============================================================================

-- 1) Source metadata (client-readable)
CREATE TABLE IF NOT EXISTS external_document_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('SFTP', 'FTPS', 'GOOGLE_DRIVE', 'ONEDRIVE')),
  enabled BOOLEAN DEFAULT true,

  -- Scheduling is evaluated by the fetch runner. The runner may be triggered via cron.
  schedule_minutes INTEGER NOT NULL DEFAULT 60,
  last_run_at TIMESTAMPTZ,

  -- Non-secret configuration (host/path/pattern/folder IDs/etc)
  config JSONB NOT NULL DEFAULT '{}',

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE external_document_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view external sources in their tenant" ON external_document_sources;
CREATE POLICY "Users can view external sources in their tenant" ON external_document_sources
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage external sources" ON external_document_sources;
CREATE POLICY "Admins can manage external sources" ON external_document_sources
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE INDEX IF NOT EXISTS idx_external_document_sources_tenant ON external_document_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_external_document_sources_enabled ON external_document_sources(enabled);

DROP TRIGGER IF EXISTS set_updated_at_external_document_sources ON external_document_sources;
CREATE TRIGGER set_updated_at_external_document_sources
  BEFORE UPDATE ON external_document_sources
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


-- 2) Secrets (deny all client access)
CREATE TABLE IF NOT EXISTS external_document_source_secrets (
  source_id UUID PRIMARY KEY REFERENCES external_document_sources(id) ON DELETE CASCADE,

  -- Stored as JSON for flexibility:
  -- SFTP: { username, password?, private_key_pem?, passphrase?, host_key? }
  -- FTPS: { username, password?, client_cert_pem?, client_key_pem?, ca_cert_pem? }
  -- Drives: { refresh_token, access_token?, expires_at? }
  secrets JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE external_document_source_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies.

DROP TRIGGER IF EXISTS set_updated_at_external_document_source_secrets ON external_document_source_secrets;
CREATE TRIGGER set_updated_at_external_document_source_secrets
  BEFORE UPDATE ON external_document_source_secrets
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


-- 3) Item ledger to prevent duplicate imports
CREATE TABLE IF NOT EXISTS external_document_source_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  source_id UUID REFERENCES external_document_sources(id) ON DELETE CASCADE NOT NULL,

  remote_id TEXT,          -- e.g. cloud file id
  remote_path TEXT,        -- e.g. /statements/2025-01.pdf
  remote_modified_at TIMESTAMPTZ,
  remote_size BIGINT,
  remote_checksum TEXT,

  imported_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE external_document_source_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view external source items in their tenant" ON external_document_source_items;
CREATE POLICY "Users can view external source items in their tenant" ON external_document_source_items
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage external source items" ON external_document_source_items;
CREATE POLICY "Admins can manage external source items" ON external_document_source_items
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

-- Avoid duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uidx_external_source_items_remote_id
  ON external_document_source_items(source_id, remote_id)
  WHERE remote_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_external_source_items_remote_path
  ON external_document_source_items(source_id, remote_path)
  WHERE remote_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_source_items_tenant ON external_document_source_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_external_source_items_source ON external_document_source_items(source_id);


-- 4) Run logs (optional but useful for debugging)
CREATE TABLE IF NOT EXISTS external_document_source_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  source_id UUID REFERENCES external_document_sources(id) ON DELETE CASCADE NOT NULL,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCESS', 'ERROR', 'SKIPPED')),
  message TEXT,
  inserted_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE external_document_source_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view external source runs in their tenant" ON external_document_source_runs;
CREATE POLICY "Users can view external source runs in their tenant" ON external_document_source_runs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage external source runs" ON external_document_source_runs;
CREATE POLICY "Admins can manage external source runs" ON external_document_source_runs
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE INDEX IF NOT EXISTS idx_external_source_runs_source ON external_document_source_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_external_source_runs_tenant ON external_document_source_runs(tenant_id);
