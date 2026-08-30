BEGIN;

CREATE SEQUENCE IF NOT EXISTS dispute_reference_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS disputes (
  dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_reference TEXT NOT NULL UNIQUE DEFAULT (
    'DSP-' || LPAD(nextval('dispute_reference_seq')::text, 6, '0')
  ),
  parcel_id UUID NOT NULL REFERENCES parcels(parcel_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  resident_user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  issue_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  assigned_staff_user_id UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  guard_response TEXT,
  admin_resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT disputes_issue_type_check CHECK (
    issue_type IN ('MISSING_ITEM', 'STOLEN', 'DAMAGED', 'WRONG_RECIPIENT')
  ),
  CONSTRAINT disputes_status_check CHECK (
    status IN ('OPEN', 'IN_REVIEW_GUARD', 'ESCALATED', 'IN_REVIEW_ADMIN', 'RESOLVED')
  ),
  CONSTRAINT disputes_description_check CHECK (
    CHAR_LENGTH(BTRIM(description)) BETWEEN 10 AND 4000
  ),
  CONSTRAINT disputes_resolution_state_check CHECK (
    (status = 'RESOLVED' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
    OR
    (status <> 'RESOLVED' AND resolved_at IS NULL AND resolved_by_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS disputes_resident_created_at_idx
  ON disputes(resident_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS disputes_status_updated_at_idx
  ON disputes(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS disputes_issue_type_idx ON disputes(issue_type);
CREATE INDEX IF NOT EXISTS disputes_parcel_id_idx ON disputes(parcel_id);
CREATE INDEX IF NOT EXISTS disputes_assigned_staff_idx
  ON disputes(assigned_staff_user_id)
  WHERE assigned_staff_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_disputes_updated_at ON disputes;
CREATE TRIGGER set_disputes_updated_at
BEFORE UPDATE ON disputes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS dispute_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(dispute_id) ON UPDATE CASCADE ON DELETE CASCADE,
  stored_filename TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispute_evidence_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/png')),
  CONSTRAINT dispute_evidence_file_size_check CHECK (file_size > 0 AND file_size <= 5242880),
  CONSTRAINT dispute_evidence_stored_filename_check CHECK (
    stored_filename = regexp_replace(stored_filename, '[^A-Za-z0-9._-]', '', 'g')
  )
);

CREATE INDEX IF NOT EXISTS dispute_evidence_dispute_id_idx
  ON dispute_evidence(dispute_id, uploaded_at ASC);

CREATE OR REPLACE FUNCTION enforce_dispute_evidence_limit()
RETURNS TRIGGER AS $$
DECLARE
  evidence_count INTEGER;
BEGIN
  PERFORM 1 FROM disputes WHERE dispute_id = NEW.dispute_id FOR UPDATE;

  SELECT COUNT(*)
  INTO evidence_count
  FROM dispute_evidence
  WHERE dispute_id = NEW.dispute_id;

  IF evidence_count >= 3 THEN
    RAISE EXCEPTION 'A dispute can contain at most 3 evidence files.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_dispute_evidence_limit_on_insert ON dispute_evidence;
CREATE TRIGGER enforce_dispute_evidence_limit_on_insert
BEFORE INSERT ON dispute_evidence
FOR EACH ROW
EXECUTE FUNCTION enforce_dispute_evidence_limit();

CREATE TABLE IF NOT EXISTS dispute_status_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(dispute_id) ON UPDATE CASCADE ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispute_history_previous_status_check CHECK (
    previous_status IS NULL
    OR previous_status IN ('OPEN', 'IN_REVIEW_GUARD', 'ESCALATED', 'IN_REVIEW_ADMIN', 'RESOLVED')
  ),
  CONSTRAINT dispute_history_new_status_check CHECK (
    new_status IN ('OPEN', 'IN_REVIEW_GUARD', 'ESCALATED', 'IN_REVIEW_ADMIN', 'RESOLVED')
  )
);

CREATE INDEX IF NOT EXISTS dispute_status_history_dispute_created_idx
  ON dispute_status_history(dispute_id, created_at ASC);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS related_dispute_id UUID
  REFERENCES disputes(dispute_id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_related_dispute_id_idx
  ON notifications(related_dispute_id)
  WHERE related_dispute_id IS NOT NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
ADD CONSTRAINT notifications_type_check CHECK (
  type IN ('PARCEL_ARRIVAL', 'PARCEL_OVERDUE', 'DISPUTE_UPDATED', 'PARCEL_COMMUNITY_ALERT')
);

ALTER TABLE notification_preferences
DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE notification_preferences
ADD CONSTRAINT notification_preferences_type_check CHECK (
  notification_type IN (
    'PARCEL_ARRIVAL',
    'PARCEL_OVERDUE',
    'DISPUTE_UPDATED',
    'PARCEL_COMMUNITY_ALERT'
  )
);

INSERT INTO notification_preferences (
  user_id,
  notification_type,
  in_app_enabled,
  email_enabled,
  whatsapp_enabled,
  browser_push_enabled
)
SELECT user_id, 'PARCEL_COMMUNITY_ALERT', TRUE, FALSE, FALSE, FALSE
FROM users
WHERE role = 'RESIDENT'
ON CONFLICT (user_id, notification_type) DO NOTHING;

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
      (NEW.user_id, 'DISPUTE_UPDATED', TRUE, TRUE, FALSE, FALSE),
      (NEW.user_id, 'PARCEL_COMMUNITY_ALERT', TRUE, FALSE, FALSE, FALSE)
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
    VALUES (NEW.user_id, 'DISPUTE_UPDATED', TRUE, TRUE, FALSE, FALSE)
    ON CONFLICT (user_id, notification_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
