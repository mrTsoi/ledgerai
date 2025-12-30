-- ============================================================================
-- Bank Feed Integration (Global) + Tax Automation (Global) + Custom Domain (Tenant)
-- Phase 5/6 Foundation Migration
-- ============================================================================

-- =========================
-- 1) Custom Domains
-- =========================
CREATE TABLE IF NOT EXISTS tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ,
  verification_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain)
);

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant domains they belong to"
  ON tenant_domains FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage their tenant domains"
  ON tenant_domains FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_domain ON tenant_domains(domain);

CREATE TRIGGER set_updated_at_tenant_domains
  BEFORE UPDATE ON tenant_domains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================
-- 2) Bank Feed Integration
-- =========================
-- Extend bank_transactions to support transactions coming from an external feed
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'STATEMENT' CHECK (source IN ('STATEMENT', 'FEED')),
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS external_raw JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_provider ON bank_transactions(provider);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_external_id ON bank_transactions(external_transaction_id);

-- Ensure external transactions are idempotent per tenant+provider+external id
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_external
  ON bank_transactions(tenant_id, provider, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

-- =========================
-- 3) Tax Automation
-- =========================
CREATE TABLE IF NOT EXISTS tenant_tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  locale TEXT,
  tax_registration_id TEXT,
  default_tax_rate NUMERIC(7,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant tax settings"
  ON tenant_tax_settings FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage their tenant tax settings"
  ON tenant_tax_settings FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

CREATE TRIGGER set_updated_at_tenant_tax_settings
  BEFORE UPDATE ON tenant_tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- A lightweight tax estimate RPC based on AI-extracted document data
-- Note: tax_amount is expected in document_data.extracted_data (or metadata) as a string/number.
CREATE OR REPLACE FUNCTION public.get_tax_estimate(
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  document_count BIGINT,
  taxable_total NUMERIC,
  estimated_tax_total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS document_count,
    COALESCE(SUM(dd.total_amount), 0)::numeric AS taxable_total,
    COALESCE(
      SUM(
        COALESCE(
          NULLIF(dd.extracted_data->>'tax_amount', '')::numeric,
          NULLIF(dd.metadata->>'tax_amount', '')::numeric,
          0
        )
      ),
      0
    )::numeric AS estimated_tax_total
  FROM documents d
  JOIN document_data dd ON dd.document_id = d.id
  WHERE d.tenant_id = p_tenant_id
    AND dd.document_date IS NOT NULL
    AND dd.document_date >= p_start_date
    AND dd.document_date <= p_end_date;
$$;

REVOKE ALL ON FUNCTION public.get_tax_estimate(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tax_estimate(UUID, DATE, DATE) TO authenticated;
