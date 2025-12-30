-- ============================================================================
-- Fix Super Admin RLS Policies
-- Description: Allow Super Admins to access data across all tenants without explicit membership
-- ============================================================================

-- Helper function to check if user is a Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
    AND role = 'SUPER_ADMIN'
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 0. Tenants (Fix for Settings/Currency update)
-- ============================================================================
DROP POLICY IF EXISTS "Company admins can update their tenants" ON tenants;
CREATE POLICY "Company admins can update their tenants" ON tenants
  FOR UPDATE USING (
    id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 1. Documents
-- ============================================================================
DROP POLICY IF EXISTS "Users can view documents in their tenant" ON documents;
CREATE POLICY "Users can view documents in their tenant" ON documents
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can insert documents in their tenant" ON documents;
CREATE POLICY "Users can insert documents in their tenant" ON documents
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can update documents in their tenant" ON documents;
CREATE POLICY "Users can update documents in their tenant" ON documents
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can delete documents in their tenant" ON documents;
CREATE POLICY "Users can delete documents in their tenant" ON documents
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 2. Document Data
-- ============================================================================
DROP POLICY IF EXISTS "Users can view document data in their tenant" ON document_data;
CREATE POLICY "Users can view document data in their tenant" ON document_data
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents 
      WHERE tenant_id IN (
        SELECT tenant_id FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 3. Chart of Accounts
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their tenant's chart of accounts" ON chart_of_accounts;
CREATE POLICY "Users can view their tenant's chart of accounts" ON chart_of_accounts
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage their tenant's chart of accounts" ON chart_of_accounts;
CREATE POLICY "Admins can manage their tenant's chart of accounts" ON chart_of_accounts
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
      AND is_active = true
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 4. Transactions
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their tenant's transactions" ON transactions;
CREATE POLICY "Users can view their tenant's transactions" ON transactions
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can create transactions in their tenant" ON transactions;
CREATE POLICY "Users can create transactions in their tenant" ON transactions
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can update draft transactions in their tenant" ON transactions;
CREATE POLICY "Users can update draft transactions in their tenant" ON transactions
  FOR UPDATE USING (
    (
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
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can delete transactions in their tenant" ON transactions;
CREATE POLICY "Admins can delete transactions in their tenant" ON transactions
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 5. Line Items
-- ============================================================================
DROP POLICY IF EXISTS "Users can view line items for their tenant's transactions" ON line_items;
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
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can manage line items for their tenant's transactions" ON line_items;
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
    OR public.is_super_admin()
  );

-- ============================================================================
-- 6. Bank Accounts
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their tenant's bank accounts" ON bank_accounts;
CREATE POLICY "Users can view their tenant's bank accounts" ON bank_accounts
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage bank accounts" ON bank_accounts;
CREATE POLICY "Admins can manage bank accounts" ON bank_accounts
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 7. Bank Statements
-- ============================================================================
DROP POLICY IF EXISTS "Users can view bank statements" ON bank_statements;
CREATE POLICY "Users can view bank statements" ON bank_statements
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage bank statements" ON bank_statements;
CREATE POLICY "Admins can manage bank statements" ON bank_statements
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  );

-- ============================================================================
-- 8. Bank Transactions
-- ============================================================================
DROP POLICY IF EXISTS "Users can view bank transactions" ON bank_transactions;
CREATE POLICY "Users can view bank transactions" ON bank_transactions
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage bank transactions" ON bank_transactions;
CREATE POLICY "Admins can manage bank transactions" ON bank_transactions
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  );
