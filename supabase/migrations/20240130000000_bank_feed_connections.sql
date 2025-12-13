-- ============================================================================
-- Bank Feed Connections (OAuth/Provider sync state)
-- ============================================================================

-- 1) Connection metadata (safe to expose to tenant members)
CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('PLAID')),
  provider_item_id TEXT NOT NULL,
  provider_cursor TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ERROR', 'DISABLED')),
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, provider, provider_item_id)
);

ALTER TABLE bank_feed_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's bank feed connections" ON bank_feed_connections
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank feed connections" ON bank_feed_connections
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM memberships
    WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
  ));

CREATE INDEX IF NOT EXISTS idx_bank_feed_connections_tenant ON bank_feed_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_feed_connections_status ON bank_feed_connections(status);

CREATE TRIGGER set_updated_at_bank_feed_connections
  BEFORE UPDATE ON bank_feed_connections
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 2) Connection secrets (never readable/writable by client)
CREATE TABLE IF NOT EXISTS bank_feed_connection_secrets (
  connection_id UUID PRIMARY KEY REFERENCES bank_feed_connections(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_feed_connection_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: deny all for authenticated/anon.

-- 3) Provider account mapping to LedgerAI bank_accounts
CREATE TABLE IF NOT EXISTS bank_feed_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES bank_feed_connections(id) ON DELETE CASCADE NOT NULL,
  provider_account_id TEXT NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  account_name TEXT,
  account_mask TEXT,
  currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (connection_id, provider_account_id)
);

ALTER TABLE bank_feed_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's bank feed accounts" ON bank_feed_accounts
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank feed accounts" ON bank_feed_accounts
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM memberships
    WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
  ));

CREATE INDEX IF NOT EXISTS idx_bank_feed_accounts_tenant ON bank_feed_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_feed_accounts_connection ON bank_feed_accounts(connection_id);

CREATE TRIGGER set_updated_at_bank_feed_accounts
  BEFORE UPDATE ON bank_feed_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
