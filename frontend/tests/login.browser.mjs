import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
const report = { layouts: [], checks: [] };
const json = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

async function setup(viewport = { width: 1440, height: 900 }, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport, reducedMotion, ignoreHTTPSErrors: true, serviceWorkers: "block" });
  await context.route("**/socket.io/**", (route) => route.abort());
  const requests = [],errors = [];
  let responder = (route) => json(route, { message: "Email or password is incorrect." }, 401);
  await context.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/login") {requests.push(route.request().postDataJSON());return responder(route);}
    if (path === "/api/auth/me") return json(route, { user: { user_id: "login-qa", role: "RESIDENT", first_name: "QA" } });
    if (path === "/api/notifications/unread-count") return json(route, { unread_count: 0 });
    if (path.endsWith("/summary")) return json(route, { summary: {}, unit: {} });
    if (path.includes("/parcels")) return json(route, { parcels: [], pagination: { page: 1, total: 0, total_pages: 0 } });
    if (path.includes("/users")) return json(route, { users: [], pagination: {} });
    return json(route, {});
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {if (message.type() === "error" && /THREE|shader|WebGLProgram/.test(message.text())) errors.push(message.text());});
  await page.goto(`${baseURL}/login`);
  await page.locator(".pr-demo-stage[data-scene='-1']").waitFor();
  await page.waitForFunction(() => document.querySelector("#delivery-canvas")?.width > 300);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(950);
  return { context, page, requests, errors, respond(callback) {responder = callback;} };
}

async function canvasPixels(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const canvas = document.querySelector("#delivery-canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return resolve({ nonTransparent: 0 });
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonTransparent = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) nonTransparent += 1;
    resolve({ nonTransparent, width: canvas.width, height: canvas.height });
  })));
}

async function layout(page, name) {
  await page.screenshot({ path: `/private/tmp/parcel-nexus-login-${name}.png`, fullPage: true });
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const email = document.querySelector("#email").getBoundingClientRect();
    const password = document.querySelector("#password").getBoundingClientRect();
    const help = document.querySelector(".login-help-trigger").getBoundingClientRect();
    const submit = document.querySelector(".pr-primary").getBoundingClientRect();
    const auth = document.querySelector(".pr-auth").getBoundingClientRect();
    const form = document.querySelector(".pr-auth-inner").getBoundingClientRect();
    return { overflow: root.scrollWidth > root.clientWidth, emailWidth: email.width, passwordWidth: password.width,
      inputsInside: email.left >= 0 && email.right <= innerWidth && password.right <= innerWidth,
      helpBelowForm: help.top > submit.bottom, helpInsidePanel: help.left >= auth.left && help.right <= auth.right,
      centerOffset: Math.abs(form.top + form.height / 2 - (auth.top + auth.height / 2)),
      inputFontSize: parseFloat(getComputedStyle(document.querySelector("#email")).fontSize) };
  });
  assert.equal(metrics.overflow, false);
  assert.equal(metrics.inputsInside, true);
  assert.ok(metrics.emailWidth > 250 && metrics.passwordWidth > 250);
  assert.equal(metrics.helpBelowForm, true);
  assert.equal(metrics.helpInsidePanel, true);
  assert.ok(metrics.centerOffset < 2, `Form is not vertically centered: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.inputFontSize >= 17);
  report.layouts.push({ name, ...metrics });
}

try {
  const desktop = await setup();
  const { page } = desktop;
  assert.equal(await page.locator(".pr-brand,.pr-page-header,footer,.pr-demo-description,.pr-demo-controls,.pr-demo-progress,.pr-sample-note").count(), 0);
  assert.equal(await page.locator("select,input[type=radio]").count(), 0);
  assert.equal(await page.locator(".pr-tower-label").innerText(), "GEM Condominiums");
  assert.equal(await page.locator(".sample-building").innerText(), "GEM Condominiums");
  assert.equal(await page.locator("#email").getAttribute("placeholder"), "Enter your email address");
  assert.equal(await page.locator("#password").getAttribute("placeholder"), "Enter your password");
  const pixels = await canvasPixels(page);
  assert.ok(pixels.nonTransparent > 10000, `Blank 3D canvas: ${JSON.stringify(pixels)}`);
  const firstFrame = createHash("sha256").update(await page.locator("#delivery-canvas").screenshot()).digest("hex");
  await page.waitForTimeout(650);
  const secondFrame = createHash("sha256").update(await page.locator("#delivery-canvas").screenshot()).digest("hex");
  assert.notEqual(firstFrame, secondFrame);
  await layout(page, "desktop-arrival");
  for (const [scene, name] of [["0", "register"], ["1", "notify"], ["2", "collect"]]) {
    await page.locator(`.pr-demo-stage[data-scene='${scene}']`).waitFor();
    await page.waitForTimeout(scene === "2" ? 2500 : 1600);
    await layout(page, `desktop-${name}`);
  }
  assert.deepEqual(desktop.errors, []);
  report.checks.push("Nonblank animated 3D canvas and all four stages; requested logo/footer/control removals");

  const help = page.getByRole("button", { name: "Need help?" });
  await page.mouse.move(0, 0);
  assert.equal(await help.evaluate((node) => getComputedStyle(node).color), "rgb(99, 112, 137)");
  await help.hover();
  await page.waitForTimeout(220);
  assert.equal(await help.evaluate((node) => getComputedStyle(node).color), "rgb(37, 71, 206)");
  await help.click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Having trouble signing in/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/private/tmp/parcel-nexus-login-help.png" });
  await page.keyboard.press("Escape");
  assert.equal(await help.evaluate((node) => node === document.activeElement), true);
  await help.click();
  await page.getByRole("button", { name: "Close help" }).click();
  await page.waitForFunction(() => document.activeElement === document.querySelector(".login-help-trigger"));
  // Allow the native close event and React focus restoration to complete before filling.
  await page.waitForTimeout(250);
  await page.getByLabel("Email address", { exact: true }).fill("resident@example.invalid");
  await page.locator("#email").click();
  await page.waitForTimeout(220);
  assert.equal(await page.locator("#email").evaluate((node) => getComputedStyle(node).borderColor), "rgb(41, 72, 239)");
  await page.getByLabel("Password", { exact: true }).fill("QaOnly123!");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /incorrect/);
  assert.deepEqual(desktop.requests[0], { email: "resident@example.invalid", password: "QaOnly123!" });
  assert.equal(await page.locator("#password").inputValue(), "QaOnly123!");
  assert.deepEqual(desktop.errors, []);
  const canvasBeforeReset = await page.locator("#delivery-canvas").elementHandle();
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.waitForURL("**/forgot-password");
  assert.equal(await page.locator(".login-redesign").count(), 1);
  assert.equal(await canvasBeforeReset.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
  await page.getByRole("heading", { name: "Reset your password", exact: true }).waitFor();
  report.checks.push("Help modal close/Escape/focus return, password visibility, backend error, unchanged login request, existing password-reset route");
  await desktop.context.close();

  for (const [name, viewport] of [["tablet", { width: 834, height: 1112 }], ["mobile", { width: 390, height: 844 }]]) {
    const qa = await setup(viewport);
    await layout(qa.page, name);
    await qa.page.locator("#delivery-canvas").scrollIntoViewIfNeeded();
    await qa.page.waitForTimeout(300);
    const metrics = await canvasPixels(qa.page);
    assert.ok(metrics.nonTransparent > 10000);
    await qa.page.getByRole("button", { name: "Need help?" }).click();
    const bounds = await qa.page.getByRole("dialog").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
    await qa.page.waitForTimeout(300);
    await qa.page.screenshot({ path: `/private/tmp/parcel-nexus-login-${name}-help.png` });
    assert.deepEqual(qa.errors, []);
    await qa.context.close();
  }
  report.checks.push("Tablet/mobile form, 3D canvas, modal and no horizontal overflow");

  const reduced = await setup({ width: 1440, height: 900 }, "reduce");
  await reduced.page.waitForTimeout(400);
  assert.equal(await reduced.page.locator(".pr-demo-stage").getAttribute("data-scene"), "-1");
  // A static WebGL drawing buffer may be cleared after compositing; inspect the displayed screenshot instead.
  const staticImage = await reduced.page.locator("#delivery-canvas").screenshot();
  const staticPixels = await reduced.page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let different = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (Math.abs(pixels[index] - 232) + Math.abs(pixels[index + 1] - 237) + Math.abs(pixels[index + 2] - 250) > 15) different += 1;
    }
    bitmap.close();
    return different / (canvas.width * canvas.height);
  }, staticImage.toString("base64"));
  assert.ok(staticPixels > .12);
  await reduced.context.close();
  report.checks.push("Reduced-motion static scene");

  for (const [role, remember] of [["RESIDENT", true], ["RESIDENT", false], ["ADMIN", true], ["GUARD", true], ["SUPER_ADMIN", true]]) {
    const qa = await setup();
    const token = `qa.${Buffer.from(JSON.stringify({ role, sub: "login-qa", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.qa`;
    qa.respond(async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return json(route, { accessToken: token, user: { user_id: "login-qa", role, first_name: "QA" } });
    });
    await qa.page.getByLabel("Email address", { exact: true }).fill("resident@example.invalid");
    await qa.page.getByLabel("Password", { exact: true }).fill("QaOnly123!");
    await qa.page.getByLabel("Remember me", { exact: true }).setChecked(remember);
    await qa.page.locator(".pr-auth form").evaluate((form) => {form.requestSubmit();form.requestSubmit();});
    await qa.page.waitForURL(role === "SUPER_ADMIN" ? "**/accounts" : "**/dashboard");
    assert.equal(qa.requests.length, 1);
    const stored = await qa.page.evaluate(() => ({ persistent: localStorage.getItem("parcel_nexus_access_token"), session: sessionStorage.getItem("parcel_nexus_access_token") }));
    assert.equal(stored.persistent, remember ? token : null);
    assert.equal(stored.session, remember ? null : token);
    await qa.page.reload();
    await qa.page.locator(".app-shell").waitFor();
    await qa.context.close();
  }
  report.checks.push("Resident/Admin/Guard/Super Admin redirects, duplicate-submit prevention, both token-storage choices and reload authentication");
  console.log(JSON.stringify(report, null, 2));
} finally {await browser.close();}
