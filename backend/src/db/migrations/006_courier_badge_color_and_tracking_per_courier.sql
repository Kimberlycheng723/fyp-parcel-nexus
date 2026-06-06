ALTER TABLE courier_companies
ADD COLUMN IF NOT EXISTS badge_color TEXT;

ALTER TABLE courier_companies
DROP CONSTRAINT IF EXISTS courier_companies_badge_color_check;

ALTER TABLE courier_companies
ADD CONSTRAINT courier_companies_badge_color_check
CHECK (
  badge_color IS NULL
  OR badge_color IN (
    '#F4B400',
    '#F97316',
    '#EF4444',
    '#2563EB',
    '#16A34A',
    '#7C3AED',
    '#64748B'
  )
);

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT courier_id, LOWER(tracking_number) AS normalized_tracking_number
    FROM parcels
    WHERE deleted_at IS NULL
    GROUP BY courier_id, LOWER(tracking_number)
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add courier tracking uniqueness rule. % active duplicate courier/tracking groups exist.',
      duplicate_count;
  END IF;
END $$;

ALTER TABLE parcels
DROP CONSTRAINT IF EXISTS parcels_tracking_number_key;

DROP INDEX IF EXISTS parcels_tracking_number_lower_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS parcels_active_courier_tracking_lower_unique_idx
ON parcels(courier_id, LOWER(tracking_number))
WHERE deleted_at IS NULL;
