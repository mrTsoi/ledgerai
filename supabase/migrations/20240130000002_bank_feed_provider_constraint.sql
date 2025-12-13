-- ============================================================================
-- Relax provider constraint for bank_feed_connections (support multiple providers)
-- ============================================================================

ALTER TABLE bank_feed_connections
  DROP CONSTRAINT IF EXISTS bank_feed_connections_provider_check;

-- Allow future OAuth providers without requiring another migration.
ALTER TABLE bank_feed_connections
  ADD CONSTRAINT bank_feed_connections_provider_check
  CHECK (provider IN ('PLAID', 'TRUELAYER', 'TINK', 'YAPILY', 'NORDIGEN', 'SALTEDGE', 'FINVERSE', 'BRANKAS'));
