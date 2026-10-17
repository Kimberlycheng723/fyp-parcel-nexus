import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const QRCode = createRequire(new URL("../package.json", import.meta.url))("qrcode");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const residentId = "11111111-1111-4111-8111-111111111111", guardId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333", collectionId = "44444444-4444-4444-8444-444444444444";
const parcelIds = [1, 2].map((index) => `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`);
const qrToken = "step18c-fixture-qr-not-a-real-token";
const qrImage = await QRCode.toDataURL(qrToken, { width: 360, margin: 3 });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
let cases = 0;
const cameraOnly = process.env.PARCEL_NEXUS_CAMERA_ONLY === "true";

function fixtures() {
  const parcels = parcelIds.map((parcel_id, index) => ({ parcel_id, tracking_number: `SPX-18C-${index + 1}`, courier_name: "Shopee Express",
    parcel_room_name: index === 0 ? "Lobby Parcel Room" : "Tower B Parcel Room", status: "PENDING_COLLECTION", display_status: "PENDING_COLLECTION" }));
  const collection = { collection_id: collectionId, token: qrToken, expires_at: new Date(Date.now() + 120000).toISOString(), parcel_count: 2, parcels };
  const verification = { session_id: sessionId, collection_id: collectionId, guard_id: guardId, status: "AWAITING_VERIFICATION", unit_reference: "A-12-03",
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), parcel_count: 2, confirmed_at: null, completed_at: null, cancelled_at: null,
    parcels: parcels.map((parcel) => ({ parcel_id: parcel.parcel_id, registered_tracking_number: parcel.tracking_number, courier_name: parcel.courier_name,
      parcel_room_name: parcel.parcel_room_name, barcode_status: "PENDING", photo_present: false, photo_uploaded_at: null, verified_at: null })) };
  return { parcels, collection, verification, active: false, starts: 0, startStatus: 200, startNetworkFailure: false,
    readStatus: 200, readNetworkFailure: false, readDelay: 0, guardReads: 0, maxGuardReads: 0 };
}

async function setup(role, width, state, { restore = false, cameraMode = "qr", userId = role === "GUARD" ? guardId : residentId } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: userId, role, first_name: "Test", last_name: role, status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await context.addInitScript(({ token, role, userId, collection, restore, sessionId, qrImage, cameraMode }) => {
    localStorage.setItem("parcel_nexus_access_token", token);
    if (!sessionStorage.getItem("step18c-initialized")) {
      if (role === "RESIDENT") sessionStorage.setItem("parcel_nexus_resident_collection", JSON.stringify({ resident_id: userId, collection,
        parcel_ids: collection.parcels.map((parcel) => parcel.parcel_id), unit: { unit_full_code: "A-12-03" } }));
      if (restore) sessionStorage.setItem("parcel_nexus_guard_verification", JSON.stringify({ guard_id: userId, session_id: sessionId }));
      sessionStorage.setItem("step18c-initialized", "1");
    }
    window.__cameraMode = cameraMode; window.__cameraStreams = []; window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraRequests++;
      if (window.__cameraMode === "denied") throw new DOMException("Denied", "NotAllowedError");
      if (window.__cameraMode === "unavailable") throw new DOMException("Missing", "NotFoundError");
      const image = new Image(); image.src = qrImage; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      function paint() { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); if (window.__cameraMode === "qr") ctx.drawImage(image, 140, 60, 360, 360); }
      paint(); const stream = canvas.captureStream(10), interval = setInterval(paint, 100);
      for (const track of stream.getTracks()) { const original = track.stop.bind(track); track.stop = () => { clearInterval(interval); original(); }; }
      window.__cameraStreams.push(stream); return stream;
    };
  }, { token, role, userId, collection: state.collection, restore, sessionId, qrImage, cameraMode });
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  // Both browsers share contract-shaped fixtures; no request mutates the live database.
  await context.route("**/api/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const body = method === "GET" || method === "PUT" ? null : req.postDataJSON();
    requests.push({ path, method, body, auth: req.headers().authorization });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: "A-12-03" }, summary: { pending_collection: 2, collected_parcels: 0, overdue_parcels: 0 } });
    if (path === "/api/resident/parcels") return fulfill(route, { items: state.parcels, pagination: { page: 1, total: 2, total_pages: 1, limit: 10 } });
    if (path.startsWith("/api/resident/parcels/")) return fulfill(route, { parcel: state.parcels.find((parcel) => path.endsWith(parcel.parcel_id)) });
    if (path === "/api/guard/collections/verify") {
      assert.equal(role, "GUARD"); assert.deepEqual(body, { token: qrToken });
      if (state.startStatus !== 200) return fulfill(route, { message: state.startStatus === 409 ? "Collection token has already been used." : "Collection token has expired." }, state.startStatus);
      if (!state.active) { state.active = true; state.starts++; }
      if (state.startNetworkFailure) return route.abort(); // Simulate commit succeeded but its acknowledgement was lost.
      return fulfill(route, { verification_session: state.verification });
    }
    if (path === "/api/resident/collection-verifications/active") {
      assert.equal(role, "RESIDENT", "Guard must never use Resident discovery");
      return fulfill(route, { verification_sessions: state.active && state.verification.status === "AWAITING_VERIFICATION" ? [state.verification] : [] });
    }
    if (path === `/api/collection-verifications/${sessionId}`) {
      if (role === "GUARD") { state.guardReads++; state.maxGuardReads = Math.max(state.maxGuardReads, state.guardReads); }
      await delay(state.readDelay);
      if (role === "GUARD") state.guardReads--;
      if (state.readNetworkFailure) return route.abort();
      if (state.readStatus !== 200) return fulfill(route, { message: "Session unavailable." }, state.readStatus);
      return fulfill(route, { verification_session: state.verification });
    }
    if (path.startsWith(`/api/collection-verifications/${sessionId}/`)) {
      assert.equal(role, "RESIDENT", "Guard must not use any evidence or confirmation mutation");
      const parcel = state.verification.parcels.find((item) => path.includes(item.parcel_id));
      if (path.endsWith("/barcode")) {
        parcel.barcode_status = body.scanned_tracking_number === parcel.registered_tracking_number ? "MATCHED" : "MISMATCHED";
        parcel.verified_at = new Date().toISOString(); return fulfill(route, { verification_session: state.verification });
      }
      if (path.endsWith("/photo") && method === "PUT") {
        assert.ok(req.postData().includes('name="photo"'));
        parcel.photo_present = true; parcel.photo_uploaded_at = new Date().toISOString(); return fulfill(route, { verification_session: state.verification });
      }
      if (path.endsWith("/photo")) return route.fulfill({ status: 200, contentType: "image/png", body: png });
      if (path.endsWith("/confirm")) {
        assert.deepEqual(body, {}); assert.ok(state.verification.parcels.every((item) => item.barcode_status === "MATCHED" && item.photo_present));
        await delay(150);
        state.verification.status = "COMPLETED"; state.verification.confirmed_at = state.verification.completed_at = new Date().toISOString();
        for (const item of state.parcels) item.status = "COLLECTED";
        return fulfill(route, { verification_session: state.verification, already_completed: true });
      }
    }
    return fulfill(route, {});
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, requests, errors, state };
}

async function capture(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0, 0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-guard-verification-${name}-${width}.png`, fullPage: true });
}
async function cameraStopped(page) { assert.equal(await page.evaluate(() => window.__cameraStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), true); }
async function verifyParcel(resident, index) {
  const item = resident.page.getByRole("article", { name: `Parcel ${index + 1} of 2` });
  await item.getByRole("button", { name: "Enter tracking number", exact: true }).click();
  await item.getByLabel("Tracking number on the shipping label").fill(resident.state.verification.parcels[index].registered_tracking_number);
  await item.getByRole("button", { name: "Verify", exact: true }).click();
  await item.getByText("Barcode: Verified", { exact: true }).waitFor();
  await item.getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "parcel.png", mimeType: "image/png", buffer: png });
  await item.getByRole("button", { name: "Use & Upload Photo" }).click();
  await item.getByText("Photo: Uploaded", { exact: true }).waitFor();
}

try {
  for (const width of cameraOnly ? [] : [1440, 834, 390]) {
    const state = fixtures();
    const resident = await setup("RESIDENT", width, state), guard = await setup("GUARD", width, state);
    await resident.page.goto(`${baseURL}/parcel-collection`);
    await resident.page.getByRole("img", { name: "Secure parcel collection QR code" }).waitFor();
    await guard.page.goto(`${baseURL}/verify-collection`);
    await guard.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
    await guard.page.getByText("2 Parcels in this session", { exact: true }).waitFor();
    assert.ok(state.parcels.every((parcel) => parcel.status === "PENDING_COLLECTION"));
    assert.equal(guard.requests.filter((req) => req.method === "POST").length, 1);
    assert.equal(await guard.page.getByRole("button", { name: /Confirm|Upload|Cancel|Verify$/ }).count(), 0);
    await cameraStopped(guard.page); await capture(guard.page, "started", width);
    await resident.page.getByRole("heading", { name: "Verify Your Parcels" }).waitFor();
    await verifyParcel(resident, 0);
    await guard.page.getByText("1 of 2 parcels verified", { exact: true }).waitFor();
    assert.match(await guard.page.locator(".guard-session-label").textContent(), /1 of 2 parcels verified/);
    assert.equal(await guard.page.locator(".guard-session-label").getAttribute("aria-atomic"), "true");
    await guard.page.getByRole("heading", { name: "Verification In Progress" }).waitFor();
    await capture(guard.page, "progress", width);
    await verifyParcel(resident, 1);
    await guard.page.getByText("Awaiting Resident Confirmation", { exact: true }).waitFor();
    assert.equal(await guard.page.getByRole("heading", { name: "Collection Completed", exact: true }).count(), 0);
    assert.ok(state.parcels.every((parcel) => parcel.status === "PENDING_COLLECTION"));
    const deadline = state.verification.expires_at;
    await guard.page.reload();
    await guard.page.getByText("Awaiting Resident Confirmation", { exact: true }).waitFor();
    assert.equal(state.verification.expires_at, deadline);
    assert.equal(await guard.page.evaluate(() => window.__cameraRequests), 0, "refresh restores without opening a camera");
    await resident.page.getByRole("button", { name: "Confirm Collection" }).click();
    await resident.page.getByRole("heading", { name: "Collection Confirmed" }).waitFor();
    await guard.page.getByRole("heading", { name: "Collection Completed", exact: true }).waitFor();
    await guard.page.getByText("2 Parcels Collected", { exact: true }).waitFor();
    assert.equal(await guard.page.locator(".guard-session-parcel-checks").getByText("Collected", { exact: true }).count(), 2);
    const reads = guard.requests.filter((req) => req.path.includes("collection-verifications")).length;
    await delay(3300);
    assert.equal(guard.requests.filter((req) => req.path.includes("collection-verifications")).length, reads);
    assert.ok(guard.requests.every((req) => !req.path.startsWith("/api/resident/")));
    assert.equal(guard.requests.filter((req) => req.path.endsWith("/confirm")).length, 0);
    await capture(guard.page, "completed", width);
    assert.deepEqual(guard.errors, []); assert.deepEqual(resident.errors, []);
    await resident.context.close(); await guard.context.close(); cases++;
    console.log(`Guard + Resident shared-fixture workflow passed at ${width}px (not live database E2E)`);
  }

  if (!cameraOnly) {
  const duplicateState = fixtures(), duplicate = await setup("GUARD", 390, duplicateState);
  await duplicate.page.goto(`${baseURL}/verify-collection`);
  await duplicate.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
  const deadline = duplicateState.verification.expires_at;
  duplicateState.collection.expires_at = new Date(Date.now() - 1000).toISOString();
  await duplicate.page.getByRole("button", { name: "Scan Next QR" }).click();
  await duplicate.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
  assert.equal(duplicateState.starts, 1); assert.equal(duplicateState.verification.expires_at, deadline);
  await duplicate.context.close(); cases++;

  for (const status of [410, 409, 503, 404]) {
    const state = fixtures(); state.startStatus = status;
    const qa = await setup("GUARD", 390, state);
    await qa.page.goto(`${baseURL}/verify-collection`);
    await qa.page.getByRole("heading", { name: "QR verification failed" }).waitFor();
    await qa.page.getByText(status === 410 ? "This QR code has expired. Please ask the Resident to generate a new one."
      : status === 409 ? "This QR code has already been used. Do not hand over the parcels again."
        : status === 404 ? "This QR code is invalid or unavailable. Please check the Resident's collection QR code." : "The collection service is temporarily unavailable. Please try again shortly.").waitFor();
    assert.equal(await qa.page.getByRole("heading", { name: "Collection Completed" }).count(), 0);
    await cameraStopped(qa.page); if (status === 410) await capture(qa.page, "qr-expired", 390);
    await qa.context.close(); cases++;
  }

  const lost = fixtures(); lost.startNetworkFailure = true;
  const retry = await setup("GUARD", 390, lost);
  await retry.page.goto(`${baseURL}/verify-collection`);
  await retry.page.getByRole("heading", { name: "QR verification failed" }).waitFor();
  const requestsBefore = retry.requests.filter((req) => req.method === "POST").length;
  await delay(3300); assert.equal(retry.requests.filter((req) => req.method === "POST").length, requestsBefore, "no automatic consumed-QR retry");
  await capture(retry.page, "network-retry", 390);
  const cameraRequestsBefore = await retry.page.evaluate(() => window.__cameraRequests);
  lost.startNetworkFailure = false; await retry.page.getByRole("button", { name: "Refresh Verification", exact: true }).click();
  await retry.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
  assert.equal(lost.starts, 1);
  assert.equal(await retry.page.evaluate(() => window.__cameraRequests), cameraRequestsBefore, "explicit acknowledgement retry does not require the disappearing Resident QR to be shown again");
  await retry.context.close(); cases++;

  for (const status of ["EXPIRED", "CANCELLED"]) {
    const state = fixtures(); state.active = true;
    const qa = await setup("GUARD", 390, state, { restore: true });
    await qa.page.goto(`${baseURL}/verify-collection`);
    await qa.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
    state.verification.status = status; if (status === "EXPIRED") state.verification.expires_at = new Date(Date.now() - 1000).toISOString();
    await qa.page.getByRole("heading", { name: status === "EXPIRED" ? "Verification Expired" : "Verification Cancelled" }).waitFor();
    const requestsBefore = qa.requests.length; await delay(3300); assert.equal(qa.requests.length, requestsBefore);
    await capture(qa.page, status.toLowerCase(), 390); await qa.context.close(); cases++;
  }

  const pollingState = fixtures(); pollingState.active = true;
  const polling = await setup("GUARD", 390, pollingState, { restore: true });
  await polling.page.goto(`${baseURL}/verify-collection`);
  await polling.page.getByRole("heading", { name: "Verification Started", exact: true }).waitFor();
  pollingState.readNetworkFailure = true;
  await polling.page.getByText(/Connection interrupted/).waitFor();
  assert.equal(await polling.page.getByRole("heading", { name: "Verification Started", exact: true }).count(), 1);
  pollingState.readNetworkFailure = false; await polling.page.getByRole("button", { name: "Refresh Status" }).click();
  await polling.page.getByText(/Connection interrupted/).waitFor({ state: "hidden" });
  await polling.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await delay(100); const reads = polling.requests.length; await delay(3300); assert.equal(polling.requests.length, reads);
  await polling.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await delay(200); assert.ok(polling.requests.length > reads);
  pollingState.readDelay = 3400; await delay(7200); assert.equal(pollingState.maxGuardReads, 1);
  await polling.context.close(); cases++;

  for (const status of [403, 404, 401]) {
    const state = fixtures(); state.readStatus = status;
    const qa = await setup("GUARD", 390, state, { restore: true });
    await qa.page.goto(`${baseURL}/verify-collection`);
    if (status === 401) await qa.page.waitForURL("**/login");
    else { await qa.page.getByRole("heading", { name: "Verification unavailable" }).waitFor(); assert.equal(await qa.page.locator(".guard-session-parcels").count(), 0); }
    await qa.context.close(); cases++;
  }

  for (const mode of ["denied", "unavailable"]) {
    const qa = await setup("GUARD", 390, fixtures(), { cameraMode: mode });
    await qa.page.goto(`${baseURL}/verify-collection`);
    await qa.page.getByRole("heading", { name: "Camera unavailable" }).waitFor();
    await cameraStopped(qa.page); assert.equal(qa.requests.filter((req) => req.method === "POST").length, 0);
    await qa.context.close(); cases++;
  }
  }
  const camera = await setup("GUARD", 390, fixtures(), { cameraMode: "blank" });
  await camera.page.goto(`${baseURL}/verify-collection`);
  await camera.page.getByText("Torch unavailable on this device", { exact: true }).waitFor();
  await camera.page.locator(".verify-camera-loading").waitFor({ state: "hidden" });
  await camera.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await camera.page.getByRole("heading", { name: "Scanner paused" }).waitFor(); await cameraStopped(camera.page);
  await camera.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await camera.page.getByRole("button", { name: "Start Scanner" }).click();
  await camera.page.getByText("Torch unavailable on this device", { exact: true }).waitFor();
  await camera.page.locator(".verify-camera-loading").waitFor({ state: "hidden" });
  await capture(camera.page, "scanner", 390);
  await camera.page.getByRole("button", { name: "Close Scanner" }).click();
  await cameraStopped(camera.page); assert.equal(camera.requests.filter((req) => req.method === "POST").length, 0);
  await camera.context.close(); cases++;

  const timeout = await setup("GUARD", 390, fixtures(), { cameraMode: "blank" });
  await timeout.page.clock.install();
  await timeout.page.goto(`${baseURL}/verify-collection`);
  await timeout.page.getByText("Torch unavailable on this device", { exact: true }).waitFor();
  await timeout.page.locator(".verify-camera-loading").waitFor({ state: "hidden" });
  await timeout.page.clock.fastForward(26000);
  await timeout.page.getByRole("heading", { name: "QR not detected" }).waitFor();
  await cameraStopped(timeout.page);
  await capture(timeout.page, "not-detected", 390);
  await timeout.context.close(); cases++;

  const hidden = await setup("GUARD", 390, fixtures(), { cameraMode: "blank" });
  await hidden.context.addInitScript(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); });
  await hidden.page.goto(`${baseURL}/verify-collection`);
  await hidden.page.getByRole("heading", { name: "Scanner paused" }).waitFor();
  assert.equal(await hidden.page.evaluate(() => window.__cameraRequests), 0, "initial hidden tab never requests camera permission");
  await hidden.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await hidden.page.getByRole("button", { name: "Start Scanner" }).click();
  await hidden.page.locator(".verify-camera-loading").waitFor({ state: "hidden" });
  assert.equal(await hidden.page.evaluate(() => window.__cameraStreams.some((stream) => stream.getTracks().some((track) => track.readyState === "live"))), true);
  await hidden.page.getByRole("button", { name: "Close Scanner" }).click(); await cameraStopped(hidden.page);
  await hidden.context.close(); cases++;

  for (const role of cameraOnly ? [] : ["RESIDENT", "ADMIN", "SUPER_ADMIN"]) {
    const qa = await setup(role, 390, fixtures()); await qa.page.goto(`${baseURL}/verify-collection`); await delay(400);
    assert.ok(qa.requests.every((req) => req.path !== "/api/guard/collections/verify" && !req.path.startsWith("/api/collection-verifications/")));
    await qa.context.close(); cases++;
  }
  console.log(`Step 18C: ${cases} browser scenarios passed; APIs intercepted, ${cameraOnly ? "synthetic preview cleanup/timeout checks" : "actual ZXing QR decoding with synthetic streams"}, no physical/live Socket/database E2E claims.`);
} finally { await browser.close(); }
