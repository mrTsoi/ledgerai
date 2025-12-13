


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."auto_seed_chart_of_accounts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM seed_chart_of_accounts(NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_seed_chart_of_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_ai_rate_limit"("p_tenant_id" "uuid", "p_provider_id" "uuid", "p_limit_min" integer, "p_limit_hour" integer, "p_limit_day" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    v_count_min integer;
    v_count_hour integer;
    v_count_day integer;
begin
    -- Check minute limit
    if p_limit_min > 0 then
        select count(*) into v_count_min
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '1 minute';
        
        if v_count_min >= p_limit_min then
            return false;
        end if;
    end if;

    -- Check hour limit
    if p_limit_hour > 0 then
        select count(*) into v_count_hour
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '1 hour';
        
        if v_count_hour >= p_limit_hour then
            return false;
        end if;
    end if;

    -- Check day limit
    if p_limit_day > 0 then
        select count(*) into v_count_day
        from public.ai_usage_logs
        where tenant_id = p_tenant_id
        and ai_provider_id = p_provider_id
        and created_at > now() - interval '24 hours';
        
        if v_count_day >= p_limit_day then
            return false;
        end if;
    end if;

    return true;
end;
$$;


ALTER FUNCTION "public"."check_ai_rate_limit"("p_tenant_id" "uuid", "p_provider_id" "uuid", "p_limit_min" integer, "p_limit_hour" integer, "p_limit_day" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_tenant_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
  user_plan_id UUID;
BEGIN
  -- Get user's plan
  SELECT plan_id INTO user_plan_id FROM user_subscriptions WHERE user_id = NEW.owner_id;
  
  -- If no plan, assume free (or handle as error, but let's default to free logic if we auto-assign)
  -- For now, if no subscription record, we block or allow 1. Let's allow 1 if no record found (implicit free).
  
  IF user_plan_id IS NULL THEN
     -- Check if they already have any tenant as owner
     SELECT COUNT(*) INTO current_count FROM tenants WHERE owner_id = NEW.owner_id;
     IF current_count >= 1 THEN
       RAISE EXCEPTION 'No subscription found. Free limit of 1 tenant reached.';
     END IF;
  ELSE
     SELECT max_tenants INTO max_allowed FROM subscription_plans WHERE id = user_plan_id;
     
     -- -1 means unlimited
     IF max_allowed != -1 THEN
       SELECT COUNT(*) INTO current_count FROM tenants WHERE owner_id = NEW.owner_id;
       IF current_count >= max_allowed THEN
         RAISE EXCEPTION 'Tenant limit reached for your current subscription plan.';
       END IF;
     END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_tenant_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid" DEFAULT NULL::"uuid", "p_old_data" "jsonb" DEFAULT NULL::"jsonb", "p_new_data" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  -- Insert audit log
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    v_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_data,
    p_new_data
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


ALTER FUNCTION "public"."create_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_activity"("p_tenant_id" "uuid", "p_account_id" "uuid", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("transaction_id" "uuid", "transaction_date" "date", "description" "text", "reference_number" "text", "debit" numeric, "credit" numeric, "running_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_account_activity"("p_tenant_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_balance_sheet"("p_tenant_id" "uuid", "p_as_of_date" "date") RETURNS TABLE("account_id" "uuid", "account_code" "text", "account_name" "text", "account_type" "text", "account_subtype" "text", "amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_balance_sheet"("p_tenant_id" "uuid", "p_as_of_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_net_income"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_net_income"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profit_loss"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("account_id" "uuid", "account_code" "text", "account_name" "text", "account_type" "text", "account_subtype" "text", "amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_profit_loss"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_stats"() RETURNS TABLE("total_mrr" numeric, "active_subscriptions" bigint, "plan_breakdown" json)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_total_mrr NUMERIC;
  v_active_subs BIGINT;
  v_breakdown JSON;
BEGIN
  -- Calculate MRR (Monthly Recurring Revenue)
  SELECT COALESCE(SUM(
    CASE 
      WHEN sp.price_yearly > 0 AND us.current_period_end > (NOW() + INTERVAL '30 days') THEN sp.price_yearly / 12
      ELSE sp.price_monthly 
    END
  ), 0)
  INTO v_total_mrr
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.status = 'active';

  -- Count active subscriptions
  SELECT COUNT(*) INTO v_active_subs
  FROM user_subscriptions
  WHERE status = 'active';

  -- Get breakdown by plan
  SELECT json_agg(row_to_json(t)) INTO v_breakdown
  FROM (
    SELECT sp.name, COUNT(*) as count, SUM(sp.price_monthly) as revenue
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.status = 'active'
    GROUP BY sp.name
  ) t;

  RETURN QUERY SELECT v_total_mrr, v_active_subs, COALESCE(v_breakdown, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."get_subscription_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_overview"() RETURNS TABLE("total_tenants" integer, "active_tenants" integer, "total_users" integer, "total_documents" integer, "total_transactions" integer, "storage_used_gb" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM tenants) as total_tenants,
    (SELECT COUNT(*)::INTEGER FROM tenants WHERE created_at > NOW() - INTERVAL '30 days') as active_tenants,
    (SELECT COUNT(DISTINCT user_id)::INTEGER FROM memberships) as total_users,
    (SELECT COUNT(*)::INTEGER FROM documents) as total_documents,
    (SELECT COUNT(*)::INTEGER FROM transactions WHERE status = 'POSTED') as total_transactions,
    (SELECT COALESCE(SUM(storage_used_bytes), 0)::DECIMAL(10,2) / 1073741824 FROM tenant_statistics) as storage_used_gb;
END;
$$;


ALTER FUNCTION "public"."get_system_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_trends"("p_start_date" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "p_end_date" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("date" "date", "new_tenants" bigint, "new_users" bigint, "new_documents" bigint, "new_transactions" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT 
    dates.d,
    COUNT(DISTINCT t.id) FILTER (WHERE t.created_at::date = dates.d) as new_tenants,
    COUNT(DISTINCT p.id) FILTER (WHERE p.created_at::date = dates.d) as new_users,
    COUNT(DISTINCT d.id) FILTER (WHERE d.created_at::date = dates.d) as new_documents,
    COUNT(DISTINCT tr.id) FILTER (WHERE tr.created_at::date = dates.d) as new_transactions
  FROM dates
  LEFT JOIN tenants t ON t.created_at::date = dates.d
  LEFT JOIN profiles p ON p.created_at::date = dates.d
  LEFT JOIN documents d ON d.created_at::date = dates.d
  LEFT JOIN transactions tr ON tr.created_at::date = dates.d
  GROUP BY dates.d
  ORDER BY dates.d;
END;
$$;


ALTER FUNCTION "public"."get_system_trends"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_currency"("p_tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_currency TEXT;
BEGIN
  SELECT currency INTO v_currency FROM tenants WHERE id = p_tenant_id;
  RETURN v_currency;
END;
$$;


ALTER FUNCTION "public"."get_tenant_currency"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_details"("p_tenant_id" "uuid") RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "locale" "text", "created_at" timestamp with time zone, "user_count" integer, "document_count" integer, "transaction_count" integer, "total_revenue" numeric, "total_expenses" numeric, "net_income" numeric, "last_activity" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update statistics first
  PERFORM update_tenant_statistics(p_tenant_id);

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.locale,
    t.created_at,
    ts.user_count,
    ts.document_count,
    ts.transaction_count,
    ts.total_revenue,
    ts.total_expenses,
    (ts.total_revenue - ts.total_expenses) as net_income,
    ts.last_activity
  FROM tenants t
  LEFT JOIN tenant_statistics ts ON t.id = ts.tenant_id
  WHERE t.id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."get_tenant_details"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trial_balance"("p_tenant_id" "uuid", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("account_id" "uuid", "account_code" "text", "account_name" "text", "account_type" "text", "account_subtype" "text", "debit_amount" numeric, "credit_amount" numeric, "balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_trial_balance"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_subscription_details"("p_user_id" "uuid") RETURNS TABLE("plan_name" "text", "max_tenants" integer, "current_tenants" integer, "max_documents" integer, "current_documents" integer, "max_storage_bytes" bigint, "current_storage_bytes" bigint, "price_monthly" numeric, "status" "text", "current_period_start" timestamp with time zone, "current_period_end" timestamp with time zone, "features" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.name,
    sp.max_tenants,
    (SELECT COUNT(*)::INTEGER FROM tenants t WHERE t.owner_id = p_user_id),
    sp.max_documents,
    (SELECT COUNT(*)::INTEGER FROM documents d JOIN tenants t ON d.tenant_id = t.id WHERE t.owner_id = p_user_id),
    sp.max_storage_bytes,
    (SELECT COALESCE(SUM(d.file_size), 0)::BIGINT FROM documents d JOIN tenants t ON d.tenant_id = t.id WHERE t.owner_id = p_user_id),
    sp.price_monthly,
    us.status,
    us.current_period_start,
    us.current_period_end,
    sp.features
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_subscription_details"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenant_ids"() RETURNS TABLE("tenant_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT m.tenant_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_user_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
  
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO user_subscriptions (user_id, plan_id)
    VALUES (NEW.id, free_plan_id);
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
    AND role = 'SUPER_ADMIN'
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_account_balances"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW account_balances;
END;
$$;


ALTER FUNCTION "public"."refresh_account_balances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_chart_of_accounts"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."seed_chart_of_accounts"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_audit_tenant_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM create_audit_log(
      NEW.id,
      'UPDATE',
      'tenant',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM create_audit_log(
      OLD.id,
      'DELETE',
      'tenant',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_audit_tenant_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_create_tenant_statistics"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insert the statistics row. 
  -- Because this function is SECURITY DEFINER, it bypasses RLS.
  INSERT INTO tenant_statistics (tenant_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_create_tenant_statistics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_refresh_account_balances"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only refresh if transaction is posted
  IF (TG_OP = 'INSERT' AND NEW.status = 'POSTED') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'POSTED' AND OLD.status != 'POSTED') THEN
    PERFORM refresh_account_balances();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_refresh_account_balances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_statistics"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_count INTEGER;
  v_document_count INTEGER;
  v_transaction_count INTEGER;
  v_total_revenue DECIMAL(15,2);
  v_total_expenses DECIMAL(15,2);
  v_last_activity TIMESTAMPTZ;
BEGIN
  -- Count users
  SELECT COUNT(*) INTO v_user_count
  FROM memberships
  WHERE tenant_id = p_tenant_id;

  -- Count documents
  SELECT COUNT(*) INTO v_document_count
  FROM documents
  WHERE tenant_id = p_tenant_id;

  -- Count transactions
  SELECT COUNT(*) INTO v_transaction_count
  FROM transactions
  WHERE tenant_id = p_tenant_id
  AND status = 'POSTED';

  -- Calculate total revenue (YTD)
  SELECT COALESCE(SUM(
    CASE WHEN coa.account_type = 'REVENUE' THEN (li.credit - li.debit) ELSE 0 END
  ), 0) INTO v_total_revenue
  FROM line_items li
  JOIN transactions t ON li.transaction_id = t.id
  JOIN chart_of_accounts coa ON li.account_id = coa.id
  WHERE t.tenant_id = p_tenant_id
  AND t.status = 'POSTED'
  AND EXTRACT(YEAR FROM t.transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Calculate total expenses (YTD)
  SELECT COALESCE(SUM(
    CASE WHEN coa.account_type = 'EXPENSE' THEN (li.debit - li.credit) ELSE 0 END
  ), 0) INTO v_total_expenses
  FROM line_items li
  JOIN transactions t ON li.transaction_id = t.id
  JOIN chart_of_accounts coa ON li.account_id = coa.id
  WHERE t.tenant_id = p_tenant_id
  AND t.status = 'POSTED'
  AND EXTRACT(YEAR FROM t.transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  -- Get last activity
  SELECT MAX(created_at) INTO v_last_activity
  FROM (
    SELECT created_at FROM documents WHERE tenant_id = p_tenant_id
    UNION ALL
    SELECT created_at FROM transactions WHERE tenant_id = p_tenant_id
    UNION ALL
    SELECT created_at FROM memberships WHERE tenant_id = p_tenant_id
  ) activities;

  -- Upsert statistics
  INSERT INTO tenant_statistics (
    tenant_id,
    user_count,
    document_count,
    transaction_count,
    total_revenue,
    total_expenses,
    last_activity,
    updated_at
  ) VALUES (
    p_tenant_id,
    v_user_count,
    v_document_count,
    v_transaction_count,
    v_total_revenue,
    v_total_expenses,
    v_last_activity,
    NOW()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    user_count = EXCLUDED.user_count,
    document_count = EXCLUDED.document_count,
    transaction_count = EXCLUDED.transaction_count,
    total_revenue = EXCLUDED.total_revenue,
    total_expenses = EXCLUDED.total_expenses,
    last_activity = EXCLUDED.last_activity,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."update_tenant_statistics"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_tenant_documents"("tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND memberships.tenant_id = user_can_access_tenant_documents.tenant_id
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."user_can_access_tenant_documents"("tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("required_roles" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN user_role = ANY(required_roles);
END;
$$;


ALTER FUNCTION "public"."user_has_role"("required_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_transaction_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_transaction_balance"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "account_subtype" "text",
    "parent_account_id" "uuid",
    "is_active" boolean DEFAULT true,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "chart_of_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['ASSET'::"text", 'LIABILITY'::"text", 'EQUITY'::"text", 'REVENUE'::"text", 'EXPENSE'::"text"])))
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "debit" numeric(15,2) DEFAULT 0,
    "credit" numeric(15,2) DEFAULT 0,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "debit_foreign" numeric(15,2) DEFAULT 0,
    "credit_foreign" numeric(15,2) DEFAULT 0,
    CONSTRAINT "debit_or_credit_not_both" CHECK (((("debit" > (0)::numeric) AND ("credit" = (0)::numeric)) OR (("credit" > (0)::numeric) AND ("debit" = (0)::numeric)))),
    CONSTRAINT "line_items_credit_check" CHECK (("credit" >= (0)::numeric)),
    CONSTRAINT "line_items_debit_check" CHECK (("debit" >= (0)::numeric))
);


ALTER TABLE "public"."line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "description" "text",
    "reference_number" "text",
    "status" "text" DEFAULT 'DRAFT'::"text",
    "document_id" "uuid",
    "created_by" "uuid",
    "posted_by" "uuid",
    "posted_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "currency" "text" DEFAULT 'USD'::"text",
    "exchange_rate" numeric(10,6) DEFAULT 1.0,
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'POSTED'::"text", 'VOID'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."account_balances" AS
 SELECT "coa"."id" AS "account_id",
    "coa"."tenant_id",
    "coa"."code",
    "coa"."name",
    "coa"."account_type",
    "coa"."account_subtype",
    COALESCE("sum"("li"."debit"), (0)::numeric) AS "total_debit",
    COALESCE("sum"("li"."credit"), (0)::numeric) AS "total_credit",
        CASE
            WHEN ("coa"."account_type" = ANY (ARRAY['ASSET'::"text", 'EXPENSE'::"text"])) THEN (COALESCE("sum"("li"."debit"), (0)::numeric) - COALESCE("sum"("li"."credit"), (0)::numeric))
            WHEN ("coa"."account_type" = ANY (ARRAY['LIABILITY'::"text", 'EQUITY'::"text", 'REVENUE'::"text"])) THEN (COALESCE("sum"("li"."credit"), (0)::numeric) - COALESCE("sum"("li"."debit"), (0)::numeric))
            ELSE (0)::numeric
        END AS "balance"
   FROM (("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."line_items" "li" ON (("coa"."id" = "li"."account_id")))
     LEFT JOIN "public"."transactions" "t" ON ((("li"."transaction_id" = "t"."id") AND ("t"."status" = 'POSTED'::"text"))))
  WHERE ("coa"."is_active" = true)
  GROUP BY "coa"."id", "coa"."tenant_id", "coa"."code", "coa"."name", "coa"."account_type", "coa"."account_subtype"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."account_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'ACCOUNTANT'::"text", 'OPERATOR'::"text", 'SUPER_ADMIN'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "is_active" boolean DEFAULT true,
    "subscription_plan" "text" DEFAULT 'free'::"text",
    "subscription_status" "text" DEFAULT 'active'::"text",
    "owner_id" "uuid",
    "currency" "text" DEFAULT 'USD'::"text",
    CONSTRAINT "check_subscription_status" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'canceled'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_user_view" AS
 SELECT "p"."id" AS "user_id",
    "p"."email",
    "p"."full_name",
    "p"."created_at" AS "user_created_at",
    "m"."tenant_id",
    "t"."name" AS "tenant_name",
    "m"."role",
    "m"."is_active" AS "membership_active"
   FROM (("public"."profiles" "p"
     LEFT JOIN "public"."memberships" "m" ON (("p"."id" = "m"."user_id")))
     LEFT JOIN "public"."tenants" "t" ON (("m"."tenant_id" = "t"."id")));


ALTER VIEW "public"."admin_user_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "api_endpoint" "text",
    "is_active" boolean DEFAULT true,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."ai_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "ai_provider_id" "uuid",
    "model" "text",
    "tokens_input" integer DEFAULT 0,
    "tokens_output" integer DEFAULT 0,
    "status" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_usage_logs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_translations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "locale" "text" NOT NULL,
    "namespace" "text" DEFAULT 'common'::"text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_translations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_number" "text",
    "currency" "text" DEFAULT 'USD'::"text",
    "bank_name" "text",
    "gl_account_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "bank_account_id" "uuid",
    "document_id" "uuid",
    "statement_date" "date",
    "start_date" "date",
    "end_date" "date",
    "opening_balance" numeric(15,2),
    "closing_balance" numeric(15,2),
    "status" "text" DEFAULT 'IMPORTED'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bank_statements_status_check" CHECK (("status" = ANY (ARRAY['IMPORTED'::"text", 'PROCESSED'::"text", 'RECONCILED'::"text"])))
);


ALTER TABLE "public"."bank_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "bank_statement_id" "uuid",
    "transaction_date" "date" NOT NULL,
    "description" "text",
    "amount" numeric(15,2) NOT NULL,
    "transaction_type" "text",
    "reference_number" "text",
    "category" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "matched_transaction_id" "uuid",
    "confidence_score" numeric(3,2),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bank_transactions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'MATCHED'::"text", 'EXCLUDED'::"text"]))),
    CONSTRAINT "bank_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['DEBIT'::"text", 'CREDIT'::"text"])))
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_invoice_id" "text" NOT NULL,
    "amount_paid" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text",
    "status" "text",
    "invoice_pdf" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "description" "text",
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone
);


ALTER TABLE "public"."billing_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "extracted_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "confidence_score" numeric(3,2),
    "vendor_name" "text",
    "document_date" "date",
    "total_amount" numeric(12,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "line_items" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."document_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "file_type" "text" NOT NULL,
    "status" "text" DEFAULT 'UPLOADED'::"text",
    "document_type" "text",
    "uploaded_by" "uuid",
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "validation_status" "text" DEFAULT 'PENDING'::"text",
    "validation_flags" "jsonb" DEFAULT '[]'::"jsonb",
    "content_hash" "text",
    CONSTRAINT "documents_status_check" CHECK (("status" = ANY (ARRAY['UPLOADED'::"text", 'PROCESSING'::"text", 'PROCESSED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exchange_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "currency" "text" NOT NULL,
    "rate" numeric(10,6) NOT NULL,
    "is_manual" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exchange_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_sources_cron_secrets" (
    "tenant_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "default_run_limit" integer DEFAULT 10 NOT NULL,
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."external_sources_cron_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "valid_from" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "valid_until" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "promo_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['PERCENTAGE'::"text", 'FIXED_AMOUNT'::"text"])))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "report_type" "text" NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "report_templates_report_type_check" CHECK (("report_type" = ANY (ARRAY['trial_balance'::"text", 'profit_loss'::"text", 'balance_sheet'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."report_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "report_name" "text" NOT NULL,
    "report_data" "jsonb" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "max_tenants" integer DEFAULT 1 NOT NULL,
    "max_documents" integer DEFAULT 1000 NOT NULL,
    "max_storage_bytes" bigint DEFAULT '5368709120'::bigint NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb",
    "price_monthly" numeric(10,2) DEFAULT 0,
    "price_yearly" numeric(10,2) DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "yearly_discount_percent" integer DEFAULT 20
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_languages" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "flag_emoji" "text",
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_languages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_ai_configurations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ai_provider_id" "uuid",
    "api_key_encrypted" "text",
    "model_name" "text",
    "custom_config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."tenant_ai_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_statistics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_count" integer DEFAULT 0,
    "document_count" integer DEFAULT 0,
    "transaction_count" integer DEFAULT 0,
    "total_revenue" numeric(15,2) DEFAULT 0,
    "total_expenses" numeric(15,2) DEFAULT 0,
    "last_activity" timestamp with time zone,
    "storage_used_bytes" bigint DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_statistics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."trial_balance" AS
 SELECT "t"."tenant_id",
    "coa"."code",
    "coa"."name",
    "coa"."account_type",
    COALESCE("sum"("li"."debit"), (0)::numeric) AS "total_debit",
    COALESCE("sum"("li"."credit"), (0)::numeric) AS "total_credit",
    (COALESCE("sum"("li"."debit"), (0)::numeric) - COALESCE("sum"("li"."credit"), (0)::numeric)) AS "balance"
   FROM (("public"."chart_of_accounts" "coa"
     LEFT JOIN "public"."line_items" "li" ON (("li"."account_id" = "coa"."id")))
     LEFT JOIN "public"."transactions" "t" ON ((("t"."id" = "li"."transaction_id") AND ("t"."status" = 'POSTED'::"text"))))
  WHERE ("coa"."is_active" = true)
  GROUP BY "t"."tenant_id", "coa"."id", "coa"."code", "coa"."name", "coa"."account_type"
  ORDER BY "coa"."code";


ALTER VIEW "public"."trial_balance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "current_period_start" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "next_plan_id" "uuid",
    "next_plan_start_date" timestamp with time zone,
    CONSTRAINT "user_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'past_due'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_providers"
    ADD CONSTRAINT "ai_providers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ai_providers"
    ADD CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_translations"
    ADD CONSTRAINT "app_translations_locale_namespace_key_key" UNIQUE ("locale", "namespace", "key");



ALTER TABLE ONLY "public"."app_translations"
    ADD CONSTRAINT "app_translations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_stripe_invoice_id_key" UNIQUE ("stripe_invoice_id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."document_data"
    ADD CONSTRAINT "document_data_document_id_key" UNIQUE ("document_id");



ALTER TABLE ONLY "public"."document_data"
    ADD CONSTRAINT "document_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_tenant_id_currency_key" UNIQUE ("tenant_id", "currency");



ALTER TABLE ONLY "public"."external_sources_cron_secrets"
    ADD CONSTRAINT "external_sources_cron_secrets_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."line_items"
    ADD CONSTRAINT "line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_tenant_id_key" UNIQUE ("user_id", "tenant_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_languages"
    ADD CONSTRAINT "system_languages_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."tenant_ai_configurations"
    ADD CONSTRAINT "tenant_ai_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_ai_configurations"
    ADD CONSTRAINT "tenant_ai_configurations_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_tenant_id_setting_key_key" UNIQUE ("tenant_id", "setting_key");



ALTER TABLE ONLY "public"."tenant_statistics"
    ADD CONSTRAINT "tenant_statistics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_statistics"
    ADD CONSTRAINT "tenant_statistics_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_account_balances_tenant" ON "public"."account_balances" USING "btree" ("tenant_id");



CREATE INDEX "idx_account_balances_type" ON "public"."account_balances" USING "btree" ("account_type");



CREATE INDEX "idx_ai_usage_logs_provider_created" ON "public"."ai_usage_logs" USING "btree" ("ai_provider_id", "created_at");



CREATE INDEX "idx_ai_usage_logs_tenant_created" ON "public"."ai_usage_logs" USING "btree" ("tenant_id", "created_at");



CREATE INDEX "idx_app_translations_locale" ON "public"."app_translations" USING "btree" ("locale");



CREATE INDEX "idx_app_translations_lookup" ON "public"."app_translations" USING "btree" ("locale", "namespace", "key");



CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING "btree" ("action");



CREATE INDEX "idx_audit_logs_created" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_resource" ON "public"."audit_logs" USING "btree" ("resource_type", "resource_id");



CREATE INDEX "idx_audit_logs_tenant" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "idx_audit_logs_user" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_bank_transactions_date" ON "public"."bank_transactions" USING "btree" ("transaction_date");



CREATE INDEX "idx_bank_transactions_statement" ON "public"."bank_transactions" USING "btree" ("bank_statement_id");



CREATE INDEX "idx_bank_transactions_status" ON "public"."bank_transactions" USING "btree" ("status");



CREATE INDEX "idx_coa_active" ON "public"."chart_of_accounts" USING "btree" ("is_active");



CREATE INDEX "idx_coa_code" ON "public"."chart_of_accounts" USING "btree" ("code");



CREATE INDEX "idx_coa_tenant_id" ON "public"."chart_of_accounts" USING "btree" ("tenant_id");



CREATE INDEX "idx_coa_type" ON "public"."chart_of_accounts" USING "btree" ("account_type");



CREATE INDEX "idx_document_data_document_date" ON "public"."document_data" USING "btree" ("document_date" DESC);



CREATE INDEX "idx_document_data_document_id" ON "public"."document_data" USING "btree" ("document_id");



CREATE INDEX "idx_document_data_vendor_name" ON "public"."document_data" USING "btree" ("vendor_name");



CREATE INDEX "idx_documents_content_hash" ON "public"."documents" USING "btree" ("content_hash");



CREATE INDEX "idx_documents_created_at" ON "public"."documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_documents_status" ON "public"."documents" USING "btree" ("status");



CREATE INDEX "idx_documents_tenant_id" ON "public"."documents" USING "btree" ("tenant_id");



CREATE INDEX "idx_documents_uploaded_by" ON "public"."documents" USING "btree" ("uploaded_by");



CREATE INDEX "idx_external_sources_cron_secrets_enabled" ON "public"."external_sources_cron_secrets" USING "btree" ("enabled");



CREATE INDEX "idx_line_items_account_id" ON "public"."line_items" USING "btree" ("account_id");



CREATE INDEX "idx_line_items_transaction_id" ON "public"."line_items" USING "btree" ("transaction_id");



CREATE INDEX "idx_memberships_tenant_id" ON "public"."memberships" USING "btree" ("tenant_id");



CREATE INDEX "idx_memberships_user_id" ON "public"."memberships" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_report_templates_tenant" ON "public"."report_templates" USING "btree" ("tenant_id");



CREATE INDEX "idx_saved_reports_date" ON "public"."saved_reports" USING "btree" ("generated_at");



CREATE INDEX "idx_saved_reports_tenant" ON "public"."saved_reports" USING "btree" ("tenant_id");



CREATE INDEX "idx_saved_reports_type" ON "public"."saved_reports" USING "btree" ("report_type");



CREATE INDEX "idx_system_settings_key" ON "public"."system_settings" USING "btree" ("setting_key");



CREATE INDEX "idx_tenant_ai_config_tenant_id" ON "public"."tenant_ai_configurations" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_statistics_tenant" ON "public"."tenant_statistics" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenants_active" ON "public"."tenants" USING "btree" ("is_active");



CREATE INDEX "idx_tenants_slug" ON "public"."tenants" USING "btree" ("slug");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("transaction_date" DESC);



CREATE INDEX "idx_transactions_document_id" ON "public"."transactions" USING "btree" ("document_id");



CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("status");



CREATE INDEX "idx_transactions_tenant_id" ON "public"."transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_subscriptions_stripe_cust" ON "public"."user_subscriptions" USING "btree" ("stripe_customer_id");



CREATE OR REPLACE TRIGGER "audit_tenant_changes" AFTER DELETE OR UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_audit_tenant_changes"();



CREATE OR REPLACE TRIGGER "check_tenant_creation_limit" BEFORE INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."check_tenant_limit"();



CREATE OR REPLACE TRIGGER "create_tenant_statistics" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_create_tenant_statistics"();



CREATE OR REPLACE TRIGGER "refresh_balances_on_transaction" AFTER INSERT OR UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_refresh_account_balances"();



CREATE OR REPLACE TRIGGER "set_updated_at_ai_providers" BEFORE UPDATE ON "public"."ai_providers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_app_translations" BEFORE UPDATE ON "public"."app_translations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_bank_accounts" BEFORE UPDATE ON "public"."bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_bank_statements" BEFORE UPDATE ON "public"."bank_statements" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_bank_transactions" BEFORE UPDATE ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_chart_of_accounts" BEFORE UPDATE ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_document_data" BEFORE UPDATE ON "public"."document_data" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_documents" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_external_sources_cron_secrets" BEFORE UPDATE ON "public"."external_sources_cron_secrets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_line_items" BEFORE UPDATE ON "public"."line_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_memberships" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tenant_ai_configurations" BEFORE UPDATE ON "public"."tenant_ai_configurations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tenants" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_transactions" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_auto_seed_coa" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."auto_seed_chart_of_accounts"();



CREATE OR REPLACE TRIGGER "update_exchange_rates_updated_at" BEFORE UPDATE ON "public"."exchange_rates" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_promo_codes_updated_at" BEFORE UPDATE ON "public"."promo_codes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "validate_line_item_balance" AFTER INSERT OR UPDATE ON "public"."line_items" FOR EACH ROW EXECUTE FUNCTION "public"."validate_transaction_balance"();



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_ai_provider_id_fkey" FOREIGN KEY ("ai_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_translations"
    ADD CONSTRAINT "app_translations_locale_fkey" FOREIGN KEY ("locale") REFERENCES "public"."system_languages"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_bank_statement_id_fkey" FOREIGN KEY ("bank_statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_matched_transaction_id_fkey" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_invoices"
    ADD CONSTRAINT "billing_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_data"
    ADD CONSTRAINT "document_data_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_sources_cron_secrets"
    ADD CONSTRAINT "external_sources_cron_secrets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_items"
    ADD CONSTRAINT "line_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."line_items"
    ADD CONSTRAINT "line_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tenant_ai_configurations"
    ADD CONSTRAINT "tenant_ai_configurations_ai_provider_id_fkey" FOREIGN KEY ("ai_provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_ai_configurations"
    ADD CONSTRAINT "tenant_ai_configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_settings"
    ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_statistics"
    ADD CONSTRAINT "tenant_statistics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_next_plan_id_fkey" FOREIGN KEY ("next_plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Accountants can create saved reports" ON "public"."saved_reports" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'ACCOUNTANT'::"text", 'SUPER_ADMIN'::"text"]))))));



CREATE POLICY "Admins and Accountants can manage exchange rates" ON "public"."exchange_rates" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."tenant_id" = "exchange_rates"."tenant_id") AND ("memberships"."role" = ANY (ARRAY['SUPER_ADMIN'::"text", 'COMPANY_ADMIN'::"text", 'ACCOUNTANT'::"text"]))))));



CREATE POLICY "Admins can delete transactions in their tenant" ON "public"."transactions" FOR DELETE USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"])) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Admins can manage bank accounts" ON "public"."bank_accounts" USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))) OR "public"."is_super_admin"()));



CREATE POLICY "Admins can manage bank statements" ON "public"."bank_statements" USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))) OR "public"."is_super_admin"()));



CREATE POLICY "Admins can manage bank transactions" ON "public"."bank_transactions" USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))) OR "public"."is_super_admin"()));



CREATE POLICY "Admins can manage their tenant's chart of accounts" ON "public"."chart_of_accounts" USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'ACCOUNTANT'::"text", 'SUPER_ADMIN'::"text"])) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Admins can view their tenant's usage logs" ON "public"."ai_usage_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."tenant_id" = "ai_usage_logs"."tenant_id") AND ("memberships"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Company admins can manage report templates" ON "public"."report_templates" USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))));



CREATE POLICY "Company admins can manage their tenant AI config" ON "public"."tenant_ai_configurations" USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"])) AND ("memberships"."is_active" = true)))));



CREATE POLICY "Company admins can update their tenants" ON "public"."tenants" FOR UPDATE USING ((("id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"])) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Company admins can view their tenant's audit logs" ON "public"."audit_logs" FOR SELECT USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))));



CREATE POLICY "Company admins can view their tenant's statistics" ON "public"."tenant_statistics" FOR SELECT USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))));



CREATE POLICY "Everyone can read active languages" ON "public"."system_languages" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Everyone can read translations" ON "public"."app_translations" FOR SELECT USING (true);



CREATE POLICY "Everyone can view active plans" ON "public"."subscription_plans" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Platform admins can manage all tenant settings" ON "public"."tenant_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "Public can view public system settings" ON "public"."system_settings" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Public settings are readable by authenticated users" ON "public"."system_settings" FOR SELECT USING ((("is_public" = true) AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "Super Admins can manage languages" ON "public"."system_languages" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "Super Admins can manage translations" ON "public"."app_translations" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "Super admins can manage AI providers" ON "public"."ai_providers" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can manage plans" ON "public"."subscription_plans" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can manage promo codes" ON "public"."promo_codes" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can manage system settings" ON "public"."system_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "Super admins can view all audit logs" ON "public"."audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "Super admins can view all invoices" ON "public"."billing_invoices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can view all profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can view all subscriptions" ON "public"."user_subscriptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text") AND ("memberships"."is_active" = true)))));



CREATE POLICY "Super admins can view all tenant statistics" ON "public"."tenant_statistics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "System can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "System can insert usage logs" ON "public"."ai_usage_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Tenant admins can manage their settings" ON "public"."tenant_settings" USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"])))))) WITH CHECK (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))));



CREATE POLICY "Users can create transactions in their tenant" ON "public"."transactions" FOR INSERT WITH CHECK ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can delete documents in their tenant" ON "public"."documents" FOR DELETE USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true) AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'SUPER_ADMIN'::"text"]))))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can delete their own subscription" ON "public"."user_subscriptions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert document data in their tenant" ON "public"."document_data" FOR INSERT WITH CHECK (("document_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE ("documents"."tenant_id" IN ( SELECT "memberships"."tenant_id"
           FROM "public"."memberships"
          WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))))));



CREATE POLICY "Users can insert documents in their tenant" ON "public"."documents" FOR INSERT WITH CHECK ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own subscription" ON "public"."user_subscriptions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage line items for their tenant's transactions" ON "public"."line_items" USING ((("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."tenant_id" IN ( SELECT "memberships"."tenant_id"
           FROM "public"."memberships"
          WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can update document data in their tenant" ON "public"."document_data" FOR UPDATE USING (("document_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE ("documents"."tenant_id" IN ( SELECT "memberships"."tenant_id"
           FROM "public"."memberships"
          WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))))));



CREATE POLICY "Users can update documents in their tenant" ON "public"."documents" FOR UPDATE USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can update draft transactions in their tenant" ON "public"."transactions" FOR UPDATE USING (((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) AND (("status" = 'DRAFT'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."tenant_id" = "transactions"."tenant_id") AND ("memberships"."role" = ANY (ARRAY['COMPANY_ADMIN'::"text", 'ACCOUNTANT'::"text", 'SUPER_ADMIN'::"text"])) AND ("memberships"."is_active" = true)))))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own subscription" ON "public"."user_subscriptions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view active AI providers" ON "public"."ai_providers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view bank statements" ON "public"."bank_statements" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view bank transactions" ON "public"."bank_transactions" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view document data in their tenant" ON "public"."document_data" FOR SELECT USING ((("document_id" IN ( SELECT "documents"."id"
   FROM "public"."documents"
  WHERE ("documents"."tenant_id" IN ( SELECT "memberships"."tenant_id"
           FROM "public"."memberships"
          WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view documents in their tenant" ON "public"."documents" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view exchange rates for their tenant" ON "public"."exchange_rates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."tenant_id" = "exchange_rates"."tenant_id")))));



CREATE POLICY "Users can view line items for their tenant's transactions" ON "public"."line_items" FOR SELECT USING ((("transaction_id" IN ( SELECT "transactions"."id"
   FROM "public"."transactions"
  WHERE ("transactions"."tenant_id" IN ( SELECT "memberships"."tenant_id"
           FROM "public"."memberships"
          WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their own invoices" ON "public"."billing_invoices" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own subscription" ON "public"."user_subscriptions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their tenant's bank accounts" ON "public"."bank_accounts" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their tenant's chart of accounts" ON "public"."chart_of_accounts" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view their tenant's report templates" ON "public"."report_templates" FOR SELECT USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their tenant's saved reports" ON "public"."saved_reports" FOR SELECT USING (("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their tenant's transactions" ON "public"."transactions" FOR SELECT USING ((("tenant_id" IN ( SELECT "memberships"."tenant_id"
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."is_active" = true)))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view valid promo codes" ON "public"."promo_codes" FOR SELECT USING ((("is_active" = true) AND (("valid_from" IS NULL) OR ("valid_from" <= "now"())) AND (("valid_until" IS NULL) OR ("valid_until" >= "now"())) AND (("max_uses" IS NULL) OR ("current_uses" < "max_uses"))));



ALTER TABLE "public"."ai_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow_read_own_memberships" ON "public"."memberships" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "allow_read_own_tenants" ON "public"."tenants" FOR SELECT USING (("id" IN ( SELECT "public"."get_user_tenant_ids"() AS "get_user_tenant_ids")));



CREATE POLICY "allow_super_admin_all_memberships" ON "public"."memberships" USING ("public"."user_has_role"(ARRAY['SUPER_ADMIN'::"text"]));



CREATE POLICY "allow_super_admin_all_tenants" ON "public"."tenants" USING ("public"."user_has_role"(ARRAY['SUPER_ADMIN'::"text"]));



ALTER TABLE "public"."app_translations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exchange_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_sources_cron_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_languages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_ai_configurations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_statistics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscriptions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_seed_chart_of_accounts"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_seed_chart_of_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_seed_chart_of_accounts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_ai_rate_limit"("p_tenant_id" "uuid", "p_provider_id" "uuid", "p_limit_min" integer, "p_limit_hour" integer, "p_limit_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_ai_rate_limit"("p_tenant_id" "uuid", "p_provider_id" "uuid", "p_limit_min" integer, "p_limit_hour" integer, "p_limit_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_ai_rate_limit"("p_tenant_id" "uuid", "p_provider_id" "uuid", "p_limit_min" integer, "p_limit_hour" integer, "p_limit_day" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_tenant_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_tenant_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_tenant_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "uuid", "p_old_data" "jsonb", "p_new_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_activity"("p_tenant_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_activity"("p_tenant_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_activity"("p_tenant_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_balance_sheet"("p_tenant_id" "uuid", "p_as_of_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_balance_sheet"("p_tenant_id" "uuid", "p_as_of_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_balance_sheet"("p_tenant_id" "uuid", "p_as_of_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_net_income"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_net_income"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_net_income"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profit_loss"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_profit_loss"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profit_loss"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_trends"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_trends"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_trends"("p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_currency"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_currency"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_currency"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_details"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_details"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_details"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_tenant_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_subscription_details"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_subscription_details"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_subscription_details"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_account_balances"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_account_balances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_account_balances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_chart_of_accounts"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_chart_of_accounts"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_chart_of_accounts"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_audit_tenant_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_audit_tenant_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_audit_tenant_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_create_tenant_statistics"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_create_tenant_statistics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_create_tenant_statistics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_refresh_account_balances"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_refresh_account_balances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_refresh_account_balances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tenant_statistics"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_statistics"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_statistics"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_tenant_documents"("tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_tenant_documents"("tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_tenant_documents"("tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_transaction_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_transaction_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_transaction_balance"() TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."line_items" TO "anon";
GRANT ALL ON TABLE "public"."line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."line_items" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."account_balances" TO "anon";
GRANT ALL ON TABLE "public"."account_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."account_balances" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."admin_user_view" TO "anon";
GRANT ALL ON TABLE "public"."admin_user_view" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_user_view" TO "service_role";



GRANT ALL ON TABLE "public"."ai_providers" TO "anon";
GRANT ALL ON TABLE "public"."ai_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_providers" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."app_translations" TO "anon";
GRANT ALL ON TABLE "public"."app_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."app_translations" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."bank_statements" TO "anon";
GRANT ALL ON TABLE "public"."bank_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_statements" TO "service_role";



GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."billing_invoices" TO "anon";
GRANT ALL ON TABLE "public"."billing_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."document_data" TO "anon";
GRANT ALL ON TABLE "public"."document_data" TO "authenticated";
GRANT ALL ON TABLE "public"."document_data" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."exchange_rates" TO "service_role";



GRANT ALL ON TABLE "public"."external_sources_cron_secrets" TO "anon";
GRANT ALL ON TABLE "public"."external_sources_cron_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."external_sources_cron_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";



GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";



GRANT ALL ON TABLE "public"."saved_reports" TO "anon";
GRANT ALL ON TABLE "public"."saved_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_reports" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."system_languages" TO "anon";
GRANT ALL ON TABLE "public"."system_languages" TO "authenticated";
GRANT ALL ON TABLE "public"."system_languages" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_ai_configurations" TO "anon";
GRANT ALL ON TABLE "public"."tenant_ai_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_ai_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_settings" TO "anon";
GRANT ALL ON TABLE "public"."tenant_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_statistics" TO "anon";
GRANT ALL ON TABLE "public"."tenant_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."trial_balance" TO "anon";
GRANT ALL ON TABLE "public"."trial_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."trial_balance" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







