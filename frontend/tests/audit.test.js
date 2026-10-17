import assert from "node:assert/strict";
import test from "node:test";
import { auditDayHeading, auditDayKey, auditDescription, auditEntityReference, auditExportFilename, auditLabel, auditMetadataRows, auditQuery, malaysiaAuditDate } from "../src/utils/audit.js";

test("audit filters preserve exact API action labels and repeated action parameters", () => {
  const query = new URLSearchParams(auditQuery({
    search: "  DSP-001010  ", date: "2026-10-11", role: "GUARD",
    actions: ["Parcel Edited", "Dispute Raised", "Parcel Edited"], page: 2, limit: 50
  }));
  assert.equal(query.get("search"), "DSP-001010");
  assert.equal(query.get("date"), "2026-10-11");
  assert.deepEqual(query.getAll("action"), ["Parcel Edited", "Dispute Raised"]);
  assert.equal(query.get("role"), "GUARD");
  assert.equal(query.get("page"), "2");
  assert.equal(query.get("limit"), "50");
  assert.equal(query.has("date_from"), false);
});

test("empty filters and export filters do not introduce pagination", () => {
  assert.equal(auditQuery(), "");
  const params = new URLSearchParams(auditQuery({ actions: ["Login"] }));
  assert.equal(params.has("page"), false);
  assert.equal(params.has("limit"), false);
});

test("labels preserve API human-readable actions and gracefully humanize codes", () => {
  assert.equal(auditLabel("Parcel Registered"), "Parcel Registered");
  assert.equal(auditLabel("IN_REVIEW_GUARD"), "In Review Guard");
  assert.equal(auditLabel("SYSTEM"), "System");
  assert.equal(auditLabel(null), "Not available");
});

test("date grouping uses Malaysia dates across the UTC midnight boundary", () => {
  assert.equal(auditDayKey("2026-10-10T18:00:00Z"), "2026-10-11");
  assert.match(auditDayHeading("2026-10-10T18:00:00Z", new Date("2026-10-11T02:00:00Z")), /^Today/);
  assert.match(auditDayHeading("2026-10-09T18:00:00Z", new Date("2026-10-11T02:00:00Z")), /^Yesterday/);
  assert.equal(malaysiaAuditDate(null), "Not available");
  assert.equal(malaysiaAuditDate("invalid"), "Not available");
});

test("details display safe changes without exposing private content or credentials", () => {
  const rows = auditMetadataRows({
    tracking_number: "TRACK-EXAMPLE", password_hash: "hidden", token: "hidden",
    message: "private text", evidence: ["private path"], smtp: { secret: "hidden" },
    changes: { unit: { before: "A-01", after: "A-02" }, password: { before: "hidden", after: "hidden" }, description_updated: true },
    changed_fields: ["guard_response", "password"], unknown_field: "hidden"
  });
  assert.deepEqual(rows, [
    { label: "Tracking Number", value: "TRACK-EXAMPLE" },
    { label: "Unit changed", value: "A-01 -> A-02" },
    { label: "Description Updated", value: "Yes" },
    { label: "Updated fields", value: "Guard Response" }
  ]);
  assert.deepEqual(auditMetadataRows(null), []);
  assert.deepEqual(auditMetadataRows([]), []);
});

test("export preserves the server filename and safely handles missing/malformed values", () => {
  assert.equal(auditExportFilename('attachment; filename="parcel-nexus-audit-trail-2026-10-11.csv"'), "parcel-nexus-audit-trail-2026-10-11.csv");
  assert.equal(auditExportFilename("attachment; filename*=UTF-8''audit%20trail.csv"), "audit trail.csv");
  assert.equal(auditExportFilename('attachment; filename="../../audit.csv"'), "audit.csv");
  assert.equal(auditExportFilename(""), "parcel-nexus-audit-trail.csv");
  assert.equal(auditExportFilename("attachment; filename*=UTF-8''%bad"), "parcel-nexus-audit-trail.csv");
});

test("room assignments use recorded before/after names, never raw IDs or current-name guesses", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(auditMetadataRows({ tracking_number: "SPX1", previous_parcel_room_id: null, previous_parcel_room_name: null, parcel_room_id: id, parcel_room_name: "Lobby Room" }), [
    { label: "Tracking Number", value: "SPX1" }, { label: "Previous Room", value: "Not Assigned" }, { label: "New Room", value: "Lobby Room" }
  ]);
  const rows = auditMetadataRows({ previous_parcel_room_id: id, parcel_room_id: id });
  assert.deepEqual(rows, [{ label: "Previous Room", value: "Room name not recorded" }, { label: "New Room", value: "Room name not recorded" }]);
  assert.ok(!JSON.stringify(rows).includes(id));
  assert.deepEqual(auditMetadataRows({ changes: { parcel_room: { before: "Old Room", after: "Renamed Room" } } }), [{ label: "Parcel Room changed", value: "Old Room -> Renamed Room" }]);
});
test("room configuration safely displays recorded names, availability and changes only in room context", () => {
  const metadata = { name: "Room B", is_active: false, description: "ignored direct field", password: "hidden",
    changes: { name: { before: "Room A", after: "Room B" }, description: { before: null, after: "Near lobby" }, is_active: { before: true, after: false } } };
  assert.deepEqual(auditMetadataRows(metadata, { entityType: "PARCEL_ROOM" }), [
    { label: "Room", value: "Room B" }, { label: "Availability", value: "Inactive" },
    { label: "Room name changed", value: "Room A -> Room B" }, { label: "Description changed", value: "Not set -> Near lobby" },
    { label: "Availability changed", value: "Active -> Inactive" }
  ]);
  assert.deepEqual(auditMetadataRows(metadata), []);
});
test("room audit references and descriptions hide historical room IDs without changing unrelated logs", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const log = { entity_type: "PARCEL_ROOM", entity_id: id, entity_reference: id, description: `Room ${id} updated`, metadata: { name: "Recorded Room" } };
  assert.equal(auditEntityReference(log), "Recorded Room");
  assert.equal(auditEntityReference({ ...log, metadata: {} }), "Room name not recorded");
  assert.equal(auditDescription(log), "Room [room reference] updated");
  assert.equal(auditEntityReference({ entity_type: "PARCEL", entity_id: id }), id);
  assert.equal(auditDescription({ entity_type: "PARCEL", description: "Original description" }), "Original description");
});
