import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const analysisModule = process.env.PARCEL_NEXUS_ANALYSIS_MODULE || '/src/services/photoAnalysis.client.js';
try {
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  const requests = [], errors = [];
  page.on('request', (req) => requests.push(req.url())); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/login`); await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.ok(!requests.some((url) => /tesseract|photoAnalysis.worker|opencv/i.test(url)), 'Unrelated page must not load analysis runtime');
  const result = await page.evaluate(async (modulePath) => {
    const { PhotoAnalysisEngine } = await import(modulePath);
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0,0,1600,1000);
    ctx.fillStyle = '#ac794c'; ctx.fillRect(140,100,1300,800);
    ctx.fillStyle = '#fff'; ctx.fillRect(310,250,980,400); ctx.fillStyle = '#111'; ctx.font = 'bold 90px monospace'; ctx.fillText('SPX12345678',400,420);
    let random = 42;
    for (let i = 0; i < 90; i++) { random = (random * 1664525 + 1013904223) >>> 0; const x = 240 + random % 1100; random = (random * 1664525 + 1013904223) >>> 0; const y = 700 + random % 100; ctx.fillRect(x,y,15,15); }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const controller = new AbortController(), engine = new PhotoAnalysisEngine(controller.signal);
    const started = performance.now();
    try {
      const options = { parcelRegion: { x: 0, y: 0, width: 1, height: 1 }, labelRegion: { x: .19, y: .24, width: .63, height: .43 }, grabCut: false, regionSelected: false };
      const reference = await engine.prepare(blob, 'SPX12345678', options);
      const comparison = await engine.compare(blob, 'SPX12345678', options, true);
      let corruptRejected = false;
      try { await engine.compare(new Blob(['broken image'], { type: 'image/png' }), 'SPX12345678', options); } catch { corruptRejected = true; }
      return { reference, comparison: { ...comparison, referencePreview: undefined, candidatePreview: undefined }, elapsed: Math.round(performance.now() - started), previews: Boolean(comparison.referencePreview && comparison.candidatePreview), corruptRejected };
    } finally { engine.dispose(); canvas.width = canvas.height = 0; }
  }, analysisModule);
  console.log(JSON.stringify(result));
  assert.equal(result.reference.referenceOcr.status, 'EXACT'); assert.equal(result.comparison.ocr.status, 'EXACT');
  assert.equal(result.comparison.colour.status, 'SIMILAR'); assert.equal(result.comparison.shape.status, 'CONSISTENT');
  assert.equal(result.comparison.orb.status, 'RELIABLE'); assert.equal(result.previews, true);
  assert.ok(Object.values(result.reference.capabilities).every(Boolean));
  assert.equal(result.corruptRejected, true);
  assert.ok(requests.filter((url) => /tesseract|traineddata|photoAnalysis.worker|opencv/i.test(url)).every((url) => new URL(url).origin === new URL(base).origin), 'Analysis assets must remain same-origin');
  assert.deepEqual(errors, []); console.log('Actual browser OCR/OpenCV runtime, deterministic image comparison, corrupt-image handling and local-only asset checks passed.');
  const failures = await page.evaluate(async (modulePath) => {
    const { PhotoAnalysisEngine } = await import(modulePath);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 200;
    canvas.getContext('2d').fillRect(20, 20, 160, 160);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const options = { grabCut: false, regionSelected: false };
    const initializeFailure = new PhotoAnalysisEngine(new AbortController().signal);
    initializeFailure.initializeOcr = async () => { throw new Error('Injected OCR initialization failure'); };
    let initialization;
    try {
      await initializeFailure.prepare(blob, 'SPX12345678', options);
      initialization = await initializeFailure.compare(blob, 'SPX12345678', options);
    } finally { initializeFailure.dispose(); }
    const timeoutFailure = new PhotoAnalysisEngine(new AbortController().signal);
    timeoutFailure.initializeOcr = () => new Promise(() => {});
    const originalTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 45000 ? 10 : delay, ...args);
    let timeout;
    try { timeout = await timeoutFailure.ocr(blob, 'SPX12345678'); }
    finally { window.setTimeout = originalTimeout; timeoutFailure.dispose(); }
    const visualFailure = new PhotoAnalysisEngine(new AbortController().signal);
    visualFailure.cvWorker.dispatchEvent(new Event('error'));
    let visual;
    try {
      await visualFailure.prepare(blob, 'SPX12345678', { ...options, skipOcr: true });
      visual = await visualFailure.compare(blob, 'SPX12345678', { ...options, skipOcr: true });
    } finally { visualFailure.dispose(); canvas.width = canvas.height = 0; }
    return { initialization: { ocr: initialization.ocr.status, colour: initialization.colour.status }, timeout: timeout.status,
      visual: [visual.colour.status, visual.shape.status, visual.orb.status] };
  }, analysisModule);
  assert.deepEqual(failures.initialization, { ocr: 'UNAVAILABLE', colour: 'SIMILAR' });
  assert.equal(failures.timeout, 'UNAVAILABLE');
  assert.deepEqual(failures.visual, ['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE']);
  assert.deepEqual(errors, []);
  console.log('Injected OCR initialization/accelerated timeout and OpenCV worker-error fallback checks passed; these are fault-path tests, not real network-timeout measurements.');
  await context.close();
} finally { await browser.close(); }
