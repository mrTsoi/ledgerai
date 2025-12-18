-- Create pending_subscriptions to persist plan selections across signup/confirmation

CREATE TABLE IF NOT EXISTS pending_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  plan_id uuid,
  interval text CHECK (interval IN ('month','year')) DEFAULT 'month',
  stripe_price_id text,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_email ON pending_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_token ON pending_subscriptions(token);
