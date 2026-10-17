import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const roomId = "11111111-1111-4111-8111-111111111111";
const oldRoomId = "22222222-2222-4222-8222-222222222222";
const longName = "W".repeat(100);
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
  const user = { user_id: "33333333-3333-4333-8333-333333333333", role, first_name: "Test", status: "ACTIVE" };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await context.addInitScript((value) => localStorage.setItem("parcel_nexus_access_token", value), token);
  const state = { status: 200, exportStatus: 200, roomStatus: 200, delay: 80, rooms: [
    { id: roomId, name: "Lobby Room", is_active: true }, { id: oldRoomId, name: longName, is_active: false }
  ], distribution: [
    { parcel_room_name: "Lobby Room", count: 15, is_active: true },
    { parcel_room_name: longName, count: 10, is_active: false },
    { parcel_room_name: "Not Assigned", count: 3, is_active: null }
  ] };
  const requests = [], errors = [];
  await context.route("**/socket.io/**", (route) => route.abort());
  await context.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push({ path, query: Object.fromEntries(url.searchParams), auth: request.headers().authorization });
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 0 });
    if (path === "/api/parcel-rooms") {
      await wait(80);
      return fulfill(route, state.roomStatus === 200 ? { parcel_rooms: state.rooms } : { message: "Unable to load parcel rooms." }, state.roomStatus);
    }
    if (path.endsWith("/reports/export")) {
      if (state.exportStatus !== 200) return fulfill(route, { message: "Report export failed. Please try again." }, state.exportStatus);
      return route.fulfill({ headers: { "Content-Type": url.searchParams.get("format") === "pdf" ? "application/pdf" : "text/csv",
        "Content-Disposition": 'attachment; filename="server-room-report.csv"' }, body: "Tracking Number,Parcel Room\nSPX-1,Lobby Room" });
    }
    if (["/api/dashboard/admin", "/api/dashboard/guard"].includes(path)) {
      await wait(state.delay);
      if (state.status !== 200) return fulfill(route, { message: "Unable to load dashboard data." }, state.status);
      return fulfill(route, { parcel_room_distribution: state.distribution,
        kpis: { total_parcels: { value: 9 }, pending_collection: { value: 28, overdue_count: 2 }, collected: { value: 4 }, open_disputes: { value: 0 } },
        summary: { parcels_logged: 9, pending_collection: 28, collected_parcels: 4, overdue_parcels: 2 },
        guard: { name: "Test Guard" }, alert: { type: "overdue", count: 2, overdue_count: 2, message: "2 parcels are overdue." },
        parcel_trend: [{ label: "09:00", parcels_received: 9, collected_same_day: 4 }],
        status_distribution: [{ status: "Pending Collection", count: 26, percentage: 81.25 }, { status: "Overdue", count: 2, percentage: 6.25 }, { status: "Collected", count: 4, percentage: 12.5 }],
        latest_logged_parcels: [], pending_collection_parcels: [], system_summary: {}, dispute_summary: { available: false }, audit_log_summary: {} });
    }
    if (path === "/api/resident/parcels") return fulfill(route, { items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: "A-10-01" }, summary: {} });
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
  if (name.includes("report")) await page.screenshot({ path: `/private/tmp/parcel-nexus-${name}-${width}-viewport.png` });
}
async function reloadDashboard(qa) {
  await qa.page.reload();
  await qa.page.locator(".parcel-room-distribution").waitFor();
}
try {
  for (const width of [1440, 834, 390]) {
    for (const role of ["ADMIN", "GUARD"]) {
      const qa = await setup(role, width), { page, state, requests } = qa;
      await page.goto(`${baseURL}/dashboard`);
      const chart = page.getByRole("region", { name: "Parcel Distribution by Room" });
      await chart.getByText("28 pending", { exact: true }).waitFor();
      assert.equal(await chart.locator("li").count(), 3);
      assert.match(await chart.innerText(), /Not Assigned/);
      assert.match(await chart.innerText(), /Inactive/);
      assert.ok(!(await chart.innerText()).includes(roomId));
      assert.equal(await chart.locator("li").first().getByLabel("15 pending parcels").count(), 1);
      await capture(page, `room-dashboard-${role.toLowerCase()}`, width);
      const date = page.getByLabel(role === "ADMIN" ? "Dashboard start date" : "Guard dashboard start date");
      await date.fill("2000-01-03");
      await page.waitForTimeout(200);
      assert.ok(requests.some((req) => req.path === `/api/dashboard/${role.toLowerCase()}` && req.query.start_date === "2000-01-03"));
      await chart.getByText("28 pending", { exact: true }).waitFor();
      await page.locator(".guard-period-panel").first().getByRole("button", { name: "Week", exact: true }).click();
      await page.waitForTimeout(200);
      assert.ok(requests.some((req) => req.path === `/api/dashboard/${role.toLowerCase()}` && req.query.period === "week"));
      if (role === "ADMIN") {
        await page.getByRole("button", { name: "Generate Report", exact: true }).click();
        await page.getByRole("button", { name: /Parcel Records Report/ }).click();
        await page.getByLabel("Parcel Room", { exact: true }).selectOption(oldRoomId);
        await page.getByLabel("Start Date", { exact: true }).fill("2000-01-03");
        await page.locator(".dashboard-report-segment").getByRole("button", { name: "CSV", exact: true }).click();
        await capture(page, "room-parcel-report", width);
        const exportButton = page.locator(".dashboard-report-primary");
        state.exportStatus = 500;
        await exportButton.click();
        await page.locator(".dashboard-report-error").waitFor();
        assert.equal(await page.getByLabel("Parcel Room", { exact: true }).inputValue(), oldRoomId);
        state.exportStatus = 200;
        const download = page.waitForEvent("download");
        await exportButton.click();
        assert.equal((await download).suggestedFilename(), "server-room-report.csv");
        const query = requests.findLast((req) => req.path.endsWith("/reports/export")).query;
        assert.deepEqual(query, { report_type: "parcel_records", format: "csv", period: "week", start_date: "2000-01-03", parcel_room_id: oldRoomId });
        await page.getByRole("button", { name: "Generate Report", exact: true }).click();
        await page.getByLabel("Parcel Room", { exact: true }).selectOption("unassigned");
        await page.locator(".dashboard-report-segment").getByRole("button", { name: "PDF", exact: true }).click();
        const pdf = page.waitForEvent("download");
        await exportButton.click(); await pdf;
        assert.equal(requests.at(-1).query.parcel_room_id, "unassigned");
        await page.getByRole("button", { name: "Generate Report", exact: true }).click();
        await page.getByRole("button", { name: /Dashboard Summary Report/ }).click();
        assert.equal(await page.getByLabel("Parcel Room", { exact: true }).count(), 0);
        const summary = page.waitForEvent("download"); await exportButton.click(); await summary;
        assert.equal(requests.at(-1).query.parcel_room_id, undefined);
      } else assert.equal(await page.getByRole("button", { name: "Generate Report", exact: true }).count(), 0);
      state.distribution = Array.from({ length: 24 }, (_, index) => ({ parcel_room_name: index === 0 ? longName : `Parcel Room ${index + 1}`, count: 24 - index, is_active: index !== 0 }));
      await reloadDashboard(qa);
      await chart.locator("li").nth(23).waitFor({ state: "attached" });
      assert.equal(await page.locator(".parcel-room-bars").evaluate((node) => node.scrollHeight > node.clientHeight), true);
      await capture(page, `room-dashboard-many-${role.toLowerCase()}`, width);
      state.distribution = [];
      await reloadDashboard(qa);
      await chart.getByText("No parcels awaiting collection.").waitFor();
      state.status = 500;
      await reloadDashboard(qa);
      await chart.getByText("Unable to load room distribution.", { exact: true }).waitFor();
      state.status = 200;
      await chart.getByRole("button", { name: "Retry room distribution" }).click();
      await chart.getByText("No parcels awaiting collection.").waitFor();
      assert.deepEqual(qa.errors, []);
      assert.ok(requests.filter((req) => req.path.startsWith("/api/dashboard")).every((req) => req.auth?.startsWith("Bearer ")));
      await qa.context.close();
    }
    console.log(`Step 17F dashboard/report browser checks passed at ${width}px`);
  }
  for (const role of ["RESIDENT", "SUPER_ADMIN"]) {
    const qa = await setup(role, 390);
    await qa.page.goto(`${baseURL}/dashboard`);
    await qa.page.waitForTimeout(400);
    assert.equal(await qa.page.locator(".parcel-room-distribution").count(), 0);
    assert.ok(qa.requests.every((req) => !req.path.startsWith("/api/dashboard/")));
    await qa.context.close();
  }
  const qa = await setup("ADMIN", 390);
  qa.state.delay = 500;
  await qa.page.goto(`${baseURL}/dashboard`);
  await qa.page.getByText("Loading dashboard data...").waitFor();
  await qa.page.locator(".parcel-room-bars li").first().waitFor();
  qa.state.roomStatus = 500;
  await qa.page.getByRole("button", { name: "Generate Report", exact: true }).click();
  await qa.page.getByRole("button", { name: /Parcel Records Report/ }).click();
  await qa.page.getByRole("button", { name: "Retry loading rooms" }).waitFor();
  qa.state.roomStatus = 200;
  await qa.page.getByRole("button", { name: "Retry loading rooms" }).click();
  await qa.page.getByLabel("Parcel Room", { exact: true }).selectOption(roomId);
  await capture(qa.page, "room-report-recovered", 390);
  await qa.context.close();
} finally { await browser.close(); }
