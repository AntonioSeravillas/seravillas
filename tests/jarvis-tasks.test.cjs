/* Natural task drafts with FICTIONAL records. Model output is mocked as the typed fields an interpretation would
   produce; the owner's own words (turns) are what the app grounds dates, villas and priority in and what approves. */
const test=require('node:test');
const assert=require('node:assert/strict');
const TASKS=require('../src/assistant/jarvis-tasks.js');
const OPS=require('../src/assistant/jarvis-operations.js');
const REF='2026-10-19'; // Monday

function fixture(){
  return {props:[{id:'p-mar',name:'Villa Mar'},{id:'p-marjals',name:'Villa Marjals'},{id:'p-casa',name:'Casa Ejemplo'}],
    tasks:[{id:'t1',text:'Check pool pump',propId:'p-mar',priority:'medium',urgent:false,done:false,dueDate:'2026-10-21'},
      {id:'t2',text:'Fix pool light',propId:'p-casa',priority:'low',urgent:false,done:false,dueDate:'2026-10-22'},
      {id:'t3',text:'Replace gate battery',propId:'',priority:'high',urgent:true,done:false,dueDate:''},
      {id:'t4',text:'Old finished job',propId:'',priority:'low',done:true,dueDate:''}]};
}
function engine({data=fixture(),persist}={}){
  const writes=[];let n=0;
  const e=TASKS.create({getData:()=>data,reference:()=>REF,newId:()=>'new'+(++n),resolveProperty:(s,p)=>OPS.resolveName(s,p,'property'),
    persist:persist||(change=>{writes.push(JSON.parse(JSON.stringify(change)));return {ok:true,cloud:'disabled'};})});
  /* The app's read-back: shown, then fully played. */
  const readBack=r=>{assert.equal(r.kind,'review',r.text);e.presented(r.version);e.heard(r.version);return r;};
  const say=(o,words)=>e.handle(o,{turns:[words]});
  return {e,data,writes,readBack,say};
}
const snapshot=d=>JSON.stringify(d.tasks);

test('natural create, correction of two fields, spoken yes saves exactly once with the revised details',()=>{
  const {e,data,writes,readBack,say}=engine();
  let r=say({action:'create',text:'check the pool pump',property:'Villa Mar',dueDate:'2026-10-20'},'Add a task to check the pool pump at Villa Mar tomorrow');
  assert.match(r.text,/New task: “Check the pool pump” at Villa Mar, due Tuesday 20 October, medium priority\. Shall I save it\?/);readBack(r);
  r=readBack(say({action:'revise',dueDate:'2026-10-23',priority:'high'},'Actually Friday, and make it high priority'));
  assert.match(r.text,/at Villa Mar, due Friday 23 October, high priority/);assert.equal(writes.length,0,'a correction never saves');
  assert.deepEqual(e.confirmation('Yes'),{verdict:'confirm',explicit:false});
  const saved=e.commit({version:r.version,ownerText:'Yes',channel:'voice'});
  assert.equal(saved.kind,'saved');assert.equal(writes.length,1);
  const t=data.tasks.at(-1);assert.deepEqual([t.text,t.propId,t.dueDate,t.priority,t.urgent,t.done],['Check the pool pump','p-mar','2026-10-23','high',true,false]);
  for(const again of ['Confirm','yes','Yes, save it'])assert.equal(e.commit({ownerText:again,channel:'voice'}).duplicate,true,again);
  assert.equal(writes.length,1,'repeated or duplicate transcripts never write twice');assert.equal(data.tasks.length,5);
});
test('missing wording: one short question, yes is not approval, the answer completes the same draft',()=>{
  const {e,writes,readBack,say}=engine();
  let r=say({action:'create',property:'Villa Mar'},'Add a task for Villa Mar');
  assert.deepEqual([r.kind,r.text],['question','What should the task say?']);
  assert.equal(e.confirmation('yes'),null,'yes to a question is not permission to save');assert.equal(e.commit({ownerText:'yes'}).refused,true);
  r=readBack(say({action:'revise',text:'restock the towels'},'Restock the towels'));assert.match(r.text,/“Restock the towels” at Villa Mar, no deadline, medium priority/);
  assert.equal(writes.length,0);
  /* A wording the owner never said is not taken from the model. */
  r=say({action:'create',text:'Repaint the shutters'},'Add a task please');assert.equal(r.kind,'question');
});
test('nothing is invented: villa, deadline and priority need support in his own words',()=>{
  const {say}=engine();
  const r=say({action:'create',text:'buy light bulbs',property:'Casa Ejemplo',dueDate:'2026-10-24',priority:'high'},'Add a task to buy light bulbs');
  assert.match(r.text,/New task: “Buy light bulbs”, no deadline, medium priority/);
  const unknown=say({action:'create',text:'fix the shower',property:'Villa Sol'},'Add a task to fix the shower at Villa Sol');assert.deepEqual([unknown.kind],['question']);assert.match(unknown.text,/Which villa/);
  const vague=say({action:'create',text:'service the boiler'},'Add a task to service the boiler sometime next week');assert.match(vague.text,/Which date/);
  const past=say({action:'create',text:'service the boiler'},'Add a task to service the boiler on 2 October 2026');assert.match(past.text,/already passed/);
  /* Carried over from the replaced structured-draft tests: an impossible date, and malformed or approval-like fields. */
  assert.match(say({action:'create',text:'service the boiler',dueDate:'2026-02-30'},'Add a task to service the boiler at the end of the month').text,/What date/);
  for(const bad of [{action:'create',text:42},{action:'create',text:'x'.repeat(301)},{action:'create',text:'service the boiler',approve:true},{action:'confirm'},{action:'update',option:'2'},{action:'update',option:9}])assert.equal(say(bad,'Add a task to service the boiler').refused,true,JSON.stringify(bad).slice(0,60));
});
test('villas resolve against current records, saved nicknames and misheard names; ambiguity asks, approval is not inferred',()=>{
  global.window={SV_JARVIS_PERSONAL:{resolve:(t,p,o={})=>/\blumina\b/i.test(t)?{match:p.find(x=>x.id==='p-mar'),alias:'Villa Lumina'}:null}};
  try{
    const {e,say}=engine();
    let r=say({action:'create',text:'water the garden',property:'Villa Mar'},'Add a task to water the garden at Villa Lumina');assert.match(r.text,/at Villa Mar/,'a saved nickname is his word for that villa');
    r=say({action:'create',text:'check the gutters',property:'Casa Ejemplu'},'Add a task to check the gutters at Casa Ejemplu');assert.match(r.text,/I took “Casa Ejemplu” as Casa Ejemplo\..*at Casa Ejemplo/);
    r=say({action:'create',text:'sweep the terrace',property:'Villa Mars'},'Add a task to sweep the terrace at Villa Mars');
    if(r.kind==='question'){assert.match(r.text,/Which villa/);assert.equal(e.confirmation('yes'),null,'yes to a villa question is not approval');}
  }finally{delete global.window;}
});
test('an ambiguous existing task asks which one; the choice keeps the requested change and only that field changes',()=>{
  const {e,data,writes,readBack,say}=engine();const before=JSON.parse(snapshot(data));
  let r=say({action:'update',task:'pool',priority:'high'},'Make the pool task high priority');
  assert.equal(r.kind,'question');assert.match(r.text,/1\. Check pool pump \(Villa Mar\); 2\. Fix pool light \(Casa Ejemplo\)\. Which one\?/);
  assert.equal(e.confirmation('yes'),null);
  r=readBack(e.choice('the second one'));assert.equal(r.text,'Change “Fix pool light”: high priority. Shall I make the change?');
  assert.equal(e.commit({version:r.version,ownerText:'confirm'}).kind,'saved');assert.equal(writes.length,1);
  const t2=data.tasks.find(t=>t.id==='t2');assert.deepEqual({...t2,priority:'low',urgent:false},before[1],'only the priority changed');assert.equal(t2.priority,'high');
  /* "it" then means the task just changed. */
  r=readBack(say({action:'update',task:'it',dueDate:''},'Remove the deadline from it'));assert.equal(r.text,'Change “Fix pool light”: no deadline. Shall I make the change?');
  e.commit({version:r.version,ownerText:'yes'});assert.equal(data.tasks.find(t=>t.id==='t2').dueDate,'');assert.equal(writes.length,2);
});
test('editing wording, villa, deadline and priority of one task, with the previous values shown',()=>{
  const {e,data,readBack,say}=engine();
  const r=readBack(say({action:'update',task:'gate battery',text:'replace the gate remote battery',property:'Casa Ejemplo',dueDate:'2026-10-24'},'Change the gate battery task to replace the gate remote battery at Casa Ejemplo by Saturday'));
  const v=e.view();assert.deepEqual(v.fields.map(f=>[f.label,f.value,f.was]),[['Task','Replace the gate remote battery','Replace gate battery'],['Villa','Casa Ejemplo','None'],['Deadline','Saturday 24 October','No deadline'],['Priority','High',undefined]]);
  e.commit({version:r.version,ownerText:'Yes'});const t=data.tasks.find(x=>x.id==='t3');assert.deepEqual([t.text,t.propId,t.dueDate,t.priority],['Replace the gate remote battery','p-casa','2026-10-24','high']);
});
test('decline, interruption, yes before any request, stale version and stale record',()=>{
  const {e,data,writes,readBack,say}=engine();const before=snapshot(data);
  assert.equal(e.confirmation('Yes'),null,'no draft: yes is nothing to approve');assert.equal(e.commit({ownerText:'Yes'}).refused,true);
  let r=readBack(say({action:'create',text:'oil the hinges'},'Add a task to oil the hinges'));
  assert.deepEqual(e.confirmation('No'),{verdict:'cancel'});assert.equal(e.cancel().kind,'cancelled');assert.equal(e.pending(),false);assert.equal(snapshot(data),before);
  /* Interrupted read-back: shown but not fully heard; voice approval re-presents it instead of saving. */
  r=say({action:'create',text:'oil the hinges'},'Add a task to oil the hinges');e.presented(r.version);
  const again=e.commit({version:r.version,ownerText:'yes',channel:'voice'});assert.equal(again.kind,'review');assert.match(again.text,/^Before I save anything, here are the details\./);assert.equal(writes.length,0);
  e.presented(again.version);e.heard(again.version);
  /* An older version (from before a correction) cannot approve the revised draft. */
  const revised=readBack(say({action:'revise',priority:'low'},'make it low priority'));
  assert.equal(e.commit({version:again.version,ownerText:'yes'}).kind,'review');assert.equal(writes.length,0);
  /* Stale record: the task changed elsewhere after review; nothing is written, the change is re-offered on the current task. */
  const s=readBack(say({action:'update',task:'check pool pump',priority:'high'},'Make check pool pump high priority'));
  data.tasks[0].text='Check pool pump and filter';
  const stale=e.commit({version:s.version,ownerText:'yes'});assert.equal(stale.stale,true);assert.match(stale.text,/changed since I read it, so nothing was saved/);
  assert.equal(data.tasks[0].priority,'medium');assert.equal(writes.length,0);
  readBack(stale);assert.equal(e.commit({version:stale.version,ownerText:'yes'}).kind,'saved');assert.deepEqual([data.tasks[0].text,data.tasks[0].priority],['Check pool pump and filter','high']);
});
test('a side question in between makes a bare yes a short re-check; an explicit save still works',()=>{
  const {e,writes,readBack,say}=engine();
  let r=readBack(say({action:'create',text:'order pool chlorine'},'Add a task to order pool chlorine'));
  e.aside();
  const check=e.commit({version:r.version,ownerText:'yes'});assert.equal(check.kind,'review');assert.match(check.text,/^Just to check: save the new task “Order pool chlorine”/);assert.equal(writes.length,0);
  assert.equal(e.commit({version:r.version,ownerText:'yes'}).kind,'saved');assert.equal(writes.length,1);
  r=readBack(say({action:'create',text:'order pool salt'},'Add a task to order pool salt'));e.aside();
  assert.equal(e.commit({version:r.version,ownerText:'Save the task'}).kind,'saved');assert.equal(writes.length,2);
});
test('storage failure: the result is reported as unverified and never retried',()=>{
  let attempts=0;const {e,readBack,say}=engine({persist:()=>{attempts++;return {ok:false};}});
  const r=readBack(say({action:'create',text:'test the smoke alarm'},'Add a task to test the smoke alarm'));
  const out=e.commit({version:r.version,ownerText:'yes'});assert.equal(out.kind,'uncertain');assert.match(out.text,/couldn’t verify .* won’t retry/);
  assert.match(e.commit({ownerText:'confirm'}).text,/won’t try that again/);assert.equal(attempts,1);
});
test('approval words are his own explicit yes/confirm only: quotes, questions, negation, reports and changes are not',()=>{
  for(const yes of ['Yes','yes please','Yeah, go ahead','Confirm','confirm it','OK','Sure, save it','Yes, add it','correct'])assert.equal(TASKS.approval(yes)?.verdict,'confirm',yes);
  for(const no of ['No','No thanks','Cancel','Cancel that','Forget it','Never mind','don’t save it'])assert.equal(TASKS.approval(no)?.verdict,'cancel',no);
  for(const not of ['He said yes','“Yes”','Yes?','Should I confirm?','Yes but make it Friday','Confirm the cleaning for Friday','If it’s fine then yes','I don’t think so','Approve and send','Shall I save it','Maybe','Not yet','yes, and also add one for the gate'])assert.equal(TASKS.approval(not),null,not);
  assert.equal(TASKS.approval('no, yes')?.verdict,'unclear');
});
test('dates come from the app’s own date: weekdays, next week, month names, removal',()=>{
  const d=s=>TASKS.spokenDate(s,REF);
  assert.equal(d('tomorrow').iso,'2026-10-20');assert.equal(d('the day after tomorrow').iso,'2026-10-21');assert.equal(d('Actually Friday').iso,'2026-10-23');
  assert.equal(d('next Friday').iso,'2026-10-30');assert.equal(d('this Sunday').iso,'2026-10-25');assert.equal(d('Monday').iso,'2026-10-26');
  assert.equal(d('on 22 October').iso,'2026-10-22');assert.equal(d('October 3rd').iso,'2027-10-03');assert.equal(d('the 25th').iso,'2026-10-25');
  assert.equal(d('remove the deadline').clear,true);assert.equal(d('no due date').clear,true);assert.equal(d('check the pump'),null);assert.equal(d('end of the month').vague,true);
});
