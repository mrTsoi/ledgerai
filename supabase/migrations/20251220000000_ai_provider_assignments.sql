-- ============================================================================
-- AI Provider Assignments (Platform-level routing by purpose)
-- ============================================================================

-- Purpose examples:
-- - TRANSLATION
-- - CHATBOT
-- - DOCUMENT_PROCESSING
-- - TRANSACTION_CATEGORIZATION
-- - BANK_RECONCILIATION

CREATE TABLE IF NOT EXISTS public.ai_provider_assignments (
  purpose TEXT PRIMARY KEY,
  ai_provider_id UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_provider_assignments ENABLE ROW LEVEL SECURITY;

-- Only Super Admins can manage assignments
DROP POLICY IF EXISTS "Super Admins can manage AI provider assignments" ON public.ai_provider_assignments;
CREATE POLICY "Super Admins can manage AI provider assignments" ON public.ai_provider_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE user_id = auth.uid()
      AND role = 'SUPER_ADMIN'
    )
  );

-- Allow authenticated users to read assignments (server-side routing needs this)
DROP POLICY IF EXISTS "Authenticated users can read AI provider assignments" ON public.ai_provider_assignments;
CREATE POLICY "Authenticated users can read AI provider assignments" ON public.ai_provider_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Keep updated_at fresh
DO $$
BEGIN
  IF to_regclass('public.handle_updated_at') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS set_updated_at_ai_provider_assignments ON public.ai_provider_assignments;
    CREATE TRIGGER set_updated_at_ai_provider_assignments
    BEFORE UPDATE ON public.ai_provider_assignments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;
