import { pool } from "../db/pool.js";
import { emitToUser } from "../realtime/socket.js";
import {
  deliverPersistedNotification,
  persistNotification
} from "./notification.service.js";

export const DISPUTE_ISSUE_TYPES = Object.freeze([
  "MISSING_ITEM",
  "STOLEN",
  "DAMAGED",
  "WRONG_RECIPIENT"
]);

export const DISPUTE_STATUSES = Object.freeze([
  "OPEN",
  "IN_REVIEW_GUARD",
  "ESCALATED",
  "IN_REVIEW_ADMIN",
  "RESOLVED"
]);

const ISSUE_TYPE_SET = new Set(DISPUTE_ISSUE_TYPES);
const STATUS_SET = new Set(DISPUTE_STATUSES);
const COMMUNITY_ALERT_TYPES = new Set([
  "MISSING_ITEM",
  "STOLEN",
  "WRONG_RECIPIENT"
]);
const STAFF_ROLES = new Set(["GUARD", "ADMIN"]);
const MAX_DISPUTE_MESSAGE_LENGTH = 2000;
const ALLOWED_TRANSITIONS = Object.freeze({
  GUARD: Object.freeze({
    OPEN: Object.freeze(["IN_REVIEW_GUARD"]),
    IN_REVIEW_GUARD: Object.freeze(["RESOLVED", "ESCALATED"])
  }),
  ADMIN: Object.freeze({
    OPEN: Object.freeze(["IN_REVIEW_ADMIN", "RESOLVED"]),
    ESCALATED: Object.freeze(["IN_REVIEW_ADMIN", "RESOLVED"]),
    IN_REVIEW_ADMIN: Object.freeze(["RESOLVED"])
  })
});

const DISPUTE_SELECT = `
  d.dispute_id,
  d.dispute_reference,
  d.parcel_id,
  d.resident_user_id,
  d.issue_type,
  d.description,
  d.status,
  d.assigned_staff_user_id,
  d.guard_response,
  d.admin_resolution_notes,
  d.resolved_at,
  d.resolved_by_user_id,
  d.deleted_at,
  d.created_at,
  d.updated_at,
  GREATEST(
    d.updated_at,
    COALESCE(
      (SELECT MAX(dm.created_at) FROM dispute_messages dm WHERE dm.dispute_id = d.dispute_id),
      d.updated_at
    )
  ) AS latest_activity_at,
  (SELECT COUNT(*)::integer FROM dispute_evidence de WHERE de.dispute_id = d.dispute_id) AS evidence_count,
  p.tracking_number,
  p.status AS parcel_status,
  p.collection_deadline,
  p.collected_at AS parcel_collected_at,
  p.created_at AS parcel_created_at,
  c.courier_name,
  c.courier_code,
  u.unit_id,
  u.full_unit_code,
  resident.first_name AS resident_first_name,
  resident.last_name AS resident_last_name,
  assigned.first_name AS assigned_first_name,
  assigned.last_name AS assigned_last_name,
  assigned.role AS assigned_role,
  resolver.first_name AS resolver_first_name,
  resolver.last_name AS resolver_last_name,
  resolver.role AS resolver_role
`;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || ""
  );
}

function normalizeText(value, maximum = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeEnum(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function toPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function displayName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

function normalizeParcelStatus(status) {
  return status === "PENDING" ? "PENDING_COLLECTION" : status;
}

function toSafeDispute(row, { includePrivateStaffFields = false } = {}) {
  const dispute = {
    dispute_id: row.dispute_id,
    dispute_reference: row.dispute_reference,
    issue_type: row.issue_type,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest_activity_at: row.latest_activity_at || row.updated_at,
    evidence_count: Number(row.evidence_count || 0),
    resolved_at: row.resolved_at,
    parcel: {
      parcel_id: row.parcel_id,
      tracking_number: row.tracking_number,
      status: normalizeParcelStatus(row.parcel_status),
      courier_name: row.courier_name,
      courier_code: row.courier_code,
      unit_full_code: row.full_unit_code,
      collection_deadline: row.collection_deadline,
      collected_at: row.parcel_collected_at,
      created_at: row.parcel_created_at
    },
    assigned_handler: row.assigned_staff_user_id
      ? {
          user_id: row.assigned_staff_user_id,
          name: displayName(row.assigned_first_name, row.assigned_last_name),
          role: row.assigned_role
        }
      : null,
    guard_response: row.guard_response,
    admin_resolution_notes: row.admin_resolution_notes,
    resolved_by: row.resolved_by_user_id
      ? {
          user_id: row.resolved_by_user_id,
          name: displayName(row.resolver_first_name, row.resolver_last_name),
          role: row.resolver_role
        }
      : null
  };

  if (includePrivateStaffFields) {
    dispute.resident = {
      user_id: row.resident_user_id,
      name: displayName(row.resident_first_name, row.resident_last_name),
      unit_full_code: row.full_unit_code
    };
  }

  return dispute;
}

function canAccessDispute(requester, row) {
  if (requester?.role === "RESIDENT") {
    return row.resident_user_id === requester.user_id;
  }

  return STAFF_ROLES.has(requester?.role);
}

async function getDisputeRow(disputeId, client = pool, { lock = false } = {}) {
  const result = await client.query(
    `
      SELECT ${DISPUTE_SELECT}
      FROM disputes d
      INNER JOIN parcels p ON p.parcel_id = d.parcel_id
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      INNER JOIN units u ON u.unit_id = p.unit_id
      INNER JOIN users resident ON resident.user_id = d.resident_user_id
      LEFT JOIN users assigned ON assigned.user_id = d.assigned_staff_user_id
      LEFT JOIN users resolver ON resolver.user_id = d.resolved_by_user_id
      WHERE d.dispute_id = $1
        AND d.deleted_at IS NULL
      ${lock ? "FOR UPDATE OF d" : ""}
    `,
    [disputeId]
  );

  return result.rows[0] || null;
}

async function persistRecipientNotifications({
  client,
  recipientIds,
  dispute,
  title,
  message,
  eventKey
}) {
  const envelopes = [];

  for (const recipientUserId of recipientIds) {
    const envelope = await persistNotification({
      client,
      recipientUserId,
      type: "DISPUTE_UPDATED",
      title,
      message,
      relatedParcelId: dispute.parcel_id,
      relatedDisputeId: dispute.dispute_id,
      deduplicationKey: `dispute:${dispute.dispute_id}:${eventKey}:${recipientUserId}`,
      emailSubject: `${title} - ${dispute.dispute_reference}`
    });

    if (envelope) {
      envelopes.push(envelope);
    }
  }

  return envelopes;
}

function maskTrackingNumber(trackingNumber) {
  const normalized = normalizeText(trackingNumber, 100);

  if (normalized.length <= 4) {
    return "****";
  }

  if (normalized.length <= 7) {
    return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

async function persistCommunityAlerts({ client, dispute }) {
  if (!COMMUNITY_ALERT_TYPES.has(dispute.issue_type)) {
    return [];
  }

  const residentsResult = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE role = 'RESIDENT'
        AND status = 'ACTIVE'
        AND user_id <> $1
      ORDER BY user_id
    `,
    [dispute.resident_user_id]
  );
  const title = dispute.issue_type === "WRONG_RECIPIENT"
    ? "Wrong parcel collection alert"
    : "Missing parcel alert";
  const message = [
    "A parcel has been reported missing.",
    `Courier: ${dispute.courier_name}.`,
    `Tracking: ${maskTrackingNumber(dispute.tracking_number)}.`,
    "Please check whether you may have collected it by mistake and contact management if needed."
  ].join(" ");
  const envelopes = [];

  for (const resident of residentsResult.rows) {
    const envelope = await persistNotification({
      client,
      recipientUserId: resident.user_id,
      type: "PARCEL_COMMUNITY_ALERT",
      title,
      message,
      deduplicationKey: `community-alert:${dispute.dispute_id}:${resident.user_id}`
    });

    if (envelope) {
      envelopes.push(envelope);
    }
  }

  return envelopes;
}

async function deliverNotifications(envelopes) {
  await Promise.all(envelopes.map((envelope) => deliverPersistedNotification(envelope)));
}

async function emitDisputeChanged(disputeId, action) {
  try {
    const recipients = await pool.query(
      `
        SELECT user_id
        FROM users
        WHERE role IN ('GUARD', 'ADMIN')
          AND status = 'ACTIVE'
        ORDER BY user_id
      `
    );
    const payload = {
      dispute_id: disputeId,
      action,
      occurred_at: new Date().toISOString()
    };

    recipients.rows.forEach((recipient) => {
      emitToUser(recipient.user_id, "dispute:changed", payload);
    });
  } catch (error) {
    console.error(`Unable to emit dispute realtime update for ${disputeId}.`);
  }
}

export async function listEligibleDisputeParcels({ requester, filters = {} }) {
  if (requester?.role !== "RESIDENT" || !requester.unit_id) {
    return { error: "FORBIDDEN" };
  }

  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 20, 100);
  const search = normalizeText(filters.search, 120);
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `
      SELECT
        p.parcel_id,
        p.tracking_number,
        p.status,
        p.collection_deadline,
        p.collected_at,
        p.created_at,
        c.courier_name,
        c.courier_code,
        u.full_unit_code,
        COUNT(*) OVER() AS total_count
      FROM parcels p
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      INNER JOIN units u ON u.unit_id = p.unit_id
      WHERE p.unit_id = $1
        AND p.deleted_at IS NULL
        AND p.status IN ('PENDING_COLLECTION', 'COLLECTED')
        AND (
          $2 = ''
          OR p.tracking_number ILIKE '%' || $2 || '%'
          OR c.courier_name ILIKE '%' || $2 || '%'
          OR c.courier_code ILIKE '%' || $2 || '%'
        )
      ORDER BY p.created_at DESC, p.parcel_id DESC
      LIMIT $3 OFFSET $4
    `,
    [requester.unit_id, search, limit, offset]
  );
  const total = Number(result.rows[0]?.total_count || 0);

  return {
    parcels: result.rows.map((row) => ({
      parcel_id: row.parcel_id,
      tracking_number: row.tracking_number,
      courier_name: row.courier_name,
      courier_code: row.courier_code,
      unit_full_code: row.full_unit_code,
      status: normalizeParcelStatus(row.status),
      is_overdue: normalizeParcelStatus(row.status) === "PENDING_COLLECTION"
        && row.collection_deadline
        && new Date(row.collection_deadline).getTime() < Date.now(),
      collection_deadline: row.collection_deadline,
      collected_at: row.collected_at,
      created_at: row.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

export async function createDispute({ requester, input, files = [] }) {
  if (requester?.role !== "RESIDENT" || !requester.unit_id) {
    return { error: "FORBIDDEN" };
  }

  const parcelId = normalizeText(input?.parcel_id, 100);
  const issueType = normalizeEnum(input?.issue_type);
  const description = normalizeText(input?.description, 4001);

  if (!isUuid(parcelId)) return { error: "INVALID_PARCEL_ID" };
  if (!ISSUE_TYPE_SET.has(issueType)) return { error: "INVALID_ISSUE_TYPE" };
  if (description.length < 10 || description.length > 4000) {
    return { error: "INVALID_DESCRIPTION" };
  }
  if (!Array.isArray(files) || files.length > 3) return { error: "EVIDENCE_LIMIT" };

  const client = await pool.connect();
  let transactionOpen = false;
  let envelopes = [];

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const parcelResult = await client.query(
      `
        SELECT
          p.parcel_id,
          p.tracking_number,
          p.unit_id,
          p.status,
          c.courier_name
        FROM parcels p
        INNER JOIN courier_companies c ON c.courier_id = p.courier_id
        WHERE p.parcel_id = $1
          AND p.unit_id = $2
          AND p.deleted_at IS NULL
          AND p.status IN ('PENDING_COLLECTION', 'COLLECTED')
        FOR UPDATE OF p
      `,
      [parcelId, requester.unit_id]
    );
    const parcel = parcelResult.rows[0];

    if (!parcel) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "PARCEL_NOT_FOUND" };
    }

    const insertResult = await client.query(
      `
        INSERT INTO disputes (parcel_id, resident_user_id, issue_type, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [parcel.parcel_id, requester.user_id, issueType, description]
    );
    const dispute = {
      ...insertResult.rows[0],
      tracking_number: parcel.tracking_number,
      courier_name: parcel.courier_name
    };

    for (const file of files) {
      await client.query(
        `
          INSERT INTO dispute_evidence (
            dispute_id,
            stored_filename,
            original_filename,
            mime_type,
            file_size
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [dispute.dispute_id, file.filename, file.originalname, file.mimetype, file.size]
      );
    }

    await client.query(
      `
        INSERT INTO dispute_status_history (
          dispute_id,
          previous_status,
          new_status,
          actor_user_id,
          note
        )
        VALUES ($1, NULL, 'OPEN', $2, 'Resident submitted dispute.')
      `,
      [dispute.dispute_id, requester.user_id]
    );

    const guardsResult = await client.query(
      `
        SELECT user_id
        FROM users
        WHERE role = 'GUARD'
          AND status = 'ACTIVE'
        ORDER BY user_id
      `
    );
    envelopes = await persistRecipientNotifications({
      client,
      recipientIds: guardsResult.rows.map((row) => row.user_id),
      dispute,
      title: "New dispute raised",
      message: `Dispute ${dispute.dispute_reference} requires Guard review.`,
      eventKey: "opened"
    });
    envelopes.push(...await persistCommunityAlerts({ client, dispute }));

    await client.query("COMMIT");
    transactionOpen = false;
    await deliverNotifications(envelopes);
    await emitDisputeChanged(dispute.dispute_id, "CREATED");

    const created = await getDisputeRow(dispute.dispute_id);
    return {
      message: "Dispute submitted successfully.",
      dispute: toSafeDispute(created),
      evidence_count: files.length
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDisputes({ requester, filters = {} }) {
  if (!requester?.user_id || !["RESIDENT", "GUARD", "ADMIN"].includes(requester.role)) {
    return { error: "FORBIDDEN" };
  }

  const status = normalizeEnum(filters.status);
  const issueType = normalizeEnum(filters.issue_type);
  const search = normalizeText(filters.search, 120);
  const assignment = normalizeEnum(filters.assignment);
  const sort = normalizeEnum(filters.sort) || "LATEST_ACTIVITY";
  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 20, 100);
  const offset = (page - 1) * limit;

  if (status && !STATUS_SET.has(status)) return { error: "INVALID_STATUS" };
  if (issueType && !ISSUE_TYPE_SET.has(issueType)) return { error: "INVALID_ISSUE_TYPE" };
  if (assignment && !["MINE", "UNASSIGNED"].includes(assignment)) {
    return { error: "INVALID_ASSIGNMENT_FILTER" };
  }
  if (!["NEWEST", "OLDEST", "LATEST_ACTIVITY"].includes(sort)) {
    return { error: "INVALID_SORT" };
  }

  const params = [];
  const where = ["d.deleted_at IS NULL"];
  if (requester.role === "RESIDENT") {
    params.push(requester.user_id);
    where.push(`d.resident_user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`d.status = $${params.length}`);
  }
  if (issueType) {
    params.push(issueType);
    where.push(`d.issue_type = $${params.length}`);
  }
  if (search) {
    params.push(search);
    const index = params.length;
    where.push(`(
      d.dispute_reference ILIKE '%' || $${index} || '%'
      OR p.tracking_number ILIKE '%' || $${index} || '%'
      OR c.courier_name ILIKE '%' || $${index} || '%'
      OR c.courier_code ILIKE '%' || $${index} || '%'
      OR u.full_unit_code ILIKE '%' || $${index} || '%'
    )`);
  }
  if (assignment === "MINE") {
    if (!STAFF_ROLES.has(requester.role)) return { error: "FORBIDDEN" };
    params.push(requester.user_id);
    where.push(`d.assigned_staff_user_id = $${params.length}`);
  } else if (assignment === "UNASSIGNED") {
    if (!STAFF_ROLES.has(requester.role)) return { error: "FORBIDDEN" };
    where.push("d.assigned_staff_user_id IS NULL");
  }
  const orderBy = {
    NEWEST: "d.created_at DESC, d.dispute_id DESC",
    OLDEST: "d.created_at ASC, d.dispute_id ASC",
    LATEST_ACTIVITY: "latest_activity_at DESC, d.dispute_id DESC"
  }[sort];
  params.push(limit, offset);
  const limitIndex = params.length - 1;
  const offsetIndex = params.length;
  const result = await pool.query(
    `
      SELECT ${DISPUTE_SELECT}, COUNT(*) OVER() AS total_count
      FROM disputes d
      INNER JOIN parcels p ON p.parcel_id = d.parcel_id
      INNER JOIN courier_companies c ON c.courier_id = p.courier_id
      INNER JOIN units u ON u.unit_id = p.unit_id
      INNER JOIN users resident ON resident.user_id = d.resident_user_id
      LEFT JOIN users assigned ON assigned.user_id = d.assigned_staff_user_id
      LEFT JOIN users resolver ON resolver.user_id = d.resolved_by_user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${orderBy}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `,
    params
  );
  const total = Number(result.rows[0]?.total_count || 0);

  return {
    disputes: result.rows.map((row) => toSafeDispute(row, {
      includePrivateStaffFields: STAFF_ROLES.has(requester.role)
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

export async function getDispute({ requester, disputeId }) {
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const row = await getDisputeRow(disputeId);

  if (!row || !canAccessDispute(requester, row)) return { error: "DISPUTE_NOT_FOUND" };
  const evidenceResult = await pool.query(
    `
      SELECT evidence_id, original_filename, mime_type, file_size, uploaded_at
      FROM dispute_evidence
      WHERE dispute_id = $1
      ORDER BY uploaded_at ASC, evidence_id ASC
    `,
    [disputeId]
  );

  return {
    dispute: {
      ...toSafeDispute(row, { includePrivateStaffFields: STAFF_ROLES.has(requester.role) }),
      evidence: evidenceResult.rows.map((evidence) => ({
        ...evidence,
        url: `/api/disputes/${disputeId}/evidence/${evidence.evidence_id}`
      }))
    }
  };
}

export async function getDisputeHistory({ requester, disputeId }) {
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const row = await getDisputeRow(disputeId);

  if (!row || !canAccessDispute(requester, row)) return { error: "DISPUTE_NOT_FOUND" };
  const result = await pool.query(
    `
      SELECT
        history.history_id,
        history.previous_status,
        history.new_status,
        history.note,
        history.created_at,
        actor.user_id AS actor_user_id,
        actor.first_name,
        actor.last_name,
        actor.role AS actor_role
      FROM dispute_status_history history
      LEFT JOIN users actor ON actor.user_id = history.actor_user_id
      WHERE history.dispute_id = $1
      ORDER BY history.created_at ASC, history.history_id ASC
    `,
    [disputeId]
  );

  return {
    history: result.rows.map((event) => ({
      history_id: event.history_id,
      previous_status: event.previous_status,
      new_status: event.new_status,
      note: event.note,
      created_at: event.created_at,
      actor: event.actor_user_id
        ? {
            user_id: event.actor_user_id,
            name: displayName(event.first_name, event.last_name),
            role: event.actor_role
          }
        : null
    }))
  };
}

export async function getDisputeEvidenceFile({ requester, disputeId, evidenceId }) {
  if (!isUuid(disputeId) || !isUuid(evidenceId)) return { error: "INVALID_EVIDENCE_ID" };
  const row = await getDisputeRow(disputeId);

  if (!row || !canAccessDispute(requester, row)) return { error: "EVIDENCE_NOT_FOUND" };
  const result = await pool.query(
    `
      SELECT stored_filename, original_filename, mime_type
      FROM dispute_evidence
      WHERE evidence_id = $1
        AND dispute_id = $2
      LIMIT 1
    `,
    [evidenceId, disputeId]
  );

  return result.rows[0]
    ? { evidence: result.rows[0] }
    : { error: "EVIDENCE_NOT_FOUND" };
}

function normalizeEvidenceIds(value) {
  if (value === undefined) return null;

  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (!Array.isArray(parsed) || parsed.some((item) => !isUuid(item))) {
    return undefined;
  }

  return [...new Set(parsed)];
}

export async function updateResidentDispute({ requester, disputeId, input, files = [] }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };

  const issueType = normalizeEnum(input?.issue_type);
  const description = normalizeText(input?.description, 4001);
  const keptEvidenceIds = normalizeEvidenceIds(input?.kept_evidence_ids);

  if (!ISSUE_TYPE_SET.has(issueType)) return { error: "INVALID_ISSUE_TYPE" };
  if (description.length < 10 || description.length > 4000) {
    return { error: "INVALID_DESCRIPTION" };
  }
  if (keptEvidenceIds === undefined) return { error: "INVALID_EVIDENCE_SELECTION" };
  if (!Array.isArray(files) || files.length > 3) return { error: "EVIDENCE_LIMIT" };

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const current = await getDisputeRow(disputeId, client, { lock: true });

    if (!current || current.resident_user_id !== requester.user_id) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "DISPUTE_NOT_FOUND" };
    }
    if (current.status !== "OPEN") {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "DISPUTE_NOT_OPEN" };
    }

    const evidenceResult = await client.query(
      `
        SELECT evidence_id, stored_filename
        FROM dispute_evidence
        WHERE dispute_id = $1
        ORDER BY uploaded_at ASC, evidence_id ASC
        FOR UPDATE
      `,
      [disputeId]
    );
    const existingIds = new Set(evidenceResult.rows.map((item) => item.evidence_id));
    const idsToKeep = keptEvidenceIds === null ? [...existingIds] : keptEvidenceIds;

    if (idsToKeep.some((evidenceId) => !existingIds.has(evidenceId))) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "INVALID_EVIDENCE_SELECTION" };
    }
    if (idsToKeep.length + files.length > 3) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "EVIDENCE_LIMIT" };
    }

    const removedEvidence = evidenceResult.rows.filter(
      (item) => !idsToKeep.includes(item.evidence_id)
    );

    if (removedEvidence.length > 0) {
      await client.query(
        `DELETE FROM dispute_evidence WHERE dispute_id = $1 AND evidence_id = ANY($2::uuid[])`,
        [disputeId, removedEvidence.map((item) => item.evidence_id)]
      );
    }

    for (const file of files) {
      await client.query(
        `
          INSERT INTO dispute_evidence (
            dispute_id,
            stored_filename,
            original_filename,
            mime_type,
            file_size
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [disputeId, file.filename, file.originalname, file.mimetype, file.size]
      );
    }

    await client.query(
      `UPDATE disputes SET issue_type = $1, description = $2 WHERE dispute_id = $3`,
      [issueType, description, disputeId]
    );
    await client.query(
      `
        INSERT INTO dispute_status_history (
          dispute_id,
          previous_status,
          new_status,
          actor_user_id,
          note
        )
        VALUES ($1, 'OPEN', 'OPEN', $2, 'Resident updated dispute details.')
      `,
      [disputeId, requester.user_id]
    );

    await client.query("COMMIT");
    transactionOpen = false;
    const updated = await getDispute({ requester, disputeId });

    return {
      message: "Dispute updated successfully.",
      dispute: updated.dispute,
      removed_evidence_filenames: removedEvidence.map((item) => item.stored_filename)
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteResidentDispute({ requester, disputeId }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };

  const result = await pool.query(
    `
      UPDATE disputes
      SET deleted_at = NOW()
      WHERE dispute_id = $1
        AND resident_user_id = $2
        AND status = 'OPEN'
        AND deleted_at IS NULL
      RETURNING dispute_id
    `,
    [disputeId, requester.user_id]
  );

  if (result.rows[0]) {
    return { message: "Dispute deleted successfully." };
  }

  const existing = await pool.query(
    `SELECT status FROM disputes WHERE dispute_id = $1 AND resident_user_id = $2 AND deleted_at IS NULL`,
    [disputeId, requester.user_id]
  );
  return existing.rows[0] ? { error: "DISPUTE_NOT_OPEN" } : { error: "DISPUTE_NOT_FOUND" };
}

function toSafeDisputeMessage(row) {
  return {
    message_id: row.message_id,
    message: row.message,
    created_at: row.created_at,
    sender: {
      user_id: row.sender_user_id,
      name: displayName(row.first_name, row.last_name),
      role: row.sender_role
    }
  };
}

export async function listDisputeMessages({ requester, disputeId, filters = {} }) {
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const dispute = await getDisputeRow(disputeId);
  if (!dispute || !canAccessDispute(requester, dispute)) return { error: "DISPUTE_NOT_FOUND" };

  const page = toPositiveInteger(filters.page, 1, 100000);
  const limit = toPositiveInteger(filters.limit, 50, 100);
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `
      SELECT
        dm.message_id,
        dm.message,
        dm.created_at,
        sender.user_id AS sender_user_id,
        sender.first_name,
        sender.last_name,
        sender.role AS sender_role,
        COUNT(*) OVER() AS total_count
      FROM dispute_messages dm
      INNER JOIN users sender ON sender.user_id = dm.sender_user_id
      WHERE dm.dispute_id = $1
      ORDER BY dm.created_at ASC, dm.message_id ASC
      LIMIT $2 OFFSET $3
    `,
    [disputeId, limit, offset]
  );
  const total = Number(result.rows[0]?.total_count || 0);

  return {
    messages: result.rows.map(toSafeDisputeMessage),
    conversation: { read_only: dispute.status === "RESOLVED" },
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  };
}

export async function createDisputeMessage({ requester, disputeId, message }) {
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const normalizedMessage = normalizeText(message, MAX_DISPUTE_MESSAGE_LENGTH + 1);
  if (!normalizedMessage || normalizedMessage.length > MAX_DISPUTE_MESSAGE_LENGTH) {
    return { error: "INVALID_MESSAGE" };
  }

  const client = await pool.connect();
  let transactionOpen = false;
  let envelopes = [];

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const dispute = await getDisputeRow(disputeId, client, { lock: true });

    if (!dispute || !canAccessDispute(requester, dispute)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "DISPUTE_NOT_FOUND" };
    }
    if (dispute.status === "RESOLVED") {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "CONVERSATION_READ_ONLY" };
    }

    const insertResult = await client.query(
      `
        INSERT INTO dispute_messages (dispute_id, sender_user_id, message)
        VALUES ($1, $2, $3)
        RETURNING message_id, message, created_at, sender_user_id
      `,
      [disputeId, requester.user_id, normalizedMessage]
    );
    const inserted = insertResult.rows[0];
    const senderResult = await client.query(
      `SELECT first_name, last_name, role FROM users WHERE user_id = $1`,
      [requester.user_id]
    );
    const recipientId = requester.role === "RESIDENT"
      ? dispute.assigned_staff_user_id
      : dispute.resident_user_id;

    if (recipientId) {
      envelopes = await persistRecipientNotifications({
        client,
        recipientIds: [recipientId],
        dispute,
        title: "New dispute message",
        message: `A new message was posted in dispute ${dispute.dispute_reference}.`,
        eventKey: `message-${inserted.message_id}`
      });
    }

    await client.query("COMMIT");
    transactionOpen = false;
    await deliverNotifications(envelopes);
    await emitDisputeChanged(disputeId, "MESSAGE_CREATED");

    return {
      message: "Message sent successfully.",
      dispute_message: toSafeDisputeMessage({
        ...inserted,
        ...senderResult.rows[0],
        sender_role: senderResult.rows[0]?.role
      })
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function isDisputeTransitionAllowed(role, currentStatus, targetStatus) {
  return ALLOWED_TRANSITIONS[role]?.[currentStatus]?.includes(targetStatus) === true;
}

function transitionMessage(targetStatus) {
  const messages = {
    IN_REVIEW_GUARD: "Your dispute is now being reviewed by the Guard.",
    ESCALATED: "Your dispute has been escalated for Admin review.",
    IN_REVIEW_ADMIN: "Your dispute is now being reviewed by an Admin.",
    RESOLVED: "Your dispute has been resolved."
  };
  return messages[targetStatus];
}

function historyNote(targetStatus) {
  const notes = {
    IN_REVIEW_GUARD: "Guard started review.",
    ESCALATED: "Guard escalated dispute to Admin.",
    IN_REVIEW_ADMIN: "Admin started review.",
    RESOLVED: "Dispute resolved."
  };
  return notes[targetStatus];
}

export async function transitionDispute({ requester, disputeId, input }) {
  if (!STAFF_ROLES.has(requester?.role)) return { error: "FORBIDDEN" };
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const targetStatus = normalizeEnum(input?.status);
  if (!STATUS_SET.has(targetStatus)) return { error: "INVALID_STATUS" };

  const guardResponse = Object.hasOwn(input || {}, "guard_response")
    ? normalizeText(input.guard_response, 4000)
    : null;
  const adminNotes = Object.hasOwn(input || {}, "admin_resolution_notes")
    ? normalizeText(input.admin_resolution_notes, 4000)
    : null;
  if (requester.role === "GUARD" && adminNotes !== null) return { error: "ADMIN_NOTES_FORBIDDEN" };
  if (requester.role === "ADMIN" && guardResponse !== null) return { error: "GUARD_RESPONSE_FORBIDDEN" };

  const client = await pool.connect();
  let transactionOpen = false;
  let envelopes = [];

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const current = await getDisputeRow(disputeId, client, { lock: true });
    if (!current) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "DISPUTE_NOT_FOUND" };
    }
    if (!isDisputeTransitionAllowed(requester.role, current.status, targetStatus)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "INVALID_TRANSITION" };
    }
    if (
      (current.status === "IN_REVIEW_GUARD" || current.status === "IN_REVIEW_ADMIN")
      && current.assigned_staff_user_id !== requester.user_id
    ) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { error: "NOT_ASSIGNED_HANDLER" };
    }

    const assignedStaffUserId = ["IN_REVIEW_GUARD", "IN_REVIEW_ADMIN", "RESOLVED"].includes(targetStatus)
      ? requester.user_id
      : current.assigned_staff_user_id;
    const isResolved = targetStatus === "RESOLVED";
    await client.query(
      `
        UPDATE disputes
        SET
          status = $1,
          assigned_staff_user_id = $2,
          guard_response = CASE
            WHEN $3::text IS NULL THEN guard_response
            ELSE NULLIF($3, '')
          END,
          admin_resolution_notes = CASE
            WHEN $4::text IS NULL THEN admin_resolution_notes
            ELSE NULLIF($4, '')
          END,
          resolved_at = CASE WHEN $5 THEN NOW() ELSE NULL END,
          resolved_by_user_id = CASE WHEN $5 THEN $6::uuid ELSE NULL::uuid END
        WHERE dispute_id = $7
      `,
      [
        targetStatus,
        assignedStaffUserId,
        guardResponse,
        adminNotes,
        isResolved,
        requester.user_id,
        disputeId
      ]
    );
    await client.query(
      `
        INSERT INTO dispute_status_history (
          dispute_id,
          previous_status,
          new_status,
          actor_user_id,
          note
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [disputeId, current.status, targetStatus, requester.user_id, historyNote(targetStatus)]
    );

    envelopes = await persistRecipientNotifications({
      client,
      recipientIds: [current.resident_user_id],
      dispute: current,
      title: targetStatus === "RESOLVED" ? "Dispute resolved" : "Dispute updated",
      message: transitionMessage(targetStatus),
      eventKey: `${current.status.toLowerCase()}-${targetStatus.toLowerCase()}`
    });

    if (targetStatus === "ESCALATED") {
      const adminsResult = await client.query(
        `
          SELECT user_id
          FROM users
          WHERE role = 'ADMIN'
            AND status = 'ACTIVE'
          ORDER BY user_id
        `
      );
      envelopes.push(...await persistRecipientNotifications({
        client,
        recipientIds: adminsResult.rows.map((row) => row.user_id),
        dispute: current,
        title: "Dispute requires Admin review",
        message: `Dispute ${current.dispute_reference} has been escalated by a Guard.`,
        eventKey: "escalated-admin"
      }));
    }

    await client.query("COMMIT");
    transactionOpen = false;
    await deliverNotifications(envelopes);
    await emitDisputeChanged(disputeId, "STATUS_CHANGED");
    const updated = await getDisputeRow(disputeId);
    return {
      message: "Dispute status updated successfully.",
      dispute: toSafeDispute(updated, { includePrivateStaffFields: true })
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateGuardResponse({ requester, disputeId, response }) {
  if (requester?.role !== "GUARD") return { error: "FORBIDDEN" };
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const value = normalizeText(response, 4000);
  if (!value) return { error: "GUARD_RESPONSE_REQUIRED" };
  const result = await pool.query(
    `
      UPDATE disputes
      SET guard_response = $1
      WHERE dispute_id = $2
        AND status = 'IN_REVIEW_GUARD'
        AND assigned_staff_user_id = $3
      RETURNING dispute_id
    `,
    [value, disputeId, requester.user_id]
  );
  if (!result.rows[0]) return { error: "RESPONSE_UPDATE_NOT_ALLOWED" };
  await emitDisputeChanged(disputeId, "GUARD_RESPONSE_UPDATED");
  return { message: "Guard response updated successfully." };
}

export async function updateAdminResolutionNotes({ requester, disputeId, notes }) {
  if (requester?.role !== "ADMIN") return { error: "FORBIDDEN" };
  if (!isUuid(disputeId)) return { error: "INVALID_DISPUTE_ID" };
  const value = normalizeText(notes, 4000);
  if (!value) return { error: "ADMIN_NOTES_REQUIRED" };
  const result = await pool.query(
    `
      UPDATE disputes
      SET admin_resolution_notes = $1
      WHERE dispute_id = $2
        AND (
          (status = 'IN_REVIEW_ADMIN' AND assigned_staff_user_id = $3)
          OR (status = 'RESOLVED' AND resolved_by_user_id = $3)
        )
      RETURNING dispute_id
    `,
    [value, disputeId, requester.user_id]
  );
  if (!result.rows[0]) return { error: "NOTES_UPDATE_NOT_ALLOWED" };
  await emitDisputeChanged(disputeId, "ADMIN_NOTES_UPDATED");
  return { message: "Admin resolution notes updated successfully." };
}
