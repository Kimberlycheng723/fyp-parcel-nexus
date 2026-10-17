import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const userId = "66666666-6666-4666-8666-666666666666";
const roomId = "11111111-1111-4111-8111-111111111111";
const parcelIds = [1, 2, 3].map((index) => `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`);
const disputeIds = [1, 2, 3].map((index) => `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`);
const rawToken = "fixture-collection-token-for-real-qr-decoder";
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(role, width, qrImage) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: userId, role, first_name: "Test", last_name: role, status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  const parcels = parcelIds.map((id, index) => ({ parcel_id: id, tracking_number: `QR-TRACK-${index + 1}`, courier_name: "Shopee Express",
    unit_full_code: "A-10-01", parcel_room_id: index === 2 ? null : roomId,
    parcel_room_name: ["Lobby Parcel Room", "Inactive Historical Room", null][index], status: "PENDING_COLLECTION", is_overdue: false,
    created_at: new Date().toISOString() }));
  const collection = { collection_id: "99999999-9999-4999-8999-999999999999", token: rawToken,
    expires_at: new Date(Date.now() + 120000).toISOString(), expires_in_seconds: 120, parcel_count: 3, parcels };
  const disputes = parcels.map((parcel, index) => ({ dispute_id: disputeIds[index], dispute_reference: `DSP-TEST-${index + 1}`,
    issue_type: "DAMAGED", description: "A parcel issue reported by the Resident.", status: "OPEN", evidence_count: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), latest_activity_at: new Date().toISOString(), parcel,
    resident: { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Test Resident", unit_full_code: "A-10-01" },
    assigned_handler: null, guard_response: null, admin_resolution_notes: null, evidence: [] }));
  const state = { parcels, collection, disputes, roomReadStatus: 200, disputeReadStatus: 200 };
  await context.addInitScript(({ token, collection, parcelIds }) => {
    localStorage.setItem("parcel_nexus_access_token", token);
    sessionStorage.setItem("parcel_nexus_resident_collection", JSON.stringify({ resident_id: "66666666-6666-4666-8666-666666666666", collection, parcel_ids: parcelIds, unit: { unit_full_code: "A-10-01" } }));
  }, { token, collection, parcelIds });
  if (qrImage) await context.addInitScript((src) => {
    // Test-only camera stream. The production ZXing decoder still reads real QR pixels.
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d");
      function paint() { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); ctx.drawImage(image, 140, 60, 360, 360); }
      paint();
      const stream = canvas.captureStream(10), interval = setInterval(paint, 100);
      stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(interval));
      return stream;
    };
  }, qrImage);
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  // Every API call is intercepted, including mutations. No live collection/dispute is changed.
  await context.route("**/api/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const body = method === "GET" ? null : req.postDataJSON();
    requests.push({ path, method, body, query: Object.fromEntries(url.searchParams), auth: req.headers().authorization });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (/\/api\/resident\/parcels\/[0-9a-f-]+$/.test(path)) {
      await wait(80);
      if (state.roomReadStatus !== 200) return fulfill(route, { message: "Parcel was not found." }, state.roomReadStatus);
      return fulfill(route, { parcel: state.parcels.find((parcel) => path.endsWith(parcel.parcel_id)) });
    }
    if (path === "/api/guard/collections/verify") {
      state.verification ||= { session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", collection_id: collection.collection_id,
        guard_id: userId, status: "AWAITING_VERIFICATION", unit_reference: "A-10-01", expires_at: new Date(Date.now() + 900000).toISOString(), parcel_count: 3,
        parcels: state.parcels.map((parcel) => ({ ...parcel, registered_tracking_number: parcel.tracking_number, barcode_status: "PENDING", photo_present: false })) };
      return fulfill(route, { verification_session: state.verification });
    }
    if (path.startsWith("/api/collection-verifications/")) return fulfill(route, { verification_session: state.verification });
    if (path === "/api/resident/collection-verifications/active") return fulfill(route, { verification_sessions: [] });
    if (path === "/api/resident/collections") return fulfill(route, { collection: { ...collection, collection_id: "99999999-9999-4999-8999-999999999998", parcels: state.parcels } }, 201);
    if (path === "/api/disputes") {
      const status = url.searchParams.get("status");
      const matching = status ? disputes.filter((dispute) => dispute.status === status) : disputes;
      return fulfill(route, { disputes: matching, pagination: { page: 1, limit: 100, total: matching.length, total_pages: 1 } });
    }
    if (path.startsWith("/api/disputes/")) {
      const dispute = disputes.find((item) => path.includes(item.dispute_id));
      if (state.disputeReadStatus !== 200 || !dispute) return fulfill(route, { message: "Dispute not found." }, 404);
      if (path.endsWith("/history")) return fulfill(route, { history: [{ history_id: "fixture-event", new_status: dispute.status, note: "Existing workflow event", created_at: dispute.created_at, actor: { name: "Test", role } }] });
      if (path.endsWith("/messages")) {
        if (method === "POST") return fulfill(route, { dispute_message: { message_id: "fixture-message", message: body.message, sender: user, created_at: new Date().toISOString() } }, 201);
        return fulfill(route, { messages: [], conversation: { read_only: dispute.status === "RESOLVED" } });
      }
      if (path.endsWith("/transition")) {
        dispute.status = body.status; dispute.assigned_handler = { user_id: userId, name: "Test Staff", role };
        return fulfill(route, { dispute, message: "Dispute updated." });
      }
      if (path.endsWith("/guard-response") || path.endsWith("/admin-resolution-notes")) Object.assign(dispute, body);
      return fulfill(route, { dispute: role === "RESIDENT" ? { ...dispute, resident: undefined } : dispute });
    }
    return fulfill(route, {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, state, requests, errors };
}

async function capture(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0, 0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}.png`, fullPage: true });
}

try {
  for (const width of [1440, 834, 390]) {
    const qa = await setup("RESIDENT", width), { page, state, requests } = qa;
    // A restored session has old room data: only authorized detail reads may refresh it.
    state.parcels[0].parcel_room_name = "Reassigned Current Room";
    await page.goto(`${baseURL}/parcel-collection`);
    await page.getByText("Parcel Room: Reassigned Current Room", { exact: true }).waitFor();
    await page.getByText("Parcel Room: Inactive Historical Room", { exact: true }).waitFor();
    await page.getByText("Parcel Room: Not Assigned", { exact: true }).waitFor();
    const qr = page.getByRole("img", { name: "Secure parcel collection QR code" });
    await qr.waitFor();
    const qrImage = await qr.getAttribute("src");
    assert.ok(qrImage.startsWith("data:image/png;base64,"));
    assert.equal(requests.filter((req) => req.method === "POST").length, 0);
    const sessionBefore = await page.evaluate(() => JSON.parse(sessionStorage.getItem("parcel_nexus_resident_collection")));
    assert.equal(sessionBefore.collection.token, rawToken);
    await capture(page, "resident-qr-rooms", width);
    state.roomReadStatus = 404;
    await page.getByRole("button", { name: "Refresh parcel rooms" }).click();
    await page.getByRole("alert").filter({ hasText: "Some parcel rooms could not be refreshed" }).waitFor();
    assert.equal(await page.getByText("Parcel Room: Room information unavailable", { exact: true }).count(), 3);
    assert.equal(await qr.getAttribute("src"), qrImage);
    state.roomReadStatus = 200;
    state.parcels[0].parcel_room_name = "W".repeat(100);
    await page.getByRole("button", { name: "Refresh parcel rooms" }).click();
    await page.getByText(`Parcel Room: ${"W".repeat(100)}`, { exact: true }).waitFor();
    await capture(page, "resident-qr-rooms-long", width);
    assert.equal((await page.evaluate(() => JSON.parse(sessionStorage.getItem("parcel_nexus_resident_collection")))).collection.expires_at, sessionBefore.collection.expires_at);
    assert.ok(requests.every((req) => !req.path.startsWith("/api/parcel-rooms")));
    await page.goto(`${baseURL}/disputes/${disputeIds[0]}`);
    await page.locator(".resident-related-parcel").getByText("W".repeat(100), { exact: true }).waitFor();
    await capture(page, "resident-dispute-room", width);
    await page.goto(`${baseURL}/disputes/${disputeIds[2]}`);
    await page.locator(".resident-related-parcel").getByText("Not Assigned", { exact: true }).waitFor();
    state.disputeReadStatus = 404;
    await page.goto(`${baseURL}/disputes/${disputeIds[1]}`);
    await page.getByText("This dispute was not found or does not belong to your account.").waitFor();
    assert.equal(await page.locator(".resident-related-parcel").count(), 0);
    assert.deepEqual(qa.errors, []);
    await qa.context.close();

    const guard = await setup("GUARD", width, qrImage);
    guard.state.parcels[0].parcel_room_name = "W".repeat(100);
    await guard.page.goto(`${baseURL}/verify-collection`);
    await guard.page.getByRole("heading", { name: "Verification Started" }).waitFor();
    await guard.page.locator(".guard-session-parcels").getByText("Parcel Room: Inactive Historical Room").waitFor();
    assert.equal(await guard.page.locator(".guard-session-parcels article").count(), 3);
    assert.equal(await guard.page.getByRole("heading", { name: "Collection Completed" }).count(), 0);
    assert.deepEqual(guard.requests.find((req) => req.path === "/api/guard/collections/verify").body, { token: rawToken });
    assert.equal(guard.requests.filter((req) => req.path === "/api/guard/collections/verify").length, 1);
    await capture(guard.page, "guard-qr-room-results", width);
    assert.deepEqual(guard.errors, []);
    await guard.context.close();

    for (const role of ["GUARD", "ADMIN"]) {
      const staff = await setup(role, width), { page, state } = staff;
      state.parcels[0].parcel_room_name = "W".repeat(100);
      await page.goto(`${baseURL}/disputes`);
      await page.locator(".staff-dispute-card").first().click();
      const dialog = page.getByRole("dialog", { name: "Damaged" });
      await dialog.locator(".staff-dispute-parcel-details").getByText("W".repeat(100), { exact: true }).waitFor();
      await capture(page, `staff-dispute-room-${role.toLowerCase()}`, width);
      assert.equal(await dialog.getByRole("combobox").count(), 0);
      await dialog.getByRole("button", { name: "Take Dispute", exact: true }).click();
      await dialog.getByText(role === "GUARD" ? "In Review (Guard)" : "In Review (Admin)", { exact: true }).first().waitFor();
      assert.equal(state.disputes[0].status, role === "GUARD" ? "IN_REVIEW_GUARD" : "IN_REVIEW_ADMIN");
      await dialog.getByRole("button", { name: "Resolve", exact: true }).click();
      await dialog.getByText("Resolved", { exact: true }).first().waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.locator(".staff-dispute-card").filter({ hasText: "DSP-TEST-3" }).click();
      await dialog.locator(".staff-dispute-parcel-details").getByText("Not Assigned", { exact: true }).waitFor();
      assert.ok(staff.requests.every((req) => !req.path.startsWith("/api/parcel-rooms")));
      assert.deepEqual(staff.errors, []);
      await staff.context.close();
    }
    console.log(`Step 17D QR decoding/room display/dispute browser checks passed at ${width}px`);
  }
  for (const [role, path] of [["ADMIN", "/verify-collection"], ["RESIDENT", "/verify-collection"], ["GUARD", "/parcel-collection"], ["SUPER_ADMIN", "/disputes"]]) {
    const qa = await setup(role, 390);
    await qa.page.goto(`${baseURL}${path}`);
    await qa.page.waitForTimeout(500);
    assert.ok(qa.requests.every((req) => !req.path.startsWith("/api/guard/collections") && !/\/api\/resident\/parcels\/[0-9a-f-]{36}$/.test(req.path) && !req.path.startsWith("/api/disputes")), `${role} denied ${path}: no protected QR/dispute requests`);
    await qa.context.close();
  }
} finally { await browser.close(); }
