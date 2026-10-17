import { getAdminAnalytics } from '../services/adminAnalytics.service.js';
import { generateAnalyticsReport } from '../services/analyticsReport.service.js';

const errors = {
  FORBIDDEN: [403, 'Analytics and reports are available only to Admin.'],
  INVALID_DATE_RANGE: [400, 'Choose valid dates up to today, covering no more than 366 days.'],
  INVALID_GROUP: [400, 'Choose daily, weekly or monthly totals.'],
  INVALID_ROOM: [400, 'Choose a valid parcel room.'],
  ROOM_NOT_FOUND: [404, 'The selected parcel room no longer exists.'],
  INVALID_REPORT_TYPE: [400, 'Choose a full, parcel, dispute or system report.']
};
function error(res, result) {
  const [status, message] = errors[result.error] || [500, 'Unable to load analytics.'];
  return res.status(status).json({ message });
}
export async function getAnalytics(req, res) {
  const result = await getAdminAnalytics({ requester: req.user, filters: req.query });
  res.set('Cache-Control', 'private, no-store');
  return result.error ? error(res, result) : res.json(result);
}
export async function exportAnalytics(req, res) {
  const result = await generateAnalyticsReport({ requester: req.user, filters: req.query });
  if (result.error) return error(res, result);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'private, no-store' });
  return res.send(result.content);
}
