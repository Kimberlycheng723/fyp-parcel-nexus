import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const password = "QaOnly123!";

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", ignoreHTTPSErrors: true });
    const requests = [], errors = [];
    let status = 500;
    // Isolated responses: no real reset/activation tokens, emails or account changes.
    await context.route("**/api/**", async (route) => {
      requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message: "Link is invalid or expired." }) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));

    for (const [path, first, second, command, success] of [
      ["reset-password", "new-password", "confirm-password", "Reset Password", "Password reset successful!"],
      ["activate", "activation-password", "activation-confirm-password", "Set Password", "Account activated!"]
    ]) {
      status = 500;
      await page.goto(`${baseURL}/${path}?token=qa-browser-only`);
      await page.waitForFunction(() => document.querySelector("#delivery-canvas")?.width > 100);
      const canvas = await page.locator("#delivery-canvas").elementHandle();
      assert.equal(await page.locator(".auth-page,.auth-visual,.auth-footer").count(), 0);
      const beforeValidation = requests.length;
      await page.getByRole("button", { name: command, exact: true }).click();
      assert.equal(await page.getByRole("alert").count(), 2);
      assert.equal(requests.length, beforeValidation);
      assert.equal(await page.locator(`#${first}`).getAttribute("aria-invalid"), "true");
      assert.equal(await page.locator(`#${second}`).getAttribute("aria-invalid"), "true");
      await page.locator(`#${first}`).fill(password);
      await page.locator(`#${second}`).fill("Different123!");
      const before = requests.length;
      await page.getByRole("button", { name: command, exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.match(await page.getByRole("alert").innerText(), /Passwords do not match/);
      assert.equal(requests.length, before);
      await page.locator(`#${second}`).fill(password);
      await page.getByRole("button", { name: "Show New Password", exact: true }).click();
      assert.equal(await page.locator(`#${first}`).getAttribute("type"), "text");
      await page.getByRole("button", { name: "Hide New Password", exact: true }).click();
      await page.getByRole("button", { name: command, exact: true }).click();
      await page.getByText("Link is invalid or expired.", { exact: true }).waitFor();
      assert.deepEqual(requests.at(-1), { path: `/api/auth/${path}`, body: { token: "qa-browser-only", newPassword: password } });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/private/tmp/parcel-nexus-${path}-${width}.png`, fullPage: true });
      status = 200;
      await page.getByRole("button", { name: command, exact: true }).click();
      await page.getByRole("heading", { name: success, exact: true, level: 2 }).waitFor();
      const dialog = page.getByRole("dialog", { name: success, exact: true });
      await dialog.waitFor();
      await dialog.locator("img").evaluate((image) => image.decode());
      await page.waitForTimeout(250);
      assert.equal(await dialog.locator("h2").evaluate((node) => getComputedStyle(node).fontSize), "28px");
      assert.equal(await canvas.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator(`#${first}`).inputValue(), "");
      assert.equal(await page.locator(`#${first}`).isDisabled(), true);
      await page.screenshot({ path: `/private/tmp/parcel-nexus-${path}-success-${width}.png` });
      await page.waitForTimeout(1600);
      assert.match(page.url(), new RegExp(path));
      await dialog.getByRole("button", { name: "Go to Sign in", exact: true }).click();
      await page.waitForURL("**/login");
    }

    await page.goto(`${baseURL}/verify-email-change`);
    await page.getByRole("heading", { name: "Email verification failed", exact: true }).waitFor();
    assert.match(await page.getByRole("alert").innerText(), /token is missing/);
    status = 400;
    await page.goto(`${baseURL}/verify-email-change?token=qa-browser-only`);
    await page.getByRole("heading", { name: "Verifying email", exact: true }).waitFor();
    const canvas = await page.locator("#delivery-canvas").elementHandle();
    await page.getByRole("heading", { name: "Email verification failed", exact: true }).waitFor();
    assert.equal(await canvas.evaluate((node) => node === document.querySelector("#delivery-canvas")), true);
    assert.deepEqual(requests.at(-1), { path: "/api/profile/email-change/confirm", body: { token: "qa-browser-only" } });
    status = 200;
    await page.reload();
    await page.getByRole("heading", { name: "Email verified", exact: true, level: 2 }).waitFor();
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/private/tmp/parcel-nexus-email-verified-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Go to Sign in", exact: true }).click();
    await page.waitForURL("**/login");
    assert.deepEqual(errors, []);
    console.log(`${width}px: shared layout, validation, API bodies, errors/success, persistent canvas, mobile fit and return-to-login passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
