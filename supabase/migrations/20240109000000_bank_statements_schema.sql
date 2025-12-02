-- ============================================================================
-- Bank Statement Processing & Reconciliation Schema
-- ============================================================================

-- 1. Bank Accounts Table
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT, -- Last 4 digits or masked
  currency TEXT DEFAULT 'USD',
  bank_name TEXT,
  gl_account_id UUID REFERENCES chart_of_accounts(id), -- Link to GL Asset account
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's bank accounts" ON bank_accounts
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank accounts" ON bank_accounts
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')));

-- 2. Bank Statements Table
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  statement_date DATE,
  start_date DATE,
  end_date DATE,
  opening_balance DECIMAL(15,2),
  closing_balance DECIMAL(15,2),
  status TEXT DEFAULT 'IMPORTED' CHECK (status IN ('IMPORTED', 'PROCESSED', 'RECONCILED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bank statements" ON bank_statements
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank statements" ON bank_statements
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')));

-- 3. Bank Transactions Table (The Feed)
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  bank_statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  amount DECIMAL(15,2) NOT NULL, -- Absolute value
  transaction_type TEXT CHECK (transaction_type IN ('DEBIT', 'CREDIT')), -- DEBIT = Withdrawal, CREDIT = Deposit
  reference_number TEXT,
  category TEXT, -- AI suggested category
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'MATCHED', 'EXCLUDED')),
  matched_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL, -- Link to GL transaction
  confidence_score DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bank transactions" ON bank_transactions
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage bank transactions" ON bank_transactions
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM memberships WHERE user_id = auth.uid() AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')));

-- Indexes
CREATE INDEX idx_bank_transactions_statement ON bank_transactions(bank_statement_id);
CREATE INDEX idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_status ON bank_transactions(status);

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_bank_accounts BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_bank_statements BEFORE UPDATE ON bank_statements FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_bank_transactions BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
