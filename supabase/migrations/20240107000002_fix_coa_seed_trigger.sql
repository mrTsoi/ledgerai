-- ============================================================================
-- FIX: Chart of Accounts Seeding Error (RLS Violation)
-- ============================================================================
-- The error "new row violates row-level security policy for table chart_of_accounts"
-- occurs because the seed function runs with the permissions of the user
-- creating the tenant, who doesn't have INSERT permission on chart_of_accounts yet.
--
-- We fix this by adding SECURITY DEFINER to the seed function.
-- ============================================================================

-- 1. Update the seed function to be SECURITY DEFINER
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update the trigger function to be SECURITY DEFINER as well (for good measure)
CREATE OR REPLACE FUNCTION auto_seed_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_chart_of_accounts(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
