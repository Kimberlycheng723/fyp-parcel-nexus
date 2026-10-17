import assert from "node:assert/strict";
import test from "node:test";
import { cameraErrorMessage, formatCountdown, remainingSeconds, validateCollectionPhoto,
  validateTrackingNumber, verificationError, verificationProgress } from "../src/utils/collectionVerification.js";
import { clearVerificationReference, getVerificationReference, saveVerificationReference } from "../src/utils/collectionSession.js";

const now = Date.parse("2026-10-13T08:00:00Z");
const ready = { barcode_status: "MATCHED", photo_present: true };
const session = { status: "AWAITING_VERIFICATION", expires_at: "2026-10-13T08:15:00Z", parcels: [ready, ready] };

test("backend deadline countdown does not extend on refresh", () => {
  assert.equal(remainingSeconds(session.expires_at, now), 900);
  assert.equal(remainingSeconds(session.expires_at, now + 100000), 800);
  assert.equal(remainingSeconds(session.expires_at, now + 900000), 0);
  assert.equal(remainingSeconds("invalid", now), 0);
  assert.equal(formatCountdown(125), "2:05");
});
test("all parcels need both authoritative requirements", () => {
  assert.deepEqual(verificationProgress(session, now), { verified: 2, total: 2, canConfirm: true });
  for (const incomplete of [{ barcode_status: "MISMATCHED", photo_present: true }, { barcode_status: "UNREADABLE", photo_present: true },
    { barcode_status: "PENDING", photo_present: true }, { barcode_status: "MATCHED", photo_present: false }]) {
    assert.deepEqual(verificationProgress({ ...session, parcels: [ready, incomplete] }, now), { verified: 1, total: 2, canConfirm: false });
  }
});
test("closed, expired and empty sessions never confirm", () => {
  for (const status of ["COMPLETED", "EXPIRED", "CANCELLED"]) assert.equal(verificationProgress({ ...session, status }, now).canConfirm, false);
  assert.equal(verificationProgress(session, now + 900000).canConfirm, false);
  assert.equal(verificationProgress({ ...session, parcels: [] }, now).canConfirm, false);
  assert.equal(verificationProgress(null, now).canConfirm, false);
});
test("JPG/PNG photo limits match backend", () => {
  for (const type of ["image/jpeg", "image/png"]) assert.equal(validateCollectionPhoto({ type, size: 5 * 1024 * 1024 }), "");
  assert.match(validateCollectionPhoto({ type: "image/gif", size: 100 }), /JPG/);
  assert.match(validateCollectionPhoto({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.match(validateCollectionPhoto({ type: "image/png", size: 0 }), /empty/);
});
test("manual entry validates without client-side ownership lookup", () => {
  assert.equal(validateTrackingNumber("  SPX123-A  "), "");
  assert.match(validateTrackingNumber(" "), /Enter/);
  assert.match(validateTrackingNumber("A".repeat(121)), /120/);
  assert.match(validateTrackingNumber("ABC\u0000"), /valid/);
});
test("friendly permission, rate and connection errors", () => {
  assert.match(verificationError({ status: 404 }), /does not belong/);
  assert.match(verificationError({ status: 401 }), /sign in/);
  assert.match(verificationError({ status: 429 }), /wait/);
  assert.match(verificationError(new TypeError("Failed to fetch")), /saved progress/);
});
test("camera errors offer useful recovery", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /permission/);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /No camera/);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /busy/);
});
test("restoration persists identifiers only and is account/collection scoped", () => {
  const values = new Map();
  global.window = { sessionStorage: { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) || null, removeItem: (key) => values.delete(key) } };
  saveVerificationReference({ session_id: "session", collection_id: "collection", photo: "private", token: "secret" }, "resident");
  assert.deepEqual(getVerificationReference("resident", "collection"), { session_id: "session", collection_id: "collection", resident_id: "resident" });
  assert.equal(getVerificationReference("other", "collection"), null);
  assert.equal(getVerificationReference("resident", "other"), null);
  assert.ok(![...values.values()][0].includes("secret"));
  clearVerificationReference(); assert.equal(values.size, 0);
  delete global.window;
});
