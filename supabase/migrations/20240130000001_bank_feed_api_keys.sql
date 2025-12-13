-- ============================================================================
-- Bank Feed Webhook API Keys (per-tenant)
-- ============================================================================

-- Public table: metadata only
CREATE TABLE IF NOT EXISTS bank_feed_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  key_prefix TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_feed_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's bank feed api keys" ON bank_feed_api_keys
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank feed api keys" ON bank_feed_api_keys
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM memberships
    WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
  ));

CREATE INDEX IF NOT EXISTS idx_bank_feed_api_keys_tenant ON bank_feed_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_feed_api_keys_revoked ON bank_feed_api_keys(revoked_at);

CREATE TRIGGER set_updated_at_bank_feed_api_keys
  BEFORE UPDATE ON bank_feed_api_keys
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Secrets table: deny all client access; only service role reads
CREATE TABLE IF NOT EXISTS bank_feed_api_key_secrets (
  api_key_id UUID PRIMARY KEY REFERENCES bank_feed_api_keys(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_feed_api_key_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies.
