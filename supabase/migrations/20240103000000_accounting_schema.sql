-- Phase 3: Accounting Core & Data Structuring
-- This migration creates tables for chart of accounts, transactions, and line items

-- Create Chart of Accounts table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL, -- Account code (e.g., '1000', '2100')
  name TEXT NOT NULL, -- Account name (e.g., 'Cash', 'Accounts Payable')
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  account_subtype TEXT, -- More specific categorization (e.g., 'CURRENT_ASSET', 'FIXED_ASSET')
  parent_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL, -- For hierarchical accounts
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(tenant_id, code)
);

-- Enable RLS on Chart of Accounts
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coa_tenant_id ON chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coa_code ON chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_active ON chart_of_accounts(is_active);

-- RLS Policies for Chart of Accounts
CREATE POLICY "Users can view their tenant's chart of accounts" ON chart_of_accounts
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage their tenant's chart of accounts" ON chart_of_accounts
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

-- Create Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  transaction_date DATE NOT NULL,
  description TEXT,
  reference_number TEXT, -- Invoice number, check number, etc.
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL, -- Link to source document
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS on Transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_document_id ON transactions(document_id);

-- RLS Policies for Transactions
CREATE POLICY "Users can view their tenant's transactions" ON transactions
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Users can create transactions in their tenant" ON transactions
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "Users can update draft transactions in their tenant" ON transactions
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    AND (status = 'DRAFT' OR EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND tenant_id = transactions.tenant_id
      AND role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
      AND is_active = true
    ))
  );

CREATE POLICY "Admins can delete transactions in their tenant" ON transactions
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

-- Create Line Items table (for double-entry bookkeeping)
CREATE TABLE IF NOT EXISTS line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES chart_of_accounts(id) NOT NULL,
  debit DECIMAL(15,2) DEFAULT 0 CHECK (debit >= 0),
  credit DECIMAL(15,2) DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT debit_or_credit_not_both CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

-- Enable RLS on Line Items
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_line_items_transaction_id ON line_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_line_items_account_id ON line_items(account_id);

-- RLS Policies for Line Items
CREATE POLICY "Users can view line items for their tenant's transactions" ON line_items
  FOR SELECT USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

CREATE POLICY "Users can manage line items for their tenant's transactions" ON line_items
  FOR ALL USING (
    transaction_id IN (
      SELECT id FROM transactions 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
  );

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_chart_of_accounts
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_transactions
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_line_items
  BEFORE UPDATE ON line_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to validate transaction balance (debits = credits)
CREATE OR REPLACE FUNCTION validate_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debits DECIMAL(15,2);
  total_credits DECIMAL(15,2);
  trans_status TEXT;
BEGIN
  -- Get transaction status
  SELECT status INTO trans_status FROM transactions WHERE id = NEW.transaction_id;
  
  -- Only validate when posting (not drafts)
  IF trans_status = 'POSTED' THEN
    -- Calculate totals
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO total_debits, total_credits
    FROM line_items
    WHERE transaction_id = NEW.transaction_id;
    
    -- Check if balanced
    IF total_debits != total_credits THEN
      RAISE EXCEPTION 'Transaction must be balanced: debits (%) != credits (%)', total_debits, total_credits;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate balance on line item changes
CREATE TRIGGER validate_line_item_balance
  AFTER INSERT OR UPDATE ON line_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_transaction_balance();

-- Function to seed default chart of accounts for a tenant
CREATE OR REPLACE FUNCTION seed_chart_of_accounts(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Assets
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, account_subtype, description) VALUES
  (p_tenant_id, '1000', 'Cash and Cash Equivalents', 'ASSET', 'CURRENT_ASSET', 'Bank accounts and cash on hand'),
  (p_tenant_id, '1100', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSET', 'Money owed by customers'),
  (p_tenant_id, '1200', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'Products for resale'),
  (p_tenant_id, '1500', 'Fixed Assets', 'ASSET', 'FIXED_ASSET', 'Property, plant, and equipment'),
  (p_tenant_id, '1600', 'Accumulated Depreciation', 'ASSET', 'FIXED_ASSET', 'Contra-asset account'),
  
  -- Liabilities
  (p_tenant_id, '2000', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'Money owed to suppliers'),
  (p_tenant_id, '2100', 'Credit Cards Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'Credit card balances'),
  (p_tenant_id, '2200', 'Sales Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'Sales tax collected'),
  (p_tenant_id, '2500', 'Long-term Debt', 'LIABILITY', 'LONG_TERM_LIABILITY', 'Loans and mortgages'),
  
  -- Equity
  (p_tenant_id, '3000', 'Owner''s Equity', 'EQUITY', 'CAPITAL', 'Owner''s investment in business'),
  (p_tenant_id, '3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', 'Cumulative net income'),
  (p_tenant_id, '3200', 'Draws', 'EQUITY', 'DRAWS', 'Owner withdrawals'),
  
  -- Revenue
  (p_tenant_id, '4000', 'Sales Revenue', 'REVENUE', 'OPERATING_REVENUE', 'Revenue from sales'),
  (p_tenant_id, '4100', 'Service Revenue', 'REVENUE', 'OPERATING_REVENUE', 'Revenue from services'),
  (p_tenant_id, '4900', 'Other Income', 'REVENUE', 'NON_OPERATING_REVENUE', 'Miscellaneous income'),
  
  -- Expenses
  (p_tenant_id, '5000', 'Cost of Goods Sold', 'EXPENSE', 'COGS', 'Direct costs of products sold'),
  (p_tenant_id, '6000', 'Rent Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'Office or store rent'),
  (p_tenant_id, '6100', 'Utilities Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'Electricity, water, internet'),
  (p_tenant_id, '6200', 'Salaries and Wages', 'EXPENSE', 'OPERATING_EXPENSE', 'Employee compensation'),
  (p_tenant_id, '6300', 'Office Supplies', 'EXPENSE', 'OPERATING_EXPENSE', 'Office materials'),
  (p_tenant_id, '6400', 'Marketing and Advertising', 'EXPENSE', 'OPERATING_EXPENSE', 'Promotional costs'),
  (p_tenant_id, '6500', 'Professional Fees', 'EXPENSE', 'OPERATING_EXPENSE', 'Legal, accounting, consulting'),
  (p_tenant_id, '6600', 'Insurance Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'Business insurance'),
  (p_tenant_id, '6700', 'Depreciation Expense', 'EXPENSE', 'OPERATING_EXPENSE', 'Asset depreciation'),
  (p_tenant_id, '6800', 'Interest Expense', 'EXPENSE', 'NON_OPERATING_EXPENSE', 'Loan interest'),
  (p_tenant_id, '6900', 'Bank Fees', 'EXPENSE', 'OPERATING_EXPENSE', 'Banking charges');
  
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically seed chart of accounts when a new tenant is created
CREATE OR REPLACE FUNCTION auto_seed_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_chart_of_accounts(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_seed_coa
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_chart_of_accounts();

-- View for trial balance
CREATE OR REPLACE VIEW trial_balance AS
SELECT 
  t.tenant_id,
  coa.code,
  coa.name,
  coa.account_type,
  COALESCE(SUM(li.debit), 0) as total_debit,
  COALESCE(SUM(li.credit), 0) as total_credit,
  COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0) as balance
FROM chart_of_accounts coa
LEFT JOIN line_items li ON li.account_id = coa.id
LEFT JOIN transactions t ON t.id = li.transaction_id AND t.status = 'POSTED'
WHERE coa.is_active = true
GROUP BY t.tenant_id, coa.id, coa.code, coa.name, coa.account_type
ORDER BY coa.code;
