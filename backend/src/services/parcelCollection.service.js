import { pool } from "../db/pool.js";
import { startCollectionVerification } from "./collectionVerification.service.js";
import { generateSecureToken, hashToken } from "../utils/token.js";

const QR_EXPIRY_MINUTES = 2;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function normalizeParcelIds(parcelIds) {
  if (!Array.isArray(parcelIds) || parcelIds.length === 0) {
    return { error: "PARCELS_REQUIRED" };
  }

  const normalizedIds = parcelIds.map((parcelId) =>
    typeof parcelId === "string" ? parcelId.trim() : ""
  );

  if (normalizedIds.some((parcelId) => !isUuid(parcelId))) {
    return { error: "INVALID_PARCEL_SELECTION" };
  }

  const uniqueIds = [...new Set(normalizedIds)];

  if (uniqueIds.length !== normalizedIds.length) {
    return { error: "DUPLICATE_PARCEL_SELECTION" };
  }

  return { parcelIds: uniqueIds };
}

function toCollectionParcel(row) {
  return {
    parcel_id: row.parcel_id,
    parcel_room_id: row.parcel_room_id,
    parcel_room_name: row.parcel_room_name,
    tracking_number: row.tracking_number,
    courier_name: row.courier_name,
    is_overdue: Boolean(row.is_overdue)
  };
}

export async function createResidentCollection({ requester, parcelIds }) {
  if (requester.role !== "RESIDENT") {
    return { error: "RESIDENT_FORBIDDEN" };
  }

  const normalizedSelection = normalizeParcelIds(parcelIds);

  if (normalizedSelection.error) {
    return normalizedSelection;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const residentResult = await client.query(
      `
        SELECT unit_id
        FROM users
        WHERE user_id = $1
          AND role = 'RESIDENT'
          AND unit_id IS NOT NULL
        LIMIT 1
        FOR SHARE
      `,
      [requester.user_id]
    );
    const resident = residentResult.rows[0];

    if (!resident) {
      await client.query("ROLLBACK");
      return { error: "RESIDENT_UNIT_NOT_FOUND" };
    }

    const parcelsResult = await client.query(
      `
        SELECT
          p.parcel_id,
          p.parcel_room_id,
          room.name AS parcel_room_name,
          p.tracking_number,
          p.status,
          p.collection_deadline,
          c.courier_name,
          (
            p.collection_deadline IS NOT NULL
            AND p.collection_deadline < NOW()
          ) AS is_overdue
        FROM parcels p
        INNER JOIN courier_companies c ON c.courier_id = p.courier_id
        LEFT JOIN parcel_rooms room ON room.id = p.parcel_room_id
        WHERE p.parcel_id = ANY($1::uuid[])
          AND p.unit_id = $2
          AND p.deleted_at IS NULL
        ORDER BY p.parcel_id
        FOR UPDATE OF p
      `,
      [normalizedSelection.parcelIds, resident.unit_id]
    );

    if (parcelsResult.rows.length !== normalizedSelection.parcelIds.length) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_NOT_FOUND" };
    }

    if (parcelsResult.rows.some((parcel) => parcel.status === "COLLECTED")) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_ALREADY_COLLECTED" };
    }

    if (parcelsResult.rows.some((parcel) => parcel.status !== "PENDING_COLLECTION")) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_NOT_AVAILABLE" };
    }

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const collectionResult = await client.query(
      `
        INSERT INTO parcel_collections (
          resident_id,
          qr_token_hash,
          qr_expiry,
          collection_status
        )
        VALUES ($1, $2, NOW() + INTERVAL '2 minutes', 'ACTIVE')
        RETURNING collection_id, qr_expiry
      `,
      [requester.user_id, tokenHash]
    );
    const collection = collectionResult.rows[0];

    await client.query(
      `
        INSERT INTO parcel_collection_items (collection_id, parcel_id)
        SELECT $1, selected_parcel_id
        FROM UNNEST($2::uuid[]) AS selected_parcel_id
      `,
      [collection.collection_id, normalizedSelection.parcelIds]
    );

    await client.query("COMMIT");

    return {
      collection: {
        collection_id: collection.collection_id,
        token: rawToken,
        expires_at: collection.qr_expiry,
        expires_in_seconds: QR_EXPIRY_MINUTES * 60,
        parcel_count: parcelsResult.rows.length,
        parcels: parcelsResult.rows.map(toCollectionParcel)
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyGuardCollection(input) {
  return startCollectionVerification(input);
}
