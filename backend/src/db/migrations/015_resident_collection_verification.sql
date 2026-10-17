BEGIN;

ALTER TABLE parcel_collections DROP CONSTRAINT IF EXISTS parcel_collections_status_check;
ALTER TABLE parcel_collections ADD CONSTRAINT parcel_collections_status_check
  CHECK (collection_status IN ('ACTIVE', 'VERIFYING', 'USED', 'EXPIRED', 'CANCELLED'));

CREATE TABLE IF NOT EXISTS collection_verification_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL UNIQUE REFERENCES parcel_collections(collection_id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES units(unit_id) ON DELETE RESTRICT,
  unit_reference TEXT NOT NULL,
  guard_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'AWAITING_VERIFICATION'
    CHECK (status IN ('AWAITING_VERIFICATION', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK ((status = 'COMPLETED') = (confirmed_at IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (num_nonnulls(confirmed_at, completed_at) IN (0, 2)),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS collection_verification_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES collection_verification_sessions(session_id) ON DELETE RESTRICT,
  parcel_id UUID NOT NULL REFERENCES parcels(parcel_id) ON DELETE RESTRICT,
  registered_tracking_number TEXT NOT NULL,
  courier_name TEXT NOT NULL,
  parcel_room_name TEXT,
  scanned_tracking_number VARCHAR(120),
  barcode_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (barcode_status IN ('PENDING', 'MATCHED', 'MISMATCHED', 'UNREADABLE')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 30),
  verified_at TIMESTAMPTZ,
  photo_filename TEXT,
  photo_mime_type TEXT CHECK (photo_mime_type IN ('image/jpeg', 'image/png')),
  photo_size INTEGER CHECK (photo_size BETWEEN 1 AND 5242880),
  photo_sha256 TEXT,
  photo_uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, parcel_id),
  CHECK (num_nonnulls(photo_filename, photo_mime_type, photo_size, photo_sha256, photo_uploaded_at) IN (0, 5)),
  CHECK (photo_filename IS NULL OR photo_filename ~ '^[0-9a-f-]{36}\.(jpg|png)$'),
  CHECK (photo_sha256 IS NULL OR photo_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (barcode_status <> 'MATCHED' OR (scanned_tracking_number IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS collection_barcode_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES collection_verification_evidence(evidence_id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  scanned_tracking_number VARCHAR(120),
  result TEXT NOT NULL CHECK (result IN ('MATCHED', 'MISMATCHED', 'UNREADABLE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only active reservations exist here; immutable evidence stays in the tables above.
CREATE TABLE IF NOT EXISTS collection_verification_reservations (
  parcel_id UUID PRIMARY KEY REFERENCES parcels(parcel_id) ON DELETE RESTRICT,
  session_id UUID NOT NULL,
  FOREIGN KEY (session_id, parcel_id)
    REFERENCES collection_verification_evidence(session_id, parcel_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS collection_verification_resident_idx ON collection_verification_sessions(resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_verification_guard_idx ON collection_verification_sessions(guard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_verification_expiry_idx ON collection_verification_sessions(expires_at) WHERE status = 'AWAITING_VERIFICATION';
CREATE INDEX IF NOT EXISTS collection_evidence_parcel_idx ON collection_verification_evidence(parcel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_attempt_evidence_idx ON collection_barcode_attempts(evidence_id, created_at);
CREATE INDEX IF NOT EXISTS collection_attempt_tracking_idx ON collection_barcode_attempts(LOWER(scanned_tracking_number), created_at DESC);
CREATE INDEX IF NOT EXISTS collection_reservation_session_idx ON collection_verification_reservations(session_id);

DROP TRIGGER IF EXISTS set_collection_evidence_updated_at ON collection_verification_evidence;
CREATE TRIGGER set_collection_evidence_updated_at BEFORE UPDATE ON collection_verification_evidence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION protect_collection_verification_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'collection_barcode_attempts' THEN
    RAISE EXCEPTION 'Barcode attempts are append-only';
  END IF;
  IF TG_TABLE_NAME = 'collection_verification_sessions' THEN
    IF TG_OP = 'DELETE' OR OLD.status <> 'AWAITING_VERIFICATION' THEN
      RAISE EXCEPTION 'Closed verification history is immutable';
    END IF;
    IF ROW(OLD.collection_id, OLD.resident_id, OLD.unit_id, OLD.unit_reference, OLD.guard_id, OLD.created_at)
      IS DISTINCT FROM ROW(NEW.collection_id, NEW.resident_id, NEW.unit_id, NEW.unit_reference, NEW.guard_id, NEW.created_at) THEN
      RAISE EXCEPTION 'Verification identity snapshots are immutable';
    END IF;
  ELSE
    IF TG_OP = 'DELETE' OR EXISTS (SELECT 1 FROM collection_verification_sessions
      WHERE session_id = OLD.session_id AND status <> 'AWAITING_VERIFICATION') THEN
      RAISE EXCEPTION 'Closed collection evidence is immutable';
    END IF;
    IF ROW(OLD.session_id, OLD.parcel_id, OLD.registered_tracking_number, OLD.courier_name, OLD.parcel_room_name, OLD.created_at)
      IS DISTINCT FROM ROW(NEW.session_id, NEW.parcel_id, NEW.registered_tracking_number, NEW.courier_name, NEW.parcel_room_name, NEW.created_at) THEN
      RAISE EXCEPTION 'Parcel evidence snapshots are immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_collection_attempts ON collection_barcode_attempts;
CREATE TRIGGER protect_collection_attempts BEFORE UPDATE OR DELETE ON collection_barcode_attempts
  FOR EACH ROW EXECUTE FUNCTION protect_collection_verification_history();
DROP TRIGGER IF EXISTS protect_collection_sessions ON collection_verification_sessions;
CREATE TRIGGER protect_collection_sessions BEFORE UPDATE OR DELETE ON collection_verification_sessions
  FOR EACH ROW EXECUTE FUNCTION protect_collection_verification_history();
DROP TRIGGER IF EXISTS protect_collection_evidence ON collection_verification_evidence;
CREATE TRIGGER protect_collection_evidence BEFORE UPDATE OR DELETE ON collection_verification_evidence
  FOR EACH ROW EXECUTE FUNCTION protect_collection_verification_history();

COMMIT;
