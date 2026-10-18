/* Validated operations engine: fictional fixture records only. Model output is MOCKED here as the typed fields an
   interpretation would produce; understanding of raw speech is evaluated separately (tools/jarvis/eval-operations.mjs). */
const test=require('node:test');
const assert=require('node:assert/strict');
const RECORDS=require('../src/assistant/jarvis-records.js');
const OPS=require('../src/assistant/jarvis-operations.js');
const REF='2026-10-18'; // Sunday; next week is Monday 19 – Sunday 25 October 2026

function fixture(){
  return {
    props:[{id:'p-mar',name:'Villa Mar'},{id:'p-marjals',name:'Villa Marjals'},{id:'p-casa',name:'Casa Ejemplo'},{id:'p-finca',name:'Finca Prueba'}],
    cleaners:[{id:'c1',name:'Maribel'},{id:'c2',name:'Tanja'}],
    bookings:[
      {id:'b1',propId:'p-mar',guestName:'Guest One',checkIn:'2026-10-15',checkOut:'2026-10-20',status:'confirmed',linkedCleaningId:''},
      {id:'b2',propId:'p-marjals',guestName:'Guest Two',checkIn:'2026-10-18',checkOut:'2026-10-21',status:'confirmed',linkedCleaningId:''},
      {id:'b3',propId:'p-casa',guestName:'Guest Three',checkIn:'2026-10-19',checkOut:'2026-10-22',status:'confirmed',linkedCleaningId:'s1'},
      {id:'b4',propId:'p-finca',guestName:'Guest Four',checkIn:'2026-10-23',checkOut:'2026-10-28',status:'confirmed',linkedCleaningId:''},
      {id:'b5',propId:'p-mar',guestName:'Guest Five',checkIn:'2026-10-21',checkOut:'2026-10-24',status:'cancelled',linkedCleaningId:''},
      {id:'b6',propId:'p-casa',guestName:'Guest Six',checkIn:'2026-10-22',checkOut:'2026-10-25',status:'confirmed',linkedCleaningId:''},
      {id:'b7',propId:'p-marjals',guestName:'Guest Seven',checkIn:'2026-10-21',checkInTime:'16:00',checkOut:'2026-10-30',status:'confirmed',linkedCleaningId:''}],
    sessions:[
      {id:'s1',propId:'p-casa',date:'2026-10-22',time:'10:00',status:'scheduled',cleanerIds:[],note:'Checkout cleaning'},
      {id:'s2',propId:'p-casa',date:'2026-10-25',time:'09:30',status:'scheduled',cleanerIds:[],note:''},
      {id:'s4',propId:'p-finca',date:'2026-10-21',time:'10:00',status:'scheduled',cleanerIds:['c1'],crew:{main:[{cleanerId:'c1',name:'Maribel',status:'confirmed'}],alinaSpots:0,alinaStatus:'offered'}}],
    tasks:[],issues:[]
  };
}
function setup(data=fixture(),{persist}={}){
  let n=0,saves=0;const stored={value:JSON.stringify(data)};
  const records=RECORDS.create({getData:()=>data,reference:()=>REF,required:()=>1});
  const engine=OPS.create({getData:()=>data,reference:()=>REF,records:()=>records,newId:()=>'new'+(++n),
    persist:persist||(()=>{saves++;stored.value=JSON.stringify(data);return {ok:true,cloud:'disabled'};})});
  return {data,records,engine,stored,saves:()=>saves};
}
const show=(engine,result)=>{engine.presented(result.plan.version);engine.heard(result.plan.version);return result.plan.version;};
const actions=plan=>plan.items.map(i=>i.n+':'+i.property+':'+i.action);

test('next week resolves Monday to Sunday and states the exact range, across month and year boundaries',()=>{
  assert.deepEqual(RECORDS.period('next_week','2026-10-18'),{name:'next_week',start:'2026-10-19',end:'2026-10-25',label:'next week'});
  assert.deepEqual(RECORDS.period('next_week','2026-10-19'),{name:'next_week',start:'2026-10-26',end:'2026-11-01',label:'next week'});
  assert.deepEqual([RECORDS.period('next_week','2026-12-30').start,RECORDS.period('next_week','2026-12-30').end],['2027-01-04','2027-01-10']);
  assert.deepEqual([RECORDS.period('next_month','2026-12-05').start,RECORDS.period('next_month','2026-12-05').end],['2027-01-01','2027-01-31']);
  assert.equal(RECORDS.period('next_month','2028-01-31').end,'2028-02-29');
  const {records}=setup();
  const r=records.run({entity:'bookings',view:'list',period:'next_week',start:'2026-01-01',end:'2026-01-02'});
  assert.match(r.text,/^Next week is Monday 19 to Sunday 25 October 2026\. I found 6 stays overlapping those dates\./);
  assert.equal(r.query.start,'2026-10-19');assert.equal(r.query.end,'2026-10-25');
  const arrivals=records.run({entity:'bookings',view:'list',period:'next_week',dateBy:'arrival'});
  assert.match(arrivals.text,/I found 4 arrivals/);
  assert.deepEqual(records.matches().ids,['b3','b7','b6','b4']);
});

test('the full booking set drives the plan with existing, linked, cancelled, same-day and outside-week items reported; nothing is written',()=>{
  const {data,records,engine,saves}=setup();const before=JSON.stringify(data);
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  assert.equal(r.kind,'plan');
  assert.deepEqual(actions(r.plan),['1:Villa Mar:create','2:Villa Marjals:create','3:Casa Ejemplo:exists','4:Casa Ejemplo:link','5:Finca Prueba:create','6:Villa Marjals:create']);
  assert.equal(r.plan.items[1].sameDayArrival,'16:00');
  assert.deepEqual(r.plan.items.filter(i=>i.outside).map(i=>i.n),[5,6]);
  assert.match(r.text,/I can schedule 4 checkout cleanings/);
  assert.match(r.text,/New guests arrive at Villa Marjals the same day at 16:00/);
  assert.match(r.text,/outside those dates/);
  assert.match(r.text,/Casa Ejemplo on Sunday 25 October already has a cleaning at 09:30; I’ll link it/);
  assert.match(r.text,/Nothing is saved yet/);
  assert.equal(JSON.stringify(data),before);assert.equal(saves(),0);
});

test('the matched set is used beyond the first visible page and never silently narrowed to it',()=>{
  const data=fixture();
  for(let i=0;i<10;i++)data.bookings.push({id:'x'+i,propId:i%2?'p-mar':'p-finca',guestName:'Extra '+i,checkIn:'2026-11-0'+(i%9+1),checkOut:'2026-11-1'+i,status:'confirmed',linkedCleaningId:''});
  const {records,engine}=setup(data);
  const list=records.run({entity:'bookings',view:'list',start:'2026-11-01',end:'2026-11-30'});
  assert.equal(list.rows.length,8);assert.equal(list.total,10);
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  assert.equal(r.plan.items.length,10);
});

test('follow-up revisions narrow, retime and remove items in the pending proposal without saving anything',()=>{
  const {data,records,engine,saves}=setup();const before=JSON.stringify(data);
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const first=engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  show(engine,first);
  // "Not Marjals, only Mar" — Mar must never match Marjals.
  const only=engine.handle({action:'revise',onlyProperties:['Mar']});
  assert.deepEqual(only.plan.items.filter(i=>i.action==='create').map(i=>i.property),['Villa Mar']);
  assert.ok(only.plan.version>first.plan.version);assert.equal(only.plan.heard,false);
  // "at ten... sorry, eleven" arrives as the corrected value.
  const timed=engine.handle({action:'revise',time:'11:00'});
  assert.equal(timed.plan.items[0].time,'11:00');
  assert.match(timed.text,/Villa Mar on Tuesday 20 October at 11:00/);
  // "leave that second one out" on the original numbering.
  const {engine:e2,records:r2}=setup();r2.run({entity:'bookings',view:'list',period:'next_week'});e2.handle({action:'plan_checkout_cleanings',scope:'results'});
  const removed=e2.handle({action:'revise',removeItems:[2]});
  assert.equal(removed.plan.items[1].action,'left_out');assert.equal(removed.plan.items[0].action,'create');
  assert.equal(JSON.stringify(data),before);assert.equal(saves(),0);
});

test('voice confirmation needs the completed read-back of the current version and Antonio’s explicit words; then it saves exactly once',()=>{
  const {data,records,engine,stored}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  let r=engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  r=engine.handle({action:'revise',onlyProperties:['Villa Mar','Casa Ejemplo']});
  engine.presented(r.plan.version);
  assert.equal(engine.commit({ownerText:'Confirm these cleanings',channel:'voice',version:r.plan.version}).needsReadback,true);
  engine.heard(r.plan.version);
  for(const said of ['yes','yes please','Should I confirm?','What if I confirm these?','He said confirm these cleanings','Confirm these cleanings but make it eleven','schedule them for Friday'])
    assert.equal(engine.commit({ownerText:said,channel:'voice',version:r.plan.version}).refused,true,said);
  assert.match(engine.commit({ownerText:'Yes, schedule those three',channel:'voice',version:r.plan.version}).text,/has 2 to save/);
  assert.equal(engine.commit({ownerText:'go ahead',channel:'voice',version:r.plan.version-1}).refused,true);
  assert.equal(data.sessions.length,3);
  const done=engine.commit({ownerText:'um, yeah, go ahead and create those',channel:'voice',version:r.plan.version});
  assert.equal(done.kind,'committed');
  assert.equal(done.created.length,1);assert.equal(done.linked.length,1);
  const made=data.sessions.find(s=>s.id===done.created[0].id);
  assert.deepEqual({propId:made.propId,date:made.date,time:made.time,status:made.status,cleanerIds:made.cleanerIds},{propId:'p-mar',date:'2026-10-20',time:'10:00',status:'scheduled',cleanerIds:[]});
  assert.equal(data.bookings.find(b=>b.id==='b1').linkedCleaningId,made.id);
  assert.equal(data.bookings.find(b=>b.id==='b6').linkedCleaningId,'s2');
  // Persisted copy (as reloaded) contains the same records.
  const reloaded=JSON.parse(stored.value);
  assert.ok(reloaded.sessions.some(s=>s.id===made.id));assert.equal(reloaded.bookings.find(b=>b.id==='b6').linkedCleaningId,'s2');
  assert.equal(engine.commit({ownerText:'go ahead',channel:'voice'}).duplicate,true);
  assert.equal(data.sessions.length,4);
  // Planning again shows them as already scheduled and creates nothing.
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const again=engine.handle({action:'plan_checkout_cleanings',scope:'results',onlyProperties:['Villa Mar']});
  assert.deepEqual(again.plan.items.filter(i=>i.action!=='left_out').map(i=>i.action),['exists']);
});

test('typed and on-screen confirmation require the plan to have been shown; the model cannot confirm by itself',()=>{
  const {data,records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'results',onlyProperties:['Mar']});
  // A model "confirm" tool call carries no owner words of its own.
  assert.equal(engine.handle({action:'confirm'},{ownerText:'',channel:'typed'}).refused,true);
  assert.equal(engine.commit({channel:'screen',version:r.plan.version}).refused,true);
  engine.presented(r.plan.version);
  assert.equal(engine.handle({action:'confirm'},{ownerText:'ok',channel:'typed'}).refused,true);
  const done=engine.commit({channel:'screen',version:r.plan.version});
  assert.equal(done.kind,'committed');assert.equal(data.sessions.length,4);
});

test('a booking change after the read-back stops the whole batch and produces a fresh plan needing a new review',()=>{
  const {data,records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'results'});const v=show(engine,r);
  data.bookings.find(b=>b.id==='b2').checkOut='2026-10-22';
  const out=engine.commit({ownerText:'confirm these cleanings',channel:'voice',version:v});
  assert.equal(out.stale,true);assert.match(out.text,/nothing was saved/);
  assert.equal(data.sessions.length,3);assert.ok(out.plan.version>v);assert.equal(out.plan.heard,false);
  data.bookings.find(b=>b.id==='b1').status='cancelled';
  const v2=show(engine,{plan:out.plan});
  const out2=engine.commit({ownerText:'confirm these cleanings',channel:'voice',version:v2});
  assert.equal(out2.stale,true);assert.equal(out2.plan.items.find(i=>i.n===1).action,'skip');
});

test('a failed save rolls back every in-memory change and reports failure, not success',()=>{
  const data=fixture();const before=JSON.stringify(data);
  const {records,engine}=setup(data,{persist:p=>p.rollback?{ok:true}:{ok:false,message:'Storage is full.'}});
  records.run({entity:'bookings',view:'list',period:'next_week'});
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'results'});show(engine,r);
  const out=engine.commit({ownerText:'go ahead and schedule them',channel:'voice',version:r.plan.version});
  assert.equal(out.kind,'failed');assert.match(out.text,/nothing was changed/);assert.doesNotMatch(out.text,/Scheduled/);
  assert.equal(JSON.stringify(data),before);
});

test('same-day arrivals and cleaner conflicts block confirmation until the plan is corrected',()=>{
  const {data,records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  engine.handle({action:'plan_checkout_cleanings',scope:'results',onlyProperties:['Marjals']});
  let r=engine.handle({action:'revise',time:'17:00',items:[1]});
  assert.equal(r.plan.items[1].action,'blocked');assert.match(r.text,/not before the same-day arrival at 16:00/);
  show(engine,r);
  assert.match(engine.commit({ownerText:'go ahead',channel:'voice',version:r.plan.version}).text,/needs a change first/);
  r=engine.handle({action:'revise',time:'11:00',items:[1],cleaners:['Maribel']});
  assert.equal(r.plan.items[1].action,'blocked');assert.match(r.plan.items[1].reason,/Maribel is already assigned/);
  r=engine.handle({action:'revise',cleaners:['Tanja'],items:[1]});
  assert.equal(r.plan.items[1].action,'create');assert.deepEqual(r.plan.items[1].cleaners,['Tanja']);
  assert.match(r.text,/with Tanja offered/);
  show(engine,r);
  const done=engine.commit({ownerText:'confirm',channel:'voice',version:r.plan.version});
  const s=data.sessions.find(x=>x.id===done.created.find(c=>c.date==='2026-10-21').id);
  assert.deepEqual(s.crew.main,[{cleanerId:'c2',name:'Tanja',status:'offered'}]);
});

test('approximate or unknown names: a clear transcription slip is stated, an ambiguous or unknown one is asked about',()=>{
  const props=fixture().props;
  assert.equal(OPS.resolveName('Mar',props,'property').match.id,'p-mar');
  assert.equal(OPS.resolveName('Marjals',props,'property').match.id,'p-marjals');
  const slip=OPS.resolveName('Marhals',props,'property');assert.equal(slip.match.id,'p-marjals');assert.equal(slip.assumed,'Marhals');
  assert.ok(OPS.resolveName('Marja',props,'property').ambiguous);
  assert.ok(OPS.resolveName('Villa',props,'property').ambiguous);
  assert.equal(OPS.resolveName('Sunset Lodge',props,'property').unknown,true);
  const {records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  const q=engine.handle({action:'revise',onlyProperties:['Sunset Lodge']});
  assert.equal(q.kind,'clarify');assert.equal(engine.view().items.filter(i=>i.action==='create').length,4,'pending plan is kept');
  const outside=engine.handle({action:'revise',onlyProperties:['Casa Ejemplo','Finca Prueba']});assert.equal(outside.kind,'plan');
  const notInPlan=setup();notInPlan.records.run({entity:'bookings',view:'list',period:'next_week',property:'Villa Mar'});notInPlan.engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  assert.match(notInPlan.engine.handle({action:'revise',onlyProperties:['Casa Ejemplo']}).text,/isn’t in this plan/);
});

test('a clarification keeps everything already understood and the answer only supplies what was missing',()=>{
  const {engine}=setup();
  const q=engine.handle({action:'plan_checkout_cleanings',time:'11:00',cleaners:['Tanja']});
  assert.equal(q.kind,'clarify');assert.match(q.text,/Which bookings/);
  assert.deepEqual(engine.context().clarification.collected,{time:'11:00',cleaners:['Tanja']});
  const r=engine.handle({action:'plan_checkout_cleanings',scope:'dates',period:'next_week'});
  assert.equal(r.kind,'plan');
  const make=r.plan.items.filter(i=>i.action==='create');
  assert.ok(make.length>0);assert.ok(make.every(i=>i.time==='11:00'));
  assert.match(r.text,/checkouts next week \(Monday 19 to Sunday 25 October 2026\)/);
  // Date scope uses checkout dates only, so later checkouts of overlapping stays are not included.
  assert.ok(!r.plan.items.some(i=>i.date>'2026-10-25'));
  const p=setup().engine.handle({action:'plan_checkout_cleanings',scope:'dates',period:'next_week',property:'Marhals'});
  assert.match(p.text,/I’ve taken “Marhals” to mean Villa Marjals/);
});

test('cancelling drops the plan; unsupported or malformed operations are rejected before anything happens',()=>{
  const {data,records,engine}=setup();const before=JSON.stringify(data);
  records.run({entity:'bookings',view:'list',period:'next_week'});
  engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  assert.match(engine.handle({action:'cancel'}).text,/Nothing was saved/);assert.equal(engine.pending(),false);
  for(const bad of [{action:'delete_bookings'},{action:'plan_checkout_cleanings',code:'D.sessions=[]'},{action:'revise',time:'25:00'},{action:'plan_checkout_cleanings',start:'2026-02-30'},{action:'revise',removeItems:[0]},{action:'plan_checkout_cleanings',scope:'everything'}])
    assert.equal(engine.handle(bad).kind,'error',JSON.stringify(bad));
  assert.deepEqual(OPS.sanitize({action:'revise',time:'11am',removeItems:'2, 3',onlyProperties:'Mar and Casa Ejemplo'}),{action:'revise',time:'11:00',removeItems:[2,3],onlyProperties:['Mar','Casa Ejemplo']});
  assert.deepEqual(OPS.sanitize({operation:'{"action":"cancel"}'}),{action:'cancel'});
  assert.equal(JSON.stringify(data),before);
});

test('plan numbers follow the cleanings being approved, so “the second one” matches what was seen and heard',()=>{
  const {records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  let r=engine.handle({action:'revise',onlyProperties:['Marjals','Finca']});
  assert.deepEqual(r.plan.items.filter(i=>i.shown).map(i=>i.shown+' '+i.property+' '+i.date),['1 Villa Marjals 2026-10-21','2 Finca Prueba 2026-10-28','3 Villa Marjals 2026-10-30']);
  assert.match(r.text,/1, Villa Marjals on Wednesday 21 October.*2, Finca Prueba on Wednesday 28 October.*3, Villa Marjals on Friday 30 October/);
  r=engine.handle({action:'revise',removeItems:[2]});
  assert.equal(r.plan.items.find(i=>i.property==='Finca Prueba').action,'left_out');
  assert.deepEqual(r.plan.items.filter(i=>i.shown).map(i=>i.shown+' '+i.date),['1 2026-10-21','2 2026-10-30']);
  assert.equal(engine.handle({action:'revise',removeItems:[3]}).kind,'clarify');
});

test('model context exposes plan items by number without guest names or record IDs',()=>{
  const {records,engine}=setup();
  records.run({entity:'bookings',view:'list',period:'next_week'});
  engine.handle({action:'plan_checkout_cleanings',scope:'results'});
  const c=JSON.stringify(engine.context());
  assert.match(c,/"n":1,"property":"Villa Mar","date":"2026-10-20","time":"10:00","status":"create"/);
  assert.doesNotMatch(c,/Guest|b1|s2|p-mar/);
});
