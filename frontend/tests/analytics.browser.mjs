import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyticsBuckets } from '../../backend/src/utils/adminAnalytics.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({channel:'chrome',headless:true});
const base = process.env.PARCEL_NEXUS_TEST_URL || 'http://localhost:5173';
const roomA='11111111-1111-4111-8111-111111111111',roomB='22222222-2222-4222-8222-222222222222';
let cases=0;
async function setup(width=1440,role='ADMIN') {
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',acceptDownloads:true});
  const user={user_id:'33333333-3333-4333-8333-333333333333',role,first_name:'Jamie',last_name:'Tan',status:'ACTIVE'};
  const token='test.'+Buffer.from(JSON.stringify({role,exp:Math.floor(new Date('2026-10-16T04:00:00Z').getTime()/1000)+86400})).toString('base64url')+'.test';
  await context.addInitScript(value=>localStorage.setItem('parcel_nexus_access_token',value),token);
  const state={error:0,empty:false,slow:false,reportError:false},requests=[],errors=[];
  const rooms=[{id:roomA,name:'Parcel Room A',is_active:true},{id:roomB,name:'Parcel Room B',is_active:true}];
  await context.route('**/socket.io/**',route=>route.abort());
  const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,q=Object.fromEntries(url.searchParams);requests.push({path,q,method:req.method()});
    if(path==='/api/auth/me')return fulfill(route,{user});
    if(path==='/api/notifications/unread-count')return fulfill(route,{unread_count:2});
    if(path==='/api/dashboard/admin/analytics/report'){
      if(state.reportError)return fulfill(route,{message:'Report unavailable. Please retry.'},500);
      return route.fulfill({contentType:'application/pdf',headers:{'Content-Disposition':'attachment; filename="gems-selected-report.pdf"'},body:'%PDF-1.4\nTest download; real renderer covered by database tests.\n%%EOF'});
    }
    if(path==='/api/dashboard/admin/analytics'){
      if(state.slow && q.room_id===roomA)await new Promise(resolve=>setTimeout(resolve,450));
      if(state.error)return fulfill(route,{message:'Analytics unavailable. Please retry.'},state.error);
      const empty=state.empty,period=analyticsBuckets(q.from,q.to,q.group);
      const multiplier=q.room_id===roomB?2:1;
      const trend=period.map((row,index)=>({...row,registered:empty?0:(index%7+2)*multiplier,collected:empty?0:index%4}));
      const registered=trend.reduce((sum,row)=>sum+row.registered,0),cohort=Math.floor(registered*.72);
      return fulfill(route,{as_of:'2026-10-16T04:00:00Z',range:{from:q.from,to:q.to,cutoff:q.to+'T04:00:00Z'},group:q.group,rooms,room:{id:q.room_id,name:rooms.find(room=>room.id===q.room_id)?.name||'All Parcel Rooms'},
        parcel_summary:{registered,collected:empty?0:72,cohort_collected:cohort,cohort_uncollected:registered-cohort,collection_rate:registered?Math.round(cohort/registered*1000)/10:null,missing_collection_time:empty?0:2},
        registration_trend:trend,registration_hours:Array.from({length:24},(_,hour)=>({label:String(hour).padStart(2,'0')+':00',registered:empty?0:hour>7&&hour<19?(hour%4+2)*multiplier:0})),
        collection_hours:['00:00-04:00','04:00-08:00','08:00-12:00','12:00-16:00','16:00-20:00','20:00-24:00'].map((label,index)=>({label,count:empty?0:[0,2,9,14,31,16][index]})),
        collection_delay:{average_hours:empty?null:28,samples:empty?0:70,missing_notification:empty?0:2,series:period.map((row,index)=>({...row,average_hours:empty||index%8===0?null:index%3*8+12,samples:empty||index%8===0?0:3}))},
        overdue_duration:['Under 3 days','3-7 days','8-30 days','31-60 days','Over 60 days'].map((label,index)=>({label,count:empty?0:[6,12,8,4,2][index]})),
        dispute_summary:{reported:empty?0:12,resolved:empty?0:8,unresolved:empty?0:4,average_resolution_hours:empty?null:52},
        dispute_issues:['Damaged parcel','Wrong unit / recipient','Missing parcel','Suspected theft'].map((label,index)=>({label,count:empty?0:[5,4,2,1][index]})),
        dispute_resolution:['Under 1 day','1-2 days','3-6 days','7-13 days','14+ days'].map((label,index)=>({label,count:empty?0:[2,3,2,1,0][index]})),
        system_summary:{active_residents:120,active_guards:6,residents_awaiting_activation:3,guards_awaiting_activation:1,active_rooms:2,inactive_rooms:0}});
    }
    return fulfill(route,{});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.clock.setFixedTime(new Date('2026-10-16T04:00:00Z'));
  return{context,page,state,requests,errors};
}
async function ready(page){try{await page.locator('.analytics-content[aria-busy=false]').waitFor();}catch(error){console.error((await page.locator('body').innerText()).slice(0,2500));console.error(await page.evaluate(()=>document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0,3500)));throw error;}}
async function room(page,value){const select=page.getByLabel('Parcel room',{exact:true});if(await select.isVisible())await select.selectOption(value);else await page.getByRole('group',{name:'Analytics parcel room',exact:true}).getByRole('button',{name:value===roomA?'Parcel Room A':value===roomB?'Parcel Room B':'All',exact:true}).click();}
try{
  for(const width of [1440,834,390]){
    const t=await setup(width),{page,state,requests}=t;await page.goto(base+'/analytics');await ready(page);await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.getByLabel('Date range',{exact:true}).inputValue(),'30');
    assert.ok(requests.some(req=>req.q.from==='2026-09-17'&&req.q.to==='2026-10-16'));
    assert.equal(await page.locator('.analytics-panel').count(),10);assert.equal(await page.locator('.analytics-chart').count(),7);assert.equal(await page.getByRole('meter',{name:'Collection rate'}).count(),1);cases++;
    assert.equal(await page.locator('.analytics-panel').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(node).boxShadow.includes('8px 24px'))),true);
    assert.equal(await page.locator('.analytics-panel h2').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(31, 43, 77)')),true);
    assert.equal(await page.getByRole('button',{name:'Generate Report',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(41, 72, 211)');
    assert.equal(await page.getByRole('img',{name:'Parcel collection hours',exact:true}).locator('rect[rx="3"]').first().evaluate(node=>getComputedStyle(node).fill),'rgb(23, 131, 72)');
    assert.equal(await page.getByRole('img',{name:'Overdue parcel duration',exact:true}).locator('rect[rx="3"]').first().evaluate(node=>getComputedStyle(node).fill),'rgb(191, 48, 70)');
    assert.equal(await page.locator('.sidebar-nav .nav-item.active').innerText(),'Analytics and Reporting');
    assert.equal(await page.locator('.ops-content,.dashboard-greeting').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const trend=page.getByRole('group',{name:'Parcel registration trend',exact:true});await trend.focus();await page.keyboard.press('End');assert.match(await trend.getByRole('status').innerText(),/16 Oct/);cases++;
    const chart=page.getByRole('group',{name:'Disputes by issue type',exact:true});await chart.focus();await page.keyboard.press('Home');assert.match(await chart.getByRole('status').innerText(),/Damaged parcel.*5 disputes/s);await page.keyboard.press('ArrowDown');assert.match(await chart.getByRole('status').innerText(),/Wrong unit.*4 disputes/s);cases++;
    await page.getByRole('button',{name:'Weekly',exact:true}).click();await ready(page);assert.ok(requests.some(req=>req.q.group==='week'));await page.getByRole('button',{name:'Monthly',exact:true}).click();await ready(page);assert.ok(requests.some(req=>req.q.group==='month'));await page.getByRole('button',{name:'Daily',exact:true}).click();await ready(page);cases++;
    await room(page,roomB);await ready(page);assert.match(await page.locator('.analytics-context').innerText(),/Parcel Room B/);assert.ok(requests.some(req=>req.q.room_id===roomB));cases++;
    await page.getByLabel('Date range',{exact:true}).selectOption('7');await ready(page);assert.ok(requests.some(req=>req.q.from==='2026-10-10'));
    await page.getByLabel('Date range',{exact:true}).selectOption('month');await ready(page);assert.ok(requests.some(req=>req.q.from==='2026-10-01'));cases++;
    await page.getByLabel('Date range',{exact:true}).selectOption('custom');await page.getByLabel('Start date',{exact:true}).fill('2026-09-01');await page.getByLabel('End date',{exact:true}).fill('2026-10-14');await page.getByRole('button',{name:'Apply Dates',exact:true}).click();await ready(page);assert.ok(requests.some(req=>req.q.from==='2026-09-01'&&req.q.to==='2026-10-14'));cases++;
    await page.getByLabel('Start date',{exact:true}).fill('2020-01-01');await page.getByRole('button',{name:'Apply Dates',exact:true}).click();await page.getByRole('alert').getByText(/Choose valid dates/).waitFor();assert.equal(requests.some(req=>req.q.from==='2020-01-01'),false);cases++;
    await page.getByLabel('Date range',{exact:true}).selectOption('30');await ready(page);await room(page,'');await ready(page);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/private/tmp/parcel-nexus-analytics-expanded-'+width+'.png',fullPage:true});
    await page.getByRole('button',{name:'Generate Report',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Generate Report',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('Report Start date').inputValue(),'2026-09-17');
    await dialog.getByLabel('Report type',{exact:true}).selectOption('disputes');await dialog.getByLabel('Report parcel room',{exact:true}).selectOption(roomA);await dialog.getByLabel('Report Start date').fill('2026-10-01');
    await page.screenshot({path:'/private/tmp/parcel-nexus-analytics-report-'+width+'.png'});
    state.reportError=true;await dialog.getByRole('button',{name:'Download Report',exact:true}).click();await dialog.getByRole('alert').waitFor();state.reportError=false;
    const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download Report',exact:true}).click();assert.equal((await download).suggestedFilename(),'gems-selected-report.pdf');
    assert.ok(requests.some(req=>req.path.endsWith('/report')&&req.q.report_type==='disputes'&&req.q.from==='2026-10-01'&&req.q.to==='2026-10-16'&&req.q.room_id===roomA));cases++;
    await page.getByRole('button',{name:'Generate Report',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Generate Report',exact:true}).evaluate(node=>node===document.activeElement),true);cases++;
    state.error=500;await page.reload();await page.getByRole('alert').getByText('Analytics unavailable. Please retry.').waitFor();state.error=0;await page.getByRole('button',{name:'Retry',exact:true}).click();await ready(page);cases++;
    state.slow=true;await room(page,roomA);await room(page,roomB);await ready(page);await page.waitForTimeout(500);assert.match(await page.locator('.analytics-context').innerText(),/Parcel Room B/);cases++;
    state.empty=true;await page.reload();await ready(page);assert.equal(await page.getByRole('meter').getAttribute('aria-valuetext'),'No registrations in this period');assert.ok(await page.getByText(/No timing samples recorded/).count());cases++;
    assert.equal(requests.some(req=>req.method!=='GET'),false);assert.deepEqual(t.errors,[]);await t.context.close();
  }
  for(const role of ['GUARD','RESIDENT','SUPER_ADMIN']){const t=await setup(390,role);await t.page.goto(base+'/analytics');await t.page.waitForURL(url=>url.pathname!=='/analytics');assert.equal(t.requests.some(req=>req.path==='/api/dashboard/admin/analytics'),false);await t.context.close();cases++;}
  console.log('Expanded analytics: '+cases+' browser scenarios passed across desktop/tablet/mobile; intercepted data and no live writes.');
}finally{await browser.close();}
