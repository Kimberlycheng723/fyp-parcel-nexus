import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const parcelId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const disputeId = '33333333-3333-4333-8333-333333333333', investigationId = '44444444-4444-4444-8444-444444444444';
const evidenceId = '55555555-5555-4555-8555-555555555555', collectionId = '66666666-6666-4666-8666-666666666666';
const timestamp = '2026-10-13T04:00:00Z';
let cases = 0;
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
function fixtures() {
  const parcel = { parcel_id: parcelId, tracking_number: 'SPX-18D-001', courier_name: 'Shopee Express', unit_reference: 'A-12-03', parcel_room_name: 'Lobby Parcel Room', status: 'PENDING_COLLECTION', created_at: timestamp, collected_at: null };
  const dispute = { dispute_id: disputeId, dispute_reference: 'DSP-001234', parcel: { ...parcel }, status: 'OPEN', issue_type: 'MISSING_ITEM', resident: { unit_full_code: 'A-12-03' }, description: 'The parcel cannot be located.', created_at: timestamp, latest_activity_at: timestamp, evidence: [] };
  const evidence = { evidence_id: evidenceId, parcel_id: otherId, tracking_number: 'DHL-OTHER-002', courier_name: 'DHL', parcel_room_name: 'Tower B Room', barcode_status: 'MATCHED', photo_present: true, photo_uploaded_at: timestamp };
  const collection = { collection_id: collectionId, verification_status: 'COMPLETED', collection_status: 'USED', unit_reference: 'B-07-02', created_at: timestamp, collected_at: timestamp, parcel_count: 1, evidence: [evidence], evidence_count: 1, reason: 'Matching tracking-number attempt recorded; requires review' };
  return { parcel, dispute, collection, investigation: null, notes: [], events: [{ event_id: 'registered', created_at: timestamp, label: 'Parcel registered', detail: 'SPX-18D-001', actor_name: 'John Tan', actor_role: 'GUARD' }], overviewError: 0, photoError: 0, searchError: 0, searchDelay: 0, delay: 0 };
}
async function setup(role = 'GUARD', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const state = fixtures(), requests = [], errors = [];
  const user = { user_id: '77777777-7777-4777-8777-777777777777', role, first_name: 'John', last_name: 'Tan', status: 'ACTIVE' };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url')}.test`;
  await context.addInitScript((token) => localStorage.setItem('parcel_nexus_access_token', token), token);
  await context.route('**/socket.io/**', (route) => route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message));
  // Synthetic image fixtures are never uploaded or written to the live database.
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#edf0f3'; ctx.fillRect(0,0,640,480);
    ctx.fillStyle = '#b68b5b'; ctx.fillRect(130,110,380,280); ctx.fillStyle = '#d7bd91'; ctx.fillRect(296,110,46,280);
    ctx.strokeStyle = '#795a39'; ctx.lineWidth = 3; ctx.strokeRect(130,110,380,280);
    ctx.fillStyle = '#fff'; ctx.fillRect(355,140,120,110); ctx.fillStyle = '#17202a'; ctx.font = '16px sans-serif'; ctx.fillText('TEST EVIDENCE',365,165);
    for(let i=0;i<18;i++) ctx.fillRect(365+i*5,180,i%3+1,45);
    ctx.fillStyle = '#5b6572'; ctx.fillText('Browser fixture only',20,450);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await context.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    requests.push({ path, query: Object.fromEntries(url.searchParams), method, body: method === 'GET' ? null : req.postDataJSON(), auth: req.headers().authorization });
    if (path === '/api/auth/me') return fulfill(route, { user });
    if (path === '/api/notifications/unread-count') return fulfill(route, { unread_count: 0 });
    if (path.startsWith('/api/disputes')) {
      if (path.endsWith('/history')) return fulfill(route, { history: [] });
      if (path.endsWith('/messages')) return fulfill(route, { messages: [] });
      if (path === `/api/disputes/${disputeId}`) return fulfill(route, { dispute: state.dispute });
      return fulfill(route, { disputes: [], pagination: { total: 0, total_pages: 0 } });
    }
    if (path.startsWith('/api/parcel-trace')) {
      assert.ok(['ADMIN', 'GUARD'].includes(role), 'Unauthorized frontend must not request trace data');
      assert.ok(req.headers().authorization?.startsWith('Bearer '));
      const pagination = { page: Number(url.searchParams.get('page') || 1), limit: 20, total: 21, total_pages: 2 };
      if (path.endsWith('/registration-photo') || path.endsWith('/photo')) {
        if (state.photoError) return fulfill(route, { message: 'Photo unavailable.' }, state.photoError);
        return route.fulfill({ contentType: 'image/png', body: image });
      }
      if (path === '/api/parcel-trace/parcels') {
        await new Promise((resolve) => setTimeout(resolve, state.searchDelay));
        if (state.searchError) return fulfill(route, { message: 'Unable to search parcels.' }, state.searchError);
        const tracking = url.searchParams.get('tracking_number');
        const matches = tracking === 'none' ? [] : tracking === 'duplicate' ? [state.parcel, { ...state.parcel, parcel_id: otherId, courier_name: 'DHL', unit_reference: 'B-07-02' }] : [state.parcel];
        return fulfill(route, { parcels: matches, pagination: { ...pagination, total: matches.length, total_pages: 1 } });
      }
      if (path.endsWith('/barcodes')) return fulfill(route, { attempts: [
        { attempt_id: 'attempt', scanned_tracking_number: 'SPX-18D-001', registered_tracking_number: 'DHL-OTHER-002', unit_reference: 'B-07-02', result: 'MISMATCHED', verification_status: 'COMPLETED', created_at: timestamp, completed_at: timestamp, exact_tracking_match: true, target_parcel_attempt: false },
        { attempt_id: 'match', scanned_tracking_number: 'SPX-18D-001', registered_tracking_number: 'SPX-18D-001', unit_reference: 'A-12-03', result: 'MATCHED', verification_status: 'COMPLETED', created_at: timestamp, completed_at: timestamp, exact_tracking_match: true, target_parcel_attempt: true },
        { attempt_id: 'unreadable', scanned_tracking_number: null, registered_tracking_number: 'SPX-18D-001', unit_reference: 'A-12-03', result: 'UNREADABLE', verification_status: 'VERIFYING', created_at: timestamp, completed_at: null, exact_tracking_match: false, target_parcel_attempt: true }
      ], pagination });
      if (path.endsWith('/collections')) return fulfill(route, { collections: [state.collection], pagination });
      if (path.endsWith('/evidence')) return fulfill(route, { evidence: state.collection.evidence, pagination });
      if (path.endsWith('/timeline')) return fulfill(route, { events: state.events, pagination });
      if (path.endsWith('/notes')) {
        if (method === 'POST') {
          const body = req.postDataJSON(); state.notes.push({ note_id: `note-${state.notes.length}`, content: body.content, observations: body.observations, reviewed_evidence_id: body.reviewed_evidence_id, author_name: 'John Tan', author_role: role, created_at: timestamp });
          return fulfill(route, { note: { note_id: 'note' } }, 201);
        }
        return fulfill(route, { notes: state.notes, pagination: { ...pagination, total: state.notes.length, total_pages: 1 } });
      }
      if (path.endsWith('/investigations')) { state.investigation = { investigation_id: investigationId, status: 'OPEN' }; return fulfill(route, { investigation: state.investigation }, 201); }
      if (path.endsWith('/status')) { state.investigation.status = req.postDataJSON().status; state.events.push({ event_id: `status-${state.events.length}`, created_at: timestamp, label: `Investigation: ${state.investigation.status}`, detail: 'Stored history', actor_role: role }); return fulfill(route, { investigation: state.investigation }); }
      await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.overviewError) return fulfill(route, { message: 'The dispute is unavailable or is not linked to this parcel.' }, state.overviewError);
      const transitions = !state.investigation ? [] : state.investigation.status === 'OPEN' ? role === 'ADMIN' ? ['UNDER_REVIEW', 'RESOLVED'] : ['UNDER_REVIEW']
        : state.investigation.status === 'UNDER_REVIEW' ? role === 'ADMIN' ? ['RESOLVED'] : ['RESOLVED', 'ESCALATED'] : state.investigation.status === 'RESOLVED' ? ['UNDER_REVIEW'] : role === 'ADMIN' ? ['UNDER_REVIEW', 'RESOLVED'] : [];
      return fulfill(route, { parcel: state.parcel, dispute: url.searchParams.has('dispute_id') ? state.dispute : null, investigation: state.investigation, related_disputes: [state.dispute], related_disputes_pagination: { total: 1 }, allowed_transitions: transitions });
    }
    return fulfill(route, {});
  });
  return { context, page, requests, errors, state };
}
async function capture(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0,0); for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const overflow = await page.locator('.parcel-trace-page').evaluate((element) => element.scrollWidth > element.clientWidth);
  if (overflow) console.log('Overflow diagnostic', width, await page.locator('.parcel-trace-page').evaluate((root) => Array.from(root.querySelectorAll('*')).filter((element) => element.getBoundingClientRect().right > root.getBoundingClientRect().right + 1).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0,90), width: element.getBoundingClientRect().width })).slice(0,12)));
  assert.equal(overflow, false, 'Trace content must not overflow beneath page-level clipping');
  await page.screenshot({ path: `/private/tmp/parcel-nexus-trace-${name}-${width}.png`, fullPage: true });
}
try {
  for (const width of [1440,834,390]) {
    const t = await setup(width === 834 ? 'ADMIN' : 'GUARD', width);
    const input = t.page.locator('#trace-tracking');
    await t.page.goto(base + '/parcel-trace'); await input.waitFor();
    await capture(t.page, 'search', width);
    assert.equal(t.requests.filter((item) => item.path.includes('/parcel-trace')).length, 0); cases++;
    await t.page.getByRole('button', { name: 'Find parcel', exact: true }).click(); await t.page.getByRole('alert').waitFor();
    await input.fill('SPX-18D-001'); await t.page.getByRole('button', { name: 'Find parcel', exact: true }).click();
    await t.page.getByText('Parcel found', { exact: true }).waitFor();
    assert.ok(t.page.url().includes('parcel_id=' + parcelId));
    assert.ok(t.requests.some((item) => item.path === '/api/parcel-trace/parcels' && item.query.page === '1' && item.query.limit === '2'));
    assert.equal(t.requests.filter((item) => /barcodes|collections|registration-photo/.test(item.path)).length, 0); cases++;
    await capture(t.page, 'choices', width);
    const before = t.requests.filter((item) => item.path === '/api/parcel-trace/parcels').length;
    await t.page.getByRole('button', { name: 'Find parcel', exact: true }).click(); await t.page.getByText('Parcel found', { exact: true }).waitFor();
    assert.ok(t.requests.filter((item) => item.path === '/api/parcel-trace/parcels').length > before); cases++;
    await t.page.getByRole('button', { name: /Tracking number match/ }).click(); await t.page.getByRole('heading', { name: 'Tracking number check' }).waitFor();
    await t.page.getByText('Scan recorded for a different unit').waitFor();
    assert.equal(await t.page.getByText('Collected by the wrong unit', { exact: true }).count(), 0);
    assert.equal(await t.page.locator('.parcel-photo-search').count(), 0); cases++;
    await t.page.getByText('View scan records', { exact: true }).click();
    assert.deepEqual(await t.page.locator('.trace-barcode-table th').allTextContents(), ['Registered Tracking Number', 'Scanned Tracking Number', 'Collection Unit', 'Scan Time', 'Result']);
    const rows = t.page.locator('.trace-barcode-table tbody tr');
    assert.equal(await rows.nth(0).locator('td').nth(0).innerText(), 'DHL-OTHER-002');
    assert.equal(await rows.nth(0).locator('td').nth(1).innerText(), 'SPX-18D-001');
    assert.equal(await rows.nth(1).locator('.match').innerText(), 'Match');
    assert.equal(await rows.nth(2).locator('.unreadable').innerText(), 'Unreadable');
    await rows.nth(1).getByRole('button', { name: 'Review scan' }).click(); await t.page.getByRole('heading', { name: 'Tracking number matches', exact: true }).waitFor();
    await rows.nth(0).locator('summary').click(); await rows.nth(0).getByText('A different parcel', { exact: true }).waitFor(); cases++;
    await capture(t.page, 'barcode', width);
    await t.page.getByRole('button', { name: 'Next barcode page' }).click();
    await t.page.waitForFunction(() => document.querySelector('.trace-pagination').textContent.includes('Page 2'));
    assert.ok(t.requests.some((item) => item.path.endsWith('/barcodes') && item.query.page === '2')); cases++;
    await t.page.getByRole('button', { name: /Image comparison/ }).click();
    await t.page.waitForFunction(() => { const button = document.querySelector('.photo-search-actions .primary-button'); return button && !button.disabled; });
    assert.equal(await t.page.locator('.photo-reference-thumbnail').count(), 0);
    assert.equal(await t.page.getByLabel('Start date', { exact: true }).isVisible(), true);
    assert.equal(await t.page.locator('.trace-barcode-view').count(), 0);
    assert.equal(t.requests.filter((item) => item.path.endsWith('/collections')).length, 0); cases++;
    assert.equal(await t.page.getByText('Browse recorded collections', { exact: true }).count(), 0);
    assert.equal(await t.page.locator('.trace-collection-browser, .trace-candidates').count(), 0);
    assert.equal(await t.page.getByRole('button', { name: 'Review Evidence' }).count(), 0);
    assert.equal(t.requests.filter((item) => item.path.endsWith('/collections')).length, 0); cases++;
    await t.page.getByText('Parcel details', { exact: true }).click(); await t.page.getByText('Lobby Parcel Room', { exact: true }).waitFor();
    assert.equal(t.requests.filter((item) => /notes|timeline|investigations/.test(item.path)).length, 0);
    assert.equal(t.requests.filter((item) => item.method !== 'GET' && item.path.includes('/parcel-trace')).length, 0);
    assert.deepEqual(t.errors, []); cases++;
    await capture(t.page, 'photo', width);
    const link = t.page.getByRole('link', { name: /View Dispute/ }); assert.equal(await link.getAttribute('href'), '/disputes?dispute_id=' + disputeId);
    await link.click(); await t.page.waitForURL((url) => url.pathname === '/disputes'); cases++;
    await t.context.close();
  }
  for (const value of ['none','duplicate']) {
    const t = await setup(); await t.page.goto(base + '/parcel-trace'); await t.page.locator('#trace-tracking').fill(value); await t.page.getByRole('button', { name: 'Find parcel' }).click();
    await t.page.getByText(value === 'none' ? 'No parcel matches this tracking number.' : /More than one parcel/).waitFor();
    assert.equal(await t.page.locator('.trace-method').count(), 0); cases++; await t.context.close();
  }
  {
    const t = await setup(); await t.context.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await t.page.goto(base + '/parcel-trace'); await t.page.getByRole('button', { name: 'Use camera' }).click();
    await t.page.locator('.collection-barcode-camera').getByRole('alert').waitFor();
    await t.page.getByRole('button', { name: 'Close barcode scanner' }).click();
    assert.equal(await t.page.locator('#trace-tracking').isEnabled(), true);
    assert.equal(t.requests.filter((item) => item.path.includes('/parcel-trace')).length, 0); cases++; await t.context.close();
  }
  {
    const t = await setup(); t.state.searchError = 500; await t.page.goto(base + '/parcel-trace'); await t.page.locator('#trace-tracking').fill('SPX'); await t.page.getByRole('button', { name: 'Find parcel' }).click();
    await t.page.getByRole('alert').waitFor(); t.state.searchError = 0; await t.page.getByRole('button', { name: 'Retry', exact: true }).click(); await t.page.getByText('Parcel found', { exact: true }).waitFor(); cases++; await t.context.close();
  }
  {
    const t = await setup(); await t.page.goto(base + '/parcel-trace?parcel_id=' + parcelId + '&dispute_id=' + disputeId + '&method=barcode');
    await t.page.getByRole('heading', { name: 'Tracking number check' }).waitFor();
    assert.ok(t.requests.filter((item) => item.path.endsWith('/barcodes')).every((item) => item.query.dispute_id === disputeId));
    await t.page.getByRole('button', { name: 'Scan another parcel' }).click(); await t.page.locator('#trace-tracking').waitFor();
    assert.equal(await t.page.locator('.trace-workspace').count(), 0); cases++; await t.context.close();
  }
  for (const role of ['RESIDENT','SUPER_ADMIN']) {
    const t = await setup(role); await t.page.goto(base + '/parcel-trace'); await t.page.waitForURL((url) => url.pathname !== '/parcel-trace');
    assert.equal(t.requests.filter((item) => item.path.includes('/parcel-trace')).length, 0); cases++; await t.context.close();
  }
  console.log('Parcel Trace: ' + cases + ' focused scenarios passed across desktop, tablet and mobile. Intercepted fixtures; no live writes.');
} finally { await browser.close(); }
