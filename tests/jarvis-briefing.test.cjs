/* Morning briefing from FICTIONAL records: the app's own rules (cancelled/done/resolved excluded, offered ≠ confirmed,
   no deadline is never overdue, only recorded times), gaps reported instead of zero, a short spoken summary that leads
   with problems, and the wording that asks for it. Pure functions: nothing is written. */
const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('../src/assistant/jarvis-briefing.js');
const DASH=require('../src/assistant/jarvis-dashboard.js');
const REF='2026-10-23';
const crew=(cleanerId,status)=>({cleanerId,status});
function data(){
  return {props:[{id:'mar',name:'Villa Mar'},{id:'casa',name:'Casa Ejemplo'},{id:'finca',name:'Finca Prueba'}],cleaners:[{id:'c1',name:'Sample Cleaner A'},{id:'c2',name:'Sample Cleaner B'}],
    bookings:[
      {id:'b1',propId:'mar',checkIn:REF,checkOut:'2026-10-27',status:'confirmed',checkInTime:'15:30',guestName:'Fictional Guest'},
      {id:'b2',propId:'casa',checkIn:REF,checkOut:'2026-10-25',status:'confirmed'},
      {id:'b3',propId:'finca',checkIn:'2026-10-18',checkOut:REF,status:'confirmed'},
      {id:'b4',propId:'mar',checkIn:REF,checkOut:'2026-10-24',status:'cancelled',checkInTime:'09:00'}],
    sessions:[
      {id:'s1',propId:'finca',date:REF,time:'11:00',status:'scheduled',crew:{main:[crew('c1','confirmed'),crew('c2','offered')]}},
      {id:'s2',propId:'casa',date:REF,time:'10:00',status:'scheduled',cleanerIds:['c1']},
      {id:'s3',propId:'mar',date:REF,status:'cancelled',crew:{main:[]}},
      {id:'s4',propId:'mar',date:'2026-10-25',time:'12:00',status:'scheduled',crew:{main:[crew('c2','offered')]}},
      {id:'s5',propId:'casa',date:'2026-11-05',status:'scheduled',crew:{main:[]}},
      {id:'s6',propId:'mar',date:REF,time:'08:00',status:'done',crew:{main:[]}}],
    tasks:[
      {id:'t1',text:'Fix the gate',dueDate:'2026-10-20',done:false},{id:'t2',text:'Restock towels',dueDate:REF,done:false,propId:'mar'},
      {id:'t3',text:'Undated job',dueDate:'',done:false,status:'today'},{id:'t4',text:'Old done',dueDate:'2026-10-01',done:true},{id:'t5',text:'Paint fence',dueDate:'2026-10-21',done:false}],
    issues:[
      {id:'i1',title:'Broken boiler',propId:'mar',status:'open',priority:'high'},{id:'i2',title:'Loose tile',propId:'casa',status:'waiting',priority:'medium',resolveBy:'2026-10-22'},
      {id:'i3',title:'Squeaky door',status:'in_progress',priority:'low'},{id:'i4',title:'Fixed leak',status:'resolved',priority:'high'}]};
}
const required=id=>id==='finca'?2:1;
const build=(d=data(),o={})=>B.build(d,REF,{required,now:new Date('2026-10-23T06:14:00Z'),dash:DASH,...o});
test('today from the full records: exclusions, recorded times only, crew state with offered kept apart, no inference',()=>{
  const d=data(),before=JSON.stringify(d),b=build(d);
  assert.equal(JSON.stringify(d),before,'building writes nothing');
  assert.equal(b.date,REF);assert.equal(b.dateLabel,'Friday 23 October 2026');assert.equal(b.checkedAt,'2026-10-23T06:14:00.000Z');assert.deepEqual(b.gaps,[]);
  assert.deepEqual(b.arrivals.map(a=>[a.property,a.time]),[['Villa Mar','15:30'],['Casa Ejemplo','']],'cancelled excluded; no default time is invented');
  assert.deepEqual(b.departures.map(a=>[a.property,a.time]),[['Finca Prueba','']]);
  assert.deepEqual(b.cleanings.map(c=>[c.id,c.state,c.confirmed,c.offered,c.required]),[['s6','done',0,0,1],['s2','confirmed',1,0,1],['s1','partial',1,1,2]],'by recorded time; legacy assignment counts as confirmed; the offered person is not confirmed');
  assert.deepEqual(b.needStaff.map(c=>c.id),['s1','s4'],'today and this week (to '+b.weekEnd+') only, not done, not cancelled, not beyond the window');
  assert.equal(b.weekEnd,'2026-10-29');
  assert.deepEqual(b.overdue.map(t=>t.id),['t1','t5'],'oldest first; completed and undated tasks are never overdue');assert.deepEqual(b.dueToday.map(t=>t.id),['t2']);
  assert.deepEqual(b.attentionIssues.map(i=>i.id),['i1','i2'],'high priority first, then a passed resolve-by date');assert.deepEqual(b.otherIssues.map(i=>i.id),['i3'],'resolved excluded');
  const items=B.items(b),keys=items.map(i=>i.entity+':'+i.id);assert.equal(new Set(keys).size,keys.length,'each record once');
  assert.ok(!JSON.stringify(b).includes('Fictional Guest'),'no guest identity');
});
test('spoken summary: problems first, the day grouped, about 30–45 seconds, details left to the card',()=>{
  const text=B.speech(build(),{owner:'Antonio',greet:true});
  assert.match(text,/^Good morning, Antonio\. Here’s your briefing for Friday 23 October\./);
  const staff=text.indexOf('need confirmed staff'),today=text.indexOf('Today:');assert.ok(staff>0&&today>staff,'problems lead');
  assert.match(text,/2 cleanings still need confirmed staff: Finca Prueba today at 11:00 and Villa Mar Sunday at 12:00\./);
  assert.match(text,/2 tasks are overdue, the oldest due 20 Oct\./);assert.match(text,/One high-priority issue: Broken boiler at Villa Mar\./);assert.match(text,/1 issue is past its resolve-by date\./);
  assert.match(text,/Today: 2 arrivals \(first at 15:30\), 1 departure, 3 cleanings, 1 task due\./);assert.match(text,/1 other open issue\./);
  assert.doesNotMatch(text,/Nothing needs attention/);assert.match(text,/The details are on screen\.$/);
  const words=text.split(/\s+/).length;assert.ok(words>=40&&words<=120,'about 30–45 seconds of speech ('+words+' words)');
  assert.doesNotMatch(B.speech(build(),{owner:'Antonio'}),/Good morning/,'no greeting unless he greeted');
});
test('an empty day and an all-clear are stated only within the records checked; missing records are a gap, not zero',()=>{
  const empty=build({props:[],bookings:[],sessions:[],tasks:[],issues:[]});
  const t=B.speech(empty);assert.match(t,/No arrivals, departures or cleanings are recorded for today\./);assert.match(t,/Nothing needs attention in the bookings, cleanings, tasks and issues I checked\./);
  assert.match(B.html(empty),/No arrivals, departures or cleanings recorded for today\./);
  const partial=build({props:[],bookings:[],sessions:[],tasks:[]});
  assert.deepEqual(partial.gaps,['issues']);assert.equal(partial.attentionIssues,null);
  const s=B.speech(partial);assert.match(s,/I couldn’t check issues, so this isn’t complete\./);assert.doesNotMatch(s,/Nothing needs attention/,'no all-clear with a gap');
  assert.match(B.html(partial),/Not checked: issues \(records unavailable\)\./);
  const failed=build(undefined,{sync:{status:'error',lastSync:0}});assert.match(B.speech(failed),/Cloud sync last failed, so this device’s records may be out of date\./);
});
test('card: exact date, checked-at time in the business time zone, sections, existing record links, escaped values, out-of-date notice',()=>{
  const d=data();d.issues[0].title='Broken <b>boiler</b>';const b=build(d);
  const h=B.html(b,{timeZone:'Europe/Madrid'});
  assert.match(h,/Briefing · Friday 23 October 2026/);assert.match(h,/Checked 08:14 · this device’s app records · staff checked to 29 Oct/);
  assert.ok(h.indexOf('Needs attention')<h.indexOf('Today’s schedule')&&h.indexOf('Today’s schedule')<h.indexOf('Open work'));
  assert.match(h,/data-j="open-record" data-entity="cleanings" data-id="s1"/);assert.match(h,/Partly confirmed · 1 of 2 confirmed · 1 offered/);assert.match(h,/No time recorded · Casa Ejemplo/);
  assert.ok(h.includes('Broken &lt;b&gt;boiler&lt;/b&gt;')&&!h.includes('<b>boiler'));assert.match(h,/data-j="briefing-refresh"/);
  assert.match(B.html(b,{stale:'Records have changed since it was checked.'}),/Records have changed since it was checked\. Say “refresh my briefing” or tap Refresh\./);
  const d2=data();assert.equal(B.fingerprint(d2),B.fingerprint(data()));d2.tasks[1].done=true;assert.notEqual(B.fingerprint(d2),B.fingerprint(data()),'a record change is detected');
});
test('wording: the briefing and its refresh are recognised; filtered questions, plain greetings and refusals are not',()=>{
  for(const t of ['Good morning Jarvis, give me my briefing','What needs my attention today?','Brief me please','Can I have my morning briefing?','What’s on today?','How is today looking?','Run me through today','Give me an overview of the day'])assert.equal(B.intent(t)?.kind,'briefing',t);
  assert.equal(B.intent('Good morning Jarvis, give me my briefing').greet,true);assert.equal(B.intent('What needs my attention today?').greet,false);
  for(const t of ['Refresh my briefing','Update the briefing','Run the briefing again'])assert.equal(B.intent(t)?.kind,'refresh',t);
  for(const t of ['Good morning Jarvis','Which arrivals are there today?','Who cleans Villa Mar today?','Don’t give me a briefing','Show me the overdue tasks'])assert.equal(B.intent(t),null,t);
  assert.equal(B.followUp('Which cleanings need staff?').kind,'staff');assert.equal(B.followUp('Show me the overdue tasks.').kind,'overdue');assert.equal(B.followUp('What time is the first arrival?').kind,'first-arrival');
  assert.deepEqual(B.followUp('Open that issue'),{kind:'open',entity:'issues',what:'issue'});assert.equal(B.followUp('Open that departure').entity,'bookings');assert.equal(B.followUp('Tell me a joke'),null);
  const options=[{label:'Broken boiler at Villa Mar'},{label:'Loose tile at Casa Ejemplo'}];
  assert.equal(B.choose(options,'the boiler one'),options[0]);assert.equal(B.choose(options,'the second'),options[1]);assert.equal(B.choose(options,'Casa Ejemplo'),options[1]);assert.equal(B.choose(options,'hmm'),null);
});
