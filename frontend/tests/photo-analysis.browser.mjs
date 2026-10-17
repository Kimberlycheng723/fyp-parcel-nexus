import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5180';
const parcelId = '11111111-1111-4111-8111-111111111111', collectionId = '22222222-2222-4222-8222-222222222222', disputeId = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-10-13T04:00:00Z';
let cases = 0;
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function setup(role = 'GUARD', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const user = { user_id: '77777777-7777-4777-8777-777777777777', role, first_name: 'John', last_name: 'Tan', status: 'ACTIVE' };
  const token = `test.${Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url')}.test`;
  await context.addInitScript((token) => {
    localStorage.setItem('parcel_nexus_access_token', token);
    window.__analysisWorkers = []; const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); const entry = { url: String(args[0]), terminated: false }; window.__analysisWorkers.push(entry); const original = this.terminate.bind(this); this.terminate = () => { entry.terminated = true; return original(); }; }
    };
    window.__imageUrls = new Set(); const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const value = create(blob); window.__imageUrls.add(value); return value; };
    URL.revokeObjectURL = (value) => { window.__imageUrls.delete(value); return revoke(value); };
  }, token);
  const requests = [], external = [], errors = [];
  page.on('request', (req) => { if (new URL(req.url()).origin !== new URL(base).origin && !req.url().includes('/api/')) external.push(req.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0,0,1600,1000); ctx.fillStyle = '#ac794c'; ctx.fillRect(140,100,1300,800);
    ctx.fillStyle = '#fff'; ctx.fillRect(310,250,980,400); ctx.fillStyle = '#111'; ctx.font = 'bold 90px monospace'; ctx.fillText('SPX12345678',400,420);
    let random = 42; for (let i = 0; i < 90; i++) { random = (random * 1664525 + 1013904223) >>> 0; const x = 240 + random % 1100; random = (random * 1664525 + 1013904223) >>> 0; const y = 700 + random % 100; ctx.fillRect(x,y,15,15); }
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const hash = createHash('sha256').update(image).digest('hex');
  const blankImage = Buffer.from(await page.evaluate(() => { const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=480; const ctx=canvas.getContext('2d'); ctx.fillStyle='#0d5b93';ctx.fillRect(0,0,640,480); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
  const state = { blankPhotos: new Set(), registrationCount: 0, count: 3, fail: new Set(), imageError: 0, referenceError: 0, referencePresent: true, photoDelay: 0, collectionStatus: 'COMPLETED', originalHash: hash };
  const evidence = () => Array.from({ length: state.count }, (_, index) => ({ evidence_id: `55555555-5555-4555-8555-${String(index + 1).padStart(12,'0')}`, parcel_id: `66666666-6666-4666-8666-${String(index + 1).padStart(12,'0')}`,
    tracking_number: index ? `OTHER-${index}` : 'SPX12345678', courier_name: 'Shopee Express', parcel_room_name: 'Tower B Room', barcode_status: index ? 'MISMATCHED' : 'MATCHED', matching_tracking_attempt: index === 0, photo_present: true, photo_uploaded_at: stamp }));
  const parcel = { parcel_id: parcelId, tracking_number: 'SPX12345678', courier_name: 'Shopee Express', status: 'PENDING_COLLECTION', unit_reference: 'A-12-03', parcel_room_name: 'Lobby Room', created_at: stamp, collected_at: null };
  await context.route('**/socket.io/**', (route) => route.abort());
  await context.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push({ path, method: request.method(), query: Object.fromEntries(url.searchParams), auth: request.headers().authorization });
    if (path === '/api/auth/me') return fulfill(route, { user });
    if (path === '/api/notifications/unread-count') return fulfill(route, { unread_count: 0 });
    if (!path.startsWith('/api/parcel-trace')) return fulfill(route, {});
    assert.ok(['ADMIN','GUARD'].includes(role)); assert.ok(request.headers().authorization?.startsWith('Bearer ')); assert.equal(request.method(), 'GET', 'Analysis must never mutate workflows or evidence');
    if (path.endsWith('/registration-photo')) return state.referenceError ? fulfill(route, { message: 'Registration photo unavailable.' }, state.referenceError) : route.fulfill({ contentType: 'image/png', body: image });
    if (path.endsWith('/photo')) {
      await new Promise((resolve) => setTimeout(resolve, state.photoDelay));
      const id = path.split('/').at(-2);
      if (state.imageError || state.fail.has(id)) return fulfill(route, { message: 'Collection photo unavailable.' }, state.imageError || 404);
      return route.fulfill({ contentType: 'image/png', body: state.blankPhotos.has(id) ? blankImage : image });
    }
    if (path.endsWith('/registration-photos')) return fulfill(route, { photos: Array.from({ length: state.registrationCount }, (_, index) => ({
      photo_source: 'REGISTRATION', created_at: stamp, unit_reference: 'B-07-02', parcel_status: 'PENDING_COLLECTION',
      evidence: { evidence_id: '66666666-6666-4666-8666-' + String(index + 1).padStart(12,'0'), parcel_id: '66666666-6666-4666-8666-' + String(index + 1).padStart(12,'0'), photo_source: 'REGISTRATION', tracking_number: 'REGISTERED-' + index, photo_present: true, photo_uploaded_at: stamp }
    })), pagination: { page: 1, total: state.registrationCount, total_pages: state.registrationCount ? 1 : 0 } });
    if (path.endsWith('/barcodes')) return fulfill(route, { attempts: [{ attempt_id: 'a', scanned_tracking_number: 'SPX12345678', registered_tracking_number: 'OTHER-1', result: 'MISMATCHED', created_at: stamp, unit_reference: 'B-07-02', verification_status: 'CANCELLED', exact_tracking_match: true, target_parcel_attempt: false }], pagination: { page: 1, total: 1, total_pages: 1 } });
    if (path.endsWith('/timeline')) return fulfill(route, { events: [], pagination: { page: 1, total: 0, total_pages: 0 } });
    if (path.endsWith('/collections')) return fulfill(route, { collections: [{ collection_id: collectionId, verification_status: state.collectionStatus, collection_status: state.collectionStatus === 'COMPLETED' ? 'USED' : 'CANCELLED', unit_reference: 'B-07-02', parcel_count: state.count, created_at: stamp, collected_at: state.collectionStatus === 'COMPLETED' ? stamp : null,
      matching_attempt: true, evidence_count: state.count, evidence: evidence().slice(0,3), reason: 'Matching tracking-number attempt recorded; requires review' }], pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } });
    if (path.endsWith('/evidence')) return fulfill(route, { evidence: evidence(), pagination: { page: Number(url.searchParams.get('page')), limit: 20, total: state.count, total_pages: 1 } });
    return fulfill(route, { parcel: { ...parcel, registration_photo_present: state.referencePresent }, dispute: null, investigation: null, related_disputes: [], related_disputes_pagination: { total: 0 }, allowed_transitions: [] });
  });
  return { page, context, requests, errors, external, state, image, evidence, hash, parcel };
}
async function waitBatch(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('.photo-search-actions .primary-button');
    return button && !button.disabled && !/Cancel Search|Stopping/.test(button.textContent) && window.__analysisWorkers.every((item) => item.terminated);
  });
  assert.equal(await page.locator('.photo-search-progress[data-phase=READY]').count(), 0);
  assert.equal(await page.getByText('Search complete', { exact: true }).count(), 0);
}
async function capture(page, width) {
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('img', { name: 'Registration photo', exact: true }).waitFor();
  await page.getByRole('img', { name: 'Collection photo', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.photo-match-thumbnail img')].every((img) => img.complete && img.naturalWidth > 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `/private/tmp/parcel-nexus-photo-comparison-${width}.png`, fullPage: true });
}
try {
  for (const width of [1440,834,390]) {
    const t = await setup(width === 834 ? 'ADMIN' : 'GUARD', width);
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    await t.page.waitForFunction(() => { const button = document.querySelector('.photo-search-actions .primary-button'); return button && !button.disabled; });
    const search = t.page.locator('.parcel-photo-search'), action = search.locator('.photo-search-actions .primary-button');
    assert.equal(await search.locator('img').count(), 0);
    assert.equal(await search.locator('.photo-search-reference').count(), 0);
    assert.equal(await search.getByLabel('Start date', { exact: true }).isVisible(), true); cases++;
    t.state.photoDelay = 1000;
    await action.click();
    const progress = search.locator('.photo-search-progress');
    await progress.getByText('3 photos left in this group', { exact: true }).waitFor();
    assert.equal(await action.innerText(), 'Cancel Search');
    assert.equal(await search.locator('.photo-search-actions button').count(), 1);
    assert.equal(await progress.locator('details, dl').count(), 0);
    await progress.screenshot({ path: `/private/tmp/parcel-nexus-photo-progress-${width}.png` });
    await progress.getByText('2 photos left in this group', { exact: true }).waitFor();
    await progress.getByText('1 photo left in this group', { exact: true }).waitFor();
    await waitBatch(t.page); cases++;
    await search.getByRole('heading', { name: 'Closest match', exact: true }).waitFor();
    assert.equal(await search.locator('.photo-match-row').count(), 2);
    assert.equal(await search.getByText('Filter and sort results', { exact: true }).count(), 0);
    assert.equal(await search.getByRole('button', { name: 'Analysis Details', exact: true }).count(), 0);
    assert.equal(await search.locator('.photo-match-details').getAttribute('open'), null);
    await search.locator('.photo-selected-comparison .photo-similarity').getByText('100% photo similarity', { exact: true }).waitFor();
    assert.equal(await search.locator('.photo-clear-results').isVisible(), true);
    assert.equal(await search.locator('.photo-search-actions').getByRole('button', { name: 'Clear Results' }).count(), 0); cases++;
    await search.locator('.photo-match-details > summary').click();
    assert.equal(await search.getByText('Hide details', { exact: true }).isVisible(), true);
    assert.equal(await search.locator('.photo-score-check meter').count(), 3);
    assert.equal(await search.locator('.photo-score-check').count(), 3);
    assert.equal(await search.locator('.photo-match-record, .photo-findings, .photo-review-signals').count(), 0);
    assert.equal(await search.locator('.photo-match-row-copy').count(), 0);
    assert.equal(await search.locator('.photo-match-row h4, .photo-match-row p, .photo-match-row small').count(), 0);
    assert.deepEqual(await search.locator('.photo-match-row').first().evaluate((element) => [...element.children].map((child) => child.className || child.tagName)), ['photo-match-thumbnail', 'photo-similarity high', 'trace-link']);
    assert.doesNotMatch(await search.innerText(), /\b(OCR|ORB|RANSAC|GrabCut|inliers|metadata|segmentation|histogram|weighting|session)\b/i);
    assert.equal(await t.page.locator('.trace-collection-browser').count(), 0);
    await search.locator('.photo-match-details > summary').click(); cases++;
    if (width === 390) assert.ok(await search.locator('.photo-match-lead').evaluate((element) => element.clientWidth) >= 180);
    await capture(t.page, width);
    await search.getByRole('button', { name: 'Enlarge Collection photo' }).click();
    await t.page.getByRole('dialog').getByRole('slider').fill('2');
    await t.page.getByRole('button', { name: 'Close preview' }).click(); cases++;
    const row = search.locator('.photo-match-row').first();
    await row.getByRole('button', { name: /Compare photo/ }).click();
    await search.getByRole('heading', { name: 'Photo comparison', exact: true }).waitFor();
    assert.equal(await search.locator('.photo-match-details').getAttribute('open'), null);
    await search.locator('.photo-match-details > summary').click();
    await search.getByRole('heading', { name: 'Why these photos scored 100%', exact: true }).waitFor(); cases++;
    assert.ok(t.requests.filter((item) => item.path.startsWith('/api/parcel-trace')).every((item) => item.method === 'GET'));
    assert.equal(createHash('sha256').update(t.image).digest('hex'), t.hash);
    assert.deepEqual(t.errors, []); assert.deepEqual(t.external, []); cases++;
    await search.getByRole('button', { name: 'Clear Results', exact: true }).click();
    assert.equal(await search.locator('.photo-match-row, .photo-selected-comparison').count(), 0);
    assert.equal(await action.innerText(), 'Search Similar Photos');
    await t.page.waitForFunction(() => window.__imageUrls.size === 1);
    await t.page.evaluate(() => { history.pushState({}, '', '/profile'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await t.page.waitForFunction(() => window.__imageUrls.size === 0); cases++;
    await t.context.close();
  }
  {
    const t = await setup('GUARD'); t.state.photoDelay = 1500;
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    await t.page.getByRole('button', { name: 'Search Similar Photos' }).click();
    await t.page.getByText('3 photos left in this group', { exact: true }).waitFor();
    await t.page.getByRole('button', { name: 'Cancel Search' }).click();
    await t.page.getByText('Search paused', { exact: true }).waitFor();
    assert.equal(await t.page.locator('.photo-match-row').count(), 0);
    await t.page.getByRole('button', { name: 'Continue Search' }).click(); await waitBatch(t.page);
    await t.page.getByRole('heading', { name: 'Closest match', exact: true }).waitFor();
    assert.equal(await t.page.locator('.photo-match-row').count(), 2);
    assert.equal(await t.page.locator('.photo-search-actions button').count(), 1); cases++;
    await t.context.close();
  }
  {
    const t = await setup('GUARD'); t.state.count = 12; t.state.photoDelay = 600;
    for (let i = 2; i <= 10; i++) t.state.fail.add(t.evidence()[i].evidence_id);
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    await t.page.getByRole('button', { name: 'Search Similar Photos' }).click();
    await t.page.getByText('9 photos left in this group', { exact: true }).waitFor();
    await t.page.getByRole('button', { name: 'Cancel Search' }).click();
    await t.page.getByText('Search paused', { exact: true }).waitFor();
    await t.page.getByRole('heading', { name: 'Closest match', exact: true }).waitFor();
    await t.page.getByRole('button', { name: 'Continue Search' }).click(); await waitBatch(t.page);
    await t.page.getByRole('button', { name: 'Continue Search' }).click(); await waitBatch(t.page);
    await t.page.getByRole('heading', { name: 'Closest match', exact: true }).waitFor();
    assert.equal(await t.page.locator('.photo-match-row').count(), 10);
    assert.equal(await t.page.locator('.photo-match-row').getByText('No score available', { exact: true }).count(), 8);
    await t.page.getByRole('button', { name: 'Next matches', exact: true }).click();
    assert.equal(await t.page.locator('.photo-match-row').count(), 1);
    assert.equal(await t.page.locator('.photo-match-row').getByText('No score available', { exact: true }).count(), 1);
    assert.equal(await t.page.getByRole('button', { name: 'Continue Search' }).count(), 0); cases++;
    await t.page.locator('.photo-match-row').getByRole('button', { name: /Compare photo/ }).click();
    await t.page.locator('.photo-match-details > summary').click();
    assert.equal(await t.page.locator('.photo-score-check.unavailable').count(), 3);
    assert.equal(await t.page.locator('.photo-score-check meter').count(), 0);
    assert.equal(await t.page.getByText('Cannot compare', { exact: true }).count(), 3); cases++;
    t.state.collectionStatus = 'CANCELLED'; t.state.count = 1; t.state.fail.clear();
    await t.page.getByLabel('Collection status').selectOption('CANCELLED');
    await t.page.getByRole('button', { name: 'Search Similar Photos' }).click(); await waitBatch(t.page);
    await t.page.getByText('This collection was not confirmed.', { exact: true }).waitFor(); cases++;
    t.state.imageError = 403; await t.page.getByLabel('Collection status').selectOption('');
    await t.page.getByRole('button', { name: 'Search Similar Photos' }).click();
    await t.page.getByRole('alert').getByText(/You no longer have access/).waitFor();
    assert.equal(await t.page.locator('.photo-match-row, .photo-selected-comparison').count(), 0); cases++;
    await t.context.close();
  }
  for (const status of [404,403]) {
    const t = await setup('GUARD'); t.state.referenceError = status;
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    if (status === 404) await t.page.getByRole('button', { name: 'Upload Reference Photo', exact: true }).waitFor();
    else await t.page.locator('.parcel-photo-search').getByRole('alert').getByText(/You do not have access/).waitFor();
    assert.equal(await t.page.getByRole('button', { name: 'Search Similar Photos' }).isDisabled(), true);
    assert.equal(await t.page.evaluate(() => window.__analysisWorkers.length), 0); cases++;
    await t.context.close();
  }
  for (const [role,width] of [['ADMIN',1440],['GUARD',390]]) {
    const t = await setup(role,width); t.state.referencePresent = false; t.state.count = 1;
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    const search = t.page.locator('.parcel-photo-search');
    await search.getByRole('button', { name: 'Upload Reference Photo', exact: true }).waitFor();
    const input = search.getByLabel('Reference photo', { exact: true });
    await input.setInputFiles({ name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not an image') });
    await search.getByRole('alert').getByText('Choose a JPG, PNG, or WebP image.').waitFor();
    await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(20*1024*1024+1) });
    await search.getByRole('alert').getByText('Choose a non-empty image no larger than 20 MB.').waitFor();
    await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await search.getByRole('alert').getByText(/This image could not be opened/).waitFor(); cases++;
    await input.setInputFiles({ name: 'courier-delivery.png', mimeType: 'image/png', buffer: t.image });
    await search.getByText('courier-delivery.png', { exact: true }).waitFor();
    await search.getByRole('button', { name: 'Search Similar Photos' }).click(); await waitBatch(t.page);
    await t.page.getByRole('img', { name: 'Reference photo', exact: true }).waitFor();
    await t.page.getByRole('img', { name: 'Collection photo', exact: true }).waitFor();
    assert.equal(await search.locator('.photo-match-row').count(), 0);
    assert.equal(t.requests.filter((item) => item.path.endsWith('/registration-photo')).length,0); cases++;
    await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: t.image });
    await search.getByText('replacement.png', { exact: true }).waitFor();
    assert.equal(await search.locator('.photo-selected-comparison').count(),0);
    await search.getByRole('button', { name: 'Remove Reference Photo' }).click();
    await search.getByRole('button', { name: 'Upload Reference Photo', exact:true }).waitFor();
    await t.page.waitForFunction(() => window.__imageUrls.size === 0); cases++;
    assert.deepEqual(t.errors,[]); await t.context.close();
  }
  {
    const t = await setup('GUARD'); t.state.count = 0; t.state.registrationCount = 1;
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    await t.page.getByLabel('Photo source', { exact:true }).selectOption('REGISTRATION');
    await t.page.getByRole('button', { name:'Search Similar Photos' }).click(); await waitBatch(t.page);
    await t.page.getByRole('img', { name:'Another registration photo',exact:true }).waitFor();
    await t.page.getByText('Taken when a parcel was registered. This does not tell us who collected it or where it is now.', { exact:true }).waitFor();
    assert.equal(t.requests.filter((item) => item.path.endsWith('/collections')).length,0); cases++;
    await t.page.getByLabel('Photo source', { exact:true }).selectOption('COLLECTION');
    await t.page.getByRole('button', { name:'Search Similar Photos' }).click(); await waitBatch(t.page);
    await t.page.getByText(/No other parcel photos found for these dates/).waitFor(); cases++;
    await t.context.close();
  }
  for (const role of ['RESIDENT','SUPER_ADMIN']) {
    const t = await setup(role); await t.page.goto(`${base}/parcel-trace`);
    await t.page.waitForURL((url) => url.pathname !== '/parcel-trace');
    assert.equal(await t.page.evaluate(() => window.__analysisWorkers.length),0);
    assert.equal(t.requests.filter((item) => item.path.startsWith('/api/parcel-trace')).length,0); cases++;
    await t.context.close();
  }
  for (const width of [1440,390]) {
    const t = await setup('GUARD',width);
    t.state.blankPhotos.add(t.evidence()[0].evidence_id); t.state.blankPhotos.add(t.evidence()[1].evidence_id);
    await t.page.goto(`${base}/parcel-trace?parcel_id=${parcelId}&method=photo`);
    await t.page.getByRole('button', { name:'Search Similar Photos' }).click(); await waitBatch(t.page);
    await t.page.getByRole('heading', { name:'Closest match',exact:true }).waitFor();
    assert.deepEqual(await t.page.locator('.photo-match-row').evaluateAll((rows) => rows.map((row) => row.dataset.evidenceId)),[t.evidence()[0].evidence_id,t.evidence()[1].evidence_id]);
    await t.page.locator('.photo-match-details > summary').click();
    assert.equal(await t.page.locator('.photo-score-check meter').count(), 3);
    await t.page.locator('.photo-match-details > summary').click();
    await t.page.locator('.photo-match-row').first().getByRole('button', { name:/Compare photo/ }).click();
    await t.page.getByRole('heading', { name:'Photo comparison',exact:true }).waitFor();
    await t.page.locator('.photo-match-details > summary').click();
    assert.equal(await t.page.locator('.photo-score-check').count(), 3);
    assert.equal(await t.page.locator('.photo-score-check.unavailable').count(), 2);
    assert.equal(await t.page.locator('.photo-score-check meter').count(), 1);
    assert.equal(await t.page.getByText('Cannot compare', { exact:true }).count(), 2);
    assert.equal(await t.page.locator('.photo-match-record, .photo-findings, .photo-review-signals').count(), 0);
    assert.doesNotMatch(await t.page.locator('.photo-score-breakdown').innerText(), /100% of the overall photo score/);
    assert.equal(await t.page.getByText('Possible photo match for B-07-02', { exact:true }).count(),0);
    assert.equal(await t.page.getByText('Filter and sort results', { exact:true }).count(),0); cases++;
    await capture(t.page,width);
    assert.deepEqual(t.errors,[]); assert.ok(t.requests.every((request)=>request.method==='GET'));
    await t.context.close();
  }
  console.log(`Photo comparison UI: ${cases} focused scenarios passed using real OCR/OpenCV workers and intercepted API fixtures. No live writes.`);
} finally { await browser.close(); }
