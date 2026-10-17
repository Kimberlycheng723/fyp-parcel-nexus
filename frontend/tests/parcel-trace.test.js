import test from 'node:test';
import assert from 'node:assert/strict';
import { traceDay, traceLabel, traceQuery, traceSearchTarget, traceTime, OBSERVATIONS } from '../src/utils/parcelTrace.js';

test('trace query uses exact server-side filter contract and omits empty values', () => {
  const query = new URLSearchParams(traceQuery({ from: '2026-10-01', to: '2026-10-13', page: 2, limit: 10, tracking_number: 'SPX +/123', unit: '', status: null }));
  assert.equal(query.get('tracking_number'), 'SPX +/123'); assert.equal(query.get('page'), '2'); assert.equal(query.has('unit'), false);
});
test('trace labels distinguish barcode attempts from session completion', () => {
  assert.equal(traceLabel('MISMATCHED'), 'Tracking numbers differ'); assert.equal(traceLabel('MATCHED'), 'Tracking number matched');
  assert.equal(traceLabel('USED'), 'Collection completed'); assert.equal(traceLabel('UNDER_REVIEW'), 'Under review');
});
test('trace timestamps and date windows use Malaysia time; missing dates remain unknown', () => {
  assert.equal(traceDay('2026-10-12T18:30:00Z'), '2026-10-13'); assert.match(traceTime('2026-10-12T18:30:00Z'), /13 Oct 2026, 02:30/);
  assert.equal(traceTime(null), 'Not recorded'); assert.equal(traceTime('invalid'), 'Not recorded');
});
test('review checklist contains human observations only', () => {
  assert.equal(Object.keys(OBSERVATIONS).length, 7); assert.ok(OBSERVATIONS.INCONCLUSIVE);
  assert.ok(!JSON.stringify(OBSERVATIONS).match(/similarity|automatic|score/i));
});
test('tracking search opens only one unambiguous parcel, using the backend total', () => {
  const parcel = { parcel_id: '11111111-1111-4111-8111-111111111111' };
  assert.equal(traceSearchTarget({ parcels: [parcel], pagination: { total: 1 } }), parcel.parcel_id);
  assert.equal(traceSearchTarget({ parcels: [], pagination: { total: 0 } }), null);
  assert.throws(() => traceSearchTarget({ parcels: [parcel], pagination: { total: 2 } }), /More than one parcel/);
  assert.throws(() => traceSearchTarget({ parcels: [parcel, parcel], pagination: { total: 2 } }), /More than one parcel/);
  assert.throws(() => traceSearchTarget({ parcels: [{}], pagination: { total: 1 } }), /Unable to read/);
  assert.throws(() => traceSearchTarget({}), /Unable to read/);
});
