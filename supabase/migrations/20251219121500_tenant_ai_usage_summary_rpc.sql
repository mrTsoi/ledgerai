-- Dashboard: tenant AI usage summary RPC (month/week widgets)

-- Provides aggregate AI usage for a tenant within a time window.
-- Access control:
-- - SUPER_ADMIN always allowed
-- - Otherwise requires an active membership in the tenant

CREATE OR REPLACE FUNCTION public.get_tenant_ai_usage_summary(
  p_tenant_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  total_calls bigint,
  success_calls bigint,
  error_calls bigint,
  tokens_input bigint,
  tokens_output bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = p_tenant_id
        AND COALESCE(m.is_active, true) = true
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_calls,
    COUNT(*) FILTER (WHERE status = 'success')::bigint AS success_calls,
    COUNT(*) FILTER (WHERE status = 'error')::bigint AS error_calls,
    COALESCE(SUM(tokens_input), 0)::bigint AS tokens_input,
    COALESCE(SUM(tokens_output), 0)::bigint AS tokens_output
  FROM public.ai_usage_logs
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_start
    AND created_at < p_end;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_ai_usage_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_ai_usage_summary(uuid, timestamptz, timestamptz) TO authenticated;
