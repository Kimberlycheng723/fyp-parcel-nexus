BEGIN;

CREATE TABLE IF NOT EXISTS parcel_investigations (
  investigation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES parcels(parcel_id) ON DELETE RESTRICT,
  dispute_id UUID REFERENCES disputes(dispute_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED')),
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS investigation_dispute_unique ON parcel_investigations(dispute_id) WHERE dispute_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS investigation_independent_unique ON parcel_investigations(parcel_id) WHERE dispute_id IS NULL;
CREATE INDEX IF NOT EXISTS investigation_parcel_idx ON parcel_investigations(parcel_id, created_at);

CREATE TABLE IF NOT EXISTS parcel_investigation_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES parcel_investigations(investigation_id) ON DELETE RESTRICT,
  author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  author_role TEXT NOT NULL CHECK (author_role IN ('ADMIN', 'GUARD')),
  content TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(content)) BETWEEN 1 AND 4000),
  observations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(observations) = 'array'),
  reviewed_evidence_id UUID REFERENCES collection_verification_evidence(evidence_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS investigation_notes_idx ON parcel_investigation_notes(investigation_id, created_at, note_id);
CREATE TABLE IF NOT EXISTS parcel_investigation_status_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID NOT NULL REFERENCES parcel_investigations(investigation_id) ON DELETE RESTRICT,
  previous_status TEXT CHECK (previous_status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED')),
  new_status TEXT NOT NULL CHECK (new_status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED')),
  actor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('ADMIN', 'GUARD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS investigation_history_idx ON parcel_investigation_status_history(investigation_id, created_at, history_id);
CREATE INDEX IF NOT EXISTS trace_parcel_tracking_idx ON parcels(LOWER(tracking_number));
CREATE INDEX IF NOT EXISTS trace_collection_created_idx ON parcel_collections(created_at, collection_id);

CREATE OR REPLACE FUNCTION protect_parcel_investigation_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME <> 'parcel_investigations' THEN
    RAISE EXCEPTION 'Investigation notes and status history are append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Investigation records cannot be deleted'; END IF;
  IF ROW(OLD.parcel_id, OLD.dispute_id, OLD.created_by, OLD.created_at)
    IS DISTINCT FROM ROW(NEW.parcel_id, NEW.dispute_id, NEW.created_by, NEW.created_at) THEN
    RAISE EXCEPTION 'Investigation identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS protect_investigation ON parcel_investigations;
CREATE TRIGGER protect_investigation BEFORE UPDATE OR DELETE ON parcel_investigations
  FOR EACH ROW EXECUTE FUNCTION protect_parcel_investigation_history();
DROP TRIGGER IF EXISTS protect_investigation_notes ON parcel_investigation_notes;
CREATE TRIGGER protect_investigation_notes BEFORE UPDATE OR DELETE ON parcel_investigation_notes
  FOR EACH ROW EXECUTE FUNCTION protect_parcel_investigation_history();
DROP TRIGGER IF EXISTS protect_investigation_status ON parcel_investigation_status_history;
CREATE TRIGGER protect_investigation_status BEFORE UPDATE OR DELETE ON parcel_investigation_status_history
  FOR EACH ROW EXECUTE FUNCTION protect_parcel_investigation_history();
COMMIT;
