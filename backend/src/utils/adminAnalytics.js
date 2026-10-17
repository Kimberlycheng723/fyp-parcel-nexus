import { dashboardDateRange, malaysiaDate } from './adminOperations.js';
import { validateParcelRoomId } from './parcelRoomValidation.js';

export const ANALYTICS_ISSUES = { DAMAGED: 'Damaged parcel', WRONG_RECIPIENT: 'Wrong unit / recipient', MISSING_ITEM: 'Missing parcel', STOLEN: 'Suspected theft' };
export const OVERDUE_BUCKETS = ['Under 3 days', '3-7 days', '8-30 days', '31-60 days', 'Over 60 days'];
export const RESOLUTION_BUCKETS = ['Under 1 day', '1-2 days', '3-6 days', '7-13 days', '14+ days'];
export const REPORT_TYPES = { full: 'Full Analytics Report', parcels: 'Parcel Report', disputes: 'Dispute Report', system: 'System Summary Report' };

export function validateAnalyticsFilters(filters = {}, now = new Date()) {
  const today = malaysiaDate(now);
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - 29);
  const range = dashboardDateRange(filters.from ?? start.toISOString().slice(0, 10), filters.to ?? today);
  if (!range || range.to > today) return { error: 'INVALID_DATE_RANGE' };
  const group = filters.group ?? 'day';
  if (!['day', 'week', 'month'].includes(group)) return { error: 'INVALID_GROUP' };
  let roomId = null;
  if (filters.room_id !== undefined && filters.room_id !== '') {
    const room = validateParcelRoomId(filters.room_id);
    if (room.error) return { error: 'INVALID_ROOM' };
    roomId = room.parcelRoomId;
  }
  return { value: { ...range, group, roomId, cutoff: new Date(Math.min(new Date(range.end).getTime(), now.getTime())).toISOString() } };
}

export function analyticsBuckets(from, to, group) {
  const cursor = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  if (group === 'week') cursor.setUTCDate(cursor.getUTCDate() - (cursor.getUTCDay() + 6) % 7);
  if (group === 'month') cursor.setUTCDate(1);
  const result = [];
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...(group === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) }).format(cursor);
    result.push({ key, label: group === 'week' ? 'Week of ' + label : label });
    if (group === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (group === 'week' ? 7 : 1));
  }
  return result;
}

export function fillAnalyticsBuckets(config, rows, fields, nullable = []) {
  const indexed = new Map(rows.map(row => [row.key, row]));
  return analyticsBuckets(config.from, config.to, config.group).map(bucket => {
    const row = indexed.get(bucket.key);
    return { ...bucket, ...Object.fromEntries(fields.map(field => [field, row?.[field] === null || row?.[field] === undefined ? nullable.includes(field) ? null : 0 : Number(row[field])])) };
  });
}
