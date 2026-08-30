BEGIN;

ALTER TABLE disputes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS disputes_active_resident_created_at_idx
  ON disputes(resident_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS disputes_active_status_updated_at_idx
  ON disputes(status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS dispute_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(dispute_id) ON UPDATE CASCADE ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispute_messages_message_check CHECK (
    CHAR_LENGTH(BTRIM(message)) BETWEEN 1 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS dispute_messages_dispute_created_at_idx
  ON dispute_messages(dispute_id, created_at ASC, message_id ASC);

COMMIT;
