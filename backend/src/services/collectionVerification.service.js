import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { hashToken } from "../utils/token.js";
import { MAX_BARCODE_ATTEMPTS, normalizeBarcode, trackingMatches, validCollectionId,
  validateCollectionPhoto, VERIFICATION_MINUTES } from "../utils/collectionVerification.js";
import { AUDIT_ACTIONS, recordAuditLog } from "./audit.service.js";

export const COLLECTION_PHOTO_DIR = path.resolve("private-uploads/collections");
const ACTIVE = "AWAITING_VERIFICATION";

async function audit(client, actor, action, session, metadata = {}, parcel) {
  await recordAuditLog({ client, actor, action, entityType: parcel ? "PARCEL" : "COLLECTION",
    entityId: parcel?.parcel_id || session.collection_id,
    entityReference: parcel?.registered_tracking_number || session.collection_id,
    description: `${action}${parcel ? ` for parcel ${parcel.registered_tracking_number}` : ""}.`,
    metadata: { session_id: session.session_id, collection_id: session.collection_id,
      unit: session.unit_reference, ...metadata } });
}

async function expireDue(client) {
  const { rows } = await client.query(`UPDATE collection_verification_sessions
    SET status = 'EXPIRED' WHERE status = 'AWAITING_VERIFICATION' AND expires_at <= clock_timestamp() RETURNING *`);
  for (const session of rows) {
    await client.query("DELETE FROM collection_verification_reservations WHERE session_id = $1", [session.session_id]);
    await client.query("UPDATE parcel_collections SET collection_status = 'EXPIRED' WHERE collection_id = $1 AND collection_status = 'VERIFYING'", [session.collection_id]);
    await audit(client, null, AUDIT_ACTIONS.COLLECTION_VERIFICATION_EXPIRED, session);
  }
  return rows.length;
}

async function transaction(operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One cross-process lock orders session/reservation mutations for this low-volume workflow.
    // Parcel rows are locked separately to coordinate with existing parcel editors.
    await client.query("SELECT pg_advisory_xact_lock(18001)");
    await expireDue(client);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function expireCollectionVerifications() {
  return transaction(async () => ({ sweep_completed: true }));
}

function allowed(session, requester) {
  return requester?.role === "ADMIN"
    || (requester?.role === "GUARD" && session.guard_id === requester.user_id)
    || (requester?.role === "RESIDENT" && session.resident_id === requester.user_id && session.unit_id === requester.unit_id);
}

async function loadSession(client, sessionId, requester, { residentOnly = false } = {}) {
  if (!validCollectionId(sessionId)) return { error: "INVALID_ID" };
  if (residentOnly && requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  if (!["RESIDENT", "GUARD", "ADMIN"].includes(requester?.role)) return { error: "FORBIDDEN" };
  const { rows } = await client.query("SELECT * FROM collection_verification_sessions WHERE session_id = $1 FOR UPDATE", [sessionId]);
  const session = rows[0];
  if (!session || !allowed(session, requester)) return { error: "SESSION_NOT_FOUND" };
  if (requester.role === "RESIDENT") {
    const identity = await client.query("SELECT unit_id FROM users WHERE user_id = $1 AND role = 'RESIDENT' AND status = 'ACTIVE' FOR SHARE", [requester.user_id]);
    if (identity.rows[0]?.unit_id !== session.unit_id) return { error: "SESSION_NOT_FOUND" };
  }
  if (session.status === ACTIVE && (await client.query(
    "SELECT expires_at <= clock_timestamp() AS expired FROM collection_verification_sessions WHERE session_id = $1", [sessionId]
  )).rows[0].expired) {
    await expireDue(client);
    session.status = "EXPIRED";
  }
  return { session };
}

function activeError(session) {
  if (session.status === "EXPIRED") return { error: "SESSION_EXPIRED" };
  if (session.status !== ACTIVE) return { error: "SESSION_INACTIVE" };
  return null;
}

async function details(client, session) {
  const { rows } = await client.query(`SELECT evidence_id, parcel_id, registered_tracking_number,
    courier_name, parcel_room_name, scanned_tracking_number, barcode_status, attempt_count,
    verified_at, photo_filename, photo_uploaded_at FROM collection_verification_evidence
    WHERE session_id = $1 ORDER BY parcel_id`, [session.session_id]);
  return { verification_session: {
    session_id: session.session_id, collection_id: session.collection_id, status: session.status,
    unit_reference: session.unit_reference, guard_id: session.guard_id,
    created_at: session.created_at, expires_at: session.expires_at,
    confirmed_at: session.confirmed_at, completed_at: session.completed_at, cancelled_at: session.cancelled_at,
    parcel_count: rows.length, parcels: rows.map(({ photo_filename, ...row }) => ({ ...row,
      photo_present: Boolean(photo_filename),
      photo_url: photo_filename ? `/api/collection-verifications/${session.session_id}/parcels/${row.parcel_id}/photo` : null
    }))
  } };
}

export async function startCollectionVerification({ requester, token }) {
  if (requester?.role !== "GUARD") return { error: "GUARD_FORBIDDEN" };
  if (typeof token !== "string" || !token.trim()) return { error: "TOKEN_REQUIRED" };
  if (token.length > 256) return { error: "COLLECTION_NOT_FOUND" };
  return transaction(async (client) => {
    const collectionResult = await client.query(`SELECT pc.*, (pc.qr_expiry <= clock_timestamp()) AS is_expired
      FROM parcel_collections pc WHERE qr_token_hash = $1 FOR UPDATE`, [hashToken(token.trim())]);
    const collection = collectionResult.rows[0];
    if (!collection) return { error: "COLLECTION_NOT_FOUND" };
    if (collection.collection_status === "USED") return { error: "COLLECTION_ALREADY_USED" };
    if (collection.collection_status === "CANCELLED") return { error: "COLLECTION_CANCELLED" };
    if (collection.collection_status === "VERIFYING") {
      const existing = await client.query("SELECT * FROM collection_verification_sessions WHERE collection_id = $1 FOR UPDATE", [collection.collection_id]);
      if (!existing.rows[0] || existing.rows[0].guard_id !== requester.user_id) return { error: "FORBIDDEN" };
      return activeError(existing.rows[0]) || details(client, existing.rows[0]);
    }
    if (collection.is_expired || collection.collection_status === "EXPIRED") {
      await client.query("UPDATE parcel_collections SET collection_status = 'EXPIRED' WHERE collection_id = $1 AND collection_status = 'ACTIVE'", [collection.collection_id]);
      return { error: "COLLECTION_EXPIRED" };
    }
    if (collection.collection_status !== "ACTIVE") return { error: "COLLECTION_NOT_AVAILABLE" };
    const resident = (await client.query(`SELECT resident.unit_id, unit.full_unit_code FROM users resident
      JOIN units unit ON unit.unit_id = resident.unit_id
      WHERE resident.user_id = $1 AND resident.role = 'RESIDENT' AND resident.status = 'ACTIVE' FOR SHARE OF resident`,
    [collection.resident_id])).rows[0];
    if (!resident) return { error: "COLLECTION_NOT_AVAILABLE" };
    const ids = (await client.query("SELECT parcel_id FROM parcel_collection_items WHERE collection_id = $1 ORDER BY parcel_id", [collection.collection_id])).rows.map((row) => row.parcel_id);
    if (!ids.length) return { error: "COLLECTION_EMPTY" };
    const { rows: parcels } = await client.query(`SELECT p.*, c.courier_name, room.name AS parcel_room_name
      FROM parcels p JOIN courier_companies c ON c.courier_id = p.courier_id
      LEFT JOIN parcel_rooms room ON room.id = p.parcel_room_id
      WHERE p.parcel_id = ANY($1::uuid[]) ORDER BY p.parcel_id FOR UPDATE OF p`, [ids]);
    if (parcels.length !== ids.length || parcels.some((p) => p.deleted_at || p.unit_id !== resident.unit_id)) return { error: "COLLECTION_PARCEL_INVALID" };
    if (parcels.some((p) => p.status === "COLLECTED")) return { error: "PARCEL_ALREADY_COLLECTED" };
    if (parcels.some((p) => p.status !== "PENDING_COLLECTION")) return { error: "PARCEL_NOT_AVAILABLE" };
    const reserved = await client.query("SELECT parcel_id FROM collection_verification_reservations WHERE parcel_id = ANY($1::uuid[])", [ids]);
    if (reserved.rows.length) return { error: "PARCEL_RESERVED" };
    if ((await client.query("SELECT qr_expiry <= clock_timestamp() AS expired FROM parcel_collections WHERE collection_id = $1", [collection.collection_id])).rows[0].expired) {
      await client.query("UPDATE parcel_collections SET collection_status = 'EXPIRED' WHERE collection_id = $1", [collection.collection_id]);
      return { error: "COLLECTION_EXPIRED" };
    }
    const session = (await client.query(`INSERT INTO collection_verification_sessions
      (collection_id, resident_id, unit_id, unit_reference, guard_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, clock_timestamp() + $6::interval) RETURNING *`,
    [collection.collection_id, collection.resident_id, resident.unit_id, resident.full_unit_code, requester.user_id, `${VERIFICATION_MINUTES} minutes`])).rows[0];
    for (const parcel of parcels) {
      await client.query(`INSERT INTO collection_verification_evidence
        (session_id, parcel_id, registered_tracking_number, courier_name, parcel_room_name)
        VALUES ($1, $2, $3, $4, $5)`, [session.session_id, parcel.parcel_id, parcel.tracking_number, parcel.courier_name, parcel.parcel_room_name]);
    }
    await client.query(`INSERT INTO collection_verification_reservations (parcel_id, session_id)
      SELECT parcel_id, $1 FROM collection_verification_evidence WHERE session_id = $1`, [session.session_id]);
    await client.query("UPDATE parcel_collections SET collection_status = 'VERIFYING', verified_by = $1 WHERE collection_id = $2", [requester.user_id, collection.collection_id]);
    await audit(client, requester, AUDIT_ACTIONS.COLLECTION_VERIFICATION_STARTED, session, { parcel_count: ids.length });
    return { ...await details(client, session), message: "Verification started. Parcels remain pending until the Resident confirms.",
      realtime: { recipient_user_id: collection.resident_id, event: "collection:verification-started",
        payload: { collection_id: collection.collection_id, session_id: session.session_id, expires_at: session.expires_at } } };
  });
}

export async function getCollectionVerification({ requester, sessionId }) {
  return transaction(async (client) => {
    const result = await loadSession(client, sessionId, requester);
    return result.error ? result : details(client, result.session);
  });
}

export async function getActiveCollectionVerifications({ requester }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  return transaction(async (client) => {
    const { rows } = await client.query(`SELECT s.* FROM collection_verification_sessions s
      JOIN users u ON u.user_id = s.resident_id AND u.unit_id = s.unit_id AND u.status = 'ACTIVE'
      WHERE s.resident_id = $1 AND s.status = 'AWAITING_VERIFICATION' ORDER BY s.created_at DESC`, [requester.user_id]);
    return { verification_sessions: await Promise.all(rows.map(async (session) => (await details(client, session)).verification_session)) };
  });
}

async function parcelEvidence(client, sessionId, parcelId) {
  if (!validCollectionId(parcelId)) return { error: "INVALID_ID" };
  const { rows } = await client.query("SELECT * FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2 FOR UPDATE", [sessionId, parcelId]);
  return rows[0] ? { evidence: rows[0] } : { error: "PARCEL_NOT_IN_SESSION" };
}

export async function recordCollectionBarcode({ requester, sessionId, parcelId, input }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  const value = normalizeBarcode(input);
  if (value.error) return value;
  return transaction(async (client) => {
    const loaded = await loadSession(client, sessionId, requester, { residentOnly: true });
    if (loaded.error) return loaded;
    const session = loaded.session, inactive = activeError(session);
    if (inactive) return inactive;
    const result = await parcelEvidence(client, sessionId, parcelId);
    if (result.error) return result;
    const evidence = result.evidence;
    const status = value.unreadable ? "UNREADABLE" : trackingMatches(value.scanned, evidence.registered_tracking_number) ? "MATCHED" : "MISMATCHED";
    if (evidence.barcode_status === status && evidence.scanned_tracking_number === value.scanned) return details(client, session);
    if (evidence.attempt_count >= MAX_BARCODE_ATTEMPTS) return { error: "ATTEMPT_LIMIT" };
    await client.query(`INSERT INTO collection_barcode_attempts (evidence_id, actor_user_id, scanned_tracking_number, result)
      VALUES ($1, $2, $3, $4)`, [evidence.evidence_id, requester.user_id, value.scanned, status]);
    await client.query(`UPDATE collection_verification_evidence SET scanned_tracking_number = $1, barcode_status = $2,
      attempt_count = attempt_count + 1, verified_at = clock_timestamp() WHERE evidence_id = $3`, [value.scanned, status, evidence.evidence_id]);
    await audit(client, requester, status === "MATCHED" ? AUDIT_ACTIONS.BARCODE_VERIFICATION_SUCCEEDED : AUDIT_ACTIONS.BARCODE_VERIFICATION_FAILED,
      session, { result: status, tracking_number: evidence.registered_tracking_number }, evidence);
    // No lookup of the submitted barcode outside this session, even on mismatch.
    return { ...await details(client, session), barcode_result: status };
  });
}

async function removePhoto(filename) {
  if (!filename || !/^[0-9a-f-]{36}\.(jpg|png)$/.test(filename)) return;
  try { await unlink(path.join(COLLECTION_PHOTO_DIR, filename)); }
  catch (error) { if (error.code !== "ENOENT") console.error("Collection photo cleanup failed; private file requires cleanup."); }
}

export async function saveCollectionPhoto({ requester, sessionId, parcelId, file }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  const validation = await validateCollectionPhoto(file);
  if (validation.error) return validation;
  let written, replaced;
  try {
    const result = await transaction(async (client) => {
      const loaded = await loadSession(client, sessionId, requester, { residentOnly: true });
      if (loaded.error) return loaded;
      const session = loaded.session, inactive = activeError(session);
      if (inactive) return inactive;
      const found = await parcelEvidence(client, sessionId, parcelId);
      if (found.error) return found;
      const evidence = found.evidence;
      if (evidence.photo_sha256 === validation.digest) return details(client, session);
      const filename = `${randomUUID()}.${validation.extension}`;
      await mkdir(COLLECTION_PHOTO_DIR, { recursive: true, mode: 0o700 });
      await writeFile(path.join(COLLECTION_PHOTO_DIR, filename), file.buffer, { flag: "wx", mode: 0o600 });
      written = filename;
      await client.query(`UPDATE collection_verification_evidence SET photo_filename = $1, photo_mime_type = $2,
        photo_size = $3, photo_sha256 = $4, photo_uploaded_at = clock_timestamp() WHERE evidence_id = $5`,
      [filename, validation.mime, validation.size, validation.digest, evidence.evidence_id]);
      await audit(client, requester, evidence.photo_filename ? AUDIT_ACTIONS.COLLECTION_PHOTO_REPLACED : AUDIT_ACTIONS.COLLECTION_PHOTO_UPLOADED,
        session, { tracking_number: evidence.registered_tracking_number }, evidence);
      replaced = evidence.photo_filename;
      return details(client, session);
    });
    if (result.error) await removePhoto(written);
    else await removePhoto(replaced);
    return result;
  } catch (error) { await removePhoto(written); throw error; }
}

export async function getCollectionPhoto({ requester, sessionId, parcelId }) {
  return transaction(async (client) => {
    const loaded = await loadSession(client, sessionId, requester);
    if (loaded.error) return loaded;
    const found = await parcelEvidence(client, sessionId, parcelId);
    if (found.error) return found;
    if (!found.evidence.photo_filename || !/^[0-9a-f-]{36}\.(jpg|png)$/.test(found.evidence.photo_filename)) return { error: "PHOTO_REQUIRED" };
    return { file: { filename: found.evidence.photo_filename, mime: found.evidence.photo_mime_type } };
  });
}

export async function cancelCollectionVerification({ requester, sessionId }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  return transaction(async (client) => {
    const loaded = await loadSession(client, sessionId, requester, { residentOnly: true });
    if (loaded.error) return loaded;
    const session = loaded.session;
    if (session.status === "CANCELLED") return details(client, session);
    const inactive = activeError(session);
    if (inactive) return inactive;
    await client.query("UPDATE collection_verification_sessions SET status = 'CANCELLED', cancelled_at = clock_timestamp() WHERE session_id = $1", [sessionId]);
    await client.query("UPDATE parcel_collections SET collection_status = 'CANCELLED' WHERE collection_id = $1 AND collection_status = 'VERIFYING'", [session.collection_id]);
    await client.query("DELETE FROM collection_verification_reservations WHERE session_id = $1", [sessionId]);
    await audit(client, requester, AUDIT_ACTIONS.COLLECTION_VERIFICATION_CANCELLED, session);
    return details(client, { ...session, status: "CANCELLED", cancelled_at: (await client.query("SELECT cancelled_at FROM collection_verification_sessions WHERE session_id = $1", [sessionId])).rows[0].cancelled_at });
  });
}

export async function confirmCollectionVerification({ requester, sessionId }) {
  if (requester?.role !== "RESIDENT") return { error: "FORBIDDEN" };
  return transaction(async (client) => {
    const loaded = await loadSession(client, sessionId, requester, { residentOnly: true });
    if (loaded.error) return loaded;
    const session = loaded.session;
    if (session.status === "COMPLETED") return { ...await details(client, session), already_completed: true };
    const inactive = activeError(session);
    if (inactive) return inactive;
    const collection = (await client.query("SELECT * FROM parcel_collections WHERE collection_id = $1 FOR UPDATE", [session.collection_id])).rows[0];
    if (!collection || collection.collection_status !== "VERIFYING" || collection.resident_id !== requester.user_id) return { error: "SESSION_INACTIVE" };
    const items = (await client.query("SELECT parcel_id FROM parcel_collection_items WHERE collection_id = $1 ORDER BY parcel_id", [session.collection_id])).rows;
    const evidence = (await client.query("SELECT * FROM collection_verification_evidence WHERE session_id = $1 ORDER BY parcel_id FOR UPDATE", [sessionId])).rows;
    if (!items.length || items.length !== evidence.length || items.some((item, i) => item.parcel_id !== evidence[i].parcel_id)) return { error: "COLLECTION_PARCEL_INVALID" };
    const ids = items.map((item) => item.parcel_id);
    const parcels = (await client.query("SELECT * FROM parcels WHERE parcel_id = ANY($1::uuid[]) ORDER BY parcel_id FOR UPDATE", [ids])).rows;
    const reservations = (await client.query("SELECT parcel_id FROM collection_verification_reservations WHERE session_id = $1 ORDER BY parcel_id", [sessionId])).rows;
    if (parcels.length !== ids.length || reservations.length !== ids.length || reservations.some((item, i) => item.parcel_id !== ids[i])) return { error: "PARCEL_STATE_CHANGED" };
    if (parcels.some((p, i) => p.deleted_at || p.unit_id !== session.unit_id || p.status !== "PENDING_COLLECTION"
      || p.tracking_number !== evidence[i].registered_tracking_number)) return { error: "PARCEL_CHANGED" };
    if (evidence.some((e) => e.barcode_status !== "MATCHED" || !trackingMatches(e.scanned_tracking_number, e.registered_tracking_number) || !e.photo_filename)) return { error: "REQUIREMENTS_MISSING" };
    for (const item of evidence) {
      if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(item.photo_filename)) return { error: "PHOTO_UNAVAILABLE" };
      let content;
      try { content = await readFile(path.join(COLLECTION_PHOTO_DIR, item.photo_filename)); }
      catch { return { error: "PHOTO_UNAVAILABLE" }; }
      const photo = await validateCollectionPhoto({ buffer: content, mimetype: item.photo_mime_type });
      if (photo.error || photo.digest !== item.photo_sha256 || photo.size !== item.photo_size) return { error: "PHOTO_UNAVAILABLE" };
    }
    // File checks can take time; recheck the server clock immediately before any final state changes.
    if ((await client.query("SELECT expires_at <= clock_timestamp() AS expired FROM collection_verification_sessions WHERE session_id = $1", [sessionId])).rows[0].expired) {
      await expireDue(client);
      return { error: "SESSION_EXPIRED" };
    }
    const collected = await client.query(`UPDATE parcels SET status = 'COLLECTED', collected_at = clock_timestamp()
      WHERE parcel_id = ANY($1::uuid[]) RETURNING parcel_id, tracking_number, collected_at`, [ids]);
    await client.query("UPDATE parcel_collections SET collection_status = 'USED', collected_at = clock_timestamp() WHERE collection_id = $1", [session.collection_id]);
    const completed = (await client.query(`UPDATE collection_verification_sessions SET status = 'COMPLETED',
      confirmed_at = clock_timestamp(), completed_at = clock_timestamp() WHERE session_id = $1 RETURNING *`, [sessionId])).rows[0];
    await client.query("DELETE FROM collection_verification_reservations WHERE session_id = $1", [sessionId]);
    await audit(client, requester, AUDIT_ACTIONS.RESIDENT_COLLECTION_CONFIRMED, session, { guard_id: session.guard_id, parcel_count: ids.length });
    for (const parcel of evidence) await audit(client, requester, AUDIT_ACTIONS.PARCEL_COLLECTED, session,
      { guard_id: session.guard_id, tracking_number: parcel.registered_tracking_number }, parcel);
    await audit(client, requester, AUDIT_ACTIONS.COLLECTION_COMPLETED, session, { guard_id: session.guard_id, parcel_count: ids.length });
    return { ...await details(client, completed), message: "Collection confirmed successfully.",
      collection: { collection_id: session.collection_id, verified_by: session.guard_id,
        confirmed_by: requester.user_id, collected_at: completed.completed_at, parcel_count: ids.length, parcels: collected.rows },
      realtime: { recipient_user_id: requester.user_id, event: "collection:completed",
        payload: { collection_id: session.collection_id, session_id: sessionId, parcel_ids: ids, collected_at: completed.completed_at } } };
  });
}
