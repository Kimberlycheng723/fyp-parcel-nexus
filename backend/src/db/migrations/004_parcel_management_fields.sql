ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS collection_deadline TIMESTAMPTZ;

ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE parcels
DROP CONSTRAINT IF EXISTS parcels_status_check;

ALTER TABLE parcels
ADD CONSTRAINT parcels_status_check
CHECK (status IN ('PENDING', 'PENDING_COLLECTION', 'COLLECTED', 'CANCELLED'));

UPDATE parcels
SET status = 'PENDING_COLLECTION'
WHERE status = 'PENDING';

ALTER TABLE parcels
ALTER COLUMN status SET DEFAULT 'PENDING_COLLECTION';

UPDATE parcels
SET collection_deadline = created_at + INTERVAL '7 days'
WHERE status = 'PENDING_COLLECTION'
  AND collection_deadline IS NULL;

ALTER TABLE parcels
DROP CONSTRAINT IF EXISTS parcels_status_check;

ALTER TABLE parcels
ADD CONSTRAINT parcels_status_check
CHECK (status IN ('PENDING_COLLECTION', 'COLLECTED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS parcels_deleted_at_idx ON parcels(deleted_at);
CREATE INDEX IF NOT EXISTS parcels_deleted_by_idx ON parcels(deleted_by);
CREATE INDEX IF NOT EXISTS parcels_collection_deadline_idx ON parcels(collection_deadline);
