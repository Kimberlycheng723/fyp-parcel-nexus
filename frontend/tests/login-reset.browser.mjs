import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", ignoreHTTPSErrors: true });
    const requests = [], errors = [];
    let resetStatus = 500;
    await context.route("**/api/auth/forgot-password", (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: resetStatus, contentType: "application/json", body: JSON.stringify({ message: resetStatus === 200
        ? "If the email is registered and active, password reset instructions will be sent."
        : "Please try again later." }) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/login`);
    await page.waitForFunction(() => document.querySelector("#delivery-canvas")?.width > 100);
    // Reaching the next stage makes a restart distinguishable from continued playback.
    await page.locator("#delivery-canvas").scrollIntoViewIfNeeded();
    await page.locator(".pr-demo-stage[data-scene='0']").waitFor();
    const canvas = await page.locator("#delivery-canvas").elementHandle();
    await page.locator("#password").fill("QaOnly123!");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.waitForURL("**/forgot-password");
    await page.getByRole("heading", { name: "Reset your password", exact: true }).waitFor();
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    assert.equal(await page.getByRole("alert").innerText(), "The Email field is required.");
    assert.equal(await page.locator("#forgot-email").getAttribute("aria-invalid"), "true");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#forgot-email").evaluate((node) => getComputedStyle(node).borderColor), "rgb(239, 52, 76)");
    await page.screenshot({ path: `/private/tmp/parcel-nexus-email-required-${width}.png` });
    assert.equal(requests.length, 0);
    await page.locator("#forgot-email").fill("not-an-email");
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    assert.equal(await page.getByRole("alert").innerText(), "Enter a valid email address.");
    assert.equal(requests.length, 0);
    assert.equal(await canvas.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
    assert.notEqual(await page.locator(".pr-demo-stage").getAttribute("data-scene"), "-1");
    await page.locator("#forgot-email").fill("resident@example.invalid");
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.deepEqual(requests[0], { email: "resident@example.invalid" });
    resetStatus = 200;
    await page.locator(".pr-auth form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
    await page.getByRole("dialog", { name: "Check your email", exact: true }).waitFor();
    assert.equal(requests.length, 2);
    const art = page.locator(".auth-success-art");
    assert.equal(await art.locator(".auth-success-burst > span").count(), 8);
    assert.equal(await art.locator("img").evaluate((node) => getComputedStyle(node).animationName), "auth-celebration-pop");
    assert.equal(await art.locator(".auth-success-ribbon").first().evaluate((node) => getComputedStyle(node).animationName), "auth-ribbon-burst");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await art.locator("img").evaluate((node) => getComputedStyle(node).animationName), "none");
    assert.equal(await art.locator(".auth-success-ribbon").first().evaluate((node) => getComputedStyle(node).display), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(250);
    await art.evaluate((node) => {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 300;
      }
    });
    await page.screenshot({ path: `/private/tmp/parcel-nexus-reset-celebration-${width}.png` });
    await page.getByRole("button", { name: "Stay on this page", exact: true }).click();
    const confirmation = page.locator(".auth-form-status");
    assert.equal(await confirmation.getAttribute("role"), "status");
    assert.equal(await confirmation.evaluate((node) => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await confirmation.evaluate((node) => getComputedStyle(node).borderTopWidth), "0px");
    assert.equal(await confirmation.evaluate((node) => getComputedStyle(node).padding), "0px");
    await page.screenshot({ path: `/private/tmp/parcel-nexus-reset-inline-${width}.png` });
    assert.equal(await page.getByRole("button", { name: /Resend email in/ }).isDisabled(), true);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/login");
    assert.equal(await page.locator("#password").inputValue(), "");
    assert.equal(await canvas.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
    await page.goBack();
    await page.waitForURL("**/forgot-password");
    assert.equal(await canvas.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
    await page.reload();
    await page.locator("#forgot-email").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/private/tmp/parcel-nexus-password-reset-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`${width}px: persistent animation, reset request/error/success/cooldown, back navigation and direct route passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
