import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsRange, validAnalyticsRange, analyticsScale, analyticsDuration } from '../src/utils/analytics.js';

test('analytics presets include today and use calendar dates across months and leap days', () => {
  assert.deepEqual(analyticsRange('30', '2026-10-16'), { from: '2026-09-17', to: '2026-10-16' });
  assert.deepEqual(analyticsRange('7', '2024-03-01'), { from: '2024-02-24', to: '2024-03-01' });
  assert.deepEqual(analyticsRange('month', '2026-10-16'), { from: '2026-10-01', to: '2026-10-16' });
});
test('analytics dates reject impossible, future, reversed and overly long ranges', () => {
  assert.equal(validAnalyticsRange('2026-10-01', '2026-10-16', '2026-10-16'), true);
  for (const [from, to] of [['2026-02-30','2026-03-01'],['2026-10-17','2026-10-18'],['2026-10-16','2026-10-01'],['2020-01-01','2026-10-16'],['','2026-10-16']]) assert.equal(validAnalyticsRange(from,to,'2026-10-16'), false);
});
test('charts use whole parcel counts; absent timing is not zero', () => {
  assert.ok(analyticsScale([0,1,2]).ticks.every(Number.isInteger));
  assert.ok(analyticsScale([null,.2,.4],false).ceiling >= .4);
  assert.equal(analyticsDuration(null), 'Not recorded');
  assert.equal(analyticsDuration(0), '0 hours');
  assert.equal(analyticsDuration(48), '2 days');
  assert.equal(analyticsDuration(24), '1 day');
  assert.equal(analyticsDuration(1), '1 hour');
});
