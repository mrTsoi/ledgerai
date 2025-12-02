-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  currency TEXT NOT NULL,
  rate DECIMAL(10, 6) NOT NULL,
  is_manual BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, currency)
);

-- Enable RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view exchange rates for their tenant" ON exchange_rates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
      AND memberships.tenant_id = exchange_rates.tenant_id
    )
  );

CREATE POLICY "Admins and Accountants can manage exchange rates" ON exchange_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
      AND memberships.tenant_id = exchange_rates.tenant_id
      AND memberships.role IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_exchange_rates_updated_at
  BEFORE UPDATE ON exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
