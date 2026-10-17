import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const expected = 'You\u2019ve been logged out. Please log in again to continue.';
const noticeKey = 'parcel_nexus_session_notice';
let checks = 0;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(base + '/login');
    await page.locator('#email').waitFor();
    assert.equal(await page.locator('.login-notice').count(), 0); checks++;
    // Existing browser tabs may still hold the previous message during deployment.
    await page.evaluate(key => sessionStorage.setItem(key, 'Your session has expired. Please log in again.'), noticeKey);
    await page.reload();
    const notice = page.locator('.login-notice');
    await notice.waitFor();
    assert.equal(await notice.innerText(), expected);
    assert.equal(await notice.getAttribute('role'), 'status');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), noticeKey), null); checks++;
    const style = await notice.evaluate(node => {
      const css = getComputedStyle(node);
      return { color: css.color, background: css.backgroundColor, padding: css.padding, border: css.borderTopWidth, radius: css.borderRadius };
    });
    assert.deepEqual(style, { color: 'rgb(217, 35, 62)', background: 'rgba(0, 0, 0, 0)', padding: '0px', border: '0px', radius: '0px' }); checks++;
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('The Email field is required.', { exact: true }).waitFor();
    assert.equal(await page.locator('#email-error').evaluate(node => getComputedStyle(node).color), style.color);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.pr-auth').screenshot({ path: '/private/tmp/parcel-nexus-session-notice-' + width + '.png' }); checks++;
    await page.reload(); await page.locator('#email').waitFor();
    assert.equal(await page.locator('.login-notice').count(), 0); checks++;
    await context.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const body = path === '/api/auth/me' ? { user: { user_id: '33333333-3333-4333-8333-333333333333', role: 'GUARD', status: 'ACTIVE', first_name: 'Test' } }
        : path === '/api/dashboard/guard' ? { guard: { name: 'Test Guard' }, summary: {}, parcel_room_distribution: [], latest_logged_parcels: [] }
        : { unread_count: 0 };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const token = 'test.' + Buffer.from(JSON.stringify({ role: 'GUARD', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.test';
    await page.evaluate(value => localStorage.setItem('parcel_nexus_access_token', value), token);
    await page.goto(base + '/dashboard'); await page.locator('.guard-summary-grid').waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('parcel-nexus-session-expired')));
    await page.waitForURL('**/login');
    await notice.waitFor();
    assert.equal(await notice.innerText(), expected);
    assert.equal(await page.evaluate(() => localStorage.getItem('parcel_nexus_access_token')), null);
    assert.deepEqual(errors, []); checks++;
    await context.close();
  }
  console.log('Session notice: ' + checks + ' browser checks passed at desktop/mobile; no live authentication writes.');
} finally { await browser.close(); }
