import assert from "node:assert/strict";
import test from "node:test";
import { getAccessToken, removeAccessToken, setAccessToken } from "../src/services/tokenStorage.js";

const key = "parcel_nexus_access_token";
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function reset() { globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); }

test("default sign-in preserves the existing persistent token behavior", () => {
  reset();
  setAccessToken("persistent-test-token");
  assert.equal(localStorage.getItem(key), "persistent-test-token");
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(getAccessToken(), "persistent-test-token");
});

test("unchecked Remember me uses session storage and clears a previous persistent token", () => {
  reset();
  setAccessToken("previous-test-token");
  setAccessToken("session-test-token", false);
  assert.equal(localStorage.getItem(key), null);
  assert.equal(sessionStorage.getItem(key), "session-test-token");
  assert.equal(getAccessToken(), "session-test-token");
});

test("persistent sign-in replaces a previous session token without retaining two accounts", () => {
  reset();
  setAccessToken("session-test-token", false);
  setAccessToken("new-persistent-test-token", true);
  assert.equal(sessionStorage.getItem(key), null);
  assert.equal(getAccessToken(), "new-persistent-test-token");
});

test("existing logout and session expiry remove tokens from both storage locations", () => {
  reset();
  localStorage.setItem(key, "old-test-token");
  sessionStorage.setItem(key, "session-test-token");
  removeAccessToken();
  assert.equal(getAccessToken(), null);
  assert.equal(localStorage.getItem(key), null);
  assert.equal(sessionStorage.getItem(key), null);
});
