const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function traceError(status, message) { const error = new Error(message); error.status = status; throw error; }
export function traceId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) traceError(400, 'A valid record ID is required.');
  return value;
}
export function traceTracking(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value))
    traceError(400, 'Enter a tracking number of 1 to 120 printable characters.');
  return value.trim();
}
export function tracePagination(query = {}) {
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
      traceError(400, 'Invalid pagination.');
    return Number(value);
  };
  return { page: integer(query.page, 1, 100000), limit: integer(query.limit, 20, 50) };
}
export function malaysiaDay(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function traceDates(query, registeredAt) {
  const from = query.from ?? malaysiaDay(registeredAt), to = query.to ?? malaysiaDay(Date.now());
  for (const value of [from, to]) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
      traceError(400, 'Use valid YYYY-MM-DD dates.');
  }
  if (from > to) traceError(400, 'Start date must not be after end date.');
  return { from, to };
}
export const INVESTIGATION_TRANSITIONS = Object.freeze({
  GUARD: { OPEN: ['UNDER_REVIEW'], UNDER_REVIEW: ['RESOLVED', 'ESCALATED'], RESOLVED: ['UNDER_REVIEW'] },
  ADMIN: { OPEN: ['UNDER_REVIEW', 'RESOLVED'], UNDER_REVIEW: ['RESOLVED'], ESCALATED: ['UNDER_REVIEW', 'RESOLVED'], RESOLVED: ['UNDER_REVIEW'] }
});
export const REVIEW_OBSERVATIONS = Object.freeze(['COLOUR', 'SHAPE', 'LABEL', 'TRACKING', 'PACKAGING', 'MARKS', 'INCONCLUSIVE']);
export function traceNote(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some((key) => !['content', 'observations', 'reviewed_evidence_id'].includes(key)))
    traceError(400, 'Provide only note content, observations and an optional reviewed evidence ID.');
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const observations = input.observations ?? [];
  if (!content || content.length > 4000 || /\x00/.test(content)) traceError(400, 'Notes must contain 1 to 4000 characters.');
  if (!Array.isArray(observations) || observations.length > REVIEW_OBSERVATIONS.length || observations.some((item) => !REVIEW_OBSERVATIONS.includes(item)))
    traceError(400, 'Invalid human review observations.');
  return { content, observations: [...new Set(observations)], evidenceId: input.reviewed_evidence_id ? traceId(input.reviewed_evidence_id) : null };
}
