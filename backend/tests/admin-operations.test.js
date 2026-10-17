import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { dashboardDateRange, malaysiaDate, validateAdminOperationsFilters } from '../src/utils/adminOperations.js';

test('operations dates use Malaysia boundaries and bounded inclusive ranges', () => {
  assert.equal(malaysiaDate(new Date('2026-10-13T16:00:00Z')), '2026-10-14');
  assert.deepEqual(dashboardDateRange('2026-10-14', '2026-10-14'), { from: '2026-10-14', to: '2026-10-14', start: '2026-10-13T16:00:00.000Z', end: '2026-10-14T16:00:00.000Z' });
  for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-02-02', '2026-01-01'], ['2020-01-01', '2026-01-01'], [[], '2026-01-01']]) assert.equal(dashboardDateRange(from, to), null);
});
test('operations rejects invalid filters without SQL interpolation', () => {
  const id = randomUUID(), now = new Date('2026-10-14T04:00:00Z');
  const valid = validateAdminOperationsFilters({ summary_room_id: id, attention_room_id: 'unassigned', attention_page: '2', trend_group: 'weekday', attention_search: "Robert'; --" }, now);
  assert.equal(valid.value.attention_page, 2); assert.equal(valid.value.dispute.from, '2026-10-01');
  for (const filters of [{ summary_room_id: [] }, { attention_room_id: 'abc' }, { trend_group: 'SQL' }, { attention_page: [] }, { attention_page: -1 }, { attention_page: '1.5' }, { attention_search: {} }, { attention_search: 'x'.repeat(121) }, { trend_from: '2026-02-30' }]) assert.ok(validateAdminOperationsFilters(filters, now).error);
});

test('operations database/HTTP integration; fixtures and reminder writes are rolled back', { skip: process.env.ADMIN_OPERATIONS_INTEGRATION !== 'true' }, async (t) => {
  const { pool } = await import('../src/db/pool.js');
  const { default: app } = await import('../src/app.js');
  const { signAccessToken } = await import('../src/utils/jwt.js');
  const db = await pool.connect(), raw = db.query.bind(db), marker = 'ops-' + randomUUID();
  const snapshotQuery = `SELECT (SELECT COUNT(*)::int FROM users) AS users, (SELECT COUNT(*)::int FROM parcels) AS parcels,
    (SELECT COUNT(*)::int FROM parcel_rooms) AS rooms, (SELECT COUNT(*)::int FROM notifications) AS notifications,
    (SELECT COUNT(*)::int FROM audit_logs) AS audits, (SELECT COUNT(*)::int FROM disputes) AS disputes`;
  const original = (await raw(snapshotQuery)).rows[0];
  const activationBaseline = (await raw("SELECT COUNT(*) FILTER (WHERE role='RESIDENT')::int AS residents, COUNT(*) FILTER (WHERE role='GUARD')::int AS guards FROM users WHERE status='PENDING_ACTIVATION'")).rows[0];
  await raw('BEGIN');
  let server, sequence = 0, failAudit = false; const savepoints = [], commands = [];
  const query = async (sql, params) => {
    const command = typeof sql === 'string' ? sql.trim().toUpperCase() : '';
    commands.push(command);
    if (command.startsWith('BEGIN')) { const name = 'ops_operation_' + (++sequence); savepoints.push(name); return raw('SAVEPOINT ' + name); }
    if (command === 'COMMIT') return raw('RELEASE SAVEPOINT ' + savepoints.pop());
    if (command === 'ROLLBACK') { const name = savepoints.pop(); await raw('ROLLBACK TO SAVEPOINT ' + name); return raw('RELEASE SAVEPOINT ' + name); }
    if (failAudit && command.includes('INSERT INTO AUDIT_LOGS')) throw new Error('Injected reminder audit failure');
    return raw(sql, params);
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  try {
    const longOverdueBaseline = (await raw("SELECT COUNT(*)::int AS count FROM parcels WHERE deleted_at IS NULL AND status IN ('PENDING','PENDING_COLLECTION') AND collection_deadline < NOW() - INTERVAL '60 days'")).rows[0].count;
    const units = [];
    for (const suffix of ['A', 'B']) units.push((await raw("INSERT INTO units(block,floor,unit_number,full_unit_code) VALUES('TEST','01',$1,$2) RETURNING unit_id", [suffix, marker + suffix])).rows[0].unit_id);
    const users = {};
    for (const role of ['ADMIN', 'GUARD', 'RESIDENT', 'SUPER_ADMIN']) users[role] = (await raw("INSERT INTO users(email,first_name,last_name,phone_number,role,status,unit_id) VALUES($1,'Operations','Fixture','0100000000',$2,'ACTIVE',$3) RETURNING user_id,role,status", [marker + role + '@example.invalid', role, role === 'RESIDENT' ? units[0] : null])).rows[0];
    const inactiveResident = (await raw("INSERT INTO users(email,first_name,last_name,phone_number,role,status,unit_id) VALUES($1,'Pending','Resident','0100000000','RESIDENT','PENDING_ACTIVATION',$2) RETURNING user_id", [marker + '-pending@example.invalid', units[1]])).rows[0];
    await raw("INSERT INTO users(email,phone_number,role,status) VALUES($1,'0100000000','GUARD','PENDING_ACTIVATION'),($2,'0100000000','GUARD','DEACTIVATED')", [marker + '-guard-pending@example.invalid', marker + '-guard-deactivated@example.invalid']);
    for (const userId of [users.RESIDENT.user_id, inactiveResident.user_id]) await raw("INSERT INTO notification_preferences(user_id,notification_type,email_enabled,browser_push_enabled) VALUES($1,'PARCEL_OVERDUE',FALSE,FALSE) ON CONFLICT(user_id,notification_type) DO UPDATE SET email_enabled=FALSE,browser_push_enabled=FALSE", [userId]);
    const courier = (await raw("INSERT INTO courier_companies(courier_name,courier_code,status,created_by) VALUES($1,$1,'ACTIVE',$2) RETURNING courier_id", [marker, users.ADMIN.user_id])).rows[0].courier_id;
    const rooms = [];
    for (const [name, active] of [['A', true], ['B', false]]) rooms.push((await raw("INSERT INTO parcel_rooms(name,is_active) VALUES($1,$2) RETURNING id", [marker + ' Room ' + name, active])).rows[0].id);
    const createParcel = async (suffix, room, unit, status, created, deadline, collected = null, deleted = null) => (await raw(`INSERT INTO parcels(tracking_number,courier_id,unit_id,registered_by,delivery_person_contact,parcel_room_id,status,created_at,collection_deadline,collected_at,deleted_at)
      VALUES($1,$2,$3,$4,'0100000000',$5,$6,$7,$8,$9,$10) RETURNING parcel_id`, [marker + suffix, courier, unit, users.GUARD.user_id, room, status, created, deadline, collected, deleted])).rows[0].parcel_id;
    const now = new Date((await raw('SELECT NOW() AS now')).rows[0].now), ago = (days) => new Date(now.getTime() - days * 86400000).toISOString();
    const overdueId = await createParcel('-overdue', rooms[0], units[0], 'PENDING_COLLECTION', ago(30), ago(23));
    await createParcel('-pending', rooms[0], units[0], 'PENDING_COLLECTION', now.toISOString(), ago(-7));
    const collectedId = await createParcel('-collected', rooms[0], units[0], 'COLLECTED', now.toISOString(), ago(-7), now.toISOString());
    await createParcel('-inactive-room', rooms[1], units[1], 'PENDING_COLLECTION', ago(12), ago(5));
    await createParcel('-unassigned', null, units[0], 'PENDING_COLLECTION', ago(20), ago(13));
    await createParcel('-deleted', rooms[0], units[0], 'PENDING_COLLECTION', ago(40), ago(33), null, now.toISOString());
    const failedAuditId = await createParcel('-rollback', rooms[0], units[0], 'PENDING_COLLECTION', ago(25), ago(18));
    const pageIds = [];
    for (let index = 0; index < 9; index++) pageIds.push(await createParcel('-page-' + index, rooms[0], units[0], 'PENDING_COLLECTION', ago(60 + index), ago(53 + index)));
    await raw("UPDATE parcels SET collection_deadline=NOW() - INTERVAL '60 days' WHERE parcel_id=$1", [pageIds[7]]);
    await raw("INSERT INTO notifications(recipient_user_id,type,title,message,related_parcel_id,created_at) VALUES($1,'PARCEL_OVERDUE','Fixture reminder','Fixture reminder',$3,$4),($2,'PARCEL_OVERDUE','Fixture previous recipient','Fixture previous recipient',$3,$5)", [users.RESIDENT.user_id, inactiveResident.user_id, pageIds[8], ago(9), ago(7)]);
    await createParcel('-future-trend', rooms[0], units[0], 'COLLECTED', '2099-01-01T02:00:00Z', '2099-01-08T02:00:00Z', '2099-01-01T04:00:00Z');
    await createParcel('-unknown-time', rooms[0], units[0], 'COLLECTED', '2099-01-01T00:00:00Z', null);
    const oldDispute = (await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,assigned_staff_user_id,created_at) VALUES($1,$2,'MISSING_ITEM','Fixture parcel cannot be found','IN_REVIEW_ADMIN',$3,'1000-01-01T00:00:00Z') RETURNING dispute_id", [overdueId, users.RESIDENT.user_id, users.ADMIN.user_id])).rows[0].dispute_id;
    await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,created_at) VALUES($1,$2,'WRONG_RECIPIENT','Fixture parcel at another unit','ESCALATED',$3)", [overdueId, users.RESIDENT.user_id, ago(8)]);
    await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,created_at,resolved_at,resolved_by_user_id) VALUES($1,$2,'DAMAGED','Fixture parcel damaged badly','RESOLVED','2099-01-02T00:00:00Z','2099-01-03T00:00:00Z',$3)", [collectedId, users.RESIDENT.user_id, users.ADMIN.user_id]);
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    const request = async (role, endpoint, method = 'GET') => { const response = await fetch(base + endpoint, { method, headers: role ? { Authorization: 'Bearer ' + signAccessToken(users[role]) } : {} }); return { status: response.status, body: await response.json() }; };
    const endpoint = '/dashboard/admin/operations';
    await t.test('authentication and Admin-only boundaries for reads and reminders', async () => {
      for (const [path, method] of [[endpoint, 'GET'], ['/dashboard/admin/parcels/' + overdueId + '/reminder', 'POST']]) {
        assert.equal((await request(null, path, method)).status, 401);
        for (const role of ['GUARD', 'RESIDENT', 'SUPER_ADMIN']) assert.equal((await request(role, path, method)).status, 403);
      }
    });
    const params = new URLSearchParams({ summary_room_id: rooms[0], attention_room_id: rooms[0], dispute_from: '2099-01-01', dispute_to: '2099-01-07', trend_from: '2099-01-01', trend_to: '2099-01-07' });
    let data;
    await t.test('real room-scoped summary excludes deleted parcels and counts overdue as still awaiting', async () => {
      const response = await request('ADMIN', endpoint + '?' + params); assert.equal(response.status, 200); data = response.body;
      assert.deepEqual(data.parcel_summary, { received_today: 2, collected_today: 1, awaiting_collection: 12, overdue: 11, overdue_over_60_days: 1 });
      const row = data.uncollected_by_room.find((item) => item.parcel_room_id === rooms[0]);
      assert.deepEqual([row.pending, row.overdue, row.total], [1, 11, 12]);
      assert.equal(data.uncollected_by_room.find((item) => item.parcel_room_id === rooms[1]).is_active, false);
      assert.ok(data.uncollected_by_room.some((item) => item.parcel_room_id === null));
    });
    await t.test('Admin room counts and Guard caution count only parcels strictly over 60 overdue days', async () => {
      const boundaryIds = [];
      boundaryIds.push(await createParcel('-over60-exact', rooms[1], units[1], 'PENDING_COLLECTION', ago(70), ago(60)));
      await raw("UPDATE parcels SET collection_deadline=NOW() - INTERVAL '60 days' WHERE parcel_id=$1", [boundaryIds[0]]);
      boundaryIds.push(await createParcel('-over60-past', rooms[1], units[1], 'PENDING_COLLECTION', ago(70), ago(60.001)));
      boundaryIds.push(await createParcel('-over60-collected', rooms[1], units[1], 'COLLECTED', ago(70), ago(65), ago(1)));
      boundaryIds.push(await createParcel('-over60-deleted', rooms[1], units[1], 'PENDING_COLLECTION', ago(70), ago(65), null, now.toISOString()));
      const selected = await request('ADMIN', endpoint + '?summary_room_id=' + rooms[1]);
      assert.equal(selected.body.parcel_summary.overdue_over_60_days, 1);
      const guard = await request('GUARD', '/dashboard/guard?period=today');
      assert.equal(guard.status, 200); assert.equal(guard.body.summary.overdue_over_60_days, longOverdueBaseline + 2);
      await raw("UPDATE parcels SET status='COLLECTED',collected_at=NOW() WHERE parcel_id=$1", [boundaryIds[1]]);
      assert.equal((await request('ADMIN', endpoint + '?summary_room_id=' + rooms[1])).body.parcel_summary.overdue_over_60_days, 0);
      await raw('UPDATE parcels SET deleted_at=NOW() WHERE parcel_id=ANY($1::uuid[])', [boundaryIds]);
    });
    await t.test('attention flags only 30-day uncollected parcels, paginates five rows and retains reminder history', async () => {
      assert.equal(data.attention.items.length, 5); assert.equal(data.attention.pagination.total, 10);
      assert.equal(data.attention.pagination.limit, 5); assert.equal(data.attention.flag_after_days, 30);
      assert.equal(data.attention.items[0].resident_name, 'Operations Fixture');
      assert.ok(data.attention.items.every((item) => item.resident_id === users.RESIDENT.user_id));
      assert.ok(data.attention.items.every((item) => item.age_days >= 30 && item.flagged_for_attention));
      assert.equal(new Date(data.attention.items[0].last_reminded_at).toISOString(), ago(7));
      assert.equal(data.attention.items[0].reminder_available, true);
      for (let index = 1; index < data.attention.items.length; index++) assert.ok(data.attention.items[index - 1].collection_deadline <= data.attention.items[index].collection_deadline);
      const page = await request('ADMIN', endpoint + '?' + params + '&attention_page=2');
      assert.equal(page.body.attention.items.length, 5);
      assert.ok(page.body.attention.items.some((item) => item.parcel_id === overdueId && item.age_days === 30 && item.last_reminded_at === null));
      assert.ok(page.body.attention.items.every((item) => item.parcel_id !== failedAuditId));
      const beyond = await request('ADMIN', endpoint + '?' + params + '&attention_page=999');
      assert.equal(beyond.body.attention.pagination.total, 10); assert.equal(beyond.body.attention.items.length, 0);
      const injection = await request('ADMIN', endpoint + '?' + params + '&attention_search=' + encodeURIComponent("'; DROP TABLE parcels; --"));
      assert.equal(injection.status, 200); assert.equal(injection.body.attention.items.length, 0);
    });
    await t.test('younger overdue parcels are excluded; collecting a flagged parcel removes it from attention', async () => {
      for (const age of [7, 14, 29.999]) {
        const id = await createParcel('-boundary-' + age, rooms[1], units[1], 'PENDING_COLLECTION', ago(age), ago(Math.max(1, age - 7)));
        const response = await request('ADMIN', endpoint + '?attention_room_id=' + rooms[1] + '&attention_search=' + encodeURIComponent(marker + '-boundary-' + age));
        assert.equal(response.body.attention.pagination.total, 0); assert.equal(response.body.attention.items.length, 0);
        await raw('UPDATE parcels SET deleted_at=NOW() WHERE parcel_id=$1', [id]);
      }
      await raw("UPDATE parcels SET status='COLLECTED',collected_at=NOW() WHERE parcel_id=$1", [pageIds[0]]);
      const response = await request('ADMIN', endpoint + '?' + params + '&attention_search=' + encodeURIComponent(marker + '-page-0'));
      assert.equal(response.body.attention.pagination.total, 0);
      await raw("UPDATE parcels SET status='PENDING_COLLECTION',collected_at=NULL WHERE parcel_id=$1", [pageIds[0]]);
    });
    await t.test('activation counts exclude deactivated accounts, oldest disputes exclude resolved, and issue dates include resolved reports', async () => {
      assert.equal(data.accounts.resident_pending_activation, activationBaseline.residents + 1);
      assert.equal(data.accounts.guard_pending_activation, activationBaseline.guards + 1);
      assert.ok(data.disputes.oldest_unresolved.some((item) => item.dispute_id === oldDispute));
      assert.ok(data.disputes.oldest_unresolved.every((item) => item.status !== 'RESOLVED' && item.age_days >= 7));
      assert.equal(data.disputes.issue_types.find((item) => item.issue_type === 'DAMAGED').count, 1);
    });
    await t.test('personal action queue excludes other handlers and sorts by last activity, including messages', async () => {
      const otherAdmin = (await raw("INSERT INTO users(email,phone_number,role,status) VALUES($1,'0100000000','ADMIN','ACTIVE') RETURNING user_id", [marker + '-other-admin@example.invalid'])).rows[0].user_id;
      const baseline = (await request('ADMIN', endpoint)).body.disputes;
      const created = [];
      const add = async (status, handler, activity) => {
        const row = (await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,assigned_staff_user_id,created_at,updated_at) VALUES($1,$2,'DAMAGED','Fixture action queue case',$3,$4,'1100-01-01T00:00:00Z',$5) RETURNING dispute_id", [overdueId, users.RESIDENT.user_id, status, handler, activity])).rows[0];
        created.push(row.dispute_id); return row.dispute_id;
      };
      const awaiting = await add('ESCALATED', users.GUARD.user_id, '1200-01-01T00:00:00Z');
      const myFirst = await add('IN_REVIEW_ADMIN', users.ADMIN.user_id, '1201-01-01T00:00:00Z');
      const myUpdated = await add('IN_REVIEW_ADMIN', users.ADMIN.user_id, '1199-01-01T00:00:00Z');
      await raw("INSERT INTO dispute_messages(dispute_id,sender_user_id,message,created_at) VALUES($1,$2,'Recent fixture reply','1202-01-01T00:00:00Z')", [myUpdated, users.RESIDENT.user_id]);
      for (const year of [1203, 1204, 1205]) await add('IN_REVIEW_ADMIN', users.ADMIN.user_id, year + '-01-01T00:00:00Z');
      const someoneElse = await add('IN_REVIEW_ADMIN', otherAdmin, '1101-01-01T00:00:00Z');
      const guardCase = await add('IN_REVIEW_GUARD', users.GUARD.user_id, '1102-01-01T00:00:00Z');
      const deletedCase = await add('ESCALATED', users.GUARD.user_id, '1103-01-01T00:00:00Z');
      await raw('UPDATE disputes SET deleted_at=NOW() WHERE dispute_id=$1', [deletedCase]);
      const snapshot = (await request('ADMIN', endpoint)).body;
      assert.equal(snapshot.disputes.my_review, baseline.my_review + 5);
      assert.equal(snapshot.disputes.escalated, baseline.escalated + 1);
      assert.equal(snapshot.disputes.action_total, snapshot.disputes.my_review + snapshot.disputes.escalated);
      assert.equal(snapshot.disputes.action_items.length, 5);
      assert.deepEqual(snapshot.disputes.action_items.slice(0, 3).map(row => row.dispute_id), [awaiting, myFirst, myUpdated]);
      assert.equal(new Date(snapshot.disputes.action_items[2].latest_activity_at).getUTCFullYear(), 1202);
      assert.deepEqual(snapshot.disputes.action_items[0].parcel, { tracking_number: marker + '-overdue', courier_name: marker, unit_full_code: marker + 'A' });
      assert.equal(snapshot.disputes.action_items[0].assigned_handler, null);
      assert.equal(snapshot.disputes.action_items[1].assigned_handler.user_id, users.ADMIN.user_id);
      assert.equal(snapshot.disputes.action_items[1].assigned_handler.name, 'Operations Fixture');
      assert.equal(snapshot.disputes.action_items[0].evidence_count, 0);
      assert.ok(snapshot.disputes.action_items.every(row => ![someoneElse, guardCase, deletedCase].includes(row.dispute_id)));
      const roomScoped = (await request('ADMIN', endpoint + '?summary_room_id=' + rooms[1])).body;
      assert.deepEqual(roomScoped.disputes.action_items, snapshot.disputes.action_items);
      await raw('DELETE FROM dispute_messages WHERE dispute_id=ANY($1::uuid[])', [created]);
      await raw('DELETE FROM disputes WHERE dispute_id=ANY($1::uuid[])', [created]);
    });
    await t.test('important alerts remain global, use strict seven-day age and exclude resolved/deleted disputes', async () => {
      const baseline = (await request('ADMIN', endpoint)).body.important_alerts;
      const ids = [];
      for (const [age, status, deleted] of [[7, 'OPEN', false], [7.001, 'OPEN', false], [8, 'RESOLVED', false], [8, 'OPEN', true]]) {
        ids.push((await raw(`INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,created_at,deleted_at,resolved_at,resolved_by_user_id)
          VALUES($1,$2,'DAMAGED','Fixture seven day boundary',$3,NOW() - $4::numeric * INTERVAL '1 day',CASE WHEN $5 THEN NOW() END,CASE WHEN $3='RESOLVED' THEN NOW() END,CASE WHEN $3='RESOLVED' THEN $6::uuid END) RETURNING dispute_id`, [overdueId, users.RESIDENT.user_id, status, age, deleted, users.ADMIN.user_id])).rows[0].dispute_id);
      }
      const snapshot = (await request('ADMIN', endpoint + '?summary_room_id=' + rooms[1])).body;
      assert.equal(snapshot.important_alerts.disputes_unresolved_over_7_days, baseline.disputes_unresolved_over_7_days + 1);
      assert.equal(snapshot.important_alerts.parcels_overdue_over_60_days, baseline.parcels_overdue_over_60_days);
      assert.equal(snapshot.important_alerts.resident_pending_activation, activationBaseline.residents + 1);
      assert.equal(snapshot.important_alerts.guard_pending_activation, activationBaseline.guards + 1);
      await raw('DELETE FROM disputes WHERE dispute_id=ANY($1::uuid[])', [ids]);
    });
    await t.test('peak chart uses actual collection time and fills all hourly and weekly buckets', async () => {
      assert.equal(data.peak_activity.buckets.length, 24);
      assert.equal(data.peak_activity.buckets[10].received, 1);
      assert.equal(data.peak_activity.buckets[12].collected, 1);
      assert.equal(data.peak_activity.buckets.reduce((sum, row) => sum + row.collected, 0), 1);
      assert.ok(data.peak_activity.collection_time_unknown >= 1);
      const weekly = await request('ADMIN', endpoint + '?' + params + '&trend_group=weekday');
      assert.equal(weekly.body.peak_activity.buckets.length, 7);
      assert.deepEqual(weekly.body.peak_activity.buckets.map((row) => row.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });
    await t.test('validation rejects invalid rooms, dates, modes and pages; null room remains readable', async () => {
      for (const queryString of ['summary_room_id=bad', 'attention_room_id=x', 'trend_from=2026-02-30', 'trend_group=invalid', 'attention_page=0']) assert.equal((await request('ADMIN', endpoint + '?' + queryString)).status, 400);
      assert.equal((await request('ADMIN', endpoint + '?summary_room_id=' + randomUUID())).status, 404);
      const unassigned = await request('ADMIN', endpoint + '?attention_room_id=unassigned'); assert.equal(unassigned.status, 200);
      assert.ok(unassigned.body.attention.items.every((row) => row.parcel_room_name === null));
    });
    await t.test('reminder persists one notification and audit, follows preferences and blocks a duplicate for 24 hours', async () => {
      const path = '/dashboard/admin/parcels/' + overdueId + '/reminder';
      assert.equal((await request('ADMIN', path, 'POST')).status, 201);
      assert.equal((await request('ADMIN', path, 'POST')).status, 409);
      const notifications = (await raw("SELECT * FROM notifications WHERE related_parcel_id=$1", [overdueId])).rows;
      assert.equal(notifications.length, 1); assert.equal(notifications[0].recipient_user_id, users.RESIDENT.user_id);
      assert.ok(notifications[0].message.includes(marker + ' Room A'));
      assert.equal((await raw("SELECT COUNT(*)::int AS count FROM audit_logs WHERE entity_id=$1 AND action='Parcel Reminder Sent'", [overdueId])).rows[0].count, 1);
      assert.ok(commands.some((command) => command.includes('FOR UPDATE OF P')));
      assert.equal((await request('ADMIN', '/dashboard/admin/parcels/' + collectedId + '/reminder', 'POST')).status, 409);
    });
    await t.test('failed audit rolls back notification; no unavailable resident or removed parcel can be reminded', async () => {
      failAudit = true;
      assert.equal((await request('ADMIN', '/dashboard/admin/parcels/' + failedAuditId + '/reminder', 'POST')).status, 500);
      failAudit = false;
      assert.equal((await raw('SELECT COUNT(*)::int AS count FROM notifications WHERE related_parcel_id=$1', [failedAuditId])).rows[0].count, 0);
      await raw("UPDATE users SET status='DEACTIVATED' WHERE user_id=$1", [users.RESIDENT.user_id]);
      assert.equal((await request('ADMIN', '/dashboard/admin/parcels/' + failedAuditId + '/reminder', 'POST')).status, 409);
      assert.equal((await request('ADMIN', '/dashboard/admin/parcels/' + randomUUID() + '/reminder', 'POST')).status, 404);
      assert.equal((await request('ADMIN', '/dashboard/admin/parcels/not-a-uuid/reminder', 'POST')).status, 400);
    });
    await t.test('legacy dashboard/report APIs remain available', async () => {
      const legacy = await request('ADMIN', '/dashboard/admin?period=day'); assert.equal(legacy.status, 200);
      assert.ok(legacy.body.kpis); assert.ok(Array.isArray(legacy.body.parcel_room_distribution));
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    t.mock.restoreAll(); await raw('ROLLBACK');
    assert.deepEqual((await raw(snapshotQuery)).rows[0], original);
    db.release(); await pool.end();
  }
});
