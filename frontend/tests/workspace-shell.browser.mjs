import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || "http://localhost:5173";
const roles = ["ADMIN", "GUARD", "RESIDENT", "SUPER_ADMIN"];
function contrast(foreground, background) {
  const luminance = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
let cases = 0;
try {
  for (const width of [1440, 834, 390, 375]) for (const role of roles) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
    const user = { user_id: "11111111-1111-4111-8111-111111111111", role, first_name: "Test", last_name: "User", email: "fixture@example.test", phone_number: "0123456789", status: "ACTIVE", unit: { full_unit_code: "A-01-02" } };
    const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
    await context.addInitScript((value) => localStorage.setItem("parcel_nexus_access_token", value), token);
    const errors = [], writes = [];
    await context.route("**/socket.io/**", (route) => route.abort());
    await context.route("**/api/**", (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== "GET") writes.push(path);
      const body = path === "/api/auth/me" ? { user } : path === "/api/profile" ? { profile: user } : path === "/api/notifications/unread-count" ? { unread_count: 0 } : { preferences: [] };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/profile`);
    await page.locator(".profile-page .settings-card").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator(".parcel-workspace-shell").count(), 1);
    assert.equal(await page.locator(".admin-dashboard-shell, .adm-dashboard").count(), 0, "Shared chrome must not apply dashboard widget styling to profile pages");
    assert.equal(await page.locator(".profile-page h1").count(), 0, "The old duplicate Profile title is removed");
    assert.equal(await page.getByRole('heading', { name: 'Profile', level: 1, exact: true }).count(), 1);
    assert.equal(await page.locator('.profile-page h2').first().innerText(), role === 'RESIDENT' ? 'Account Information' : 'Personal Information');
    const canvas = await page.locator(".parcel-workspace-shell").evaluate((node) => ({ image: getComputedStyle(node).backgroundImage, color: getComputedStyle(node).backgroundColor }));
    assert.equal(canvas.color, "rgb(255, 255, 255)");
    assert.equal(canvas.image, 'none');
    assert.deepEqual(await page.locator('.sidebar').evaluate(node => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.backgroundImage, style.backdropFilter];
    }), ['rgb(232, 237, 252)', 'none', 'none'], 'Desktop rail and mobile drawer use the requested light lavender');
    assert.equal(await page.locator('.sidebar').evaluate(node => {
      const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
      return style.borderRadius === '0px' && style.boxShadow === 'none' && bounds.top === 0 && bounds.bottom === innerHeight;
    }), true, 'Sidebar is full-height with no floating corners or shadow');
    assert.equal(await page.locator('.workspace-topbar').evaluate(node => {
      const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
      return bounds.top === 0 && style.borderRadius === '0px' && Math.abs(bounds.right - innerWidth) < 1;
    }), true, 'Header attaches to the top and right page edges');
    assert.equal(await page.locator('.workspace-topbar').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(255, 255, 255, 0.48)');
    assert.equal(await page.locator('.workspace-page-content').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.deepEqual(await page.locator('.liquid-nav-indicator').evaluate(node => {
      const style = getComputedStyle(node); return [style.backgroundColor, style.backgroundImage];
    }), ['rgb(255, 255, 255)', 'none']);
    assert.equal(await page.locator('.sidebar-nav [aria-current=page]').evaluate(node => getComputedStyle(node).color), 'rgb(41, 72, 211)');
    assert.equal(await page.locator('.sidebar-nav [aria-current=page] > svg').evaluate(node => getComputedStyle(node).color), 'rgb(41, 72, 211)');
    assert.equal(await page.locator('.sidebar-nav .nav-item:not(.active):not(.danger), .sidebar-brand > strong, .sidebar-footer strong, .sidebar-close-button').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).color === 'rgb(20, 33, 61)')), true, 'Sidebar text uses a deeper navy for stronger separation');
    assert.equal(await page.locator('.sidebar-nav .nav-item:not(.active)').evaluateAll(nodes => nodes.every(node => {
      const style = getComputedStyle(node); return style.fontSize === '13px' && style.fontWeight === '500';
    })), true, 'Expanded navigation labels are larger and medium-weight');
    assert.equal(await page.locator('.sidebar-nav .nav-item > svg').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).strokeWidth === '1.9px')), true, 'Navigation icons have stronger strokes');
    assert.equal(await page.locator('.workspace h1, .workspace h2, .workspace h3').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).color === 'rgb(31, 43, 77)')), true, 'Headings use the requested navy');
    assert.equal(await page.locator('.workspace-topbar').evaluate(node => {
      const style = getComputedStyle(node, '::after');
      return style.borderBottomColor === 'rgb(237, 240, 248)' && style.borderBottomWidth === '1px'
        && style.left === (innerWidth <= 980 ? '14px' : '28px') && style.right === style.left;
    }), true, 'Header divider matches the preview rule and content gutters');
    const palette = await page.locator('.parcel-workspace-shell').evaluate(node => {
      const style = getComputedStyle(node);
      return Object.fromEntries(['sidebar-muted', 'sidebar-foreground', 'sidebar-hover', 'sidebar-focus', 'sidebar', 'accent', 'nav-accent', 'selected', 'surface', 'border', 'status-registered', 'status-collected', 'status-awaiting', 'status-overdue'].map(name => [name, style.getPropertyValue('--workspace-' + name).trim()]));
    });
    assert.equal(palette.border, '#e2e6ef');
    assert.equal(palette.accent, '#2948d3');
    assert.ok(contrast(palette['sidebar-foreground'], palette.sidebar) >= 12, 'Menu text has at least 12:1 contrast on lavender');
    assert.ok(contrast(palette['sidebar-muted'], palette.sidebar) >= 7, 'Secondary sidebar text meets enhanced contrast');
    for (const [foreground, background] of [['sidebar-muted', 'sidebar'], ['sidebar-foreground', 'sidebar'], ['sidebar-foreground', 'sidebar-hover'], ['nav-accent', 'selected'], ['surface', 'accent'], ...['registered', 'collected', 'awaiting', 'overdue'].map(status => ['status-' + status, 'surface'])]) {
      assert.ok(contrast(palette[foreground], palette[background]) >= 4.5, `${foreground} on ${background} meets normal-text contrast`);
    }
    assert.ok(contrast(palette['sidebar-focus'], palette.selected) >= 3, 'Sidebar focus ring contrasts with the selected item');
    assert.equal(await page.locator('.settings-card').evaluateAll(nodes => nodes.every(node => {
      const style = getComputedStyle(node);
      return style.backgroundColor === 'rgb(255, 255, 255)' && style.boxShadow.includes('8px 24px');
    })), true, 'Opaque cards share the subtle workspace elevation');
    const nav = page.locator(".sidebar-nav");
    const expectedMenu = {
      ADMIN: ['Dashboard', 'Parcels', 'Disputes', 'Parcel Trace', 'Accounts', 'Analytics and Reporting', 'Audit Trail', 'Parcel Rooms', 'Settings', 'Profile', 'Logout'],
      GUARD: ['Dashboard', 'Parcels', 'Verify Collection', 'Disputes', 'Parcel Trace', 'Audit Trail', 'Profile', 'Logout'],
      RESIDENT: ['Dashboard', 'AI Chatbot', 'Disputes', 'Profile', 'Logout'],
      SUPER_ADMIN: ['Accounts', 'Profile', 'Logout']
    };
    assert.deepEqual((await nav.locator('.nav-item').allTextContents()).map(label => label.trim()), expectedMenu[role]);
    assert.equal(await nav.locator('.nav-group').count(), role === 'SUPER_ADMIN' ? 2 : 0);
    assert.deepEqual(await nav.locator('.nav-group p').allTextContents(), role === 'SUPER_ADMIN' ? ['Directory', 'Account'] : []);
    if (role !== 'SUPER_ADMIN') assert.equal(await nav.locator(':scope > button').count(), expectedMenu[role].length);
    assert.equal(await nav.getByRole("button", { name: "Audit Trail", exact: true }).count(), ["ADMIN", "GUARD"].includes(role) ? 1 : 0);
    assert.equal(await nav.getByRole("button", { name: "Accounts", exact: true }).count(), ["ADMIN", "SUPER_ADMIN"].includes(role) ? 1 : 0);
    assert.equal(await nav.getByRole("button", { name: "Parcel Rooms", exact: true }).count(), role === "ADMIN" ? 1 : 0);
    assert.equal(await nav.getByRole("button", { name: "Analytics and Reporting", exact: true }).count(), role === "ADMIN" ? 1 : 0);
    assert.equal(await nav.getByRole("button", { name: "Parcel Trace", exact: true }).count(), ["ADMIN", "GUARD"].includes(role) ? 1 : 0);
    if (width > 980) {
      assert.equal(await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().width), 226);
      assert.equal(await page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().right === document.querySelector('.workspace').getBoundingClientRect().left), true, 'Content sits directly beside the sidebar');
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      assert.equal(await page.locator(".workspace-rail-collapsed").count(), 1);
      assert.equal(await page.locator('.sidebar').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(232, 237, 252)');
      assert.equal(await page.locator('.sidebar').evaluate(node => node.getBoundingClientRect().width), 80);
      await page.waitForFunction(() => !document.querySelector('.workspace').getAnimations().length);
      assert.equal(await page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().right === document.querySelector('.workspace').getBoundingClientRect().left), true, 'Collapsed rail stays attached to content');
      assert.equal(await nav.locator('.nav-item > svg').evaluateAll(nodes => nodes.every(node => {
        const icon = node.getBoundingClientRect(), button = node.parentElement.getBoundingClientRect();
        return Math.abs(icon.left + icon.width / 2 - button.left - button.width / 2) < 1;
      })), true, 'Icons are centered in the wider collapsed rail');
      if (role === 'ADMIN') await page.screenshot({ path: '/private/tmp/parcel-nexus-sidebar-collapsed-80.png', fullPage: true });
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.workspace-rail-collapsed'));
      await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
    } else {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page.locator(".sidebar.open").waitFor();
      await page.waitForFunction(() => Math.abs(document.querySelector(".sidebar").getBoundingClientRect().left) < 1);
      assert.equal(await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().width), 245);
      assert.equal(await page.locator('.sidebar').evaluate(node => Math.abs(node.getBoundingClientRect().left) < 1), true);
    }
    assert.equal(await page.locator(".workspace-brand-name").innerText(), "GEMS");
    assert.equal(await page.locator('.workspace-brand-name').evaluate(node => getComputedStyle(node).fontSize), width === 834 ? '21px' : '23px');
    if (role === 'ADMIN') assert.equal(await page.locator('.sidebar-brand > span').count(), 0);
    else assert.equal(await page.locator(".sidebar-brand > span").innerText(), role.replace("_", " "));
    if (role === "RESIDENT") assert.match(await page.locator(".resident-unit-footer").innerText(), /A-01-02/);
    if (width <= 980 && role !== 'ADMIN') {
      const overlap = await page.locator(".sidebar-brand").evaluate((node) => { const badge = node.querySelector(":scope > span").getBoundingClientRect(), close = node.querySelector("button").getBoundingClientRect(); return badge.right > close.left && badge.bottom > close.top && badge.top < close.bottom; });
      assert.equal(overlap, false, "Role badge must not overlap the mobile close button");
    }
    if (["ADMIN", "GUARD", "RESIDENT"].includes(role) && [1440, 390, 375].includes(width)) await page.screenshot({ path: `/private/tmp/parcel-nexus-flat-sidebar-${role.toLowerCase()}-${width}.png`, fullPage: true });
    await nav.getByRole("button", { name: "Logout", exact: true }).click();
    await page.getByRole("dialog", { name: "Are you sure you want to log out?" }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(writes, [], "Appearance checks must not modify account data or sessions");
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close(); cases++;
  }
  const publicPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await publicPage.goto(`${base}/login`); await publicPage.locator(".login-redesign").waitFor();
  assert.equal(await publicPage.locator(".parcel-workspace-shell").count(), 0);
  assert.equal(await publicPage.locator('.login-redesign').evaluate(node => getComputedStyle(node).getPropertyValue('--workspace-canvas')), '', 'The workspace palette does not leak into login');
  assert.deepEqual(await publicPage.locator('.pr-mini-sidebar').evaluate(node => {
    const sidebar = getComputedStyle(node), active = getComputedStyle(node.querySelector('.pr-active'));
    return [sidebar.backgroundColor, active.backgroundColor, active.color];
  }), ['rgb(249, 250, 255)', 'rgb(233, 237, 254)', 'rgb(37, 71, 206)'], 'The original login preview palette remains unchanged');
  await publicPage.close();
  console.log(`Shared workspace: ${cases} role/viewport scenarios passed; login styling remains isolated (mocked API fixtures).`);
} finally { await browser.close(); }
