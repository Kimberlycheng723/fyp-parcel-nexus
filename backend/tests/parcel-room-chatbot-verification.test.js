import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { createChatbotParcelTools } from "../src/services/chatbotParcel.service.js";
import { createChatbotService } from "../src/services/chatbot.service.js";

const resident = { user_id: "11111111-1111-4111-8111-111111111111", role: "RESIDENT" };
const otherResident = { user_id: "22222222-2222-4222-8222-222222222222", role: "RESIDENT" };
const parcels = [
  { tracking_number: "SPX123", parcel_room_name: "Lobby Room", status: "PENDING_COLLECTION", is_overdue: false },
  { tracking_number: "DHL456", parcel_room_name: "Historical Room", status: "PENDING_COLLECTION", is_overdue: true },
  { tracking_number: "LEGACY789", parcel_room_name: null, status: "PENDING_COLLECTION", is_overdue: false }
];

test("five room questions preserve real tool-result contracts through deterministic Gemini mocks", async () => {
  const scenarios = [
    ["Where is my parcel SPX123?", [{ name: "get_parcel_by_tracking_number", args: { tracking_number: "SPX123" } }], "SPX123 is waiting in Lobby Room."],
    ["Which room contains my pending parcels?", [{ name: "get_parcel_locations", args: {} }], "SPX123: Lobby Room. DHL456: Historical Room. LEGACY789: no room assigned; ask the Guard."],
    ["How many parcels are waiting for me?", [{ name: "get_pending_parcel_count", args: {} }], "You have 3 pending parcels, including 1 overdue parcel."],
    ["Where can I collect my parcels?", [{ name: "get_parcel_locations", args: {} }], "Collect SPX123 from Lobby Room and DHL456 from Historical Room. Ask the Guard about LEGACY789."],
    ["Are my parcels stored in different rooms?", [{ name: "get_parcel_locations", args: {} }, { name: "get_pending_parcel_count", args: {} }], "Two of your 3 pending parcels have different assigned rooms; LEGACY789 has no room assigned."]
  ];
  for (const [message, calls, expectedReply] of scenarios) {
    const queries = [], requests = [];
    const executeTool = createChatbotParcelTools({ query: async (query) => {
      queries.push(query);
      assert.match(query.text, /resident.user_id = \$1/);
      assert.match(query.text, /resident.unit_id = p.unit_id/);
      assert.equal(query.values[0], resident.user_id);
      assert.match(query.text.trim(), /^SELECT/);
      return { rows: query.text.includes("COUNT(*)") ? [{ pending_count: 3, overdue_count: 1 }]
        : query.text.includes("LOWER(p.tracking_number)") ? parcels.filter((parcel) => parcel.tracking_number === query.values[1]) : parcels };
    } });
    const service = createChatbotService({ executeTool,
      getSettings: () => ({ apiKey: "mock-only", model: "gemini-3.5-flash-lite" }),
      createClient: () => ({ models: { generateContent: async (request) => {
        requests.push(request);
        return { candidates: [{ finishReason: "STOP", content: { role: "model", parts: requests.length === 1
          ? calls.map((call, index) => ({ functionCall: { ...call, id: `call-${index}` } }))
          : [{ text: expectedReply }] } }] };
      } } })
    });
    assert.deepEqual(await service({ requester: resident, input: { message } }), { reply: expectedReply });
    assert.equal(queries.length, calls.length);
    const results = requests[1].contents[2].parts.map((part) => part.functionResponse.response.result);
    assert.ok(!JSON.stringify(results).includes("parcel_room_id"));
    for (const result of results.filter((item) => item.parcels)) {
      assert.ok(result.parcels.every((parcel) => parcel.status === "PENDING_COLLECTION"));
      assert.equal(result.parcels.find((parcel) => parcel.tracking_number === "SPX123").parcel_room_name, "Lobby Room");
      if (result.parcels.length > 1) {
        assert.equal(result.parcels[1].parcel_room_name, "Historical Room");
        assert.equal(result.parcels[2].parcel_room_name, null);
        assert.match(result.location_note, /If no room is assigned, ask the Guard/);
      }
    }
  }
});

// These SELECT-only CTEs shadow tables for the query, without inserting fixture records.
const fixtureSql = `WITH
  users (user_id, unit_id, role, status, first_name, last_name, email) AS (VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'RESIDENT', 'ACTIVE', 'Test', 'Resident', 'test@example.invalid'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'RESIDENT', 'ACTIVE', 'Other', 'Resident', 'other@example.invalid')),
  units (unit_id, full_unit_code) AS (VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'A-10-01'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'B-10-01')),
  courier_companies (courier_id, courier_name, courier_code) AS (VALUES
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid, 'Test Courier', 'TEST')),
  parcel_rooms (id, name, is_active) AS (VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid, 'Lobby Room', TRUE),
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid, 'Historical Room', FALSE)),
  parcel_values (n, tracking_number, owner, room, status, overdue, deleted) AS (VALUES
    (1, 'SPX123', 1, 1, 'PENDING_COLLECTION', FALSE, FALSE),
    (2, 'DHL456', 1, 2, 'PENDING_COLLECTION', TRUE, FALSE),
    (3, 'LEGACY789', 1, 0, 'PENDING', FALSE, FALSE),
    (4, 'COLLECTED100', 1, 2, 'COLLECTED', FALSE, FALSE),
    (5, 'CANCELLED101', 1, 1, 'CANCELLED', TRUE, FALSE),
    (6, 'DELETED102', 1, 1, 'PENDING_COLLECTION', FALSE, TRUE),
    (7, 'OTHER103', 2, 2, 'PENDING_COLLECTION', FALSE, FALSE)),
  parcels AS (SELECT
    ('ffffffff-ffff-4fff-8fff-' || lpad(n::text, 12, '0'))::uuid AS parcel_id,
    tracking_number, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid AS courier_id,
    CASE owner WHEN 1 THEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid ELSE 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid END AS unit_id,
    CASE room WHEN 1 THEN 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid WHEN 2 THEN 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid ELSE NULL END AS parcel_room_id,
    '11111111-1111-4111-8111-111111111111'::uuid AS registered_by, status,
    NOW() + CASE WHEN overdue THEN INTERVAL '-1 day' ELSE INTERVAL '1 day' END AS collection_deadline,
    TIMESTAMPTZ '2000-01-03 08:00:00+08' + n * INTERVAL '1 minute' AS created_at,
    TIMESTAMPTZ '2000-01-03 08:00:00+08' AS updated_at,
    CASE WHEN status = 'COLLECTED' THEN TIMESTAMPTZ '2000-01-03 09:00:00+08' ELSE NULL END AS collected_at,
    CASE WHEN deleted THEN NOW() ELSE NULL END AS deleted_at,
    '0123456789' AS delivery_person_contact, NULL::text AS parcel_photo_url
    FROM parcel_values)
`;

test("focused PostgreSQL chatbot/report verification uses read-only SELECT fixtures", {
  skip: process.env.PARCEL_ROOM_VERIFICATION_DATABASE !== "true"
}, async (t) => {
  const { pool } = await import("../src/db/pool.js");
  const { generateAdminReport } = await import("../src/services/dashboard.service.js");
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
    const query = async (input, values) => {
      const options = typeof input === "string" ? { text: input, values } : input;
      assert.match(options.text.trim(), /^SELECT/);
      assert.doesNotMatch(options.text, /INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM/);
      return db.query({ ...options, text: fixtureSql + options.text });
    };
    const tools = createChatbotParcelTools({ query });
    await t.test("multiple, inactive and NULL rooms retain correct counts/statuses without internal IDs", async () => {
      const count = await tools({ name: "get_pending_parcel_count", requester: resident });
      assert.deepEqual(count, { pending_count: 3, overdue_count: 1 });
      const locations = await tools({ name: "get_parcel_locations", requester: resident });
      assert.equal(locations.parcels.length, 3);
      assert.deepEqual(locations.parcels.map((parcel) => parcel.parcel_room_name), [null, "Historical Room", "Lobby Room"]);
      assert.ok(locations.parcels.every((parcel) => parcel.status === "PENDING_COLLECTION"));
      assert.equal(locations.parcels[1].is_overdue, true);
      assert.equal(locations.has_more, false);
      assert.ok(!JSON.stringify(locations).includes("dddddddd"));
      assert.ok(!JSON.stringify(locations).includes("eeeeeeee"));
      const bounded = await tools({ name: "get_parcel_locations", requester: resident, args: { limit: 1 } });
      assert.equal(bounded.parcels.length, 1);
      assert.equal(bounded.has_more, true);
      assert.equal(bounded.storage_location_available, false);
      const collected = await tools({ name: "get_collection_history", requester: resident });
      assert.equal(collected.parcels[0].tracking_number, "COLLECTED100");
      assert.equal(collected.parcels[0].parcel_room_name, "Historical Room");
      assert.equal(collected.parcels[0].status, "COLLECTED");
    });
    await t.test("exact tracking lookup, unit privacy, deleted/cancelled exclusions and roles remain enforced", async () => {
      const lookup = (tracking, requester = resident) => tools({ name: "get_parcel_by_tracking_number", requester, args: { tracking_number: tracking } });
      assert.equal((await lookup("spx123")).parcels[0].parcel_room_name, "Lobby Room");
      for (const tracking of ["OTHER103", "CANCELLED101", "DELETED102", "DOES-NOT-EXIST", "' OR 1=1 -- %"])
        assert.equal((await lookup(tracking)).parcels.length, 0);
      assert.equal((await lookup("OTHER103", otherResident)).parcels[0].tracking_number, "OTHER103");
      assert.equal((await lookup("SPX123", otherResident)).parcels.length, 0);
      for (const role of ["ADMIN", "GUARD", "SUPER_ADMIN"])
        await assert.rejects(tools({ name: "get_parcel_locations", requester: { ...resident, role } }), { status: 403 });
      assert.equal((await tools({ name: "get_parcel_status", requester: resident })).parcel.tracking_number, "COLLECTED100");
    });
    await t.test("parcel report renders Cancelled without changing raw status, filters or other labels", async () => {
      t.mock.method(pool, "query", query);
      const options = { requester: { role: "ADMIN", first_name: "Test", email: "test@example.invalid" },
        reportType: "parcel_records", period: "day", startDate: "2000-01-03" };
      const csv = await generateAdminReport({ ...options, format: "csv" });
      assert.ok(!csv.error);
      const rows = csv.content.split("\n");
      assert.match(rows.find((row) => row.startsWith("CANCELLED101,")), /^CANCELLED101,CANCELLED,Cancelled,No,/);
      assert.match(rows.find((row) => row.startsWith("SPX123,")), /^SPX123,PENDING_COLLECTION,Pending Collection,No,/);
      assert.match(rows.find((row) => row.startsWith("DHL456,")), /^DHL456,PENDING_COLLECTION,Overdue,Yes,/);
      assert.match(rows.find((row) => row.startsWith("COLLECTED100,")), /^COLLECTED100,COLLECTED,Collected,No,/);
      assert.ok(!csv.content.includes("DELETED102"));
      const roomCsv = await generateAdminReport({ ...options, format: "csv", parcelRoomId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
      assert.ok(roomCsv.content.includes("CANCELLED101,CANCELLED,Cancelled"));
      assert.ok(!roomCsv.content.includes("DHL456"));
      const outside = await generateAdminReport({ ...options, format: "csv", startDate: "2000-01-02" });
      assert.ok(!outside.content.includes("CANCELLED101"));
      const pdf = await generateAdminReport({ ...options, format: "pdf" });
      assert.equal(pdf.content.subarray(0, 5).toString(), "%PDF-");
      if (process.env.PARCEL_ROOM_VERIFICATION_PDF) await writeFile(process.env.PARCEL_ROOM_VERIFICATION_PDF, pdf.content);
      t.mock.restoreAll();
    });
  } finally {
    t.mock.restoreAll();
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
  }
});
