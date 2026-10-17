import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateParcelRoomId, validateParcelRoomInput } from "../src/utils/parcelRoomValidation.js";

test("room validation normalizes whitespace, bounds text, and validates UUID types", () => {
  assert.deepEqual(validateParcelRoomInput({ name: "  Lobby\t  Room \n", description: "  Near entrance  " }),
    { value: { name: "Lobby Room", description: "Near entrance" } });
  for (const input of [null, [], { name: "x", is_active: false }, {}, { name: " " }, { name: 1 },
    { name: "x".repeat(101) }, { name: "x", description: {} }, { name: "x", description: "x".repeat(1001) }]) {
    assert.ok(validateParcelRoomInput(input).error);
  }
  assert.ok(validateParcelRoomInput({}, { partial: true }).error);
  assert.deepEqual(validateParcelRoomInput({ description: null }, { partial: true }), { value: { description: null } });
  for (const id of [undefined, null, "", " ", "not-uuid", 12, [], {}]) assert.ok(validateParcelRoomId(id).error);
  const id = randomUUID();
  assert.equal(validateParcelRoomId(` ${id.toUpperCase()} `).parcelRoomId, id);
});

test("parcel rooms HTTP/database integration (all fixtures rolled back)", {
  skip: process.env.PARCEL_ROOM_INTEGRATION !== "true"
}, async (t) => {
  const { pool } = await import("../src/db/pool.js");
  const { default: app } = await import("../src/app.js");
  const { signAccessToken } = await import("../src/utils/jwt.js");
  const { createParcelRoom } = await import("../src/services/parcelRoom.service.js");
  const { COLLECTION_PHOTO_DIR } = await import("../src/services/collectionVerification.service.js");
  const photoFiles = new Set();
  const db = await pool.connect();
  const rawQuery = db.query.bind(db);
  const marker = `room-test-${randomUUID()}`;
  const snapshot = (await rawQuery(`SELECT
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM parcels) AS parcels,
    (SELECT COUNT(*)::int FROM parcel_rooms) AS rooms,
    (SELECT COUNT(*)::int FROM audit_logs) AS audits,
    (SELECT COUNT(*)::int FROM disputes) AS disputes,
    (SELECT COUNT(*)::int FROM notifications) AS notifications`)).rows[0];
  await rawQuery("BEGIN");
  let server;
  const savepoints = [];
  let sequence = 0;
  let failAudit = false;
  // Business commits release savepoints; the outer fixture transaction never commits.
  const query = async (sql, values) => {
    const command = typeof sql === "string" ? sql.trim().toUpperCase() : "";
    if (command === "BEGIN") {
      const name = `room_operation_${++sequence}`;
      savepoints.push(name);
      return rawQuery(`SAVEPOINT ${name}`);
    }
    if (command === "COMMIT") return rawQuery(`RELEASE SAVEPOINT ${savepoints.pop()}`);
    if (command === "ROLLBACK") {
      const name = savepoints.pop();
      await rawQuery(`ROLLBACK TO SAVEPOINT ${name}`);
      return rawQuery(`RELEASE SAVEPOINT ${name}`);
    }
    if (failAudit && /INSERT INTO audit_logs/i.test(command)) throw new Error("Injected audit failure");
    return rawQuery(sql, values);
  };
  t.mock.method(pool, "query", query);
  t.mock.method(pool, "connect", async () => ({ query, release() {} }));
  try {
    const units = [];
    for (const suffix of ["A", "B"]) {
      units.push((await rawQuery(`INSERT INTO units (block, floor, unit_number, full_unit_code)
        VALUES ('TEST', '01', $1, $2) RETURNING unit_id`, [suffix, `${marker}-${suffix}`])).rows[0].unit_id);
    }
    const users = {};
    for (const role of ["ADMIN", "GUARD", "RESIDENT", "SUPER_ADMIN", "OTHER_RESIDENT"]) {
      const actualRole = role === "OTHER_RESIDENT" ? "RESIDENT" : role;
      const unitId = actualRole === "RESIDENT" ? units[role === "RESIDENT" ? 0 : 1] : null;
      users[role] = (await rawQuery(`INSERT INTO users (email, first_name, phone_number, role, status, unit_id)
        VALUES ($1, 'Test', '0123456789', $2, 'ACTIVE', $3) RETURNING user_id, email, role, unit_id`,
      [`${marker}-${role}@example.invalid`, actualRole, unitId])).rows[0];
      await rawQuery(`UPDATE notification_preferences SET email_enabled = FALSE, browser_push_enabled = FALSE
        WHERE user_id = $1`, [users[role].user_id]);
    }
    const courier = (await rawQuery(`INSERT INTO courier_companies (courier_name, courier_code, status, created_by)
      VALUES ($1, $2, 'ACTIVE', $3) RETURNING courier_id`, [marker, marker, users.ADMIN.user_id])).rows[0].courier_id;
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (role, path, method = "GET", body) => {
      const response = await fetch(`${base}${path}`, { method, headers: {
        ...(role ? { Authorization: `Bearer ${signAccessToken(users[role])}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {})
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const rooms = [];
    let parcels;
    let legacyId;
    let initialArrivals;
    await t.test("authenticated role boundaries for room reads/writes and unsupported deletion", async () => {
      for (const path of ["/parcel-rooms", "/parcel-rooms/active", `/parcel-rooms/${randomUUID()}`]) {
        assert.equal((await request(null, path)).status, 401);
        for (const role of ["RESIDENT", "SUPER_ADMIN"]) assert.equal((await request(role, path)).status, 403);
        for (const role of ["ADMIN", "GUARD"]) assert.ok([200, 404].includes((await request(role, path)).status));
      }
      for (const role of ["GUARD", "RESIDENT", "SUPER_ADMIN"]) {
        assert.equal((await request(role, "/parcel-rooms", "POST", { name: "Blocked" })).status, 403);
        assert.equal((await request(role, `/parcel-rooms/${randomUUID()}`, "PATCH", { name: "Blocked" })).status, 403);
        assert.equal((await request(role, `/parcel-rooms/${randomUUID()}/status`, "PATCH", { is_active: false })).status, 403);
      }
      assert.equal((await request(null, "/parcel-rooms", "POST", { name: "Blocked" })).status, 401);
      assert.equal((await request("ADMIN", `/parcel-rooms/${randomUUID()}`, "DELETE")).status, 404);
      assert.equal((await request("ADMIN", "/parcel-rooms/not-a-uuid")).status, 400);
    });
    await t.test("Admin creates, renames, deactivates/reactivates; normalized duplicates and bad inputs fail", async () => {
      for (const suffix of ["A", "B"]) {
        const result = await request("ADMIN", "/parcel-rooms", "POST", { name: `  ${marker}\t  ${suffix}  `, description: "  Lobby  " });
        assert.equal(result.status, 201);
        assert.equal(result.body.parcel_room.name, `${marker} ${suffix}`);
        assert.equal(result.body.parcel_room.description, "Lobby");
        assert.equal(result.body.parcel_room.is_active, true);
        rooms.push(result.body.parcel_room);
      }
      assert.equal((await request("ADMIN", "/parcel-rooms", "POST", { name: ` ${marker.toUpperCase()}  A ` })).status, 409);
      for (const body of [{}, { name: " " }, { name: 2 }, { name: "x".repeat(101) }, { name: "x", description: {} }, { name: "x", is_active: false }]) {
        assert.equal((await request("ADMIN", "/parcel-rooms", "POST", body)).status, 400);
      }
      assert.equal((await request("ADMIN", `/parcel-rooms/${rooms[0].id}`, "PATCH", { name: rooms[1].name })).status, 409);
      const rename = await request("ADMIN", `/parcel-rooms/${rooms[0].id}`, "PATCH", { name: `${marker} Renamed`, description: null });
      assert.equal(rename.status, 200);
      rooms[0] = rename.body.parcel_room;
      assert.equal((await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: "false" })).status, 400);
      assert.equal((await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: false })).body.parcel_room.is_active, false);
      assert.equal((await request("GUARD", "/parcel-rooms/active")).body.parcel_rooms.some((room) => room.id === rooms[0].id), false);
      assert.equal((await request("GUARD", `/parcel-rooms/${rooms[0].id}`)).body.parcel_room.is_active, false);
      assert.equal((await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: true })).body.parcel_room.is_active, true);
    });
    const batch = (entries) => ({ courier_id: courier, delivery_person_contact: "0123456789", parcels: entries });
    const entry = (suffix, roomId) => ({ unit_id: units[0], tracking_number: `${marker}-${suffix}`, ...(roomId !== undefined ? { parcel_room_id: roomId } : {}) });
    await t.test("registration rejects missing, invalid, nonexistent and inactive room IDs atomically", async () => {
      for (const roomId of [undefined, null, "bad-id", 1, {}, []]) {
        assert.equal((await request("GUARD", "/parcel-registration/sessions", "POST", batch([entry("bad", roomId)]))).status, 400);
      }
      assert.equal((await request("GUARD", "/parcel-registration/sessions", "POST", batch([entry("unknown", randomUUID())]))).status, 404);
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: false });
      assert.equal((await request("GUARD", "/parcel-registration/sessions", "POST", batch([entry("good", rooms[1].id), entry("inactive", rooms[0].id)]))).status, 400);
      assert.equal((await rawQuery("SELECT COUNT(*)::int AS count FROM parcels WHERE tracking_number LIKE $1", [`${marker}%`])).rows[0].count, 0);
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: true });
      assert.equal((await request("ADMIN", "/parcel-registration/sessions", "POST", batch([entry("blocked", rooms[0].id)]))).status, 403);
    });
    await t.test("multi-room registration preserves pending status, deadlines and arrival notifications", async () => {
      const result = await request("GUARD", "/parcel-registration/sessions", "POST", batch([entry("P1", rooms[0].id), entry("P2", rooms[1].id)]));
      assert.equal(result.status, 201);
      parcels = result.body.parcels.sort((a, b) => a.tracking_number.localeCompare(b.tracking_number));
      assert.equal(parcels.length, 2);
      assert.deepEqual(parcels.map((parcel) => parcel.parcel_room_id), rooms.map((room) => room.id));
      assert.ok(parcels.every((parcel) => parcel.parcel_status === "PENDING_COLLECTION" && parcel.collection_deadline));
      const notices = (await rawQuery("SELECT * FROM notifications WHERE related_parcel_id = ANY($1::uuid[]) ORDER BY notification_id", [parcels.map((parcel) => parcel.parcel_id)])).rows;
      initialArrivals = notices;
      assert.equal(notices.length, 2);
      assert.ok(notices.every((notice) => notice.type === "PARCEL_ARRIVAL" && notice.recipient_user_id === users.RESIDENT.user_id));
      for (const notice of notices) {
        const parcel = parcels.find((item) => item.parcel_id === notice.related_parcel_id);
        assert.ok(notice.message.includes(`at ${parcel.parcel_room_name}.`));
        assert.ok(!notice.message.includes(parcel.parcel_room_id));
        assert.equal(notice.is_read, false);
      }
      assert.equal((await request("RESIDENT", "/notifications")).body.notifications.length, 2);
      assert.equal((await request("OTHER_RESIDENT", "/notifications")).body.notifications.length, 0);
      assert.equal((await request("GUARD", "/parcel-registration/sessions", "POST", batch([entry("P1", rooms[0].id)]))).status, 409);
    });
    await t.test("legacy NULL rooms remain readable, and omitted room edits preserve assignments", async () => {
      legacyId = (await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact)
        VALUES ($1, $2, $3, $4, '0123456789') RETURNING parcel_id`, [`${marker}-legacy`, courier, units[0], users.GUARD.user_id])).rows[0].parcel_id;
      for (const role of ["ADMIN", "GUARD"]) {
        const detail = await request(role, `/parcels/${legacyId}`);
        assert.equal(detail.status, 200);
        assert.equal(detail.body.parcel.parcel_room_id, null);
        assert.equal(detail.body.parcel.parcel_room_name, null);
      }
      assert.equal((await request("RESIDENT", `/resident/parcels/${legacyId}`)).body.parcel.parcel_room_name, null);
      assert.equal((await request("ADMIN", `/parcels/${legacyId}`, "PATCH", { delivery_person_contact: "0199999999" })).body.parcel.parcel_room_id, null);
      assert.equal((await request("GUARD", `/parcels/${parcels[0].parcel_id}`, "PATCH", { delivery_person_contact: "0199999999" })).body.parcel.parcel_room_id, rooms[0].id);
    });
    await t.test("inactive historical rooms persist; Admin/Guard can reassign only to active rooms", async () => {
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: false });
      const before = (await request("GUARD", `/parcels/${parcels[0].parcel_id}`)).body.parcel;
      assert.equal(before.parcel_room_name, rooms[0].name);
      for (const role of ["ADMIN", "GUARD"]) {
        assert.equal((await request(role, `/parcels/${legacyId}`, "PATCH", { parcel_room_id: rooms[0].id })).status, 400);
        assert.equal((await request(role, `/parcels/${legacyId}`, "PATCH", { parcel_room_id: randomUUID() })).status, 404);
        assert.equal((await request(role, `/parcels/${legacyId}`, "PATCH", { parcel_room_id: "invalid" })).status, 400);
      }
      const after = (await request("GUARD", `/parcels/${parcels[0].parcel_id}`, "PATCH", { parcel_room_id: rooms[1].id })).body.parcel;
      assert.equal(after.parcel_room_id, rooms[1].id);
      for (const key of ["tracking_number", "courier_id", "unit_id", "status", "collection_deadline", "collected_at", "delivery_person_contact"]) assert.deepEqual(after[key], before[key]);
      assert.equal((await request("ADMIN", `/parcels/${legacyId}`, "PATCH", { parcel_room_id: rooms[1].id })).body.parcel.parcel_room_name, rooms[1].name);
      assert.equal((await request("RESIDENT", `/parcels/${legacyId}`, "PATCH", { parcel_room_id: rooms[1].id })).status, 403);
      assert.equal((await request("SUPER_ADMIN", `/parcels/${legacyId}`, "PATCH", { parcel_room_id: rooms[1].id })).status, 403);
      const afterNotices = (await rawQuery("SELECT * FROM notifications WHERE related_parcel_id = ANY($1::uuid[]) ORDER BY notification_id", [parcels.map((parcel) => parcel.parcel_id)])).rows;
      assert.deepEqual(afterNotices, initialArrivals, "Reassignment must not rewrite notification history or create another arrival");
    });
    await t.test("unit ownership, combined room/search/status filters and pagination stay enforced", async () => {
      assert.equal((await request("OTHER_RESIDENT", `/resident/parcels/${parcels[0].parcel_id}`)).status, 404);
      const own = await request("RESIDENT", `/resident/parcels?tab=pending&parcel_room_id=${rooms[1].id}&search=${marker}&limit=1&page=2`);
      assert.equal(own.status, 200);
      assert.equal(own.body.items.length, 1);
      assert.equal(own.body.pagination.total, 3);
      assert.equal(own.body.items[0].parcel_room_name, rooms[1].name);
      const staff = await request("ADMIN", `/parcels?parcel_room_id=${rooms[1].id}&search=${marker}&status=PENDING_COLLECTION&limit=1&page=2`);
      assert.equal(staff.status, 200);
      assert.equal(staff.body.data.length, 1);
      assert.equal(staff.body.pagination.total, 3);
      for (const suffix of ["unassigned-1", "unassigned-2"]) {
        await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact)
          VALUES ($1, $2, $3, $4, '0123456789')`, [`${marker}-${suffix}`, courier, units[0], users.GUARD.user_id]);
      }
      for (const role of ["ADMIN", "GUARD"]) {
        const unassigned = await request(role, `/parcels?parcel_room_id=unassigned&search=${marker}-unassigned&status=PENDING_COLLECTION&date_range=all&limit=1&page=2`);
        assert.equal(unassigned.status, 200);
        assert.equal(unassigned.body.pagination.total, 2);
        assert.equal(unassigned.body.pagination.page, 2);
        assert.equal(unassigned.body.data.length, 1);
        assert.equal(unassigned.body.data[0].parcel_room_id, null);
        assert.equal(unassigned.body.filters.parcel_room_id, "unassigned");
      }
      const unassignedExport = await request("ADMIN", `/parcels/export?parcel_room_id=unassigned&search=${marker}-unassigned&date_range=all`);
      assert.equal(unassignedExport.status, 200);
      assert.equal(unassignedExport.body.data.length, 2);
      assert.equal((await request("GUARD", "/parcels/export?parcel_room_id=unassigned")).status, 403);
      for (const role of ["ADMIN", "RESIDENT"]) {
        const prefix = role === "RESIDENT" ? "/resident/parcels" : "/parcels";
        assert.equal((await request(role, `${prefix}?parcel_room_id=bad-id`)).status, 400);
        assert.equal((await request(role, `${prefix}?parcel_room_id=${randomUUID()}`)).body[role === "RESIDENT" ? "items" : "data"].length, 0);
      }
      assert.equal((await request("GUARD", `/parcels/${legacyId}/status`, "PATCH", { status: "COLLECTED" })).status, 400);
    });
    await t.test("collection-date filters use Malaysia midnight, not registration dates, with role/pagination safety", async () => {
      await rawQuery("SAVEPOINT collection_date_filter_test");
      try {
        const prefix = `${marker}-collection-dates`;
        for (const [index, time] of ["2026-10-13T15:59:59Z", "2026-10-13T16:00:00Z", "2026-10-14T15:59:59Z", "2026-10-14T16:00:00Z", null].entries()) {
          await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact, parcel_room_id, status, created_at, collected_at)
            VALUES ($1, $2, $3, $4, '0123456789', $5, 'COLLECTED', '2026-09-01T00:00:00Z', $6)`, [`${prefix}-${index}`, courier, units[0], users.GUARD.user_id, rooms[1].id, time]);
        }
        const path = `/parcels?search=${prefix}&status=COLLECTED&parcel_room_id=${rooms[1].id}&collected_from=2026-10-14&collected_to=2026-10-14&limit=1&page=2`;
        for (const role of ["ADMIN", "GUARD"]) {
          const result = await request(role, path);
          assert.equal(result.status, 200); assert.equal(result.body.pagination.total, 2);
          assert.equal(result.body.pagination.page, 2); assert.equal(result.body.data.length, 1);
          assert.equal(result.body.filters.collected_from, "2026-10-14");
          assert.ok([`${prefix}-1`, `${prefix}-2`].includes(result.body.data[0].tracking_number));
          const allTime = await request(role, `/parcels?search=${prefix}&status=COLLECTED&parcel_room_id=${rooms[1].id}`);
          assert.equal(allTime.body.pagination.total, 5, "Existing unfiltered historical collections remain readable");
        }
        assert.equal((await request(null, path)).status, 401);
        for (const role of ["RESIDENT", "SUPER_ADMIN"]) assert.equal((await request(role, path)).status, 403);
        for (const suffix of ["collected_from=2026-02-29", "collected_from=2026-10-15&collected_to=2026-10-14", "collected_to[]=2026-10-14", "collected_from=bad%27%20OR%201=1"]) {
          assert.equal((await request("ADMIN", `/parcels?${suffix}`)).status, 400);
        }
        const registrationFiltered = await request("ADMIN", `${path}&date_from=2026-10-14`);
        assert.equal(registrationFiltered.body.pagination.total, 0, "Existing registration filter remains independent");
      } finally { await rawQuery("ROLLBACK TO SAVEPOINT collection_date_filter_test"); await rawQuery("RELEASE SAVEPOINT collection_date_filter_test"); }
    });
    await t.test("dispute details/list expose current room names without weakening ownership or staff privacy", async () => {
      const nullParcel = (await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact)
        VALUES ($1, $2, $3, $4, '0123456789') RETURNING parcel_id`, [`${marker}-dispute-null`, courier, units[0], users.GUARD.user_id])).rows[0].parcel_id;
      const disputes = [];
      for (const [index, parcelId] of [parcels[0].parcel_id, nullParcel].entries()) {
        disputes.push((await rawQuery(`INSERT INTO disputes (dispute_reference, parcel_id, resident_user_id, issue_type, description)
          VALUES ($1, $2, $3, 'DAMAGED', 'Transactional room integration fixture') RETURNING dispute_id`,
        [`${marker}-DSP-${index}`, parcelId, users.RESIDENT.user_id])).rows[0].dispute_id);
      }
      const read = async (role, id) => (await request(role, `/disputes/${id}`)).body.dispute;
      const evidenceId = (await rawQuery(`INSERT INTO dispute_evidence (dispute_id, stored_filename, original_filename, mime_type, file_size)
        VALUES ($1, $2, 'fixture.png', 'image/png', 1) RETURNING evidence_id`, [disputes[0], `${randomUUID()}.png`])).rows[0].evidence_id;
      for (const role of ["ADMIN", "GUARD", "RESIDENT"]) {
        assert.equal((await read(role, disputes[0])).parcel.parcel_room_name, rooms[1].name);
        assert.equal((await read(role, disputes[1])).parcel.parcel_room_name, null);
        const list = await request(role, `/disputes?search=${marker}-DSP`);
        assert.equal(list.status, 200);
        assert.equal(list.body.disputes.length, 2);
        assert.ok(list.body.disputes.every((dispute) => Object.hasOwn(dispute.parcel, "parcel_room_name")));
      }
      assert.equal((await read("RESIDENT", disputes[0])).resident, undefined);
      assert.equal((await read("RESIDENT", disputes[0])).evidence[0].evidence_id, evidenceId);
      assert.equal((await request("OTHER_RESIDENT", `/disputes/${disputes[0]}`)).status, 404);
      assert.equal((await request("OTHER_RESIDENT", `/disputes/${disputes[0]}/evidence/${evidenceId}`)).status, 404);
      assert.equal((await request("SUPER_ADMIN", `/disputes/${disputes[0]}`)).status, 403);
      assert.equal((await request(null, `/disputes/${disputes[0]}`)).status, 401);
      await request("ADMIN", `/parcels/${parcels[0].parcel_id}`, "PATCH", { parcel_room_id: rooms[1].id });
      const rename = await request("ADMIN", `/parcel-rooms/${rooms[1].id}`, "PATCH", { name: `${marker} Renamed Room` });
      rooms[1] = rename.body.parcel_room;
      await request("ADMIN", `/parcel-rooms/${rooms[1].id}/status`, "PATCH", { is_active: false });
      assert.equal((await read("GUARD", disputes[0])).parcel.parcel_room_name, rooms[1].name);
      await request("ADMIN", `/parcel-rooms/${rooms[1].id}/status`, "PATCH", { is_active: true });
      await request("ADMIN", `/parcels/${nullParcel}`, "PATCH", { parcel_room_id: rooms[1].id });
      assert.equal((await read("RESIDENT", disputes[1])).parcel.parcel_room_name, rooms[1].name);
      // Only fixture Resident/assigned Guard recipients are notified in this regression.
      assert.equal((await request("GUARD", `/disputes/${disputes[0]}/transition`, "PATCH", { status: "IN_REVIEW_ADMIN" })).status, 409);
      const review = await request("GUARD", `/disputes/${disputes[0]}/transition`, "PATCH", { status: "IN_REVIEW_GUARD" });
      assert.equal(review.status, 200);
      assert.equal(review.body.dispute.assigned_handler.user_id, users.GUARD.user_id);
      assert.equal((await request("ADMIN", `/disputes/${disputes[0]}/transition`, "PATCH", { status: "RESOLVED" })).status, 409);
      assert.equal((await request("GUARD", `/disputes/${disputes[0]}/guard-response`, "PATCH", { guard_response: "Review completed." })).status, 200);
      assert.equal((await request("GUARD", `/disputes/${disputes[0]}/messages`, "POST", { message: "Fixture staff reply" })).status, 201);
      assert.equal((await request("RESIDENT", `/disputes/${disputes[0]}/messages`, "POST", { message: "Fixture resident reply" })).status, 201);
      assert.equal((await request("GUARD", `/disputes/${disputes[0]}/transition`, "PATCH", { status: "RESOLVED" })).status, 200);
      assert.equal((await request("RESIDENT", `/disputes/${disputes[0]}/messages`, "POST", { message: "Not allowed after resolution" })).status, 409);
      const history = await request("RESIDENT", `/disputes/${disputes[0]}/history`);
      assert.equal(history.status, 200);
      assert.ok(history.body.history.some((event) => event.new_status === "RESOLVED"));
      assert.equal((await request("ADMIN", `/disputes/${disputes[1]}/transition`, "PATCH", { status: "IN_REVIEW_ADMIN" })).status, 200);
      assert.equal((await request("ADMIN", `/disputes/${disputes[1]}/admin-resolution-notes`, "PATCH", { admin_resolution_notes: "Fixture Admin resolution." })).status, 200);
      assert.equal((await request("ADMIN", `/disputes/${disputes[1]}/transition`, "PATCH", { status: "RESOLVED" })).status, 200);
    });
    await t.test("one QR collects multiple rooms and NULL/inactive assignments without workflow changes", async () => {
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: true });
      await request("ADMIN", `/parcels/${parcels[0].parcel_id}`, "PATCH", { parcel_room_id: rooms[0].id });
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: false });
      const unassigned = (await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, delivery_person_contact)
        VALUES ($1, $2, $3, $4, '0123456789') RETURNING parcel_id`, [`${marker}-QR-legacy`, courier, units[0], users.GUARD.user_id])).rows[0].parcel_id;
      const parcelIds = [...parcels.map((parcel) => parcel.parcel_id), unassigned];
      for (const role of ["GUARD", "ADMIN", "SUPER_ADMIN"]) {
        assert.equal((await request(role, "/resident/collections", "POST", { parcel_ids: parcelIds })).status, 403);
      }
      assert.equal((await request("OTHER_RESIDENT", "/resident/collections", "POST", { parcel_ids: parcelIds })).status, 404);
      const selection = await request("RESIDENT", "/resident/collections", "POST", { parcel_ids: parcelIds });
      assert.equal(selection.status, 201);
      assert.equal(selection.body.collection.parcel_count, 3);
      assert.equal(selection.body.collection.expires_in_seconds, 120);
      assert.deepEqual(new Set(selection.body.collection.parcels.map((parcel) => parcel.parcel_room_id)), new Set([...rooms.map((room) => room.id), null]));
      const token = selection.body.collection.token;
      for (const role of ["RESIDENT", "ADMIN", "SUPER_ADMIN"]) {
        assert.equal((await request(role, "/guard/collections/verify", "POST", { token })).status, 403);
      }
      const destination = (await request("ADMIN", "/parcel-rooms", "POST", { name: `${marker} QR Destination` })).body.parcel_room;
      await request("ADMIN", `/parcels/${parcels[0].parcel_id}`, "PATCH", { parcel_room_id: destination.id });
      await request("ADMIN", `/parcel-rooms/${rooms[1].id}/status`, "PATCH", { is_active: false });
      const started = await request("GUARD", "/guard/collections/verify", "POST", { token });
      assert.equal(started.status, 200);
      const session = started.body.verification_session;
      assert.equal(session.status, "AWAITING_VERIFICATION");
      assert.equal(session.parcels.length, 3);
      assert.equal((await rawQuery("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id=ANY($1::uuid[]) AND status='COLLECTED'", [parcelIds])).rows[0].count, 0);
      const image = await readFile(new URL("../assets/email/password-reset-illustration.jpg", import.meta.url));
      for (const parcel of session.parcels) {
        const endpoint = `/collection-verifications/${session.session_id}/parcels/${parcel.parcel_id}`;
        assert.equal((await request("RESIDENT", `${endpoint}/barcode`, "POST", { scanned_tracking_number: parcel.registered_tracking_number })).status, 200);
        const form = new FormData(); form.append("photo", new Blob([image], { type: "image/jpeg" }), "fixture.jpg");
        const uploaded = await fetch(`${base}${endpoint}/photo`, { method: "PUT", headers: { Authorization: `Bearer ${signAccessToken(users.RESIDENT)}` }, body: form });
        assert.equal(uploaded.status, 200);
        const row = (await rawQuery("SELECT photo_filename FROM collection_verification_evidence WHERE session_id=$1 AND parcel_id=$2", [session.session_id, parcel.parcel_id])).rows[0];
        photoFiles.add(path.join(COLLECTION_PHOTO_DIR, row.photo_filename));
      }
      for (const role of ["ADMIN", "GUARD"]) assert.equal((await request(role, `/collection-verifications/${session.session_id}/confirm`, "POST", {})).status, 403);
      const collected = await request("RESIDENT", `/collection-verifications/${session.session_id}/confirm`, "POST", {});
      assert.equal(collected.status, 200);
      assert.equal(collected.body.collection.parcels.length, 3);
      assert.ok(collected.body.collection.parcels.every((parcel) => parcel.collected_at));
      const retainedEvidence = collected.body.verification_session.parcels;
      assert.equal(retainedEvidence.filter((parcel) => parcel.parcel_room_name).length, 2);
      assert.equal(retainedEvidence.find((parcel) => parcel.parcel_id === parcels[0].parcel_id).parcel_room_name, destination.name);
      assert.equal(retainedEvidence.find((parcel) => parcel.parcel_id === parcels[1].parcel_id).parcel_room_name, rooms[1].name);
      assert.equal(retainedEvidence.find((parcel) => parcel.parcel_id === unassigned).parcel_room_name, null);
      assert.equal((await request("GUARD", "/guard/collections/verify", "POST", { token })).status, 409);
      assert.equal((await request("RESIDENT", `/resident/parcels/${parcels[0].parcel_id}`)).body.parcel.display_status, "Collected");
    });
    await t.test("audit actions include truthful assignment before/after and Guard excludes room configuration", async () => {
      const logs = (await rawQuery("SELECT * FROM audit_logs WHERE entity_reference LIKE $1", [`${marker}%`])).rows;
      for (const action of ["Parcel Room Created", "Parcel Room Updated", "Parcel Room Activated", "Parcel Room Deactivated", "Parcel Room Assignment Changed", "Parcel Registered", "Parcel Collected"]) {
        assert.ok(logs.some((log) => log.action === action), action);
      }
      const assignment = logs.find((log) => log.action === "Parcel Room Assignment Changed" && log.actor_role === "GUARD");
      assert.equal(assignment.actor_user_id, users.GUARD.user_id);
      assert.equal(assignment.metadata.previous_parcel_room_id, rooms[0].id);
      assert.equal(assignment.metadata.parcel_room_id, rooms[1].id);
      assert.ok(assignment.created_at);
      const guard = await request("GUARD", `/audit-logs?search=${marker}&limit=100`);
      assert.equal(guard.status, 200);
      assert.ok(guard.body.audit_logs.some((log) => log.action === "Parcel Room Assignment Changed"));
      assert.ok(guard.body.audit_logs.every((log) => !["Parcel Room Created", "Parcel Room Updated", "Parcel Room Activated", "Parcel Room Deactivated"].includes(log.action)));
      assert.ok((await request("ADMIN", `/audit-logs?search=${marker}&limit=100`)).body.audit_logs.some((log) => log.action === "Parcel Room Created"));
    });
    await t.test("room audit filters/pagination/export retain role boundaries and historical metadata", async () => {
      const actions = ["Parcel Room Created", "Parcel Room Updated", "Parcel Room Activated", "Parcel Room Deactivated", "Parcel Room Assignment Changed"];
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
      const all = await request("ADMIN", `/audit-logs?search=${marker}&limit=100`);
      assert.equal(all.status, 200);
      assert.ok(actions.every((action) => all.body.filter_options.actions.includes(action)));
      assert.ok(!all.body.filter_options.roles.includes("SUPER_ADMIN"));
      const assignment = all.body.audit_logs.find((log) => log.action === "Parcel Room Assignment Changed" && log.metadata.parcel_room_name === `${marker} B`);
      assert.ok(assignment, "Recorded previous room names must not be guessed from a later rename");
      assert.notEqual(assignment.metadata.parcel_room_name, rooms[1].name);
      const query = `search=${marker}&date=${date}&action=${encodeURIComponent(actions[0])}&action=${encodeURIComponent(actions[4])}`;
      const first = await request("ADMIN", `/audit-logs?${query}&limit=1&page=1`);
      const second = await request("ADMIN", `/audit-logs?${query}&limit=1&page=2`);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.body.audit_logs.length, 1);
      assert.equal(second.body.audit_logs.length, 1);
      assert.notEqual(first.body.audit_logs[0].audit_log_id, second.body.audit_logs[0].audit_log_id);
      assert.ok(first.body.audit_logs.every((log) => [actions[0], actions[4]].includes(log.action)));
      const guard = await request("GUARD", `/audit-logs?search=${marker}&limit=100`);
      assert.equal(guard.status, 200);
      assert.ok(guard.body.filter_options.actions.includes(actions[4]));
      assert.ok(!guard.body.filter_options.actions.includes(actions[0]));
      assert.equal((await request("GUARD", `/audit-logs?search=${marker}&action=${encodeURIComponent(actions[0])}`)).body.audit_logs.length, 0);
      for (const role of ["RESIDENT", "SUPER_ADMIN"]) assert.equal((await request(role, "/audit-logs")).status, 403);
      assert.equal((await request("GUARD", `/audit-logs/export?${query}`)).status, 403);
      const csvResponse = await fetch(`${base}/audit-logs/export?${query}`, { headers: { Authorization: `Bearer ${signAccessToken(users.ADMIN)}` } });
      assert.equal(csvResponse.status, 200);
      assert.match(csvResponse.headers.get("content-type"), /text\/csv/);
      assert.match(csvResponse.headers.get("content-disposition"), /parcel-nexus-audit-trail/);
      const csv = await csvResponse.text();
      assert.ok(csv.includes(actions[0]) && csv.includes(actions[4]));
      assert.ok(!csv.includes("Dispute Message Sent"));
      assert.ok(!csv.includes("password_hash") && !csv.includes("smtp"));
    });
    await t.test("dashboard room totals, Malaysia date ranges, report formats and role boundaries", async () => {
      const dashboardRooms = [];
      for (const suffix of ["Active", "Inactive", "Empty"]) {
        dashboardRooms.push((await rawQuery(`INSERT INTO parcel_rooms (name, is_active) VALUES ($1, $2) RETURNING id, name`,
          [`${marker} Dashboard ${suffix}`, suffix !== "Inactive"])).rows[0]);
      }
      const fixtures = [
        ["active", dashboardRooms[0].id, "PENDING_COLLECTION", null],
        ["second-active", dashboardRooms[0].id, "PENDING_COLLECTION", null],
        ["overdue", dashboardRooms[1].id, "PENDING_COLLECTION", "2000-01-01"],
        ["unassigned", null, "PENDING_COLLECTION", null],
        ["collected", dashboardRooms[1].id, "COLLECTED", null],
        ["cancelled", dashboardRooms[0].id, "CANCELLED", null],
        ["deleted", dashboardRooms[0].id, "PENDING_COLLECTION", null]
      ];
      for (const [suffix, roomId, status, deadline] of fixtures) {
        await rawQuery(`INSERT INTO parcels (tracking_number, courier_id, unit_id, registered_by, parcel_room_id, status,
          collection_deadline, created_at, deleted_at, delivery_person_contact) VALUES ($1, $2, $3, $4, $5, $6, $7, '2000-01-02T16:00:00Z', $8, '0123456789')`,
        [`${marker}-dashboard-${suffix}`, courier, units[0], users.GUARD.user_id, roomId, status, deadline,
          suffix === "deleted" ? new Date() : null]);
      }
      const expected = (await rawQuery(`SELECT COUNT(*)::int AS count FROM parcels WHERE deleted_at IS NULL
        AND status IN ('PENDING', 'PENDING_COLLECTION')`)).rows[0].count;
      let distribution;
      for (const [role, endpoint, period] of [["ADMIN", "admin", "day"], ["GUARD", "guard", "today"]]) {
        for (const selected of [period, "week", "month"]) {
          const response = await request(role, `/dashboard/${endpoint}?period=${selected}&start_date=2000-01-03`);
          assert.equal(response.status, 200);
          const data = response.body;
          const bars = data.parcel_room_distribution;
          assert.equal(bars.reduce((sum, room) => sum + room.count, 0), expected);
          assert.equal(role === "ADMIN" ? data.kpis.pending_collection.value : data.summary.pending_collection, expected);
          assert.equal(bars.find((room) => room.parcel_room_name === dashboardRooms[0].name).count, 2);
          assert.deepEqual(bars.find((room) => room.parcel_room_name === dashboardRooms[1].name),
            { parcel_room_name: dashboardRooms[1].name, is_active: false, count: 1 });
          assert.ok(bars.find((room) => room.parcel_room_name === "Not Assigned").count >= 1);
          assert.ok(!bars.some((room) => room.parcel_room_name === dashboardRooms[2].name));
          assert.ok(!JSON.stringify(bars).includes(dashboardRooms[0].id));
          assert.equal(role === "ADMIN" ? data.kpis.total_parcels.value : data.summary.parcels_logged, 6);
          if (distribution) assert.deepEqual(bars, distribution, "Current distribution must not change with historical date filters");
          distribution = bars;
        }
        assert.equal((await request(role, `/dashboard/${endpoint}?start_date=invalid`)).status, 400);
      }
      for (const endpoint of ["admin", "guard"]) {
        assert.equal((await request(null, `/dashboard/${endpoint}`)).status, 401);
        for (const role of ["RESIDENT", "SUPER_ADMIN", endpoint === "admin" ? "GUARD" : "ADMIN"])
          assert.equal((await request(role, `/dashboard/${endpoint}`)).status, 403);
      }
      const exportPath = "/dashboard/admin/reports/export?report_type=parcel_records&period=day&start_date=2000-01-03";
      const exportRequest = (path, format = "csv") => fetch(`${base}${path}&format=${format}`, {
        headers: { Authorization: `Bearer ${signAccessToken(users.ADMIN)}` }
      });
      for (const roomId of [dashboardRooms[0].id, dashboardRooms[1].id, "unassigned", randomUUID(), ""]) {
        const response = await exportRequest(`${exportPath}${roomId ? `&parcel_room_id=${roomId}` : ""}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /text\/csv/);
        const csv = await response.text();
        assert.ok(csv.includes("Updated At,Parcel Room"));
        assert.ok(!csv.includes(dashboardRooms[0].id));
        assert.ok(!csv.includes("dashboard-deleted"));
        const lines = csv.split("\n").filter((line) => line.startsWith(`${marker}-dashboard-`));
        const expectedLines = roomId === dashboardRooms[0].id ? 3 : roomId === dashboardRooms[1].id ? 2 : roomId === "unassigned" ? 1 : roomId ? 0 : 6;
        assert.equal(lines.length, expectedLines);
        if (roomId === "unassigned") assert.ok(lines.every((line) => line.endsWith(",Not Assigned")));
        if (roomId === dashboardRooms[1].id) assert.ok(lines.every((line) => line.endsWith(`,${dashboardRooms[1].name}`)));
        const pdf = await exportRequest(`${exportPath}${roomId ? `&parcel_room_id=${roomId}` : ""}`, "pdf");
        assert.equal(pdf.status, 200);
        assert.match(pdf.headers.get("content-type"), /application\/pdf/);
        const pdfContent = Buffer.from(await pdf.arrayBuffer());
        assert.equal(pdfContent.subarray(0, 5).toString(), "%PDF-");
        if (!roomId && process.env.PARCEL_ROOM_PDF_OUTPUT) await writeFile(process.env.PARCEL_ROOM_PDF_OUTPUT, pdfContent);
      }
      assert.equal((await exportRequest(exportPath.replace("2000-01-03", "2000-01-02"))).status, 200);
      const outside = await (await exportRequest(exportPath.replace("2000-01-03", "2000-01-02"))).text();
      assert.ok(!outside.includes(`${marker}-dashboard-`), "Malaysia-local midnight boundary must be respected");
      const summary = await (await exportRequest(exportPath.replace("parcel_records", "dashboard_summary"))).text();
      assert.ok(summary.includes("Parcel Distribution by Room"));
      assert.ok(summary.includes(dashboardRooms[1].name));
      const summaryPdf = await exportRequest(exportPath.replace("parcel_records", "dashboard_summary"), "pdf");
      assert.equal(summaryPdf.status, 200);
      const summaryPdfContent = Buffer.from(await summaryPdf.arrayBuffer());
      assert.equal(summaryPdfContent.subarray(0, 5).toString(), "%PDF-");
      if (process.env.PARCEL_ROOM_PDF_OUTPUT) await writeFile(`${process.env.PARCEL_ROOM_PDF_OUTPUT}.summary.pdf`, summaryPdfContent);
      const account = await (await exportRequest(exportPath.replace("parcel_records", "user_account_summary"))).text();
      assert.ok(account.includes("Role And Status Summary") && !account.includes("Parcel Room"));
      for (const value of ["bad-id", "' OR 1=1--", "unassigned&parcel_room_id=unassigned"])
        assert.equal((await exportRequest(`${exportPath}&parcel_room_id=${encodeURIComponent(value)}`)).status, 400);
      assert.equal((await exportRequest(`${exportPath.replace("parcel_records", "dashboard_summary")}&parcel_room_id=unassigned`)).status, 400);
      for (const role of ["GUARD", "RESIDENT", "SUPER_ADMIN"]) assert.equal((await request(role, `${exportPath}&format=csv`)).status, 403);
      const combined = `/parcels?parcel_room_id=${dashboardRooms[1].id}&search=${marker}-dashboard&status=COLLECTED&limit=1&page=1`;
      const list = await request("ADMIN", combined);
      assert.equal(list.status, 200);
      assert.equal(list.body.data.length, 1);
      const parcelExport = await request("ADMIN", combined.replace("/parcels?", "/parcels/export?"));
      assert.equal(parcelExport.body.count, 1);
      assert.equal(parcelExport.body.data[0].parcel_room_name, dashboardRooms[1].name);
      assert.equal(parcelExport.body.data[0].tracking_number, list.body.data[0].tracking_number);
      for (const name of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)"]) {
        await rawQuery("UPDATE parcel_rooms SET name = $1 WHERE id = $2", [name, dashboardRooms[0].id]);
        const literal = await (await exportRequest(`${exportPath}&parcel_room_id=${dashboardRooms[0].id}`)).text();
        assert.ok(literal.includes(`,'${name}`), "Parcel record room cells must be literal spreadsheet text");
        const literalSummary = await (await exportRequest(exportPath.replace("parcel_records", "dashboard_summary"))).text();
        assert.ok(literalSummary.includes(`'${name},2`), "Summary room cells must be literal spreadsheet text");
        const rawExport = await request("ADMIN", `/parcels/export?parcel_room_id=${dashboardRooms[0].id}`);
        assert.ok(rawExport.body.data.every((row) => row.parcel_room_name === name), "API/stored names must remain unchanged");
      }
    });
    await t.test("database constraints and failed audit writes leave no false successful operations", async () => {
      await request("ADMIN", `/parcel-rooms/${rooms[0].id}/status`, "PATCH", { is_active: true });
      failAudit = true;
      await assert.rejects(createParcelRoom({ requester: users.ADMIN, input: { name: `${marker} Failed audit` } }), /Injected audit failure/);
      assert.equal((await request("ADMIN", `/parcels/${legacyId}`, "PATCH", { parcel_room_id: rooms[0].id })).status, 500);
      failAudit = false;
      assert.equal((await request("ADMIN", `/parcels/${legacyId}`)).body.parcel.parcel_room_id, rooms[1].id);
      assert.equal((await rawQuery("SELECT COUNT(*)::int AS count FROM parcel_rooms WHERE name = $1", [`${marker} Failed audit`])).rows[0].count, 0);
      const constraints = await rawQuery(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = 'parcels'::regclass AND conname = 'parcels_parcel_room_id_fkey'`);
      assert.match(constraints.rows[0].definition, /ON DELETE RESTRICT/);
      for (const [sql, values, code] of [
        ["UPDATE parcels SET parcel_room_id = $1 WHERE parcel_id = $2", [randomUUID(), legacyId], "23503"],
        ["INSERT INTO parcel_rooms (name) VALUES ($1)", [rooms[1].name.toUpperCase()], "23505"],
        ["INSERT INTO parcel_rooms (name) VALUES ($1)", ["  Non canonical   name "], "23514"]
      ]) {
        await query("BEGIN");
        await assert.rejects(rawQuery(sql, values), { code });
        await query("ROLLBACK");
      }
    });
    assert.equal(savepoints.length, 0);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    t.mock.restoreAll();
    await rawQuery("ROLLBACK");
    const after = (await rawQuery(`SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM parcels) AS parcels,
      (SELECT COUNT(*)::int FROM parcel_rooms) AS rooms,
      (SELECT COUNT(*)::int FROM audit_logs) AS audits,
      (SELECT COUNT(*)::int FROM disputes) AS disputes,
      (SELECT COUNT(*)::int FROM notifications) AS notifications`)).rows[0];
    db.release();
    await pool.end();
    for (const file of photoFiles) await unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
    assert.deepEqual(after, snapshot, "No permanent fixture records may remain");
  }
});
