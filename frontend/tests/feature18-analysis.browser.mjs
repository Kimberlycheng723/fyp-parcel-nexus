import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5180';
const modulePath = `/assets/${(await readdir(new URL('../dist/assets/',import.meta.url))).find(name=>/^photoAnalysis\.client-.*\.js$/.test(name))}`;
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();await page.goto(`${base}/login`);
  const report=await page.evaluate(async(modulePath)=>{
    const {PhotoAnalysisEngine}=await import(modulePath);const engine=new PhotoAnalysisEngine(new AbortController().signal);
    const tracking='SPX18F12345678';
    async function fixture({text=tracking,colour='#ac794c',height=800,angle=0,blur=0,dark=false,obscured=false,offset=0,texture=true}={}) {
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#f8f8f8';ctx.fillRect(0,0,1600,1000);ctx.save();ctx.translate(800,500);ctx.rotate(angle*Math.PI/180);ctx.translate(-800,-500);ctx.filter=`blur(${blur}px)`;
      ctx.fillStyle=colour;ctx.fillRect(140,100,1300,height);ctx.fillStyle='#fff';ctx.fillRect(310,250+offset,980,400);ctx.fillStyle='#111';ctx.font='bold 80px monospace';if(text)ctx.fillText(text,350,420+offset);
      if(texture){let random=42;for(let i=0;i<90;i++){random=(random*1664525+1013904223)>>>0;const x=240+random%1100;random=(random*1664525+1013904223)>>>0;ctx.fillRect(x,700+random%100,15,15);}}
      if(obscured){ctx.fillStyle='#fff';ctx.fillRect(700,330,300,150);}ctx.restore();
      if(dark){ctx.fillStyle='rgba(0,0,0,.8)';ctx.fillRect(0,0,1600,1000);}
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;return blob;
    }
    const reference=await fixture(),started=performance.now();const prepared=await engine.prepare(reference,tracking,{});const initialized=performance.now()-started;
    const cases=[];
    try {
      for(const [name,options] of [['readable',{}],['moved-label',{offset:160}],['rotated-label',{angle:20}],['blurry',{blur:8}],['low-light',{dark:true}],['partially-obscured',{obscured:true}],
        ['ambiguous-characters',{text:'SPXI8FI234S678'}],['no-tracking-number',{text:''}],['different-packaging',{colour:'#2155bd',height:400}],['same-packaging-different-label',{text:'OTHER123456789'}],['low-texture',{text:'',texture:false}]]) {
        const start=performance.now();const result=await engine.compare(await fixture(options),tracking,{});
        cases.push({name,ocr:result.ocr.status,snippets:result.ocr.snippets,colour:result.colour.status,shape:result.shape.status,orb:result.orb.status,matches:result.orb.matches,inliers:result.orb.inliers,ms:Math.round(performance.now()-start)});
      }
      const selected={parcelRegion:{x:.04,y:.02,width:.92,height:.96},grabCut:true,regionSelected:true,skipOcr:true};
      const isolation=await engine.prepare(reference,tracking,selected);const isolated=await engine.compare(reference,tracking,selected);
      const poor=await engine.prepare(reference,tracking,{grabCut:true,regionSelected:false,skipOcr:true});
      const decoded=await createImageBitmap(reference);const canvas=document.createElement('canvas');canvas.width=decoded.width;canvas.height=decoded.height;canvas.getContext('2d').drawImage(decoded,0,0);decoded.close();
      const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
      const exif=Uint8Array.from([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
      const oriented=new Blob([jpeg.slice(0,2),exif,jpeg.slice(2)],{type:'image/jpeg'});
      const orientation=await engine.compare(oriented,tracking,{skipOcr:true});canvas.width=canvas.height=0;
      return {cases,initialized_ms:Math.round(initialized),capabilities:prepared.capabilities,grabCut:isolation.segmentation,isolatedComparison:isolated.segmentation,poorInitialization:poor.segmentation,exif_dimensions:orientation.dimensions};
    } finally {engine.dispose();}
  },modulePath);
  assert.equal(report.cases.find(row=>row.name==='readable').ocr,'EXACT');
  assert.equal(report.cases.find(row=>row.name==='readable').orb,'RELIABLE');
  assert.equal(report.cases.find(row=>row.name==='different-packaging').colour,'DIFFERENT');
  assert.notEqual(report.cases.find(row=>row.name==='same-packaging-different-label').ocr,'EXACT');
  for(const row of report.cases) assert.ok(row.snippets.every(text=>/SPX/i.test(text)), 'Only target-related snippets may escape OCR');
  assert.equal(report.grabCut,'ISOLATED');assert.equal(report.poorInitialization,'REGION_REQUIRED');
  assert.deepEqual(report.exif_dimensions,{width:1000,height:1600});
  const cdp=await page.context().newCDPSession(page),targets=await browser.newBrowserCDPSession();
  report.repeated_analysis=[];
  for(let round=0;round<3;round++){
    await page.evaluate(async(modulePath)=>{
      const {PhotoAnalysisEngine}=await import(modulePath),engine=new PhotoAnalysisEngine(new AbortController().signal);
      const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,400);ctx.fillStyle='#111';ctx.font='40px monospace';ctx.fillText('SPX18F12345678',30,180);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      try{await engine.prepare(blob,'SPX18F12345678',{});await engine.compare(blob,'SPX18F12345678',{});}
      finally{engine.dispose();canvas.width=canvas.height=0;}
    },modulePath);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap=await cdp.send('Runtime.getHeapUsage');
    const workers=(await targets.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker'&&/photoAnalysis|photoOcr|tesseract/.test(target.url));
    assert.equal(workers.length,0);
    report.repeated_analysis.push({round:round+1,main_thread_heap_bytes:heap.usedSize,remaining_analysis_workers:workers.length});
  }
  await cdp.detach();await targets.detach();
  await writeFile('/private/tmp/parcel-nexus-18f-analysis-results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));console.log('Actual browser fixture matrix, GrabCut/manual fallback and EXIF orientation checks passed. Findings are controlled-fixture outcomes, not real-world accuracy benchmarks.');
} finally {await browser.close();}
