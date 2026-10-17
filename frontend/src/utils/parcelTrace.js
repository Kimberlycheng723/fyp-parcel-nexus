export const OBSERVATIONS = Object.freeze({
  COLOUR: 'Parcel colour appears consistent', SHAPE: 'Parcel shape appears consistent',
  LABEL: 'Label placement appears consistent', TRACKING: 'Visible tracking number appears consistent',
  PACKAGING: 'Packaging appears consistent', MARKS: 'Distinctive marks appear consistent', INCONCLUSIVE: 'Evidence is inconclusive'
});
export function traceQuery(filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  return query.toString();
}
export function traceSearchTarget(data) {
  const parcels = data?.parcels;
  const total = Number(data?.pagination?.total);
  if (!Array.isArray(parcels) || !Number.isInteger(total) || total < parcels.length || total < 0) {
    throw new Error('Unable to read the search result. Please try again.');
  }
  if (total > 1) {
    throw new Error('More than one parcel uses this tracking number. Open Parcel Trace from the correct linked dispute to avoid investigating the wrong parcel.');
  }
  if (total === 0) return null;
  const id = parcels[0]?.parcel_id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Unable to read the search result. Please try again.');
  }
  return id;
}
export function traceLabel(value) {
  if (!value) return 'Not recorded';
  const labels = { UNDER_REVIEW: 'Under review', PENDING_COLLECTION: 'Waiting for collection',
    AWAITING_VERIFICATION: 'Waiting for collection check', USED: 'Collection completed', COMPLETED: 'Collection completed',
    VERIFYING: 'Collection being checked', CANCELLED: 'Collection cancelled', EXPIRED: 'Collection request expired',
    MISMATCHED: 'Tracking numbers differ', MATCHED: 'Tracking number matched', UNREADABLE: 'Tracking number could not be read' };
  return labels[value] || String(value).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function traceTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
export function traceDay(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
