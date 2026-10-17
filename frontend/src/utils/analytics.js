import { malaysiaToday, shiftDashboardDate } from './adminDashboard.js';

export const ANALYTICS_PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['custom', 'Custom']];
export const ANALYTICS_REPORTS = [['full', 'Full analytics report'], ['parcels', 'Parcel report'], ['disputes', 'Dispute report'], ['system', 'System summary']];
export function analyticsRange(preset, today = malaysiaToday()) {
  return { from: preset === 'month' ? today.slice(0, 8) + '01' : shiftDashboardDate(today, preset === '7' ? -6 : -29), to: today };
}
export function validAnalyticsRange(from, to, today = malaysiaToday()) {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + 'T00:00:00Z').getTime()) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  return valid(from) && valid(to) && from <= to && to <= today && (new Date(to) - new Date(from)) / 86400000 < 366;
}
export const analyticsNumber = value => Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 1 });
export function analyticsDuration(value) {
  if (value === null || value === undefined) return 'Not recorded';
  const amount = value < 24 ? value : value / 24, unit = value < 24 ? 'hour' : 'day';
  return analyticsNumber(amount) + ' ' + unit + (Math.round(amount * 10) / 10 === 1 ? '' : 's');
}
export function analyticsScale(values, count = true) {
  const max = Math.max(count ? 4 : 1, ...values.filter(value => value !== null).map(Number));
  const raw = max / 4, base = 10 ** Math.floor(Math.log10(raw));
  const chosen = [1, 2, 2.5, 5, 10].find(value => value * base >= raw) * base;
  const step = Math.max(count ? 1 : .1, count ? Math.ceil(chosen) : chosen);
  const ceiling = Math.ceil(max / step) * step;
  return { ceiling, ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step) };
}
