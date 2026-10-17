import { pool } from '../db/pool.js';
import { ANALYTICS_ISSUES, fillAnalyticsBuckets, OVERDUE_BUCKETS, RESOLUTION_BUCKETS, validateAnalyticsFilters } from '../utils/adminAnalytics.js';

const scoped = "p.deleted_at IS NULL AND ($3::uuid IS NULL OR p.parcel_room_id = $3)";
const registered = 'p.created_at >= $1 AND p.created_at < $2 AND p.created_at <= $4';
const collected = "p.status = 'COLLECTED' AND p.collected_at >= $1 AND p.collected_at < $2 AND p.collected_at <= $4 AND p.collected_at >= p.created_at";
const groupKey = "TO_CHAR(date_trunc($5, occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD')";

export async function getAdminAnalytics({ requester, filters = {} }) {
  if (requester?.role !== 'ADMIN') return { error: 'FORBIDDEN' };
  const first = validateAnalyticsFilters(filters);
  if (first.error) return first;
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const asOf = (await client.query('SELECT NOW() AS as_of')).rows[0].as_of;
    const validation = validateAnalyticsFilters(filters, new Date(asOf));
    if (validation.error) { await client.query('ROLLBACK'); return validation; }
    const config = validation.value;
    const rooms = (await client.query('SELECT id, name, is_active FROM parcel_rooms ORDER BY LOWER(name), id')).rows;
    const room = rooms.find(item => item.id === config.roomId);
    if (config.roomId && !room) { await client.query('ROLLBACK'); return { error: 'ROOM_NOT_FOUND' }; }
    const params = [config.start, config.end, config.roomId, asOf];
    const parcelSummary = (await client.query(`SELECT
      COUNT(*) FILTER (WHERE ${registered})::int AS registered,
      COUNT(*) FILTER (WHERE ${collected})::int AS collected,
      COUNT(*) FILTER (WHERE ${registered} AND ${collected})::int AS cohort_collected,
      COUNT(*) FILTER (WHERE p.created_at < $2 AND p.created_at <= $4 AND p.status = 'COLLECTED' AND p.collected_at IS NULL)::int AS missing_collection_time
      FROM parcels p WHERE ${scoped}`, params)).rows[0];
    const events = (await client.query(`WITH events AS (
      SELECT p.created_at AS occurred_at, 'registered' AS kind FROM parcels p WHERE ${scoped} AND ${registered}
      UNION ALL SELECT p.collected_at, 'collected' FROM parcels p WHERE ${scoped} AND ${collected}
    ) SELECT ${groupKey} AS key, COUNT(*) FILTER (WHERE kind='registered')::int AS registered,
      COUNT(*) FILTER (WHERE kind='collected')::int AS collected FROM events GROUP BY key ORDER BY key`, [...params, config.group])).rows;
    const hours = (await client.query(`WITH events AS (
      SELECT p.created_at AS occurred_at, 'registered' AS kind FROM parcels p WHERE ${scoped} AND ${registered}
      UNION ALL SELECT p.collected_at, 'collected' FROM parcels p WHERE ${scoped} AND ${collected}
    ) SELECT EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::int AS hour,
      COUNT(*) FILTER (WHERE kind='registered')::int AS registered, COUNT(*) FILTER (WHERE kind='collected')::int AS collected
      FROM events GROUP BY hour ORDER BY hour`, params)).rows;
    // One first arrival notification per parcel avoids duplicate notifications inflating timing samples.
    const delays = (await client.query(`WITH samples AS (
      SELECT p.collected_at AS occurred_at, EXTRACT(EPOCH FROM (p.collected_at - n.arrived_at))/3600 AS hours
      FROM parcels p LEFT JOIN LATERAL (SELECT MIN(created_at) AS arrived_at FROM notifications
        WHERE related_parcel_id=p.parcel_id AND type='PARCEL_ARRIVAL' AND created_at >= p.created_at AND created_at <= p.collected_at) n ON TRUE
      WHERE ${scoped} AND ${collected}
    ) SELECT ${groupKey} AS key, AVG(hours)::float8 AS average_hours,
      COUNT(hours)::int AS samples, COUNT(*) FILTER (WHERE hours IS NULL)::int AS missing FROM samples GROUP BY key ORDER BY key`, [...params, config.group])).rows;
    const overdueRows = (await client.query(`WITH overdue AS (
      SELECT FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - p.collection_deadline))/86400)::int AS days FROM parcels p
      WHERE p.deleted_at IS NULL AND ($2::uuid IS NULL OR p.parcel_room_id=$2) AND p.created_at < $1 AND p.collection_deadline < $1
        AND (p.status IN ('PENDING','PENDING_COLLECTION') OR (p.status='COLLECTED' AND p.collected_at >= $1))
    ) SELECT CASE WHEN days < 3 THEN 0 WHEN days < 8 THEN 1 WHEN days < 31 THEN 2 WHEN days < 61 THEN 3 ELSE 4 END AS bucket,
      COUNT(*)::int AS count FROM overdue GROUP BY bucket ORDER BY bucket`, [config.cutoff, config.roomId])).rows;
    const disputeScope = "d.deleted_at IS NULL AND p.deleted_at IS NULL AND ($3::uuid IS NULL OR p.parcel_room_id=$3)";
    const reported = 'd.created_at >= $1 AND d.created_at < $2 AND d.created_at <= $4';
    const resolved = "d.status='RESOLVED' AND d.resolved_at >= $1 AND d.resolved_at < $2 AND d.resolved_at <= $4 AND d.resolved_at >= d.created_at";
    const disputeSummary = (await client.query(`SELECT COUNT(*) FILTER (WHERE ${reported})::int AS reported,
      COUNT(*) FILTER (WHERE ${resolved})::int AS resolved,
      COUNT(*) FILTER (WHERE d.created_at < LEAST($2::timestamptz,$4::timestamptz) AND (d.resolved_at IS NULL OR d.resolved_at >= LEAST($2::timestamptz,$4::timestamptz)))::int AS unresolved,
      AVG(EXTRACT(EPOCH FROM (d.resolved_at-d.created_at))/3600) FILTER (WHERE ${resolved})::float8 AS average_resolution_hours
      FROM disputes d JOIN parcels p ON p.parcel_id=d.parcel_id WHERE ${disputeScope}`, params)).rows[0];
    const issues = (await client.query(`SELECT d.issue_type, COUNT(*)::int AS count FROM disputes d JOIN parcels p ON p.parcel_id=d.parcel_id
      WHERE ${disputeScope} AND ${reported} GROUP BY d.issue_type ORDER BY count DESC, d.issue_type`, params)).rows;
    const resolutions = (await client.query(`WITH samples AS (
      SELECT EXTRACT(EPOCH FROM (d.resolved_at-d.created_at))/86400 AS days FROM disputes d JOIN parcels p ON p.parcel_id=d.parcel_id
      WHERE ${disputeScope} AND ${resolved}
    ) SELECT CASE WHEN days < 1 THEN 0 WHEN days < 3 THEN 1 WHEN days < 7 THEN 2 WHEN days < 14 THEN 3 ELSE 4 END AS bucket,
      COUNT(*)::int AS count FROM samples GROUP BY bucket ORDER BY bucket`, params)).rows;
    const system = (await client.query(`SELECT COUNT(*) FILTER (WHERE role='RESIDENT' AND status='ACTIVE')::int AS active_residents,
      COUNT(*) FILTER (WHERE role='GUARD' AND status='ACTIVE')::int AS active_guards,
      COUNT(*) FILTER (WHERE role='RESIDENT' AND status='PENDING_ACTIVATION')::int AS residents_awaiting_activation,
      COUNT(*) FILTER (WHERE role='GUARD' AND status='PENDING_ACTIVATION')::int AS guards_awaiting_activation FROM users`)).rows[0];
    await client.query('COMMIT');
    const hourRows = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, registered: hours.find(row => row.hour === hour)?.registered || 0 }));
    const collectionHours = Array.from({ length: 6 }, (_, index) => ({ label: `${String(index * 4).padStart(2, '0')}:00-${String((index + 1) * 4).padStart(2, '0')}:00`, count: hours.filter(row => Math.floor(row.hour / 4) === index).reduce((sum, row) => sum + row.collected, 0) }));
    const collectionRate = parcelSummary.registered ? Math.round(parcelSummary.cohort_collected / parcelSummary.registered * 1000) / 10 : null;
    const missingNotification = delays.reduce((sum, row) => sum + row.missing, 0);
    const sampleCount = delays.reduce((sum, row) => sum + row.samples, 0);
    const averageDelay = sampleCount ? delays.reduce((sum, row) => sum + (row.average_hours || 0) * row.samples, 0) / sampleCount : null;
    return {
      as_of: asOf, range: { from: config.from, to: config.to, cutoff: config.cutoff }, group: config.group, rooms,
      room: { id: config.roomId, name: room?.name || 'All Parcel Rooms' },
      parcel_summary: { ...parcelSummary, collection_rate: collectionRate, cohort_uncollected: parcelSummary.registered - parcelSummary.cohort_collected },
      registration_trend: fillAnalyticsBuckets(config, events, ['registered', 'collected']), registration_hours: hourRows,
      collection_hours: collectionHours, collection_delay: { average_hours: averageDelay, samples: sampleCount, missing_notification: missingNotification,
        series: fillAnalyticsBuckets(config, delays, ['average_hours', 'samples'], ['average_hours']) },
      overdue_duration: OVERDUE_BUCKETS.map((label, bucket) => ({ label, count: overdueRows.find(row => row.bucket === bucket)?.count || 0 })),
      dispute_summary: disputeSummary,
      dispute_issues: Object.entries(ANALYTICS_ISSUES).map(([issue_type, label]) => ({ issue_type, label, count: issues.find(row => row.issue_type === issue_type)?.count || 0 })).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label)),
      dispute_resolution: RESOLUTION_BUCKETS.map((label, bucket) => ({ label, count: resolutions.find(row => row.bucket === bucket)?.count || 0 })),
      system_summary: { ...system, active_rooms: rooms.filter(row => row.is_active).length, inactive_rooms: rooms.filter(row => !row.is_active).length }
    };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
