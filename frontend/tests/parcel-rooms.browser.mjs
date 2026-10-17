import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const initialRooms = () => [
  { id: ids[0], name: "Lobby Parcel Room", description: "Main lobby storage", is_active: true },
  { id: ids[1], name: "Tower B Parcel Room", description: "Tower B ground floor", is_active: true },
  { id: ids[2], name: "Archive Room", description: null, is_active: false }
];
const courier = { courier_id: "44444444-4444-4444-8444-444444444444", courier_name: "Test Courier", courier_code: "TC", badge_color: "#EF4444", status: "ACTIVE" };
const unit = { unit_id: "55555555-5555-4555-8555-555555555555", full_unit_code: "TEST-01-08", resident_status: "ACTIVE" };
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(role = "ADMIN", width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: "66666666-6666-4666-8666-666666666666", role, first_name: "Test", last_name: role, status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  if (role) await context.addInitScript((value) => localStorage.setItem("parcel_nexus_access_token", value), token);
  const requests = [], errors = [];
  const state = { rooms: initialRooms(), listStatus: 200, activeStatus: 200, writeStatus: 200, registrationStatus: 200, delay: 120 };
  await context.route("**/socket.io/**", (route) => route.abort());
  // All mutation responses are fixtures. No real room/parcel/email/database writes occur.
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 2 });
    if (path === "/api/parcel-rooms" || path.startsWith("/api/parcel-rooms/")) {
      requests.push({ path, method, body: method === "GET" ? null : req.postDataJSON(), auth: req.headers().authorization });
      await wait(state.delay);
      if (method === "GET") {
        const status = path.endsWith("/active") ? state.activeStatus : state.listStatus;
        if (status !== 200) return fulfill(route, { message: status === 403 ? "You do not have permission to manage parcel rooms." : "Unable to load rooms." }, status);
        return fulfill(route, { parcel_rooms: path.endsWith("/active") ? state.rooms.filter((room) => room.is_active) : state.rooms });
      }
      if (state.writeStatus !== 200) return fulfill(route, { message: state.writeStatus === 409 ? "A parcel room with this name already exists." : "Unable to save room." }, state.writeStatus);
      const input = req.postDataJSON();
      let room;
      if (method === "POST") {
        room = { id: "77777777-7777-4777-8777-777777777777", ...input, is_active: true };
        state.rooms.push(room);
      } else {
        room = state.rooms.find((item) => path.includes(item.id));
        Object.assign(room, input);
      }
      return fulfill(route, { parcel_room: room }, method === "POST" ? 201 : 200);
    }
    if (path === "/api/couriers") return fulfill(route, { couriers: [courier] });
    if (path === "/api/units/search") return fulfill(route, { units: [unit] });
    if (path === "/api/parcel-registration/photos") {
      requests.push({ path, method });
      return fulfill(route, { parcel_photo_url: "/uploads/parcels/test-photo.png" }, 201);
    }
    if (path === "/api/parcel-registration/sessions") {
      requests.push({ path, method, body: req.postDataJSON(), auth: req.headers().authorization });
      await wait(150);
      if (state.registrationStatus !== 200) return fulfill(route, { message: "Select an active parcel room." }, state.registrationStatus);
      return fulfill(route, { message: "Parcels registered successfully.", parcels: req.postDataJSON().parcels }, 201);
    }
    if (path === "/api/users") return fulfill(route, { users: [], pagination: { total: 0 } });
    return fulfill(route, {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, requests, errors, state };
}

async function screenshot(page, width, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
  const clipped = await page.locator(".parcel-room-actions button").evaluateAll((nodes) => nodes.some((node) => {
    const box = node.getBoundingClientRect();
    const parent = node.closest("td").getBoundingClientRect();
    return box.right > parent.right + 1;
  }));
  assert.equal(clipped, false);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}.png`, fullPage: true });
}

async function beginRegistration(page) {
  await page.goto(`${baseURL}/parcels/new`);
  try {
    await page.locator(".courier-select-button").click();
  } catch (error) {
    console.log("Registration startup:", await page.locator("body").innerText());
    await page.screenshot({ path: "/private/tmp/parcel-nexus-registration-startup-error.png", fullPage: true });
    throw error;
  }
  await page.locator(".courier-option-button").click();
  await page.getByPlaceholder("12 345 6789").fill("123456789");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#registration-parcel-room").waitFor();
}
async function parcelFields(page, tracking) {
  await page.getByPlaceholder("Search by unit number (e.g. A-12-03)").fill(unit.full_unit_code);
  await page.locator(".unit-results-panel button").first().click();
  await page.getByPlaceholder("Type or scan (e.g. SPX9248103742MY)").fill(tracking);
}

try {
  for (const width of [1440, 834, 390]) {
    const qa = await setup("ADMIN", width);
    const { page, state, requests } = qa;
    await page.goto(`${baseURL}/parcel-rooms`);
    await page.getByText("Loading parcel rooms", { exact: true }).waitFor();
    await page.getByRole("table").waitFor();
    assert.equal(await page.locator(".sidebar .nav-item.active").innerText(), "Parcel Rooms");
    assert.equal(await page.getByRole("button", { name: /Delete/ }).count(), 0);
    await screenshot(page, width, "parcel-rooms");
    await page.getByRole("searchbox").fill("lobby");
    assert.equal(await page.locator("tbody tr").count(), 1);
    await page.getByLabel("Room status").selectOption("INACTIVE");
    await page.getByRole("heading", { name: "No matching rooms" }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await page.locator("tbody tr").count(), 3);
    await page.getByRole("button", { name: "Add Parcel Room", exact: true }).first().click();
    let dialog = page.getByRole("dialog", { name: "Add Parcel Room" });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.evaluate((node) => node.matches(":modal")), true);
    await dialog.getByLabel("Room Name").click();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest("dialog"))), true);
    await page.keyboard.press("Tab");
    await dialog.getByRole("button", { name: "Create Room" }).click();
    await dialog.getByText("Room name is required.").waitFor();
    const beforeCreate = requests.filter((req) => req.method === "POST").length;
    state.writeStatus = 409;
    await dialog.getByLabel("Room Name").fill("Lobby Parcel Room");
    await dialog.getByRole("button", { name: "Create Room" }).click();
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.getByRole("alert").innerText(), /already exists/);
    state.writeStatus = 200;
    await dialog.getByLabel("Room Name").fill("  Reception  Room  ");
    await dialog.getByLabel("Description").fill(" Near the entrance ");
    await page.waitForTimeout(200);
    await screenshot(page, width, "parcel-room-dialog");
    await dialog.locator("form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Edit Reception Room", exact: true }).waitFor();
    assert.equal(requests.filter((req) => req.method === "POST").length, beforeCreate + 2);
    assert.deepEqual(requests.filter((req) => req.method === "POST").at(-1).body, { name: "Reception Room", description: "Near the entrance" });
    await page.getByRole("button", { name: "Edit Reception Room", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Edit Parcel Room" });
    assert.equal(await dialog.getByLabel("Room Name").inputValue(), "Reception Room");
    await dialog.getByLabel("Room Name").fill("Reception Storage");
    await dialog.getByLabel("Description").fill("");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Deactivate Reception Storage", exact: true }).waitFor();
    assert.deepEqual(requests.filter((req) => req.method === "PATCH").at(-1).body, { name: "Reception Storage", description: null });
    await page.getByRole("button", { name: "Deactivate Reception Storage", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Deactivate parcel room?" });
    assert.match(await dialog.innerText(), /Existing parcel assignments will be preserved/);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(requests.filter((req) => req.path.endsWith("/status")).length, 0);
    await page.getByRole("button", { name: "Deactivate Reception Storage", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate Room", exact: true }).click();
    await page.getByRole("button", { name: "Activate Reception Storage", exact: true }).waitFor();
    assert.deepEqual(requests.filter((req) => req.path.endsWith("/status")).at(-1).body, { is_active: false });
    await page.getByRole("button", { name: "Activate Reception Storage", exact: true }).click();
    await page.getByRole("button", { name: "Deactivate Reception Storage", exact: true }).waitFor();
    assert.deepEqual(requests.filter((req) => req.path.endsWith("/status")).at(-1).body, { is_active: true });
    assert.ok(requests.every((req) => /^Bearer /.test(req.auth)));
    assert.deepEqual(qa.errors, []);
    await qa.context.close();

    const guard = await setup("GUARD", width);
    await beginRegistration(guard.page);
    assert.equal(await guard.page.getByRole("button", { name: "Parcel Rooms", exact: true }).count(), 0);
    const select = guard.page.locator("#registration-parcel-room");
    await select.waitFor({ state: "visible" });
    assert.deepEqual(await select.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["", ids[0], ids[1]]);
    await parcelFields(guard.page, "TEST-P1");
    await guard.page.getByRole("button", { name: "Add Parcel", exact: true }).click();
    await guard.page.getByText("Please select an active parcel room.", { exact: true }).waitFor();
    assert.equal(await select.evaluate((node) => document.activeElement === node), true);
    await select.selectOption(ids[0]);
    await guard.page.locator('input[type="file"]').setInputFiles({ name: "parcel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=", "base64") });
    await guard.page.getByText("Photo uploaded and ready.").waitFor();
    await guard.page.getByRole("button", { name: "Add Parcel", exact: true }).click();
    await parcelFields(guard.page, "TEST-P2");
    await select.selectOption(ids[1]);
    await guard.page.getByRole("button", { name: "Add Parcel", exact: true }).click();
    assert.equal(await guard.page.locator(".session-parcel-item").count(), 2);
    await screenshot(guard.page, width, "registration-rooms");
    await guard.page.getByRole("button", { name: "Finish registration", exact: true }).click();
    await guard.page.getByRole("button", { name: "Yes, finish & notify", exact: true }).click();
    await guard.page.getByRole("heading", { name: "Courier Information", exact: true }).waitFor();
    const registration = guard.requests.find((req) => req.path === "/api/parcel-registration/sessions");
    assert.deepEqual(registration.body, { courier_id: courier.courier_id, delivery_person_contact: "+60123456789", parcels: [
      { unit_id: unit.unit_id, tracking_number: "TEST-P1", parcel_room_id: ids[0], parcel_photo_url: "/uploads/parcels/test-photo.png" },
      { unit_id: unit.unit_id, tracking_number: "TEST-P2", parcel_room_id: ids[1] }
    ] });
    assert.deepEqual(guard.errors, []);
    await guard.context.close();
    console.log(`${width}px: Admin CRUD/status/filter/dialog and Guard multi-room registration/photo payload checks passed`);
  }
  for (const role of ["GUARD", "RESIDENT", "SUPER_ADMIN", null]) {
    const qa = await setup(role);
    await qa.page.goto(`${baseURL}/parcel-rooms`);
    await qa.page.waitForURL(role ? (role === "SUPER_ADMIN" ? "**/accounts" : "**/dashboard") : "**/login");
    assert.equal(await qa.page.getByRole("button", { name: "Parcel Rooms", exact: true }).count(), 0);
    assert.equal(qa.requests.filter((req) => req.path.startsWith("/api/parcel-rooms")).length, 0);
    await qa.context.close();
  }
  const empty = await setup("ADMIN", 390);
  empty.state.rooms = [];
  await empty.page.goto(`${baseURL}/parcel-rooms`);
  await empty.page.getByRole("heading", { name: "No parcel rooms yet" }).waitFor();
  await screenshot(empty.page, 390, "parcel-rooms-empty");
  await empty.context.close();
  for (const width of [834, 390]) {
    const long = await setup("ADMIN", width);
    long.state.rooms = [{ ...initialRooms()[0], name: "R".repeat(100), description: "Storage location details. ".repeat(40) }];
    await long.page.goto(`${baseURL}/parcel-rooms`);
    await long.page.getByRole("table").waitFor();
    await screenshot(long.page, width, "parcel-rooms-long");
    assert.equal(await long.page.locator("td").evaluateAll((cells) => cells.some((cell) => cell.scrollWidth > cell.clientWidth + 1)), false);
    await long.page.getByRole("button", { name: "Add Parcel Room", exact: true }).first().click();
    await long.page.keyboard.press("Escape");
    assert.equal(await long.page.getByRole("dialog").count(), 0);
    assert.equal(await long.page.getByRole("button", { name: "Add Parcel Room", exact: true }).first().evaluate((button) => document.activeElement === button), true);
    await long.context.close();
  }
  for (const status of [500, 403, 401]) {
    const qa = await setup("ADMIN", 390);
    qa.state.listStatus = status;
    await qa.page.goto(`${baseURL}/parcel-rooms`);
    if (status === 401) await qa.page.waitForURL("**/login");
    else if (status === 403) { await qa.page.getByRole("heading", { name: "Access denied" }).waitFor(); assert.equal(await qa.page.getByRole("button", { name: "Add Parcel Room" }).count(), 0); }
    else { await qa.page.getByRole("button", { name: "Retry", exact: true }).waitFor(); qa.state.listStatus = 200; await qa.page.getByRole("button", { name: "Retry" }).click(); await qa.page.getByRole("table").waitFor(); }
    await qa.context.close();
  }
  for (const width of [1440, 834]) {
    const short = await setup("ADMIN", width);
    await short.page.setViewportSize({ width, height: 500 });
    await short.page.goto(`${baseURL}/parcel-rooms`);
    await short.page.getByRole("table").waitFor();
    await short.page.getByRole("button", { name: "Add Parcel Room", exact: true }).first().click();
    const dialog = short.page.getByRole("dialog", { name: "Add Parcel Room" });
    await dialog.waitFor({ state: "visible" });
    await dialog.getByLabel("Description").evaluate((textarea) => { textarea.style.height = "500px"; });
    assert.equal(await dialog.evaluate((node) => getComputedStyle(node).overflowY), "auto");
    assert.equal(await dialog.evaluate((node) => node.scrollHeight > node.clientHeight), true);
    await dialog.getByRole("button", { name: "Create Room", exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await dialog.evaluate((node) => node.scrollTop > 0), true);
    const bounds = await dialog.getByRole("button", { name: "Create Room", exact: true }).boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 500);
    await short.page.screenshot({ path: `/private/tmp/parcel-nexus-parcel-room-short-${width}.png` });
    await short.context.close();
  }
  const guard = await setup("GUARD", 390);
  guard.state.rooms = [];
  await beginRegistration(guard.page);
  await guard.page.getByText("No active parcel rooms available. Please ask Admin to create or activate a room.").waitFor();
  assert.equal(await guard.page.locator("#registration-parcel-room").isDisabled(), true);
  assert.equal(await guard.page.getByRole("button", { name: "Add Parcel", exact: true }).isDisabled(), true);
  guard.state.activeStatus = 500;
  await guard.page.getByRole("button", { name: "Refresh active rooms" }).click();
  await guard.page.getByText("Unable to load rooms.", { exact: true }).waitFor();
  guard.state.activeStatus = 200; guard.state.rooms = initialRooms();
  await guard.page.getByRole("button", { name: "Refresh active rooms" }).click();
  await guard.page.locator("#registration-parcel-room").selectOption(ids[0]);
  await parcelFields(guard.page, "TEST-STALE");
  await guard.page.getByRole("button", { name: "Add Parcel", exact: true }).click();
  guard.state.registrationStatus = 400;
  guard.state.rooms[0].is_active = false;
  await guard.page.getByRole("button", { name: "Finish registration", exact: true }).click();
  await guard.page.getByRole("button", { name: "Yes, finish & notify", exact: true }).click();
  await guard.page.getByText("Select an active parcel room.", { exact: true }).waitFor();
  const staged = guard.page.getByRole("combobox", { name: "Room for TEST-STALE" });
  await guard.page.waitForFunction(() => document.querySelector('.session-room-field select')?.getAttribute("aria-invalid") === "true");
  assert.equal(await guard.page.getByRole("button", { name: "Finish registration", exact: true }).isDisabled(), true);
  await staged.selectOption(ids[1]);
  guard.state.registrationStatus = 200;
  await guard.page.getByRole("button", { name: "Finish registration", exact: true }).click();
  await guard.page.getByRole("button", { name: "Yes, finish & notify", exact: true }).click();
  await guard.page.getByRole("heading", { name: "Courier Information", exact: true }).waitFor();
  assert.equal(guard.requests.filter((req) => req.path === "/api/parcel-registration/sessions").at(-1).body.parcels[0].parcel_room_id, ids[1]);
  await guard.context.close();
  console.log("Role redirects, empty/error/403/401 states, active-room retry and stale-room recovery passed");
} finally { await browser.close(); }
