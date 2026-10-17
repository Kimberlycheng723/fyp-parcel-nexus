import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const { Code128Reader } = createRequire(new URL("../package.json", import.meta.url))("@zxing/library");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const userId = "66666666-6666-4666-8666-666666666666", collectionId = "99999999-9999-4999-8999-999999999999";
const sessionId = "88888888-8888-4888-8888-888888888888";
const parcelIds = [1, 2].map((index) => `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let assertions = 0;

function code128Fixture(text) {
  // Test-only Code Set B pixels using ZXing's standard patterns; production decoding is unchanged.
  const data = [...text].map((character) => character.charCodeAt(0) - 32);
  const checksum = (104 + data.reduce((sum, symbol, index) => sum + symbol * (index + 1), 0)) % 103;
  const bits = Array(24).fill(false);
  for (const symbol of [104, ...data, checksum, 106]) {
    let black = true;
    for (const width of Code128Reader.CODE_PATTERNS[symbol]) { bits.push(...Array(width * 2).fill(black)); black = !black; }
  }
  return [...bits, ...Array(24).fill(false)];
}

async function setup(width = 390, { role = "RESIDENT", active = false, expiredQr = false, seed = true, restore = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: userId, role, first_name: "Test", last_name: "Resident", status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  const parcels = parcelIds.map((parcel_id, index) => ({ parcel_id, tracking_number: `SPX12345678${index}`, courier_name: "Shopee Express",
    parcel_room_name: index === 0 ? "Lobby Parcel Room" : null, status: "PENDING_COLLECTION", display_status: "PENDING_COLLECTION", created_at: new Date().toISOString() }));
  const collection = { collection_id: collectionId, token: "test-only-qr-secret", expires_at: new Date(Date.now() + (expiredQr ? -1000 : 120000)).toISOString(), parcel_count: 2, parcels };
  const verification = { session_id: sessionId, collection_id: collectionId, status: "AWAITING_VERIFICATION", unit_reference: "A-10-01", guard_id: "test-guard",
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), parcel_count: 2, confirmed_at: null, completed_at: null, cancelled_at: null,
    parcels: parcels.map((parcel) => ({ evidence_id: `evidence-${parcel.parcel_id}`, parcel_id: parcel.parcel_id, registered_tracking_number: parcel.tracking_number,
      courier_name: parcel.courier_name, parcel_room_name: parcel.parcel_room_name, scanned_tracking_number: null, barcode_status: "PENDING", attempt_count: 0,
      photo_present: false, photo_url: null, photo_uploaded_at: null, verified_at: null })) };
  const state = { active, collection, verification, readStatus: 200, mutationStatus: 200, networkFailure: false, readDelay: 0, concurrentReads: 0, maxReads: 0, cameraMode: "blank" };
  await context.addInitScript(({ token, collection, parcelIds, userId, seed, restore, sessionId }) => {
    localStorage.setItem("parcel_nexus_access_token", token);
    if (seed && !sessionStorage.getItem("parcel_nexus_test_initialized")) {
      sessionStorage.setItem("parcel_nexus_resident_collection", JSON.stringify({ resident_id: userId, collection, parcel_ids: parcelIds, unit: { unit_full_code: "A-10-01" } }));
      if (restore) sessionStorage.setItem("parcel_nexus_collection_verification", JSON.stringify({ resident_id: userId, collection_id: collection.collection_id, session_id: sessionId }));
      sessionStorage.setItem("parcel_nexus_test_initialized", "1");
    }
    window.__cameraStreams = []; window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraRequests++;
      if (window.__cameraMode === "denied") throw new DOMException("Denied", "NotAllowedError");
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      function paint() {
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480);
        if (window.__barcodeBits) {
          ctx.fillStyle = "black";
          const bits = window.__barcodeBits;
          for (let x = 0; x < bits.length; x++) if (bits[x]) ctx.fillRect(20 + x, 100, 1, 250);
        }
      }
      paint();
      const stream = canvas.captureStream(10), interval = setInterval(paint, 100);
      for (const track of stream.getTracks()) {
        const original = track.stop.bind(track);
        track.stop = () => { clearInterval(interval); original(); };
      }
      window.__cameraStreams.push(stream); return stream;
    };
  }, { token, collection, parcelIds, userId, seed, restore, sessionId });
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  // Fixture-only responses: no mutation reaches the running backend or database.
  await context.route("**/api/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const body = method === "GET" || method === "PUT" ? null : req.postDataJSON();
    requests.push({ path, method, body, auth: req.headers().authorization, raw: method === "PUT" ? req.postData() : null });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: "A-10-01" }, summary: { pending_collection: 2, overdue_parcels: 0, collected_parcels: 0 } });
    if (path === "/api/resident/parcels") return fulfill(route, { items: parcels, pagination: { page: 1, total: 2, total_pages: 1, limit: 10 } });
    if (path.startsWith("/api/resident/parcels/")) return fulfill(route, { parcel: parcels.find((parcel) => path.endsWith(parcel.parcel_id)) });
    if (path === "/api/resident/collections") return fulfill(route, { collection: { ...collection,
      collection_id: "99999999-9999-4999-8999-999999999998", expires_at: new Date(Date.now() + 120000).toISOString() } }, 201);
    if (path === "/api/resident/collection-verifications/active" || path === `/api/collection-verifications/${sessionId}`) {
      state.concurrentReads++; state.maxReads = Math.max(state.maxReads, state.concurrentReads);
      await delay(state.readDelay); state.concurrentReads--;
      if (state.networkFailure) return route.abort();
      if (state.readStatus !== 200) return fulfill(route, { message: "Verification not found." }, state.readStatus);
      if (path.endsWith("/active")) return fulfill(route, { verification_sessions: state.active ? [verification] : [] });
      return fulfill(route, { verification_session: verification });
    }
    if (path.startsWith(`/api/collection-verifications/${sessionId}/`)) {
      if (method !== "GET" && state.mutationStatus !== 200) return fulfill(route, { message: "Collection update failed. Please try again." }, state.mutationStatus);
      const parcel = verification.parcels.find((item) => path.includes(item.parcel_id));
      if (path.endsWith("/barcode")) {
        parcel.scanned_tracking_number = body.scanned_tracking_number;
        parcel.barcode_status = body.scanned_tracking_number.toUpperCase() === parcel.registered_tracking_number ? "MATCHED" : "MISMATCHED";
        parcel.attempt_count++;
        return fulfill(route, { verification_session: verification }); // Dedup-shaped result intentionally has no barcode_result.
      }
      if (path.endsWith("/photo") && method === "PUT") {
        assert.ok(req.headers()["content-type"].includes("multipart/form-data"));
        assert.ok(req.postData().includes('name="photo"'));
        parcel.photo_present = true; parcel.photo_uploaded_at = new Date().toISOString(); parcel.photo_url = path;
        return fulfill(route, { verification_session: verification });
      }
      if (path.endsWith("/photo")) return route.fulfill({ status: 200, contentType: "image/png", body: png });
      if (path.endsWith("/confirm")) {
        await delay(200);
        assert.deepEqual(body, {});
        assert.ok(verification.parcels.every((item) => item.barcode_status === "MATCHED" && item.photo_present));
        verification.status = "COMPLETED"; verification.completed_at = new Date().toISOString();
        return fulfill(route, { verification_session: verification, already_completed: true });
      }
      if (path.endsWith("/cancel")) { assert.deepEqual(body, {}); verification.status = "CANCELLED"; return fulfill(route, { verification_session: verification }); }
    }
    return fulfill(route, {});
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, state, requests, errors };
}

async function capture(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0, 0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-collection-${name}-${width}.png`, fullPage: true });
  assertions++;
}
const card = (page, index = 0) => page.getByRole("article", { name: `Parcel ${index + 1} of 2` });
async function manual(page, index, tracking) {
  const item = card(page, index);
  await item.getByRole("button", { name: "Enter tracking number", exact: true }).click();
  await item.getByLabel("Tracking number on the shipping label").fill(tracking);
  await item.getByRole("button", { name: "Verify", exact: true }).click();
}
async function photo(page, index = 0) {
  const item = card(page, index);
  await item.getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "parcel.png", mimeType: "image/png", buffer: png });
  await item.getByRole("img", { name: "Parcel photo preview, not yet uploaded" }).waitFor();
  await item.getByRole("button", { name: "Use & Upload Photo" }).click();
  await item.getByText("Photo: Uploaded", { exact: true }).waitFor();
}

try {
  for (const width of [1440, 834, 390]) {
    const qa = await setup(width), { page, state, requests } = qa;
    await page.goto(`${baseURL}/parcel-collection`);
    await page.getByText("Show this QR code to the Guard to begin collection.", { exact: true }).waitFor();
    await page.getByRole("img", { name: "Secure parcel collection QR code" }).waitFor();
    await capture(page, "waiting", width);
    assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
    state.active = true;
    await page.getByRole("heading", { name: "Verify Your Parcels" }).waitFor();
    await page.getByText("0 of 2 parcels verified", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm Collection" }).isDisabled(), true);
    await capture(page, "active", width);
    await manual(page, 0, "OTHER-UNIT-BARCODE");
    await card(page).getByText("Barcode does not match this parcel. Please check the parcel and try again.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm Collection" }).isDisabled(), true);
    await card(page).getByLabel("Tracking number on the shipping label").fill(state.verification.parcels[0].registered_tracking_number);
    await card(page).getByRole("button", { name: "Verify", exact: true }).click();
    await card(page).getByText("Barcode: Verified", { exact: true }).waitFor();
    assert.equal(await card(page).getByRole("button", { name: "Enter tracking number", exact: true }).evaluate((button) => button === document.activeElement), true);
    await card(page).getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "bad.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await card(page).getByText("Use a JPG, JPEG or PNG photo.", { exact: true }).waitFor();
    await card(page).getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await card(page).getByText("The photo must be 5 MB or smaller.", { exact: true }).waitFor();
    await card(page).getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: png });
    await card(page).getByRole("img", { name: "Parcel photo preview, not yet uploaded" }).waitFor();
    assert.equal(requests.filter((req) => req.method === "PUT").length, 0, "preview is not uploaded");
    await card(page).getByRole("button", { name: "Discard photo preview" }).click();
    await photo(page);
    await page.getByText("1 of 2 parcels verified", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("1 of 2 parcels verified", { exact: true }).waitFor();
    assert.match(await page.locator(".collection-session-deadline").textContent(), /Session expires in 14:/);
    await photo(page, 0); // Replacement remains possible and uses the same private endpoint.
    assert.equal(requests.filter((req) => req.method === "PUT").length, 2);
    await manual(page, 1, state.verification.parcels[1].registered_tracking_number);
    await card(page, 1).getByText("Barcode: Verified", { exact: true }).waitFor();
    await photo(page, 1);
    await page.getByText("2 of 2 parcels verified", { exact: true }).waitFor();
    await card(page).getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "replacement-preview.png", mimeType: "image/png", buffer: png });
    await page.getByText("Upload or discard your photo previews before confirming.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Confirm Collection" }).isDisabled(), true);
    if (width === 390) await capture(page, "replacement-review", width);
    await card(page).getByRole("button", { name: "Discard photo preview" }).click();
    await page.getByText("2 of 2 parcels verified", { exact: true }).waitFor();
    await capture(page, "ready", width);
    await page.getByRole("button", { name: "Confirm Collection" }).evaluate((button) => { button.click(); button.click(); });
    await page.getByRole("heading", { name: "Collection Confirmed" }).waitFor();
    assert.equal(requests.filter((req) => req.path.endsWith("/confirm")).length, 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("parcel_nexus_resident_collection")), null);
    assert.ok(requests.filter((req) => req.path.includes("collection-verifications")).every((req) => req.auth?.startsWith("Bearer ")));
    await page.reload();
    await page.getByRole("heading", { name: "Collection Confirmed" }).waitFor();
    await capture(page, "completed", width);
    assert.deepEqual(qa.errors, []); await qa.context.close(); assertions += 12;
    console.log(`Resident QR → verification → atomic confirmation fixture checks passed at ${width}px`);
  }

  // Existing My Parcels QR selection/generation is still the entry point.
  const generation = await setup(390, { seed: false });
  await generation.page.goto(`${baseURL}/dashboard`);
  await generation.page.getByRole("button", { name: "Select parcel", exact: true }).first().click();
  await generation.page.getByRole("button", { name: "Generate QR Code", exact: true }).click();
  await generation.page.getByRole("img", { name: "Secure parcel collection QR code" }).waitFor();
  assert.ok(generation.requests.some((req) => req.path === "/api/resident/collections" && req.body.parcel_ids.length > 0));
  await generation.context.close(); assertions++;

  for (const active of [true, false]) {
    const qa = await setup(390, { active, expiredQr: true });
    await qa.page.goto(`${baseURL}/parcel-collection`);
    await qa.page.getByRole("heading", { name: active ? "Verify Your Parcels" : "QR Expired", exact: true }).waitFor();
    if (active) {
      assert.equal(await qa.page.getByRole("button", { name: "Scan Barcode", exact: true }).first().isDisabled(), false);
      qa.state.verification.expires_at = new Date(Date.now() - 1000).toISOString(); qa.state.verification.status = "EXPIRED";
      await qa.page.getByRole("heading", { name: "Verification session expired" }).waitFor();
      assert.equal(await qa.page.getByRole("button", { name: "Confirm Collection" }).count(), 0);
      const reads = qa.requests.length; await delay(3300); assert.equal(qa.requests.length, reads, "closed session stops polling");
    } else {
      await qa.page.getByRole("button", { name: "Generate New QR" }).click();
      await qa.page.getByRole("img", { name: "Secure parcel collection QR code" }).waitFor();
    }
    await qa.context.close(); assertions += 2;
  }

  const cancelled = await setup(390, { active: true });
  await cancelled.page.goto(`${baseURL}/parcel-collection`);
  cancelled.page.on("dialog", (dialog) => dialog.accept());
  await cancelled.page.getByRole("button", { name: "Cancel Verification" }).click();
  await cancelled.page.getByRole("heading", { name: "Verification cancelled" }).waitFor();
  await cancelled.context.close(); assertions++;

  const privacy = await setup(390, { active: true, restore: true }); privacy.state.readStatus = 404;
  await privacy.page.goto(`${baseURL}/parcel-collection`);
  await privacy.page.getByRole("heading", { name: "Verification unavailable" }).waitFor();
  assert.equal(await privacy.page.getByRole("button", { name: "Confirm Collection" }).count(), 0);
  await privacy.context.close(); assertions++;

  const network = await setup(390, { active: true }); network.state.networkFailure = true;
  await network.page.goto(`${baseURL}/parcel-collection`);
  await network.page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  network.state.networkFailure = false; await network.page.getByRole("button", { name: "Retry", exact: true }).click();
  await network.page.getByRole("heading", { name: "Verify Your Parcels" }).waitFor();
  network.state.readDelay = 3400;
  await delay(7200); assert.equal(network.state.maxReads, 1, "poll reads do not overlap");
  await network.context.close(); assertions += 2;

  const failures = await setup(390, { active: true });
  await failures.page.goto(`${baseURL}/parcel-collection`);
  await failures.page.getByRole("heading", { name: "Verify Your Parcels" }).waitFor();
  await card(failures.page).getByLabel("Choose parcel photo", { exact: true }).setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
  failures.state.mutationStatus = 409;
  await card(failures.page).getByRole("button", { name: "Use & Upload Photo" }).click();
  await card(failures.page).getByText("Collection update failed. Please try again.", { exact: true }).waitFor();
  assert.equal(failures.state.verification.parcels[0].photo_present, false);
  assert.equal(await card(failures.page).getByRole("img", { name: "Parcel photo preview, not yet uploaded" }).count(), 1);
  failures.state.mutationStatus = 200;
  await card(failures.page).getByRole("button", { name: "Use & Upload Photo" }).click();
  await card(failures.page).getByText("Photo: Uploaded", { exact: true }).waitFor();
  failures.state.mutationStatus = 429;
  await manual(failures.page, 0, failures.state.verification.parcels[0].registered_tracking_number);
  await card(failures.page).getByText("Too many attempts. Please wait before trying again.", { exact: true }).waitFor();
  await capture(failures.page, "manual-fallback", 390);
  assert.equal(await failures.page.getByRole("button", { name: "Confirm Collection" }).isDisabled(), true);
  await failures.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await delay(100);
  const pausedReads = failures.requests.filter((req) => req.method === "GET").length;
  await delay(3300);
  assert.equal(failures.requests.filter((req) => req.method === "GET").length, pausedReads, "hidden tab pauses polling");
  await failures.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await delay(150);
  assert.ok(failures.requests.filter((req) => req.method === "GET").length > pausedReads, "visible tab refreshes");
  await failures.context.close(); assertions += 4;

  const camera = await setup(390, { active: true });
  await camera.page.goto(`${baseURL}/parcel-collection`);
  await card(camera.page).getByRole("button", { name: "Scan Barcode", exact: true }).click();
  await camera.page.getByText("Keep the shipping barcode inside the frame", { exact: true }).waitFor();
  await camera.page.getByRole("button", { name: "Close barcode scanner" }).click();
  assert.equal(await card(camera.page).getByRole("button", { name: "Scan Barcode", exact: true }).evaluate((button) => button === document.activeElement), true);
  assert.equal(await camera.page.evaluate(() => window.__cameraStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), true);
  await camera.page.evaluate(() => { window.__cameraMode = "denied"; });
  await card(camera.page).getByRole("button", { name: "Scan Barcode", exact: true }).click();
  await camera.page.getByText(/Camera permission was denied/).waitFor();
  await capture(camera.page, "scanner-recovery", 390);
  await camera.page.getByRole("button", { name: "Close barcode scanner" }).click();
  const bits = code128Fixture(camera.state.verification.parcels[0].registered_tracking_number);
  await camera.page.evaluate((bits) => { window.__cameraMode = "barcode"; window.__barcodeBits = bits; }, bits);
  await card(camera.page).getByRole("button", { name: "Scan Barcode", exact: true }).click();
  await card(camera.page).getByText("Barcode: Verified", { exact: true }).waitFor();
  assert.equal(camera.requests.filter((req) => req.path.endsWith("/barcode")).length, 1);
  assert.equal(await camera.page.evaluate(() => window.__cameraStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), true);
  await camera.page.evaluate(() => { window.__barcodeBits = null; });
  await card(camera.page, 1).getByRole("button", { name: "Scan Barcode", exact: true }).click();
  await camera.page.getByText("Keep the shipping barcode inside the frame", { exact: true }).waitFor();
  await camera.page.getByRole("button", { name: "Back to My Parcels", exact: true }).click();
  assert.equal(await camera.page.evaluate(() => window.__cameraStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), true);
  assert.deepEqual(camera.errors, []); await camera.context.close(); assertions += 4;

  for (const role of ["GUARD", "ADMIN", "SUPER_ADMIN"]) {
    const qa = await setup(390, { role }); await qa.page.goto(`${baseURL}/parcel-collection`); await delay(400);
    assert.ok(qa.requests.every((req) => !req.path.includes("collection-verifications")));
    await qa.context.close(); assertions++;
  }
  console.log(`Step 18B browser checks completed: ${assertions} scenario assertions; APIs intercepted, synthetic camera only, no real Socket delivery claimed.`);
} finally { await browser.close(); }
