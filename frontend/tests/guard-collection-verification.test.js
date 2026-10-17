import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { clearGuardVerificationReference, getGuardVerificationReference, guardCollectionError,
  guardVerificationPresentation, readGuardVerification, saveGuardVerificationReference } from "../src/utils/guardCollectionVerification.js";

const guardId = "11111111-1111-4111-8111-111111111111", sessionId = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-13T08:00:00Z");
const pending = { barcode_status: "PENDING", photo_present: false };
const session = { session_id: sessionId, guard_id: guardId, status: "AWAITING_VERIFICATION", expires_at: "2026-10-13T08:15:00Z", parcels: [pending, pending] };

test("scan responses use the actual session contract, never legacy collection success", () => {
  assert.equal(readGuardVerification({ verification_session: session }, guardId), session);
  for (const input of [{ collection: { parcel_count: 2 } }, { verification_session: { ...session, guard_id: "another" } },
    { verification_session: { ...session, status: "USED" } }, { verification_session: { ...session, session_id: "invalid" } }]) {
    assert.throws(() => readGuardVerification(input, guardId));
  }
});
test("initial scan is verification started, not collection completed", () => {
  const view = guardVerificationPresentation(session, now);
  assert.equal(view.title, "Verification Started"); assert.equal(view.label, "Awaiting Resident Verification"); assert.equal(view.verified, 0);
});
test("progress and all requirements ready do not infer completion", () => {
  const matched = { barcode_status: "MATCHED", photo_present: true };
  const partial = guardVerificationPresentation({ ...session, parcels: [matched, pending] }, now);
  assert.equal(partial.title, "Verification In Progress"); assert.equal(partial.verified, 1);
  const ready = guardVerificationPresentation({ ...session, parcels: [matched, matched] }, now);
  assert.equal(ready.title, "Verification In Progress"); assert.equal(ready.label, "Awaiting Resident Confirmation");
});
test("closed statuses are distinct and only backend COMPLETED displays collection success", () => {
  for (const [status, title] of [["COMPLETED", "Collection Completed"], ["EXPIRED", "Verification Expired"], ["CANCELLED", "Verification Cancelled"]]) {
    assert.equal(guardVerificationPresentation({ ...session, status }, now).title, title);
  }
  assert.equal(guardVerificationPresentation(session, now + 900000).label, "Checking session expiry...");
});
test("Guard recovery stores identifiers only and checks Guard identity", () => {
  const storage = new Map();
  global.window = { sessionStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } };
  saveGuardVerificationReference({ ...session, token: "secret", evidence: "private" }, guardId);
  assert.equal(getGuardVerificationReference(guardId), sessionId); assert.equal(getGuardVerificationReference("other"), null);
  assert.deepEqual(JSON.parse([...storage.values()][0]), { guard_id: guardId, session_id: sessionId });
  clearGuardVerificationReference(); assert.equal(getGuardVerificationReference(guardId), null); delete global.window;
});
test("QR and session errors have different recovery instructions", () => {
  assert.match(guardCollectionError({ status: 410 }, { scanning: true }), /QR code has expired/);
  assert.match(guardCollectionError({ status: 410 }), /Verification has expired/);
  assert.match(guardCollectionError({ status: 409, message: "Collection token has already been used." }), /Do not hand over/);
  assert.match(guardCollectionError({ status: 403 }), /initiating Guard/);
  assert.match(guardCollectionError({ status: 500, message: "internal secret stack" }), /temporarily unavailable/);
});
test("Guard UI/hook contain no Resident mutation APIs or invented collection event listener", async () => {
  const sources = await Promise.all(["../src/pages/GuardVerifyCollectionPage.jsx", "../src/hooks/useGuardCollectionVerification.js", "../src/components/GuardCollectionStatus.jsx"].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  const text = sources.join("\n");
  for (const forbidden of ["confirmCollectionVerification(", "uploadCollectionPhoto(", "verifyCollectionBarcode(", "cancelCollectionVerification(", "getActiveCollectionVerifications(", "Collection successful"]) assert.ok(!text.includes(forbidden));
});
