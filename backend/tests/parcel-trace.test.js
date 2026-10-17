import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { traceDates, traceId, traceNote, tracePagination, traceTracking, INVESTIGATION_TRANSITIONS } from '../src/utils/parcelTrace.js';

test('trace validation bounds IDs, tracking, dates, pagination and append-only note payloads', () => {
  assert.equal(traceTracking(' spx-123 '), 'spx-123'); assert.equal(traceId(randomUUID()).length, 36);
  assert.deepEqual(traceDates({ from: '2026-10-01', to: '2026-10-13' }, new Date()), { from: '2026-10-01', to: '2026-10-13' });
  assert.deepEqual(tracePagination({ page: '2', limit: '5' }), { page: 2, limit: 5 });
  for (const value of ['', null, [], 'x'.repeat(121), 'a\0b']) assert.throws(() => traceTracking(value));
  for (const query of [{ from: '2026-02-30' }, { from: ['2026-01-01'] }, { from: '2026-10-13', to: '2026-10-12' }]) assert.throws(() => traceDates(query, new Date()));
  assert.throws(() => tracePagination({ limit: '51' })); assert.throws(() => traceId('../../secret'));
  for (const input of [{ content: ' ' }, { content: 'a'.repeat(4001) }, { content: 'valid', author_id: randomUUID() }, { content: 'valid', observations: ['AUTO_MATCH'] }]) assert.throws(() => traceNote(input));
  assert.deepEqual(traceNote({ content: '<script>alert(1)</script>', observations: ['INCONCLUSIVE'] }).observations, ['INCONCLUSIVE']);
});
test('investigation transitions are separate and role-aware', () => {
  assert.deepEqual(INVESTIGATION_TRANSITIONS.GUARD.ESCALATED, undefined);
  assert.ok(INVESTIGATION_TRANSITIONS.ADMIN.ESCALATED.includes('RESOLVED'));
  assert.ok(INVESTIGATION_TRANSITIONS.GUARD.RESOLVED.includes('UNDER_REVIEW'));
});

test('Parcel Trace HTTP/PostgreSQL integration; rollback fixtures and remove private test photos', {
  skip: process.env.PARCEL_TRACE_INTEGRATION !== 'true'
}, async (t) => {
  const { pool } = await import('../src/db/pool.js');
  const { default: app } = await import('../src/app.js');
  const { signAccessToken } = await import('../src/utils/jwt.js');
  const { COLLECTION_PHOTO_DIR } = await import('../src/services/collectionVerification.service.js');
  const connect = pool.connect.bind(pool), db = await connect(), raw = db.query.bind(db);
  const marker = `trace-${randomUUID()}`;
  const counts = async () => (await raw(`SELECT (SELECT COUNT(*)::int FROM parcel_investigations) investigations,
    (SELECT COUNT(*)::int FROM parcel_investigation_notes) notes,
    (SELECT COUNT(*)::int FROM parcel_investigation_status_history) history,
    (SELECT COUNT(*)::int FROM parcels) parcels, (SELECT COUNT(*)::int FROM audit_logs) audits`)).rows[0];
  const before = await counts();
  let server, sequence = 0, failAudit = false; const stack = [], files = new Set();
  await raw('BEGIN');
  const query = async (sql, params) => {
    const command = typeof sql === 'string' ? sql.trim().toUpperCase() : '';
    if (command === 'BEGIN') { const name = `trace_${++sequence}`; stack.push(name); return raw(`SAVEPOINT ${name}`); }
    if (command === 'COMMIT') return raw(`RELEASE SAVEPOINT ${stack.pop()}`);
    if (command === 'ROLLBACK') { const name = stack.pop(); await raw(`ROLLBACK TO SAVEPOINT ${name}`); return raw(`RELEASE SAVEPOINT ${name}`); }
    if (failAudit && /INSERT INTO AUDIT_LOGS/.test(command)) throw new Error('Injected audit failure');
    return raw(sql, params);
  };
  t.mock.method(pool, 'query', query); t.mock.method(pool, 'connect', async () => ({ query, release() {} }));
  try {
    const units = [];
    for (const suffix of ['A', 'B']) units.push((await raw(`INSERT INTO units(block,floor,unit_number,full_unit_code) VALUES('TEST','18',$1,$2) RETURNING unit_id`, [suffix, `${marker}-${suffix}`])).rows[0].unit_id);
    const users = {};
    for (const role of ['ADMIN', 'GUARD', 'OTHER_GUARD', 'RESIDENT', 'OTHER_RESIDENT', 'SUPER_ADMIN']) {
      const actual = role.replace('OTHER_', '');
      users[role] = (await raw(`INSERT INTO users(email,first_name,phone_number,role,status,unit_id)
        VALUES($1,'Trace Test','0123456789',$2,'ACTIVE',$3) RETURNING *`,
      [`${marker}-${role}@example.invalid`, actual, actual === 'RESIDENT' ? units[role === 'RESIDENT' ? 0 : 1] : null])).rows[0];
    }
    const couriers = [];
    for (const suffix of ['1', '2']) couriers.push((await raw(`INSERT INTO courier_companies(courier_name,courier_code,status,created_by)
      VALUES($1,$1,'ACTIVE',$2) RETURNING courier_id`, [`${marker}-${suffix}`, users.ADMIN.user_id])).rows[0].courier_id);
    const image = await readFile(new URL('../assets/email/password-reset-illustration.jpg', import.meta.url));
    const filename = `${Date.now()}-${randomUUID()}.jpg`, registrationFile = path.resolve('uploads/parcels', filename);
    await mkdir(path.dirname(registrationFile), { recursive: true }); await writeFile(registrationFile, image); files.add(registrationFile);
    const makeParcel = async (tracking, unit, courier) => (await raw(`INSERT INTO parcels(tracking_number,unit_id,courier_id,registered_by,delivery_person_contact,parcel_photo_url)
      VALUES($1,$2,$3,$4,'0123456789',$5) RETURNING *`, [tracking, unit, courier, users.GUARD.user_id, `/uploads/parcels/${filename}`])).rows[0];
    const parcel = await makeParcel(`${marker}-TARGET`, units[0], couriers[0]);
    const duplicate = await makeParcel(parcel.tracking_number, units[1], couriers[1]);
    const other = await makeParcel(`${marker}-OTHER`, units[1], couriers[0]);
    const dispute = (await raw(`INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,dispute_reference)
      VALUES($1,$2,'MISSING_ITEM','Parcel cannot be located',$3) RETURNING *`, [parcel.parcel_id, users.RESIDENT.user_id, `DSP-TEST-${marker}`])).rows[0];
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const fetchApi = (role, url, method = 'GET', body) => fetch(`${base}${url}`, { method,
      headers: { ...(role ? { Authorization: `Bearer ${signAccessToken(users[role])}` } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    const request = async (...args) => { const res = await fetchApi(...args); return { status: res.status, body: await res.json() }; };
    const root = '/api/parcel-trace', targetPath = `${root}/parcels/${parcel.parcel_id}`;
    let investigation, session;
    await t.test('Admin/Guard-only APIs; Residents, Super Admin and anonymous denied', async () => {
      for (const role of ['ADMIN', 'GUARD']) assert.equal((await request(role, targetPath)).status, 200);
      for (const role of ['RESIDENT', 'SUPER_ADMIN']) assert.equal((await request(role, targetPath)).status, 403);
      assert.equal((await request(null, targetPath)).status, 401);
      assert.equal((await raw('SELECT COUNT(*)::int count FROM parcel_investigations WHERE parcel_id=$1', [parcel.parcel_id])).rows[0].count, 0);
    });
    await t.test('exact case-insensitive search, multiple records, pagination, empty and SQL input validation', async () => {
      const search = await request('GUARD', `${root}/parcels?tracking_number=${parcel.tracking_number.toLowerCase()}&limit=1&page=2`);
      assert.equal(search.status, 200); assert.equal(search.body.pagination.total, 2); assert.equal(search.body.parcels.length, 1);
      assert.equal((await request('ADMIN', `${root}/parcels?tracking_number=not-a-parcel`)).body.parcels.length, 0);
      assert.equal((await request('ADMIN', `${root}/parcels?tracking_number=${encodeURIComponent("' OR 1=1 --")}`)).body.parcels.length, 0);
      for (const url of [`${root}/parcels`, `${root}/parcels?tracking_number=x&limit=10000`, `${root}/parcels/not-uuid`]) assert.equal((await request('GUARD', url)).status, 400);
    });
    await t.test('dispute relationship validated; explicit start is idempotent; independent investigations supported', async () => {
      assert.equal((await request('GUARD', `${root}/parcels/${other.parcel_id}?dispute_id=${dispute.dispute_id}`)).status, 404);
      assert.equal((await request('GUARD', `${root}/investigations`, 'POST', { parcel_id: other.parcel_id, dispute_id: dispute.dispute_id })).status, 404);
      const started = await request('GUARD', `${root}/investigations`, 'POST', { parcel_id: parcel.parcel_id, dispute_id: dispute.dispute_id });
      assert.equal(started.status, 201); investigation = started.body.investigation;
      const repeated = await request('ADMIN', `${root}/investigations`, 'POST', { parcel_id: parcel.parcel_id, dispute_id: dispute.dispute_id });
      assert.equal(repeated.status, 200); assert.equal(repeated.body.investigation.investigation_id, investigation.investigation_id);
      assert.equal((await request('ADMIN', `${root}/investigations`, 'POST', { parcel_id: other.parcel_id })).status, 201);
      assert.equal((await request('GUARD', `${targetPath}?dispute_id=${dispute.dispute_id}`)).body.investigation.investigation_id, investigation.investigation_id);
    });
    await t.test('uploaded registration photos are searchable without collection records; self matches excluded and photos protected', async () => {
      const listPath = `${targetPath}/registration-photos`;
      const list = await request('GUARD', `${listPath}?unit=${encodeURIComponent(marker + '-B')}&limit=1&page=2`);
      assert.equal(list.status, 200); assert.equal(list.body.pagination.total, 2); assert.equal(list.body.photos.length, 1);
      assert.equal(list.body.photos[0].photo_source, 'REGISTRATION');
      const unfiltered = await request('ADMIN', listPath);
      assert.ok(unfiltered.body.photos.every((item) => item.evidence.parcel_id !== parcel.parcel_id));
      assert.ok(!JSON.stringify(list.body).includes('/uploads/'));
      const imagePath = `${listPath}/${other.parcel_id}/photo`;
      const photo = await fetchApi('GUARD', imagePath); assert.equal(photo.status, 200);
      assert.equal(photo.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(Buffer.from(await photo.arrayBuffer()), image);
      for (const role of ['RESIDENT', 'SUPER_ADMIN']) { assert.equal((await request(role, listPath)).status, 403); assert.equal((await fetchApi(role, imagePath)).status, 403); }
      assert.equal((await request(null, listPath)).status, 401);
      assert.equal((await fetchApi('ADMIN', `${listPath}/${parcel.parcel_id}/photo`)).status, 404);
      assert.equal((await fetchApi('ADMIN', `${imagePath}?from=2000-01-01&to=2000-01-02`)).status, 404);
      assert.equal((await fetchApi('ADMIN', `${imagePath}?unit=${encodeURIComponent(marker + '-A')}`)).status, 404);
      assert.equal((await fetchApi('ADMIN', `${listPath}/not-a-uuid/photo`)).status, 400);
      assert.equal((await request('ADMIN', `${listPath}?from=invalid`)).status, 400);
      assert.equal((await request('ADMIN', `${root}/parcels/${other.parcel_id}/registration-photos?dispute_id=${dispute.dispute_id}`)).status, 404);
      await raw("UPDATE parcels SET parcel_photo_url='/uploads/parcels/../../.env' WHERE parcel_id=$1", [other.parcel_id]);
      assert.equal((await fetchApi('GUARD', imagePath)).status, 404);
      await raw('UPDATE parcels SET parcel_photo_url=$1 WHERE parcel_id=$2', [`/uploads/parcels/${filename}`, other.parcel_id]);
    });
    await t.test('cross-unit mismatch trace differs from completed collection; Resident confirmation still required', async () => {
      const qr = await request('OTHER_RESIDENT', '/api/resident/collections', 'POST', { parcel_ids: [other.parcel_id, duplicate.parcel_id] }); assert.equal(qr.status, 201);
      const start = await request('OTHER_GUARD', '/api/guard/collections/verify', 'POST', { token: qr.body.collection.token }); assert.equal(start.status, 200); session = start.body.verification_session;
      const barcode = `/api/collection-verifications/${session.session_id}/parcels/${other.parcel_id}/barcode`;
      const attempt = await request('OTHER_RESIDENT', barcode, 'POST', { scanned_tracking_number: parcel.tracking_number }); assert.equal(attempt.status, 200);
      const trace = await request('GUARD', `${targetPath}/barcodes`); assert.equal(trace.status, 200); assert.equal(trace.body.attempts[0].result, 'MISMATCHED');
      assert.equal(trace.body.attempts[0].verification_status, 'AWAITING_VERIFICATION'); assert.equal(trace.body.attempts[0].target_parcel_attempt, false);
      const filtered = await request('GUARD', `${targetPath}/collections?tracking_number=${parcel.tracking_number}&status=VERIFYING&limit=1`);
      assert.equal(filtered.status, 200); assert.equal(filtered.body.pagination.total, 1); assert.equal(filtered.body.collections[0].matching_attempt, true);
      const preview = filtered.body.collections[0].evidence;
      assert.equal(preview.find((item) => item.parcel_id === other.parcel_id).matching_tracking_attempt, true);
      assert.equal(preview.find((item) => item.parcel_id === duplicate.parcel_id).matching_tracking_attempt, false);
      const expanded = await request('GUARD', `${targetPath}/collections/${session.collection_id}/evidence`);
      assert.equal(expanded.body.evidence.find((item) => item.parcel_id === other.parcel_id).matching_tracking_attempt, true);
      assert.equal(expanded.body.evidence.find((item) => item.parcel_id === duplicate.parcel_id).matching_tracking_attempt, false);
      for (const item of [other, duplicate]) {
        assert.equal((await request('OTHER_RESIDENT', `/api/collection-verifications/${session.session_id}/parcels/${item.parcel_id}/barcode`, 'POST', { scanned_tracking_number: item.tracking_number })).status, 200);
        const form = new FormData(); form.append('photo', new Blob([image], { type: 'image/jpeg' }), 'test.jpg');
        const uploaded = await request('OTHER_RESIDENT', `/api/collection-verifications/${session.session_id}/parcels/${item.parcel_id}/photo`, 'PUT', form); assert.equal(uploaded.status, 200);
      }
      for (const row of (await raw('SELECT photo_filename FROM collection_verification_evidence WHERE session_id=$1', [session.session_id])).rows) if (row.photo_filename) files.add(path.join(COLLECTION_PHOTO_DIR, row.photo_filename));
      assert.equal((await request('GUARD', `/api/collection-verifications/${session.session_id}/confirm`, 'POST', {})).status, 403);
      assert.equal((await request('OTHER_RESIDENT', `/api/collection-verifications/${session.session_id}/confirm`, 'POST', {})).status, 200);
      const after = (await request('GUARD', `${targetPath}/barcodes`)).body.attempts.find((item) => item.attempt_id === trace.body.attempts[0].attempt_id);
      assert.ok(after); assert.equal(after.result, 'MISMATCHED'); assert.equal(after.verification_status, 'COMPLETED');
      assert.equal((await raw('SELECT status FROM parcels WHERE parcel_id=$1', [parcel.parcel_id])).rows[0].status, 'PENDING_COLLECTION');
    });
    await t.test('protected photos validate target, window, evidence IDs and role without widening original route', async () => {
      const evidence = session.parcels.find((item) => item.parcel_id === other.parcel_id);
      for (const role of ['GUARD', 'ADMIN']) {
        const imageRes = await fetchApi(role, `${targetPath}/evidence/${evidence.evidence_id}/photo`); assert.equal(imageRes.status, 200);
        assert.equal(imageRes.headers.get('cache-control'), 'private, no-store'); assert.deepEqual(Buffer.from(await imageRes.arrayBuffer()), image);
        assert.equal((await fetchApi(role, `${targetPath}/registration-photo`)).status, 200);
      }
      for (const role of ['RESIDENT', 'SUPER_ADMIN']) assert.equal((await fetchApi(role, `${targetPath}/registration-photo`)).status, 403);
      assert.equal((await fetchApi('GUARD', `/api/collection-verifications/${session.session_id}/parcels/${other.parcel_id}/photo`)).status, 404);
      assert.equal((await fetchApi('GUARD', `${targetPath}/evidence/${randomUUID()}/photo`)).status, 404);
      assert.equal((await fetchApi('GUARD', `${targetPath}/evidence/${evidence.evidence_id}/photo?from=2000-01-01&to=2000-01-02`)).status, 404);
      await raw("UPDATE parcels SET parcel_photo_url='/uploads/parcels/../../.env' WHERE parcel_id=$1", [parcel.parcel_id]);
      assert.equal((await fetchApi('GUARD', `${targetPath}/registration-photo`)).status, 404);
      await raw('UPDATE parcels SET parcel_photo_url=$1 WHERE parcel_id=$2', [`/uploads/parcels/${filename}`, parcel.parcel_id]);
    });
    await t.test('collection metadata and expanded evidence are server-paginated within the authorized window', async () => {
      assert.equal((await request('RESIDENT', '/api/resident/collections', 'POST', { parcel_ids: [parcel.parcel_id] })).status, 201);
      const collections = await request('GUARD', `${targetPath}/collections?limit=1&page=2&tracking_number=${parcel.tracking_number}`);
      assert.equal(collections.status, 200); assert.equal(collections.body.pagination.total, 2); assert.equal(collections.body.collections.length, 1);
      const evidencePath = `${targetPath}/collections/${session.collection_id}/evidence`;
      const evidence = await request('GUARD', `${evidencePath}?limit=1&page=2`);
      assert.equal(evidence.status, 200); assert.equal(evidence.body.pagination.total, 2); assert.equal(evidence.body.evidence.length, 1);
      assert.equal((await request('GUARD', `${evidencePath}?from=2000-01-01&to=2000-01-02`)).status, 404);
      assert.equal((await request('RESIDENT', evidencePath)).status, 403);
    });
    await t.test('notes use authenticated attribution, preserve literal text, paginate and prohibit update/delete', async () => {
      const endpoint = `${root}/investigations/${investigation.investigation_id}/notes`;
      assert.equal((await request('GUARD', endpoint, 'POST', { content: ' ' })).status, 400);
      assert.equal((await request('GUARD', endpoint, 'POST', { content: 'valid', author_id: users.ADMIN.user_id })).status, 400);
      assert.equal((await request('GUARD', endpoint, 'POST', { content: '<script>not executed</script>', observations: ['INCONCLUSIVE'], reviewed_evidence_id: session.parcels[0].evidence_id })).status, 201);
      assert.equal((await request('ADMIN', endpoint, 'POST', { content: 'Review remains inconclusive.' })).status, 201);
      const notes = await request('GUARD', `${endpoint}?limit=1&page=2`); assert.equal(notes.body.pagination.total, 2); assert.equal(notes.body.notes.length, 1);
      const first = (await request('GUARD', endpoint)).body.notes.find((item) => item.content === '<script>not executed</script>'); assert.equal(first.author_role, 'GUARD');
      for (const sql of ['UPDATE parcel_investigation_notes SET content=\'changed\' WHERE note_id=$1', 'DELETE FROM parcel_investigation_notes WHERE note_id=$1']) {
        await raw('SAVEPOINT immutable_check'); await assert.rejects(raw(sql, [first.note_id]), /append-only/); await raw('ROLLBACK TO SAVEPOINT immutable_check'); await raw('RELEASE SAVEPOINT immutable_check');
      }
      assert.equal((await request('GUARD', endpoint, 'PATCH', { content: 'change' })).status, 404);
    });
    await t.test('role-aware status history/reopening never modifies dispute, parcel, or evidence; audit rollback', async () => {
      const endpoint = `${root}/investigations/${investigation.investigation_id}/status`;
      const evidenceBefore = (await raw('SELECT * FROM collection_verification_evidence WHERE session_id=$1 ORDER BY parcel_id', [session.session_id])).rows;
      assert.equal((await request('GUARD', endpoint, 'PATCH', { status: 'RESOLVED' })).status, 409);
      for (const [role, status] of [['GUARD', 'UNDER_REVIEW'], ['GUARD', 'ESCALATED']]) assert.equal((await request(role, endpoint, 'PATCH', { status })).status, 200);
      assert.equal((await request('GUARD', endpoint, 'PATCH', { status: 'RESOLVED' })).status, 409);
      assert.equal((await request('ADMIN', endpoint, 'PATCH', { status: 'RESOLVED' })).status, 200);
      assert.equal((await request('GUARD', endpoint, 'PATCH', { status: 'UNDER_REVIEW' })).status, 200);
      failAudit = true; assert.equal((await request('GUARD', endpoint, 'PATCH', { status: 'RESOLVED' })).status, 500); failAudit = false;
      assert.equal((await raw('SELECT status FROM parcel_investigations WHERE investigation_id=$1', [investigation.investigation_id])).rows[0].status, 'UNDER_REVIEW');
      assert.equal((await raw('SELECT COUNT(*)::int count FROM parcel_investigation_status_history WHERE investigation_id=$1', [investigation.investigation_id])).rows[0].count, 5);
      assert.equal((await raw('SELECT status FROM disputes WHERE dispute_id=$1', [dispute.dispute_id])).rows[0].status, 'OPEN');
      assert.equal((await raw('SELECT status FROM parcels WHERE parcel_id=$1', [parcel.parcel_id])).rows[0].status, 'PENDING_COLLECTION');
      assert.deepEqual((await raw('SELECT * FROM collection_verification_evidence WHERE session_id=$1 ORDER BY parcel_id', [session.session_id])).rows, evidenceBefore);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE entity_id=$1 AND action LIKE 'Investigation %'", [investigation.investigation_id])).rows[0].count, 7);
    });
    await t.test('timeline is chronological, paginated and grounded in real records; payloads omit secrets', async () => {
      const timeline = await request('GUARD', `${targetPath}/timeline?limit=50`); assert.equal(timeline.status, 200);
      const events = timeline.body.events; assert.ok(events.some((event) => event.label === 'Parcel registered'));
      assert.ok(events.some((event) => event.label === 'Barcode attempt: MISMATCHED')); assert.ok(events.some((event) => event.label === 'Investigation note added'));
      assert.ok(events.every((event, i) => !i || new Date(events[i-1].created_at) <= new Date(event.created_at)));
      assert.equal((await request('GUARD', `${targetPath}/timeline?limit=1&page=2`)).body.events.length, 1);
      const payload = JSON.stringify((await request('GUARD', `${targetPath}/collections`)).body);
      for (const key of ['qr_token_hash', 'photo_filename', 'photo_sha256', 'password_hash', 'email', 'similarity']) assert.ok(!payload.includes(key));
      assert.equal((await request('GUARD', `${targetPath}/collections?from=bad`)).status, 400);
    });
  } finally {
    failAudit = false;
    if (server) await new Promise((resolve) => server.close(resolve));
    const remaining = (await raw(`SELECT photo_filename FROM collection_verification_evidence WHERE session_id IN
      (SELECT session_id FROM collection_verification_sessions s JOIN users u ON u.user_id=s.resident_id WHERE u.email LIKE $1)`, [`${marker}%`])).rows;
    for (const row of remaining) if (row.photo_filename) files.add(path.join(COLLECTION_PHOTO_DIR, row.photo_filename));
    await raw('ROLLBACK');
    assert.deepEqual(await counts(), before);
    for (const file of files) await unlink(file).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    t.mock.restoreAll(); db.release(); await pool.end();
  }
});
