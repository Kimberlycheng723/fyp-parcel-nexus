ALTER TABLE courier_companies
ADD COLUMN IF NOT EXISTS courier_code TEXT;

ALTER TABLE courier_companies
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courier_companies_status_check'
  ) THEN
    ALTER TABLE courier_companies
    ADD CONSTRAINT courier_companies_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS courier_companies_courier_name_lower_unique_idx
  ON courier_companies(LOWER(courier_name));

CREATE UNIQUE INDEX IF NOT EXISTS courier_companies_courier_code_lower_unique_idx
  ON courier_companies(LOWER(courier_code))
  WHERE courier_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS courier_companies_status_idx
  ON courier_companies(status);

CREATE UNIQUE INDEX IF NOT EXISTS parcels_tracking_number_lower_unique_idx
  ON parcels(LOWER(tracking_number));
