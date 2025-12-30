-- ============================================================================
-- Financial Reporting Schema
-- Phase 4: Financial Reporting with Multi-lingual Support
-- ============================================================================

-- ============================================================================
-- 1. MATERIALIZED VIEW: Account Balances
-- ============================================================================
-- This view calculates current balances for all accounts based on posted transactions
CREATE MATERIALIZED VIEW account_balances AS
SELECT 
  coa.id as account_id,
  coa.tenant_id,
  coa.code,
  coa.name,
  coa.account_type,
  coa.account_subtype,
  COALESCE(SUM(li.debit), 0) as total_debit,
  COALESCE(SUM(li.credit), 0) as total_credit,
  CASE 
    -- For ASSET and EXPENSE accounts: balance = debit - credit
    WHEN coa.account_type IN ('ASSET', 'EXPENSE') THEN 
      COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0)
    -- For LIABILITY, EQUITY, REVENUE accounts: balance = credit - debit
    WHEN coa.account_type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN 
      COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0)
    ELSE 0
  END as balance
FROM chart_of_accounts coa
LEFT JOIN line_items li ON coa.id = li.account_id
LEFT JOIN transactions t ON li.transaction_id = t.id AND t.status = 'POSTED'
WHERE coa.is_active = true
GROUP BY coa.id, coa.tenant_id, coa.code, coa.name, coa.account_type, coa.account_subtype;

-- Create index on materialized view
CREATE INDEX idx_account_balances_tenant ON account_balances(tenant_id);
CREATE INDEX idx_account_balances_type ON account_balances(account_type);

-- Function to refresh account balances
CREATE OR REPLACE FUNCTION refresh_account_balances()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW account_balances;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. FUNCTION: Get Trial Balance
-- ============================================================================
CREATE OR REPLACE FUNCTION get_trial_balance(
  p_tenant_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  debit_amount DECIMAL(15,2),
  credit_amount DECIMAL(15,2),
  balance DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.id,
    coa.code,
    coa.name,
    coa.account_type,
    coa.account_subtype,
    COALESCE(SUM(li.debit), 0)::DECIMAL(15,2) as debit_amount,
    COALESCE(SUM(li.credit), 0)::DECIMAL(15,2) as credit_amount,
    CASE 
      WHEN coa.account_type IN ('ASSET', 'EXPENSE') THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))::DECIMAL(15,2)
      WHEN coa.account_type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))::DECIMAL(15,2)
      ELSE 0::DECIMAL(15,2)
    END as balance
  FROM chart_of_accounts coa
  LEFT JOIN line_items li ON coa.id = li.account_id
  LEFT JOIN transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.is_active = true
    AND (t.id IS NULL OR t.status = 'POSTED')
    AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
  GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype
  ORDER BY coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3. FUNCTION: Get Profit & Loss Statement
-- ============================================================================
CREATE OR REPLACE FUNCTION get_profit_loss(
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  amount DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.id,
    coa.code,
    coa.name,
    coa.account_type,
    coa.account_subtype,
    CASE 
      -- Revenue: credit - debit (normal credit balance)
      WHEN coa.account_type = 'REVENUE' THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))::DECIMAL(15,2)
      -- Expense: debit - credit (normal debit balance)
      WHEN coa.account_type = 'EXPENSE' THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))::DECIMAL(15,2)
      ELSE 0::DECIMAL(15,2)
    END as amount
  FROM chart_of_accounts coa
  LEFT JOIN line_items li ON coa.id = li.account_id
  LEFT JOIN transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.is_active = true
    AND coa.account_type IN ('REVENUE', 'EXPENSE')
    AND t.status = 'POSTED'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date
  GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype
  HAVING (
    CASE 
      WHEN coa.account_type = 'REVENUE' THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))
      WHEN coa.account_type = 'EXPENSE' THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))
      ELSE 0
    END
  ) != 0
  ORDER BY coa.account_type DESC, coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. FUNCTION: Get Balance Sheet
-- ============================================================================
CREATE OR REPLACE FUNCTION get_balance_sheet(
  p_tenant_id UUID,
  p_as_of_date DATE
)
RETURNS TABLE (
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  amount DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.id,
    coa.code,
    coa.name,
    coa.account_type,
    coa.account_subtype,
    CASE 
      -- Assets: debit - credit (normal debit balance)
      WHEN coa.account_type = 'ASSET' THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))::DECIMAL(15,2)
      -- Liabilities and Equity: credit - debit (normal credit balance)
      WHEN coa.account_type IN ('LIABILITY', 'EQUITY') THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))::DECIMAL(15,2)
      ELSE 0::DECIMAL(15,2)
    END as amount
  FROM chart_of_accounts coa
  LEFT JOIN line_items li ON coa.id = li.account_id
  LEFT JOIN transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.is_active = true
    AND coa.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
    AND (t.id IS NULL OR (t.status = 'POSTED' AND t.transaction_date <= p_as_of_date))
  GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype
  ORDER BY 
    CASE coa.account_type
      WHEN 'ASSET' THEN 1
      WHEN 'LIABILITY' THEN 2
      WHEN 'EQUITY' THEN 3
    END,
    coa.code;
END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. FUNCTION: Calculate Net Income for Period
-- ============================================================================
CREATE OR REPLACE FUNCTION get_net_income(
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  v_total_revenue DECIMAL(15,2);
  v_total_expense DECIMAL(15,2);
BEGIN
  -- Calculate total revenue
  SELECT COALESCE(SUM(
    CASE 
      WHEN coa.account_type = 'REVENUE' THEN 
        (li.credit - li.debit)
      ELSE 0
    END
  ), 0)
  INTO v_total_revenue
  FROM chart_of_accounts coa
  JOIN line_items li ON coa.id = li.account_id
  JOIN transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.account_type = 'REVENUE'
    AND t.status = 'POSTED'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date;

  -- Calculate total expenses
  SELECT COALESCE(SUM(
    CASE 
      WHEN coa.account_type = 'EXPENSE' THEN 
        (li.debit - li.credit)
      ELSE 0
    END
  ), 0)
  INTO v_total_expense
  FROM chart_of_accounts coa
  JOIN line_items li ON coa.id = li.account_id
  JOIN transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.account_type = 'EXPENSE'
    AND t.status = 'POSTED'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date;

  RETURN v_total_revenue - v_total_expense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. FUNCTION: Get Account Activity Detail
-- ============================================================================
CREATE OR REPLACE FUNCTION get_account_activity(
  p_tenant_id UUID,
  p_account_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  transaction_date DATE,
  description TEXT,
  reference_number TEXT,
  debit DECIMAL(15,2),
  credit DECIMAL(15,2),
  running_balance DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH activity AS (
    SELECT 
      t.id,
      t.transaction_date,
      t.description,
      t.reference_number,
      li.debit,
      li.credit
    FROM transactions t
    JOIN line_items li ON t.id = li.transaction_id
    WHERE t.tenant_id = p_tenant_id
      AND li.account_id = p_account_id
      AND t.status = 'POSTED'
      AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
      AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
    ORDER BY t.transaction_date, t.created_at
  )
  SELECT 
    id,
    transaction_date,
    description,
    reference_number,
    debit::DECIMAL(15,2),
    credit::DECIMAL(15,2),
    SUM(debit - credit) OVER (ORDER BY transaction_date, id)::DECIMAL(15,2) as running_balance
  FROM activity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. TABLE: Report Templates (for future custom reports)
-- ============================================================================
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('trial_balance', 'profit_loss', 'balance_sheet', 'custom')),
  configuration JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_templates_tenant ON report_templates(tenant_id);

-- RLS Policies for report_templates
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's report templates"
  ON report_templates FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company admins can manage report templates"
  ON report_templates FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- 8. TABLE: Saved Reports (for scheduled/cached reports)
-- ============================================================================
CREATE TABLE saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  report_name TEXT NOT NULL,
  report_data JSONB NOT NULL,
  period_start DATE,
  period_end DATE,
  generated_by UUID REFERENCES profiles(id),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_reports_tenant ON saved_reports(tenant_id);
CREATE INDEX idx_saved_reports_type ON saved_reports(report_type);
CREATE INDEX idx_saved_reports_date ON saved_reports(generated_at);

-- RLS Policies for saved_reports
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's saved reports"
  ON saved_reports FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Accountants can create saved reports"
  ON saved_reports FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
    )
  );

-- ============================================================================
-- 9. TRIGGER: Auto-refresh account balances on transaction changes
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_refresh_account_balances()
RETURNS TRIGGER AS $$
BEGIN
  -- Only refresh if transaction is posted
  IF (TG_OP = 'INSERT' AND NEW.status = 'POSTED') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'POSTED' AND OLD.status != 'POSTED') THEN
    PERFORM refresh_account_balances();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_balances_on_transaction
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_account_balances();

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================
-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION get_trial_balance TO authenticated;
GRANT EXECUTE ON FUNCTION get_profit_loss TO authenticated;
GRANT EXECUTE ON FUNCTION get_balance_sheet TO authenticated;
GRANT EXECUTE ON FUNCTION get_net_income TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_activity TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_account_balances TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- This migration adds:
-- - Materialized view for account balances
-- - Trial Balance function
-- - Profit & Loss function
-- - Balance Sheet function
-- - Net Income calculation function
-- - Account activity detail function
-- - Report templates table
-- - Saved reports table
-- - Auto-refresh triggers for balances
-- 
-- Usage Examples:
-- 
-- Trial Balance:
-- SELECT * FROM get_trial_balance('<tenant-id>', '2024-01-01', '2024-12-31');
--
-- P&L Statement:
-- SELECT * FROM get_profit_loss('<tenant-id>', '2024-01-01', '2024-12-31');
--
-- Balance Sheet:
-- SELECT * FROM get_balance_sheet('<tenant-id>', '2024-12-31');
--
-- Net Income:
-- SELECT get_net_income('<tenant-id>', '2024-01-01', '2024-12-31');
-- ============================================================================
