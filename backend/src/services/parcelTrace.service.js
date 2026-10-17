import path from 'node:path';
import { pool } from '../db/pool.js';
import { COLLECTION_PHOTO_DIR } from './collectionVerification.service.js';
import { AUDIT_ACTIONS, recordAuditLog } from './audit.service.js';
import { INVESTIGATION_TRANSITIONS, traceDates, traceError, traceId, traceNote, tracePagination, traceTracking } from '../utils/parcelTrace.js';

const PARCEL_SELECT = `p.parcel_id, p.tracking_number, p.status, p.created_at, p.collected_at,
  p.deleted_at, p.parcel_room_id, r.name AS parcel_room_name, c.courier_name, u.full_unit_code AS unit_reference,
  (p.parcel_photo_url IS NOT NULL) AS registration_photo_present`;
const PARCEL_FROM = `FROM parcels p JOIN units u ON u.unit_id=p.unit_id
  JOIN courier_companies c ON c.courier_id=p.courier_id LEFT JOIN parcel_rooms r ON r.id=p.parcel_room_id`;
const ACTOR_NAME = `NULLIF(CONCAT_WS(' ', actor.first_name, actor.last_name), '')`;

export function authorizeTrace(requester) {
  if (!['ADMIN', 'GUARD'].includes(requester?.role)) traceError(403, 'Parcel Trace is available only to Admin and Guard.');
}
async function target(client, parcelId, disputeId) {
  traceId(parcelId);
  const parcel = (await client.query(`SELECT ${PARCEL_SELECT} ${PARCEL_FROM} WHERE p.parcel_id=$1`, [parcelId])).rows[0];
  if (!parcel) traceError(404, 'Parcel not found.');
  let dispute = null;
  if (disputeId) {
    traceId(disputeId);
    dispute = (await client.query(`SELECT dispute_id, dispute_reference, status, issue_type FROM disputes
      WHERE dispute_id=$1 AND parcel_id=$2 AND deleted_at IS NULL`, [disputeId, parcelId])).rows[0];
    if (!dispute) traceError(404, 'The dispute is unavailable or is not linked to this parcel.');
  }
  return { parcel, dispute };
}
async function paged(client, sql, params, query) {
  const { page, limit } = tracePagination(query);
  const total = Number((await client.query(`SELECT COUNT(*) AS total FROM (${sql}) counted`, params)).rows[0].total);
  const rows = (await client.query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit])).rows;
  return { rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}
export async function searchTraceParcels(requester, query) {
  authorizeTrace(requester);
  const tracking = traceTracking(query.tracking_number);
  const result = await paged(pool, `SELECT ${PARCEL_SELECT} ${PARCEL_FROM}
    WHERE LOWER(p.tracking_number)=LOWER($1) ORDER BY p.created_at DESC, p.parcel_id`, [tracking], query);
  return { parcels: result.rows, pagination: result.pagination };
}
export async function traceOverview(requester, parcelId, disputeId) {
  authorizeTrace(requester);
  const context = await target(pool, parcelId, disputeId);
  const investigation = (await pool.query(`SELECT * FROM parcel_investigations
    WHERE parcel_id=$1 AND dispute_id IS NOT DISTINCT FROM $2::uuid`, [parcelId, disputeId || null])).rows[0] || null;
  const disputes = await paged(pool, `SELECT dispute_id, dispute_reference, status, issue_type FROM disputes
    WHERE parcel_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC, dispute_id`, [parcelId], {});
  return { ...context, investigation, related_disputes: disputes.rows,
    related_disputes_pagination: disputes.pagination,
    allowed_transitions: investigation ? INVESTIGATION_TRANSITIONS[requester.role][investigation.status] || [] : [] };
}
export async function traceBarcodes(requester, parcelId, query) {
  authorizeTrace(requester);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  const result = await paged(pool, `SELECT a.attempt_id, a.scanned_tracking_number, a.result, a.created_at,
    e.evidence_id, e.parcel_id AS attempted_parcel_id, e.registered_tracking_number,
    s.session_id, s.collection_id, s.unit_reference, s.status AS verification_status, s.completed_at,
    (e.parcel_id=$1) AS target_parcel_attempt, (LOWER(a.scanned_tracking_number)=LOWER($2)) AS exact_tracking_match
    FROM collection_barcode_attempts a JOIN collection_verification_evidence e ON e.evidence_id=a.evidence_id
    JOIN collection_verification_sessions s ON s.session_id=e.session_id
    WHERE e.parcel_id=$1 OR LOWER(a.scanned_tracking_number)=LOWER($2)
    ORDER BY (LOWER(a.scanned_tracking_number)=LOWER($2)) DESC NULLS LAST, a.created_at DESC, a.attempt_id`,
  [parcelId, parcel.tracking_number], query);
  return { attempts: result.rows, pagination: result.pagination };
}

// Candidates are metadata, never a physical-collection finding or image similarity result.
function candidateSql() {
  return `SELECT pc.collection_id, pc.collection_status, pc.created_at, pc.collected_at,
    s.session_id, s.status AS verification_status, COALESCE(s.unit_reference, u.full_unit_code) AS unit_reference,
    (SELECT COUNT(*)::int FROM parcel_collection_items ci WHERE ci.collection_id=pc.collection_id) AS parcel_count,
    EXISTS(SELECT 1 FROM parcel_collection_items ci WHERE ci.collection_id=pc.collection_id AND ci.parcel_id=$1) AS target_in_collection,
    EXISTS(SELECT 1 FROM collection_barcode_attempts a JOIN collection_verification_evidence e ON e.evidence_id=a.evidence_id
      WHERE e.session_id=s.session_id AND LOWER(a.scanned_tracking_number)=LOWER($2)) AS matching_attempt,
    (SELECT COUNT(*)::int FROM collection_verification_evidence e WHERE e.session_id=s.session_id) AS evidence_count,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id, 'parcel_id', e.parcel_id,
      'tracking_number', e.registered_tracking_number, 'courier_name', e.courier_name,
      'parcel_room_name', e.parcel_room_name, 'barcode_status', e.barcode_status,
      'matching_tracking_attempt', EXISTS(SELECT 1 FROM collection_barcode_attempts a
        WHERE a.evidence_id=e.evidence_id AND LOWER(a.scanned_tracking_number)=LOWER($2)),
      'photo_present', e.photo_filename IS NOT NULL, 'photo_uploaded_at', e.photo_uploaded_at) ORDER BY e.parcel_id)
      FROM (SELECT * FROM collection_verification_evidence preview WHERE preview.session_id=s.session_id ORDER BY preview.parcel_id LIMIT 3) e), '[]'::jsonb) AS evidence
    FROM parcel_collections pc LEFT JOIN collection_verification_sessions s ON s.collection_id=pc.collection_id
    JOIN users resident ON resident.user_id=pc.resident_id LEFT JOIN units u ON u.unit_id=resident.unit_id
    WHERE pc.created_at >= ($3::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND pc.created_at < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND ($5::text IS NULL OR pc.collection_status=$5)
      AND ($6::text IS NULL OR COALESCE(s.unit_reference, u.full_unit_code)=$6)
      AND ($7::text IS NULL OR EXISTS(SELECT 1 FROM parcel_collection_items ci JOIN parcels ip ON ip.parcel_id=ci.parcel_id
        WHERE ci.collection_id=pc.collection_id AND LOWER(ip.tracking_number)=LOWER($7))
        OR EXISTS(SELECT 1 FROM collection_verification_evidence e WHERE e.session_id=s.session_id
          AND LOWER(e.registered_tracking_number)=LOWER($7))
        OR EXISTS(SELECT 1 FROM collection_barcode_attempts a JOIN collection_verification_evidence e ON e.evidence_id=a.evidence_id
          WHERE e.session_id=s.session_id AND LOWER(a.scanned_tracking_number)=LOWER($7)))`;
}
function candidateParams(parcel, query) {
  const dates = traceDates(query, parcel.created_at);
  if (query.status && !['ACTIVE', 'VERIFYING', 'USED', 'EXPIRED', 'CANCELLED'].includes(query.status)) traceError(400, 'Invalid collection status.');
  if (query.unit !== undefined && (typeof query.unit !== 'string' || query.unit.length > 120 || /[\x00-\x1f\x7f]/.test(query.unit))) traceError(400, 'Invalid unit filter.');
  return { dates, params: [parcel.parcel_id, parcel.tracking_number, dates.from, dates.to,
    query.status || null, query.unit?.trim() || null, query.tracking_number ? traceTracking(query.tracking_number) : null] };
}
export async function traceCollections(requester, parcelId, query) {
  authorizeTrace(requester);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  const { dates, params } = candidateParams(parcel, query);
  const result = await paged(pool, `${candidateSql()} ORDER BY target_in_collection DESC, matching_attempt DESC,
    pc.created_at DESC, pc.collection_id`, params, query);
  return { collections: result.rows.map((row) => ({ ...row,
    reason: row.target_in_collection ? 'Investigated parcel listed in this collection'
      : row.matching_attempt ? 'Matching tracking-number attempt recorded; requires review'
        : 'Within the selected date window; no barcode relationship established' })), pagination: result.pagination, date_window: dates };
}
export async function traceCollectionEvidence(requester, parcelId, collectionId, query) {
  authorizeTrace(requester); traceId(collectionId);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  const { params } = candidateParams(parcel, query);
  const candidate = (await pool.query(`SELECT session_id FROM (${candidateSql()}) candidate WHERE collection_id=$8`, [...params, collectionId])).rows[0];
  if (!candidate) traceError(404, 'Collection is outside this investigation window.');
  const result = await paged(pool, `SELECT e.evidence_id, e.parcel_id, e.registered_tracking_number AS tracking_number,
    e.courier_name, e.parcel_room_name, e.barcode_status, e.photo_filename IS NOT NULL AS photo_present, e.photo_uploaded_at,
    EXISTS(SELECT 1 FROM collection_barcode_attempts a WHERE a.evidence_id=e.evidence_id
      AND LOWER(a.scanned_tracking_number)=LOWER($2)) AS matching_tracking_attempt
    FROM collection_verification_evidence e WHERE e.session_id=$1 ORDER BY e.parcel_id`, [candidate.session_id, parcel.tracking_number], query);
  return { evidence: result.rows, pagination: result.pagination };
}
function registrationCandidatesSql() {
  return `SELECT ${PARCEL_SELECT}, p.parcel_photo_url ${PARCEL_FROM}
    WHERE p.parcel_id <> $1 AND p.parcel_photo_url IS NOT NULL
      AND p.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND p.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND ($4::text IS NULL OR u.full_unit_code=$4)`;
}
function registrationCandidateParams(parcel, query) {
  const { dates } = candidateParams(parcel, query);
  return { dates, params: [parcel.parcel_id, dates.from, dates.to, query.unit?.trim() || null] };
}
export async function traceRegistrationPhotos(requester, parcelId, query) {
  authorizeTrace(requester);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  const { dates, params } = registrationCandidateParams(parcel, query);
  // Return metadata only; image paths are never exposed in candidate responses.
  const result = await paged(pool, `${registrationCandidatesSql()} ORDER BY p.created_at DESC, p.parcel_id`, params, query);
  return { photos: result.rows.map((row) => ({
    photo_source: 'REGISTRATION', created_at: row.created_at, unit_reference: row.unit_reference,
    parcel_status: row.status, matching_attempt: false,
    evidence: { evidence_id: row.parcel_id, parcel_id: row.parcel_id, photo_source: 'REGISTRATION',
      tracking_number: row.tracking_number, courier_name: row.courier_name, parcel_room_name: row.parcel_room_name,
      photo_present: true, photo_uploaded_at: row.created_at }
  })), pagination: result.pagination, date_window: dates };
}
function registrationFile(photoPath) {
  // Only generated local assets are eligible; never fetch submitted URLs.
  const match = /^\/uploads\/parcels\/(\d+-[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp))$/i.exec(photoPath || '');
  if (!match) traceError(404, 'Registration photo unavailable.');
  const ext = path.extname(match[1]).toLowerCase();
  return { root: path.resolve('uploads/parcels'), filename: match[1], mime: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg' };
}
export async function traceRegistrationCandidatePhoto(requester, parcelId, candidateId, query) {
  authorizeTrace(requester); traceId(candidateId);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  const { params } = registrationCandidateParams(parcel, query);
  const row = (await pool.query(`SELECT parcel_photo_url FROM (${registrationCandidatesSql()}) candidate WHERE parcel_id=$5`, [...params, candidateId])).rows[0];
  if (!row) traceError(404, 'Registration photo is outside this investigation window.');
  return registrationFile(row.parcel_photo_url);
}
async function eligibleEvidence(client, parcel, evidenceId, query) {
  traceId(evidenceId);
  const { params } = candidateParams(parcel, query);
  const candidate = (await client.query(`SELECT candidate.collection_id FROM (${candidateSql()}) candidate
    JOIN collection_verification_evidence chosen ON chosen.session_id=candidate.session_id
    WHERE chosen.evidence_id=$8`, [...params, evidenceId])).rows[0];
  if (!candidate) traceError(404, 'Evidence is not available within this investigation window.');
  return (await client.query(`SELECT photo_filename, photo_mime_type FROM collection_verification_evidence WHERE evidence_id=$1`, [evidenceId])).rows[0];
}
export async function tracePhoto(requester, parcelId, evidenceId, query) {
  authorizeTrace(requester);
  const { parcel } = await target(pool, parcelId, query.dispute_id);
  if (evidenceId) {
    const row = await eligibleEvidence(pool, parcel, evidenceId, query);
    if (!row.photo_filename || !/^[0-9a-f-]{36}\.(jpg|png)$/.test(row.photo_filename)
      || !['image/jpeg', 'image/png'].includes(row.photo_mime_type)) traceError(404, 'Collection photo unavailable.');
    return { root: COLLECTION_PHOTO_DIR, filename: row.photo_filename, mime: row.photo_mime_type };
  }
  const row = (await pool.query('SELECT parcel_photo_url FROM parcels WHERE parcel_id=$1', [parcelId])).rows[0];
  return registrationFile(row.parcel_photo_url);
}
async function transaction(operation) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function investigation(client, id) {
  traceId(id);
  const row = (await client.query('SELECT * FROM parcel_investigations WHERE investigation_id=$1 FOR UPDATE', [id])).rows[0];
  if (!row) traceError(404, 'Investigation not found.');
  return row;
}
async function audit(client, requester, action, record, extra = {}) {
  await recordAuditLog({ client, actor: requester, action, entityType: 'INVESTIGATION', entityId: record.investigation_id,
    entityReference: record.investigation_id, description: `${action} for parcel investigation.`,
    metadata: { parcel_id: record.parcel_id, dispute_id: record.dispute_id, ...extra } });
}
export async function startInvestigation(requester, input) {
  authorizeTrace(requester);
  if (!input || Object.keys(input).some((key) => !['parcel_id', 'dispute_id'].includes(key))) traceError(400, 'Provide a parcel ID and optional dispute ID.');
  return transaction(async (client) => {
    await target(client, input.parcel_id, input.dispute_id);
    await client.query('SELECT parcel_id FROM parcels WHERE parcel_id=$1 FOR UPDATE', [input.parcel_id]);
    const existing = (await client.query(`SELECT * FROM parcel_investigations WHERE parcel_id=$1 AND dispute_id IS NOT DISTINCT FROM $2::uuid`,
      [input.parcel_id, input.dispute_id || null])).rows[0];
    if (existing) return { investigation: existing, already_exists: true };
    const row = (await client.query(`INSERT INTO parcel_investigations(parcel_id, dispute_id, created_by)
      VALUES($1,$2,$3) RETURNING *`, [input.parcel_id, input.dispute_id || null, requester.user_id])).rows[0];
    await client.query(`INSERT INTO parcel_investigation_status_history(investigation_id,new_status,actor_user_id,actor_role)
      VALUES($1,'OPEN',$2,$3)`, [row.investigation_id, requester.user_id, requester.role]);
    await audit(client, requester, AUDIT_ACTIONS.INVESTIGATION_OPENED, row);
    return { investigation: row };
  });
}
export async function investigationNotes(requester, id, query) {
  authorizeTrace(requester); traceId(id);
  if (!(await pool.query('SELECT 1 FROM parcel_investigations WHERE investigation_id=$1', [id])).rowCount) traceError(404, 'Investigation not found.');
  const result = await paged(pool, `SELECT n.note_id, n.content, n.observations, n.reviewed_evidence_id, n.created_at,
    n.author_role, ${ACTOR_NAME} AS author_name FROM parcel_investigation_notes n
    LEFT JOIN users actor ON actor.user_id=n.author_id WHERE n.investigation_id=$1 ORDER BY n.created_at, n.note_id`, [id], query);
  return { notes: result.rows, pagination: result.pagination };
}
export async function addInvestigationNote(requester, id, input, query) {
  authorizeTrace(requester); const note = traceNote(input);
  return transaction(async (client) => {
    const record = await investigation(client, id);
    const { parcel } = await target(client, record.parcel_id);
    if (note.evidenceId) await eligibleEvidence(client, parcel, note.evidenceId, query);
    const row = (await client.query(`INSERT INTO parcel_investigation_notes(investigation_id,author_id,author_role,content,observations,reviewed_evidence_id)
      VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING note_id, created_at`,
    [id, requester.user_id, requester.role, note.content, JSON.stringify(note.observations), note.evidenceId])).rows[0];
    await client.query('UPDATE parcel_investigations SET updated_at=clock_timestamp() WHERE investigation_id=$1', [id]);
    await audit(client, requester, AUDIT_ACTIONS.INVESTIGATION_NOTE_ADDED, record, { note_id: row.note_id });
    return { note: row };
  });
}
export async function transitionInvestigation(requester, id, input) {
  authorizeTrace(requester);
  if (!input || Object.keys(input).length !== 1 || typeof input.status !== 'string') traceError(400, 'Provide only the target investigation status.');
  return transaction(async (client) => {
    const record = await investigation(client, id);
    if (!INVESTIGATION_TRANSITIONS[requester.role][record.status]?.includes(input.status)) traceError(409, 'This investigation transition is not allowed for your role.');
    const next = (await client.query('UPDATE parcel_investigations SET status=$1, updated_at=clock_timestamp() WHERE investigation_id=$2 RETURNING *', [input.status, id])).rows[0];
    await client.query(`INSERT INTO parcel_investigation_status_history(investigation_id,previous_status,new_status,actor_user_id,actor_role)
      VALUES($1,$2,$3,$4,$5)`, [id, record.status, input.status, requester.user_id, requester.role]);
    await audit(client, requester, AUDIT_ACTIONS.INVESTIGATION_STATUS_CHANGED, record, { previous_status: record.status, new_status: input.status });
    return { investigation: next };
  });
}

export async function traceTimeline(requester, parcelId, query) {
  authorizeTrace(requester);
  await target(pool, parcelId, query.dispute_id);
  const sql = `WITH target AS (SELECT * FROM parcels WHERE parcel_id=$1), related_sessions AS (
    SELECT DISTINCT s.* FROM collection_verification_sessions s JOIN collection_verification_evidence e ON e.session_id=s.session_id
    WHERE e.parcel_id=$1 OR EXISTS(SELECT 1 FROM collection_barcode_attempts a WHERE a.evidence_id=e.evidence_id
      AND LOWER(a.scanned_tracking_number)=LOWER((SELECT tracking_number FROM target)))
  ), events AS (
    SELECT 'registration:'||p.parcel_id AS event_id, p.created_at, 'Parcel registered'::text AS label,
      p.tracking_number AS detail, p.registered_by AS actor_id, NULL::text AS stored_role FROM target p
    UNION ALL SELECT 'audit:'||a.audit_log_id, a.created_at, a.action, a.description, a.actor_user_id, a.actor_role
      FROM audit_logs a WHERE a.entity_type='PARCEL' AND a.entity_id=$1
      AND a.action NOT IN ('Parcel Registered','Barcode Verification Succeeded','Barcode Verification Failed','Collection Photo Uploaded','Parcel Collected')
    UNION ALL SELECT 'qr:'||pc.collection_id, pc.generated_at, 'Collection QR generated', pc.collection_id::text,
      pc.resident_id, 'RESIDENT' FROM parcel_collections pc JOIN parcel_collection_items ci ON ci.collection_id=pc.collection_id WHERE ci.parcel_id=$1
    UNION ALL SELECT 'start:'||s.session_id, s.created_at, 'Guard started verification', s.unit_reference||' / related session; not a physical handover', s.guard_id, 'GUARD' FROM related_sessions s
    UNION ALL SELECT 'attempt:'||a.attempt_id, a.created_at, 'Barcode attempt: '||a.result,
      COALESCE(a.scanned_tracking_number,'Unreadable')||' / unit '||s.unit_reference, a.actor_user_id, 'RESIDENT'
      FROM collection_barcode_attempts a JOIN collection_verification_evidence e ON e.evidence_id=a.evidence_id
      JOIN collection_verification_sessions s ON s.session_id=e.session_id
      WHERE e.parcel_id=$1 OR LOWER(a.scanned_tracking_number)=LOWER((SELECT tracking_number FROM target))
    UNION ALL SELECT 'photo:'||e.evidence_id, e.photo_uploaded_at, 'Current collection photo uploaded', e.registered_tracking_number||' / unit '||s.unit_reference, s.resident_id, 'RESIDENT'
      FROM collection_verification_evidence e JOIN related_sessions s ON s.session_id=e.session_id WHERE e.photo_uploaded_at IS NOT NULL
    UNION ALL SELECT 'confirmed:'||s.session_id, s.confirmed_at, 'Resident confirmed collection',
      s.unit_reference||' / related session; check parcel membership', s.resident_id, 'RESIDENT' FROM related_sessions s WHERE s.confirmed_at IS NOT NULL
    UNION ALL SELECT 'session-audit:'||a.audit_log_id, a.created_at, a.action, a.description, a.actor_user_id, a.actor_role
      FROM audit_logs a JOIN related_sessions s ON s.collection_id=a.entity_id WHERE a.entity_type='COLLECTION'
      AND a.action NOT IN ('Collection Verification Started','Resident Confirmed Collection','Collection Completed')
    UNION ALL SELECT 'legacy:'||pc.collection_id, pc.collected_at, 'Legacy collection recorded', pc.collection_id::text, pc.verified_by, NULL
      FROM parcel_collections pc JOIN parcel_collection_items ci ON ci.collection_id=pc.collection_id
      WHERE ci.parcel_id=$1 AND pc.collected_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM collection_verification_sessions s WHERE s.collection_id=pc.collection_id)
    UNION ALL SELECT 'dispute:'||h.history_id, h.created_at, 'Dispute status: '||h.new_status, d.dispute_reference, h.actor_user_id, NULL
      FROM dispute_status_history h JOIN disputes d ON d.dispute_id=h.dispute_id WHERE d.parcel_id=$1
    UNION ALL SELECT 'investigation:'||h.history_id, h.created_at, 'Investigation: '||h.new_status,
      COALESCE(h.previous_status||' -> ','')||h.new_status, h.actor_user_id, h.actor_role FROM parcel_investigation_status_history h
      JOIN parcel_investigations i ON i.investigation_id=h.investigation_id WHERE i.parcel_id=$1
    UNION ALL SELECT 'note:'||n.note_id, n.created_at, 'Investigation note added', i.investigation_id::text, n.author_id, n.author_role
      FROM parcel_investigation_notes n JOIN parcel_investigations i ON i.investigation_id=n.investigation_id WHERE i.parcel_id=$1
  ) SELECT ev.event_id, ev.created_at, ev.label, ev.detail, COALESCE(ev.stored_role,actor.role) AS actor_role,
    ${ACTOR_NAME} AS actor_name FROM events ev LEFT JOIN users actor ON actor.user_id=ev.actor_id ORDER BY ev.created_at, ev.event_id`;
  const result = await paged(pool, sql, [parcelId], query);
  return { events: result.rows, pagination: result.pagination };
}
