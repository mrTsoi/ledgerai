-- ============================================================================
-- Tax estimate caching (Tenant)
-- Persist computed tax summaries for faster dashboards.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_tax_estimate_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  document_count BIGINT NOT NULL DEFAULT 0,
  taxable_total NUMERIC NOT NULL DEFAULT 0,
  estimated_tax_total NUMERIC NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, start_date, end_date)
);

ALTER TABLE public.tenant_tax_estimate_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant tax estimate cache"
  ON public.tenant_tax_estimate_cache FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid()
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage their tenant tax estimate cache"
  ON public.tenant_tax_estimate_cache FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.memberships
      WHERE user_id = auth.uid()
      AND role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
      AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_tax_est_cache_tenant_dates
  ON public.tenant_tax_estimate_cache(tenant_id, start_date, end_date);

CREATE TRIGGER set_updated_at_tenant_tax_estimate_cache
  BEFORE UPDATE ON public.tenant_tax_estimate_cache
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Refresh/upsert cache for a tenant and date range.
-- Security:
-- - SECURITY DEFINER to allow write even when called by non-admin members.
-- - Explicit membership check (active member required).
CREATE OR REPLACE FUNCTION public.refresh_tax_estimate_cache(
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  tenant_id UUID,
  start_date DATE,
  end_date DATE,
  document_count BIGINT,
  taxable_total NUMERIC,
  estimated_tax_total NUMERIC,
  computed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_doc_count bigint;
  v_taxable_total numeric;
  v_estimated_tax_total numeric;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND m.is_active = true
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    COALESCE(t.document_count, 0)::bigint,
    COALESCE(t.taxable_total, 0)::numeric,
    COALESCE(t.estimated_tax_total, 0)::numeric
  INTO v_doc_count, v_taxable_total, v_estimated_tax_total
  FROM public.get_tax_estimate(p_tenant_id, p_start_date, p_end_date) t;

  INSERT INTO public.tenant_tax_estimate_cache(
    tenant_id,
    start_date,
    end_date,
    document_count,
    taxable_total,
    estimated_tax_total,
    computed_at
  ) VALUES (
    p_tenant_id,
    p_start_date,
    p_end_date,
    v_doc_count,
    v_taxable_total,
    v_estimated_tax_total,
    NOW()
  )
  ON CONFLICT (tenant_id, start_date, end_date) DO UPDATE
  SET
    document_count = EXCLUDED.document_count,
    taxable_total = EXCLUDED.taxable_total,
    estimated_tax_total = EXCLUDED.estimated_tax_total,
    computed_at = EXCLUDED.computed_at,
    updated_at = NOW();

  RETURN QUERY
  SELECT
    c.tenant_id,
    c.start_date,
    c.end_date,
    c.document_count,
    c.taxable_total,
    c.estimated_tax_total,
    c.computed_at
  FROM public.tenant_tax_estimate_cache c
  WHERE c.tenant_id = p_tenant_id
    AND c.start_date = p_start_date
    AND c.end_date = p_end_date;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_tax_estimate_cache(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_tax_estimate_cache(UUID, DATE, DATE) TO authenticated;
