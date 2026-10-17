import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { validateParcelRoomId } from '../utils/parcelRoomValidation.js';
import { validateAdminOperationsFilters } from '../utils/adminOperations.js';
import { persistNotification, deliverPersistedNotification } from './notification.service.js';
import { AUDIT_ACTIONS, recordAuditLog } from './audit.service.js';

const LIMIT = 5;
const pending = "p.status IN ('PENDING', 'PENDING_COLLECTION')";
const overdue = `(${pending} AND p.collection_deadline < NOW())`;
const roomFilter = (parameter) => `(${parameter}::text IS NULL OR (${parameter} = 'unassigned' AND p.parcel_room_id IS NULL) OR p.parcel_room_id::text = ${parameter})`;
const hourLabel = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;

export async function getAdminOperations({ requester, filters = {} }) {
  if (requester?.role !== 'ADMIN') return { error: 'FORBIDDEN' };
  const validation = validateAdminOperationsFilters(filters);
  if (validation.error) return validation;
  const config = validation.value, client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const asOf = (await client.query('SELECT NOW() AS as_of')).rows[0].as_of;
    // Re-anchor today's boundaries to the same database clock as the operational counts.
    const today = validateAdminOperationsFilters({}, new Date(asOf)).value.today;
    const rooms = (await client.query('SELECT id, name, is_active FROM parcel_rooms ORDER BY LOWER(name), id')).rows;
    for (const id of [config.summary_room_id, config.attention_room_id]) {
      if (id && id !== 'unassigned' && !rooms.some((room) => room.id === id)) { await client.query('ROLLBACK'); return { error: 'ROOM_NOT_FOUND' }; }
    }
    const summary = (await client.query(`SELECT
      COUNT(*) FILTER (WHERE p.created_at >= $1 AND p.created_at < $2)::int AS received_today,
      COUNT(*) FILTER (WHERE p.status = 'COLLECTED' AND p.collected_at >= $1 AND p.collected_at < $2)::int AS collected_today,
      COUNT(*) FILTER (WHERE ${pending})::int AS awaiting_collection,
      COUNT(*) FILTER (WHERE ${overdue})::int AS overdue,
      COUNT(*) FILTER (WHERE ${pending} AND p.collection_deadline < NOW() - INTERVAL '60 days')::int AS overdue_over_60_days
      FROM parcels p WHERE p.deleted_at IS NULL AND ${roomFilter('$3')}`, [today.start, today.end, config.summary_room_id])).rows[0];
    const attention = (await client.query(`WITH matches AS (
      SELECT p.parcel_id, p.tracking_number, p.created_at, p.collection_deadline,
        u.full_unit_code AS unit_reference, c.courier_name, r.name AS parcel_room_name,
        resident.user_id AS resident_id, resident.status AS resident_status, NULLIF(BTRIM(CONCAT_WS(' ', resident.first_name, resident.last_name)), '') AS resident_name,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400)::int AS age_days,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - p.collection_deadline)) / 86400)::int AS overdue_days,
        TRUE AS flagged_for_attention,
        reminder.last_reminded_at,
        (reminder.last_resident_reminded_at + INTERVAL '24 hours') AS next_reminder_at,
        (resident.user_id IS NOT NULL AND resident.status <> 'DEACTIVATED' AND
          (reminder.last_resident_reminded_at IS NULL OR reminder.last_resident_reminded_at <= NOW() - INTERVAL '24 hours')) AS reminder_available
      FROM parcels p JOIN units u ON u.unit_id = p.unit_id JOIN courier_companies c ON c.courier_id = p.courier_id
      LEFT JOIN parcel_rooms r ON r.id = p.parcel_room_id
      LEFT JOIN users resident ON resident.unit_id = p.unit_id AND resident.role = 'RESIDENT'
      LEFT JOIN LATERAL (SELECT MAX(n.created_at) AS last_reminded_at,
        MAX(n.created_at) FILTER (WHERE n.recipient_user_id = resident.user_id) AS last_resident_reminded_at FROM notifications n
        WHERE n.related_parcel_id = p.parcel_id AND n.type = 'PARCEL_OVERDUE') reminder ON TRUE
      WHERE p.deleted_at IS NULL AND ${overdue} AND p.created_at <= NOW() - INTERVAL '30 days' AND ${roomFilter('$1')}
        AND ($2::text = '' OR p.tracking_number ILIKE '%' || $2 || '%' OR u.full_unit_code ILIKE '%' || $2 || '%'
          OR CONCAT_WS(' ', resident.first_name, resident.last_name) ILIKE '%' || $2 || '%')
    ), page AS (SELECT * FROM matches ORDER BY collection_deadline, created_at, parcel_id LIMIT $3 OFFSET $4)
    SELECT (SELECT COUNT(*)::int FROM matches) AS total,
      COALESCE(jsonb_agg(to_jsonb(page) ORDER BY collection_deadline, created_at, parcel_id), '[]'::jsonb) AS items FROM page`,
    [config.attention_room_id, config.attention_search, LIMIT, (config.attention_page - 1) * LIMIT])).rows[0];
    const roomCounts = (await client.query(`WITH room_keys AS (SELECT id, name, is_active FROM parcel_rooms
      UNION ALL SELECT NULL::uuid, 'Not Assigned', NULL::boolean)
      SELECT k.id AS parcel_room_id, k.name AS parcel_room_name, k.is_active,
        COUNT(p.parcel_id) FILTER (WHERE NOT COALESCE(p.collection_deadline < NOW(), FALSE))::int AS pending,
        COUNT(p.parcel_id) FILTER (WHERE p.collection_deadline < NOW())::int AS overdue,
        COUNT(p.parcel_id)::int AS total FROM room_keys k
      LEFT JOIN parcels p ON p.parcel_room_id IS NOT DISTINCT FROM k.id AND p.deleted_at IS NULL AND ${pending}
      GROUP BY k.id, k.name, k.is_active ORDER BY COUNT(p.parcel_id) DESC, LOWER(k.name), k.id`)).rows;
    const disputeSummary = (await client.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'IN_REVIEW_ADMIN')::int AS in_review_admin,
      COUNT(*) FILTER (WHERE status = 'ESCALATED')::int AS escalated,
      COUNT(*) FILTER (WHERE status = 'IN_REVIEW_ADMIN' AND assigned_staff_user_id = $1)::int AS my_review,
      COUNT(*) FILTER (WHERE status <> 'RESOLVED' AND created_at < NOW() - INTERVAL '7 days')::int AS unresolved_over_7_days,
      COUNT(*) FILTER (WHERE status <> 'RESOLVED' AND created_at <= NOW() - INTERVAL '7 days')::int AS older_than_week_total
      FROM disputes WHERE deleted_at IS NULL`, [requester.user_id])).rows[0];
    const actionItems = (await client.query(`WITH actionable AS (
      SELECT d.dispute_id, d.dispute_reference, d.issue_type, d.status, d.created_at,
        GREATEST(d.updated_at, COALESCE((SELECT MAX(dm.created_at) FROM dispute_messages dm WHERE dm.dispute_id = d.dispute_id), d.updated_at)) AS latest_activity_at,
        u.full_unit_code AS unit_reference,
        jsonb_build_object('tracking_number', p.tracking_number, 'courier_name', c.courier_name, 'unit_full_code', u.full_unit_code) AS parcel,
        CASE WHEN d.status = 'IN_REVIEW_ADMIN' AND assigned.user_id IS NOT NULL THEN
          jsonb_build_object('user_id', assigned.user_id, 'name', NULLIF(BTRIM(CONCAT_WS(' ', assigned.first_name, assigned.last_name)), ''), 'role', assigned.role)
          ELSE NULL END AS assigned_handler,
        (SELECT COUNT(*)::int FROM dispute_evidence de WHERE de.dispute_id = d.dispute_id) AS evidence_count
      FROM disputes d JOIN parcels p ON p.parcel_id = d.parcel_id JOIN units u ON u.unit_id = p.unit_id
      JOIN courier_companies c ON c.courier_id = p.courier_id LEFT JOIN users assigned ON assigned.user_id = d.assigned_staff_user_id
      WHERE d.deleted_at IS NULL AND (d.status = 'ESCALATED' OR (d.status = 'IN_REVIEW_ADMIN' AND d.assigned_staff_user_id = $1))
    ) SELECT * FROM actionable ORDER BY latest_activity_at, created_at, dispute_id LIMIT 5`, [requester.user_id])).rows;
    const oldest = (await client.query(`SELECT d.dispute_id, d.dispute_reference, d.issue_type, d.status, d.created_at,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 86400)::int AS age_days, u.full_unit_code AS unit_reference
      FROM disputes d JOIN parcels p ON p.parcel_id = d.parcel_id JOIN units u ON u.unit_id = p.unit_id
      WHERE d.deleted_at IS NULL AND d.status <> 'RESOLVED' AND d.created_at <= NOW() - INTERVAL '7 days'
      ORDER BY d.created_at, d.dispute_id LIMIT 5`)).rows;
    const issueTypes = (await client.query(`SELECT issue_type, COUNT(*)::int AS count FROM disputes
      WHERE deleted_at IS NULL AND created_at >= $1 AND created_at < $2 GROUP BY issue_type ORDER BY COUNT(*) DESC, issue_type`, [config.dispute.start, config.dispute.end])).rows;
    const accounts = (await client.query(`SELECT COUNT(*) FILTER (WHERE role = 'RESIDENT')::int AS resident_pending_activation,
      COUNT(*) FILTER (WHERE role = 'GUARD')::int AS guard_pending_activation
      FROM users WHERE status = 'PENDING_ACTIVATION' AND role IN ('RESIDENT', 'GUARD')`)).rows[0];
    const globalOver60 = (await client.query(`SELECT COUNT(*)::int AS count FROM parcels p
      WHERE p.deleted_at IS NULL AND ${pending} AND p.collection_deadline < NOW() - INTERVAL '60 days'`)).rows[0].count;
    const part = config.trend_group === 'hour' ? 'hour' : 'isodow';
    const trend = (await client.query(`WITH events AS (
      SELECT p.created_at AS occurred_at, 'received' AS kind FROM parcels p
        WHERE p.deleted_at IS NULL AND p.created_at >= $1 AND p.created_at < $2
      UNION ALL SELECT p.collected_at, 'collected' FROM parcels p WHERE p.deleted_at IS NULL AND p.status = 'COLLECTED'
        AND p.collected_at >= $1 AND p.collected_at < $2)
      SELECT EXTRACT(${part} FROM occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS bucket,
        COUNT(*) FILTER (WHERE kind = 'received')::int AS received, COUNT(*) FILTER (WHERE kind = 'collected')::int AS collected
      FROM events GROUP BY bucket ORDER BY bucket`, [config.trend.start, config.trend.end])).rows;
    const unknownTimes = (await client.query("SELECT COUNT(*)::int AS count FROM parcels WHERE deleted_at IS NULL AND status = 'COLLECTED' AND collected_at IS NULL")).rows[0].count;
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const buckets = Array.from({ length: config.trend_group === 'hour' ? 24 : 7 }, (_, index) => {
      const bucket = config.trend_group === 'hour' ? index : index + 1, row = trend.find((item) => item.bucket === bucket);
      return { index: bucket, label: config.trend_group === 'hour' ? hourLabel(bucket) : weekdays[index], received: row?.received || 0, collected: row?.collected || 0 };
    });
    await client.query('COMMIT');
    return { as_of: asOf, today: today.from, rooms, parcel_summary: summary,
      attention: { items: attention.items, flag_after_days: 30, pagination: { page: config.attention_page, limit: LIMIT, total: attention.total, total_pages: Math.ceil(attention.total / LIMIT) } },
      uncollected_by_room: roomCounts,
      disputes: { ...disputeSummary, action_total: disputeSummary.escalated + disputeSummary.my_review, action_items: actionItems, oldest_unresolved: oldest, issue_types: issueTypes, issue_range: { from: config.dispute.from, to: config.dispute.to } }, accounts,
      important_alerts: { parcels_overdue_over_60_days: globalOver60, disputes_unresolved_over_7_days: disputeSummary.unresolved_over_7_days, ...accounts },
      peak_activity: { group: config.trend_group, from: config.trend.from, to: config.trend.to, buckets, collection_time_unknown: unknownTimes } };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function sendAdminParcelReminder({ requester, parcelId }) {
  if (requester?.role !== 'ADMIN') return { error: 'FORBIDDEN' };
  const validation = validateParcelRoomId(parcelId);
  if (validation.error) return { error: 'INVALID_PARCEL_ID' };
  const client = await pool.connect(); let envelope;
  try {
    await client.query('BEGIN');
    // Serializing on the parcel prevents concurrent reminders and collection races.
    const parcel = (await client.query(`SELECT p.parcel_id, p.unit_id, p.tracking_number, p.status,
      (${overdue}) AS is_overdue, c.courier_name, r.name AS parcel_room_name FROM parcels p
      JOIN courier_companies c ON c.courier_id = p.courier_id LEFT JOIN parcel_rooms r ON r.id = p.parcel_room_id
      WHERE p.parcel_id = $1 AND p.deleted_at IS NULL FOR UPDATE OF p`, [validation.parcelRoomId])).rows[0];
    if (!parcel) { await client.query('ROLLBACK'); return { error: 'PARCEL_NOT_FOUND' }; }
    if (!parcel.is_overdue) { await client.query('ROLLBACK'); return { error: 'PARCEL_NOT_OVERDUE' }; }
    const resident = (await client.query("SELECT user_id FROM users WHERE unit_id = $1 AND role = 'RESIDENT' AND status <> 'DEACTIVATED' FOR SHARE", [parcel.unit_id])).rows[0];
    if (!resident) { await client.query('ROLLBACK'); return { error: 'RESIDENT_UNAVAILABLE' }; }
    const recent = (await client.query(`SELECT created_at + INTERVAL '24 hours' AS next_reminder_at FROM notifications
      WHERE related_parcel_id = $1 AND recipient_user_id = $2 AND type = 'PARCEL_OVERDUE' AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC LIMIT 1`, [parcel.parcel_id, resident.user_id])).rows[0];
    if (recent) { await client.query('ROLLBACK'); return { error: 'REMINDER_RECENTLY_SENT', next_reminder_at: recent.next_reminder_at }; }
    envelope = await persistNotification({ client, recipientUserId: resident.user_id, type: 'PARCEL_OVERDUE', title: 'Parcel collection reminder',
      message: `Your ${parcel.courier_name} parcel (${parcel.tracking_number}) is overdue. Please collect it${parcel.parcel_room_name ? ` from ${parcel.parcel_room_name}` : ''}.`,
      relatedParcelId: parcel.parcel_id, deduplicationKey: `parcel-manual-overdue:${parcel.parcel_id}:${randomUUID()}` });
    if (!envelope) { await client.query('ROLLBACK'); return { error: 'RESIDENT_UNAVAILABLE' }; }
    await recordAuditLog({ client, actor: requester, action: AUDIT_ACTIONS.PARCEL_REMINDER_SENT, entityType: 'PARCEL', entityId: parcel.parcel_id,
      entityReference: parcel.tracking_number, description: `Collection reminder sent for parcel ${parcel.tracking_number}.`, metadata: { tracking_number: parcel.tracking_number, recipient_user_id: resident.user_id, parcel_room_name: parcel.parcel_room_name } });
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const delivery = await deliverPersistedNotification(envelope);
  return { notification_id: envelope.notification.notification_id, next_reminder_at: new Date(new Date(envelope.notification.created_at).getTime() + 86400000).toISOString(), delivery };
}
