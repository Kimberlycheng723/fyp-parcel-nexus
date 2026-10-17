import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [referencePath, candidatePath] = process.argv.slice(2);
if (!referencePath || !candidatePath) throw new Error('Provide local reference and candidate JPEG paths. Images remain local.');
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const reference = await readFile(referencePath), candidate = await readFile(candidatePath);
  await page.route('**/analysis-test/reference', (route) => route.fulfill({ contentType: 'image/jpeg', body: reference }));
  await page.route('**/analysis-test/candidate', (route) => route.fulfill({ contentType: 'image/jpeg', body: candidate }));
  await page.goto(base + '/login');
  const result = await page.evaluate(async () => {
    const { PhotoAnalysisEngine } = await import('/src/services/photoAnalysis.client.js');
    const { visualSimilarity } = await import('/src/utils/visualSimilarity.js');
    const engine = new PhotoAnalysisEngine(new AbortController().signal);
    try {
      await engine.prepare(await (await fetch('/analysis-test/reference')).blob(), 'LOCAL-TEST', { grabCut: false });
      const comparison = await engine.compare(await (await fetch('/analysis-test/candidate')).blob(), 'LOCAL-TEST', { grabCut: false });
      return { score: visualSimilarity(comparison), methods: Object.fromEntries(['ocr','colour','shape','orb'].map((key) => [key, comparison[key].status])) };
    } finally { engine.dispose(); }
  });
  console.log(JSON.stringify({ result, errors }));
  assert.notEqual(result.methods.colour, 'UNAVAILABLE');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
