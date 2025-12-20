-- ============================================================================
-- Secure account_balances + reporting RPCs
--
-- Problem:
-- - account_balances is a MATERIALIZED VIEW (not a table), so Row Level Security
--   does not apply.
-- - Reporting RPCs are SECURITY DEFINER and previously accepted arbitrary
--   p_tenant_id, which allows authenticated users to query other tenants if they
--   call RPC directly.
--
-- Fix:
-- 1) Revoke direct access to the materialized view.
-- 2) Expose a tenant-safe security-barrier view for authenticated users.
-- 3) Add explicit membership checks to reporting functions.
-- 4) Remove authenticated access to refresh_account_balances (expensive global refresh).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Restrict direct reads of the materialized view.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.account_balances FROM PUBLIC;
REVOKE ALL ON TABLE public.account_balances FROM anon;
REVOKE ALL ON TABLE public.account_balances FROM authenticated;

-- Keep service_role able to read/debug if needed.
GRANT SELECT ON TABLE public.account_balances TO service_role;

-- ----------------------------------------------------------------------------
-- 2) Provide a tenant-safe view for authenticated users.
--    - Uses security_barrier to prevent predicate pushdown surprises.
--    - Returns balances only for tenants where the caller has an active membership,
--      or the caller is SUPER_ADMIN.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.account_balances_secure
WITH (security_barrier = true)
AS
SELECT ab.*
FROM public.account_balances ab
WHERE
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = ab.tenant_id
      AND m.is_active = true
  );

REVOKE ALL ON TABLE public.account_balances_secure FROM PUBLIC;
GRANT SELECT ON TABLE public.account_balances_secure TO authenticated;
GRANT SELECT ON TABLE public.account_balances_secure TO service_role;

-- ----------------------------------------------------------------------------
-- 3) Harden reporting RPCs: enforce membership for p_tenant_id.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trial_balance(
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
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant_id
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

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
  FROM public.chart_of_accounts coa
  LEFT JOIN public.line_items li ON coa.id = li.account_id
  LEFT JOIN public.transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.is_active = true
    AND (t.id IS NULL OR t.status = 'POSTED')
    AND (p_start_date IS NULL OR t.transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR t.transaction_date <= p_end_date)
  GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.account_subtype
  ORDER BY coa.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_profit_loss(
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
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant_id
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    coa.id,
    coa.code,
    coa.name,
    coa.account_type,
    coa.account_subtype,
    CASE 
      WHEN coa.account_type = 'REVENUE' THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))::DECIMAL(15,2)
      WHEN coa.account_type = 'EXPENSE' THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))::DECIMAL(15,2)
      ELSE 0::DECIMAL(15,2)
    END as amount
  FROM public.chart_of_accounts coa
  LEFT JOIN public.line_items li ON coa.id = li.account_id
  LEFT JOIN public.transactions t ON li.transaction_id = t.id
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

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
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
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant_id
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    coa.id,
    coa.code,
    coa.name,
    coa.account_type,
    coa.account_subtype,
    CASE 
      WHEN coa.account_type = 'ASSET' THEN 
        (COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0))::DECIMAL(15,2)
      WHEN coa.account_type IN ('LIABILITY', 'EQUITY') THEN 
        (COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0))::DECIMAL(15,2)
      ELSE 0::DECIMAL(15,2)
    END as amount
  FROM public.chart_of_accounts coa
  LEFT JOIN public.line_items li ON coa.id = li.account_id
  LEFT JOIN public.transactions t ON li.transaction_id = t.id
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

CREATE OR REPLACE FUNCTION public.get_net_income(
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  v_total_revenue DECIMAL(15,2);
  v_total_expense DECIMAL(15,2);
BEGIN
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant_id
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(
    CASE 
      WHEN coa.account_type = 'REVENUE' THEN 
        (li.credit - li.debit)
      ELSE 0
    END
  ), 0)
  INTO v_total_revenue
  FROM public.chart_of_accounts coa
  JOIN public.line_items li ON coa.id = li.account_id
  JOIN public.transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.account_type = 'REVENUE'
    AND t.status = 'POSTED'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date;

  SELECT COALESCE(SUM(
    CASE 
      WHEN coa.account_type = 'EXPENSE' THEN 
        (li.debit - li.credit)
      ELSE 0
    END
  ), 0)
  INTO v_total_expense
  FROM public.chart_of_accounts coa
  JOIN public.line_items li ON coa.id = li.account_id
  JOIN public.transactions t ON li.transaction_id = t.id
  WHERE coa.tenant_id = p_tenant_id
    AND coa.account_type = 'EXPENSE'
    AND t.status = 'POSTED'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date;

  RETURN v_total_revenue - v_total_expense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_account_activity(
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
  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant_id
      AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH activity AS (
    SELECT 
      t.id,
      t.transaction_date,
      t.description,
      t.reference_number,
      li.debit,
      li.credit
    FROM public.transactions t
    JOIN public.line_items li ON t.id = li.transaction_id
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

-- ----------------------------------------------------------------------------
-- 4) Remove expensive refresh from authenticated users.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.refresh_account_balances() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_account_balances() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_account_balances() TO service_role;
