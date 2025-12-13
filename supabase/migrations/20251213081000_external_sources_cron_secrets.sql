-- =============================================================================
-- External Sources: Per-tenant cron configuration + secret storage
--
-- Stores a per-tenant cron key hash (never expose to client) and optional
-- tenant-level runner defaults (enabled + default run limit).
--
-- Notes:
-- - RLS is enabled but no policies are created (deny all for anon/authenticated).
-- - Only service role should read/write this table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS external_sources_cron_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT true,
  default_run_limit INTEGER NOT NULL DEFAULT 10,

  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE external_sources_cron_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies.

CREATE INDEX IF NOT EXISTS idx_external_sources_cron_secrets_enabled
  ON external_sources_cron_secrets(enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_updated_at_external_sources_cron_secrets'
  ) THEN
    CREATE TRIGGER set_updated_at_external_sources_cron_secrets
      BEFORE UPDATE ON external_sources_cron_secrets
      FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
  END IF;
END;
$$;
