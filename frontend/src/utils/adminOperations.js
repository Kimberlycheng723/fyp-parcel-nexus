export const ISSUE_LABELS = { MISSING_ITEM: 'Missing parcel', STOLEN: 'Suspected theft', DAMAGED: 'Damaged parcel', WRONG_RECIPIENT: 'Wrong unit / recipient' };
export const ISSUE_COLORS = { MISSING_ITEM: '#3260d7', STOLEN: '#9a82c4', DAMAGED: '#db6478', WRONG_RECIPIENT: '#d49a39' };
export function dashboardPendingSections(filters, applied, full = false) {
  const groups = { summary: ['summary_room_id'], disputes: ['dispute_from', 'dispute_to'], peak: ['trend_from', 'trend_to', 'trend_group'] };
  return Object.fromEntries(Object.entries(groups).map(([section, keys]) => [section, full || !applied || keys.some((key) => filters[key] !== applied[key])]));
}
export function validDashboardDates(from, to) {
  const start = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && from <= to && (end - start) / 86400000 < 366;
}
export function roomChartRows(rows, filter = 'ALL') {
  return rows.filter((row) => row.parcel_room_id && row.parcel_room_id !== 'unassigned').map((row) => ({ ...row, pending: filter === 'OVERDUE' ? 0 : Number(row.pending) || 0,
    overdue: filter === 'PENDING' ? 0 : Number(row.overdue) || 0 })).map((row) => ({ ...row, visible_total: row.pending + row.overdue }));
}
export function roomChartScale(rows) {
  const max = Math.max(1, ...rows.map((row) => row.visible_total));
  const target = max / 6, base = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(1, [1, 2, 5, 10].find((value) => value * base >= target) * base);
  const ceiling = Math.ceil((max + Math.max(1, max * .1)) / step) * step;
  return { ceiling, ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step) };
}
export function elapsedDays(value, asOf) {
  const days = (new Date(asOf).getTime() - new Date(value).getTime()) / 86400000;
  if (!Number.isFinite(days) || days < 0) return 'Not recorded';
  if (days < 1) return 'Under 1 day';
  const whole = Math.floor(days);
  return `${whole} ${whole === 1 ? 'day' : 'days'}`;
}
export function peakBucket(rows, field) {
  const best = rows.reduce((peak, row) => Number(row[field]) > Number(peak?.[field] || 0) ? row : peak, null);
  return best && Number(best[field]) > 0 ? best : null;
}
