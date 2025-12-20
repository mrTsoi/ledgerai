-- ============================================================================
-- Entity translations
--
-- Purpose:
-- - Localize DB-derived display strings (e.g., seeded Chart of Accounts names)
-- - Store per-tenant overrides keyed by entity + field + locale
--
-- Notes:
-- - Read path is the immediate priority; write UI can come later.
-- - RLS restricts access to tenant members; writes limited to admin roles.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entity_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL,
  locale text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entity_translations_unique
    UNIQUE (tenant_id, entity_type, entity_id, field, locale)
);

CREATE INDEX IF NOT EXISTS idx_entity_translations_lookup
  ON public.entity_translations (tenant_id, entity_type, entity_id, locale, field);

ALTER TABLE public.entity_translations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.handle_updated_at') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS set_updated_at_entity_translations ON public.entity_translations;
    CREATE TRIGGER set_updated_at_entity_translations
      BEFORE UPDATE ON public.entity_translations
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- Policies
DROP POLICY IF EXISTS "Members can view entity translations" ON public.entity_translations;
CREATE POLICY "Members can view entity translations" ON public.entity_translations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = entity_translations.tenant_id
        AND m.is_active = true
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage entity translations" ON public.entity_translations;
CREATE POLICY "Admins can manage entity translations" ON public.entity_translations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = entity_translations.tenant_id
        AND m.is_active = true
        AND m.role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.tenant_id = entity_translations.tenant_id
        AND m.is_active = true
        AND m.role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN')
    )
    OR public.is_super_admin()
  );

-- Grants
-- PostgREST still requires base privileges in addition to RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.entity_translations TO authenticated;
