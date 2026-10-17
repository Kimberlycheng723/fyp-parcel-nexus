import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const database = new URL(process.env.DATABASE_URL || 'http://invalid');
assert.equal(process.env.FEATURE18_LIVE_INTEGRATION, 'true');
assert.equal(database.pathname, '/parcel_nexus_18f', 'Never run against the project database');
assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '55432');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = await mkdtemp('/private/tmp/parcel-nexus-18f-live.');
process.chdir(work);
process.env.JWT_ACCESS_SECRET = 'feature18-live-isolated-secret';
for (const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','GEMINI_API_KEY']) process.env[key] = '';
const administration = new pg.Pool({ connectionString: database.href });
const runDatabase = `parcel_nexus_18f_${Date.now()}_${randomUUID().slice(0,8)}`;
try { await administration.query(`CREATE DATABASE "${runDatabase}"`); }
finally { await administration.end(); }
database.pathname = `/${runDatabase}`; process.env.DATABASE_URL = database.href;
const migrated = spawnSync(process.execPath, [path.join(root,'backend/src/db/migrate.js')], { env:process.env, cwd:work, encoding:'utf8' });
assert.equal(migrated.status,0,migrated.stderr);
console.log('Fresh isolated run database created; full migration chain applied.');
const { pool } = await import('../src/db/pool.js');
const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/realtime/socket.js');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const QRCode = require('qrcode'), { io } = require('socket.io-client');
const server = createServer(app), sockets = initializeSocketServer(server);
const api = 'http://127.0.0.1:5100', frontend = 'http://127.0.0.1:5181';
const results = [], measurements = {}, users = {}, tokens = {}, contexts = [], images = [];
let preview, browser, residentSocket;
const password = 'Feature18_DemoOnly123!';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function check(name, run) {
  const started = performance.now(); await run();
  results.push(name); console.log(`PASS ${name} (${Math.round(performance.now()-started)}ms)`);
}
async function request(role, endpoint, method='GET', body, expected=200, token=tokens[role]) {
  const response = await fetch(`${api}${endpoint}`, { method, signal: AbortSignal.timeout(15000), headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {})
  }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${method} ${endpoint}: ${await response.clone().text()}`);
  return response;
}
async function json(...args) { return (await request(...args)).json(); }
async function photo(role, endpoint, image, method='PUT') {
  const form = new FormData(); form.append('photo', new Blob([image], { type:'image/png' }), 'fixture.png');
  return json(role, endpoint, method, form, method==='POST' ? 201 : 200);
}
async function authenticatedPage(role, width=1440) {
  const context = await browser.newContext({ viewport:{width,height:1000}, serviceWorkers:'block' }); contexts.push(context);
  await context.addInitScript((token) => localStorage.setItem('parcel_nexus_access_token', token), tokens[role]);
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  return { context, page };
}
async function screenshot(page, name, width) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} page overflow at ${width}`);
  await page.screenshot({path:`/private/tmp/parcel-nexus-18f-${name}-${width}.png`,fullPage:true});
}
try {
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(5100,'127.0.0.1',resolve); });
  preview = spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','5181','--strictPort'],
    {cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_PROXY_TARGET:api},stdio:['ignore','pipe','pipe']});
  let previewErrors=''; preview.stderr.on('data', data => { previewErrors += data; });
  for (let i=0;i<100;i++) { if (preview.exitCode !== null) throw new Error(previewErrors); if (await fetch(frontend).then(r=>r.ok).catch(()=>false)) break; await new Promise(r=>setTimeout(r,100)); }
  browser = await chromium.launch({channel:'chrome',headless:true});
  const units = [];
  for (const code of ['18F-A-01','18F-B-02']) units.push((await pool.query("INSERT INTO units(block,floor,unit_number,full_unit_code) VALUES('TEST','18',$1,$2) RETURNING unit_id",[code,code])).rows[0].unit_id);
  for (const role of ['ADMIN','GUARD','RESIDENT','OTHER_RESIDENT','SUPER_ADMIN']) {
    users[role]=(await pool.query(`INSERT INTO users(email,password_hash,first_name,phone_number,role,status,unit_id)
      VALUES($1,$2,$3,'0123456789',$4,'ACTIVE',$5) RETURNING *`,[`${role.toLowerCase()}@feature18.invalid`,await bcrypt.hash(password,10),`Feature18 ${role}`,role.replace('OTHER_',''),role.includes('RESIDENT') ? units[role==='RESIDENT'?0:1] : null])).rows[0];
    await pool.query('UPDATE notification_preferences SET email_enabled=false,browser_push_enabled=false WHERE user_id=$1',[users[role].user_id]);
    const login=await json(null,'/api/auth/login','POST',{email:users[role].email,password}); tokens[role]=login.accessToken;
  }
  const courier=(await pool.query("INSERT INTO courier_companies(courier_name,courier_code,status,created_by) VALUES('18F Courier','18F','ACTIVE',$1) RETURNING courier_id",[users.ADMIN.user_id])).rows[0].courier_id;
  const rooms=[];
  for(const name of ['18F Lobby Room','18F Tower Room']) rooms.push((await json('ADMIN','/api/parcel-rooms','POST',{name},201)).parcel_room);
  const canvasPage=await browser.newPage();
  const image=Buffer.from(await canvasPage.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=1600;canvas.height=1000;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#f8f8f8';ctx.fillRect(0,0,1600,1000);ctx.fillStyle='#ac794c';ctx.fillRect(140,100,1300,800);
    ctx.fillStyle='#fff';ctx.fillRect(310,250,980,400);ctx.fillStyle='#111';ctx.font='bold 80px monospace';ctx.fillText('SPX18F12345678',350,420);
    let random=42;for(let i=0;i<90;i++){random=(random*1664525+1013904223)>>>0;const x=240+random%1100;random=(random*1664525+1013904223)>>>0;ctx.fillRect(x,700+random%100,15,15);}
    return canvas.toDataURL('image/png').split(',')[1];
  }),'base64'); await canvasPage.close();
  const uploadA=await photo('GUARD','/api/parcel-registration/photos',image,'POST');
  const register=async (items) => (await json('GUARD','/api/parcel-registration/sessions','POST',{courier_id:courier,delivery_person_contact:'0123456789',parcels:items},201)).parcels;
  let parcels;
  await check('real login, multi-room registration, arrival notifications and audit attribution', async()=>{
    parcels=await register([0,1].map(i=>({tracking_number:i?'SPX18FSECOND123':'SPX18F12345678',unit_id:units[0],parcel_room_id:rooms[i].id,parcel_photo_url:uploadA.parcel_photo_url})));
    assert.equal(parcels.length,2);
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM audit_logs WHERE action='Login'")).rows[0].count,4,'Super Admin excluded');
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM audit_logs WHERE action='Parcel Registered' AND actor_user_id=$1",[users.GUARD.user_id])).rows[0].count,2);
    assert.equal((await pool.query('SELECT COUNT(*)::int count FROM notifications WHERE recipient_user_id=$1',[users.RESIDENT.user_id])).rows[0].count,2);
  });
  await check('registration-photo authentication, unit ownership, preview access, path safety and no-store', async()=>{
    for(const role of ['ADMIN','GUARD','RESIDENT']) {const res=await request(role,uploadA.parcel_photo_url); assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(digest(Buffer.from(await res.arrayBuffer())),digest(image));}
    await request(null,uploadA.parcel_photo_url,'GET',undefined,401);
    await request('OTHER_RESIDENT',uploadA.parcel_photo_url,'GET',undefined,404);
    await request('SUPER_ADMIN',uploadA.parcel_photo_url,'GET',undefined,403);
    await request('RESIDENT','/uploads/parcels/..%2F.env','GET',undefined,404);
    for(const bad of ['invalid',jwt.sign({sub:users.ADMIN.user_id},process.env.JWT_ACCESS_SECRET,{expiresIn:-1})]) await request(null,uploadA.parcel_photo_url,'GET',undefined,401,bad);
    const unlinked=await photo('GUARD','/api/parcel-registration/photos',image,'POST');await request('GUARD',unlinked.parcel_photo_url);await request('RESIDENT',unlinked.parcel_photo_url,'GET',undefined,404);
  });
  const resident=await authenticatedPage('RESIDENT'),guard=await authenticatedPage('GUARD');
  await check('existing Resident and Guard parcel photo displays use authenticated Blob reads',async()=>{
    await resident.page.goto(`${frontend}/dashboard`);
    await resident.page.getByRole('button',{name:'View parcel SPX18F12345678',exact:true}).click();
    const detail=resident.page.getByRole('dialog',{name:'Parcel details'});
    await detail.getByRole('img',{name:'Parcel',exact:true}).waitFor();
    assert.ok((await detail.getByRole('img',{name:'Parcel',exact:true}).getAttribute('src')).startsWith('blob:'));
    await detail.getByRole('button',{name:'Close details'}).click();
    await guard.page.goto(`${frontend}/parcels`);
    const row=guard.page.locator('tr').filter({hasText:'SPX18F12345678'});
    await row.getByRole('button',{name:/View/}).click();
    await guard.page.getByRole('dialog',{name:'Parcel details'}).getByRole('img',{name:'Parcel',exact:true}).waitFor();
    await guard.page.getByRole('button',{name:'Close details'}).click();
    await row.getByRole('button',{name:/Edit/}).click();
    await guard.page.getByRole('dialog',{name:'Edit parcel'}).getByRole('img',{name:'Parcel preview'}).waitFor();
    await guard.page.keyboard.press('Escape');
  });
  let qr,session;
  residentSocket=io(api,{auth:{token:tokens.RESIDENT},transports:['websocket']});
  await new Promise((resolve,reject)=>{residentSocket.once('connect',resolve);residentSocket.once('connect_error',reject);});
  const startedEvent=new Promise(resolve=>residentSocket.once('collection:verification-started',resolve));
  await check('two independent browsers: Resident generates QR and actual ZXing Guard scan starts verification',async()=>{
    await resident.page.goto(`${frontend}/dashboard`);
    await resident.page.getByRole('button',{name:'Select parcel',exact:true}).first().click();await resident.page.getByRole('button',{name:'Select parcel',exact:true}).first().click();
    const response=resident.page.waitForResponse(r=>r.url().endsWith('/api/resident/collections')&&r.request().method()==='POST');
    await resident.page.getByRole('button',{name:'Generate QR Code',exact:true}).click();qr=(await (await response).json()).collection;
    assert.equal(qr.expires_in_seconds,120);await resident.page.getByRole('img',{name:'Secure parcel collection QR code'}).waitFor();
    const qrImage=await QRCode.toDataURL(qr.token,{scale:8,margin:4});
    await guard.context.addInitScript((qrImage)=>{
      navigator.mediaDevices.getUserMedia=async()=>{const picture=new Image();picture.src=qrImage;await picture.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
        const ctx=canvas.getContext('2d');const paint=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.imageSmoothingEnabled=false;ctx.drawImage(picture,(640-picture.width)/2,(480-picture.height)/2);};paint();const stream=canvas.captureStream(10),timer=setInterval(paint,100);
        for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};}return stream;};
    },qrImage);
    await guard.page.goto(`${frontend}/verify-collection`);
    try {await guard.page.getByRole('heading',{name:'Verification Started',exact:true}).waitFor();}
    catch(error){
      console.error('Guard synthetic-camera failure state:',await guard.page.locator('body').innerText());
      console.error('Isolated collection states:',(await pool.query('SELECT collection_status FROM parcel_collections')).rows);
      await guard.page.screenshot({path:'/private/tmp/parcel-nexus-18f-guard-scan-failure.png',fullPage:true});throw error;
    }
    session=(await json('RESIDENT','/api/resident/collection-verifications/active')).verification_sessions[0];
    assert.equal(session.parcel_count,2);assert.equal(Math.floor((new Date(session.expires_at)-new Date(session.created_at))/1000),900);
    await Promise.race([startedEvent,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Live started socket event missing')),5000))]);
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM parcels WHERE status='COLLECTED'")).rows[0].count,0);
    await resident.page.locator('.collection-verification-parcel').first().waitFor();
  });
  await check('real multi-parcel UI barcode/photo gating, Guard progress and refresh recovery',async()=>{
    const cards=resident.page.locator('.collection-verification-parcel');
    assert.equal(await cards.count(),2);
    for(let i=0;i<2;i++){
      const card=cards.nth(i);await card.getByRole('button',{name:'Enter tracking number',exact:true}).click();
      const tracking=session.parcels[i].registered_tracking_number;
      await card.getByLabel('Tracking number on the shipping label').fill(tracking);await card.getByRole('button',{name:'Verify',exact:true}).click();
      await card.getByText('Barcode: Verified',{exact:true}).waitFor();
      assert.equal(await resident.page.getByRole('button',{name:'Confirm Collection',exact:true}).isDisabled(),true);
      await card.getByLabel('Choose parcel photo').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:image});
      await card.getByRole('button',{name:'Use & Upload Photo',exact:true}).click();await card.getByText('Collection photo uploaded',{exact:true}).waitFor();
    }
    await guard.page.getByText('Awaiting Resident Confirmation',{exact:true}).waitFor();
    await guard.page.reload();await guard.page.getByText('Awaiting Resident Confirmation',{exact:true}).waitFor();
    assert.equal((await json('GUARD',`/api/collection-verifications/${session.session_id}`)).verification_session.expires_at,session.expires_at);
  });
  const completedEvent=new Promise(resolve=>residentSocket.once('collection:completed',resolve));
  await check('Resident-only atomic UI confirmation, database completion, audit and live Socket.IO',async()=>{
    for(const role of ['GUARD','ADMIN','SUPER_ADMIN']) await request(role,`/api/collection-verifications/${session.session_id}/confirm`,'POST',{},403);
    await request('OTHER_RESIDENT',`/api/collection-verifications/${session.session_id}/confirm`,'POST',{},404);
    await resident.page.getByRole('button',{name:'Confirm Collection',exact:true}).click();await resident.page.getByRole('heading',{name:'Collection Confirmed',exact:true}).waitFor();
    await guard.page.getByRole('heading',{name:'Collection Completed',exact:true}).waitFor();
    await Promise.race([completedEvent,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Live completed socket event missing')),5000))]);
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id=ANY($1::uuid[]) AND status='COLLECTED'",[parcels.map(p=>p.parcel_id)])).rows[0].count,2);
    const replay=await json('RESIDENT',`/api/collection-verifications/${session.session_id}/confirm`,'POST',{});assert.equal(replay.already_completed,true);
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM audit_logs WHERE action='Resident Confirmed Collection' AND actor_user_id=$1",[users.RESIDENT.user_id])).rows[0].count,1);
  });
  const beforePhoto=(await pool.query('SELECT evidence_id,photo_filename,photo_sha256 FROM collection_verification_evidence WHERE session_id=$1',[session.session_id])).rows;
  const uploadB=await photo('GUARD','/api/parcel-registration/photos',image,'POST');let foreign,foreignSession;
  await check('real cross-unit mismatch, cancelled evidence and multi-batch candidate database fixtures',async()=>{
    foreign=await register(Array.from({length:11},(_,i)=>({tracking_number:`SPX18FOTHER${i}`,unit_id:units[1],parcel_room_id:rooms[0].id,parcel_photo_url:uploadB.parcel_photo_url})));
    const selection=(await json('OTHER_RESIDENT','/api/resident/collections','POST',{parcel_ids:foreign.map(p=>p.parcel_id)},201)).collection;
    foreignSession=(await json('GUARD','/api/guard/collections/verify','POST',{token:selection.token})).verification_session;
    for(const parcel of foreignSession.parcels){await json('OTHER_RESIDENT',`/api/collection-verifications/${foreignSession.session_id}/parcels/${parcel.parcel_id}/barcode`,'POST',{scanned_tracking_number:'SPX18F12345678'});
      await photo('OTHER_RESIDENT',`/api/collection-verifications/${foreignSession.session_id}/parcels/${parcel.parcel_id}/photo`,image);}
    await json('OTHER_RESIDENT',`/api/collection-verifications/${foreignSession.session_id}/cancel`,'POST',{});
    await request('OTHER_RESIDENT',`/api/collection-verifications/${foreignSession.session_id}/confirm`,'POST',{},409);
    const trace=(await json('ADMIN',`/api/parcel-trace/parcels/${parcels[0].parcel_id}/barcodes`)).attempts;
    assert.ok(trace.some(a=>a.result==='MISMATCHED'&&a.verification_status==='CANCELLED'));
    await request('RESIDENT',uploadB.parcel_photo_url,'GET',undefined,404);
  });
  const admin=await authenticatedPage('ADMIN'); const target=`/api/parcel-trace/parcels/${parcels[0].parcel_id}`;
  await check('real authenticated photo search, cancellation/continuation and current evidence unchanged',async()=>{
    const missing=(await pool.query('SELECT photo_filename FROM collection_verification_evidence WHERE evidence_id=$1',[foreignSession.parcels[0].evidence_id])).rows[0].photo_filename;
    const original=path.join(work,'private-uploads/collections',missing),held=`${original}.test-held`;
    await rename(original,held);
    try {
    await admin.page.goto(`${frontend}/parcel-trace?parcel_id=${parcels[0].parcel_id}`);
    await admin.page.getByRole('heading',{name:'Photo Search',exact:true}).waitFor();
    await admin.page.getByLabel('Evidence category').selectOption('');
    const started=performance.now();await admin.page.getByRole('button',{name:'Search Similar Collection Photos',exact:true}).click();
    await admin.page.locator('.photo-analysis-result').first().waitFor();await admin.page.getByRole('button',{name:'Cancel Search',exact:true}).click();
    await admin.page.getByText('Search cancelled. Completed results retained.',{exact:true}).waitFor();
    for(let i=0;i<3&&await admin.page.getByRole('button',{name:'Continue Search',exact:true}).count();i++){
      await admin.page.getByRole('button',{name:'Continue Search',exact:true}).click();await admin.page.getByText(/All discovered candidate photos checked\.|Batch complete\. Further candidates remain\./).waitFor();
    }
    const progress=await admin.page.locator('.photo-search-progress').innerText();assert.match(progress,/Successfully analyzed\s+12/);assert.match(progress,/Failed photos\s+1/);
    assert.ok(await admin.page.locator('.photo-findings dd').filter({hasText:/^Exact Tracking Number Match/}).count());
    measurements.live_photo_search_ms=Math.round(performance.now()-started);
    assert.deepEqual((await pool.query('SELECT evidence_id,photo_filename,photo_sha256 FROM collection_verification_evidence WHERE session_id=$1',[session.session_id])).rows,beforePhoto);
    for(const evidence of beforePhoto) assert.equal(digest(await readFile(path.join(work,'private-uploads/collections',evidence.photo_filename))),evidence.photo_sha256);
    assert.equal(digest(await readFile(path.join(work,uploadA.parcel_photo_url.slice(1)))),digest(image));
    } finally {await rename(held,original);}
  });
  let investigation;
  await check('real investigation UI creation, append-only notes/statuses and dispute independence',async()=>{
    const disputeForm=new FormData();disputeForm.append('parcel_id',parcels[0].parcel_id);disputeForm.append('issue_type','MISSING_ITEM');disputeForm.append('description','Isolated integration investigation; no resident accusation.');
    const dispute=(await json('RESIDENT','/api/disputes','POST',disputeForm,201)).dispute;
    await admin.page.goto(`${frontend}/parcel-trace?parcel_id=${parcels[0].parcel_id}&dispute_id=${dispute.dispute_id}`);
    const created = admin.page.waitForResponse(r=>r.url().includes('/api/parcel-trace/investigations')&&r.request().method()==='POST');
    await admin.page.getByRole('button',{name:'Start Investigation',exact:true}).click();
    assert.equal((await created).status(),201);
    investigation=(await json('ADMIN',`${target}?dispute_id=${dispute.dispute_id}`)).investigation;
    assert.ok(investigation.investigation_id);
    const notes=`/api/parcel-trace/investigations/${investigation.investigation_id}/notes`;
    await json('GUARD',notes,'POST',{content:'Human review remains inconclusive.',observations:['INCONCLUSIVE']},201);
    for(const status of ['UNDER_REVIEW','RESOLVED','UNDER_REVIEW']) await json('ADMIN',`/api/parcel-trace/investigations/${investigation.investigation_id}/status`,'PATCH',{status});
    assert.equal((await pool.query('SELECT status FROM disputes WHERE dispute_id=$1',[dispute.dispute_id])).rows[0].status,'OPEN');
    assert.equal((await json('ADMIN',notes)).notes.length,1);
    await admin.page.reload();await admin.page.getByText('Human review remains inconclusive.',{exact:true}).waitFor();
    await admin.page.getByRole('button',{name:'Return to Dispute',exact:true}).click();
    await admin.page.getByRole('button',{name:'Investigate Parcel',exact:true}).click();
    await admin.page.waitForURL(url=>url.pathname==='/parcel-trace'&&url.searchParams.get('dispute_id')===dispute.dispute_id&&url.searchParams.get('parcel_id')===parcels[0].parcel_id);
    await request('RESIDENT',notes,'POST',{content:'Forbidden'},403);
    await request('GUARD',`${target}?dispute_id=${randomUUID()}`,'GET',undefined,404);
  });
  await check('JWT/role/input security and authenticated cross-unit evidence APIs',async()=>{
    for(const role of ['RESIDENT','OTHER_RESIDENT','SUPER_ADMIN']) await request(role,target,'GET',undefined,403);
    await request(null,target,'GET',undefined,401);
    for(const suffix of ['?limit=10000','?page=-1','?from=2026-02-30']) await request('ADMIN',`${target}/collections${suffix}`,'GET',undefined,400);
    const injection=await json('ADMIN',`/api/parcel-trace/parcels?tracking_number=${encodeURIComponent("' OR 1=1 --")}`);assert.equal(injection.parcels.length,0);
    await request('ADMIN',`${target}/evidence/${randomUUID()}/photo`,'GET',undefined,404);
    const evidence=foreignSession.parcels[0];const res=await request('ADMIN',`${target}/evidence/${evidence.evidence_id}/photo`);assert.equal(res.headers.get('cache-control'),'private, no-store');
    await request('RESIDENT',`${target}/evidence/${evidence.evidence_id}/photo`,'GET',undefined,403);
    await request('GUARD',`/api/parcel-trace/investigations/${investigation.investigation_id}/status`,'PATCH',{status:'FAKE'},409);
  });
  await check('committed database rollback and genuinely concurrent duplicate confirmation',async()=>{
    const more=await register([0,1].map(i=>({tracking_number:`SPX18FCONCURRENT${i}`,unit_id:units[0],parcel_room_id:rooms[i].id})));
    const qr=(await json('RESIDENT','/api/resident/collections','POST',{parcel_ids:more.map(p=>p.parcel_id)},201)).collection;
    const s=(await json('GUARD','/api/guard/collections/verify','POST',{token:qr.token})).verification_session;
    for(const p of s.parcels){await json('RESIDENT',`/api/collection-verifications/${s.session_id}/parcels/${p.parcel_id}/barcode`,'POST',{scanned_tracking_number:p.registered_tracking_number});await photo('RESIDENT',`/api/collection-verifications/${s.session_id}/parcels/${p.parcel_id}/photo`,image);}
    await pool.query("CREATE FUNCTION feature18_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='Collection Completed' THEN RAISE EXCEPTION 'Isolated test fault'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER feature18_audit_fault BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION feature18_fail_audit()');
    try {await request('RESIDENT',`/api/collection-verifications/${s.session_id}/confirm`,'POST',{},500);assert.equal((await pool.query("SELECT COUNT(*)::int count FROM parcels WHERE parcel_id=ANY($1::uuid[]) AND status='COLLECTED'",[more.map(p=>p.parcel_id)])).rows[0].count,0);}
    finally {await pool.query('DROP TRIGGER feature18_audit_fault ON audit_logs');await pool.query('DROP FUNCTION feature18_fail_audit()');}
    const confirmations=await Promise.all([json('RESIDENT',`/api/collection-verifications/${s.session_id}/confirm`,'POST',{}),json('RESIDENT',`/api/collection-verifications/${s.session_id}/confirm`,'POST',{})]);
    assert.equal(confirmations.filter(r=>r.already_completed).length,1);
    assert.equal((await pool.query("SELECT COUNT(*)::int count FROM audit_logs WHERE metadata->>'session_id'=$1 AND action='Collection Completed'",[s.session_id])).rows[0].count,1);
  });
  await check('responsive live-data Resident/Guard/Trace pages at 1440, 834 and 390 pixels',async()=>{
    for(const width of [1440,834,390]){
      await resident.page.setViewportSize({width,height:1000});await screenshot(resident.page,'resident-completed',width);
      await guard.page.setViewportSize({width,height:1000});await screenshot(guard.page,'guard-completed',width);
      await admin.page.setViewportSize({width,height:1000});await screenshot(admin.page,'trace',width);
    }
  });
  await check('actual audit APIs retain operational access and Admin-only filtered CSV',async()=>{
    const logs=await json('ADMIN','/api/audit-logs?limit=100');assert.ok(logs.audit_logs.some(l=>l.action==='Collection Completed'));
    const guardLogs=await json('GUARD','/api/audit-logs?limit=100');const roomConfiguration=['Parcel Room Created','Parcel Room Updated','Parcel Room Activated','Parcel Room Deactivated'];
    assert.ok(guardLogs.audit_logs.every(l=>!l.action.startsWith('Account ')&&!roomConfiguration.includes(l.action)));
    await request('GUARD','/api/audit-logs/export','GET',undefined,403);
    const csv=await (await request('ADMIN','/api/audit-logs/export?actions=Collection%20Completed')).text();assert.ok(csv.includes('Collection Completed'));assert.ok(!csv.includes('password_hash'));
  });
  await check('full migration replay preserves committed collection, evidence, investigation and audit rows',async()=>{
    const hashRows=async()=>{
      const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const hashes={};
      for(const {tablename} of tables) hashes[tablename]=(await pool.query(`SELECT md5(to_jsonb(t)::text) digest FROM "${tablename.replaceAll('"','""')}" t ORDER BY 1`)).rows;
      return hashes;
    };
    const before=await hashRows();
    const replay=spawnSync(process.execPath,[path.join(root,'backend/src/db/migrate.js')],{env:process.env,cwd:work,encoding:'utf8'});assert.equal(replay.status,0,replay.stderr);
    assert.deepEqual(await hashRows(),before);
    measurements.trace_api_ms={};
    for(const suffix of ['barcodes','collections','timeline']){const started=performance.now();await request('ADMIN',`${target}/${suffix}?limit=1`);measurements.trace_api_ms[suffix]=Math.round((performance.now()-started)*100)/100;}
    measurements.registration_photo_bytes=image.length;
  });
  const output={passed:results.length,failed:0,scenarios:results,measurements,real_database:true,real_browser_api:true,simulated_guard_camera:true,physical_devices:false};
  await writeFile('/private/tmp/parcel-nexus-18f-live-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
} finally {
  residentSocket?.disconnect();for(const context of contexts) await context.close();await browser?.close();
  preview?.kill('SIGTERM');if(preview && preview.exitCode===null) await new Promise(resolve=>preview.once('exit',resolve));
  await new Promise(resolve=>sockets.close(resolve));await pool.end();await rm(work,{recursive:true,force:true});
}
