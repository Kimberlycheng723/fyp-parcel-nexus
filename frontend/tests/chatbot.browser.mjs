import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

// Optional browser QA uses an existing Playwright installation, not a production dependency.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "https://localhost:5173";
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const report = { mockedBrowserChecks: [], screenshots: [], liveGemini: "not requested" };
const tokenFor = (role, id = "qa-resident") => `qa.${Buffer.from(JSON.stringify({ sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.qa`;
const fulfill = (route, data, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(data) });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockContext(role = "RESIDENT") {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
  let user = { user_id: `qa-${role}`, role, first_name: "QA", last_name: "Resident", unit_full_code: "QA-UNIT" };
  const requests = [];
  const errors = [];
  let respond = (route) => fulfill(route, { reply: "Mock assistant response for browser validation." });
  await context.addInitScript((token) => { if (token) localStorage.setItem("parcel_nexus_access_token", token); }, role ? tokenFor(role, user.user_id) : null);
  await context.route("**/socket.io/**", (route) => route.abort());
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me") return fulfill(route, { user });
    if (path === "/api/auth/logout") return fulfill(route, {});
    if (path === "/api/auth/login") {
      user = { ...user, user_id: "qa-second-resident", first_name: "Second" };
      return fulfill(route, { user, accessToken: tokenFor("RESIDENT", user.user_id) });
    }
    if (path === "/api/chatbot/message") {
      requests.push({ body: request.postDataJSON(), authorization: request.headers().authorization });
      return respond(route);
    }
    if (path === "/api/notifications/unread-count") return fulfill(route, { unread_count: 3 });
    if (path === "/api/notifications") return fulfill(route, { notifications: [], counts: { all: 0, unread: 0, parcels: 0, disputes: 0 }, pagination: { page: 1, total: 0, total_pages: 0 } });
    if (path === "/api/resident/parcels/summary") return fulfill(route, { unit: { unit_full_code: "QA-UNIT" }, summary: { pending_collection: 0, overdue_parcels: 0, collected_parcels: 0 } });
    if (path === "/api/resident/parcels") return fulfill(route, { parcels: [], pagination: { page: 1, total: 0, total_pages: 0 } });
    if (path === "/api/users") return fulfill(route, { users: [], pagination: { page: 1, total: 0, total_pages: 0 } });
    return fulfill(route, {});
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(8000);
  await page.goto(`${baseURL}/chatbot`);
  return { page, context, requests, errors, setResponder(callback) { respond = callback; } };
}

async function checkLayout(page, width, height, name) {
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: `/private/tmp/parcel-nexus-chatbot-${name}.png`, fullPage: true });
  const metrics = await page.evaluate(() => {
    const transcript = document.querySelector(".chatbot-transcript");
    const input = document.querySelector("#chatbot-message-input");
    const button = document.querySelector(".chatbot-send-button");
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      inputWidth: input.getBoundingClientRect().width,
      buttonWidth: button.getBoundingClientRect().width,
      transcriptHeight: transcript.getBoundingClientRect().height,
      bubblesOverflow: [...document.querySelectorAll(".chatbot-message-text")].some((element) => element.scrollWidth > element.clientWidth + 1)
    };
  });
  assert.equal(metrics.overflow, false);
  assert.equal(metrics.bubblesOverflow, false);
  assert.ok(metrics.inputWidth > 100 && metrics.buttonWidth >= 44 && metrics.transcriptHeight > 100);
  report.screenshots.push({ viewport: `${width}x${height}`, path: `/private/tmp/parcel-nexus-chatbot-${name}.png`, noOverflow: true });
}

try {
  const qa = await mockContext();
  const { page, requests } = qa;
  const input = page.getByLabel("Your message", { exact: true });
  const send = page.getByRole("button", { name: "Send message", exact: true });
  const newConversation = page.getByRole("button", { name: "New Conversation", exact: true });
  const reply = () => page.locator(".chatbot-message.assistant");
  await page.getByRole("heading", { name: "AI Chatbot", exact: true }).waitFor();
  assert.equal(await page.locator(".nav-item.active").innerText(), "AI Chatbot");
  assert.equal(await send.isDisabled(), true);
  assert.equal(await input.getAttribute("maxlength"), "2000");
  await checkLayout(page, 1440, 900, "desktop-welcome");
  await checkLayout(page, 834, 1112, "tablet-welcome");
  await checkLayout(page, 390, 844, "mobile-welcome");
  await page.setViewportSize({ width: 1440, height: 900 });
  qa.setResponder(async (route) => { await delay(200); return fulfill(route, { reply: "Mock pending parcel answer." }); });
  await page.getByRole("button", { name: "How many parcels are waiting for me?", exact: true }).click();
  await page.getByText("Thinking...", { exact: true }).waitFor();
  assert.equal(await send.isDisabled(), true);
  await reply().last().waitFor();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, { message: "How many parcels are waiting for me?", history: [] });
  assert.match(requests[0].authorization, /^Bearer /);
  report.mockedBrowserChecks.push("Resident welcome, suggestions, authenticated API, loading and disabled/empty send");

  qa.setResponder((route) => fulfill(route, { reply: "Mock storage location is unavailable.\nAsk the Guard." }));
  await input.fill("  Where are they?  ");
  await input.press("Enter");
  await page.getByText("Mock storage location is unavailable.\nAsk the Guard.", { exact: true }).waitFor();
  assert.equal(requests.at(-1).body.message, "Where are they?");
  assert.deepEqual(requests.at(-1).body.history.map((turn) => turn.role), ["user", "assistant"]);
  await input.fill("First line");
  await input.press("Shift+Enter");
  assert.equal(await input.inputValue(), "First line\n");
  assert.equal(requests.length, 2);
  await input.fill("Duplicate prevention check");
  const beforeDuplicate = requests.length;
  await page.locator(".chatbot-composer").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await page.waitForFunction(() => document.querySelectorAll(".chatbot-message.assistant").length === 3);
  assert.equal(requests.length, beforeDuplicate + 1);
  report.mockedBrowserChecks.push("Enter, Shift+Enter, trimming, ordered follow-up history and duplicate-submit prevention");

  qa.setResponder((route) => fulfill(route, { message: "PRIVATE raw backend detail", code: "GEMINI_UNAVAILABLE" }, 503));
  await input.fill("Retry this question");
  await send.click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /temporarily unavailable/);
  assert.ok(!(await page.getByRole("alert").innerText()).includes("PRIVATE"));
  assert.equal(await input.inputValue(), "Retry this question");
  const userBubbles = await page.locator(".chatbot-message.user").count();
  const originalRequest = requests.at(-1).body;
  qa.setResponder((route) => fulfill(route, { reply: "Mock retry succeeded." }));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Mock retry succeeded.", { exact: true }).waitFor();
  assert.equal(await page.locator(".chatbot-message.user").count(), userBubbles);
  assert.deepEqual(requests.at(-1).body, originalRequest);
  report.mockedBrowserChecks.push("Safe provider error, preserved draft and retry without duplicate messages/history");

  qa.setResponder((route) => fulfill(route, { message: "Quota", code: "GEMINI_RATE_LIMITED" }, 429, { "Retry-After": "2" }));
  await input.fill("Rate-limit check");
  await send.click();
  await page.getByText(/Please wait \d+s before trying again/).waitFor();
  assert.equal(await send.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Retry", exact: true }).isDisabled(), true);
  qa.setResponder((route) => fulfill(route, { reply: "Mock cooldown completed." }));
  await page.waitForFunction(() => !document.querySelector(".chatbot-send-button").disabled);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("Mock cooldown completed.", { exact: true }).waitFor();
  report.mockedBrowserChecks.push("429 Retry-After countdown and blocked sends until cooldown expires");

  qa.setResponder((route) => route.abort("failed"));
  await input.fill("Network check");
  await send.click();
  await page.getByText("Unable to connect. Please check your connection and try again.", { exact: true }).waitFor();
  qa.setResponder((route) => fulfill(route, {}));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText("The assistant returned an unreadable response. Please try again.", { exact: true }).waitFor();
  const unsafeText = '<img src=x onerror="window.__chatbotXss=true"><script>window.__chatbotXss=true</script>';
  qa.setResponder((route) => fulfill(route, { reply: unsafeText }));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByText(unsafeText, { exact: true }).waitFor();
  assert.equal(await page.locator(".chatbot-message-text img, .chatbot-message-text script").count(), 0);
  assert.equal(await page.evaluate(() => window.__chatbotXss), undefined);
  report.mockedBrowserChecks.push("Network and malformed-response errors; HTML/script output remains inert text");

  qa.setResponder((route) => fulfill(route, { reply: "Mock multiline answer.\n" + "LongContent".repeat(350) }));
  await input.fill("LongMessage".repeat(200));
  await send.click();
  await page.getByText(/^Mock multiline answer/).waitFor();
  const scroll = await page.locator(".chatbot-transcript").evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }));
  assert.ok(scroll.top + scroll.height >= scroll.total - 5);
  await checkLayout(page, 1440, 900, "desktop-conversation");
  await checkLayout(page, 834, 1112, "tablet-conversation");
  await checkLayout(page, 390, 844, "mobile-conversation");
  report.mockedBrowserChecks.push("Long-message wrapping, multiline text, transcript autoscroll and responsive input");

  await newConversation.click();
  assert.equal(await page.locator(".chatbot-message").count(), 0);
  assert.equal(await input.inputValue(), "");
  qa.setResponder(async (route) => {
    await delay(500);
    try { await fulfill(route, { reply: "Stale cancelled response must not appear." }); } catch { /* Request was cancelled. */ }
  });
  await input.fill("Cancelled conversation");
  await send.click();
  await page.getByText("Thinking...", { exact: true }).waitFor();
  await newConversation.click();
  await page.waitForTimeout(650);
  assert.equal(await page.locator(".chatbot-message").count(), 0);
  qa.setResponder((route) => fulfill(route, { reply: "New conversation answer." }));
  await input.fill("Fresh conversation");
  await send.click();
  await page.getByText("New conversation answer.", { exact: true }).waitFor();
  assert.deepEqual(requests.at(-1).body.history, []);
  report.mockedBrowserChecks.push("New Conversation clears context and discards cancelled/stale responses");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/login");
  assert.equal(await page.evaluate(() => localStorage.getItem("parcel_nexus_access_token")), null);
  await page.getByLabel(/email/i).fill("qa-second-resident@example.invalid");
  await page.getByPlaceholder("Enter your password", { exact: true }).fill("BrowserQaOnly123!");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: "AI Chatbot", exact: true }).click();
  await page.getByRole("heading", { name: "AI Chatbot", exact: true }).waitFor();
  assert.equal(await page.locator(".chatbot-message").count(), 0);
  await input.fill("Second account question");
  await send.click();
  await reply().last().waitFor();
  assert.deepEqual(requests.at(-1).body.history, []);
  report.mockedBrowserChecks.push("Logout and different-account login clear all previous conversation context");

  qa.setResponder((route) => fulfill(route, { message: "Not permitted" }, 403));
  await input.fill("Forbidden check");
  await send.click();
  await page.getByText("Your account does not have access to AI Chatbot.", { exact: true }).waitFor();
  assert.equal(await input.isDisabled(), true);
  assert.equal(await send.isDisabled(), true);
  await newConversation.click();
  assert.equal(await send.isDisabled(), true);
  assert.deepEqual(qa.errors, []);
  await qa.context.close();

  const expired = await mockContext();
  expired.setResponder((route) => fulfill(route, { message: "Expired session" }, 401));
  await expired.page.getByLabel("Your message", { exact: true }).fill("Session expiry check");
  await expired.page.getByRole("button", { name: "Send message", exact: true }).click();
  await expired.page.waitForURL("**/login");
  assert.equal(await expired.page.evaluate(() => localStorage.getItem("parcel_nexus_access_token")), null);
  await expired.context.close();
  report.mockedBrowserChecks.push("403 access-denied state and existing 401 session-expiry handling");

  for (const role of ["ADMIN", "GUARD", "SUPER_ADMIN", null]) {
    const blocked = await mockContext(role);
    await blocked.page.waitForURL(role === "SUPER_ADMIN" ? "**/accounts" : role ? "**/dashboard" : "**/login");
    assert.equal(await blocked.page.locator(".chatbot-page").count(), 0);
    assert.equal(await blocked.page.getByRole("button", { name: "AI Chatbot", exact: true }).count(), 0);
    assert.equal(blocked.requests.length, 0);
    await blocked.context.close();
  }
  report.mockedBrowserChecks.push("Resident-only navigation/direct route; Admin, Guard, Super Admin and logged-out users blocked");

  if (process.env.PARCEL_NEXUS_LIVE_CHATBOT === "true") {
    // Credentials stay in process memory and are never printed or written to disk.
    const live = JSON.parse(execFileSync("docker", ["compose", "exec", "-T", "backend", "node", "--input-type=module", "-e",
      'import {pool} from "./src/db/pool.js"; import {signAccessToken} from "./src/utils/jwt.js"; const user=(await pool.query("SELECT user_id,role,unit_id FROM users WHERE role=$1 AND status=$2 ORDER BY user_id LIMIT 1",["RESIDENT","ACTIVE"])).rows[0]; if(!user)throw new Error("No existing Resident for read-only test"); const count=(await pool.query("SELECT COUNT(*)::int AS total FROM parcels WHERE unit_id=$1 AND deleted_at IS NULL AND status IN ($2,$3)",[user.unit_id,"PENDING","PENDING_COLLECTION"])).rows[0].total;console.log(JSON.stringify({token:signAccessToken(user),pending:count}));await pool.end();'
    ], { encoding: "utf8", timeout: 10000 }));
    const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    await context.addInitScript((token) => localStorage.setItem("parcel_nexus_access_token", token), live.token);
    const page = await context.newPage();
    page.setDefaultTimeout(50000);
    await page.goto(`${baseURL}/chatbot`);
    await page.getByLabel("Your message", { exact: true }).waitFor();
    report.liveGemini = [];
    for (const question of ["How many parcels are waiting for me?", "Where are they stored?", "How do I generate a QR code?"]) {
      await page.getByLabel("Your message", { exact: true }).fill(question);
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/chatbot/message");
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      const response = await responsePromise;
      const data = await response.json();
      if (!response.ok()) {
        report.liveGemini.push({ question, status: response.status(), errorCode: data.code });
        break;
      }
      assert.ok(typeof data.reply === "string" && data.reply.trim());
      await page.locator(".chatbot-message.assistant").last().waitFor();
      report.liveGemini.push({ question, status: response.status(), displayed: true });
      if (question.startsWith("How many")) {
        const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
        const expected = new RegExp(`\\b(${live.pending}|${numberWords[live.pending] || "unavailable"}${live.pending === 0 ? "|no" : ""})\\b`, "i");
        assert.match(data.reply, expected);
        report.liveGemini.at(-1).matchesDatabaseCount = true;
      }
      if (question.startsWith("Where")) assert.match(data.reply, /not (?:currently )?(?:recorded|available)|unavailable|do(?:es)?n[’']t|cannot|can[’']t|not have|ask.*guard|check.*guard|contact.*guard/i);
    }
    await context.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
