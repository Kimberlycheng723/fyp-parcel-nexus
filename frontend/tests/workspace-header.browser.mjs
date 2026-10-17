import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { workspacePageTitle } from '../src/utils/workspaceHeader.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const detailId = '55555555-5555-4555-8555-555555555555';
const routes = {
  ADMIN: ['/dashboard', '/analytics', '/parcels', '/accounts', '/disputes', '/parcel-trace', '/audit-logs', '/parcel-rooms', '/profile', '/notifications'],
  GUARD: ['/dashboard', '/parcels', '/parcels/new', '/disputes', '/parcel-trace', '/audit-logs', '/verify-collection', '/profile', '/notifications'],
  RESIDENT: ['/dashboard', '/chatbot', '/disputes', '/disputes/new', '/disputes/' + detailId, '/parcel-collection', '/profile', '/notifications'],
  SUPER_ADMIN: ['/accounts', '/profile', '/notifications']
};
let cases = 0;
try {
  for (const width of [1440, 834, 390]) for (const [role, paths] of Object.entries(routes)) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    const user = { user_id: '33333333-3333-4333-8333-333333333333', role, first_name: 'Jamie', last_name: 'Tan', status: 'ACTIVE', email: 'fixture@example.invalid', phone_number: '0100000000', unit: { full_unit_code: 'GC1-01-02' } };
    const token = 'test.' + Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.test';
    await context.addInitScript(value => localStorage.setItem('parcel_nexus_access_token', value), token);
    const requests = [], errors = [];
    await context.route('**/socket.io/**', route => route.abort());
    await context.route('**/api/**', route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      requests.push({ path, query: Object.fromEntries(url.searchParams), method: req.method() });
      let body = {};
      if (path === '/api/auth/me') body = { user };
      else if (path === '/api/profile') body = { profile: user };
      else if (path === '/api/dashboard/admin/analytics') body = { as_of: '2026-10-16T04:00:00Z', range: { from: '2026-09-17', to: '2026-10-16', cutoff: '2026-10-16T04:00:00Z' }, room: { name: 'All Parcel Rooms' }, rooms: [], group: 'day', parcel_summary: { collection_rate: null }, registration_trend: [], registration_hours: [], collection_hours: [], collection_delay: { average_hours: null, series: [] }, overdue_duration: [], dispute_summary: { average_resolution_hours: null }, dispute_issues: [], dispute_resolution: [], system_summary: {} };
      else if (path === '/api/notifications/unread-count') body = { unread_count: 3 };
      else if (path === '/api/dashboard/admin/operations') body = { as_of: '2026-10-15T03:00:00Z', rooms: [], parcel_summary: {}, uncollected_by_room: [], disputes: { action_total: 0, escalated: 0, my_review: 0, action_items: [], issue_types: [], issue_range: { from: '2026-10-01', to: '2026-10-15' } }, important_alerts: {}, peak_activity: { group: 'hour', from: '2026-10-09', to: '2026-10-15', buckets: Array.from({ length: 24 }, (_, i) => ({ index: i, label: i + ':00', received: 0, collected: 0 })) } };
      else if (path === '/api/dashboard/guard') body = { guard: { name: 'Jamie Tan' }, summary: {}, parcel_room_distribution: [], latest_logged_parcels: [] };
      else if (path === '/api/resident/parcels/summary') body = { unit: { unit_full_code: 'GC1-01-02' }, summary: {} };
      else if (path === '/api/resident/parcels') body = { items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } };
      else if (path === '/api/parcel-rooms' || path === '/api/parcel-rooms/active') body = { parcel_rooms: [] };
      else if (path === '/api/couriers') body = { couriers: [] };
      else if (path === '/api/disputes') body = { disputes: [] };
      else if (path === '/api/users') body = { users: [], counts: { ADMIN: 0, GUARD: 0, RESIDENT: 0 }, pagination: { total: 0 } };
      else if (path === '/api/notifications') body = { notifications: [], pagination: { page: 1, total_pages: 0, total: 0 }, counts: { all: 0, unread: 0, parcels: 0, disputes: 0 } };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    for (const path of paths) {
      await page.goto(base + path); await page.locator('.workspace-topbar').waitFor();
      await page.waitForLoadState('networkidle');
      const header = page.getByRole('banner', { name: 'Page header' });
      assert.equal(await header.count(), 1);
      const canvas = await page.locator('.parcel-workspace-shell').evaluate(node => { const s = getComputedStyle(node); return [s.backgroundColor, s.backgroundImage]; });
      assert.equal(canvas[0], 'rgb(255, 255, 255)');
      assert.equal(canvas[1], 'none');
      assert.equal(await header.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(255, 255, 255, 0.48)');
      assert.deepEqual(await header.evaluate(node => {
        const rule = getComputedStyle(node, '::after');
        return [rule.borderBottomWidth, rule.borderBottomColor, rule.left, rule.right];
      }), ['1px', 'rgb(237, 240, 248)', width <= 980 ? '14px' : '28px', width <= 980 ? '14px' : '28px']);
      assert.equal(await header.locator('.workspace-page-title').innerText(), workspacePageTitle(path));
      assert.equal(await header.locator('.workspace-page-title').evaluate(node => getComputedStyle(node).color), 'rgb(31, 43, 77)');
      assert.equal(await header.getByRole('heading', { level: 1, name: workspacePageTitle(path), exact: true }).count(), 1);
      if (path === '/dashboard') {
        assert.match(await page.locator('.dashboard-greeting').innerText(), /^Good (morning|afternoon|evening), Jamie\.$/);
        assert.equal(await page.locator('.dashboard-malaysia-clock').count(), 1);
        assert.equal(await page.locator('.dashboard-welcome-row time').count(), 1);
      } else {
        assert.equal(await header.locator('time').count(), 0);
        assert.equal(await page.locator('.dashboard-greeting').count(), 0);
        assert.equal(await page.locator('.workspace-page-content h1').filter({ hasText: /^(Parcels|Accounts|Disputes|My Disputes|Parcel Rooms|Parcel Trace|Audit Trail|Profile & Settings|Notifications|Analytics and Reporting|Log New Parcel|Collection Verification|Parcel Collection|AI Chatbot|Raise a Dispute|Trace a parcel\.)$/ }).count(), 0, 'Legacy page-title blocks are removed');
      }
      assert.equal(await header.locator('time').count(), 0);
      assert.equal(await header.locator('.workspace-page-title').evaluate(node => getComputedStyle(node).fontSize === '12px' && getComputedStyle(node).fontWeight === '500'), true);
      assert.equal(await page.getByText('View and manage all parcel records across GEM Condominium.', { exact: true }).count(), 0);
      assert.equal(await header.getByRole('searchbox').count(), 1);
      assert.equal(await header.getByRole('button', { name: 'Notifications, 3 unread', exact: true }).count(), 1);
      assert.equal(await header.locator('.avatar, .adm-profile, .ops-export').count(), 0);
      assert.equal(await header.getByRole('button', { name: /Export|profile/i }).count(), 0);
      assert.equal(await page.locator('.adm-topbar, .top-actions, .mobile-topbar, .dashboard-bell, .parcel-page-bell, .notifications-page-bell, .trace-breadcrumb').count(), 0);
      assert.equal(await page.getByText(/^(OPERATIONS|DIRECTORY|ACCOUNT|INSIGHT)\s*\//).count(), 0);
      await page.keyboard.press('Meta+k');
      assert.equal(await header.getByRole('searchbox').evaluate(node => document.activeElement === node), true);
      assert.equal(await header.getByRole('searchbox').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      assert.equal(await header.locator('.workspace-search').evaluate(node => getComputedStyle(node).outlineWidth), '2px');
      assert.equal(await header.getByRole('button', { name: 'Open menu', exact: true }).isVisible(), width <= 980);
      assert.equal(await header.evaluate(node => node.scrollWidth > node.clientWidth), false);
      assert.equal(await header.evaluate(node => {
        const style = getComputedStyle(node), content = document.querySelector('.workspace-page-content');
        return style.marginBottom === '0px' && style.borderBottomLeftRadius === '0px' && style.borderBottomRightRadius === '0px'
          && style.borderTopLeftRadius === '0px' && node.getBoundingClientRect().top === 0
          && Math.abs(node.getBoundingClientRect().bottom - content.getBoundingClientRect().top) < 1
          && (innerWidth <= 980 || node.getBoundingClientRect().height <= 64);
      }), true, 'Compact header joins the content surface');
      assert.deepEqual(errors, [], role + ' ' + path);
      if (['/dashboard', '/parcels', '/analytics', '/profile'].includes(path) && role === 'ADMIN') {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: '/private/tmp/parcel-nexus-shared-header-' + path.slice(1) + '-' + width + '.png', fullPage: true });
      }
      cases++;
    }
    const target = role === 'SUPER_ADMIN' ? '/accounts' : role === 'RESIDENT' ? '/dashboard' : '/parcels';
    const api = role === 'SUPER_ADMIN' ? '/api/users' : role === 'RESIDENT' ? '/api/resident/parcels' : '/api/parcels';
    for (const query of ['FIRST-SEARCH', 'SECOND & SEARCH']) {
      const response = page.waitForResponse(res => { const url = new URL(res.url()); return url.pathname === api && url.searchParams.get('search') === query; });
      await page.locator('.workspace-search input').fill(query); await page.locator('.workspace-search input').press('Enter');
      await page.waitForURL(url => url.pathname === target && url.searchParams.get('search') === query);
      await response; cases++;
    }
    await page.locator('.workspace-notifications').click();
    await page.waitForURL(url => url.pathname === '/notifications'); cases++;
    assert.deepEqual(errors, []);
    assert.equal(requests.some(req => !['GET', 'OPTIONS'].includes(req.method)), false);
    await context.close();
  }
  console.log('Shared header: ' + cases + ' page, role, viewport and search scenarios passed with intercepted API fixtures; no live writes.');
} finally { await browser.close(); }
