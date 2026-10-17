import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const roomA = '11111111-1111-4111-8111-111111111111', roomB = '44444444-4444-4444-8444-444444444444', parcelId = '22222222-2222-4222-8222-222222222222';
const disputeId = '55555555-5555-4555-8555-555555555555';
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
let cases = 0;
async function setup(role = 'ADMIN', width = 1440, roomCount = 2, firstName = 'Jamie') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const user = { user_id: '33333333-3333-4333-8333-333333333333', role, first_name: firstName, last_name: 'Tan', status: 'ACTIVE' };
  const token = 'test.' + Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.test';
  await context.addInitScript((value) => localStorage.setItem('parcel_nexus_access_token', value), token);
  const state = { error: 0, empty: false, slowA: false, slowAttention: false, attentionTotal: 17, over60: 3 };
  const requests = [], errors = [];
  const rooms = [{ id: roomA, name: 'Parcel Room A', is_active: true }, { id: roomB, name: 'Parcel Room B', is_active: false }, { id: '77777777-7777-4777-8777-777777777777', name: 'Parcel Room C', is_active: true }, { id: '88888888-8888-4888-8888-888888888888', name: 'Parcel Room D', is_active: true }].slice(0, roomCount);
  const parcel = { parcel_id: parcelId, tracking_number: 'SPX-DASH-001', status: 'PENDING_COLLECTION', display_status: 'OVERDUE', created_at: '2026-09-01T03:00:00Z', collection_deadline: '2026-09-08T03:00:00Z', parcel_room_name: 'Parcel Room A', courier: { courier_name: 'Shopee Express' }, unit: { full_unit_code: 'GC1-01-02' } };
  await context.route('**/socket.io/**', (route) => route.abort());
  await context.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, query = Object.fromEntries(url.searchParams);
    requests.push({ path, query, method: req.method(), auth: req.headers().authorization });
    if (path === '/api/auth/me') return fulfill(route, { user });
    if (path === '/api/notifications/unread-count') return fulfill(route, { unread_count: 3 });
    if (path === '/api/parcel-rooms') return fulfill(route, { parcel_rooms: rooms });
    if (path === '/api/parcels/' + parcelId) return fulfill(route, { parcel });
    if (path === '/api/disputes') {
      const status = query.status;
      const item = { dispute_id: disputeId, dispute_reference: 'DSP-004201', issue_type: 'DAMAGED', status, created_at: '2026-10-01T04:00:00Z', latest_activity_at: '2026-10-02T04:00:00Z', evidence_count: 0, parcel: { tracking_number: 'SPX-DASH-001', courier_name: 'Shopee Express', unit_full_code: 'GC1-01-02' }, assigned_handler: { user_id: user.user_id, name: 'Jamie Tan' } };
      return fulfill(route, { disputes: ['IN_REVIEW_ADMIN', 'IN_REVIEW_GUARD', 'ESCALATED'].includes(status) ? [item] : [], pagination: { total: 1, page: 1, limit: 100, total_pages: 1 } });
    }
    if (path.endsWith('/reminder')) {
      assert.equal(role, 'ADMIN'); assert.equal(req.method(), 'POST');
      throw new Error('The attention table must not send reminders.');
    }
    if (path.endsWith('/reports/export')) return route.fulfill({ headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="operational-report.csv"' }, body: 'Tracking,Room\nSPX,Parcel Room A' });
    if (path === '/api/dashboard/admin/operations') {
      assert.equal(role, 'ADMIN'); assert.ok(req.headers().authorization?.startsWith('Bearer '));
      if (state.slowA && query.summary_room_id === roomA) await new Promise((resolve) => setTimeout(resolve, 450));
      if (state.slowAttention && query.attention_room_id === roomA) await new Promise((resolve) => setTimeout(resolve, 450));
      if (state.error) return fulfill(route, { message: 'Dashboard unavailable. Please retry.' }, state.error);
      const empty = state.empty, page = Number(query.attention_page || 1);
      const total = empty || query.attention_search === 'none' ? 0 : state.attentionTotal;
      const samples = [
        { ...parcel, unit_reference: 'GC1-01-02', resident_name: 'Alexandra Long-Name Tan', resident_id: user.user_id, resident_status: 'ACTIVE', courier_name: 'Shopee Express', last_reminded_at: '2026-10-07T04:00:00Z', flagged_for_attention: true, overdue_days: 36 },
        { ...parcel, parcel_id: '66666666-6666-4666-8666-666666666666', tracking_number: 'DHL-DASH-002', unit_reference: 'GC2-03-04', resident_name: 'Jamie Lee', resident_id: user.user_id, resident_status: 'ACTIVE', courier_name: 'DHL', last_reminded_at: null, flagged_for_attention: true, overdue_days: 30 }
      ];
      const attention = !total || page > Math.ceil(total / 5) ? [] : Array.from({ length: Math.min(5, total - (page - 1) * 5) }, (_, index) => samples[index] || { ...samples[1], parcel_id: '99999999-9999-4999-8999-' + String(index).padStart(12, '0'), tracking_number: 'DASH-FLAG-' + index });
      const group = query.trend_group || 'hour';
      return fulfill(route, { as_of: '2026-10-14T04:00:00Z', today: '2026-10-14', rooms,
        parcel_summary: empty ? { received_today: 0, collected_today: 0, awaiting_collection: 0, overdue: 0, overdue_over_60_days: 0 } : { received_today: query.summary_room_id === roomB ? 2 : 18, collected_today: 11, awaiting_collection: 45, overdue: 13, overdue_over_60_days: query.summary_room_id === roomB ? 0 : query.summary_room_id === roomA ? 1 : state.over60 },
        attention: { items: attention, pagination: { page, limit: 5, total, total_pages: Math.ceil(total / 5) } },
        uncollected_by_room: empty ? [] : [{ parcel_room_id: roomA, parcel_room_name: 'Parcel Room A', is_active: true, pending: 20, overdue: 10, total: 30 }, { parcel_room_id: roomB, parcel_room_name: 'Parcel Room B', is_active: false, pending: 12, overdue: 3, total: 15 }, { parcel_room_id: null, parcel_room_name: 'Not Assigned', is_active: null, pending: 0, overdue: 2, total: 2 }],
        important_alerts: { parcels_overdue_over_60_days: empty ? 0 : state.over60, disputes_unresolved_over_7_days: empty ? 0 : 1, resident_pending_activation: empty ? 0 : 3, guard_pending_activation: empty ? 0 : 1 },
        disputes: { in_review_admin: empty ? 0 : 4, escalated: empty ? 0 : 2, my_review: empty ? 0 : 3, action_total: empty ? 0 : 5,
          action_items: empty ? [] : Array.from({ length: 5 }, (_, index) => ({ dispute_id: index === 0 ? disputeId : '55555555-5555-4555-8555-' + String(index).padStart(12, '0'), dispute_reference: 'DSP-' + (4201 + index).toString().padStart(6, '0'), status: index < 2 ? 'ESCALATED' : 'IN_REVIEW_ADMIN', issue_type: 'DAMAGED', unit_reference: 'GC1-01-02', created_at: '2026-09-28T04:00:00Z', latest_activity_at: '2026-10-' + String(index + 1).padStart(2, '0') + 'T04:00:00Z', evidence_count: index === 0 ? 1 : 0, parcel: { tracking_number: 'SPX-DASH-00' + (index + 1), courier_name: 'Shopee Express', unit_full_code: 'GC1-01-02' }, assigned_handler: index < 2 ? null : { user_id: user.user_id, name: 'Jamie Tan' } })),
          older_than_week_total: empty ? 0 : 1, oldest_unresolved: [],
          issue_types: empty ? [] : [{ issue_type: 'DAMAGED', count: 8 }, { issue_type: 'MISSING_ITEM', count: 6 }, { issue_type: 'WRONG_RECIPIENT', count: 4 }, { issue_type: 'STOLEN', count: 2 }],
          issue_range: { from: query.dispute_from, to: query.dispute_to } },
        accounts: { resident_pending_activation: empty ? 0 : 3, guard_pending_activation: empty ? 0 : 1 },
        peak_activity: { group, from: query.trend_from, to: query.trend_to, collection_time_unknown: empty ? 0 : 1,
          buckets: Array.from({ length: group === 'hour' ? 24 : 7 }, (_, index) => ({ index, label: group === 'hour' ? (index % 12 || 12) + (index < 12 ? ' am' : ' pm') : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index], received: empty ? 0 : index % 5 + 1, collected: empty ? 0 : index % 3 })) }
      });
    }
    if (path === '/api/dashboard/guard') return fulfill(route, { guard: { name: 'Test Guard' }, period: {}, summary: { parcels_logged: 18, pending_collection: 45, collected_parcels: 11, overdue_parcels: 13, overdue_over_60_days: state.over60 }, alert: { type: 'overdue', message: '13 parcels are overdue.' }, parcel_room_distribution: [], latest_logged_parcels: [], pending_collection_parcels: [] });
    if (path === '/api/resident/parcels/summary') return fulfill(route, { unit: { unit_full_code: 'GC1-01-02' }, summary: { pending_collection: 2, overdue_parcels: 1, collected_parcels: 5 } });
    if (path === '/api/resident/parcels') return fulfill(route, { items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } });
    return fulfill(route, {});
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, state, requests, errors };
}
async function ready(page) { await page.waitForLoadState('networkidle'); await page.locator('.ops-content[data-loading=false]').waitFor(); }
async function selectOverviewRoom(page, value) {
  const list = page.locator('.ops-overview-select select');
  if (await list.isVisible()) await list.selectOption(value);
  else await page.getByRole('group', { name: 'Parcel room selection', exact: true }).getByRole('button', { name: value === roomB ? 'Parcel Room B (inactive)' : value === roomA ? 'Parcel Room A' : value === 'unassigned' ? 'Not Assigned' : 'All', exact: true }).click();
}
async function selectRoomStatus(page, value) {
  const view = page.getByRole('group', { name: 'Room chart view' });
  if (value === 'ALL') await view.getByRole('button', { name: 'All Uncollected', exact: true }).click();
  else {
    await view.getByRole('button', { name: 'By Status', exact: true }).click();
    await page.getByLabel('Room chart status').selectOption(value);
  }
}
try {
  for (const width of [1440,834,390]) {
    const t = await setup('ADMIN', width), { page, state, requests } = t;
    await page.goto(base + '/dashboard'); await ready(page);
    assert.deepEqual(await page.locator('.ops-parcel-metrics .adm-number-current').allTextContents(), ['18','11','45','13']);
    assert.equal(await page.locator('.adm-metric').count(), 4);
    assert.equal(await page.getByRole('region', { name: 'Accounts awaiting activation', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'View accounts', exact: true }).count(), 0);
    assert.equal(await page.locator('.ops-attention, .ops-attention-table').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Parcels requiring attention', exact: true }).count(), 0);
    assert.equal(await page.locator('.ops-attention-copy').first().innerText(), '3 parcels have been overdue for more than 60 days.');
    assert.equal(await page.locator('.ops-parcel-metrics').evaluate(node => node.nextElementSibling.classList.contains('ops-room-attention')), true);
    assert.deepEqual(await page.locator('.ops-room-attention > section').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Uncollected Parcels by Room', 'Needs attention']);
    assert.equal(await page.locator('.ops-room-attention').evaluate(node => { const [chart, alerts] = [...node.children].map(child => child.getBoundingClientRect()); return innerWidth > 1100 ? alerts.left >= chart.right && Math.abs(chart.top - alerts.top) < 1 && chart.width < node.clientWidth * .75 : alerts.top >= chart.bottom; }), true);
    assert.equal(await page.locator('.ops-peak-chart, .ops-issue-chart').count(), 0);
    assert.equal(await page.locator('.ops-dispute-actions li').count(), 0);
    assert.equal(await page.locator('.ops-dispute-cards .staff-dispute-card').count(), 5);
    assert.equal(await page.locator('.ops-dispute-cards').evaluate(node => node.getBoundingClientRect().top >= document.querySelector('.ops-room-attention').getBoundingClientRect().bottom), true);
    assert.equal(await page.locator('.ops-dispute-cards .staff-dispute-card[draggable=true]').count(), 0);
    assert.equal(await page.locator('.ops-dispute-cards [aria-label="Drag dispute"]').count(), 0);
    assert.equal(await page.locator('.ops-dispute-cards').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), width > 1200 ? 3 : width > 700 ? 2 : 1);
    assert.match(await page.locator('.ops-dispute-actions .ops-panel-title p').innerText(), /2 escalated, awaiting pickup.*3 in your review/);
    assert.deepEqual(await page.locator('.ops-dispute-cards .staff-dispute-card-heading > span').allTextContents(), ['DSP-004201', 'DSP-004202', 'DSP-004203', 'DSP-004204', 'DSP-004205']);
    assert.deepEqual(await page.locator('.ops-dispute-cards .staff-dispute-tracking').allTextContents(), ['SPX-DASH-001', 'SPX-DASH-002', 'SPX-DASH-003', 'SPX-DASH-004', 'SPX-DASH-005']);
    assert.equal(await page.locator('.ops-dispute-cards .staff-dispute-card-details').first().innerText(), 'COURIER\nShopee Express\nUNIT\nGC1-01-02');
    assert.equal(await page.locator('.ops-dispute-cards .staff-card-handler').first().getAttribute('title'), 'Unassigned');
    assert.equal(await page.locator('.ops-dispute-cards .staff-card-handler').last().getAttribute('title'), 'Jamie Tan');
    assert.deepEqual(await page.locator('.ops-attention-copy').allTextContents(), ['3 parcels have been overdue for more than 60 days.', '1 dispute has been unresolved for more than 7 days.', '3 residents have not activated their accounts.', '1 guard has not activated their account.']);
    assert.equal(await page.locator('.ops-attention-total').count(), 0);
    assert.deepEqual(await page.locator('.ops-attention-copy strong').allTextContents(), ['3 parcels', 'overdue', '60 days', '1 dispute', 'unresolved', '7 days', '3 residents', 'not activated', '1 guard', 'not activated']);
    assert.deepEqual(await page.locator('.ops-attention-item').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/parcels?status=OVERDUE&date_range=all', '/disputes', '/accounts', '/accounts']);
    assert.equal(await page.locator('.ops-attention-arrow').count(), 4);
    await page.locator('.ops-attention-item').first().focus();
    assert.equal(await page.locator('.ops-attention-item').first().evaluate(node => getComputedStyle(node).outlineWidth), '2px'); cases++;
    assert.match(await page.locator('.dashboard-welcome-row time').innerText(), /\d{1,2}:\d{2} [ap]m/);
    assert.equal(await page.getByRole('heading', { name: 'Dashboard', exact: true }).count(), 1);
    assert.equal(await page.locator('.workspace-topbar time').count(), 0);
    assert.equal(await page.locator('.dashboard-welcome-row').evaluate(node => { const greeting = node.querySelector('h2').getBoundingClientRect(), clock = node.querySelector('time').getBoundingClientRect(); return innerWidth <= 700 || clock.left >= greeting.right && Math.abs(clock.top + clock.height / 2 - greeting.top - greeting.height / 2) < 1; }), true);
    assert.equal(await page.locator('.ops-overview-title time, .dashboard-summary-time').count(), 0);
    assert.equal(await page.locator('.dashboard-malaysia-clock').count(), 1);
    assert.equal(await page.locator('.ops-overview-title h2').evaluate(node => getComputedStyle(node).fontSize), width <= 560 ? '15px' : '16px');
    assert.equal(await page.locator('.adm-panel-heading h2').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).fontSize === (innerWidth > 560 && innerWidth <= 1100 ? '17px' : '18px') && getComputedStyle(node).fontWeight === '500')), true, 'Section headings follow the ZIP type scale');
    assert.equal(await page.locator('.dashboard-greeting').evaluate(node => getComputedStyle(node).fontSize), width <= 560 ? '25px' : width <= 900 ? '26px' : '30px');
    assert.equal(await page.locator('.ops-room-attention > .adm-panel').evaluateAll(nodes => nodes.every(node => { const style = getComputedStyle(node); return style.backgroundColor === 'rgb(255, 255, 255)' && style.backdropFilter === 'none' && style.borderRadius === '20px' && style.boxShadow.includes('8px 24px'); })), true);
    assert.equal(await page.locator('.ops-metric, .ops-dispute-cards .staff-dispute-card').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).boxShadow.includes('8px 24px'))), true, 'Summary and dispute cards use the same visible elevation');
    assert.equal(await page.locator('.ops-dispute-actions').evaluate(node => getComputedStyle(node).boxShadow), 'none', 'The dispute section remains unframed');
    assert.equal(await page.locator('.ops-updated').count(), 0);
    assert.match(await page.locator('.dashboard-greeting').innerText(), /^Good (morning|afternoon|evening), Jamie\.$/);
    assert.equal(await page.locator('.ops-parcel-metrics .ops-metric-icon svg').count(), 4);
    assert.equal(await page.locator('.ops-metric-icon').evaluateAll(nodes => nodes.every(node => {
      const tile = node.getBoundingClientRect(), icon = node.querySelector('svg').getBoundingClientRect();
      return Math.abs((tile.left + tile.right - icon.left - icon.right) / 2) < 1
        && Math.abs((tile.top + tile.bottom - icon.top - icon.bottom) / 2) < 1;
    })), true, 'Summary icons are centered horizontally and vertically inside their tiles');
    assert.equal(await page.locator('.ops-parcel-metrics .ops-metric').evaluateAll(nodes => nodes.every(node => { const icon = node.querySelector('.ops-metric-icon').getBoundingClientRect(), copy = node.querySelector('.ops-metric-copy'), number = copy.querySelector('strong').getBoundingClientRect(), label = copy.querySelector(':scope > span').getBoundingClientRect(); return icon.right <= copy.getBoundingClientRect().left && number.bottom <= label.top && label.right <= node.getBoundingClientRect().right; })), true);
    assert.equal(await page.locator('.ops-important-alerts .dashboard-overdue-caution').count(), 0);
    assert.deepEqual(await page.locator('.ops-attention-icon').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)), ['rgb(255, 244, 221)', 'rgb(251, 238, 241)', 'rgb(234, 241, 255)', 'rgb(232, 245, 240)']); cases++;
    assert.deepEqual(await page.locator('.ops-parcel-metrics .ops-metric-copy > span').allTextContents(), ['Registered Today', 'Collected Today', 'Awaiting Collection', 'Overdue']);
    const numberColors = ['rgb(41, 72, 211)', 'rgb(23, 131, 72)', 'rgb(154, 101, 15)', 'rgb(191, 48, 70)'];
    const cardColors = await page.locator('.ops-parcel-metrics .ops-metric').evaluateAll(nodes => nodes.map(node => ({ number: getComputedStyle(node.querySelector('strong')).color, label: getComputedStyle(node.querySelector('.ops-metric-copy > span')).color, width: getComputedStyle(node).borderTopWidth, icon: getComputedStyle(node.querySelector('.ops-metric-icon svg')).color })));
    assert.deepEqual(cardColors.map(card => card.number), numberColors);
    assert.ok(cardColors.every((card, index) => card.label === 'rgb(31, 43, 77)' && card.icon === numberColors[index] && card.width === '0px'));
    assert.equal(await page.locator('.dashboard-greeting, .ops-overview-title h2, .adm-panel-heading h2').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).color === 'rgb(31, 43, 77)')), true);
    assert.deepEqual(await page.locator('.ops-stack').first().locator(':scope > span').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)), [numberColors[2], numberColors[3]], 'Awaiting and overdue bars match their summary colours');
    assert.equal(await page.locator('.ops-segment-count').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).color === 'rgb(255, 255, 255)')), true);
    const cards = page.locator('.ops-parcel-metrics .ops-metric');
    for (let index = 0; index < 4; index++) {
      await cards.nth(index).hover({ position: { x: 20, y: 20 } });
      await page.waitForFunction(index => getComputedStyle(document.querySelectorAll('.ops-parcel-metrics .ops-metric')[index], '::before').opacity === '1', index);
      assert.equal(await cards.nth(index).evaluate(node => {
        const style = getComputedStyle(node, '::before');
        return style.backgroundImage.includes('189, 234, 244') && style.backgroundImage.includes('213, 209, 250')
          && style.transitionDuration === '0.18s' && node.style.getPropertyValue('--spotlight-x') !== '';
      }), true, 'Summary uses the ZIP pointer-following spotlight');
    }
    assert.equal(await page.locator('.ops-parcel-metrics small').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Refresh dashboard' }).count(), 0);
    assert.equal(await page.locator('.ops-overview-select select').isVisible(), width <= 700); cases++;
    assert.equal(await page.locator('.workspace-topbar').count(), 1);
    assert.equal(await page.locator('.workspace-page-title').innerText(), 'Dashboard');
    assert.equal(await page.locator('.adm-topbar, .adm-profile, .ops-export').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Export report', exact: true }).count(), 0);
    cases++;
    await page.keyboard.press('Meta+k');
    assert.equal(await page.locator('.workspace-search input').evaluate(node => document.activeElement === node), true); cases++;
    await selectOverviewRoom(page, roomA); await ready(page);
    assert.match(await page.locator('.ops-attention-item').first().innerText(), /3 parcels have been overdue/);
    await selectOverviewRoom(page, roomB); await ready(page);
    assert.match(await page.locator('.ops-attention-item').first().innerText(), /3 parcels have been overdue/);
    assert.deepEqual(await page.locator('.ops-room-plot > strong').allTextContents(), ['30','15']);
    assert.equal(await page.locator('.adm-number-current').first().innerText(), '2');
    await selectOverviewRoom(page, ''); await ready(page); cases++;
    await selectRoomStatus(page, 'OVERDUE');
    assert.deepEqual(await page.locator('.ops-room-plot > strong').allTextContents(), ['10','3']);
    await selectRoomStatus(page, 'PENDING');
    assert.deepEqual(await page.getByLabel('Room chart status').locator('option').allTextContents(), ['Awaiting Collection Only', 'Overdue Only']);
    assert.deepEqual(await page.locator('.ops-room-plot > strong').allTextContents(), ['20','12']);
    await selectRoomStatus(page, 'ALL');
    assert.deepEqual(await page.locator('.ops-room-plot > strong').allTextContents(), ['30','15']);
    assert.equal(await page.locator('.ops-room-chart').getByText('Not Assigned', { exact: true }).count(), 0);
    assert.deepEqual(await page.locator('.ops-room-axis span').allTextContents(), ['0','5','10','15','20','25','30','35']);
    assert.equal(await page.locator('.ops-room-grid i').count(), 8);
    await page.locator('.ops-room-axis').getByText('Number of Parcels').waitFor();
    const roomChart = page.getByRole('region', { name: 'Uncollected Parcels by Room' });
    assert.equal(await page.getByLabel('Room chart status').count(), 0);
    assert.deepEqual(await roomChart.locator('.ops-legend span').allTextContents(), ['Awaiting Collection', 'Overdue']);
    assert.equal(await page.locator('.ops-parcel-metrics .ops-metric').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height <= 96)), true);
    assert.equal(await roomChart.locator('.adm-data, table').count(), 0);
    assert.equal(await page.locator('.adm-data').count(), 0);
    const firstBar = roomChart.locator('.ops-room-bar').first(), secondBar = roomChart.locator('.ops-room-bar').nth(1);
    await firstBar.hover();
    await page.getByRole('tooltip').waitFor();
    assert.match(await page.getByRole('tooltip').innerText(), /Parcel Room A/);
    assert.deepEqual(await page.getByRole('tooltip').locator('dd').allTextContents(), ['20', '10', '30']);
    await page.getByRole('tooltip').getByText('Awaiting Collection', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tooltip').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), true);
    await roomChart.screenshot({ path: '/private/tmp/parcel-nexus-room-tooltip-' + width + '.png' });
    await page.getByRole('heading', { name: 'Uncollected Parcels by Room' }).hover();
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await secondBar.focus();
    assert.deepEqual(await page.getByRole('tooltip').locator('dd').allTextContents(), ['12', '3', '15']);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await firstBar.click();
    assert.deepEqual(await page.getByRole('tooltip').locator('dd').allTextContents(), ['20', '10', '30']);
    await selectRoomStatus(page, 'OVERDUE');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await secondBar.hover();
    assert.deepEqual(await page.getByRole('tooltip').locator('dd').allTextContents(), ['3', '3']);
    assert.equal(await page.getByRole('tooltip').getByText('Awaiting Collection', { exact: true }).count(), 0);
    await selectRoomStatus(page, 'ALL');
    cases += 2;
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.scrollTo(0,0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.ops-dispute-actions .adm-panel-heading').evaluate(node => node.getBoundingClientRect().top - Math.max(...[...document.querySelectorAll('.ops-room-attention > section')].map(panel => panel.getBoundingClientRect().bottom)) <= 24), true, 'Disputes sit close beneath the preceding panels');
    await page.screenshot({ path: '/private/tmp/parcel-nexus-admin-caution-' + width + '.png', fullPage: true });
    assert.deepEqual(t.errors, []); cases++;
    state.empty = true; await page.reload(); await ready(page);
    assert.equal(await page.locator('.dashboard-overdue-caution').count(), 0);
    await page.getByText('No assigned parcel rooms to show.', { exact: true }).waitFor();
    await page.getByText('No disputes need your action right now.').waitFor();
    await page.getByText('Nothing needs attention right now.').waitFor();
    assert.equal(await page.locator('.ops-attention-total').count(), 0);
    assert.equal(await page.locator('.ops-attention-item').count(), 0); cases++;
    state.empty = false; await page.reload(); await ready(page);
    const overdueRequest = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/api/parcels' && url.searchParams.get('status') === 'OVERDUE' && url.searchParams.get('date_range') === 'all'; });
    await page.locator('.ops-attention-item').first().press('Enter');
    await page.waitForURL(url => url.pathname === '/parcels' && url.searchParams.get('status') === 'OVERDUE');
    await overdueRequest; cases++;
    await page.goto(base + '/dashboard'); await ready(page);
    await page.locator('.ops-attention-item').nth(1).click();
    await page.waitForURL(url => url.pathname === '/disputes'); cases++;
    await page.goto(base + '/dashboard'); await ready(page);
    await page.locator('.ops-attention-item').nth(2).click();
    await page.waitForURL(url => url.pathname === '/accounts'); cases++;
    await page.goto(base + '/dashboard'); await ready(page);
    await page.locator('.workspace-search input').fill('SPX-DASH-001');
    const searchRequest = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/parcels' && url.searchParams.get('search') === 'SPX-DASH-001' && url.searchParams.get('date_range') === 'all';
    });
    await page.locator('.workspace-search input').press('Enter');
    await page.waitForURL(url => url.pathname === '/parcels' && url.searchParams.get('search') === 'SPX-DASH-001');
    await page.locator('.parcel-management-search input').waitFor();
    assert.equal(await page.locator('.parcel-management-search input').inputValue(), 'SPX-DASH-001');
    await searchRequest;
    await page.waitForLoadState('networkidle');
    assert.ok(requests.some(request => request.path === '/api/parcels' && request.query.search === 'SPX-DASH-001' && request.query.date_range === 'all'), JSON.stringify(requests.filter(request => request.path.startsWith('/api/parcels'))));
    assert.equal(requests.some(request => request.method === 'POST'), false); cases++;
    await t.context.close();
  }
  // Analytics filters, charts and PDF export are covered in analytics.browser.mjs.
  for (const width of [1440,834,390]) {
    const t = await setup('GUARD', width), { page, state } = t;
    await page.goto(base + '/dashboard');
    await page.locator('.guard-summary-grid').waitFor(); await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('heading', { name: 'Pending collection', exact: true }).count(), 0);
    assert.equal(await page.locator('.guard-table-card').count(), 1);
    await page.getByRole('heading', { name: 'Latest parcels logged', exact: true }).waitFor();
    assert.match(await page.getByRole('note').innerText(), /3 parcels have been overdue for more than 60 days/);
    assert.equal(await page.locator('.guard-summary-grid').evaluate(node => node.nextElementSibling.classList.contains('dashboard-overdue-caution')), true);
    assert.equal(await page.locator('.dashboard-welcome-row time').count(), 1);
    assert.match(await page.locator('.dashboard-greeting').innerText(), /^Good (morning|afternoon|evening), Jamie\.$/);
    assert.equal(await page.locator('.guard-summary-grid svg').count(), 0);
    assert.equal(await page.locator('.guard-summary-card.amber strong').evaluate(node => getComputedStyle(node).color), 'rgb(154, 101, 15)');
    assert.equal(await page.locator('.guard-summary-card.red strong').evaluate(node => getComputedStyle(node).color), 'rgb(191, 48, 70)');
    assert.equal(await page.locator('.guard-summary-card').evaluateAll(nodes => nodes.every(node => node.firstElementChild.classList.contains('guard-summary-value-row') && node.querySelector('strong').getBoundingClientRect().bottom <= node.querySelector('.guard-summary-label').getBoundingClientRect().top)), true);
    assert.match(await page.getByRole('note').innerText(), /^Attention:/);
    assert.match(await page.locator('.dashboard-malaysia-clock').innerText(), /\d{1,2}:\d{2} [ap]m/);
    assert.equal(await page.getByText('13 parcels are overdue.', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '/private/tmp/parcel-nexus-guard-caution-' + width + '.png', fullPage: true }); cases++;
    state.over60 = 0; await page.reload(); await page.locator('.guard-summary-grid').waitFor();
    assert.equal(await page.locator('.dashboard-overdue-caution').count(), 0);
    assert.deepEqual(t.errors, []); cases++;
    await t.context.close();
  }
  {
    const t = await setup(); t.state.error = 500; await t.page.goto(base + '/dashboard');
    await t.page.getByRole('alert').getByText('Dashboard unavailable. Please retry.').waitFor();
    t.state.error = 0; await t.page.getByRole('button', { name: 'Retry', exact: true }).click(); await ready(t.page); cases++;
    t.state.slowA = true;
    await selectRoomStatus(t.page, 'OVERDUE');
    await t.page.evaluate(() => { window.__dashboardRoomChart = document.querySelector('.ops-room-chart'); window.__dashboardScroll = scrollY; });
    await selectOverviewRoom(t.page, roomA);
    await t.page.locator('.ops-parcel-metrics[aria-busy=true]').waitFor();
    assert.equal(await t.page.locator('.ops-section-status, .ops-loading').count(), 0);
    assert.equal(await t.page.getByText(/Updating parcel overview/).count(), 0);
    assert.equal(await t.page.getByLabel('Room chart status').isEnabled(), true);
    assert.equal(await t.page.getByRole('region', { name: 'Uncollected Parcels by Room', exact: true }).getAttribute('aria-busy'), 'false');
    assert.equal(await t.page.locator('.ops-content').evaluate(node => getComputedStyle(node).opacity), '1');
    assert.equal(await t.page.evaluate(() => window.__dashboardRoomChart === document.querySelector('.ops-room-chart') && window.__dashboardScroll === scrollY), true);
    assert.deepEqual(await t.page.locator('.ops-parcel-metrics .adm-number-current').allTextContents(), ['18','11','45','13']); cases++;
    await selectOverviewRoom(t.page, roomB); await ready(t.page);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(await t.page.locator('.adm-number-current').first().innerText(), '2');
    assert.match(await t.page.locator('.ops-attention-item').first().innerText(), /3 parcels have been overdue/);
    assert.equal(await t.page.getByLabel('Room chart status').inputValue(), 'OVERDUE'); cases++;
    await t.page.getByRole('button', { name: 'Open dispute DSP-004201', exact: true }).focus();
    await t.page.keyboard.press('Enter');
    await t.page.waitForURL(url => url.pathname === '/disputes' && url.searchParams.get('dispute_id') === disputeId); cases++;
    await t.context.close();
  }
  for (const roomCount of [0,3,4]) {
    const t = await setup('ADMIN', 1440, roomCount); await t.page.goto(base + '/dashboard'); await ready(t.page);
    assert.equal(await t.page.locator('.ops-overview-select select').isVisible(), roomCount > 3);
    if (roomCount <= 3) assert.equal(await t.page.getByRole('group', { name: 'Parcel room selection', exact: true }).getByRole('button').count(), roomCount + 1);
    await t.page.setViewportSize({ width: 390, height: 1000 });
    await selectOverviewRoom(t.page, 'unassigned'); await ready(t.page);
    assert.ok(t.requests.some(request => request.query.summary_room_id === 'unassigned'));
    await t.page.setViewportSize({ width: 1440, height: 1000 });
    if (roomCount <= 3) assert.equal(await t.page.getByRole('group', { name: 'Parcel room selection', exact: true }).getByRole('button', { name: 'Not Assigned', exact: true }).getAttribute('aria-pressed'), 'true');
    else assert.equal(await t.page.locator('.ops-overview-select select').inputValue(), 'unassigned'); cases++;
    await t.context.close();
  }
  for (const role of ['ADMIN', 'GUARD']) {
    const t = await setup(role); await t.page.goto(base + '/disputes');
    await t.page.locator('.staff-dispute-card').first().waitFor();
    await t.page.waitForLoadState('networkidle');
    const myColumn = t.page.locator('.staff-kanban-column.tone-' + (role === 'ADMIN' ? 'admin' : 'guard'));
    assert.equal(await myColumn.locator('.staff-dispute-card').getAttribute('draggable'), 'true');
    assert.equal(await myColumn.getByLabel('Drag dispute').count(), 1);
    const otherColumn = t.page.locator('.staff-kanban-column.tone-' + (role === 'ADMIN' ? 'guard' : 'admin'));
    assert.equal(await otherColumn.locator('.staff-dispute-card').getAttribute('draggable'), 'false');
    assert.deepEqual(t.errors, []);
    assert.equal(t.requests.some(request => request.method === 'POST' || request.method === 'PATCH'), false); cases++;
    await t.context.close();
  }
  {
    const t = await setup(); await t.page.clock.install({ time: new Date('2026-10-14T15:58:00Z') });
    await t.page.goto(base + '/dashboard'); await ready(t.page);
    assert.match(await t.page.locator('.dashboard-malaysia-clock').innerText(), /14 Oct 2026.*11:58 pm/);
    await t.page.clock.fastForward(60000);
    assert.match(await t.page.locator('.dashboard-malaysia-clock').innerText(), /14 Oct 2026.*11:59 pm/); cases++;
    await t.context.close();
  }
  for (const width of [1440,834,390]) {
    const t = await setup('RESIDENT', width); await t.page.goto(base + '/dashboard');
    await t.page.locator('.resident-summary-grid').waitFor(); await t.page.waitForLoadState('networkidle');
    assert.match(await t.page.locator('.dashboard-greeting').innerText(), /^Good (morning|afternoon|evening), Jamie\.$/);
    assert.equal(await t.page.locator('.resident-summary-grid svg, .resident-summary-dot').count(), 0);
    assert.deepEqual(await t.page.locator('.resident-summary-card > strong').allTextContents(), ['2','1','5']);
    assert.equal(await t.page.locator('.resident-summary-card.amber strong').evaluate(node => getComputedStyle(node).color), 'rgb(154, 101, 15)');
    assert.equal(await t.page.locator('.resident-summary-card.green strong').evaluate(node => getComputedStyle(node).color), 'rgb(23, 131, 72)');
    assert.equal(await t.page.locator('.resident-summary-card').evaluateAll(nodes => nodes.every(node => node.firstElementChild.tagName === 'STRONG' && node.querySelector('strong').getBoundingClientRect().bottom <= node.querySelector('p').getBoundingClientRect().top)), true);
    assert.equal(await t.page.locator('.dashboard-summary-time').count(), 0);
    assert.match(await t.page.locator('.dashboard-welcome-row time').innerText(), /\d{1,2}:\d{2} [ap]m/);
    assert.equal(await t.page.locator('.dashboard-overdue-caution, .adm-operations').count(), 0);
    assert.equal(t.requests.some(request => request.path.includes('/dashboard/admin')), false);
    assert.equal(t.requests.some(request => request.method === 'POST'), false);
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await t.page.evaluate(() => document.fonts.ready);
    await t.page.screenshot({ path: '/private/tmp/parcel-nexus-resident-summary-' + width + '.png', fullPage: true });
    assert.deepEqual(t.errors, []); cases++;
    await t.context.close();
  }
  for (const role of ['SUPER_ADMIN']) {
    const t = await setup(role,390); await t.page.goto(base + '/dashboard'); await t.page.waitForLoadState('networkidle');
    assert.equal(await t.page.locator('.dashboard-overdue-caution, .dashboard-malaysia-clock, .adm-operations').count(), 0);
    assert.equal(t.requests.some(request => request.path.includes('/dashboard/admin')), false);
    assert.deepEqual(t.errors, []); cases++;
    await t.context.close();
  }
  for (const role of ['GUARD', 'RESIDENT', 'SUPER_ADMIN']) {
    const t = await setup(role, 390);
    await t.page.goto(base + '/analytics');
    await t.page.waitForURL(url => url.pathname === (role === 'SUPER_ADMIN' ? '/accounts' : '/dashboard'));
    await t.page.waitForLoadState('networkidle');
    assert.equal(await t.page.locator('.ops-peak-chart, .ops-issue-chart').count(), 0);
    assert.equal(t.requests.some(request => request.path.includes('/dashboard/admin')), false);
    assert.deepEqual(t.errors, []); cases++;
    await t.context.close();
  }
  console.log('Dashboard summary update: ' + cases + ' scenarios passed across Admin/Guard/Resident desktop, tablet and mobile. Intercepted fixtures; no live writes.');
} finally { await browser.close(); }
