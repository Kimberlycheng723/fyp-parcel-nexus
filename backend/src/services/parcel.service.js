import { pool } from "../db/pool.js";
import { normalizeOptionalString, normalizeRequiredString } from "../utils/userValidation.js";

const MANAGEMENT_ROLES = ["ADMIN", "GUARD"];
const EXPORT_ROLES = ["ADMIN"];
const DELETE_ROLES = ["ADMIN"];
const STORED_STATUSES = ["PENDING_COLLECTION", "COLLECTED"];
const DISPLAY_STATUSES = ["PENDING_COLLECTION", "OVERDUE", "COLLECTED"];

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
  p.deleted_at,
  p.deleted_by,
  (p.status IN ('PENDING', 'PENDING_COLLECTION')
    AND p.collection_deadline IS NOT NULL
    AND p.collection_deadline < NOW()) AS is_overdue,
  CASE
    WHEN p.status = 'COLLECTED' THEN 'COLLECTED'
    WHEN p.status IN ('PENDING', 'PENDING_COLLECTION')
      AND p.collection_deadline IS NOT NULL
      AND p.collection_deadline < NOW()
      THEN 'OVERDUE'
    WHEN p.status IN ('PENDING', 'PENDING_COLLECTION') THEN 'PENDING_COLLECTION'
    ELSE p.status
  END AS display_status,
  u.block,
  u.floor,
  u.unit_number,
  u.full_unit_code,
  c.courier_name,
  c.courier_code,
  c.contact_number AS courier_contact_number,
  c.badge_color AS courier_badge_color,
  c.status AS courier_status,
  registered_user.user_id AS registered_user_id,
  registered_user.first_name AS registered_user_first_name,
  registered_user.last_name AS registered_user_last_name,
  registered_user.email AS registered_user_email,
  registered_user.role AS registered_user_role,
  deleted_user.user_id AS deleted_user_id,
  deleted_user.first_name AS deleted_user_first_name,
  deleted_user.last_name AS deleted_user_last_name,
  deleted_user.email AS deleted_user_email,
  deleted_user.role AS deleted_user_role
`;

const PARCEL_JOINS = `
  INNER JOIN units u ON u.unit_id = p.unit_id
  INNER JOIN courier_companies c ON c.courier_id = p.courier_id
  INNER JOIN users registered_user ON registered_user.user_id = p.registered_by
  LEFT JOIN users deleted_user ON deleted_user.user_id = p.deleted_by
`;

function canManageParcels(role) {
  return MANAGEMENT_ROLES.includes(role);
}

function canExportParcels(role) {
  return EXPORT_ROLES.includes(role);
}

function canDeleteParcels(role) {
  return DELETE_ROLES.includes(role);
}

function normalizeParcelStatus(status) {
  const normalized = normalizeRequiredString(status).toUpperCase();

  if (normalized === "PENDING") {
    return "PENDING_COLLECTION";
  }

  return normalized;
}

function toPositiveInteger(value, fallback, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeDateTimeInput(value) {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  return normalizeOptionalString(value);
}

function toSafeUser(row, prefix) {
  const userId = row[`${prefix}_user_id`];

  if (!userId) {
    return null;
  }

  return {
    user_id: userId,
    first_name: row[`${prefix}_user_first_name`],
    last_name: row[`${prefix}_user_last_name`],
    email: row[`${prefix}_user_email`],
    role: row[`${prefix}_user_role`]
  };
}

function toSafeParcel(row, { includeDeleted = false } = {}) {
  const safeParcel = {
    parcel_id: row.parcel_id,
    tracking_number: row.tracking_number,
    status: row.status === "PENDING" ? "PENDING_COLLECTION" : row.status,
    display_status: row.display_status,
    is_overdue: Boolean(row.is_overdue),
    parcel_photo_url: row.parcel_photo_url,
    delivery_person_contact: row.delivery_person_contact,
    collection_deadline: row.collection_deadline,
    collected_at: row.collected_at,
    created_at: row.created_at,
    registered_at: row.created_at,
    updated_at: row.updated_at,
    unit_id: row.unit_id,
    unit: {
      unit_id: row.unit_id,
      full_unit_code: row.full_unit_code,
      block: row.block,
      floor: row.floor,
      unit_number: row.unit_number
    },
    courier_id: row.courier_id,
    courier: {
      courier_id: row.courier_id,
      courier_name: row.courier_name,
      courier_code: row.courier_code,
      contact_number: row.courier_contact_number,
      badge_color: row.courier_badge_color,
      status: row.courier_status
    },
    registered_by: row.registered_by,
    registered_by_user: toSafeUser(row, "registered")
  };

  if (includeDeleted) {
    safeParcel.deleted_at = row.deleted_at;
    safeParcel.deleted_by = row.deleted_by;
    safeParcel.deleted_by_user = toSafeUser(row, "deleted");
  }

  return safeParcel;
}

function buildParcelFilters({ filters = {}, requesterRole, forExport = false }) {
  const whereClauses = [];
  const params = [];
  const search = normalizeRequiredString(filters.search);
  const status = normalizeParcelStatus(filters.status || "ALL");
  const includeDeleted = requesterRole === "ADMIN" && String(filters.include_deleted).toLowerCase() === "true";
  const dateFrom = normalizeRequiredString(filters.date_from);
  const dateTo = normalizeRequiredString(filters.date_to);
  const dateRange = normalizeRequiredString(filters.date_range).toLowerCase();

  if (!includeDeleted) {
    whereClauses.push("p.deleted_at IS NULL");
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const index = params.length;
    whereClauses.push(`
      (
        LOWER(p.tracking_number) LIKE $${index}
        OR LOWER(u.full_unit_code) LIKE $${index}
        OR LOWER(c.courier_name) LIKE $${index}
        OR LOWER(COALESCE(c.courier_code, '')) LIKE $${index}
        OR LOWER(p.status) LIKE $${index}
        OR LOWER(
          CASE
            WHEN p.status = 'COLLECTED' THEN 'COLLECTED'
            WHEN p.status IN ('PENDING', 'PENDING_COLLECTION')
              AND p.collection_deadline IS NOT NULL
              AND p.collection_deadline < NOW()
              THEN 'OVERDUE'
            WHEN p.status IN ('PENDING', 'PENDING_COLLECTION') THEN 'PENDING_COLLECTION'
            ELSE p.status
          END
        ) LIKE $${index}
      )
    `);
  }

  if (status && status !== "ALL") {
    if (!DISPLAY_STATUSES.includes(status)) {
      return { error: "INVALID_STATUS" };
    }

    if (status === "OVERDUE") {
      whereClauses.push(`
        p.status IN ('PENDING', 'PENDING_COLLECTION')
        AND p.collection_deadline IS NOT NULL
        AND p.collection_deadline < NOW()
      `);
    } else if (status === "PENDING_COLLECTION") {
      whereClauses.push(`
        p.status IN ('PENDING', 'PENDING_COLLECTION')
        AND (
          p.collection_deadline IS NULL
          OR p.collection_deadline >= NOW()
        )
      `);
    } else {
      params.push(status);
      whereClauses.push(`p.status = $${params.length}`);
    }
  }

  if (dateRange && dateRange !== "all") {
    const allowedRanges = {
      last_7_days: "7 days",
      last_30_days: "30 days",
      last_90_days: "90 days"
    };

    if (!allowedRanges[dateRange]) {
      return { error: "INVALID_DATE_RANGE" };
    }

    whereClauses.push(`p.created_at >= NOW() - INTERVAL '${allowedRanges[dateRange]}'`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    whereClauses.push(`p.created_at >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    whereClauses.push(`p.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  return {
    whereSql: whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "",
    params,
    includeDeleted,
    appliedFilters: {
      search: search || null,
      status: status || "ALL",
      date_from: dateFrom || null,
      date_to: dateTo || null,
      date_range: dateRange || null,
      include_deleted: includeDeleted,
      for_export: forExport
    }
  };
}

async function getParcelRowById(parcelId, { includeDeleted = false } = {}, client = pool) {
  const result = await client.query(
    `
      SELECT ${PARCEL_DETAIL_COLUMNS}
      FROM parcels p
      ${PARCEL_JOINS}
      WHERE p.parcel_id = $1
        AND ($2::boolean = TRUE OR p.deleted_at IS NULL)
      LIMIT 1
    `,
    [parcelId, includeDeleted]
  );

  return result.rows[0] || null;
}

async function trackingExists(trackingNumber, courierId, excludedParcelId = null, client = pool) {
  const result = await client.query(
    `
      SELECT parcel_id
      FROM parcels
      WHERE LOWER(tracking_number) = LOWER($1)
        AND courier_id = $2
        AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR parcel_id <> $3::uuid)
      LIMIT 1
    `,
    [trackingNumber, courierId, excludedParcelId]
  );

  return Boolean(result.rows[0]);
}

async function activeCourierExists(courierId, client = pool) {
  const result = await client.query(
    `
      SELECT courier_id
      FROM courier_companies
      WHERE courier_id = $1
        AND status = 'ACTIVE'
      LIMIT 1
    `,
    [courierId]
  );

  return Boolean(result.rows[0]);
}

async function unitExists(unitId, client = pool) {
  const result = await client.query(
    `
      SELECT unit_id
      FROM units
      WHERE unit_id = $1
      LIMIT 1
    `,
    [unitId]
  );

  return Boolean(result.rows[0]);
}

export async function getParcelSummary({ requester }) {
  if (!canManageParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_parcels,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
        )::int AS pending_collection_parcels,
        COUNT(*) FILTER (
          WHERE status = 'COLLECTED'
        )::int AS collected_parcels,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND collection_deadline IS NOT NULL
            AND collection_deadline < NOW()
        )::int AS overdue_parcels,
        COUNT(DISTINCT unit_id)::int AS total_units_with_parcels,
        MAX(updated_at) AS last_updated_at
      FROM parcels
      WHERE deleted_at IS NULL
    `
  );

  return result.rows[0];
}

export async function listParcels({ requester, filters = {} }) {
  if (!canManageParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const filterResult = buildParcelFilters({
    filters,
    requesterRole: requester.role
  });

  if (filterResult.error) {
    return filterResult;
  }

  const sortColumns = {
    created_at: "p.created_at",
    updated_at: "p.updated_at",
    tracking_number: "p.tracking_number",
    status: "p.status",
    collection_deadline: "p.collection_deadline",
    unit: "u.full_unit_code",
    courier: "c.courier_name"
  };
  const sortBy = sortColumns[normalizeRequiredString(filters.sort_by)] || "p.created_at";
  const sortOrder = normalizeRequiredString(filters.sort_order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 10, 100);
  const offset = (page - 1) * limit;
  const params = [...filterResult.params, limit, offset];
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;

  const result = await pool.query(
    `
      SELECT ${PARCEL_DETAIL_COLUMNS}, COUNT(*) OVER() AS total_count
      FROM parcels p
      ${PARCEL_JOINS}
      ${filterResult.whereSql}
      ORDER BY ${sortBy} ${sortOrder}, p.parcel_id DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    params
  );

  const total = Number(result.rows[0]?.total_count || 0);
  const totalPages = Math.ceil(total / limit);

  return {
    data: result.rows.map((row) =>
      toSafeParcel(row, {
        includeDeleted: filterResult.includeDeleted
      })
    ),
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1
    },
    filters: filterResult.appliedFilters
  };
}

export async function getParcelById({ requester, parcelId, includeDeleted = false }) {
  if (!canManageParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const canIncludeDeleted = requester.role === "ADMIN" && includeDeleted;
  const row = await getParcelRowById(parcelId, {
    includeDeleted: canIncludeDeleted
  });

  if (!row) {
    return { error: "PARCEL_NOT_FOUND" };
  }

  return {
    parcel: toSafeParcel(row, {
      includeDeleted: canIncludeDeleted
    })
  };
}

export async function updateParcel({ requester, parcelId, updates }) {
  if (!canManageParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const currentParcel = await getParcelRowById(parcelId);

  if (!currentParcel) {
    return { error: "PARCEL_NOT_FOUND" };
  }

  const trackingNumber = normalizeRequiredString(updates.tracking_number ?? currentParcel.tracking_number);
  const courierId = normalizeRequiredString(updates.courier_id ?? currentParcel.courier_id);
  const unitId = normalizeRequiredString(updates.unit_id ?? currentParcel.unit_id);
  const deliveryPersonContact = normalizeRequiredString(
    updates.delivery_person_contact ?? currentParcel.delivery_person_contact
  );
  const parcelPhotoUrl =
    updates.parcel_photo_url === null
      ? null
      : normalizeOptionalString(updates.parcel_photo_url ?? currentParcel.parcel_photo_url);
  const collectionDeadline =
    updates.collection_deadline === null
      ? null
      : normalizeDateTimeInput(updates.collection_deadline ?? currentParcel.collection_deadline);

  if (!trackingNumber) {
    return { error: "TRACKING_NUMBER_REQUIRED" };
  }

  if (!courierId || !isUuid(courierId)) {
    return { error: "COURIER_REQUIRED" };
  }

  if (!unitId || !isUuid(unitId)) {
    return { error: "UNIT_REQUIRED" };
  }

  if (!deliveryPersonContact) {
    return { error: "DELIVERY_CONTACT_REQUIRED" };
  }

  if (collectionDeadline && Number.isNaN(Date.parse(collectionDeadline))) {
    return { error: "INVALID_COLLECTION_DEADLINE" };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (await trackingExists(trackingNumber, courierId, parcelId, client)) {
      await client.query("ROLLBACK");
      return { error: "TRACKING_ALREADY_EXISTS" };
    }

    if (!(await activeCourierExists(courierId, client))) {
      await client.query("ROLLBACK");
      return { error: "COURIER_NOT_FOUND" };
    }

    if (!(await unitExists(unitId, client))) {
      await client.query("ROLLBACK");
      return { error: "UNIT_NOT_FOUND" };
    }

    await client.query(
      `
        UPDATE parcels
        SET
          tracking_number = $1,
          courier_id = $2,
          unit_id = $3,
          delivery_person_contact = $4,
          parcel_photo_url = $5,
          collection_deadline = $6,
          updated_at = NOW()
        WHERE parcel_id = $7
          AND deleted_at IS NULL
      `,
      [trackingNumber, courierId, unitId, deliveryPersonContact, parcelPhotoUrl, collectionDeadline, parcelId]
    );

    const updatedRow = await getParcelRowById(parcelId, {}, client);
    await client.query("COMMIT");

    return {
      parcel: toSafeParcel(updatedRow)
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

export async function updateParcelStatus({ requester, parcelId, status }) {
  if (!canManageParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const normalizedStatus = normalizeParcelStatus(status);

  if (!STORED_STATUSES.includes(normalizedStatus)) {
    return { error: "INVALID_STORED_STATUS" };
  }

  if (normalizedStatus === "COLLECTED") {
    return { error: "COLLECTION_STATUS_RESTRICTED" };
  }

  const currentParcel = await getParcelRowById(parcelId);

  if (!currentParcel) {
    return { error: "PARCEL_NOT_FOUND" };
  }

  await pool.query(
    `
      UPDATE parcels
      SET
        status = $1,
        collected_at = NULL,
        updated_at = NOW()
      WHERE parcel_id = $2
        AND deleted_at IS NULL
    `,
    [normalizedStatus, parcelId]
  );

  return {
    parcel: toSafeParcel(await getParcelRowById(parcelId))
  };
}

export async function softDeleteParcel({ requester, parcelId }) {
  if (!canDeleteParcels(requester.role)) {
    return { error: "FORBIDDEN_DELETE" };
  }

  const currentParcel = await getParcelRowById(parcelId);

  if (!currentParcel) {
    return { error: "PARCEL_NOT_FOUND" };
  }

  await pool.query(
    `
      UPDATE parcels
      SET
        deleted_at = NOW(),
        deleted_by = $1,
        updated_at = NOW()
      WHERE parcel_id = $2
        AND deleted_at IS NULL
    `,
    [requester.user_id, parcelId]
  );

  const deletedRow = await getParcelRowById(parcelId, {
    includeDeleted: true
  });

  return {
    message: "Parcel record deleted successfully.",
    parcel: toSafeParcel(deletedRow, {
      includeDeleted: true
    })
  };
}

export async function exportParcels({ requester, filters = {} }) {
  if (!canExportParcels(requester.role)) {
    return { error: "FORBIDDEN_EXPORT" };
  }

  const filterResult = buildParcelFilters({
    filters,
    requesterRole: requester.role,
    forExport: true
  });

  if (filterResult.error) {
    return filterResult;
  }

  const result = await pool.query(
    `
      SELECT ${PARCEL_DETAIL_COLUMNS}
      FROM parcels p
      ${PARCEL_JOINS}
      ${filterResult.whereSql}
      ORDER BY p.created_at DESC, p.parcel_id DESC
    `,
    filterResult.params
  );

  const data = result.rows.map((row) => {
    const registeredBy = toSafeUser(row, "registered");
    const registeredByName = [registeredBy?.first_name, registeredBy?.last_name].filter(Boolean).join(" ");

    return {
      tracking_number: row.tracking_number,
      status: row.status === "PENDING" ? "PENDING_COLLECTION" : row.status,
      display_status: row.display_status,
      is_overdue: Boolean(row.is_overdue),
      unit_full_code: row.full_unit_code,
      courier_name: row.courier_name,
      courier_code: row.courier_code,
      registered_by_name: registeredByName || registeredBy?.role || null,
      registered_by_email: registeredBy?.email || null,
      delivery_person_contact: row.delivery_person_contact,
      parcel_photo_url: row.parcel_photo_url,
      collection_deadline: row.collection_deadline,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  });

  return {
    data,
    count: data.length,
    filters: filterResult.appliedFilters
  };
}

export function getParcelStatusOptions() {
  return {
    statuses: [
      {
        value: "PENDING_COLLECTION",
        label: "Pending Collection",
        stored: true
      },
      {
        value: "OVERDUE",
        label: "Overdue",
        stored: false,
        note: "Calculated when a pending parcel is past its collection deadline."
      },
      {
        value: "COLLECTED",
        label: "Collected",
        stored: true
      }
    ]
  };
}
