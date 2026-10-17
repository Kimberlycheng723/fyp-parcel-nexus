BEGIN;

CREATE TABLE IF NOT EXISTS parcel_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcel_rooms_name_check CHECK (
    char_length(name) BETWEEN 1 AND 100
    AND name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))
  ),
  CONSTRAINT parcel_rooms_description_check CHECK (
    description IS NULL OR char_length(description) <= 1000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS parcel_rooms_name_unique_idx ON parcel_rooms (LOWER(name));
CREATE INDEX IF NOT EXISTS parcel_rooms_active_idx ON parcel_rooms (is_active, name);

ALTER TABLE parcels ADD COLUMN IF NOT EXISTS parcel_room_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parcels_parcel_room_id_fkey' AND conrelid = 'parcels'::regclass
  ) THEN
    ALTER TABLE parcels ADD CONSTRAINT parcels_parcel_room_id_fkey
      FOREIGN KEY (parcel_room_id) REFERENCES parcel_rooms(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS parcels_parcel_room_id_idx ON parcels (parcel_room_id);

DROP TRIGGER IF EXISTS set_parcel_rooms_updated_at ON parcel_rooms;
CREATE TRIGGER set_parcel_rooms_updated_at
BEFORE UPDATE ON parcel_rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
