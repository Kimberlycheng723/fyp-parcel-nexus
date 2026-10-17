import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const userId = "66666666-6666-4666-8666-666666666666", collectionId = "99999999-9999-4999-8999-999999999999";
const sessionId = "88888888-8888-4888-8888-888888888888";
const parcelIds = [1, 2].map((index) => `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let assertions = 0;

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
  await context.addInitScript(({ token, collection, parcelIds, userId, seed, restore, sessionId, width }) => {
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
      const canvas = document.createElement("canvas"); canvas.width = width === 390 ? 480 : 640; canvas.height = width === 390 ? 640 : 480;
      const ctx = canvas.getContext("2d");
      function paint() {
        ctx.fillStyle = "#1ca050"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#bb8844"; ctx.fillRect(130,90,380,300); ctx.fillStyle = "#fff"; ctx.fillRect(250,180,180,100);
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
  }, { token, collection, parcelIds, userId, seed, restore, sessionId, width });
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  // Fixture-only responses: no mutation reaches the running backend or database.
  await context.route("**/api/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const body = method === "GET" || method === "PUT" || path === "/api/parcel-registration/photos" ? null : req.postDataJSON();
    requests.push({ path, method, body, auth: req.headers().authorization, raw: method === "PUT" ? req.postData() : null });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (path === "/api/couriers") return fulfill(route, { couriers: [{ courier_id: parcelIds[0], courier_name: 'Shopee Express', courier_code: 'SPX', status: 'ACTIVE' }] });
    if (path === "/api/parcel-rooms/active") return fulfill(route, { parcel_rooms: [{ id: parcelIds[1], name: 'Lobby Room', is_active: true }] });
    if (path === "/api/parcel-registration/photos") {
      assert.equal(method, 'POST'); assert.ok(req.headers()['content-type'].includes('multipart/form-data'));
      return fulfill(route, { photo: { parcel_photo_url: '/uploads/parcels/test-camera.jpg' } }, 201);
    }
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

async function open(t, registration) {
  await t.page.goto(baseURL + (registration ? '/parcels/new' : '/parcel-collection'));
  if (registration) {
    await t.page.locator('.courier-select-button').click();
    await t.page.locator('.courier-option-button').first().click();
    await t.page.getByPlaceholder('12 345 6789').fill('123456789');
    await t.page.getByRole('button', { name: 'Continue to parcel details' }).click();
    await t.page.locator('.photo-choice-panel').getByRole('button', { name: /Capture parcel photo/ }).click();
  } else {
    await t.page.getByRole('heading', { name: 'Verify Your Parcels' }).waitFor();
    await t.page.getByRole('article').first().getByRole('button', { name: 'Take Photo', exact: true }).click();
  }
}
async function stopped(page) {
  await page.waitForFunction(() => window.__cameraStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('.guided-parcel-camera .guided-camera-primary')?.disabled);
  await page.locator('.guided-camera-frame').waitFor();
}
try {
  for (const width of [1440,834,390]) for (const registration of [true,false]) {
    const t = await setup(width, { role: registration ? 'GUARD' : 'RESIDENT', active: true });
    await open(t, registration); await ready(t.page);
    const dialog = t.page.getByRole('dialog', { name: 'Capture parcel photo', exact: true });
    assert.equal(await dialog.evaluate((element) => element.matches(':modal')), true);
    assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth), false);
    const geometry = await dialog.evaluate((element) => {
      const stage = element.querySelector('.guided-camera-stage').getBoundingClientRect(), frame = element.querySelector('.guided-camera-frame').getBoundingClientRect();
      return { ratio: stage.width / stage.height, inside: frame.left > stage.left && frame.right < stage.right && frame.top > stage.top && frame.bottom < stage.bottom };
    });
    assert.ok(Math.abs(geometry.ratio - (width === 390 ? 3 / 4 : 4 / 3)) < .02); assert.equal(geometry.inside, true);
    await t.page.screenshot({ path: '/private/tmp/parcel-nexus-guided-camera-' + (registration ? 'registration' : 'collection') + '-' + width + '.png' }); assertions++;
    await dialog.getByRole('button', { name: 'Capture photo', exact: true }).click();
    const review = t.page.getByRole('dialog', { name: 'Review parcel photo', exact: true });
    await review.getByRole('img', { name: 'Captured parcel photo' }).waitFor(); await stopped(t.page);
    const pixels = await review.getByRole('img', { name: 'Captured parcel photo', exact: true }).evaluate(async (element) => {
      await element.decode(); const canvas = document.createElement('canvas'); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(element,0,0);
      return { width: canvas.width, height: canvas.height, edge: [...ctx.getImageData(5,5,1,1).data], guidePosition: [...ctx.getImageData(77,58,1,1).data] };
    });
    assert.equal(pixels.width,width === 390 ? 480 : 640); assert.equal(pixels.height,width === 390 ? 640 : 480);
    for (const pixel of [pixels.edge,pixels.guidePosition]) { assert.ok(Math.abs(pixel[0]-28)<8); assert.ok(Math.abs(pixel[1]-160)<8); assert.ok(Math.abs(pixel[2]-80)<8); }
    assert.equal(await review.locator('.guided-camera-frame').count(),0);
    assert.equal(t.requests.filter((req) => req.method !== 'GET').length,0); assertions++;
    await review.getByRole('button', { name: 'Retake', exact: true }).click(); await ready(t.page);
    await t.page.getByRole('dialog').getByRole('button', { name: 'Capture photo', exact: true }).click();
    await review.getByRole('button', { name: 'Use photo', exact: true }).waitFor(); await review.getByRole('button', { name: 'Use photo', exact: true }).click();
    await stopped(t.page);
    if (registration) {
      await t.page.getByText('Photo uploaded and ready.').waitFor();
      assert.equal(t.requests.filter((req) => req.path === '/api/parcel-registration/photos').length,1);
    } else {
      const card = t.page.getByRole('article').first();
      await card.getByRole('img', { name: 'Parcel photo preview, not yet uploaded' }).waitFor();
      assert.equal(t.requests.filter((req) => req.method !== 'GET').length,0);
      await card.getByRole('button', { name: 'Use & Upload Photo' }).click(); await card.getByText('Photo: Uploaded', { exact: true }).waitFor();
      assert.equal(t.requests.filter((req) => req.path.endsWith('/photo') && req.method === 'PUT').length,1);
      assert.equal(t.requests.filter((req) => req.path.endsWith('/confirm')).length,0);
    }
    assertions++;
    await t.page.evaluate(() => { window.__cameraMode = 'denied'; });
    if (registration) await t.page.locator('.photo-preview-actions').getByRole('button', { name: 'Retake', exact: true }).click();
    else await t.page.getByRole('article').first().getByRole('button', { name: 'Retake Photo', exact: true }).click();
    await t.page.getByRole('dialog').getByRole('alert').getByText(/Camera permission was denied/).waitFor();
    await t.page.getByRole('dialog').getByRole('button', { name: 'Choose photo', exact: true }).waitFor();
    await t.page.keyboard.press('Escape'); await t.page.getByRole('dialog').waitFor({ state: 'hidden' }); await stopped(t.page); assertions++;
    await t.page.evaluate(() => { window.__cameraMode = 'blank'; });
    if (registration) await t.page.locator('.photo-preview-actions').getByRole('button', { name: 'Retake', exact: true }).click();
    else await t.page.getByRole('article').first().getByRole('button', { name: 'Retake Photo', exact: true }).click();
    await ready(t.page);
    await t.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await t.page.getByRole('dialog').getByText(/Camera paused while this page was hidden/).waitFor(); await stopped(t.page);
    await t.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
    await t.page.getByRole('dialog').getByRole('button', { name: 'Try again', exact: true }).click(); await ready(t.page);
    await t.page.getByRole('dialog').getByRole('button', { name: 'Close camera' }).click(); await stopped(t.page);
    assert.deepEqual(t.errors,[]); assertions++; await t.context.close();
  }
  {
    const t = await setup(390, { active:true });
    await t.context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { window.__resolveCamera = () => { const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=480; const stream=canvas.captureStream(); window.__cameraStreams.push(stream); resolve(stream); }; });
    });
    await open(t,false); await t.page.getByRole('dialog').getByText('Starting camera...').waitFor();
    await t.page.getByRole('dialog').getByRole('button', { name: 'Close camera' }).click();
    await t.page.evaluate(() => window.__resolveCamera()); await stopped(t.page);
    assert.deepEqual(t.errors,[]); assertions++; await t.context.close();
  }
  console.log('Guided parcel camera: ' + assertions + ' scenarios passed with synthetic camera streams and intercepted APIs; no physical device or live database writes.');
} finally { await browser.close(); }
