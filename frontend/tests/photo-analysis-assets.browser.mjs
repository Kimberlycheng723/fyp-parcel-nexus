import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5180';
const modulePath = `/assets/${(await readdir(new URL('../dist/assets/',import.meta.url))).find(name=>/^photoAnalysis\.client-.*\.js$/.test(name))}`;
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const context = await browser.newContext({serviceWorkers:'block'}), page = await context.newPage();
  await context.addInitScript(()=>{
    window.__workers=[]; const Native=Worker;
    window.Worker=class extends Native {constructor(...args){super(...args);const entry={url:String(args[0]),terminated:false};window.__workers.push(entry);const stop=this.terminate.bind(this);this.terminate=()=>{entry.terminated=true;stop();};}};
    const original=setTimeout;window.setTimeout=(callback,delay,...args)=>original(callback,delay===45000?1500:delay,...args);
  });
  await context.route('**/image-analysis/tesseract/lang/**',route=>route.abort());
  await page.goto(`${base}/login`);
  const result=await page.evaluate(async(modulePath)=>{
    const {PhotoAnalysisEngine}=await import(modulePath), engine=new PhotoAnalysisEngine(new AbortController().signal);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=100;canvas.getContext('2d').fillRect(10,10,80,80);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    try {return await engine.prepare(blob,'SPX18F12345678',{});}
    finally {engine.dispose();canvas.width=canvas.height=0;}
  },modulePath);
  assert.equal(result.referenceOcr.status,'UNAVAILABLE');
  const workers=await page.evaluate(()=>window.__workers);console.log(JSON.stringify({missing_language_assets:true,workers}));
  assert.ok(workers.every(worker=>worker.terminated),'Missing OCR assets must not leave a native worker alive after disposal');
  const cdp=await browser.newBrowserCDPSession();
  const remaining=(await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&/photoAnalysis|photoOcr|tesseract/.test(target.url));
  assert.equal(remaining.length,0,'Owned OCR host and native child targets must be gone');
  console.log('Actual missing-language-asset fallback and native-worker disposal passed (accelerated deadline, not a real 45-second measurement).');
  await context.close();
  const cancelledContext=await browser.newContext({serviceWorkers:'block'}),cancelledPage=await cancelledContext.newPage();
  await cancelledContext.route('**/image-analysis/tesseract/lang/**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1500));await route.abort().catch(()=>{});
  });
  await cancelledPage.goto(`${base}/login`);
  const downloading=cancelledPage.waitForRequest(request=>request.url().includes('/tesseract/lang/'));
  const preparation=cancelledPage.evaluate(async(modulePath)=>{
    const {PhotoAnalysisEngine}=await import(modulePath);window.__cancelController=new AbortController();
    const engine=new PhotoAnalysisEngine(window.__cancelController.signal),canvas=document.createElement('canvas');canvas.width=canvas.height=100;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    try {await engine.prepare(blob,'SPX18F12345678',{});return false;}
    catch(error){return error.name==='AbortError';}
    finally{engine.dispose();canvas.width=canvas.height=0;}
  },modulePath);
  await downloading;await cancelledPage.evaluate(()=>window.__cancelController.abort());assert.equal(await preparation,true);
  assert.equal((await cdp.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&/photoAnalysis|photoOcr|tesseract/.test(target.url)).length,0);
  console.log('Actual cancellation during language initialization leaves no owned host/child worker targets.');
  await cancelledContext.close();await cdp.detach();
} finally {await browser.close();}
