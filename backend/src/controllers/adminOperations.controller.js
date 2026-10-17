import { getAdminOperations, sendAdminParcelReminder } from '../services/adminOperations.service.js';

const errors = {
  FORBIDDEN: [403, 'Only Admin can use this dashboard.'], INVALID_ROOM: [400, 'Choose a valid parcel room.'], ROOM_NOT_FOUND: [404, 'The selected parcel room no longer exists.'],
  INVALID_DATE_RANGE: [400, 'Choose valid start and end dates, no more than 366 days apart.'], INVALID_PAGE: [400, 'Choose a valid page number.'],
  INVALID_SEARCH: [400, 'Search text must be no more than 120 characters.'], INVALID_TREND_GROUP: [400, 'Choose hour of day or day of week.'],
  INVALID_PARCEL_ID: [400, 'Choose a valid parcel.'], PARCEL_NOT_FOUND: [404, 'This parcel is no longer available.'],
  PARCEL_NOT_OVERDUE: [409, 'This parcel is no longer overdue. Refresh the dashboard.'], RESIDENT_UNAVAILABLE: [409, 'There is no available resident account for this unit.'],
  REMINDER_RECENTLY_SENT: [409, 'A reminder was sent within the last 24 hours.']
};
function respondError(res, result) {
  const [status, message] = errors[result.error] || [500, 'Unable to load dashboard data.'];
  return res.status(status).json({ message, ...(result.next_reminder_at ? { next_reminder_at: result.next_reminder_at } : {}) });
}
export async function getOperations(req, res) {
  const result = await getAdminOperations({ requester: req.user, filters: req.query });
  return result.error ? respondError(res, result) : res.json(result);
}
export async function sendReminder(req, res) {
  const result = await sendAdminParcelReminder({ requester: req.user, parcelId: req.params.parcelId });
  return result.error ? respondError(res, result) : res.status(201).json(result);
}
