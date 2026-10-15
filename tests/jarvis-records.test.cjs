const test=require('node:test'),assert=require('node:assert/strict');
const {create,sanitizeQuery}=require('../src/assistant/jarvis-records.js');
function fixture(){
  const data={props:[{id:'mar',name:'Villa Mar',notes:'DOOR_CODE_SENTINEL',photos:['PHOTO_SENTINEL']},{id:'marjals',name:'Villa Marjals'}],cleaners:[{id:'a',name:'Ana'},{id:'b',name:'Bea'}],bookings:[
    {id:'old',propId:'mar',guestName:'Sample Guest One',checkIn:'2024-06-01',checkOut:'2024-06-08',guestCount:4,totalPrice:1234.56,status:'confirmed',notes:'PRIVATE_NOTES',guestPhone:'PRIVATE_PHONE',guestEmail:'PRIVATE_EMAIL'},
    {id:'future',propId:'mar',guestName:'Sample Guest Two',checkIn:'2027-07-01',checkOut:'2027-07-08',totalPrice:2300,status:'confirmed'},
    {id:'cancel',propId:'marjals',guestName:'Cancelled Guest',checkIn:'2026-10-15',checkOut:'2026-10-20',totalPrice:1900,cancellationRevenue:300,status:'cancelled'}
  ],sessions:[],tasks:[],issues:[],secret:'SECRET_SENTINEL'};
  const engine=create({getData:()=>data,reference:()=> '2026-10-15',required:()=>2});return {data,engine,run:q=>engine.run(q)};
}
test('payment lookup searches all loaded years and never calls a booking price money paid',()=>{
  const f=fixture(),before=JSON.stringify(f.data),r=f.run({entity:'bookings',view:'payment',guest:'Sample Guest One'});
  assert.equal(r.total,1);assert.match(r.text,/€1,234.56/);assert.match(r.text,/recorded booking price/);assert.match(r.text,/cannot confirm how much was actually paid/);assert.match(r.text,/2024/);
  assert.equal(JSON.stringify(f.data),before);for(const secret of ['PRIVATE_NOTES','PRIVATE_PHONE','PRIVATE_EMAIL','SECRET_SENTINEL','PHOTO_SENTINEL'])assert.ok(!JSON.stringify(r).includes(secret));
});
test('duplicate guest stays require a choice before answering an amount; choice is revalidated against current records',()=>{
  const f=fixture();f.data.bookings[1].guestName='Sample Guest One';let r=f.run({entity:'bookings',guest:'Sample Guest One',view:'price'});
  assert.equal(r.choices,true);assert.equal(r.rows.length,2);assert.ok(!r.text.includes('€'));r=f.run({entity:'bookings',view:'price',option:2});assert.match(r.text,/€2,300.00/);assert.equal(r.rows[0].id,'future');
  f.data.bookings=f.data.bookings.filter(b=>b.id!=='future');r=f.run({entity:'bookings',recordId:'selected',view:'price'});assert.equal(r.rows.length,0);assert.match(r.text,/no matching/);
});
test('accent and word-order matching is exact by words; approximate names are suggestions and need a choice',()=>{
  const f=fixture();f.data.bookings[0].guestName='Élise Kammler';let r=f.run({entity:'bookings',guest:'Kammler Elise',view:'details'});assert.equal(r.total,1);
  r=f.run({entity:'bookings',guest:'Elisa Kamler',view:'payment'});assert.equal(r.choices,true);assert.match(r.text,/did not find an exact guest match/);assert.ok(!r.text.includes('€'));
  r=f.run({entity:'bookings',view:'payment',option:1});assert.match(r.text,/Élise Kammler/);assert.match(r.text,/cannot confirm/);
  r=f.run({entity:'bookings',guest:'Élise Kammler',start:'2027-01-01',end:'2027-12-31',view:'price'});assert.equal(r.rows.length,0);assert.ok(!r.choices);
});
test('unknown and ambiguous properties never broaden to all villas; Villa Mar does not match Villa Marjals',()=>{
  const f=fixture();assert.equal(f.run({entity:'bookings',property:'Villa Mar'}).total,2);
  assert.equal(f.run({entity:'bookings',property:'Villa Unknown'}).total,0);assert.match(f.run({entity:'bookings',property:'Villa'}).text,/More than one property/);
  f.data.props.push({id:'copy',name:'Villa Mar'});assert.equal(f.run({entity:'bookings',property:'Villa Mar'}).total,0);
});
test('unknown and invalid amounts stay unknown; an explicit zero is a known price',()=>{
  for(const value of [null,undefined,-5,'500',Infinity,NaN]){const f=fixture();f.data.bookings[0].totalPrice=value;assert.match(f.run({entity:'bookings',guest:'Sample Guest One',view:'price'}).text,/not recorded/);}
  const f=fixture();f.data.bookings[0].totalPrice=0;assert.match(f.run({entity:'bookings',guest:'Sample Guest One',view:'price'}).text,/€0.00/);
  f.data.bookings[0]._excel={priceUnknown:true};assert.match(f.run({entity:'bookings',guest:'Sample Guest One',view:'price'}).text,/not recorded/);
});
test('specific cancelled bookings stay findable and identify retained money separately from receipts',()=>{
  const f=fixture(),r=f.run({entity:'bookings',guest:'Cancelled Guest',view:'payment'});assert.equal(r.rows[0].status,'cancelled');assert.match(r.text,/cancelled/);assert.match(r.text,/retained: €300.00/);assert.match(r.text,/receipts are not tracked/);
  assert.equal(f.run({entity:'bookings',view:'list',start:'2026-10-15',end:'2026-10-20'}).total,0);
});
test('stay overlap excludes checkout day; arrival/departure filters and exact dates work',()=>{
  const f=fixture();assert.equal(f.run({entity:'bookings',start:'2027-07-08',end:'2027-07-08'}).total,0);
  assert.equal(f.run({entity:'bookings',start:'2027-07-07',end:'2027-07-07'}).total,1);
  assert.equal(f.run({entity:'bookings',start:'2027-07-01',end:'2027-07-01',dateBy:'arrival'}).total,1);
  assert.equal(f.run({entity:'bookings',start:'2027-07-08',end:'2027-07-08',dateBy:'departure'}).total,1);
  for(const q of [{start:'2026-02-29'},{start:'2026-15-01'},{start:'2027-01-01',end:'2026-01-01'}])assert.throws(()=>sanitizeQuery({entity:'bookings',...q}),/date/);
  assert.equal(sanitizeQuery({entity:'bookings',start:'2028-02-29'}).start,'2028-02-29');
});
test('availability uses checkout-exclusive overlap, excludes cancellations and discloses missing calendars or incomplete dates',()=>{
  const f=fixture();let r=f.run({entity:'properties',view:'availability',property:'Villa Mar',start:'2027-07-08',end:'2027-07-10'});assert.match(r.text,/No overlapping/);assert.match(r.text,/owner blocks are not checked/);
  r=f.run({entity:'properties',view:'availability',property:'Villa Mar',start:'2027-07-07',end:'2027-07-10'});assert.match(r.text,/1 overlapping/);
  r=f.run({entity:'properties',view:'availability',property:'Villa Marjals',start:'2026-10-15',end:'2026-10-20'});assert.match(r.text,/No overlapping/);
  f.data.bookings[1].checkOut='';r=f.run({entity:'properties',view:'availability',property:'Villa Mar',start:'2027-07-08',end:'2027-07-10'});assert.match(r.text,/availability unknown/);
  assert.match(f.run({entity:'properties',view:'availability'}).text,/arrival and departure dates/);
});
test('task queries distinguish overdue, high priority, completed, due-date windows and undated work',()=>{
  const f=fixture();f.data.tasks=[{id:'old',text:'Restock towels',dueDate:'2026-10-14',priority:'high',done:false},{id:'today',text:'Check pump',dueDate:'2026-10-15',done:false},{id:'done',text:'Done job',dueDate:'2026-10-14',done:true},{id:'undated',text:'Undated',done:false}];
  assert.equal(f.run({entity:'tasks'}).total,3);assert.equal(f.run({entity:'tasks',status:'overdue'}).rows[0].id,'old');assert.equal(f.run({entity:'tasks',status:'high'}).total,1);assert.equal(f.run({entity:'tasks',status:'done'}).total,1);
  assert.equal(f.run({entity:'tasks',start:'2026-10-15',end:'2026-10-15'}).rows[0].id,'today');assert.equal(f.run({entity:'tasks',search:'pump'}).total,1);
  assert.equal(f.run({entity:'tasks',view:'count'}).text,'There are 3 matching tasks in the current app data.');
});
test('cleaning tools count sessions, distinguish offered from confirmed and keep staff and property filters',()=>{
  const f=fixture();f.data.sessions=[{id:'one',propId:'mar',date:'2026-10-16',crew:{main:[{cleanerId:'a',status:'confirmed'},{cleanerId:'b',status:'offered'}]}},{id:'two',propId:'marjals',date:'2026-10-16',cleanerIds:['a','b']},{id:'empty',propId:'mar',date:'2026-10-17'},{id:'cancel',propId:'mar',date:'2026-10-17',status:'cancelled'}];
  let r=f.run({entity:'cleanings',start:'2026-10-16',end:'2026-10-17',status:'needs_team'});assert.equal(r.total,2);assert.equal(r.rows[0].team.confirmed,1);assert.equal(r.rows[0].team.missing,1);assert.match(r.text,/awaiting confirmation/);
  assert.equal(f.run({entity:'cleanings',status:'unassigned'}).total,1);assert.equal(f.run({entity:'cleanings',staff:'Bea',property:'Villa Marjals'}).total,1);assert.equal(f.run({entity:'cleanings',status:'all'}).total,4);
});
test('record context contains selectors and queries, never financial values, secret fields, notes or full catalogs',()=>{
  const f=fixture();f.run({entity:'bookings',guest:'Sample Guest One',view:'payment'});const context=JSON.stringify(f.engine.context());
  for(const value of ['1234.56','123456','2300','PRIVATE_NOTES','PRIVATE_PHONE','PRIVATE_EMAIL','Cancelled Guest'])assert.ok(!context.includes(value),value);
  const coverage=f.engine.coverage();assert.equal(coverage.bookings,3);assert.equal(coverage.bookingStart,'2024-06-01');assert.equal(coverage.bookingEnd,'2027-07-08');assert.equal(coverage.paymentReceiptsTracked,false);
  assert.equal(f.run({entity:'bookings',recordId:'selected',view:'details'}).rows[0].id,'old');f.engine.reset();assert.equal(f.engine.context(),null);
});
test('specific follow-up fields give a short answer while leaving the full verified record on screen',()=>{
  const f=fixture();f.run({entity:'bookings',guest:'Sample Guest One',view:'payment'});const r=f.run({entity:'bookings',recordId:'selected',view:'details',field:'arrival'});assert.match(r.text,/Arrival: 1 Jun 2024/);assert.ok(!r.text.includes('€'));assert.ok(!r.text.includes('Payment received'));assert.ok(r.rows[0].facts.some(f=>f.label==='Booking price'));
  assert.throws(()=>sanitizeQuery({entity:'bookings',field:'apiKey'}));
});
test('bounded pagination preserves every record, uses page-relative choices and detects removed records',()=>{
  const f=fixture();f.data.bookings=Array.from({length:10},(_,i)=>({id:'b'+String(i).padStart(2,'0'),propId:'mar',guestName:'Guest '+i,checkIn:'2027-07-01',checkOut:'2027-07-08',totalPrice:10}));
  let r=f.run({entity:'bookings'});assert.equal(r.rows.length,8);assert.equal(r.more,2);r=f.run({entity:'bookings',offset:8});assert.equal(r.rows.length,2);assert.match(r.text,/Option 1: Guest 8/);
  f.data.bookings.pop();r=f.run({entity:'bookings',view:'details',option:2});assert.equal(r.rows.length,0);
});
test('read-only query contract rejects mutation tools, invalid enums and oversized selectors, drops arbitrary fields',()=>{
  for(const q of [{entity:'delete_bookings'},{entity:'bookings',view:'send'},{entity:'bookings',option:9},{entity:'bookings',offset:-1},{entity:'tasks',view:'payment'},{entity:'bookings',guest:'x'.repeat(101)}])assert.throws(()=>sanitizeQuery(q));
  assert.deepEqual(sanitizeQuery({entity:'bookings',guest:'Sample Guest',secret:'SECRET',code:'RUN',approve:true}),{entity:'bookings',view:'list',guest:'Sample Guest'});
  const f=fixture(),before=JSON.stringify(f.data);f.run({entity:'properties',view:'details'});f.data.issues=[{id:'issue',title:'Leaking tap',propId:'mar',status:'open',priority:'high'}];const state=JSON.stringify(f.data);assert.equal(f.run({entity:'issues',search:'tap'}).total,1);assert.equal(JSON.stringify(f.data),state);assert.ok(before);
});
