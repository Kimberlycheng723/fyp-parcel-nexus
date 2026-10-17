import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const reference = process.env.PARCELROOM_REFERENCE_HTML;
const roomId = '11111111-1111-4111-8111-111111111111';
let cases = 0;
async function setup(width, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion, serviceWorkers: 'block' });
  const user = { user_id: roomId, role: 'ADMIN', first_name: 'Kimberly', last_name: 'Cheng', status: 'ACTIVE', email: 'fixture@example.invalid', phone_number: '0100000000' };
  const token = 'test.' + Buffer.from(JSON.stringify({ role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.test';
  await context.addInitScript(value => localStorage.setItem('parcel_nexus_access_token', value), token);
  await context.addInitScript(() => {
    window.__roomReveals = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      if (this.matches('.ops-stack')) window.__roomReveals.push({ frames, options });
      return animate.call(this, frames, options);
    };
  });
  const errors = [], writes = [];
  await context.route('**/socket.io/**', route => route.abort());
  await context.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') writes.push(path);
    let body = {};
    if (path === '/api/auth/me') body = { user };
    else if (path === '/api/profile') body = { profile: user };
    else if (path === '/api/notifications/unread-count') body = { unread_count: 1 };
    else if (path === '/api/dashboard/admin/operations') body = {
      as_of: '2026-10-16T04:00:00Z', rooms: [{ id: roomId, name: 'Parcel Room A', is_active: true }],
      parcel_summary: { received_today: 4, collected_today: 2, awaiting_collection: 45, overdue: 42 },
      uncollected_by_room: [{ parcel_room_id: roomId, parcel_room_name: 'Parcel Room A', pending: 3, overdue: 2, total: 5 }],
      important_alerts: { parcels_overdue_over_60_days: 9, disputes_unresolved_over_7_days: 2, resident_pending_activation: 3, guard_pending_activation: 1 },
      disputes: { action_total: 0, escalated: 0, my_review: 0, action_items: [], issue_types: [], issue_range: {} },
      peak_activity: { group: 'hour', buckets: [] }
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors, writes };
}
async function font(page, selector) {
  return page.locator(selector).first().evaluate(node => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily.replaceAll('Parcel Login ', '').replaceAll('"', ''), size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight };
  });
}
async function aligned(page) {
  await page.waitForFunction(() => {
    const active = document.querySelector('.sidebar-nav [aria-current="page"]'), indicator = document.querySelector('.liquid-nav-indicator');
    if (!active || indicator.hidden) return false;
    const a = active.getBoundingClientRect(), b = indicator.getBoundingClientRect();
    return Math.abs(a.top - b.top) < .5 && Math.abs(a.height - b.height) < .5;
  });
}
async function spotlight(page, selector) {
  const card = page.locator(selector).first();
  await card.hover({ position: { x: 25, y: 20 } });
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector), style = getComputedStyle(node, '::before');
    return style.opacity === '1' && Math.abs(parseFloat(node.style.getPropertyValue('--spotlight-x')) - 25) < 1;
  }, selector);
  return card.evaluate(node => {
    const x = node.style.getPropertyValue('--spotlight-x'), y = node.style.getPropertyValue('--spotlight-y');
    node.style.setProperty('--spotlight-x', '25px'); node.style.setProperty('--spotlight-y', '20px');
    const style = getComputedStyle(node, '::before');
    const result = { image: style.backgroundImage, opacity: style.opacity, duration: style.transitionDuration, easing: style.transitionTimingFunction };
    node.style.setProperty('--spotlight-x', x); node.style.setProperty('--spotlight-y', y);
    return result;
  });
}
try {
  for (const width of [1440, 834, 390]) {
    const t = await setup(width), { page } = t;
    await page.goto(base + '/dashboard'); await page.locator('.ops-content[data-loading=false]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.workspace-brand-name').innerText(), 'GEMS');
    assert.equal(await page.locator('.liquid-nav-indicator').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.dashboard-greeting').evaluate(node => getComputedStyle(node).color), 'rgb(31, 43, 77)');
    assert.equal(await page.locator('.workspace-brand-mark .lucide-building2').count(), 1);
    assert.equal(await page.locator('.sidebar-brand > span, .workspace-topbar time, .ops-updated').count(), 0);
    assert.equal(await page.locator('.sidebar-nav .lucide-package').count(), 1);
    assert.equal(await page.locator('.sidebar-nav .lucide-package').evaluate(node => getComputedStyle(node).strokeWidth), '1.9px');
    const expected = {
      brand: { family: 'Outfit, sans-serif', size: width === 834 ? '21px' : '23px', weight: '500', lineHeight: width === 834 ? '21px' : '23px' },
      title: { family: 'DM Sans, sans-serif', size: '12px', weight: '500', lineHeight: '18px' },
      greeting: { family: 'Outfit, sans-serif', size: width === 390 ? '25px' : width === 834 ? '26px' : '30px', weight: '500', lineHeight: width === 390 ? '31.25px' : width === 834 ? '32.5px' : '37.5px' },
      summary: { family: 'Outfit, sans-serif', size: width === 390 ? '15px' : '16px', weight: '500', lineHeight: width === 390 ? '20.25px' : '21.6px' },
      chart: { family: 'Outfit, sans-serif', size: width === 834 ? '17px' : '18px', weight: '500', lineHeight: width === 834 ? '22.95px' : '24.3px' }
    };
    let referenceSpotlight;
    if (reference) {
      const refPage = await browser.newPage({ viewport: { width, height: 1000 } });
      await refPage.route(/^https?:/, route => route.abort());
      await refPage.goto(pathToFileURL(reference).href); await refPage.evaluate(() => document.fonts.ready);
      for (const [key, selector] of Object.entries({ brand: '.brand', title: '.breadcrumb strong', greeting: '.page-heading h1', summary: '.summary-controls h2', chart: '.panel-heading h2' })) assert.deepEqual(expected[key], await font(refPage, selector));
      referenceSpotlight = await spotlight(refPage, '#metrics > .metric');
      await refPage.close();
    }
    for (const [key, selector] of Object.entries({ brand: '.workspace-brand-name', title: '.workspace-page-title', greeting: '.dashboard-greeting', summary: '.ops-overview-title h2', chart: '.ops-room-attention .adm-panel-heading h2' })) assert.deepEqual(await font(page, selector), expected[key], key + ' follows the ZIP');
    const actualSpotlight = await spotlight(page, '.ops-metric');
    if (referenceSpotlight) assert.deepEqual(actualSpotlight, referenceSpotlight, 'Summary hover matches the ZIP gradients, opacity and transition');
    await page.locator('.dashboard-greeting').hover();
    assert.equal(await page.locator('.ops-metric').first().evaluate(node => node.style.getPropertyValue('--spotlight-x')), '');
    assert.equal(await page.locator('.ops-room-attention > .adm-panel').evaluateAll(nodes => nodes.every(node => {
      const s = getComputedStyle(node); return s.borderRadius === '20px' && s.backgroundColor === 'rgb(255, 255, 255)' && s.borderWidth === '0px' && s.backdropFilter === 'none' && s.boxShadow.includes('8px 24px');
    })), true);
    assert.equal(await page.locator('.ops-metric').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderRadius === '16px')), true);
    assert.equal(await page.locator('.dashboard-welcome-row').evaluate(node => {
      const row = node.getBoundingClientRect(), heading = node.querySelector('h2').getBoundingClientRect(), clock = node.querySelector('time').getBoundingClientRect();
      return Math.abs(clock.right - row.right) < 1 && (innerWidth <= 700 || Math.abs(clock.top + clock.height / 2 - heading.top - heading.height / 2) < 1);
    }), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => window.__roomReveals.length > 0 && window.__roomReveals.every(reveal => reveal.options.duration === 600 && reveal.options.delay <= 180)), true, 'Stacked bars have a bounded entrance reveal');
    await page.getByRole('group', { name: 'Room chart view' }).getByRole('button', { name: 'By Status', exact: true }).click();
    assert.equal(await page.locator('.ops-stack > .overdue').evaluate(node => getComputedStyle(node).transitionDuration), '0.32s');
    await page.waitForFunction(() => document.querySelector('.ops-stack > .overdue').getBoundingClientRect().width < .1);
    assert.equal(await page.locator('.ops-stack > .overdue .ops-segment-count').isVisible(), false, 'Narrow segments do not squeeze in count labels');
    await page.getByRole('group', { name: 'Room chart view' }).getByRole('button', { name: 'All Uncollected', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ops-stack > .overdue').getBoundingClientRect().width > 44);
    assert.equal(await page.locator('.ops-segment-count').first().isVisible(), true);
    await page.screenshot({ path: '/private/tmp/parcel-nexus-zip-matched-' + width + '.png', fullPage: true }); cases++;
    if (width <= 980) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await aligned(page);
    const start = await page.locator('.liquid-nav-indicator').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42);
    await page.locator('.sidebar-nav').getByRole('button', { name: 'Profile', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/profile');
    await page.waitForFunction(() => document.querySelector('.liquid-nav-indicator')?.getAnimations().some(animation => animation.effect.getTiming().duration === 320));
    const motion = await page.locator('.liquid-nav-indicator').evaluate(node => {
      const active = document.querySelector('.sidebar-nav [aria-current="page"]');
      return { current: new DOMMatrixReadOnly(getComputedStyle(node).transform).m42, target: active.offsetTop,
        timings: node.getAnimations().map(animation => animation.effect.getTiming()) };
    });
    assert.ok(motion.current >= start && motion.current < motion.target);
    assert.ok(motion.timings.every(timing => timing.duration === 320 && timing.easing === 'cubic-bezier(0.22, 1, 0.36, 1)'));
    await aligned(page); cases++;
    if (width > 980) {
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      await page.locator('.sidebar-nav').getByRole('button', { name: 'Parcels', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/parcels');
      assert.equal(await page.locator('.workspace-rail-collapsed').count(), 1);
      assert.equal(await page.locator('.sidebar').evaluate(node => node.getBoundingClientRect().width), 80);
      await aligned(page);
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
      await page.goBack(); await page.waitForURL(url => url.pathname === '/profile'); await aligned(page); cases++;
    }
    assert.deepEqual(t.errors, []); assert.deepEqual(t.writes, []);
    await t.context.close();
  }
  const t = await setup(1440, 'reduce');
  await t.page.goto(base + '/dashboard'); await t.page.locator('.ops-content[data-loading=false]').waitFor();
  assert.deepEqual(await t.page.evaluate(() => window.__roomReveals), []);
  assert.equal(await t.page.locator('.ops-stack > .pending').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
  await t.page.locator('.ops-metric').first().hover();
  assert.equal(await t.page.locator('.ops-metric').first().evaluate(node => node.style.getPropertyValue('--spotlight-x')), '');
  await t.page.locator('.sidebar-nav').getByRole('button', { name: 'Profile', exact: true }).press('Enter');
  await t.page.waitForURL(url => url.pathname === '/profile'); await aligned(t.page);
  assert.equal(await t.page.locator('.liquid-nav-indicator').evaluate(node => node.getAnimations().length), 0);
  assert.deepEqual(t.errors, []); assert.deepEqual(t.writes, []); await t.context.close(); cases++;
  console.log('ZIP dashboard: ' + cases + ' reference, motion, viewport, history and reduced-motion scenarios passed; no live writes.');
} finally { await browser.close(); }
