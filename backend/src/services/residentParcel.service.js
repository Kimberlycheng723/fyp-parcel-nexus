import { pool } from "../db/pool.js";

const RESIDENT_ROLE = "RESIDENT";
const VALID_TABS = ["pending", "history"];

function canViewResidentParcels(role) {
  return role === RESIDENT_ROLE;
}

function numberValue(value) {
  return Number(value || 0);
}

function toPositiveInteger(value, fallback, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function normalizeSearch(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function buildDisplayStatus(row) {
  if (row.display_status === "OVERDUE") {
    return "Overdue";
  }

  if (row.display_status === "COLLECTED") {
    return "Collected";
  }

  return "Pending Collection";
}

function toUnit(row) {
  if (!row.unit_id) {
    return null;
  }

  return {
    unit_id: row.unit_id,
    unit_full_code: row.full_unit_code
  };
}

function toResidentParcelListItem(row) {
  return {
    parcel_id: row.parcel_id,
    tracking_number: row.tracking_number,
    unit_full_code: row.full_unit_code,
    courier_name: row.courier_name,
    courier_code: row.courier_code,
    courier_badge_color: row.courier_badge_color,
    display_status: buildDisplayStatus(row),
    is_overdue: Boolean(row.is_overdue),
    collection_deadline: row.collection_deadline,
    created_at: row.created_at,
    collected_at: row.collected_at
  };
}

function toResidentParcelDetail(row) {
  return {
    parcel_id: row.parcel_id,
    tracking_number: row.tracking_number,
    unit_full_code: row.full_unit_code,
    courier_name: row.courier_name,
    courier_code: row.courier_code,
    courier_badge_color: row.courier_badge_color,
    display_status: buildDisplayStatus(row),
    is_overdue: Boolean(row.is_overdue),
    delivery_person_contact: row.delivery_person_contact,
    parcel_photo_url: row.parcel_photo_url,
    collection_deadline: row.collection_deadline,
    created_at: row.created_at,
    collected_at: row.collected_at,
    registered_by_name: [row.registered_first_name, row.registered_last_name].filter(Boolean).join(" ") || null
  };
}

async function getResidentUnit(requester) {
  if (!canViewResidentParcels(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const result = await pool.query(
    `
      SELECT
        users.unit_id,
        units.full_unit_code
      FROM users
      INNER JOIN units ON units.unit_id = users.unit_id
      WHERE users.user_id = $1
        AND users.role = 'RESIDENT'
      LIMIT 1
    `,
    [requester.user_id]
  );

  const unit = result.rows[0];

  if (!unit) {
    return { error: "RESIDENT_UNIT_NOT_FOUND" };
  }

  return {
    unit: toUnit(unit)
  };
}

export async function getResidentParcelSummary({ requester }) {
  const residentUnit = await getResidentUnit(requester);

  if (residentUnit.error) {
    return residentUnit;
  }

  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND (
              collection_deadline IS NULL
              OR collection_deadline >= NOW()
            )
        )::int AS pending_collection,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND collection_deadline IS NOT NULL
            AND collection_deadline < NOW()
        )::int AS overdue_parcels,
        COUNT(*) FILTER (
          WHERE status = 'COLLECTED'
        )::int AS collected_parcels
      FROM parcels
      WHERE unit_id = $1
        AND deleted_at IS NULL
    `,
    [residentUnit.unit.unit_id]
  );

  const row = result.rows[0] || {};

  return {
    summary: {
      pending_collection: numberValue(row.pending_collection),
      overdue_parcels: numberValue(row.overdue_parcels),
      collected_parcels: numberValue(row.collected_parcels)
    },
    unit: residentUnit.unit
  };
}

export async function listResidentParcels({ requester, filters = {} }) {
  const residentUnit = await getResidentUnit(requester);

  if (residentUnit.error) {
    return residentUnit;
  }

  const tab = normalizeSearch(filters.tab || "pending").toLowerCase();

  if (!VALID_TABS.includes(tab)) {
    return { error: "INVALID_TAB" };
  }

  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 10, 50);
  const offset = (page - 1) * limit;
  const search = normalizeSearch(filters.search);
  const params = [residentUnit.unit.unit_id];
  const whereClauses = ["p.unit_id = $1", "p.deleted_at IS NULL"];

  if (tab === "pending") {
    whereClauses.push("p.status IN ('PENDING', 'PENDING_COLLECTION')");
  } else {
    whereClauses.push("p.status = 'COLLECTED'");
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const searchIndex = params.length;
    whereClauses.push(`
      (
        LOWER(p.tracking_number) LIKE $${searchIndex}
        OR LOWER(c.courier_name) LIKE $${searchIndex}
        OR LOWER(COALESCE(c.courier_code, '')) LIKE $${searchIndex}
      )
    `);
  }

  params.push(limit, offset);
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;
  const orderBy =
    tab === "pending"
      ? `
        CASE
          WHEN p.status IN ('PENDING', 'PENDING_COLLECTION')
            AND p.collection_deadline IS NOT NULL
            AND p.collection_deadline < NOW()
            THEN 0
          ELSE 1
        END,
        p.collection_deadline ASC NULLS LAST,
        p.created_at DESC
      `
      : "COALESCE(p.collected_at, p.updated_at) DESC, p.created_at DESC";

  const result = await pool.query(
    `
      SELECT
        p.parcel_id,
        p.tracking_number,
        p.status,
        p.collection_deadline,
        p.collected_at,
        p.created_at,
        u.full_unit_code,
        c.courier_name,
        c.courier_code,
        c.badge_color AS courier_badge_color,
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
        COUNT(*) OVER() AS total_count
      FROM parcels p
      INNER JOIN units u ON u.unit_id = p.unit_id
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    params
  );

  const total = numberValue(result.rows[0]?.total_count);
  const totalPages = Math.ceil(total / limit);

  return {
    items: result.rows.map(toResidentParcelListItem),
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages
    }
  };
}

export async function getResidentParcelById({ requester, parcelId }) {
  if (!isUuid(parcelId)) {
    return { error: "INVALID_PARCEL_ID" };
  }

  const residentUnit = await getResidentUnit(requester);

  if (residentUnit.error) {
    return residentUnit;
  }

  const result = await pool.query(
    `
      SELECT
        p.parcel_id,
        p.tracking_number,
        p.delivery_person_contact,
        p.parcel_photo_url,
        p.status,
        p.collection_deadline,
        p.collected_at,
        p.created_at,
        u.full_unit_code,
        c.courier_name,
        c.courier_code,
        c.badge_color AS courier_badge_color,
        registered.first_name AS registered_first_name,
        registered.last_name AS registered_last_name,
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
        END AS display_status
      FROM parcels p
      INNER JOIN units u ON u.unit_id = p.unit_id
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      LEFT JOIN users registered ON registered.user_id = p.registered_by
      WHERE p.parcel_id = $1
        AND p.unit_id = $2
        AND p.deleted_at IS NULL
        AND p.status IN ('PENDING', 'PENDING_COLLECTION', 'COLLECTED')
      LIMIT 1
    `,
    [parcelId, residentUnit.unit.unit_id]
  );

  const parcel = result.rows[0];

  if (!parcel) {
    return { error: "PARCEL_NOT_FOUND" };
  }

  return {
    parcel: toResidentParcelDetail(parcel)
  };
}
