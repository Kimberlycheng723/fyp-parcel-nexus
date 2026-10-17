import assert from "node:assert/strict";
import test from "node:test";
import { filterParcelRooms, normalizeRoomName, sessionHasActiveRooms, validateRoomForm, parcelRoomLabel, parcelRoomUpdate, parcelRoomCsvValue } from "../src/utils/parcelRooms.js";

test("room CSV cells remain literal text without changing room display or storage", () => {
  for (const name of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1", "\n=1+1"])
    assert.equal(parcelRoomCsvValue(name), `'${name}`);
  for (const name of ["Lobby Room", 'Room "A", B', "Tower B"])
    assert.equal(parcelRoomCsvValue(name), name);
  assert.equal(parcelRoomCsvValue(null), "Not Assigned");
  assert.equal(parcelRoomLabel({ parcel_room_name: "=1+1" }), "=1+1");
});

test("room form matches backend normalization and nullable description", () => {
  assert.equal(normalizeRoomName("  Lobby\t Room \n"), "Lobby Room");
  assert.deepEqual(validateRoomForm({ name: "  Lobby  Room ", description: "  " }), { errors: {}, input: { name: "Lobby Room", description: null } });
  assert.deepEqual(validateRoomForm({ name: "Room", description: " Near entrance " }).input, { name: "Room", description: "Near entrance" });
});
test("room form rejects empty/oversized/invalid text and allows backend length boundaries", () => {
  for (const name of [" ", "x".repeat(101), "bad\u0000name"]) assert.ok(validateRoomForm({ name, description: "" }).errors.name);
  for (const description of ["x".repeat(1001), "bad\u0000description"]) assert.ok(validateRoomForm({ name: "Room", description }).errors.description);
  assert.deepEqual(validateRoomForm({ name: "x".repeat(100), description: "x".repeat(1000) }).errors, {});
});
test("search and status filters use room names and real boolean availability", () => {
  const rooms = [{ id: "a", name: "Lobby Room", is_active: true }, { id: "b", name: "Tower B", is_active: false }];
  assert.equal(filterParcelRooms(rooms, "  LOBBY  ", "ALL")[0].id, "a");
  assert.deepEqual(filterParcelRooms(rooms, "", "INACTIVE").map((room) => room.id), ["b"]);
  assert.deepEqual(filterParcelRooms(rooms, "Tower", "ACTIVE"), []);
  assert.equal(filterParcelRooms(rooms, "", "ALL").length, 2);
});
test("mixed-room batches require explicit active assignments for every parcel", () => {
  const rooms = [{ id: "a", is_active: true }, { id: "b", is_active: true }, { id: "c", is_active: false }];
  assert.equal(sessionHasActiveRooms([{ parcel_room_id: "a" }, { parcel_room_id: "b" }], rooms), true);
  for (const parcels of [[], [{}], [{ parcel_room_id: null }], [{ parcel_room_id: "missing" }], [{ parcel_room_id: "a" }, { parcel_room_id: "c" }]]) {
    assert.equal(sessionHasActiveRooms(parcels, rooms), false);
  }
  assert.equal(sessionHasActiveRooms([{ parcel_room_id: "a" }], []), false);
});

test("parcel room display preserves historical names and handles legacy NULLs", () => {
  for (const parcel of [null, {}, { parcel_room_id: null, parcel_room_name: null }]) assert.equal(parcelRoomLabel(parcel), "Not Assigned");
  assert.equal(parcelRoomLabel({ parcel_room_name: "Archive Room", is_active: false }), "Archive Room");
});
test("room-only edits send only a changed active room and preserve NULL/inactive assignments", () => {
  const rooms = [{ id: "a", is_active: true }, { id: "b", is_active: false }];
  assert.deepEqual(parcelRoomUpdate({ parcel_room_id: null }, "", rooms), { updates: {} });
  assert.deepEqual(parcelRoomUpdate({ parcel_room_id: "b" }, "b", rooms), { updates: {} });
  assert.deepEqual(parcelRoomUpdate({ parcel_room_id: "b" }, "a", rooms), { updates: { parcel_room_id: "a" } });
  for (const id of ["b", "unknown"]) assert.ok(parcelRoomUpdate({ parcel_room_id: null }, id, rooms).error);
});
