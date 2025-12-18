-- Add consumed tracking to pending_subscriptions

ALTER TABLE IF EXISTS pending_subscriptions
ADD COLUMN IF NOT EXISTS consumed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS consumed_by_user_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_consumed_at ON pending_subscriptions(consumed_at);
