-- ============================================================================
-- Grants: allow app runtime to read translations
--
-- The Next.js server loads DB translations using the Supabase anon key.
-- Ensure the underlying Postgres privileges allow SELECT, in addition to RLS.
-- ============================================================================

GRANT SELECT ON TABLE public.app_translations TO anon, authenticated;
GRANT SELECT ON TABLE public.system_languages TO anon, authenticated;
