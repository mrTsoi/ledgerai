-- ============================================================================
-- Admin Helper: Duplicate Tenant Cleanup
--
-- Problem:
--  - Tenant auto-creation (e.g. during bulk processing) can create duplicates with
--    the same name under the same owner_id (different slug suffixes).
--
-- Solution:
--  - Provide SUPER_ADMIN-only RPCs to:
--      1) list duplicate-tenant groups
--      2) merge one group into a canonical tenant by moving documents (via the
--         existing transfer_document_tenant RPC) and merging memberships/settings/identifiers.
--      3) optionally delete duplicates ONLY if they are empty after merge; otherwise
--         deactivate them.
-- ============================================================================

-- 1) Normalize tenant names for grouping (best-effort, similar to app-side normalization)
CREATE OR REPLACE FUNCTION public.normalize_tenant_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(p_name, '')),
        '[^a-z0-9\s&\.-]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- 2) List duplicate tenant groups (SUPER_ADMIN-only)
CREATE OR REPLACE FUNCTION public.admin_list_duplicate_tenants(p_owner_id UUID DEFAULT NULL)
RETURNS TABLE(
  owner_id UUID,
  normalized_name TEXT,
  canonical_tenant_id UUID,
  canonical_tenant_name TEXT,
  tenant_ids UUID[],
  tenant_names TEXT[],
  tenant_slugs TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.owner_id,
      t.name,
      t.slug,
      t.created_at,
      public.normalize_tenant_name(t.name) AS norm
    FROM public.tenants t
    WHERE (p_owner_id IS NULL OR t.owner_id = p_owner_id)
      AND COALESCE(t.is_active, true) = true
  ), grouped AS (
    SELECT
      base.owner_id,
      base.norm,
      array_agg(id ORDER BY created_at ASC) AS ids,
      array_agg(name ORDER BY created_at ASC) AS names,
      array_agg(slug ORDER BY created_at ASC) AS slugs
    FROM base
    WHERE norm <> ''
    GROUP BY base.owner_id, base.norm
    HAVING count(*) > 1
  )
  SELECT
    g.owner_id,
    g.norm,
    g.ids[1] AS canonical_tenant_id,
    g.names[1] AS canonical_tenant_name,
    g.ids,
    g.names,
    g.slugs
  FROM grouped g
  ORDER BY g.owner_id NULLS FIRST, g.norm;
END;
$$;

-- 3) Merge duplicate tenants into the canonical tenant (SUPER_ADMIN-only)
CREATE OR REPLACE FUNCTION public.admin_merge_duplicate_tenants(
  p_canonical_tenant_id UUID,
  p_delete_empty_duplicates BOOLEAN DEFAULT true,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical RECORD;
  v_norm TEXT;
  v_dup RECORD;
  v_doc RECORD;
  v_duplicates_processed INT := 0;
  v_documents_moved INT := 0;
  v_tenants_deleted INT := 0;
  v_tenants_deactivated INT := 0;
  v_details JSONB := '[]'::jsonb;
  v_blocking JSONB;
  v_has_tenant_identifiers BOOLEAN := false;
  v_has_tenant_ai_configurations BOOLEAN := false;
  v_has_tenant_tax_settings BOOLEAN := false;
  v_has_exchange_rates BOOLEAN := false;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_has_tenant_identifiers := (to_regclass('public.tenant_identifiers') IS NOT NULL);
  v_has_tenant_ai_configurations := (to_regclass('public.tenant_ai_configurations') IS NOT NULL);
  v_has_tenant_tax_settings := (to_regclass('public.tenant_tax_settings') IS NOT NULL);
  v_has_exchange_rates := (to_regclass('public.exchange_rates') IS NOT NULL);

  SELECT id, owner_id, name, slug INTO v_canonical
  FROM public.tenants
  WHERE id = p_canonical_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical tenant not found' USING ERRCODE = 'P0001';
  END IF;

  v_norm := public.normalize_tenant_name(v_canonical.name);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'canonical tenant name normalizes to empty' USING ERRCODE = 'P0001';
  END IF;

  FOR v_dup IN
    SELECT id, owner_id, name, slug
    FROM public.tenants
    WHERE owner_id IS NOT DISTINCT FROM v_canonical.owner_id
      AND public.normalize_tenant_name(name) = v_norm
      AND id <> v_canonical.id
  LOOP
    v_duplicates_processed := v_duplicates_processed + 1;

    -- Move documents using transfer_document_tenant to keep dependent rows in sync.
    FOR v_doc IN
      SELECT id FROM public.documents WHERE tenant_id = v_dup.id
    LOOP
      IF NOT p_dry_run THEN
        PERFORM public.transfer_document_tenant(v_doc.id, v_canonical.id, 'MOVE');
      END IF;
      v_documents_moved := v_documents_moved + 1;
    END LOOP;

    -- Move accounting/banking data to the canonical tenant.
    -- This enables hard-deleting duplicates without losing data.
    IF NOT p_dry_run THEN
      -- Chart of accounts has UNIQUE(tenant_id, code); build a mapping to avoid conflicts.
      IF to_regclass('public.chart_of_accounts') IS NOT NULL THEN
        CREATE TEMP TABLE IF NOT EXISTS tmp_coa_map (
          dup_id UUID PRIMARY KEY,
          canonical_id UUID NOT NULL
        ) ON COMMIT DROP;
        TRUNCATE TABLE tmp_coa_map;

        INSERT INTO tmp_coa_map (dup_id, canonical_id)
        SELECT
          coa.id,
          COALESCE(
            (
              SELECT c2.id
              FROM public.chart_of_accounts c2
              WHERE c2.tenant_id = v_canonical.id
                AND c2.code = coa.code
              LIMIT 1
            ),
            coa.id
          )
        FROM public.chart_of_accounts coa
        WHERE coa.tenant_id = v_dup.id;

        -- Repoint references from duplicate COA ids to canonical COA ids.
        UPDATE public.line_items li
        SET account_id = m.canonical_id,
            updated_at = NOW()
        FROM tmp_coa_map m
        WHERE li.account_id = m.dup_id
          AND m.canonical_id <> m.dup_id;

        IF to_regclass('public.bank_accounts') IS NOT NULL THEN
          UPDATE public.bank_accounts ba
          SET gl_account_id = m.canonical_id,
              updated_at = NOW()
          FROM tmp_coa_map m
          WHERE ba.gl_account_id = m.dup_id
            AND m.canonical_id <> m.dup_id;
        END IF;

        -- Fix parent_account_id for COAs that we are moving (keeping same id).
        UPDATE public.chart_of_accounts coa
        SET parent_account_id = mp.canonical_id,
            updated_at = NOW()
        FROM tmp_coa_map ms,
             tmp_coa_map mp
        WHERE coa.id = ms.dup_id
          AND coa.parent_account_id = mp.dup_id
          AND ms.canonical_id = ms.dup_id
          AND coa.tenant_id = v_dup.id
          AND mp.canonical_id <> mp.dup_id;

        -- Move non-conflicting COAs to canonical tenant.
        UPDATE public.chart_of_accounts coa
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        FROM tmp_coa_map m
        WHERE coa.id = m.dup_id
          AND m.canonical_id = m.dup_id
          AND coa.tenant_id = v_dup.id;

        -- Delete duplicate COAs that mapped to an existing canonical COA.
        DELETE FROM public.chart_of_accounts coa
        USING tmp_coa_map m
        WHERE coa.id = m.dup_id
          AND m.canonical_id <> m.dup_id;
      END IF;

      IF to_regclass('public.transactions') IS NOT NULL THEN
        UPDATE public.transactions
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        WHERE tenant_id = v_dup.id;
      END IF;

      IF to_regclass('public.bank_accounts') IS NOT NULL THEN
        UPDATE public.bank_accounts
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        WHERE tenant_id = v_dup.id;
      END IF;

      IF to_regclass('public.bank_statements') IS NOT NULL THEN
        UPDATE public.bank_statements
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        WHERE tenant_id = v_dup.id;
      END IF;

      IF to_regclass('public.bank_transactions') IS NOT NULL THEN
        -- Avoid unique conflicts on (tenant_id, provider, external_transaction_id).
        DELETE FROM public.bank_transactions bt
        USING public.bank_transactions bt2
        WHERE bt.tenant_id = v_dup.id
          AND bt.external_transaction_id IS NOT NULL
          AND bt2.tenant_id = v_canonical.id
          AND bt2.external_transaction_id = bt.external_transaction_id
          AND bt2.provider IS NOT DISTINCT FROM bt.provider;

        UPDATE public.bank_transactions
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        WHERE tenant_id = v_dup.id;
      END IF;

      IF to_regclass('public.tenant_domains') IS NOT NULL THEN
        UPDATE public.tenant_domains
        SET tenant_id = v_canonical.id,
            updated_at = NOW()
        WHERE tenant_id = v_dup.id;
      END IF;

      -- Unique per-tenant tables: keep canonical row if it exists; otherwise move.
      IF v_has_tenant_ai_configurations THEN
        -- If the canonical tenant doesn't currently have an EFFECTIVE config
        -- (active tenant_ai_configurations + active ai_provider), but a duplicate does,
        -- promote the duplicate's config to canonical.
        IF EXISTS (
          SELECT 1
          FROM public.tenant_ai_configurations tc
          JOIN public.ai_providers ap ON ap.id = tc.ai_provider_id
          WHERE tc.tenant_id = v_dup.id
            AND tc.is_active = true
            AND ap.is_active = true
        ) AND NOT EXISTS (
          SELECT 1
          FROM public.tenant_ai_configurations tc
          JOIN public.ai_providers ap ON ap.id = tc.ai_provider_id
          WHERE tc.tenant_id = v_canonical.id
            AND tc.is_active = true
            AND ap.is_active = true
        ) THEN
          INSERT INTO public.tenant_ai_configurations (
            tenant_id,
            ai_provider_id,
            api_key_encrypted,
            model_name,
            custom_config,
            is_active,
            created_at,
            updated_at
          )
          SELECT
            v_canonical.id,
            tc.ai_provider_id,
            tc.api_key_encrypted,
            tc.model_name,
            tc.custom_config,
            true,
            tc.created_at,
            NOW()
          FROM public.tenant_ai_configurations tc
          WHERE tc.tenant_id = v_dup.id
          ON CONFLICT (tenant_id) DO UPDATE
          SET
            ai_provider_id = EXCLUDED.ai_provider_id,
            api_key_encrypted = EXCLUDED.api_key_encrypted,
            model_name = EXCLUDED.model_name,
            custom_config = EXCLUDED.custom_config,
            is_active = true,
            updated_at = NOW();
        END IF;

        -- Duplicate tenant is being deleted; remove its config row.
        DELETE FROM public.tenant_ai_configurations WHERE tenant_id = v_dup.id;
      END IF;

      IF v_has_tenant_tax_settings THEN
        IF EXISTS (SELECT 1 FROM public.tenant_tax_settings WHERE tenant_id = v_canonical.id) THEN
          DELETE FROM public.tenant_tax_settings WHERE tenant_id = v_dup.id;
        ELSE
          UPDATE public.tenant_tax_settings
          SET tenant_id = v_canonical.id,
              updated_at = NOW()
          WHERE tenant_id = v_dup.id;
        END IF;
      END IF;

      IF v_has_exchange_rates THEN
        INSERT INTO public.exchange_rates (tenant_id, currency, rate, is_manual, created_at, updated_at)
        SELECT v_canonical.id, er.currency, er.rate, er.is_manual, er.created_at, NOW()
        FROM public.exchange_rates er
        WHERE er.tenant_id = v_dup.id
        ON CONFLICT (tenant_id, currency) DO NOTHING;

        DELETE FROM public.exchange_rates WHERE tenant_id = v_dup.id;
      END IF;
    END IF;

    -- Keep document_tenant_candidates FKs safe if deleting duplicates.
    -- Not all deployments include this table; guard to avoid runtime failures.
    IF NOT p_dry_run AND to_regclass('public.document_tenant_candidates') IS NOT NULL THEN
      EXECUTE
        'UPDATE public.document_tenant_candidates
         SET candidate_tenant_id = $1
         WHERE candidate_tenant_id = $2'
      USING v_canonical.id, v_dup.id;
    END IF;

    -- Merge memberships (keep the "highest" role when conflicts)
    IF NOT p_dry_run THEN
      INSERT INTO public.memberships (user_id, tenant_id, role, is_active, created_at, updated_at)
      SELECT m.user_id, v_canonical.id, m.role, m.is_active, m.created_at, NOW()
      FROM public.memberships m
      WHERE m.tenant_id = v_dup.id
      ON CONFLICT (user_id, tenant_id) DO UPDATE
      SET
        is_active = (public.memberships.is_active OR EXCLUDED.is_active),
        role = (
          CASE
            WHEN public.memberships.role = 'SUPER_ADMIN' OR EXCLUDED.role = 'SUPER_ADMIN' THEN 'SUPER_ADMIN'
            WHEN public.memberships.role = 'COMPANY_ADMIN' OR EXCLUDED.role = 'COMPANY_ADMIN' THEN 'COMPANY_ADMIN'
            WHEN public.memberships.role = 'ACCOUNTANT' OR EXCLUDED.role = 'ACCOUNTANT' THEN 'ACCOUNTANT'
            ELSE 'OPERATOR'
          END
        ),
        updated_at = NOW();
    END IF;

    -- Merge tenant identifiers (optional table; not all deployments include it)
    IF NOT p_dry_run AND v_has_tenant_identifiers THEN
      INSERT INTO public.tenant_identifiers (
        tenant_id, identifier_type, identifier_value, is_verified, created_at, updated_at
      )
      SELECT v_canonical.id, ti.identifier_type, ti.identifier_value, ti.is_verified, ti.created_at, NOW()
      FROM public.tenant_identifiers ti
      WHERE ti.tenant_id = v_dup.id
      ON CONFLICT (tenant_id, identifier_type, identifier_value) DO NOTHING;
    END IF;

    -- Merge tenant settings
    IF NOT p_dry_run THEN
      INSERT INTO public.tenant_settings (
        tenant_id, setting_key, setting_value, created_at, updated_at
      )
      SELECT v_canonical.id, ts.setting_key, ts.setting_value, ts.created_at, NOW()
      FROM public.tenant_settings ts
      WHERE ts.tenant_id = v_dup.id
      ON CONFLICT (tenant_id, setting_key) DO NOTHING;
    END IF;

    -- Decide whether we can delete the duplicate tenant.
    v_blocking := jsonb_build_object(
      'documents', (SELECT count(*) FROM public.documents WHERE tenant_id = v_dup.id),
      'transactions', (SELECT count(*) FROM public.transactions WHERE tenant_id = v_dup.id),
      'bank_accounts', (SELECT count(*) FROM public.bank_accounts WHERE tenant_id = v_dup.id),
      'bank_statements', (SELECT count(*) FROM public.bank_statements WHERE tenant_id = v_dup.id),
      'bank_transactions', (SELECT count(*) FROM public.bank_transactions WHERE tenant_id = v_dup.id),
      'chart_of_accounts', (SELECT count(*) FROM public.chart_of_accounts WHERE tenant_id = v_dup.id),
      'tenant_identifiers', (
        CASE
          WHEN v_has_tenant_identifiers THEN (SELECT count(*) FROM public.tenant_identifiers WHERE tenant_id = v_dup.id)
          ELSE 0
        END
      ),
      'tenant_settings', (SELECT count(*) FROM public.tenant_settings WHERE tenant_id = v_dup.id),
      'memberships', (SELECT count(*) FROM public.memberships WHERE tenant_id = v_dup.id)
    );

    IF p_delete_empty_duplicates THEN
      -- After reassignment, core tenant-scoped data should be gone.
      IF (v_blocking->>'documents')::int <> 0
        OR (v_blocking->>'transactions')::int <> 0
        OR (v_blocking->>'bank_accounts')::int <> 0
        OR (v_blocking->>'bank_statements')::int <> 0
        OR (v_blocking->>'bank_transactions')::int <> 0
        OR (v_blocking->>'chart_of_accounts')::int <> 0
      THEN
        RAISE EXCEPTION 'cannot delete duplicate tenant % due to remaining tenant-scoped rows: %', v_dup.id, v_blocking
          USING ERRCODE = 'P0001';
      END IF;

      IF NOT p_dry_run THEN
        DELETE FROM public.tenants WHERE id = v_dup.id;
      END IF;
      v_tenants_deleted := v_tenants_deleted + 1;
    ELSE
      -- Non-destructive mode: deactivate only.
      IF NOT p_dry_run THEN
        UPDATE public.tenants
        SET is_active = false,
            updated_at = NOW()
        WHERE id = v_dup.id;
      END IF;
      v_tenants_deactivated := v_tenants_deactivated + 1;
    END IF;

    v_details := v_details || jsonb_build_object(
      'duplicate_tenant_id', v_dup.id,
      'duplicate_tenant_name', v_dup.name,
      'duplicate_tenant_slug', v_dup.slug,
      'blocking_counts', v_blocking
    );
  END LOOP;

  RETURN jsonb_build_object(
    'canonical_tenant_id', v_canonical.id,
    'canonical_tenant_name', v_canonical.name,
    'normalized_name', v_norm,
    'dry_run', p_dry_run,
    'delete_empty_duplicates', p_delete_empty_duplicates,
    'duplicates_processed', v_duplicates_processed,
    'documents_moved', v_documents_moved,
    'tenants_deleted', v_tenants_deleted,
    'tenants_deactivated', v_tenants_deactivated,
    'details', v_details
  );
END;
$$;

-- 4) Patch audit trigger for tenant deletions
-- The default trigger inserts audit_logs.tenant_id = OLD.id on DELETE, which violates
-- the FK (audit_logs.tenant_id -> tenants.id) once the tenant row is deleted.
-- Keep the deleted tenant id in resource_id, but set tenant_id = NULL.
CREATE OR REPLACE FUNCTION public.trigger_audit_tenant_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.create_audit_log(
      NEW.id,
      'UPDATE',
      'tenant',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      NULL,
      'DELETE',
      'tenant',
      OLD.id,
      to_jsonb(OLD),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Permissions
GRANT EXECUTE ON FUNCTION public.normalize_tenant_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_duplicate_tenants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_duplicate_tenants(UUID, BOOLEAN, BOOLEAN) TO authenticated;
