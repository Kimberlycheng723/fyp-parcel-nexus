import { pool } from "../db/pool.js";
import { AUDIT_ACTIONS, recordAuditLog } from "./audit.service.js";
import { validateParcelRoomId, validateParcelRoomInput } from "../utils/parcelRoomValidation.js";

const ROOM_COLUMNS = "id, name, description, is_active, created_at, updated_at";
const canRead = (requester) => ["ADMIN", "GUARD"].includes(requester?.role);
const canWrite = (requester) => requester?.role === "ADMIN" && Boolean(requester.user_id);

export async function listParcelRooms({ requester, activeOnly = false }) {
  if (!canRead(requester)) return { error: "FORBIDDEN" };
  const result = await pool.query(`SELECT ${ROOM_COLUMNS} FROM parcel_rooms
    ${activeOnly ? "WHERE is_active = TRUE" : ""} ORDER BY LOWER(name), id`);
  return { parcel_rooms: result.rows };
}

export async function getParcelRoom({ requester, roomId }) {
  if (!canRead(requester)) return { error: "FORBIDDEN" };
  const validation = validateParcelRoomId(roomId);
  if (validation.error) return validation;
  const result = await pool.query(`SELECT ${ROOM_COLUMNS} FROM parcel_rooms WHERE id = $1`, [validation.parcelRoomId]);
  return result.rows[0] ? { parcel_room: result.rows[0] } : { error: "PARCEL_ROOM_NOT_FOUND" };
}

// SHARE prevents deactivation between validation and a parcel transaction's commit.
export async function getActiveParcelRoomForAssignment(roomId, client) {
  const result = await client.query(`SELECT id, name, is_active FROM parcel_rooms WHERE id = $1 FOR SHARE`, [roomId]);
  const room = result.rows[0];
  if (!room) return { error: "PARCEL_ROOM_NOT_FOUND" };
  if (!room.is_active) return { error: "PARCEL_ROOM_INACTIVE" };
  return { parcel_room: room };
}

export async function createParcelRoom({ requester, input }) {
  if (!canWrite(requester)) return { error: "FORBIDDEN" };
  const validation = validateParcelRoomInput(input);
  if (validation.error) return validation;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`INSERT INTO parcel_rooms (name, description) VALUES ($1, $2)
      RETURNING ${ROOM_COLUMNS}`, [validation.value.name, validation.value.description ?? null]);
    const room = result.rows[0];
    await recordAuditLog({ client, actor: requester, action: AUDIT_ACTIONS.PARCEL_ROOM_CREATED,
      entityType: "PARCEL_ROOM", entityId: room.id, entityReference: room.name,
      description: `Parcel room ${room.name} was created.`, metadata: { name: room.name, is_active: room.is_active } });
    await client.query("COMMIT");
    return { parcel_room: room };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "parcel_rooms_name_unique_idx") return { error: "PARCEL_ROOM_ALREADY_EXISTS" };
    throw error;
  } finally { client.release(); }
}

export async function updateParcelRoom({ requester, roomId, input, statusOnly = false }) {
  if (!canWrite(requester)) return { error: "FORBIDDEN" };
  const id = validateParcelRoomId(roomId);
  if (id.error) return id;
  let validation;
  if (statusOnly) {
    if (!input || Array.isArray(input) || typeof input !== "object"
      || Object.keys(input).some((key) => key !== "is_active")) return { error: "INVALID_PARCEL_ROOM_INPUT" };
    if (typeof input.is_active !== "boolean") return { error: "INVALID_PARCEL_ROOM_STATUS" };
    validation = { value: { is_active: input.is_active } };
  } else {
    validation = validateParcelRoomInput(input, { partial: true });
    if (validation.error) return validation;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query(`SELECT ${ROOM_COLUMNS} FROM parcel_rooms WHERE id = $1 FOR UPDATE`, [id.parcelRoomId])).rows[0];
    if (!current) { await client.query("ROLLBACK"); return { error: "PARCEL_ROOM_NOT_FOUND" }; }
    const next = { ...current, ...validation.value };
    const changes = {};
    for (const key of Object.keys(validation.value)) {
      if (current[key] !== next[key]) changes[key] = { before: current[key], after: next[key] };
    }
    if (Object.keys(changes).length === 0) { await client.query("COMMIT"); return { parcel_room: current }; }
    const result = await client.query(`UPDATE parcel_rooms SET name = $1, description = $2, is_active = $3
      WHERE id = $4 RETURNING ${ROOM_COLUMNS}`, [next.name, next.description, next.is_active, current.id]);
    const room = result.rows[0];
    const action = statusOnly
      ? (room.is_active ? AUDIT_ACTIONS.PARCEL_ROOM_ACTIVATED : AUDIT_ACTIONS.PARCEL_ROOM_DEACTIVATED)
      : AUDIT_ACTIONS.PARCEL_ROOM_UPDATED;
    await recordAuditLog({ client, actor: requester, action,
      entityType: "PARCEL_ROOM", entityId: room.id, entityReference: room.name,
      description: `Parcel room ${room.name} was ${statusOnly ? (room.is_active ? "activated" : "deactivated") : "updated"}.`,
      metadata: { name: room.name, changes } });
    await client.query("COMMIT");
    return { parcel_room: room };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "parcel_rooms_name_unique_idx") return { error: "PARCEL_ROOM_ALREADY_EXISTS" };
    throw error;
  } finally { client.release(); }
}
