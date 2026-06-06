import { pool } from "../db/pool.js";
import { normalizeOptionalString, normalizeRequiredString } from "../utils/userValidation.js";

const COURIER_COLUMNS = `
  c.courier_id,
  c.courier_name,
  c.courier_code,
  c.contact_number,
  c.badge_color,
  c.status,
  c.created_by,
  c.created_at,
  c.updated_at,
  creator.user_id AS creator_user_id,
  creator.first_name AS creator_first_name,
  creator.last_name AS creator_last_name,
  creator.email AS creator_email,
  creator.role AS creator_role
`;

const SAFE_BADGE_COLORS = new Set([
  "#F4B400",
  "#F97316",
  "#EF4444",
  "#2563EB",
  "#16A34A",
  "#7C3AED",
  "#64748B"
]);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
}

function toSafeCourier(row) {
  return {
    courier_id: row.courier_id,
    courier_name: row.courier_name,
    courier_code: row.courier_code,
    contact_number: row.contact_number,
    badge_color: row.badge_color,
    status: row.status,
    created_by: row.created_by,
    created_by_user: row.created_by
      ? {
          user_id: row.creator_user_id,
          first_name: row.creator_first_name,
          last_name: row.creator_last_name,
          email: row.creator_email,
          role: row.creator_role
        }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function listActiveCouriers() {
  const result = await pool.query(
    `
      SELECT ${COURIER_COLUMNS}
      FROM courier_companies c
      LEFT JOIN users creator ON creator.user_id = c.created_by
      WHERE c.status = 'ACTIVE'
      ORDER BY c.courier_name ASC
    `
  );

  return {
    couriers: result.rows.map(toSafeCourier)
  };
}

export async function createCourier({ requester, input }) {
  const courierName = normalizeRequiredString(input.courier_name);
  const courierCode = normalizeOptionalString(input.courier_code || input.short_name)?.toUpperCase() || null;
  const contactNumber = normalizeOptionalString(input.contact_number);
  const badgeColor = normalizeOptionalString(input.badge_color);

  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  if (!courierName) {
    return { error: "COURIER_NAME_REQUIRED" };
  }

  if (!courierCode) {
    return { error: "COURIER_CODE_REQUIRED" };
  }

  if (badgeColor && !SAFE_BADGE_COLORS.has(badgeColor)) {
    return { error: "INVALID_BADGE_COLOR" };
  }

  const duplicateResult = await pool.query(
    `
      SELECT courier_id
      FROM courier_companies
      WHERE LOWER(courier_name) = LOWER($1)
        OR ($2::text IS NOT NULL AND LOWER(courier_code) = LOWER($2))
      LIMIT 1
    `,
    [courierName, courierCode]
  );

  if (duplicateResult.rows[0]) {
    return { error: "COURIER_ALREADY_EXISTS" };
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO courier_companies (
          courier_name,
          courier_code,
          contact_number,
          badge_color,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
        RETURNING courier_id
      `,
      [courierName, courierCode, contactNumber || null, badgeColor || null, requester.user_id]
    );

    const courierResult = await pool.query(
      `
        SELECT ${COURIER_COLUMNS}
        FROM courier_companies c
        LEFT JOIN users creator ON creator.user_id = c.created_by
        WHERE c.courier_id = $1
        LIMIT 1
      `,
      [result.rows[0].courier_id]
    );

    return {
      courier: toSafeCourier(courierResult.rows[0])
    };
  } catch (error) {
    if (error.code === "23505") {
      return { error: "COURIER_ALREADY_EXISTS" };
    }

    throw error;
  }
}

export async function getActiveCourierById(courierId, client = pool) {
  const result = await client.query(
    `
      SELECT courier_id, courier_name, courier_code, contact_number, badge_color, status
      FROM courier_companies
      WHERE courier_id = $1
        AND status = 'ACTIVE'
      LIMIT 1
    `,
    [courierId]
  );

  return result.rows[0] || null;
}

export async function updateCourier({ requester, courierId, input }) {
  if (!requester?.user_id) {
    return { error: "FORBIDDEN" };
  }

  const courierName = normalizeRequiredString(input.courier_name);
  const courierCode = normalizeOptionalString(input.courier_code || input.short_name)?.toUpperCase() || null;
  const contactNumber = normalizeOptionalString(input.contact_number);
  const badgeColor = normalizeOptionalString(input.badge_color);

  if (!courierId || !isUuid(courierId)) {
    return { error: "COURIER_NOT_FOUND" };
  }

  if (!courierName) {
    return { error: "COURIER_NAME_REQUIRED" };
  }

  if (!courierCode) {
    return { error: "COURIER_CODE_REQUIRED" };
  }

  if (badgeColor && !SAFE_BADGE_COLORS.has(badgeColor)) {
    return { error: "INVALID_BADGE_COLOR" };
  }

  const existingResult = await pool.query(
    `
      SELECT courier_id
      FROM courier_companies
      WHERE courier_id = $1
        AND status = 'ACTIVE'
      LIMIT 1
    `,
    [courierId]
  );

  if (!existingResult.rows[0]) {
    return { error: "COURIER_NOT_FOUND" };
  }

  const duplicateResult = await pool.query(
    `
      SELECT courier_id
      FROM courier_companies
      WHERE courier_id <> $1
        AND (
          LOWER(courier_name) = LOWER($2)
          OR LOWER(courier_code) = LOWER($3)
        )
      LIMIT 1
    `,
    [courierId, courierName, courierCode]
  );

  if (duplicateResult.rows[0]) {
    return { error: "COURIER_ALREADY_EXISTS" };
  }

  try {
    await pool.query(
      `
        UPDATE courier_companies
        SET
          courier_name = $1,
          courier_code = $2,
          contact_number = $3,
          badge_color = $4,
          updated_at = NOW()
        WHERE courier_id = $5
          AND status = 'ACTIVE'
      `,
      [courierName, courierCode, contactNumber || null, badgeColor || null, courierId]
    );

    const courierResult = await pool.query(
      `
        SELECT ${COURIER_COLUMNS}
        FROM courier_companies c
        LEFT JOIN users creator ON creator.user_id = c.created_by
        WHERE c.courier_id = $1
        LIMIT 1
      `,
      [courierId]
    );

    return {
      courier: toSafeCourier(courierResult.rows[0])
    };
  } catch (error) {
    if (error.code === "23505") {
      return { error: "COURIER_ALREADY_EXISTS" };
    }

    throw error;
  }
}
