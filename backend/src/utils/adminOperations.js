import { validateParcelRoomId } from './parcelRoomValidation.js';

const DAY = 86400000;
export function malaysiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dashboardDateRange(from, to) {
  if (!validDay(from) || !validDay(to) || from > to) return null;
  const start = new Date(`${from}T00:00:00+08:00`), end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + DAY);
  if (end - start > 366 * DAY) return null;
  return { from, to, start: start.toISOString(), end: end.toISOString() };
}
export function validateAdminOperationsFilters(filters = {}, now = new Date()) {
  const today = malaysiaDate(now), month = `${today.slice(0, 8)}01`;
  const value = {};
  for (const key of ['summary_room_id', 'attention_room_id']) {
    const room = filters[key];
    if (room === undefined || room === '') value[key] = null;
    else if (room === 'unassigned') value[key] = room;
    else {
      const validated = validateParcelRoomId(room);
      if (validated.error) return { error: 'INVALID_ROOM' };
      value[key] = validated.parcelRoomId;
    }
  }
  for (const key of ['dispute', 'trend']) {
    const range = dashboardDateRange(filters[`${key}_from`] ?? month, filters[`${key}_to`] ?? today);
    if (!range) return { error: 'INVALID_DATE_RANGE' };
    value[key] = range;
  }
  const page = filters.attention_page ?? 1;
  if (!['string', 'number'].includes(typeof page) || !Number.isInteger(Number(page)) || Number(page) < 1 || Number(page) > 100000) return { error: 'INVALID_PAGE' };
  value.attention_page = Number(page);
  const search = filters.attention_search ?? '';
  if (typeof search !== 'string' || search.length > 120 || /[\x00-\x1f\x7f]/.test(search)) return { error: 'INVALID_SEARCH' };
  value.attention_search = search.trim();
  value.trend_group = filters.trend_group ?? 'hour';
  if (!['hour', 'weekday'].includes(value.trend_group)) return { error: 'INVALID_TREND_GROUP' };
  value.today = dashboardDateRange(today, today);
  return { value };
}
