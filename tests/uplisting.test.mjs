/* Uplisting read-only preview with FICTIONAL mocked Uplisting responses: no network, no real account, no real guests.
   Covers manager authorization, secret protection, read-only requests, full pagination, rate limits, auth failures,
   partial retrieval, the New Year boundary, property mapping, matching against Excel/manual records, cancellations,
   unknown versus zero amounts, repeated retrieval, and that no booking/property/cleaning record is changed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as worker from '../cloudflare/worker.mjs';
const require=createRequire(import.meta.url);
require('../src/imports/excel-bookings.js');
require('../src/imports/uplisting-bookings.js');
const P=globalThis.SV_UPLISTING;
const KEY='SYNTHETIC_UPLISTING_KEY_123';

/* ── Mock Uplisting (documented legacy shapes) ── */
const reservation=(id,propertyId,checkIn,checkOut,extra={})=>({id,currency:'EUR',property_name:'Listing '+propertyId,property_id:propertyId,check_in:checkIn,check_out:checkOut,arrival_time:'16:00:00',departure_time:'10:00:00',number_of_nights:1,guest_name:'Fictional Guest '+id,guest_email:'private'+id+'@example.invalid',guest_phone:'000'+id,lock_code:'9999',status:'confirmed',channel:'airbnb_official',external_reservation_id:'HMFAKE'+id,number_of_guests:2,accomodation_total:500,cleaning_fee:80,total_payout:450,booked_at:'2026-05-01T10:00:00Z',...extra});
function uplisting({properties,bookings,fail={}}){
  const calls=[];
  const fetch=async(url,init)=>{
    const u=new URL(url);calls.push({method:init.method,path:u.pathname,query:Object.fromEntries(u.searchParams),auth:init.headers.Authorization});
    const hook=fail[u.pathname]?.(calls.filter(c=>c.path===u.pathname).length,u);if(hook)return hook;
    if(u.pathname==='/users/me')return Response.json({name:'Fictional Villas',uid:'abc'});
    if(u.pathname==='/properties')return Response.json({data:properties.map(p=>({id:String(p.id),type:'properties',attributes:{name:p.name,nickname:p.nickname||''}}))});
    const m=u.pathname.match(/^\/bookings\/(\d+)$/);
    if(m){
      const from=u.searchParams.get('from'),to=u.searchParams.get('to'),page=Number(u.searchParams.get('page')),per=Number(u.searchParams.get('per_page'));
      // Overlap filter: the documented behaviour is unspecified, so the mock uses overlap; the Worker filters again itself.
      const all=(bookings[m[1]]||[]).filter(b=>b.check_in<to&&b.check_out>from);
      return Response.json({bookings:all.slice(page*per,page*per+per),meta:{total_pages:Math.ceil(all.length/per),total:all.length}});
    }
    return new Response('not found',{status:404});
  };
  return {fetch,calls};
}
function setup(mock,{key=KEY}={}){
  worker.setUplistingForTests({fetch:mock.fetch,sleep:async()=>{}});
  const kv=new Map(),env={SECRET:'SYNTHETIC_MANAGER_KEY',UPLISTING_API_KEY:key,DB:{async get(k){if(k==='seravillas')throw Error('app data must not be read');return kv.get(k)??null;},async put(k,v){if(k!=='uplisting_status')throw Error('only status metadata may be written');kv.set(k,v);}}};
  const call=(route,headers={})=>worker.default.fetch(new Request('https://service.invalid'+route,{headers}),env);
  const manager=route=>call(route,{'X-Secret':env.SECRET});
  return {env,kv,call,manager,clearCooldown(){const s=JSON.parse(kv.get('uplisting_status')||'{}');delete s.lastAttemptAt;kv.set('uplisting_status',JSON.stringify(s));}};
}
test.after(()=>worker.setUplistingForTests());
const READ_ONLY=c=>c.method==='GET'&&(/^\/users\/me$/.test(c.path)||/^\/properties$/.test(c.path)||/^\/bookings\/\d+$/.test(c.path));

test('manager-only routes; the key stays secret; only documented GET reads; guest contact details never returned',async()=>{
  const mock=uplisting({properties:[{id:101,name:'Villa Mar'}],bookings:{101:[reservation(1,101,'2027-03-01','2027-03-08')]}}),h=setup(mock);
  for(const route of ['/api/uplisting/status','/api/uplisting/preview?year=2027']){assert.equal((await h.call(route)).status,401);assert.equal((await h.call(route,{'X-Secret':'wrong'})).status,401);}
  assert.equal(mock.calls.length,0,'nothing reaches Uplisting without the manager key');
  const status=await(await h.manager('/api/uplisting/status')).json();assert.deepEqual([status.service,status.configured,status.readOnly,status.sync],['uplisting',true,true,'off']);
  assert.equal(mock.calls.length,0,'the status check does not call Uplisting');
  assert.equal((await h.manager('/api/uplisting/preview?year=2026')).status,400,'2027 only');
  const res=await h.manager('/api/uplisting/preview?year=2027'),text=await res.text(),body=JSON.parse(text);
  assert.equal(res.status,200);assert.equal(body.ok,true);assert.equal(body.complete,true);assert.equal(body.reservations.length,1);
  assert.ok(mock.calls.every(READ_ONLY),'read-only: GET on the three documented read paths only');
  assert.ok(mock.calls.every(c=>c.auth==='Basic '+Buffer.from(KEY).toString('base64')),'documented Basic header with the Base64 key');
  for(const secret of [KEY,Buffer.from(KEY).toString('base64'),'private1@','0001','9999'])assert.ok(!text.includes(secret),'not in the response: '+secret);
  assert.ok(!h.kv.get('uplisting_status').includes('Fictional Guest'),'status metadata holds no guest data');
  assert.ok(!(await(await h.manager('/api/uplisting/status')).text()).includes(KEY));
  const missing=setup(uplisting({properties:[],bookings:{}}),{key:''});const nc=await(await missing.manager('/api/uplisting/preview?year=2027')).json();
  assert.deepEqual([nc.ok,nc.configured,nc.error.kind],[false,false,'not_configured']);
});
test('full pagination across both fetch windows; repeated stays merged once; New Year boundary with checkout exclusivity',async()=>{
  const many=Array.from({length:120},(_,i)=>reservation(1000+i,101,'2027-0'+(1+i%5)+'-'+String(10+i%15),'2027-0'+(1+i%5)+'-'+String(11+i%15)));
  const edge=[reservation(1,101,'2026-12-28','2027-01-03'),reservation(2,101,'2026-12-20','2027-01-01'),reservation(3,101,'2027-12-30','2028-01-02'),reservation(4,101,'2027-06-28','2027-07-04'),reservation(5,101,'2026-11-01','2026-11-05')];
  const mock=uplisting({properties:[{id:101,name:'Villa Mar'}],bookings:{101:[...many,...edge]}}),h=setup(mock);
  const body=await(await h.manager('/api/uplisting/preview?year=2027')).json();
  assert.equal(body.complete,true);
  const pages=mock.calls.filter(c=>c.path==='/bookings/101');assert.ok(pages.length>=4,'several pages read');assert.ok(pages.every(c=>Number(c.query.per_page)===50));
  assert.deepEqual([...new Set(pages.map(c=>c.query.page))].sort(),['0','1','2'],'0-based pages, all of them');
  const ids=body.reservations.map(r=>r.id);assert.equal(new Set(ids).size,ids.length,'each reservation once');
  assert.ok(ids.includes('1')&&ids.includes('3')&&ids.includes('4'),'crossing stays on both sides of the year and across the window split');
  assert.ok(!ids.includes('2'),'departing 1 January: no 2027 night (checkout exclusive)');assert.ok(!ids.includes('5'));
  assert.equal(body.reservations.length,123);assert.ok(body.duplicatesMerged>=1,'the stay spanning the window split was merged, not duplicated');
  assert.equal(body.outsideScope,2);
});
test('rate limits are retried a bounded number of times; persistent limits and broken paging mark the preview incomplete; auth failure shows no preview',async()=>{
  const props=[{id:101,name:'Villa Mar'},{id:102,name:'Villa Diagonal'}],data={101:[reservation(1,101,'2027-02-01','2027-02-05')],102:[reservation(2,102,'2027-02-01','2027-02-05')]};
  // One 429 then success: retried and complete.
  let mock=uplisting({properties:props,bookings:data,fail:{'/bookings/101':n=>n===1?new Response('',{status:429,headers:{'Retry-After':'1'}}):null}}),h=setup(mock);
  let body=await(await h.manager('/api/uplisting/preview?year=2027')).json();assert.equal(body.complete,true);assert.equal(body.reservations.length,2);
  // Always 429 for one villa: bounded retries, the other villa still read, flagged incomplete.
  mock=uplisting({properties:props,bookings:data,fail:{'/bookings/102':()=>new Response('',{status:429})}});h=setup(mock);
  body=await(await h.manager('/api/uplisting/preview?year=2027')).json();
  assert.deepEqual([body.ok,body.complete],[true,false]);assert.ok(mock.calls.filter(c=>c.path==='/bookings/102').length<=3,'bounded retries');
  assert.ok(body.problems.some(p=>p.propertyId==='102'&&p.kind==='rate_limited'));assert.equal(body.properties.find(p=>p.id==='102').incomplete,true);
  assert.equal(JSON.parse(h.kv.get('uplisting_status')).lastOutcome,'incomplete');assert.equal(JSON.parse(h.kv.get('uplisting_status')).lastSuccessAt,undefined,'an incomplete retrieval is not a success');
  // Cooldown: an immediate second retrieval is refused before calling Uplisting.
  const before=mock.calls.length;assert.equal((await h.manager('/api/uplisting/preview?year=2027')).status,429);assert.equal(mock.calls.length,before);
  // Missing paging metadata, a count mismatch and timeouts are incomplete, never complete.
  for(const broken of [()=>Response.json({bookings:[]}),()=>Response.json({bookings:[],meta:{total_pages:1,total:3}}),()=>{throw new Error('timeout');}]){
    mock=uplisting({properties:props,bookings:data,fail:{'/bookings/101':broken}});h=setup(mock);
    body=await(await h.manager('/api/uplisting/preview?year=2027')).json();assert.deepEqual([body.ok,body.complete],[true,false]);
  }
  // A rejected key: no reservations at all, failure recorded, no success time.
  mock=uplisting({properties:props,bookings:data,fail:{'/users/me':()=>new Response('',{status:401})}});h=setup(mock);
  const res=await h.manager('/api/uplisting/preview?year=2027');body=await res.json();
  assert.equal(res.status,200,'an Uplisting rejection is not a Seravillas sign-in failure');assert.deepEqual([body.ok,body.error.kind,body.reservations.length],[false,'auth',0]);
  assert.equal(mock.calls.length,1,'stops at the first authentication failure');assert.equal(JSON.parse(h.kv.get('uplisting_status')).lastOutcome,'auth_failed');
  h.clearCooldown();
});

/* ── Planner over the app's records ── */
const resp=(reservations,o={})=>({service:'uplisting',ok:true,complete:true,retrievedAt:'2026-10-25T09:00:00Z',properties:[{id:'101',name:'Villa Mar'},{id:'102',name:'Can Marjals'},{id:'103',name:'Villa Diagonal Sea View'}],reservations,problems:[],outsideScope:0,...o});
const r=(id,propertyId,checkIn,checkOut,extra={})=>worker.normaliseReservation(reservation(id,Number(propertyId),checkIn,checkOut,extra));
function records(){
  return {props:[{id:'mar',name:'Villa Mar'},{id:'marjals',name:'Villa Marjals'},{id:'diag',name:'Villa Diagonal'}],
    bookings:[
      {id:'b-ref',propId:'mar',checkIn:'2027-02-01',checkOut:'2027-02-05',guestName:'Someone Else',platform:'airbnb',agencyName:'',guestCount:4,status:'confirmed',notes:'Keep the gate key',linkedCleaningId:'s-old',_excel:{reference:'HMFAKE10'}},
      {id:'b-exact',propId:'mar',checkIn:'2027-03-01',checkOut:'2027-03-08',guestName:'Fictional Guest 11',platform:'airbnb',guestCount:2,status:'confirmed'},
      {id:'b-similar',propId:'marjals',checkIn:'2027-04-02',checkOut:'2027-04-09',guestName:'Fictional Gest',platform:'booking',status:'confirmed'},
      {id:'b-cancel-me',propId:'mar',checkIn:'2027-05-01',checkOut:'2027-05-04',guestName:'Fictional Guest 13',platform:'airbnb',status:'confirmed'},
      {id:'b-was-cancelled',propId:'mar',checkIn:'2027-06-01',checkOut:'2027-06-04',guestName:'Fictional Guest 14',platform:'airbnb',status:'cancelled'},
      {id:'b-only',propId:'mar',checkIn:'2027-08-01',checkOut:'2027-08-05',guestName:'Manual Booking',platform:'direct',status:'confirmed'}],
    sessions:[{id:'s-old',propId:'mar',date:'2027-02-05',status:'scheduled',crew:{main:[{cleanerId:'c1',status:'confirmed'}]}},{id:'s-may',propId:'mar',date:'2027-05-04',status:'scheduled'}]};
}
test('property mapping: exact alias match suggested, partial match needs a choice, explicit choices and conflicts; aliases untouched',()=>{
  const d=records(),before=JSON.stringify(d);
  let p=P.plan(resp([]),d);const by=id=>p.properties.find(x=>x.id===id);
  assert.deepEqual([by('101').propId,by('101').state],['mar','suggested']);
  assert.deepEqual([by('102').propId,by('102').suggestion.basis],['marjals','exact'],'Can Marjals is a saved alias of Villa Marjals');
  assert.deepEqual([by('103').propId,by('103').suggestion.basis,by('103').suggestion.candidates],['','likely',['diag']],'a partial name is never applied by itself');
  p=P.plan(resp([r(30,'103','2027-07-01','2027-07-03')]),d);assert.equal(p.rows[0].kind,'review');assert.match(p.rows[0].reason,/Choose the Seravillas villa/);
  p=P.plan(resp([r(30,'103','2027-07-01','2027-07-03')]),d,{mappings:{'103':'diag'}});assert.equal(p.rows[0].kind,'new');
  p=P.plan(resp([r(30,'103','2027-07-01','2027-07-03')]),d,{mappings:{'103':'mar'}});assert.equal(p.properties.find(x=>x.id==='103').state,'conflict');assert.equal(p.rows[0].kind,'review','two listings on one villa');
  p=P.plan(resp([r(30,'103','2027-07-01','2027-07-03')]),d,{mappings:{'103':'@ignore'}});assert.equal(p.rows[0].kind,'excluded');
  assert.equal(JSON.stringify(d),before,'no record or alias changed');
});
test('matching against Excel/manual records: reference, exact, uncertain, cancellations, reactivation guard, cleaning review, absence is not cancellation',()=>{
  const d=records(),before=JSON.stringify(d);
  const list=[
    r(10,'101','2027-02-01','2027-02-06',{number_of_guests:5}),                 // reference HMFAKE10 → b-ref; checkout moved
    r(11,'101','2027-03-01','2027-03-08'),                                       // same dates + same guest → unchanged
    r(12,'102','2027-04-02','2027-04-09',{guest_name:'Fictional Guest'}),        // similar name, overlapping → review
    r(13,'101','2027-05-01','2027-05-04',{status:'cancelled'}),                  // cancelled in Uplisting, active here
    r(14,'101','2027-06-01','2027-06-04'),                                       // active there, cancelled here → review
    r(15,'101','2027-09-01','2027-09-05'),                                       // new
    r(16,'101','2027-10-01','2027-10-05',{status:'cancelled'}),                  // cancelled, unknown here
    r(17,'101','2026-12-29','2027-01-02'),                                       // crosses the New Year
    r(18,'101','2027-11-01','2027-11-03',{status:'pending'}),                    // unsupported status
    r(19,'101','2027-11-10','')];                                                 // missing departure
  const p=P.plan(resp(list),d),row=id=>p.rows.find(x=>x.r.id===String(id));
  assert.deepEqual([row(10).kind,row(10).bookingId,row(10).changes],['update','b-ref',['checkOut','guestCount']]);assert.match(row(10).basis,/channel reference HMFAKE10/);
  assert.equal(row(10).cleaningReview,true);assert.ok(row(10).notes.some(n=>/Guest name differs/.test(n)),'a different name is shown, not overwritten');
  assert.deepEqual([row(11).kind,row(11).bookingId],['unchanged','b-exact']);
  assert.deepEqual([row(12).kind,row(12).candidates],['review',['b-similar']],'a similar name is never assumed to be the same stay');
  assert.deepEqual([row(13).kind,row(13).bookingId,row(13).cleaningReview],['cancelled','b-cancel-me',true]);
  assert.equal(row(14).kind,'review');assert.match(row(14).reason,/never automatic/);
  assert.equal(row(15).kind,'new');assert.equal(row(16).kind,'cancelled');assert.equal(row(16).bookingId,'');
  assert.deepEqual([row(17).segment,row(17).kind],['crosses','new']);assert.match(row(17).notes[0],/belongs to 2026/);
  assert.equal(row(18).kind,'excluded');assert.equal(row(19).kind,'excluded');
  assert.deepEqual(p.seravillasOnly.map(x=>[x.booking.id,x.comparable]),[['b-only',true]],'listed for information; no cancellation is proposed');
  assert.ok(!p.rows.some(x=>x.bookingId==='b-only'));
  // An explicit decision resolves the uncertain row; nothing is saved.
  const decided=P.plan(resp(list),d,{decisions:{'12':'match:b-similar'}}).rows.find(x=>x.r.id==='12');assert.deepEqual([decided.kind,decided.bookingId,decided.changes,decided.basis],['update','b-similar',['guestCount'],'your selection'],'the unknown count here would be filled from Uplisting');
  // Repeated retrieval (including the same reservation twice) never creates duplicates.
  const again=P.plan(resp([...list,r(15,'101','2027-09-01','2027-09-05')]),d);assert.equal(again.rows.filter(x=>x.r.id==='15'&&x.kind==='new').length,0,'a repeated reservation is held for review');
  assert.deepEqual(JSON.stringify(P.plan(resp(list),d)),JSON.stringify(p),'the same retrieval gives the same preview');
  // Incomplete retrieval: nothing can be compared for absence.
  const partial=P.plan(resp(list,{complete:false,problems:[{kind:'rate_limited',propertyId:'101',message:'slow down'}],properties:[{id:'101',name:'Villa Mar',incomplete:true},{id:'102',name:'Can Marjals'}]}),d);
  assert.equal(partial.complete,false);assert.equal(partial.seravillasOnly[0].comparable,false);
  // Two Uplisting reservations on one Seravillas booking.
  const twice=P.plan(resp([r(11,'101','2027-03-01','2027-03-08'),r(20,'101','2027-03-01','2027-03-08',{guest_name:'Fictional Guest 11'})]),d);
  assert.ok(twice.rows.every(x=>x.kind==='review'));
  assert.equal(JSON.stringify(d),before,'no booking, property or cleaning record changed');
  assert.equal(P.plan({ok:false,error:{message:'x'}},d).rows.length,0,'a failed retrieval shows no rows');
});
test('missing, unknown and zero values stay distinct; prices are not payments; a missing guest name blocks a new booking',()=>{
  const raw=reservation(40,101,'2027-07-10','2027-07-12',{accomodation_total:0,cleaning_fee:null,number_of_guests:null});delete raw.total_payout;
  const n=worker.normaliseReservation(raw);
  assert.equal(n.accommodationTotal,0);assert.equal(n.cleaningFee,null);assert.equal('totalPayout' in n,false);assert.equal(n.guests,null);
  assert.ok(!('guest_email' in n)&&!('guestEmail' in n)&&!('lock_code' in n)&&!('guestPhone' in n));
  const odd=worker.normaliseReservation(reservation(41,101,'2027-07-10','2027-07-12',{number_of_guests:'two'}));assert.equal(odd.guests,null);assert.deepEqual(odd.invalid,['guests']);
  const p=P.plan(resp([n,worker.normaliseReservation(reservation(42,101,'2027-07-20','2027-07-22',{guest_name:''}))]),records()),row=p.rows[0];
  assert.deepEqual([row.accommodationTotal,row.cleaningFee,row.totalPayout,row.guests.state],[{state:'known',value:0},{state:'unknown'},{state:'missing'},'unknown']);
  assert.ok(row.warnings.some(w=>/Guest count is unknown/.test(w)));
  assert.equal(p.rows[1].kind,'review');assert.match(p.rows[1].reason,/Guest name is missing/);
  assert.deepEqual(P.platform('booking_dot_com'),{platform:'booking',agencyName:''});assert.deepEqual(P.platform('vrbo'),{platform:'agency',agencyName:'vrbo'});
});
