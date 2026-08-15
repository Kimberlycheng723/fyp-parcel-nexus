import { pool } from "../db/pool.js";
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

export async function verifyGuardCollection({ requester, token }) {
  if (requester.role !== "GUARD") {
    return { error: "GUARD_FORBIDDEN" };
  }

  const normalizedToken = typeof token === "string" ? token.trim() : "";

  if (!normalizedToken) {
    return { error: "TOKEN_REQUIRED" };
  }

  const tokenHash = hashToken(normalizedToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const collectionResult = await client.query(
      `
        SELECT
          pc.collection_id,
          pc.resident_id,
          pc.collection_status,
          pc.qr_expiry,
          (pc.qr_expiry <= NOW()) AS is_expired,
          resident.unit_id AS resident_unit_id,
          resident.role AS resident_role
        FROM parcel_collections pc
        INNER JOIN users resident ON resident.user_id = pc.resident_id
        WHERE pc.qr_token_hash = $1
        LIMIT 1
        FOR UPDATE OF pc
      `,
      [tokenHash]
    );
    const collection = collectionResult.rows[0];

    if (!collection) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_NOT_FOUND" };
    }

    if (collection.collection_status === "USED") {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_ALREADY_USED" };
    }

    if (collection.collection_status === "CANCELLED") {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_CANCELLED" };
    }

    if (
      collection.collection_status === "EXPIRED" ||
      collection.is_expired
    ) {
      if (collection.collection_status === "ACTIVE") {
        await client.query(
          `
            UPDATE parcel_collections
            SET collection_status = 'EXPIRED'
            WHERE collection_id = $1
          `,
          [collection.collection_id]
        );
      }

      await client.query("COMMIT");
      return { error: "COLLECTION_EXPIRED" };
    }

    if (
      collection.collection_status !== "ACTIVE" ||
      collection.resident_role !== "RESIDENT" ||
      !collection.resident_unit_id
    ) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_NOT_AVAILABLE" };
    }

    const itemResult = await client.query(
      `
        SELECT parcel_id
        FROM parcel_collection_items
        WHERE collection_id = $1
        ORDER BY parcel_id
      `,
      [collection.collection_id]
    );
    const itemParcelIds = itemResult.rows.map((item) => item.parcel_id);

    if (itemParcelIds.length === 0) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_EMPTY" };
    }

    const parcelsResult = await client.query(
      `
        SELECT
          parcel_id,
          tracking_number,
          status,
          unit_id,
          deleted_at
        FROM parcels
        WHERE parcel_id = ANY($1::uuid[])
        ORDER BY parcel_id
        FOR UPDATE
      `,
      [itemParcelIds]
    );

    if (parcelsResult.rows.length !== itemParcelIds.length) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_PARCEL_INVALID" };
    }

    if (
      parcelsResult.rows.some(
        (parcel) => parcel.deleted_at || parcel.unit_id !== collection.resident_unit_id
      )
    ) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_PARCEL_INVALID" };
    }

    if (parcelsResult.rows.some((parcel) => parcel.status === "COLLECTED")) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_ALREADY_COLLECTED" };
    }

    if (parcelsResult.rows.some((parcel) => parcel.status !== "PENDING_COLLECTION")) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_NOT_AVAILABLE" };
    }

    const collectedParcelsResult = await client.query(
      `
        UPDATE parcels
        SET
          status = 'COLLECTED',
          collected_at = NOW()
        WHERE parcel_id = ANY($1::uuid[])
          AND status = 'PENDING_COLLECTION'
          AND deleted_at IS NULL
        RETURNING parcel_id, tracking_number, collected_at
      `,
      [itemParcelIds]
    );

    if (collectedParcelsResult.rows.length !== itemParcelIds.length) {
      await client.query("ROLLBACK");
      return { error: "PARCEL_STATE_CHANGED" };
    }

    const completedCollectionResult = await client.query(
      `
        UPDATE parcel_collections
        SET
          collection_status = 'USED',
          verified_by = $1,
          collected_at = NOW()
        WHERE collection_id = $2
          AND collection_status = 'ACTIVE'
        RETURNING collection_id, verified_by, collected_at
      `,
      [requester.user_id, collection.collection_id]
    );

    if (completedCollectionResult.rows.length !== 1) {
      await client.query("ROLLBACK");
      return { error: "COLLECTION_STATE_CHANGED" };
    }

    await client.query("COMMIT");

    const completedCollection = completedCollectionResult.rows[0];

    return {
      message: "Parcel collection verified successfully.",
      collection: {
        collection_id: completedCollection.collection_id,
        verified_by: completedCollection.verified_by,
        collected_at: completedCollection.collected_at,
        parcel_count: collectedParcelsResult.rows.length,
        parcels: collectedParcelsResult.rows
      },
      realtime: {
        recipient_user_id: collection.resident_id,
        event: "collection:completed",
        payload: {
          collection_id: completedCollection.collection_id,
          parcel_ids: collectedParcelsResult.rows.map((parcel) => parcel.parcel_id),
          collected_at: completedCollection.collected_at
        }
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
