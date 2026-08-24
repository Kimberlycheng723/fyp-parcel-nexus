CREATE TABLE IF NOT EXISTS push_subscriptions (
  push_subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_not_blank CHECK (BTRIM(endpoint) <> ''),
  CONSTRAINT push_subscriptions_p256dh_not_blank CHECK (BTRIM(p256dh_key) <> ''),
  CONSTRAINT push_subscriptions_auth_not_blank CHECK (BTRIM(auth_key) <> '')
);

CREATE INDEX IF NOT EXISTS push_subscriptions_active_user_idx
  ON push_subscriptions(user_id, updated_at DESC)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER set_push_subscriptions_updated_at
BEFORE UPDATE ON push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
