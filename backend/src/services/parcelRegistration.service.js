import { pool } from "../db/pool.js";
import { getActiveCourierById } from "./courier.service.js";
import { getUnitById } from "./unit.service.js";
import { normalizeRequiredString } from "../utils/userValidation.js";

const PARCEL_DETAIL_COLUMNS = `
  p.parcel_id,
  p.tracking_number,
  p.courier_id,
  p.unit_id,
  p.registered_by,
  p.delivery_person_contact,
  p.parcel_photo_url,
  p.status,
  p.collection_deadline,
  p.collected_at,
  p.created_at,
  p.updated_at,
  c.courier_name,
  c.courier_code,
  c.contact_number AS courier_contact_number,
  c.status AS courier_status,
  units.block,
  units.floor,
  units.unit_number,
  units.full_unit_code,
  registered_user.user_id AS registered_user_id,
  registered_user.first_name AS registered_user_first_name,
  registered_user.last_name AS registered_user_last_name,
  registered_user.email AS registered_user_email,
  registered_user.role AS registered_user_role
`;

function toSafeParcel(row) {
  return {
    parcel_id: row.parcel_id,
    tracking_number: row.tracking_number,
    courier_id: row.courier_id,
    courier: {
      courier_id: row.courier_id,
      courier_name: row.courier_name,
      courier_code: row.courier_code,
      contact_number: row.courier_contact_number,
      status: row.courier_status
    },
    unit_id: row.unit_id,
    unit: {
      unit_id: row.unit_id,
      block: row.block,
      floor: row.floor,
      unit_number: row.unit_number,
      full_unit_code: row.full_unit_code
    },
    registered_by: row.registered_by,
    registered_by_user: {
      user_id: row.registered_user_id,
      first_name: row.registered_user_first_name,
      last_name: row.registered_user_last_name,
      email: row.registered_user_email,
      role: row.registered_user_role
    },
    delivery_person_contact: row.delivery_person_contact,
    parcel_photo_url: row.parcel_photo_url,
    parcel_status: row.status,
    registered_at: row.created_at,
    updated_at: row.updated_at
  };
}

function validateSessionInput(input) {
  const courierId = normalizeRequiredString(input.courier_id);
  const deliveryPersonContact = normalizeRequiredString(input.delivery_person_contact);
  const parcels = Array.isArray(input.parcels) ? input.parcels : [];

  if (!courierId) {
    return { error: "COURIER_REQUIRED" };
  }

  if (!deliveryPersonContact) {
    return { error: "DELIVERY_CONTACT_REQUIRED" };
  }

  if (parcels.length === 0) {
    return { error: "PARCELS_REQUIRED" };
  }

  const normalizedParcels = parcels.map((parcel) => ({
    unit_id: normalizeRequiredString(parcel.unit_id),
    tracking_number: normalizeRequiredString(parcel.tracking_number),
    parcel_photo_url: normalizeRequiredString(parcel.parcel_photo_url)
  }));

  for (const parcel of normalizedParcels) {
    if (!parcel.unit_id) {
      return { error: "UNIT_REQUIRED" };
    }

    if (!parcel.tracking_number) {
      return { error: "TRACKING_NUMBER_REQUIRED" };
    }

    if (!parcel.parcel_photo_url) {
      return { error: "PARCEL_PHOTO_REQUIRED" };
    }
  }

  const trackingNumbers = normalizedParcels.map((parcel) => parcel.tracking_number.toLowerCase());
  const uniqueTrackingNumbers = new Set(trackingNumbers);

  if (uniqueTrackingNumbers.size !== trackingNumbers.length) {
    return { error: "DUPLICATE_TRACKING_IN_SESSION" };
  }

  return {
    value: {
      courierId,
      deliveryPersonContact,
      parcels: normalizedParcels
    }
  };
}

async function getParcelRowsByIds(parcelIds, client = pool) {
  const result = await client.query(
    `
      SELECT ${PARCEL_DETAIL_COLUMNS}
      FROM parcels p
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      INNER JOIN units ON units.unit_id = p.unit_id
      INNER JOIN users registered_user ON registered_user.user_id = p.registered_by
      WHERE p.parcel_id = ANY($1::uuid[])
      ORDER BY p.created_at ASC
    `,
    [parcelIds]
  );

  return result.rows.map(toSafeParcel);
}

export async function registerParcelSession({ requester, input }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const validation = validateSessionInput(input);

  if (validation.error) {
    return validation;
  }

  const data = validation.value;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const courier = await getActiveCourierById(data.courierId, client);

    if (!courier) {
      await client.query("ROLLBACK");
      return { error: "COURIER_NOT_FOUND" };
    }

    const createdParcelIds = [];

    for (const parcel of data.parcels) {
      const unit = await getUnitById(parcel.unit_id, client);

      if (!unit) {
        await client.query("ROLLBACK");
        return { error: "UNIT_NOT_FOUND" };
      }

      const existingTracking = await client.query(
        `
          SELECT parcel_id
          FROM parcels
          WHERE LOWER(tracking_number) = LOWER($1)
          LIMIT 1
        `,
        [parcel.tracking_number]
      );

      if (existingTracking.rows[0]) {
        await client.query("ROLLBACK");
        return { error: "TRACKING_ALREADY_EXISTS" };
      }

      const insertResult = await client.query(
        `
          INSERT INTO parcels (
            tracking_number,
            courier_id,
            unit_id,
            registered_by,
            delivery_person_contact,
            parcel_photo_url,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
          RETURNING parcel_id
        `,
        [
          parcel.tracking_number,
          data.courierId,
          parcel.unit_id,
          requester.user_id,
          data.deliveryPersonContact,
          parcel.parcel_photo_url
        ]
      );

      createdParcelIds.push(insertResult.rows[0].parcel_id);
    }

    const parcels = await getParcelRowsByIds(createdParcelIds, client);

    await client.query("COMMIT");

    return {
      message: "Parcels registered successfully. Resident notification will be handled in the notification module.",
      summary: {
        courier_id: data.courierId,
        delivery_person_contact: data.deliveryPersonContact,
        count: parcels.length
      },
      parcels
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return { error: "TRACKING_ALREADY_EXISTS" };
    }

    throw error;
  } finally {
    client.release();
  }
}
