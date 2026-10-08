import { pool } from "../db/pool.js";

export const AUDIT_ACTIONS = Object.freeze({
  PARCEL_REGISTERED: "Parcel Registered",
  PARCEL_EDITED: "Parcel Edited",
  PARCEL_DELETED: "Parcel Deleted",
  PARCEL_COLLECTED: "Parcel Collected",
  DISPUTE_RAISED: "Dispute Raised",
  DISPUTE_EDITED: "Dispute Edited",
  DISPUTE_DELETED: "Dispute Deleted",
  GUARD_REVIEW_STARTED: "Guard Review Started",
  DISPUTE_ESCALATED: "Dispute Escalated",
  ADMIN_REVIEW_STARTED: "Admin Review Started",
  DISPUTE_RESOLVED: "Dispute Resolved",
  DISPUTE_MESSAGE_SENT: "Dispute Message Sent",
  ACCOUNT_CREATED: "Account Created",
  ACCOUNT_UPDATED: "Account Updated",
  ACCOUNT_ACTIVATED: "Account Activated",
  ACCOUNT_DEACTIVATED: "Account Deactivated",
  LOGIN: "Login",
  LOGOUT: "Logout",
  PASSWORD_CHANGED: "Password Changed",
  PASSWORD_RESET_COMPLETED: "Password Reset Completed",
  EMAIL_CHANGED: "Email Changed"
});

const ACTION_SET = new Set(Object.values(AUDIT_ACTIONS));
const FILTER_ROLES = new Set(["ADMIN", "GUARD", "RESIDENT", "SYSTEM"]);
const GUARD_OPERATIONAL_ACTIONS = Object.freeze([
  AUDIT_ACTIONS.PARCEL_REGISTERED,
  AUDIT_ACTIONS.PARCEL_EDITED,
  AUDIT_ACTIONS.PARCEL_DELETED,
  AUDIT_ACTIONS.PARCEL_COLLECTED,
  AUDIT_ACTIONS.DISPUTE_RAISED,
  AUDIT_ACTIONS.DISPUTE_EDITED,
  AUDIT_ACTIONS.DISPUTE_DELETED,
  AUDIT_ACTIONS.GUARD_REVIEW_STARTED,
  AUDIT_ACTIONS.DISPUTE_ESCALATED,
  AUDIT_ACTIONS.ADMIN_REVIEW_STARTED,
  AUDIT_ACTIONS.DISPUTE_RESOLVED,
  AUDIT_ACTIONS.DISPUTE_MESSAGE_SENT
]);
const OWN_AUTH_ACTIONS = Object.freeze([
  AUDIT_ACTIONS.LOGIN,
  AUDIT_ACTIONS.LOGOUT,
  AUDIT_ACTIONS.PASSWORD_CHANGED,
  AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
  AUDIT_ACTIONS.EMAIL_CHANGED
]);
const SENSITIVE_KEY_PATTERN = /(password|token|secret|hash|vapid|smtp|evidence|message)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function sanitizeValue(value, depth = 0) {
  if (depth > 3 || value === undefined) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
        .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return undefined;
}

function sanitizeMetadata(metadata) {
  const sanitized = sanitizeValue(metadata || {});
  return sanitized && !Array.isArray(sanitized) && typeof sanitized === "object" ? sanitized : {};
}

function normalizeActor(actor) {
  if (!actor) return { userId: null, role: "SYSTEM" };
  const role = normalizeText(actor.role, 20).toUpperCase();
  if (role === "SUPER_ADMIN") return null;
  if (!FILTER_ROLES.has(role) || !UUID_PATTERN.test(actor.user_id || "")) return null;
  return { userId: actor.user_id, role };
}

export async function recordAuditLog({
  client = pool,
  actor = null,
  action,
  entityType,
  entityId = null,
  entityReference = null,
  description,
  metadata = {}
}) {
  const normalizedActor = normalizeActor(actor);
  if (!normalizedActor) return { skipped: true };

  const normalizedAction = normalizeText(action, 80);
  const normalizedEntityType = normalizeText(entityType, 40).toUpperCase();
  const normalizedDescription = normalizeText(description, 2000);
  if (!ACTION_SET.has(normalizedAction)) throw new Error(`Unsupported audit action: ${normalizedAction}`);
  if (!normalizedEntityType || !normalizedDescription) throw new Error("Audit entity type and description are required.");
  if (entityId && !UUID_PATTERN.test(entityId)) throw new Error("Audit entity ID must be a UUID.");

  const result = await client.query(
    `
      INSERT INTO audit_logs (
        actor_user_id, actor_role, action, entity_type, entity_id,
        entity_reference, description, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING audit_log_id, created_at
    `,
    [
      normalizedActor.userId,
      normalizedActor.role,
      normalizedAction,
      normalizedEntityType,
      entityId,
      normalizeText(entityReference, 255) || null,
      normalizedDescription,
      JSON.stringify(sanitizeMetadata(metadata))
    ]
  );
  return { auditLog: result.rows[0] };
}

export async function recordAuditLogSafely(input) {
  try {
    return await recordAuditLog(input);
  } catch (error) {
    console.error("Audit log write failed:", error.message);
    return { error: "AUDIT_WRITE_FAILED" };
  }
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function normalizeActions(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const actions = raw.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
  return [...new Set(actions)];
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function buildAuditQuery({ requester, filters = {}, forExport = false }) {
  if (!requester || !["ADMIN", "GUARD"].includes(requester.role)) return { error: "FORBIDDEN" };

  const where = [];
  const params = [];
  const add = (value) => { params.push(value); return `$${params.length}`; };

  if (requester.role === "GUARD") {
    const operationalParam = add(GUARD_OPERATIONAL_ACTIONS);
    const authParam = add(OWN_AUTH_ACTIONS);
    const userParam = add(requester.user_id);
    where.push(`(al.action = ANY(${operationalParam}::text[]) OR (al.action = ANY(${authParam}::text[]) AND al.actor_user_id = ${userParam}::uuid))`);
  }

  const search = normalizeText(filters.search, 120);
  if (search) {
    const pattern = add(`%${search}%`);
    where.push(`(
      al.description ILIKE ${pattern}
      OR COALESCE(al.entity_reference, '') ILIKE ${pattern}
      OR COALESCE(actor.first_name, '') ILIKE ${pattern}
      OR COALESCE(actor.last_name, '') ILIKE ${pattern}
      OR COALESCE(actor.email, '') ILIKE ${pattern}
      OR COALESCE(al.metadata->>'tracking_number', '') ILIKE ${pattern}
      OR COALESCE(al.metadata->>'dispute_reference', '') ILIKE ${pattern}
      OR COALESCE(al.metadata->>'unit', '') ILIKE ${pattern}
      OR COALESCE(al.metadata->>'courier', '') ILIKE ${pattern}
    )`);
  }

  const date = normalizeText(filters.date, 10);
  if (date) {
    if (!isValidIsoDate(date)) return { error: "INVALID_DATE" };
    where.push(`(al.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = ${add(date)}::date`);
  }

  const actions = normalizeActions(filters.action ?? filters.actions);
  if (actions.some((action) => !ACTION_SET.has(action))) return { error: "INVALID_ACTION" };
  if (actions.length > 0) where.push(`al.action = ANY(${add(actions)}::text[])`);

  const role = normalizeText(filters.role, 20).toUpperCase().replaceAll(" ", "_");
  if (role && !["ALL", "ALL_ROLES"].includes(role)) {
    if (!FILTER_ROLES.has(role)) return { error: "INVALID_ROLE" };
    where.push(`al.actor_role = ${add(role)}`);
  }

  const page = positiveInteger(filters.page, 1, 100000);
  const limit = positiveInteger(filters.limit, 20, forExport ? 10000 : 100);
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params, page, limit };
}

const AUDIT_SELECT = `
  al.audit_log_id,
  al.actor_user_id,
  al.actor_role,
  al.action,
  al.entity_type,
  al.entity_id,
  al.entity_reference,
  al.description,
  al.metadata,
  al.created_at,
  actor.first_name AS actor_first_name,
  actor.last_name AS actor_last_name,
  actor.email AS actor_email
`;

function toAuditLog(row) {
  const name = [row.actor_first_name, row.actor_last_name].filter(Boolean).join(" ");
  return {
    audit_log_id: row.audit_log_id,
    actor: row.actor_role === "SYSTEM" ? { user_id: null, name: "System", email: null, role: "SYSTEM" } : {
      user_id: row.actor_user_id,
      name: name || row.actor_email,
      email: row.actor_email,
      role: row.actor_role
    },
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_reference: row.entity_reference,
    description: row.description,
    metadata: row.metadata,
    created_at: row.created_at
  };
}

export async function listAuditLogs({ requester, filters = {} }) {
  const query = buildAuditQuery({ requester, filters });
  if (query.error) return query;
  const offset = (query.page - 1) * query.limit;
  const result = await pool.query(
    `
      SELECT ${AUDIT_SELECT}, COUNT(*) OVER()::integer AS total_count
      FROM audit_logs al
      LEFT JOIN users actor ON actor.user_id = al.actor_user_id
      ${query.whereSql}
      ORDER BY al.created_at DESC, al.audit_log_id DESC
      LIMIT $${query.params.length + 1} OFFSET $${query.params.length + 2}
    `,
    [...query.params, query.limit, offset]
  );
  const total = Number(result.rows[0]?.total_count || 0);
  const visibleActions = requester.role === "GUARD"
    ? [...GUARD_OPERATIONAL_ACTIONS, ...OWN_AUTH_ACTIONS]
    : Object.values(AUDIT_ACTIONS);
  return {
    audit_logs: result.rows.map(toAuditLog),
    pagination: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    filter_options: { actions: visibleActions, roles: ["ADMIN", "GUARD", "RESIDENT", "SYSTEM"] }
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportAuditLogsCsv({ requester, filters = {} }) {
  if (requester?.role !== "ADMIN") return { error: "EXPORT_FORBIDDEN" };
  const query = buildAuditQuery({ requester, filters: { ...filters, limit: 10000 }, forExport: true });
  if (query.error) return query;
  const result = await pool.query(
    `
      SELECT ${AUDIT_SELECT}
      FROM audit_logs al
      LEFT JOIN users actor ON actor.user_id = al.actor_user_id
      ${query.whereSql}
      ORDER BY al.created_at DESC, al.audit_log_id DESC
      LIMIT 10000
    `,
    query.params
  );
  const rows = result.rows.map(toAuditLog);
  const header = ["Timestamp", "Actor", "Role", "Action", "Entity Type", "Entity Reference", "Description"];
  const lines = rows.map((row) => [
    new Date(row.created_at).toISOString(), row.actor.name, row.actor.role, row.action,
    row.entity_type, row.entity_reference, row.description
  ].map(csvCell).join(","));
  return { csv: [header.map(csvCell).join(","), ...lines].join("\n"), count: rows.length };
}
