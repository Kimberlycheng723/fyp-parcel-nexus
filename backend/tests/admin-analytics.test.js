import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import { analyticsBuckets, fillAnalyticsBuckets, validateAnalyticsFilters } from '../src/utils/adminAnalytics.js';

test('analytics uses Malaysia midnight, strict validation and an inclusive 30-day default', () => {
  const now = new Date('2026-10-15T16:30:00Z'), config = validateAnalyticsFilters({}, now).value;
  assert.equal(config.from, '2026-09-17'); assert.equal(config.to, '2026-10-16');
  assert.equal(config.start, '2026-09-16T16:00:00.000Z'); assert.equal(config.cutoff, now.toISOString());
  for (const filters of [{ from: [] }, { to: '2026-10-17' }, { from: '2026-02-30' }, { room_id: 'unassigned' }, { room_id: [] }, { group: 'hour' }, { group: ['day'] }, { from:'2020-01-01' }]) assert.ok(validateAnalyticsFilters(filters,now).error);
});
test('daily, Monday-based weekly and monthly buckets fill gaps without inventing timing samples', () => {
  assert.equal(analyticsBuckets('2026-10-01','2026-10-16','day').length,16);
  assert.equal(analyticsBuckets('2026-10-01','2026-10-16','week')[0].key,'2026-09-28');
  assert.equal(analyticsBuckets('2026-09-17','2026-10-16','month').length,2);
  const rows = fillAnalyticsBuckets({from:'2026-10-01',to:'2026-10-02',group:'day'},[{key:'2026-10-01',average_hours:0,samples:1}],['average_hours','samples'],['average_hours']);
  assert.equal(rows[0].average_hours,0); assert.equal(rows[1].average_hours,null); assert.equal(rows[1].samples,0);
});
test('analytics database and PDF contract; all fixtures roll back', { skip: process.env.ADMIN_ANALYTICS_INTEGRATION !== 'true' }, async t => {
  const { pool } = await import('../src/db/pool.js');
  const { default: app } = await import('../src/app.js');
  const { signAccessToken } = await import('../src/utils/jwt.js');
  const db = await pool.connect(), raw = db.query.bind(db), marker = 'analytics-' + randomUUID();
  await raw('BEGIN'); let server, sequence = 0; const savepoints = [];
  const query = async (sql, params) => {
    const command = typeof sql === 'string' ? sql.trim().toUpperCase() : '';
    if (command.startsWith('BEGIN')) { const name='analytics_'+(++sequence);savepoints.push(name);return raw('SAVEPOINT '+name); }
    if (command==='COMMIT') return raw('RELEASE SAVEPOINT '+savepoints.pop());
    if (command==='ROLLBACK') {const name=savepoints.pop();await raw('ROLLBACK TO SAVEPOINT '+name);return raw('RELEASE SAVEPOINT '+name);}
    return raw(sql,params);
  };
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  try {
    const unit=(await raw("INSERT INTO units(block,floor,unit_number,full_unit_code) VALUES('TEST','01','01',$1) RETURNING unit_id",[marker])).rows[0].unit_id;
    const users={};for(const role of ['ADMIN','GUARD','RESIDENT','SUPER_ADMIN']) users[role]=(await raw("INSERT INTO users(email,first_name,phone_number,role,status,unit_id) VALUES($1,'Analytics','0100000000',$2,'ACTIVE',$3) RETURNING user_id,role,status",[marker+role+'@example.invalid',role,role==='RESIDENT'?unit:null])).rows[0];
    const courier=(await raw("INSERT INTO courier_companies(courier_name,courier_code,status,created_by) VALUES($1,$1,'ACTIVE',$2) RETURNING courier_id",[marker,users.ADMIN.user_id])).rows[0].courier_id;
    const rooms=[];for(const suffix of ['A','B']) rooms.push((await raw('INSERT INTO parcel_rooms(name) VALUES($1) RETURNING id',[marker+suffix])).rows[0].id);
    const create=async(suffix,{created='2002-01-10T12:00:00+08:00',collected=null,status='PENDING_COLLECTION',deadline='2002-02-10T00:00:00+08:00',room=rooms[0],deleted=null}={})=>(await raw(`INSERT INTO parcels(tracking_number,courier_id,unit_id,registered_by,delivery_person_contact,parcel_room_id,status,created_at,collected_at,collection_deadline,deleted_at)
      VALUES($1,$2,$3,$4,'0100000000',$5,$6,$7,$8,$9,$10) RETURNING parcel_id`,[marker+suffix,courier,unit,users.GUARD.user_id,room,status,created,collected,deadline,deleted])).rows[0].parcel_id;
    const p1=await create('-first',{created:'2002-01-01T00:00:00+08:00',collected:'2002-01-02T01:00:00+08:00',status:'COLLECTED'});
    await raw("INSERT INTO notifications(recipient_user_id,type,title,message,related_parcel_id,created_at) VALUES($1,'PARCEL_ARRIVAL','Fixture','Fixture',$2,'2002-01-01T01:00:00+08:00'),($1,'PARCEL_ARRIVAL','Duplicate','Duplicate',$2,'2002-01-01T02:00:00+08:00')",[users.RESIDENT.user_id,p1]);
    await create('-carry-in',{created:'2001-12-20T12:00:00+08:00',collected:'2002-01-03T20:00:00+08:00',status:'COLLECTED'});
    await create('-after-period',{created:'2002-01-31T23:59:00+08:00',collected:'2002-02-01T00:00:00+08:00',status:'COLLECTED',deadline:'2002-01-20T00:00:00+08:00'});
    await create('-next-period',{created:'2002-02-01T00:00:00+08:00'});
    await create('-deleted',{deleted:'2002-01-15T00:00:00+08:00'});
    await create('-other-room',{room:rooms[1]});
    await create('-unknown',{status:'COLLECTED'});
    const cutoff=new Date('2002-02-01T00:00:00+08:00');
    for(const days of [2,3,7,8,30,31,60,61]) await create('-age-'+days,{created:'2001-01-01T00:00:00+08:00',deadline:new Date(cutoff.getTime()-days*86400000-1000).toISOString()});
    await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,created_at,resolved_at,resolved_by_user_id) VALUES($1,$2,'DAMAGED','Analytics fixture damaged parcel','RESOLVED','2002-01-10T00:00:00+08:00','2002-01-12T00:00:00+08:00',$3)",[p1,users.RESIDENT.user_id,users.ADMIN.user_id]);
    await raw("INSERT INTO disputes(parcel_id,resident_user_id,issue_type,description,status,created_at) VALUES($1,$2,'MISSING_ITEM','Analytics fixture older open case','OPEN','2001-12-15T00:00:00+08:00')",[p1,users.RESIDENT.user_id]);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api/dashboard/admin/analytics';
    const request=(role,suffix='')=>fetch(base+suffix,{headers:role?{Authorization:'Bearer '+signAccessToken(users[role])}:{}});
    const params=new URLSearchParams({from:'2002-01-01',to:'2002-01-31',room_id:rooms[0],group:'day'});
    await t.test('read and PDF routes enforce authentication and Admin-only access',async()=>{
      for(const suffix of ['?'+params,'/report?'+params]){assert.equal((await request(null,suffix)).status,401);for(const role of ['GUARD','RESIDENT','SUPER_ADMIN'])assert.equal((await request(role,suffix)).status,403);}
    });
    const response=await request('ADMIN','?'+params);assert.equal(response.status,200);const data=await response.json();
    await t.test('period/room boundaries, collection cohort and carry-in collections',()=>{
      assert.equal(data.parcel_summary.registered,3);assert.equal(data.parcel_summary.collected,2);assert.equal(data.parcel_summary.cohort_collected,1);assert.equal(data.parcel_summary.collection_rate,33.3);assert.equal(data.parcel_summary.missing_collection_time,1);
      assert.equal(data.registration_trend.length,31);assert.equal(data.registration_trend[0].registered,1);assert.equal(data.registration_hours[0].registered,1);
      assert.equal(data.collection_hours[0].count,1);assert.equal(data.collection_hours[5].count,1);
    });
    await t.test('first notification only, missing timing excluded, null gaps retained',()=>{
      assert.equal(data.collection_delay.samples,1);assert.equal(data.collection_delay.missing_notification,1);assert.equal(data.collection_delay.average_hours,24);assert.equal(data.collection_delay.series[1].average_hours,24);assert.equal(data.collection_delay.series[0].average_hours,null);
    });
    await t.test('overdue buckets cover under-three and exact 3/7/8/30/31/60/61-day boundaries as of period end',()=>{
      assert.deepEqual(data.overdue_duration.map(row=>row.count),[1,2,3,2,1]);
    });
    await t.test('dispute issue and resolution data use their own event dates',()=>{
      assert.equal(data.dispute_summary.reported,1);assert.equal(data.dispute_summary.resolved,1);assert.equal(data.dispute_summary.unresolved,1);assert.equal(data.dispute_summary.average_resolution_hours,48);
      assert.equal(data.dispute_issues[0].label,'Damaged parcel');assert.deepEqual(data.dispute_resolution.map(row=>row.count),[0,1,0,0,0]);
    });
    await t.test('invalid filters fail safely and empty-room timing is not fabricated',async()=>{
      for(const suffix of ['?from=2002-02-30','?group=hour','?room_id=invalid','/report?report_type=bad'])assert.equal((await request('ADMIN',suffix)).status,400);
      assert.equal((await request('ADMIN','?room_id='+randomUUID())).status,404);
      const empty=await(await request('ADMIN','?'+new URLSearchParams({...Object.fromEntries(params),room_id:rooms[1]}))).json();assert.equal(empty.collection_delay.average_hours,null);assert.equal(empty.parcel_summary.collection_rate,0);
    });
    await t.test('all four PDF report types download with matching metadata',async()=>{
      for(const type of ['full','parcels','disputes','system']){const pdf=await request('ADMIN','/report?'+params+'&report_type='+type);assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);assert.match(pdf.headers.get('content-disposition'),new RegExp(type+'-report-2002-01-01-to-2002-01-31'));const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert.ok(bytes.length>1000);assert.match(bytes.subarray(-16).toString(),/%%EOF/);if(process.env.ANALYTICS_PDF_OUTPUT==='true')writeFileSync('/tmp/gems-analytics-'+type+'.pdf',bytes);}
    });
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await raw('ROLLBACK');db.release();t.mock.restoreAll();await pool.end();}
});
