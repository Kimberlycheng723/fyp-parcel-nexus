CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS units (
  unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block TEXT NOT NULL,
  floor TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  full_unit_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT NOT NULL,
  role TEXT NOT NULL,
  unit_id UUID REFERENCES units(unit_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_by UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'GUARD', 'RESIDENT')),
  CONSTRAINT users_status_check CHECK (status IN ('PENDING_ACTIVATION', 'ACTIVE', 'DEACTIVATED')),
  CONSTRAINT users_resident_unit_check CHECK (
    (role = 'RESIDENT' AND unit_id IS NOT NULL)
    OR
    (role <> 'RESIDENT' AND unit_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_one_resident_per_unit_idx
  ON users(unit_id)
  WHERE role = 'RESIDENT' AND unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);
CREATE INDEX IF NOT EXISTS users_created_by_idx ON users(created_by);

CREATE TABLE IF NOT EXISTS courier_companies (
  courier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_name TEXT NOT NULL UNIQUE,
  contact_number TEXT,
  created_by UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS courier_companies_created_by_idx ON courier_companies(created_by);

CREATE TABLE IF NOT EXISTS parcels (
  parcel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL UNIQUE,
  courier_id UUID NOT NULL REFERENCES courier_companies(courier_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES units(unit_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  registered_by UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  delivery_person_contact TEXT NOT NULL,
  parcel_photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  collection_deadline TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcels_status_check CHECK (status IN ('PENDING', 'COLLECTED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS parcels_courier_id_idx ON parcels(courier_id);
CREATE INDEX IF NOT EXISTS parcels_unit_id_idx ON parcels(unit_id);
CREATE INDEX IF NOT EXISTS parcels_registered_by_idx ON parcels(registered_by);
CREATE INDEX IF NOT EXISTS parcels_status_idx ON parcels(status);

CREATE TABLE IF NOT EXISTS parcel_collections (
  collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  verified_by UUID REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  qr_token_hash TEXT NOT NULL UNIQUE,
  qr_expiry TIMESTAMPTZ NOT NULL,
  collection_status TEXT NOT NULL DEFAULT 'ACTIVE',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcel_collections_status_check CHECK (collection_status IN ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS parcel_collections_resident_id_idx ON parcel_collections(resident_id);
CREATE INDEX IF NOT EXISTS parcel_collections_verified_by_idx ON parcel_collections(verified_by);
CREATE INDEX IF NOT EXISTS parcel_collections_status_idx ON parcel_collections(collection_status);
CREATE INDEX IF NOT EXISTS parcel_collections_qr_expiry_idx ON parcel_collections(qr_expiry);

CREATE TABLE IF NOT EXISTS parcel_collection_items (
  collection_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES parcel_collections(collection_id) ON UPDATE CASCADE ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES parcels(parcel_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcel_collection_items_unique_parcel_per_collection UNIQUE (collection_id, parcel_id)
);

CREATE INDEX IF NOT EXISTS parcel_collection_items_collection_id_idx ON parcel_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS parcel_collection_items_parcel_id_idx ON parcel_collection_items(parcel_id);

CREATE TABLE IF NOT EXISTS account_activation_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_activation_tokens_user_id_idx ON account_activation_tokens(user_id);
CREATE INDEX IF NOT EXISTS account_activation_tokens_expires_at_idx ON account_activation_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

DROP TRIGGER IF EXISTS set_units_updated_at ON units;
CREATE TRIGGER set_units_updated_at
BEFORE UPDATE ON units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_courier_companies_updated_at ON courier_companies;
CREATE TRIGGER set_courier_companies_updated_at
BEFORE UPDATE ON courier_companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_parcels_updated_at ON parcels;
CREATE TRIGGER set_parcels_updated_at
BEFORE UPDATE ON parcels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_parcel_collections_updated_at ON parcel_collections;
CREATE TRIGGER set_parcel_collections_updated_at
BEFORE UPDATE ON parcel_collections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
