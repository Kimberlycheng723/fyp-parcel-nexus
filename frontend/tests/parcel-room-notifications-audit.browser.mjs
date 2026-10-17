import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const roomId = "11111111-1111-4111-8111-111111111111";
const parcelId = "22222222-2222-4222-8222-222222222222";
const roomActions = ["Parcel Room Created", "Parcel Room Updated", "Parcel Room Activated", "Parcel Room Deactivated", "Parcel Room Assignment Changed"];
const newRoom = "W".repeat(100);
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: "33333333-3333-4333-8333-333333333333", first_name: "Test", last_name: role, role, status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await context.addInitScript((value) => localStorage.setItem("parcel_nexus_access_token", value), token);
  const actor = { name: "Test Guard", email: "guard@example.invalid", role: "GUARD" };
  const metadata = [
    { name: "Lobby Room", is_active: true },
    { name: "Room B", changes: { name: { before: "Room A", after: "Room B" }, description: { before: null, after: "Near lobby" } } },
    { name: "Room B", changes: { is_active: { before: false, after: true } } },
    { name: "Room B", changes: { is_active: { before: true, after: false } } },
    { tracking_number: "SPX123", previous_parcel_room_name: "Recorded Old Room", previous_parcel_room_id: roomId, parcel_room_name: newRoom, parcel_room_id: roomId, password_hash: "DO_NOT_DISPLAY" }
  ];
  const logs = roomActions.map((action, index) => ({ audit_log_id: `event-${index}`, action, entity_type: index === 4 ? "PARCEL" : "PARCEL_ROOM", entity_id: index === 4 ? parcelId : roomId,
    entity_reference: index === 4 ? "SPX123" : metadata[index].name, description: index === 4 ? `Parcel SPX123 room changed from Recorded Old Room to ${newRoom}.` : `${action}: ${metadata[index].name}.`,
    metadata: metadata[index], actor: index === 4 ? actor : { ...actor, name: "Test Admin", role: "ADMIN" }, created_at: "2026-10-13T01:00:00Z" }));
  logs.push({ ...logs[0], audit_log_id: "old-id-only", entity_reference: roomId, metadata: {}, description: `Parcel room ${roomId} was created.` });
  logs.push({ ...logs[4], audit_log_id: "old-assignment-id-only", entity_reference: "OLD-SPX", metadata: { previous_parcel_room_id: roomId, parcel_room_id: roomId }, description: `Parcel OLD-SPX room changed from ${roomId} to ${roomId}.` });
  for (let index = 0; index < 24; index++) logs.push({ ...logs[4], audit_log_id: `assignment-${index}` });
  const state = { logs, auditStatus: 200, notifications: [
    { notification_id: "44444444-4444-4444-8444-444444444444", type: "PARCEL_ARRIVAL", title: "Parcel arrived", message: `Your Shopee Express parcel (SPX123) is ready for collection at ${newRoom}.`, related_parcel_id: parcelId, is_read: false, created_at: "2026-10-13T01:00:00Z" },
    { notification_id: "55555555-5555-4555-8555-555555555555", type: "PARCEL_ARRIVAL", title: "Parcel arrived", message: 'Your DHL parcel (SPX456) is ready for collection at Lobby <A> & "B".', related_parcel_id: parcelId, is_read: false, created_at: "2026-10-13T01:00:00Z" },
    { notification_id: "66666666-6666-4666-8666-666666666666", type: "PARCEL_ARRIVAL", title: "Parcel arrived", message: "Your DHL parcel (LEGACY123) is ready for collection.", is_read: true, created_at: "2026-10-12T01:00:00Z" }
  ] };
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  await context.route("**/api/**", async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    requests.push({ path, method: req.method(), query: Object.fromEntries(url.searchParams), actions: url.searchParams.getAll("action"), auth: req.headers().authorization });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 2 });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: "A-10-01" }, summary: {} });
    if (path === "/api/notifications") return fulfill(route, { notifications: state.notifications, counts: { all: 3, unread: 2, parcels: 3, disputes: 0 }, pagination: { page: 1, limit: 20, total: 3, total_pages: 1 } });
    if (path.startsWith("/api/audit-logs")) {
      await wait(80);
      if (state.auditStatus !== 200) return fulfill(route, { message: "Unable to load activities." }, state.auditStatus);
      let matching = role === "GUARD" ? logs.filter((log) => log.action === roomActions[4]) : logs;
      const search = url.searchParams.get("search")?.toLowerCase(), actions = url.searchParams.getAll("action"), selectedRole = url.searchParams.get("role"), date = url.searchParams.get("date");
      if (search) matching = matching.filter((log) => [log.description, log.entity_reference, log.actor.name].some((value) => value.toLowerCase().includes(search)));
      if (actions.length) matching = matching.filter((log) => actions.includes(log.action));
      if (selectedRole) matching = matching.filter((log) => log.actor.role === selectedRole);
      if (date) matching = matching.filter((log) => log.created_at.startsWith(date));
      if (path.endsWith("/export")) return route.fulfill({ status: 200, headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="room-audit-filtered.csv"' }, body: `Action,Entity Reference\n${matching.map((log) => `${log.action},${log.entity_reference}`).join("\n")}` });
      const page = Number(url.searchParams.get("page") || 1), limit = Number(url.searchParams.get("limit") || 20);
      return fulfill(route, { audit_logs: matching.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: matching.length, total_pages: Math.ceil(matching.length / limit) },
        filter_options: { actions: role === "GUARD" ? [roomActions[4], "Login"] : roomActions, roles: ["ADMIN", "GUARD", "RESIDENT", "SYSTEM"] } });
    }
    return fulfill(route, {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, state, requests, errors };
}
async function capture(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0, 0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}px overflow`);
  await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}.png`, fullPage: true });
  if (name.includes("assignment")) await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}-viewport.png` });
}
async function openDetails(page, action, reference) {
  await page.getByRole("button", { name: `View details: ${action} ${reference}`, exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: action });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.evaluate((node) => node.matches(":modal")), true);
  return dialog;
}

try {
  for (const width of [1440, 834, 390]) {
    for (const role of ["ADMIN", "GUARD"]) {
      const qa = await setup(role, width), { page, requests } = qa;
      await page.goto(`${baseURL}/audit-logs`);
      await page.getByRole("table").waitFor();
      await capture(page, `room-audit-${role.toLowerCase()}`, width);
      const dialog = await openDetails(page, roomActions[4], "SPX123");
      assert.match(await dialog.innerText(), /Previous Room\s+Recorded Old Room/);
      assert.match(await dialog.innerText(), new RegExp(`New Room\\s+${newRoom}`));
      assert.ok(!(await dialog.innerText()).includes(roomId));
      assert.ok(!(await dialog.innerText()).includes("DO_NOT_DISPLAY"));
      await capture(page, `room-audit-assignment-${role.toLowerCase()}`, width);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      if (role === "ADMIN") {
        for (const [index, reference] of ["Lobby Room", "Room B", "Room B", "Room B"].entries()) {
          const detail = await openDetails(page, roomActions[index], reference);
          assert.ok(!(await detail.innerText()).includes(roomId));
          if (index === 1) assert.match(await detail.innerText(), /Room A -> Room B/);
          if (index === 2) assert.match(await detail.innerText(), /Inactive -> Active/);
          if (index === 3) assert.match(await detail.innerText(), /Active -> Inactive/);
          await page.keyboard.press("Escape");
        }
        const missing = await openDetails(page, roomActions[0], "Room name not recorded");
        assert.ok(!(await missing.innerText()).includes(roomId));
        await page.keyboard.press("Escape");
      } else assert.equal(await page.getByRole("button", { name: "Export CSV" }).count(), 0);
      const historical = await openDetails(page, roomActions[4], "OLD-SPX");
      assert.equal(await historical.getByText("Room name not recorded", { exact: true }).count(), 2);
      assert.ok(!(await historical.innerText()).includes(roomId));
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Next page" }).click();
      await page.getByText(/Page 2 of/).waitFor();
      await page.getByRole("button", { name: /Action/, exact: false }).first().click();
      await page.getByLabel(roomActions[4], { exact: true }).check();
      if (role === "ADMIN") await page.getByLabel(roomActions[0], { exact: true }).check();
      else assert.equal(await page.getByLabel(roomActions[0], { exact: true }).count(), 0);
      await page.keyboard.press("Escape");
      await page.getByLabel("Search audit logs").fill("SPX");
      await page.getByLabel("Role", { exact: true }).selectOption("GUARD");
      await page.getByLabel("Date (Malaysia time)").fill("2026-10-13");
      await page.getByText(/Page 1 of/).waitFor();
      await page.waitForTimeout(350);
      const list = requests.filter((req) => req.path === "/api/audit-logs").at(-1);
      assert.equal(list.query.page, "1"); assert.equal(list.query.search, "SPX"); assert.equal(list.query.role, "GUARD");
      assert.ok(list.actions.includes(roomActions[4]));
      if (role === "ADMIN") {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export CSV" }).click();
        assert.equal((await download).suggestedFilename(), "room-audit-filtered.csv");
        const query = requests.findLast((req) => req.path === "/api/audit-logs/export");
        assert.deepEqual(query.actions, list.actions); assert.equal(query.query.search, "SPX");
        assert.equal(query.query.page, undefined); assert.equal(query.query.limit, undefined);
      }
      await page.getByRole("button", { name: "Reset filters", exact: true }).click();
      await page.getByLabel("Search audit logs").fill("nothing-matches");
      await page.getByRole("heading", { name: "No matching activities" }).waitFor();
      await page.locator(".audit-state").getByRole("button", { name: "Reset filters" }).click();
      await page.getByRole("table").waitFor();
      assert.ok(requests.filter((req) => req.path.startsWith("/api/audit")).every((req) => req.auth?.startsWith("Bearer ")));
      assert.deepEqual(qa.errors, []);
      await qa.context.close();
    }
    const qa = await setup("RESIDENT", width);
    await qa.page.goto(`${baseURL}/notifications`);
    await qa.page.getByText(qa.state.notifications[1].message, { exact: true }).waitFor();
    assert.equal(await qa.page.locator(".notification-copy A").count(), 0, "HTML-looking room names must remain literal text");
    assert.equal(await qa.page.locator(".notification-row.unread").count(), 2);
    assert.equal(await qa.page.locator(".notification-row.read").count(), 1);
    await capture(qa.page, "room-arrival-notifications", width);
    assert.deepEqual(qa.errors, []);
    await qa.context.close();
    console.log(`Step 17E audit/notification browser checks passed at ${width}px`);
  }
  const qa = await setup("ADMIN", 390);
  qa.state.auditStatus = 500;
  await qa.page.goto(`${baseURL}/audit-logs`);
  await qa.page.getByRole("heading", { name: "Unable to load activities" }).waitFor();
  qa.state.auditStatus = 200;
  await qa.page.getByRole("button", { name: "Retry", exact: true }).click();
  await qa.page.getByRole("table").waitFor();
  await qa.context.close();
  for (const role of ["RESIDENT", "SUPER_ADMIN"]) {
    const qa = await setup(role, 390);
    await qa.page.goto(`${baseURL}/audit-logs`);
    await qa.page.waitForTimeout(500);
    assert.ok(qa.requests.every((req) => !req.path.startsWith("/api/audit")));
    await qa.context.close();
  }
} finally { await browser.close(); }
