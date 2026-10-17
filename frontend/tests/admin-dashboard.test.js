import assert from "node:assert/strict";
import test from "node:test";
import { adminRangeLabel, dashboardGreeting, malaysiaToday, parcelIconTone, roomCollectionRange, shiftDashboardDate } from "../src/utils/adminDashboard.js";
import { dashboardPendingSections, elapsedDays, peakBucket, roomChartRows, roomChartScale, validDashboardDates } from '../src/utils/adminOperations.js';

test('dashboard filters mark only their affected sections pending', () => {
  const applied = { summary_room_id: '', attention_room_id: '', attention_page: 1, attention_search: '', dispute_from: '2026-10-01', dispute_to: '2026-10-14', trend_from: '2026-10-08', trend_to: '2026-10-14', trend_group: 'hour' };
  assert.deepEqual(dashboardPendingSections({ ...applied, summary_room_id: 'room-a' }, applied), { summary: true, disputes: false, peak: false });
  assert.deepEqual(dashboardPendingSections({ ...applied, trend_group: 'weekday' }, applied), { summary: false, disputes: false, peak: true });
  assert.deepEqual(dashboardPendingSections(applied, null), { summary: true, disputes: true, peak: true });
  assert.deepEqual(dashboardPendingSections(applied, applied), { summary: false, disputes: false, peak: false });
});

test('room stacks keep pending and overdue separate and support both filters', () => {
  const rows = [{ parcel_room_id: 'room-a', pending: 4, overdue: 6 }];
  assert.equal(roomChartRows(rows)[0].visible_total, 10);
  assert.deepEqual([roomChartRows(rows, 'PENDING')[0].visible_total, roomChartRows(rows, 'OVERDUE')[0].visible_total], [4, 6]);
  assert.equal(rows[0].pending, 4);
});
test('room chart excludes unassigned parcels without changing source or summary data', () => {
  const rows = [{ parcel_room_id: null, pending: 80, overdue: 36 }, { parcel_room_id: 'room-a', pending: 3, overdue: 2 }, { parcel_room_id: 'unassigned', pending: 1, overdue: 0 }];
  for (const filter of ['ALL', 'PENDING', 'OVERDUE']) {
    assert.deepEqual(roomChartRows(rows, filter).map(row => row.parcel_room_id), ['room-a']);
  }
  assert.equal(rows.length, 3);
  assert.deepEqual(roomChartRows([rows[0]]), []);
  assert.deepEqual(roomChartRows([]), []);
});
test('room chart uses whole-number ticks and leaves space for bar-end totals', () => {
  for (const count of [0, 1, 4, 5, 13, 30, 36, 125, 10000]) {
    const { ceiling, ticks } = roomChartScale([{ visible_total: count }]);
    assert.ok(ceiling > count);
    assert.equal(ticks[0], 0);
    assert.equal(ticks.at(-1), ceiling);
    assert.ok(ticks.every(Number.isInteger));
    assert.ok(ticks.length <= 9);
  }
  assert.equal(roomChartScale(roomChartRows([{ parcel_room_id: null, pending: 1000 }, { parcel_room_id: 'a', pending: 4, overdue: 1 }])).ceiling, 6);
});
test('operational ages and peaks do not invent full days or peaks for empty data', () => {
  assert.equal(elapsedDays('2026-10-14T00:00:00Z', '2026-10-14T01:00:00Z'), 'Under 1 day');
  assert.equal(elapsedDays('2026-10-12T00:00:00Z', '2026-10-14T00:00:00Z'), '2 days');
  assert.equal(peakBucket([{ received: 0 }], 'received'), null);
  assert.equal(peakBucket([{ label: 'Morning', received: 1 }, { label: 'Afternoon', received: 4 }], 'received').label, 'Afternoon');
  assert.equal(validDashboardDates('2026-10-01', '2026-10-14'), true);
  assert.equal(validDashboardDates('2026-10-14', '2026-10-01'), false);
  assert.equal(validDashboardDates('2020-01-01', '2026-01-01'), false);
});

test("Admin dashboard dates follow Malaysia midnight, not browser timezone", () => {
  assert.equal(malaysiaToday(new Date("2026-10-13T16:05:00Z")), "2026-10-14");
  assert.equal(malaysiaToday(new Date("2026-10-13T15:59:00Z")), "2026-10-13");
});

test("greeting and collection filters follow Malaysia time and calendar week/month", () => {
  assert.equal(dashboardGreeting(new Date("2026-10-14T03:59:00Z")), "Good morning");
  assert.equal(dashboardGreeting(new Date("2026-10-14T04:00:00Z")), "Good afternoon");
  assert.equal(dashboardGreeting(new Date("2026-10-14T10:00:00Z")), "Good evening");
  assert.deepEqual(roomCollectionRange("day", new Date("2026-10-13T16:00:00Z")), { collected_from: "2026-10-14", collected_to: "2026-10-14" });
  assert.deepEqual(roomCollectionRange("week", new Date("2026-10-14T03:00:00Z")), { collected_from: "2026-10-12", collected_to: "2026-10-14" });
  assert.deepEqual(roomCollectionRange("month", new Date("2026-10-14T03:00:00Z")), { collected_from: "2026-10-01", collected_to: "2026-10-14" });
  assert.deepEqual(roomCollectionRange("week", new Date("2026-01-01T03:00:00Z")), { collected_from: "2025-12-29", collected_to: "2026-01-01" });
  assert.notEqual(parcelIconTone("SPX001"), parcelIconTone("SPX002"));
  assert.equal(parcelIconTone("SPX001"), parcelIconTone("SPX001"));
});
test("The default seven-day chart can end today rather than displaying future buckets", () => {
  assert.equal(shiftDashboardDate("2026-10-14", -6), "2026-10-08");
  assert.equal(adminRangeLabel("week", "2026-10-08"), "Showing 08 Oct 2026 - 14 Oct 2026");
  assert.equal(shiftDashboardDate("2026-01-03", -6), "2025-12-28");
});
test("Admin month captions omit the exclusive API boundary, including clamped months", () => {
  assert.equal(adminRangeLabel("month", "2026-10-01"), "Showing 01 Oct 2026 - 31 Oct 2026");
  assert.equal(adminRangeLabel("month", "2026-01-31"), "Showing 31 Jan 2026 - 27 Feb 2026");
  assert.equal(adminRangeLabel("month", "2024-01-31"), "Showing 31 Jan 2024 - 28 Feb 2024");
  assert.equal(adminRangeLabel("day", "2026-10-14"), "Showing 14 Oct 2026");
  assert.equal(adminRangeLabel("month", ""), "Showing selected range");
});
