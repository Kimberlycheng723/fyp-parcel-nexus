DROP TRIGGER IF EXISTS initialize_resident_notification_preferences_on_insert ON users;
DROP FUNCTION IF EXISTS initialize_resident_notification_preferences();

DELETE FROM notification_preferences preferences
USING users
WHERE users.user_id = preferences.user_id
  AND users.role <> 'RESIDENT'
  AND preferences.notification_type IN ('PARCEL_ARRIVAL', 'PARCEL_OVERDUE');

UPDATE notification_preferences preferences
SET
  whatsapp_enabled = FALSE,
  browser_push_enabled = FALSE
FROM users
WHERE users.user_id = preferences.user_id
  AND users.role IN ('SUPER_ADMIN', 'ADMIN', 'GUARD')
  AND (preferences.whatsapp_enabled = TRUE OR preferences.browser_push_enabled = TRUE);

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
  'DISPUTE_UPDATED',
  TRUE,
  TRUE,
  FALSE,
  FALSE
FROM users
WHERE users.role IN ('SUPER_ADMIN', 'ADMIN', 'GUARD')
ON CONFLICT (user_id, notification_type) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_notification_preference_role_policy()
RETURNS TRIGGER AS $$
DECLARE
  recipient_role TEXT;
BEGIN
  SELECT role
  INTO recipient_role
  FROM users
  WHERE user_id = NEW.user_id;

  IF recipient_role IS NULL THEN
    RAISE EXCEPTION 'Notification preference recipient does not exist.';
  END IF;

  IF recipient_role <> 'RESIDENT' AND NEW.notification_type <> 'DISPUTE_UPDATED' THEN
    RAISE EXCEPTION 'Notification type % is not supported for role %.', NEW.notification_type, recipient_role;
  END IF;

  IF recipient_role <> 'RESIDENT'
    AND (NEW.whatsapp_enabled = TRUE OR NEW.browser_push_enabled = TRUE) THEN
    RAISE EXCEPTION 'WhatsApp and Browser Push are not supported for role %.', recipient_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_notification_preference_role_policy_on_write
  ON notification_preferences;
CREATE TRIGGER enforce_notification_preference_role_policy_on_write
BEFORE INSERT OR UPDATE ON notification_preferences
FOR EACH ROW
EXECUTE FUNCTION enforce_notification_preference_role_policy();

CREATE OR REPLACE FUNCTION initialize_user_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    DELETE FROM notification_preferences WHERE user_id = NEW.user_id;
  END IF;

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
  ELSE
    INSERT INTO notification_preferences (
      user_id,
      notification_type,
      in_app_enabled,
      email_enabled,
      whatsapp_enabled,
      browser_push_enabled
    )
    VALUES (
      NEW.user_id,
      'DISPUTE_UPDATED',
      TRUE,
      TRUE,
      FALSE,
      FALSE
    )
    ON CONFLICT (user_id, notification_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS initialize_user_notification_preferences_on_write ON users;
CREATE TRIGGER initialize_user_notification_preferences_on_write
AFTER INSERT OR UPDATE OF role ON users
FOR EACH ROW
EXECUTE FUNCTION initialize_user_notification_preferences();
