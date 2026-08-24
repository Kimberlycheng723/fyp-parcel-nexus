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

  IF recipient_role <> 'RESIDENT' AND NEW.whatsapp_enabled = TRUE THEN
    RAISE EXCEPTION 'WhatsApp is not supported for role %.', recipient_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
