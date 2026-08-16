CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  browser_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type),
  CONSTRAINT notification_preferences_type_check CHECK (
    notification_type IN ('PARCEL_ARRIVAL', 'PARCEL_OVERDUE', 'DISPUTE_UPDATED')
  ),
  CONSTRAINT notification_preferences_in_app_required CHECK (in_app_enabled = TRUE)
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_parcel_id UUID REFERENCES parcels(parcel_id) ON UPDATE CASCADE ON DELETE SET NULL,
  deduplication_key TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_type_check CHECK (
    type IN ('PARCEL_ARRIVAL', 'PARCEL_OVERDUE', 'DISPUTE_UPDATED')
  ),
  CONSTRAINT notifications_read_state_check CHECK (
    (is_read = FALSE AND read_at IS NULL)
    OR
    (is_read = TRUE AND read_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_deduplication_key_unique_idx
  ON notifications(deduplication_key)
  WHERE deduplication_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON notifications(recipient_user_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS notifications_related_parcel_id_idx
  ON notifications(related_parcel_id)
  WHERE related_parcel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx
  ON notification_preferences(user_id);

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
BEFORE UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO notification_preferences (
  user_id,
  notification_type,
  in_app_enabled,
  email_enabled,
  whatsapp_enabled,
  browser_push_enabled
)
SELECT
  users.user_id,
  notification_types.notification_type,
  TRUE,
  TRUE,
  FALSE,
  FALSE
FROM users
CROSS JOIN (
  VALUES
    ('PARCEL_ARRIVAL'),
    ('PARCEL_OVERDUE'),
    ('DISPUTE_UPDATED')
) AS notification_types(notification_type)
WHERE users.role = 'RESIDENT'
ON CONFLICT (user_id, notification_type) DO NOTHING;

CREATE OR REPLACE FUNCTION initialize_resident_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'RESIDENT' THEN
    INSERT INTO notification_preferences (
      user_id,
      notification_type,
      in_app_enabled,
      email_enabled,
      whatsapp_enabled,
      browser_push_enabled
    )
    VALUES
      (NEW.user_id, 'PARCEL_ARRIVAL', TRUE, TRUE, FALSE, FALSE),
      (NEW.user_id, 'PARCEL_OVERDUE', TRUE, TRUE, FALSE, FALSE),
      (NEW.user_id, 'DISPUTE_UPDATED', TRUE, TRUE, FALSE, FALSE)
    ON CONFLICT (user_id, notification_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS initialize_resident_notification_preferences_on_insert ON users;
CREATE TRIGGER initialize_resident_notification_preferences_on_insert
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION initialize_resident_notification_preferences();
