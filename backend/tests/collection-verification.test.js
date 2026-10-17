import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { normalizeBarcode, trackingMatches, validateCollectionPhoto } from "../src/utils/collectionVerification.js";
import { createCollectionVerificationLimiter } from "../src/middleware/collectionVerification.middleware.js";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4), crc = Buffer.alloc(4), content = Buffer.concat([Buffer.from(type), data]);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, crc]);
}
function png(red = 255) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, red, 0, 0]))), chunk("IEND", Buffer.alloc(0))]);
}

test("barcode normalization is trim/case-insensitive without deleting meaningful punctuation", () => {
  assert.deepEqual(normalizeBarcode({ scanned_tracking_number: "  SpX-123  " }), { scanned: "SpX-123", unreadable: false });
  assert.equal(trackingMatches(" spx-123 ", "SPX-123"), true);
  assert.equal(trackingMatches("SPX123", "SPX-123"), false);
  assert.deepEqual(normalizeBarcode({ unreadable: true }), { scanned: null, unreadable: true });
  for (const input of [{}, null, [], { scanned_tracking_number: " " }, { scanned_tracking_number: "x".repeat(121) },
    { scanned_tracking_number: "bad\u0000data" }, { scanned_tracking_number: 1 },
    { scanned_tracking_number: "SPX123", parcel_id: randomUUID() }, { unreadable: false }]) assert.ok(normalizeBarcode(input).error);
});

test("photo validation checks real PNG content, size and MIME, not client filenames", async () => {
  const valid = await validateCollectionPhoto({ buffer: png(), mimetype: "image/png", originalname: "../../unsafe.exe" });
  assert.equal(valid.mime, "image/png"); assert.equal(valid.extension, "png"); assert.equal(valid.digest.length, 64);
  for (const [buffer, mimetype] of [[Buffer.from("<script>not an image</script>"), "image/png"],
    [png(), "image/jpeg"], [png().subarray(0, 12), "image/png"], [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"],
    [Buffer.from([255, 216, 255, 217]), "image/jpeg"]]) assert.ok((await validateCollectionPhoto({ buffer, mimetype })).error);
  const corrupt = png(); corrupt[corrupt.length - 5] ^= 255;
  assert.ok((await validateCollectionPhoto({ buffer: corrupt, mimetype: "image/png" })).error);
  const jpeg = await readFile(new URL("../assets/email/password-reset-illustration.jpg", import.meta.url));
  assert.equal((await validateCollectionPhoto({ buffer: jpeg, mimetype: "image/jpeg" })).mime, "image/jpeg");
});

test("verification limiter is bounded and returns retry information", () => {
  let time = 0, status, retry;
  const limit = createCollectionVerificationLimiter({ now: () => time, maximum: 2 });
  const res = { set(key, value) { retry = value; }, status(value) { status = value; return this; }, json() {} };
  let successes = 0;
  const call = () => limit({ user: { user_id: "test" } }, res, () => successes++);
  call(); call(); call(); assert.equal(successes, 2); assert.equal(status, 429); assert.equal(retry, "60");
  time = 60001; call(); assert.equal(successes, 3);
});

test("collection verification HTTP/PostgreSQL integration; all fixtures rolled back", {
  skip: process.env.COLLECTION_VERIFICATION_INTEGRATION !== "true"
}, async (t) => {
  const { pool } = await import("../src/db/pool.js");
  const { default: app } = await import("../src/app.js");
  const { signAccessToken } = await import("../src/utils/jwt.js");
  const { hashToken } = await import("../src/utils/token.js");
  const { COLLECTION_PHOTO_DIR, recordCollectionBarcode } = await import("../src/services/collectionVerification.service.js");
  const connect = pool.connect.bind(pool);
  const db = await connect(), raw = db.query.bind(db), marker = `verify-${randomUUID()}`;
  const snapshot = (await raw(`SELECT
    (SELECT COUNT(*)::int FROM parcels) parcels, (SELECT COUNT(*)::int FROM parcel_collections) collections,
    (SELECT COUNT(*)::int FROM collection_verification_sessions) sessions,
    (SELECT COUNT(*)::int FROM collection_verification_evidence) evidence,
    (SELECT COUNT(*)::int FROM collection_barcode_attempts) attempts,
    (SELECT COUNT(*)::int FROM audit_logs) audits`)).rows[0];
  let server, savepoint = 0, failAudit = false;
  const stack = [], files = new Set();
  await raw("BEGIN");
  const query = async (sql, params) => {
    const command = typeof sql === "string" ? sql.trim().toUpperCase() : "";
    if (command === "BEGIN") { const name = `verification_${++savepoint}`; stack.push(name); return raw(`SAVEPOINT ${name}`); }
    if (command === "COMMIT") return raw(`RELEASE SAVEPOINT ${stack.pop()}`);
    if (command === "ROLLBACK") { const name = stack.pop(); await raw(`ROLLBACK TO SAVEPOINT ${name}`); return raw(`RELEASE SAVEPOINT ${name}`); }
    if (failAudit && /INSERT INTO audit_logs/i.test(command)) throw new Error("Injected audit failure");
    return raw(sql, params);
  };
  t.mock.method(pool, "query", query);
  t.mock.method(pool, "connect", async () => ({ query, release() {} }));
  try {
    await t.test("independent PostgreSQL connections cannot enter the verification critical section concurrently", async () => {
      const first = await connect(), second = await connect();
      try {
        await first.query("BEGIN"); await second.query("BEGIN");
        await first.query("SELECT pg_advisory_xact_lock(18001)");
        assert.equal((await second.query("SELECT pg_try_advisory_xact_lock(18001) AS acquired")).rows[0].acquired, false);
        await first.query("ROLLBACK");
        assert.equal((await second.query("SELECT pg_try_advisory_xact_lock(18001) AS acquired")).rows[0].acquired, true);
      } finally {
        await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release();
      }
    });
    const units = [];
    for (const suffix of ["A", "B"]) units.push((await raw(`INSERT INTO units (block, floor, unit_number, full_unit_code)
      VALUES ('TEST', '18', $1, $2) RETURNING unit_id`, [suffix, `${marker}-${suffix}`])).rows[0].unit_id);
    const users = {};
    for (const role of ["ADMIN", "GUARD", "OTHER_GUARD", "RESIDENT", "OTHER_RESIDENT", "SUPER_ADMIN"]) {
      const actualRole = role.replace("OTHER_", ""), unitId = actualRole === "RESIDENT" ? units[role === "RESIDENT" ? 0 : 1] : null;
      users[role] = (await raw(`INSERT INTO users (email, first_name, phone_number, role, status, unit_id)
        VALUES ($1, 'Verification Test', '0123456789', $2, 'ACTIVE', $3) RETURNING *`, [`${marker}-${role}@example.invalid`, actualRole, unitId])).rows[0];
    }
    const courierId = (await raw(`INSERT INTO courier_companies (courier_name, courier_code, status, created_by)
      VALUES ($1, $1, 'ACTIVE', $2) RETURNING courier_id`, [marker, users.ADMIN.user_id])).rows[0].courier_id;
    const roomId = (await raw("INSERT INTO parcel_rooms (name) VALUES ($1) RETURNING id", [marker])).rows[0].id;
    const makeParcel = async (suffix, options = {}) => (await raw(`INSERT INTO parcels
      (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact, status, parcel_room_id, parcel_photo_url)
      VALUES ($1, $2, $3, $4, '0123456789', $5, $6, '/uploads/parcels/original.jpg') RETURNING *`,
    [`${marker}-${suffix}`, courierId, options.unit || units[0], users.GUARD.user_id, options.status || "PENDING_COLLECTION", options.room === null ? null : roomId])).rows[0];
    server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const fetchApi = (role, url, method = "GET", body) => fetch(`${base}${url}`, { method,
      headers: { ...(role ? { Authorization: `Bearer ${signAccessToken(users[role])}` } : {}),
        ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    const request = async (...args) => { const response = await fetchApi(...args); return { status: response.status, body: await response.json() }; };
    const qr = async (selected) => {
      const result = await request("RESIDENT", "/api/resident/collections", "POST", { parcel_ids: selected.map((parcel) => parcel.parcel_id) });
      assert.equal(result.status, 201); return result.body.collection;
    };
    const start = async (collection, role = "GUARD") => request(role, "/api/guard/collections/verify", "POST", { token: collection.token });
    const sessionPath = (session) => `/api/collection-verifications/${session.session_id}`;
    const barcode = (session, parcel, scanned = parcel.tracking_number, role = "RESIDENT") => request(role,
      `${sessionPath(session)}/parcels/${parcel.parcel_id}/barcode`, "POST", typeof scanned === "object" ? scanned : { scanned_tracking_number: scanned });
    const upload = async (session, parcel, buffer = png(), role = "RESIDENT", mime = "image/png") => {
      const form = new FormData(); form.append("photo", new Blob([buffer], { type: mime }), "../../client-path.png");
      return request(role, `${sessionPath(session)}/parcels/${parcel.parcel_id}/photo`, "PUT", form);
    };
    const confirm = (session, role = "RESIDENT", body = {}) => request(role, `${sessionPath(session)}/confirm`, "POST", body);
    const cancel = (session) => request("RESIDENT", `${sessionPath(session)}/cancel`, "POST", {});
    const take = async (collection) => { const response = await start(collection); assert.equal(response.status, 200); return response.body.verification_session; };
    const collectFiles = async () => {
      const rows = (await raw("SELECT photo_filename FROM collection_verification_evidence WHERE session_id IN (SELECT session_id FROM collection_verification_sessions WHERE resident_id = $1)", [users.RESIDENT.user_id])).rows;
      for (const row of rows) if (row.photo_filename) files.add(row.photo_filename);
    };
    const one = await makeParcel("one"), two = await makeParcel("two", { room: null });
    const selected = [one, two];
    let primaryQr, session;
    await t.test("valid Guard scan starts exactly one session without collecting; roles/privacy stay enforced", async () => {
      primaryQr = await qr(selected); session = await take(primaryQr);
      assert.equal(session.status, "AWAITING_VERIFICATION"); assert.equal(session.parcel_count, 2);
      assert.equal(session.guard_id, users.GUARD.user_id);
      assert.ok(session.parcels.some((parcel) => parcel.parcel_room_name === marker));
      assert.ok(session.parcels.some((parcel) => parcel.parcel_room_name === null));
      assert.ok(!JSON.stringify(session).includes("photo_filename"));
      assert.equal((await raw("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id = ANY($1::uuid[]) AND status = 'PENDING_COLLECTION'", [selected.map((p) => p.parcel_id)])).rows[0].count, 2);
      assert.equal((await raw("SELECT collected_at FROM parcel_collections WHERE collection_id = $1", [primaryQr.collection_id])).rows[0].collected_at, null);
      assert.equal((await request("RESIDENT", sessionPath(session))).status, 200);
      assert.equal((await request("GUARD", sessionPath(session))).status, 200);
      assert.equal((await request("ADMIN", sessionPath(session))).status, 200);
      for (const role of ["OTHER_RESIDENT", "OTHER_GUARD"]) assert.equal((await request(role, sessionPath(session))).status, 404);
      assert.equal((await request("SUPER_ADMIN", sessionPath(session))).status, 403);
      assert.equal((await request(null, sessionPath(session))).status, 401);
      assert.equal((await request("RESIDENT", "/api/collection-verifications/not-uuid")).status, 400);
      assert.equal((await request("RESIDENT", "/api/resident/collection-verifications/active")).body.verification_sessions.length, 1);
      for (const role of ["RESIDENT", "ADMIN", "SUPER_ADMIN"]) assert.equal((await start(primaryQr, role)).status, 403);
      for (const role of ["GUARD", "ADMIN", "SUPER_ADMIN"]) assert.equal((await confirm(session, role)).status, 403);
      assert.equal((await confirm(session, "OTHER_RESIDENT")).status, 404);
      assert.equal((await start(primaryQr, "OTHER_GUARD")).status, 403);
      const again = await start(primaryQr); assert.equal(again.body.verification_session.session_id, session.session_id);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM collection_verification_sessions WHERE collection_id = $1", [primaryQr.collection_id])).rows[0].count, 1);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE entity_id = $1 AND action = 'Collection Verification Started'", [primaryQr.collection_id])).rows[0].count, 1);
      await query("BEGIN");
      await assert.rejects(raw("INSERT INTO collection_verification_reservations (parcel_id, session_id) VALUES ($1, $2)", [one.parcel_id, session.session_id]), { code: "23505" });
      await query("ROLLBACK");
    });
    await t.test("invalid/expired/replayed QR and overlapping sessions cannot bypass verification", async () => {
      assert.equal((await request("GUARD", "/api/guard/collections/verify", "POST", { token: "invalid" })).status, 404);
      assert.equal((await request("GUARD", "/api/guard/collections/verify", "POST", {})).status, 400);
      const overlap = await qr([one]); assert.equal((await start(overlap)).status, 409);
      const expired = await qr([two]);
      await raw("UPDATE parcel_collections SET qr_expiry = NOW() - INTERVAL '1 second' WHERE collection_id = $1", [expired.collection_id]);
      assert.equal((await start(expired)).status, 410);
      await raw("UPDATE parcel_collections SET qr_expiry = NOW() - INTERVAL '1 second' WHERE collection_id = $1", [primaryQr.collection_id]);
      assert.equal((await start(primaryQr)).status, 200, "Same initiating Guard may retrieve an already initiated session after QR expiry");
      assert.equal((await request("GUARD", `/api/parcels/${one.parcel_id}/status`, "PATCH", { status: "COLLECTED" })).status, 400);
      assert.equal((await request("ADMIN", `/api/parcels/${one.parcel_id}/status`, "PATCH", { status: "COLLECTED" })).status, 400);
      await request("GUARD", `/api/parcels/${one.parcel_id}`, "PATCH", { status: "COLLECTED" });
      assert.equal((await raw("SELECT status FROM parcels WHERE parcel_id = $1", [one.parcel_id])).rows[0].status, "PENDING_COLLECTION");
    });
    await t.test("mismatches/unreadable attempts persist without revealing foreign unit; retries and caps are bounded", async () => {
      const foreign = await makeParcel("foreign", { unit: units[1] });
      let response = await barcode(session, one, foreign.tracking_number);
      assert.equal(response.status, 200); assert.equal(response.body.barcode_result, "MISMATCHED");
      assert.ok(!JSON.stringify(response.body).includes(units[1]));
      assert.ok(!JSON.stringify(response.body).includes(users.OTHER_RESIDENT.email));
      assert.equal((await confirm(session)).status, 409);
      assert.equal((await barcode(session, one, foreign.tracking_number)).status, 200);
      assert.equal((await raw("SELECT attempt_count FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2", [session.session_id, one.parcel_id])).rows[0].attempt_count, 1);
      response = await barcode(session, one, { unreadable: true }); assert.equal(response.body.barcode_result, "UNREADABLE");
      response = await barcode(session, one, `  ${one.tracking_number.toUpperCase()}  `); assert.equal(response.body.barcode_result, "MATCHED");
      const attempts = (await raw("SELECT * FROM collection_barcode_attempts WHERE evidence_id = (SELECT evidence_id FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2) ORDER BY created_at", [session.session_id, one.parcel_id])).rows;
      assert.equal(attempts.length, 3); assert.ok(attempts.every((a) => a.actor_user_id === users.RESIDENT.user_id));
      assert.ok(attempts.some((a) => a.scanned_tracking_number === foreign.tracking_number && a.result === "MISMATCHED"));
      assert.equal((await barcode(session, foreign)).status, 404);
      assert.equal((await barcode(session, one, " ")).status, 400);
      await query("BEGIN");
      await assert.rejects(raw("UPDATE collection_barcode_attempts SET result = 'MATCHED' WHERE attempt_id = $1", [attempts[0].attempt_id]), /append-only/);
      await query("ROLLBACK");
      const capParcel = await makeParcel("cap"), capSession = await take(await qr([capParcel]));
      for (let index = 0; index < 30; index++) assert.equal((await recordCollectionBarcode({ requester: users.RESIDENT,
        sessionId: capSession.session_id, parcelId: capParcel.parcel_id, input: { scanned_tracking_number: `wrong-${index}` } })).barcode_result, "MISMATCHED");
      assert.equal((await barcode(capSession, capParcel)).status, 429);
      assert.equal((await cancel(capSession)).status, 200);
    });
    await t.test("protected photo upload validates content/size/association and replaces only before completion", async () => {
      assert.equal((await confirm(session)).status, 409, "Missing photos prevent completion");
      assert.equal((await upload(session, one, Buffer.from("fake PNG"))).status, 400);
      assert.equal((await upload(session, one, png(), "RESIDENT", "image/gif")).status, 400);
      assert.equal((await upload(session, one, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 400);
      assert.equal((await upload(session, one, png(), "OTHER_RESIDENT")).status, 404);
      assert.equal((await upload(session, one, png(), "GUARD")).status, 403);
      const unrelated = await makeParcel("unrelated"); assert.equal((await upload(session, unrelated)).status, 404);
      const form = new FormData(); form.append("photo_url", "/uploads/parcels/original.jpg");
      assert.equal((await request("RESIDENT", `${sessionPath(session)}/parcels/${one.parcel_id}/photo`, "PUT", form)).status, 400);
      const double = new FormData(); double.append("photo", new Blob([png()], { type: "image/png" }), "one.png"); double.append("photo", new Blob([png()], { type: "image/png" }), "two.png");
      assert.equal((await request("RESIDENT", `${sessionPath(session)}/parcels/${one.parcel_id}/photo`, "PUT", double)).status, 400);
      const beforeFiles = (await readdir(COLLECTION_PHOTO_DIR).catch(() => [])).sort();
      failAudit = true;
      try { assert.equal((await upload(session, one)).status, 500); } finally { failAudit = false; }
      assert.deepEqual((await readdir(COLLECTION_PHOTO_DIR)).sort(), beforeFiles, "Failed photo associations must clean up their new file");
      assert.equal((await upload(session, one)).status, 200); await collectFiles();
      const firstFile = (await raw("SELECT photo_filename FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2", [session.session_id, one.parcel_id])).rows[0].photo_filename;
      assert.equal((await upload(session, one)).status, 200);
      assert.equal((await raw("SELECT photo_filename FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2", [session.session_id, one.parcel_id])).rows[0].photo_filename, firstFile);
      assert.equal((await upload(session, one, png(10))).status, 200); await collectFiles();
      const newFile = (await raw("SELECT photo_filename FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2", [session.session_id, one.parcel_id])).rows[0].photo_filename;
      assert.notEqual(newFile, firstFile); await assert.rejects(readFile(path.join(COLLECTION_PHOTO_DIR, firstFile)), { code: "ENOENT" });
      const photoPath = `${sessionPath(session)}/parcels/${one.parcel_id}/photo`;
      for (const role of ["RESIDENT", "GUARD", "ADMIN"]) {
        const response = await fetchApi(role, photoPath); assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), png(10));
      }
      for (const role of ["OTHER_RESIDENT", "OTHER_GUARD"]) assert.equal((await request(role, photoPath)).status, 404);
      assert.equal((await request("SUPER_ADMIN", photoPath)).status, 403);
      assert.equal((await request(null, photoPath)).status, 401);
      assert.equal((await request(null, `/private-uploads/collections/${newFile}`)).status, 404);
      assert.equal((await request(null, `/uploads/collections/${newFile}`)).status, 404);
      assert.equal((await raw("SELECT parcel_photo_url FROM parcels WHERE parcel_id = $1", [one.parcel_id])).rows[0].parcel_photo_url, "/uploads/parcels/original.jpg");
    });
    await t.test("multi-parcel confirmation is atomic, detects changed parcels and rolls back on audit failure", async () => {
      await barcode(session, two); await upload(session, two); await collectFiles();
      await barcode(session, two, "wrong-again");
      assert.equal((await confirm(session)).status, 409);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id = ANY($1::uuid[]) AND status = 'COLLECTED'", [selected.map((p) => p.parcel_id)])).rows[0].count, 0);
      await barcode(session, two);
      const photo = (await raw("SELECT photo_filename FROM collection_verification_evidence WHERE session_id = $1 AND parcel_id = $2", [session.session_id, one.parcel_id])).rows[0].photo_filename;
      await writeFile(path.join(COLLECTION_PHOTO_DIR, photo), png(99));
      assert.equal((await confirm(session)).status, 409, "Tampered file content must not satisfy confirmation");
      await writeFile(path.join(COLLECTION_PHOTO_DIR, photo), png(10));
      await raw("UPDATE parcels SET status = 'COLLECTED' WHERE parcel_id = $1", [two.parcel_id]);
      assert.equal((await confirm(session)).status, 409, "Already-collected parcels cannot be finalized again");
      await raw("UPDATE parcels SET status = 'PENDING_COLLECTION' WHERE parcel_id = $1", [two.parcel_id]);
      await raw("UPDATE parcels SET tracking_number = $1 WHERE parcel_id = $2", [`${marker}-changed`, two.parcel_id]);
      assert.equal((await confirm(session)).status, 409);
      await raw("UPDATE parcels SET tracking_number = $1 WHERE parcel_id = $2", [two.tracking_number, two.parcel_id]);
      failAudit = true;
      try { assert.equal((await confirm(session)).status, 500); } finally { failAudit = false; }
      assert.equal((await raw("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id = ANY($1::uuid[]) AND status = 'COLLECTED'", [selected.map((p) => p.parcel_id)])).rows[0].count, 0);
      assert.equal((await raw("SELECT collection_status FROM parcel_collections WHERE collection_id = $1", [primaryQr.collection_id])).rows[0].collection_status, "VERIFYING");
      assert.equal((await confirm(session, "RESIDENT", { resident_id: users.OTHER_RESIDENT.user_id })).status, 400);
      const success = await confirm(session); assert.equal(success.status, 200);
      assert.equal(success.body.verification_session.status, "COMPLETED");
      assert.equal(success.body.collection.confirmed_by, users.RESIDENT.user_id);
      assert.equal(success.body.collection.verified_by, users.GUARD.user_id);
      assert.ok(success.body.verification_session.confirmed_at && success.body.verification_session.completed_at);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id = ANY($1::uuid[]) AND status = 'COLLECTED'", [selected.map((p) => p.parcel_id)])).rows[0].count, 2);
      const auditsBefore = (await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE metadata->>'session_id' = $1", [session.session_id])).rows[0].count;
      const again = await confirm(session); assert.equal(again.status, 200); assert.equal(again.body.already_completed, true);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE metadata->>'session_id' = $1", [session.session_id])).rows[0].count, auditsBefore);
      assert.equal((await start(primaryQr)).status, 409);
      assert.equal((await upload(session, one, png(30))).status, 409);
      assert.equal((await barcode(session, one, "new-value")).status, 409);
      assert.equal((await cancel(session)).status, 409);
      assert.equal((await request("RESIDENT", sessionPath(session))).body.verification_session.parcels.filter((p) => p.photo_present).length, 2);
      await raw("UPDATE parcels SET tracking_number = $1 WHERE parcel_id = $2", [`${marker}-renamed-after-completion`, one.parcel_id]);
      const retained = (await request("RESIDENT", sessionPath(session))).body.verification_session.parcels.find((p) => p.parcel_id === one.parcel_id);
      assert.equal(retained.registered_tracking_number, one.tracking_number);
      await query("BEGIN");
      await assert.rejects(raw("UPDATE collection_verification_evidence SET scanned_tracking_number = 'changed' WHERE session_id = $1", [session.session_id]), /immutable/);
      await query("ROLLBACK");
    });
    await t.test("cancel/expiry release reservations once; historical collections require no new evidence", async () => {
      const parcel = await makeParcel("expires"), collection = await qr([parcel]), expSession = await take(collection);
      const replacementQr = await qr([parcel]);
      assert.equal((await start(replacementQr)).status, 409);
      await raw("UPDATE collection_verification_sessions SET expires_at = created_at + INTERVAL '1 millisecond', created_at = created_at WHERE session_id = $1", [expSession.session_id]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal((await confirm(expSession)).status, 410);
      assert.equal((await upload(expSession, parcel)).status, 410);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM collection_verification_reservations WHERE session_id = $1", [expSession.session_id])).rows[0].count, 0);
      assert.equal((await request("RESIDENT", sessionPath(expSession))).body.verification_session.status, "EXPIRED");
      assert.equal((await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE metadata->>'session_id' = $1 AND action = 'Verification Session Expired'", [expSession.session_id])).rows[0].count, 1);
      const cancelled = await take(replacementQr); assert.equal((await cancel(cancelled)).status, 200); assert.equal((await cancel(cancelled)).status, 200);
      assert.equal((await confirm(cancelled)).status, 409); assert.equal((await start(replacementQr)).status, 409);
      assert.equal((await upload(cancelled, parcel)).status, 409);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM audit_logs WHERE metadata->>'session_id' = $1 AND action = 'Verification Session Cancelled'", [cancelled.session_id])).rows[0].count, 1);
      assert.equal((await start(await qr([parcel]))).status, 200);
      const historicParcel = await makeParcel("historical", { status: "COLLECTED" });
      const historic = (await raw(`INSERT INTO parcel_collections (resident_id, verified_by, qr_token_hash, qr_expiry, collection_status, collected_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '1 minute', 'USED', NOW()) RETURNING collection_id`, [users.RESIDENT.user_id, users.GUARD.user_id, hashToken(marker)])).rows[0];
      await raw("INSERT INTO parcel_collection_items (collection_id, parcel_id) VALUES ($1, $2)", [historic.collection_id, historicParcel.parcel_id]);
      assert.equal((await request("RESIDENT", `/api/resident/parcels/${historicParcel.parcel_id}`)).status, 200);
      assert.equal((await raw("SELECT COUNT(*)::int count FROM collection_verification_sessions WHERE collection_id = $1", [historic.collection_id])).rows[0].count, 0);
    });
    await t.test("audit chain has correct actors, no QR secrets/photo paths, and snapshot data survives room renames", async () => {
      await raw("UPDATE parcel_rooms SET name = $1 WHERE id = $2", [`${marker}-renamed`, roomId]);
      const data = (await request("RESIDENT", sessionPath(session))).body.verification_session;
      assert.ok(data.parcels.some((p) => p.parcel_room_name === marker));
      const logs = (await raw("SELECT * FROM audit_logs WHERE metadata->>'session_id' = $1 ORDER BY created_at", [session.session_id])).rows;
      for (const action of ["Collection Verification Started", "Barcode Verification Succeeded", "Barcode Verification Failed", "Collection Photo Uploaded", "Collection Photo Replaced", "Resident Confirmed Collection", "Collection Completed", "Parcel Collected"]) assert.ok(logs.some((log) => log.action === action), action);
      assert.ok(logs.filter((log) => log.action === "Collection Verification Started").every((log) => log.actor_user_id === users.GUARD.user_id));
      assert.ok(logs.filter((log) => log.action === "Parcel Collected").every((log) => log.actor_user_id === users.RESIDENT.user_id));
      assert.equal(logs.filter((log) => log.action === "Parcel Collected").length, 2);
      const text = JSON.stringify(logs);
      assert.ok(!text.includes(primaryQr.token) && !text.includes("qr_token_hash") && !text.includes("photo_filename"));
      assert.equal((await raw("SELECT COUNT(*)::int count FROM collection_verification_reservations WHERE session_id = $1", [session.session_id])).rows[0].count, 0);
    });
    assert.equal(stack.length, 0);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    try {
      const rows = (await raw("SELECT photo_filename FROM collection_verification_evidence WHERE photo_filename IS NOT NULL AND session_id IN (SELECT session_id FROM collection_verification_sessions WHERE unit_reference LIKE $1)", [`${marker}%`])).rows;
      for (const row of rows) files.add(row.photo_filename);
    } catch { /* An aborted fixture transaction is still rolled back below. */ }
    t.mock.restoreAll(); await raw("ROLLBACK"); db.release();
    for (const filename of files) await unlink(path.join(COLLECTION_PHOTO_DIR, filename)).catch(() => {});
    const after = (await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM parcels) parcels, (SELECT COUNT(*)::int FROM parcel_collections) collections,
      (SELECT COUNT(*)::int FROM collection_verification_sessions) sessions,
      (SELECT COUNT(*)::int FROM collection_verification_evidence) evidence,
      (SELECT COUNT(*)::int FROM collection_barcode_attempts) attempts,
      (SELECT COUNT(*)::int FROM audit_logs) audits`)).rows[0];
    assert.deepEqual(after, snapshot, "No permanent fixtures may remain");
    await pool.end();
  }
});
