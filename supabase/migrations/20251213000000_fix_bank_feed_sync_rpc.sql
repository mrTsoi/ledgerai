-- ============================================================================
-- Fix bank-feed-sync insert idempotency via RPC
--
-- Problem:
-- - PostgREST upsert requires a non-partial unique constraint/index for `onConflict`.
-- - We currently have a PARTIAL unique index on (tenant_id, provider, external_transaction_id)
--   with `WHERE external_transaction_id IS NOT NULL`.
--
-- Solution:
-- - Add a SQL RPC that performs INSERT ... ON CONFLICT ... WHERE ... DO NOTHING,
--   matching the partial index predicate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insert_bank_feed_transactions(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS x(
      tenant_id uuid,
      bank_account_id uuid,
      bank_statement_id uuid,
      transaction_date date,
      description text,
      amount numeric,
      transaction_type text,
      reference_number text,
      status text,
      source text,
      provider text,
      external_transaction_id text,
      metadata jsonb,
      external_raw jsonb
    )
  ), ins AS (
    INSERT INTO public.bank_transactions(
      tenant_id,
      bank_account_id,
      bank_statement_id,
      transaction_date,
      description,
      amount,
      transaction_type,
      reference_number,
      status,
      source,
      provider,
      external_transaction_id,
      metadata,
      external_raw
    )
    SELECT
      tenant_id,
      bank_account_id,
      bank_statement_id,
      transaction_date,
      description,
      amount,
      transaction_type,
      reference_number,
      status,
      source,
      provider,
      external_transaction_id,
      COALESCE(metadata, '{}'::jsonb),
      COALESCE(external_raw, '{}'::jsonb)
    FROM input
    ON CONFLICT (tenant_id, provider, external_transaction_id)
      WHERE external_transaction_id IS NOT NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted_count FROM ins;

  RETURN COALESCE(inserted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.insert_bank_feed_transactions(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_bank_feed_transactions(jsonb) TO service_role;
