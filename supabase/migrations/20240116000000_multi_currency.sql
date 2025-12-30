-- Multi-currency support
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10, 6) DEFAULT 1.0;

-- Add foreign currency columns to line items to track original amounts
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS debit_foreign DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS credit_foreign DECIMAL(15, 2) DEFAULT 0;

-- Update the balance validation trigger to check base currency amounts (debit/credit)
-- The existing trigger 'validate_transaction_balance' checks sum(debit) vs sum(credit), which is correct for the ledger.
-- We don't strictly need to validate foreign amounts balance, but usually they should balance too.
-- For now, we keep the strict check on the base currency (ledger) amounts.

-- Function to get tenant currency
CREATE OR REPLACE FUNCTION get_tenant_currency(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_currency TEXT;
BEGIN
  SELECT currency INTO v_currency FROM tenants WHERE id = p_tenant_id;
  RETURN v_currency;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
