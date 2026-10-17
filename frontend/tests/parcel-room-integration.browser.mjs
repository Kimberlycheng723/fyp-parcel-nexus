import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const courier = { courier_id: "44444444-4444-4444-8444-444444444444", courier_name: "Shopee Express", courier_code: "SPX", badge_color: "#EF4444", status: "ACTIVE" };
const unit = { unit_id: "55555555-5555-4555-8555-555555555555", full_unit_code: "A-10-01" };
const rooms = () => [
  { id: ids[0], name: "Lobby Parcel Room", is_active: true },
  { id: ids[1], name: "Tower B Parcel Room", is_active: true },
  { id: ids[2], name: "Historical Parcel Room", is_active: false }
];
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: "66666666-6666-4666-8666-666666666666", role, first_name: "Test", last_name: role, status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await context.addInitScript((value) => localStorage.setItem("parcel_nexus_access_token", value), token);
  const state = { rooms: rooms(), writeStatus: 200, roomStatus: 200, detailStatus: 200 };
  state.parcels = [null, ids[2], ids[0], ids[1], ids[0], ids[0], ids[0], ids[0], ids[0], ids[0], null, ids[2]].map((roomId, index) => ({
    parcel_id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
    tracking_number: `SPX-${index + 1}`, parcel_room_id: roomId,
    parcel_room_name: state.rooms.find((room) => room.id === roomId)?.name || null,
    courier_id: courier.courier_id, courier, unit_id: unit.unit_id, unit,
    unit_full_code: unit.full_unit_code, courier_name: courier.courier_name,
    courier_code: courier.courier_code, courier_badge_color: courier.badge_color,
    status: "PENDING_COLLECTION", display_status: "PENDING_COLLECTION",
    created_at: new Date().toISOString(), collection_deadline: "2026-12-01T08:30:20.123Z",
    collected_at: null, delivery_person_contact: "0123456789", parcel_photo_url: null
  }));
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  // Intercept every API request. Browser tests never mutate the real database.
  await context.route("**/api/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    requests.push({ path, method, query: Object.fromEntries(url.searchParams), body: method === "GET" ? null : req.postDataJSON(), auth: req.headers().authorization });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (path === "/api/parcel-rooms" || path === "/api/parcel-rooms/active") {
      await wait(80);
      if (state.roomStatus !== 200) return fulfill(route, { message: "Unable to load rooms." }, state.roomStatus);
      return fulfill(route, { parcel_rooms: path.endsWith("/active") ? state.rooms.filter((room) => room.is_active) : state.rooms });
    }
    if (path === "/api/couriers") return fulfill(route, { couriers: [courier] });
    if (path === "/api/units/search") return fulfill(route, { units: [unit] });
    if (path === "/api/parcels/summary") return fulfill(route, { total_parcels: 12, pending_collection_parcels: 12, collected_parcels: 0, overdue_parcels: 0 });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: unit.full_unit_code }, summary: { pending_collection: 12, overdue_parcels: 0, collected_parcels: 0 } });
    if (["/api/parcels", "/api/parcels/export", "/api/resident/parcels"].includes(path)) {
      await wait(80);
      let data = state.parcels;
      const roomId = url.searchParams.get("parcel_room_id"), search = url.searchParams.get("search")?.toLowerCase();
      if (roomId) data = data.filter((parcel) => roomId === "unassigned" ? parcel.parcel_room_id === null : parcel.parcel_room_id === roomId);
      if (search) data = data.filter((parcel) => [parcel.tracking_number, unit.full_unit_code, courier.courier_name].some((value) => value.toLowerCase().includes(search)));
      const status = url.searchParams.get("status");
      if (status && status !== "ALL") data = data.filter((parcel) => parcel.display_status === status);
      const total = data.length, page = Number(url.searchParams.get("page") || 1), limit = Number(url.searchParams.get("limit") || 10);
      if (path.endsWith("/export")) return fulfill(route, { data });
      const pagination = { page, limit, total, total_pages: Math.ceil(total / limit), has_prev: page > 1, has_next: page * limit < total };
      return fulfill(route, { [path.startsWith("/api/resident") ? "items" : "data"]: data.slice((page - 1) * limit, page * limit), pagination });
    }
    if (/\/parcels\/[0-9a-f-]+$/.test(path)) {
      const parcel = state.parcels.find((item) => path.endsWith(item.parcel_id));
      if (!parcel || (method === "GET" && state.detailStatus !== 200)) return fulfill(route, { message: "Parcel was not found." }, 404);
      if (method === "PATCH") {
        await wait(80);
        if (state.writeStatus !== 200) return fulfill(route, { message: "Parcel room must be active." }, state.writeStatus);
        Object.assign(parcel, req.postDataJSON());
        parcel.parcel_room_name = state.rooms.find((room) => room.id === parcel.parcel_room_id)?.name || null;
      }
      return fulfill(route, { parcel });
    }
    if (path === "/api/resident/collections" && method === "POST") return fulfill(route, { collection: { collection_id: "collection-test", qr_token: "fixture-token", expires_at: new Date(Date.now() + 120000).toISOString(), parcels: state.parcels.slice(0, 2) } }, 201);
    return fulfill(route, {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, state, requests, errors };
}

async function capture(page, name, width) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px page overflow`);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}.png`, fullPage: true });
}
const rowFor = (page, width, index = 0) => width > 1100 ? page.locator(".parcel-management-table tbody tr").nth(index) : page.locator(".parcel-mobile-card").nth(index);
const until = async (condition) => { for (let index = 0; index < 100; index++) { if (condition()) return; await wait(50); } throw new Error("Expected API request not observed"); };

try {
  for (const width of [1440, 834, 390]) {
    for (const role of ["ADMIN", "GUARD"]) {
      const qa = await setup(role, width), { page, state, requests } = qa;
      await page.goto(`${baseURL}/parcels`);
      await rowFor(page, width).waitFor();
      assert.equal(await page.locator('.parcel-summary-grid, .parcel-summary-card').count(), 0, 'Admin and Guard parcel lists do not show summary cards');
      assert.equal(requests.some(req => req.path === '/api/parcels/summary'), false, 'Removed cards do not make unused summary requests');
      await page.getByLabel("Parcel Room", { exact: true }).selectOption(ids[2]);
      await until(() => requests.some((req) => req.path === "/api/parcels" && req.query.parcel_room_id === ids[2]));
      await page.getByText("2 parcels", { exact: true }).waitFor();
      assert.match(await rowFor(page, width).innerText(), /Historical Parcel Room/);
      await page.getByLabel("Parcel Room", { exact: true }).selectOption(ids[0]);
      await page.getByText("7 parcels", { exact: true }).waitFor();
      await page.locator(".parcel-pagination button").filter({ hasText: /^2$/ }).click();
      await until(() => requests.some((req) => req.path === "/api/parcels" && req.query.parcel_room_id === ids[0] && req.query.page === "2"));
      await page.getByLabel("Parcel Room", { exact: true }).selectOption("unassigned");
      await page.getByText("2 parcels", { exact: true }).waitFor();
      assert.equal(requests.filter((req) => req.path === "/api/parcels").at(-1).query.page, "1");
      assert.match(await rowFor(page, width).innerText(), /Not Assigned/);
      await page.getByRole("button", { name: "Reset filters" }).click();
      await page.getByText("12 parcels", { exact: true }).waitFor();
      await capture(page, `parcel-management-rooms-${role.toLowerCase()}`, width);
      await rowFor(page, width).getByRole("button", { name: /View/ }).click();
      const detail = page.getByRole("dialog", { name: "Parcel details" });
      await detail.waitFor({ state: "visible" });
      assert.match(await detail.innerText(), /Parcel Room\s+Not Assigned/i);
      assert.equal(await detail.evaluate((node) => node.matches(":modal")), true);
      await capture(page, "parcel-room-details", width);
      await page.keyboard.press("Escape");
      await detail.waitFor({ state: "hidden" });
      await rowFor(page, width).getByRole("button", { name: /Edit/ }).click();
      const edit = page.getByRole("dialog", { name: "Edit parcel" });
      await edit.getByLabel("Parcel Room", { exact: true }).selectOption(ids[1]);
      assert.equal(await edit.locator("select option").filter({ hasText: "Historical Parcel Room" }).count(), 0);
      await capture(page, "parcel-room-edit", width);
      state.writeStatus = 400;
      state.rooms[1].is_active = false;
      await edit.getByRole("button", { name: "Save changes" }).click();
      await edit.getByText("Parcel room must be active.", { exact: true }).waitFor();
      assert.equal(state.parcels[0].parcel_room_id, null);
      await edit.getByLabel("Parcel Room", { exact: true }).selectOption(ids[0]);
      state.writeStatus = 200;
      await edit.getByRole("button", { name: "Save changes" }).click();
      await edit.waitFor({ state: "hidden" });
      assert.deepEqual(requests.filter((req) => req.method === "PATCH").at(-1).body, { parcel_room_id: ids[0] });
      await page.getByText("12 parcels", { exact: true }).waitFor();
      await rowFor(page, width).getByText("Lobby Parcel Room", { exact: true }).waitFor();
      assert.match(await rowFor(page, width).innerText(), /Lobby Parcel Room/);
      assert.equal(requests.some(req => req.path === '/api/parcels/summary'), false, 'Editing a parcel refreshes the list without fetching removed summaries');
      // Editing another field on a historical inactive assignment must omit room ID.
      await rowFor(page, width, 1).getByRole("button", { name: /Edit/ }).click();
      await edit.getByLabel("Tracking number").fill("UPDATED-TRACKING");
      await edit.getByRole("button", { name: "Save changes" }).click();
      await edit.waitFor({ state: "hidden" });
      assert.deepEqual(requests.filter((req) => req.method === "PATCH").at(-1).body, { tracking_number: "UPDATED-TRACKING" });
      await page.getByPlaceholder("Search by tracking number, unit number or courier").fill("SPX");
      await page.locator(".parcel-filter-trigger").first().click();
      await page.getByRole("option", { name: "Pending Collection" }).click();
      await page.getByLabel("Parcel Room", { exact: true }).selectOption(ids[0]);
      await until(() => requests.some((req) => req.query.search === "SPX" && req.query.status === "PENDING_COLLECTION" && req.query.parcel_room_id === ids[0]));
      if (role === "ADMIN") {
        const formulaNames = ["=1+1", "+SUM(1,2)", "-1+1", "@SUM(A1)"];
        state.parcels.filter((parcel) => parcel.parcel_room_id === ids[0]).forEach((parcel, index) => {
          parcel.parcel_room_name = formulaNames[index % formulaNames.length];
        });
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export CSV", exact: true }).click();
        const csv = await readFile(await (await download).path(), "utf8");
        assert.ok(csv.split("\n")[0].includes("Parcel Room"));
        for (const name of formulaNames) assert.ok(csv.includes(`'${name}`), "Room values must not execute as spreadsheet formulas");
        assert.equal(requests.findLast((req) => req.path === "/api/parcels/export").query.parcel_room_id, ids[0]);
      } else {
        assert.equal(await page.getByRole("button", { name: "Export CSV", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: /Delete/ }).count(), 0);
      }
      assert.ok(requests.filter((req) => req.path.includes("parcel")).every((req) => req.auth?.startsWith("Bearer ")));
      assert.deepEqual(qa.errors, []);
      await qa.context.close();
    }

    const qa = await setup("RESIDENT", width), { page, requests } = qa;
    await page.goto(`${baseURL}/dashboard`);
    await page.getByRole("heading", { name: "My Parcels" }).waitFor();
    const list = page.locator(width > 640 ? ".resident-parcel-table" : ".resident-mobile-list");
    await list.getByText("Parcel Room: Not Assigned", { exact: true }).first().waitFor();
    assert.match(await list.innerText(), /Historical Parcel Room/);
    await capture(page, "resident-parcel-rooms", width);
    await list.getByRole("button", { name: "View parcel SPX-2", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "Parcel details" });
    await detail.waitFor({ state: "visible" });
    assert.match(await detail.innerText(), /Historical Parcel Room/);
    assert.equal(await detail.locator("select,input").count(), 0);
    assert.equal(await detail.getByRole("button").count(), 1);
    await capture(page, "resident-parcel-room-details", width);
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "hidden" });
    qa.state.detailStatus = 404;
    await list.getByRole("button", { name: "View parcel SPX-1", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Parcel was not found" }).waitFor();
    assert.equal(await detail.count(), 0);
    qa.state.detailStatus = 200;
    await list.getByRole("button", { name: "Select parcel", exact: true }).nth(0).click();
    await list.getByRole("button", { name: "Select parcel", exact: true }).nth(0).click();
    await page.getByRole("button", { name: "Generate QR Code", exact: true }).click();
    await until(() => requests.some((req) => req.path === "/api/resident/collections" && req.method === "POST"));
    assert.deepEqual(requests.findLast((req) => req.path === "/api/resident/collections").body.parcel_ids, qa.state.parcels.slice(0, 2).map((parcel) => parcel.parcel_id));
    assert.ok(requests.every((req) => !req.path.startsWith("/api/parcel-rooms") && !req.path.startsWith("/api/parcels")));
    assert.deepEqual(qa.errors, []);
    await qa.context.close();
    console.log(`Step 17C staff/resident browser checks passed at ${width}px`);
  }
  for (const role of ["RESIDENT", "SUPER_ADMIN"]) {
    const qa = await setup(role, 390);
    await qa.page.goto(`${baseURL}/parcels`);
    await qa.page.getByText("Access denied", { exact: true }).waitFor();
    assert.ok(qa.requests.every((req) => !req.path.startsWith("/api/parcel-rooms") && !req.path.startsWith("/api/parcels")));
    await qa.context.close();
  }
  const qa = await setup("ADMIN", 390);
  qa.state.roomStatus = 500;
  await qa.page.goto(`${baseURL}/parcels`);
  await qa.page.getByRole("alert").filter({ hasText: "Unable to load rooms" }).waitFor();
  qa.state.roomStatus = 200;
  await qa.page.getByRole("button", { name: "Retry", exact: true }).click();
  await qa.page.getByLabel("Parcel Room", { exact: true }).selectOption(ids[0]);
  await qa.page.getByText("7 parcels", { exact: true }).waitFor();
  await qa.context.close();
  for (const width of [1440, 834, 390]) {
    const qa = await setup("ADMIN", width);
    qa.state.rooms[0].name = "W".repeat(100);
    qa.state.parcels.filter((parcel) => parcel.parcel_room_id === ids[0]).forEach((parcel) => { parcel.parcel_room_name = qa.state.rooms[0].name; });
    await qa.page.goto(`${baseURL}/parcels`);
    await rowFor(qa.page, width, 2).getByText(qa.state.rooms[0].name, { exact: true }).waitFor();
    await capture(qa.page, "parcel-room-integration-long", width);
    await rowFor(qa.page, width).getByRole("button", { name: /Edit/ }).click();
    const edit = qa.page.getByRole("dialog", { name: "Edit parcel" });
    await edit.getByLabel("Parcel Room", { exact: true }).selectOption(ids[0]);
    await capture(qa.page, "parcel-room-integration-long-edit", width);
    qa.state.roomStatus = 500;
    await edit.getByRole("button", { name: "Refresh rooms", exact: true }).click();
    await edit.getByText("Unable to load rooms.", { exact: true }).waitFor();
    assert.equal(await edit.getByRole("button", { name: "Save changes" }).isDisabled(), true);
    await edit.getByRole("button", { name: "Keep current assignment", exact: true }).click();
    await edit.getByLabel("Tracking number").fill("RECOVERED-EDIT");
    await capture(qa.page, "parcel-room-integration-load-recovery", width);
    await edit.getByRole("button", { name: "Save changes" }).click();
    await edit.waitFor({ state: "hidden" });
    assert.deepEqual(qa.requests.filter((req) => req.method === "PATCH").at(-1).body, { tracking_number: "RECOVERED-EDIT" });
    await rowFor(qa.page, width).getByText("RECOVERED-EDIT", { exact: true }).waitFor();
    await rowFor(qa.page, width).getByRole("button", { name: /Edit/ }).click();
    await edit.getByText("Unable to load rooms.", { exact: true }).waitFor();
    qa.state.roomStatus = 200;
    qa.state.rooms.forEach((room) => { room.is_active = false; });
    await edit.getByRole("button", { name: "Retry loading rooms" }).click();
    await edit.getByText("No active rooms available. The current assignment will be kept.").waitFor();
    await edit.getByLabel("Tracking number").fill("UNCHANGED-ROOM-EDIT");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await edit.waitFor({ state: "hidden" });
    assert.deepEqual(qa.requests.filter((req) => req.method === "PATCH").at(-1).body, { tracking_number: "UNCHANGED-ROOM-EDIT" });
    await qa.context.close();
  }
} finally {
  await browser.close();
}
