import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [path, first, confirm] of [["reset-password", "new-password", "confirm-password"], ["activate", "activation-password", "activation-confirm-password"]]) {
      await page.goto(`${baseURL}/${path}`);
      await page.locator(`#${first}`).focus();
      const panel = page.locator(".login-strength-panel");
      assert.equal(await panel.getAttribute("data-expanded"), "false");
      for (const [value, score, label] of [["a", 0, "Weak"], ["Abcdefgh", 2, "Fair"], ["Abcdef1!", 4, "Strong"], ["Abcdefgh", 2, "Fair"]]) {
        await page.locator(`#${first}`).fill(value);
        assert.equal(await page.getByRole("meter").getAttribute("aria-valuenow"), String(score));
        assert.equal(await panel.locator(".login-strength-label").innerText(), label);
        assert.equal(await panel.locator('li[data-met="true"]').count(), score);
      }
      await page.locator(`#${first}`).fill("Abcdef1!");
      assert.equal(await panel.locator(".login-strength-bar > span").count(), 4);
      assert.equal((await panel.innerText()).includes("Password strength"), false);
      await page.getByRole("button", { name: "Show New Password", exact: true }).click();
      assert.equal(await panel.getAttribute("data-expanded"), "true");
      await page.waitForTimeout(260);
      const bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      const submit = await page.locator('.pr-auth button[type="submit"]').boundingBox();
      assert.ok(bounds.y + bounds.height <= submit.y);
      const confirmation = await page.locator(`#${confirm}`).boundingBox();
      assert.ok(bounds.y + bounds.height < confirmation.y);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/private/tmp/parcel-strength-${path}-${width}.png`, fullPage: true });
      // Inline expansion keeps the confirmation field below the box and clickable.
      await page.locator(`#${confirm}`).click();
      assert.equal(await panel.getAttribute("data-expanded"), "true");
      await page.locator(`#${first}`).focus();
      await page.keyboard.press("Escape");
      assert.equal(await panel.getAttribute("data-expanded"), "false");
      await page.locator(`#${first}`).fill("");
      assert.equal(await panel.getAttribute("data-expanded"), "false");
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px: four grouped rules/segments, inline reveal, Escape/clear and unobstructed confirm field passed`);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  const stage = page.locator(".pr-demo-stage");
  await stage.waitFor();
  await stage.evaluate((node) => {
    window.sceneLog = [{ scene: node.dataset.scene, time: performance.now() }];
    new MutationObserver(() => {
      if (window.sceneLog.at(-1).scene !== node.dataset.scene) window.sceneLog.push({ scene: node.dataset.scene, time: performance.now() });
    }).observe(node, { attributes: true, attributeFilter: ["data-scene"] });
  });
  await page.waitForFunction(() => window.sceneLog.filter((entry, index, entries) => entry.scene === "-1" && entries[index - 1]?.scene === "2").length === 2, null, { timeout: 40000 });
  const holds = await page.evaluate(() => window.sceneLog.flatMap((entry, index, entries) => entry.scene === "-1" && entries[index - 1]?.scene === "2" ? [entry.time - entries[index - 1].time] : []));
  for (const hold of holds) assert.ok(hold >= 5300 && hold < 7000, `Expected 3400ms playback + 2000ms hold, received ${hold}ms`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await stage.getAttribute("data-scene");
  await page.waitForTimeout(3400);
  assert.equal(await stage.getAttribute("data-scene"), still);
  await context.close();
  console.log("Two complete loops with a 2-second final hold, plus reduced-motion behavior passed");
} finally {
  await browser.close();
}
