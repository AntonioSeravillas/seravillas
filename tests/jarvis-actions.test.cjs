const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="\.\/([^"]+)"[^>]*><\/script>/g)].map(m=>m[1].split('?')[0]).filter(file=>file!=='src/app.js');
const REF='2026-10-14';
const plain=value=>JSON.parse(JSON.stringify(value));

/* Disposable fixture data only. No storage, network or real records are touched. */
const FIXTURE=`D.props=[{id:'p-mar',name:'Villa Mar'},{id:'p-marjals',name:'Villa Marjals'},{id:'p-casa',name:'Casa Ejemplo'}];
D.cleaners=[{id:'a',name:'Maribel'},{id:'b',name:'Bea'}];D.bookings=[];D.issues=[];D.projects=[];
D.tasks=[
 {id:'t1',text:'Check pool pump',propId:'p-casa',priority:'medium',urgent:false,done:false,dueDate:'',type:'ops',projectId:''},
 {id:'t2',text:'Check pool lights',propId:'p-marjals',priority:'medium',urgent:false,done:false,dueDate:'',type:'ops',projectId:''},
 {id:'t3',text:'Restock towels',propId:'p-mar',priority:'high',urgent:true,done:false,dueDate:'2026-10-15',type:'ops',projectId:''},
 {id:'t4',text:'Old task',propId:'',priority:'low',urgent:false,done:true,dueDate:'',type:'ops',projectId:''}];
D.sessions=[
 {id:'s1',propId:'p-casa',date:'2026-10-22',time:'10:00',status:'scheduled',note:'Checkout cleaning',cleanerIds:['a'],crew:{main:[{cleanerId:'a',name:'Maribel',status:'confirmed',completedAt:'old'}],alinaSpots:0,alinaStatus:'offered'}},
 {id:'s2',propId:'p-mar',date:'2026-10-23',time:'09:00',status:'scheduled',note:'',cleanerIds:['a'],crew:{main:[{cleanerId:'a',name:'Maribel',status:'confirmed'}],alinaSpots:0,alinaStatus:'offered'}},
 {id:'s3',propId:'p-marjals',date:'2026-10-22',time:'',status:'scheduled',note:'',cleanerIds:['b']},
 {id:'s4',propId:'p-casa',date:'2026-10-25',time:'',status:'done',note:'',cleanerIds:['b']},
 {id:'s5',propId:'p-casa',date:'2026-10-26',time:'',status:'cancelled',note:'',cleanerIds:[]},
 {id:'s6',propId:'p-mar',date:'2026-10-28',time:'09:00',status:'scheduled',note:'',cleanerIds:[]},
 {id:'s7',propId:'p-mar',date:'2026-10-28',time:'15:00',status:'scheduled',note:'',cleanerIds:[]}];`;

function runtime(){
  const requests=[],fields=new Map();let loading=true;
  const node=()=>({value:'',style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},setAttribute(){},removeAttribute(){},getAttribute(){return 'light';},appendChild(){},insertBefore(){},addEventListener(){},textContent:'',hidden:true,disabled:false});
  const sandbox={console,location:{hostname:'127.0.0.1',protocol:'http:',reload(){throw Error('Unexpected reload');}},
    document:{addEventListener(){},createElement:node,body:node(),documentElement:node(),getElementById:id=>fields.has(id)?fields.get(id):loading?node():null,querySelector:()=>node(),querySelectorAll:()=>[]},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    fetch(url){requests.push(String(url));return Promise.reject(Error('Network disabled in tests'));},
    setTimeout(){return 0;},clearTimeout(){},setInterval(){throw Error('Unexpected interval');},requestAnimationFrame(){},cancelAnimationFrame(){},
    alert(){throw Error('Unexpected alert');},confirm(){return false;},navigator:{},performance:{now:()=>1},
    toasts:[],modals:[],closed:0,saves:0};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  loading=false;
  run("render=function(){};updateHeader=function(){};toast=function(m){toasts.push(String(m))};showModal=function(h){modals.push(h)};closeModal=function(){closed++};save=function(){saves++};");
  run(FIXTURE);
  const app={run,context,requests,fields,
    data:()=>run('JSON.stringify(D)'),
    route:(text,mode='local')=>plain(run('SV_JARVIS_ACTIONS.route('+JSON.stringify(text)+','+JSON.stringify(mode)+','+JSON.stringify(REF)+')')),
    current:()=>plain(run('SV_JARVIS_ACTIONS.current()')),
    open(text){const r=app.route(text);assert.equal(r.kind,'review',text+' → '+JSON.stringify(r));assert.equal(run('SV_JARVIS_ACTIONS.openReview('+JSON.stringify(r.draft)+')'),true);app.fill();return r.draft;},
    fill(){const d=app.current();for(const [id,value] of Object.entries(d.form))fields.set(id,{value});fields.set('jx-confirm',{disabled:false});fields.set('jx-review-error',{textContent:'',hidden:true});},
    confirm:()=>run('SV_JARVIS_ACTIONS.confirm()'),
    task:id=>plain(run(`D.tasks.find(t=>t.id===${JSON.stringify(id)})`)),
    session:id=>plain(run(`D.sessions.find(s=>s.id===${JSON.stringify(id)})`))};
  return app;
}
const CREATE='Add task for Casa Ejemplo due 22 October 2026 high priority: replace pool filter';
const UPDATE='Change task check pool pump due date to 22 October 2026';
const MOVE='Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at 11:00';

test('explicit requests open an editable review with no mutation, save, staff notice or network; Cancel changes nothing',()=>{
  const app=runtime();const before=app.data();
  for(const command of [CREATE,UPDATE,MOVE]){
    app.open(command);const modal=app.context.modals.at(-1);
    assert.match(modal,/Nothing is saved until you press <b>Confirm<\/b>/);assert.match(modal,/>Confirm</);assert.match(modal,/>Cancel</);assert.match(modal,/Now<\/span><span>Proposed/);
    app.run('SV_JARVIS_ACTIONS.cancel()');assert.equal(app.current(),null);assert.equal(app.confirm(),false);
  }
  assert.match(app.context.modals[2],/Staff: Maribel/);assert.match(app.context.modals[2],/asked to confirm again/);assert.match(app.context.modals[2],/id="e-date"[^>]*value="2026-10-24"/);
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.context.toasts.length,0);assert.equal(app.requests.length,0);
});

test('a confirmed new task is created once with the reviewed and edited values',()=>{
  const app=runtime();const others=JSON.stringify(app.run('D.tasks'));
  const draft=app.open(CREATE);assert.deepEqual(draft.proposed,{text:'replace pool filter',propId:'p-casa',dueDate:'2026-10-22',priority:'high'});
  app.fields.get('nt-text').value='Replace pool filter cartridge';
  assert.equal(app.confirm(),true);assert.equal(app.confirm(),false);assert.equal(app.context.saves,1);
  const tasks=plain(app.run('D.tasks'));assert.equal(tasks.length,5);assert.equal(JSON.stringify(tasks.slice(0,4)),others);
  const added=tasks[4];assert.equal(added.text,'Replace pool filter cartridge');assert.equal(added.propId,'p-casa');assert.equal(added.dueDate,'2026-10-22');assert.equal(added.priority,'high');assert.equal(added.urgent,true);assert.equal(added.done,false);
  assert.equal(app.requests.length,0);
});

test('a task change edits only the matched task due date or priority, once',()=>{
  const app=runtime();const before=plain(app.run('D.tasks'));
  const draft=app.open(UPDATE);assert.equal(draft.id,'t1');assert.deepEqual(draft.current,{text:'Check pool pump',propId:'p-casa',dueDate:'',priority:'medium'});assert.deepEqual(draft.proposed,{dueDate:'2026-10-22',priority:'medium'});
  assert.equal(app.confirm(),true);assert.equal(app.confirm(),false);assert.equal(app.context.saves,1);
  const after=plain(app.run('D.tasks'));assert.deepEqual(after[0],{...before[0],dueDate:'2026-10-22'});assert.deepEqual(after.slice(1),before.slice(1));
  const priority=app.open('Set task restock towels priority to low');assert.equal(priority.id,'t3');assert.equal(priority.proposed.priority,'low');assert.equal(priority.proposed.dueDate,'2026-10-15');
  assert.equal(app.confirm(),true);assert.equal(app.task('t3').priority,'low');assert.equal(app.task('t3').urgent,false);assert.equal(app.task('t3').dueDate,'2026-10-15');assert.equal(app.context.saves,2);
});

test('a confirmed cleaning move uses the native save: staff re-confirm, completion stamp cleared, note kept',()=>{
  const app=runtime();const before=plain(app.run('D.sessions'));
  const draft=app.open(MOVE);assert.equal(draft.id,'s1');assert.deepEqual(draft.proposed,{date:'2026-10-24',time:'11:00'});
  assert.equal(app.confirm(),true);assert.equal(app.confirm(),false);assert.equal(app.context.saves,1);assert.ok(app.context.toasts.includes('Session updated!'));
  const moved=app.session('s1');assert.equal(moved.date,'2026-10-24');assert.equal(moved.time,'11:00');assert.equal(moved.note,'Checkout cleaning');assert.equal(moved.crew.main[0].status,'offered');assert.equal(moved.crew.main[0].completedAt,undefined);assert.deepEqual(moved.cleanerIds,['a']);
  assert.deepEqual(plain(app.run('D.sessions')).slice(1),before.slice(1));assert.equal(app.requests.length,0);
});

test('native staff conflict rule blocks a move; the review stays open and a free date then succeeds once',()=>{
  const app=runtime();const before=app.data();
  app.open('Reschedule the cleaning at Casa Ejemplo on 22 October 2026 to 23 October 2026');
  assert.equal(app.confirm(),false);assert.equal(app.data(),before);assert.equal(app.context.saves,0);
  assert.ok(app.context.toasts.includes('A cleaner is already assigned elsewhere that day'));assert.notEqual(app.current(),null);assert.equal(app.fields.get('jx-review-error').hidden,false);assert.equal(app.fields.get('jx-confirm').disabled,false);
  app.fields.get('e-date').value='2026-10-24';assert.equal(app.confirm(),true);assert.equal(app.session('s1').date,'2026-10-24');assert.equal(app.session('s1').time,'10:00');assert.equal(app.context.saves,1);
});

test('stale records are refused on Confirm and the draft is discarded',()=>{
  const app=runtime();
  app.open(UPDATE);app.run("D.tasks[0].text='Changed on another device'");assert.equal(app.confirm(),false);assert.equal(app.task('t1').dueDate,'');assert.equal(app.current(),null);assert.match(app.fields.get('jx-review-error').textContent,/changed after the review opened/);
  app.open(MOVE);app.run("D.sessions[0].time='12:00'");assert.equal(app.confirm(),false);assert.equal(app.session('s1').date,'2026-10-22');assert.equal(app.current(),null);
  app.open('Move the cleaning at Villa Mar on 28 October 2026 at 09:00 to 29 October 2026');app.run("D.sessions.find(s=>s.id==='s6').status='done'");assert.equal(app.confirm(),false);assert.equal(app.session('s6').date,'2026-10-28');
  app.open('Add task for Casa Ejemplo: check lockbox');app.run("D.props=D.props.filter(p=>p.id!=='p-casa')");assert.equal(app.confirm(),false);assert.equal(app.run('D.tasks.length'),4);assert.notEqual(app.current(),null);
  assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('properties resolve exactly; unknown, partial and duplicate names are refused',()=>{
  const app=runtime();
  assert.equal(app.route('Add task for Villa Mar: check gate').draft.proposed.propId,'p-mar');
  assert.equal(app.route('Add task for Villa Marjals: check gate').draft.proposed.propId,'p-marjals');
  assert.equal(app.route('Move the cleaning at Villa Marjals on 22 October 2026 to 24 October 2026').draft.id,'s3');
  assert.equal(app.route('Add task check gate for Casa Ejemplo tomorrow').draft.proposed.text,'check gate');
  for(const [command,reply] of [
    ['Add task for Casa Nueva: check gate',/couldn’t find “Casa Nueva”/],
    ['Move the cleaning at Marjals on 22 October 2026 to 24 October 2026',/full name/],
    ['Move the cleaning on 22 October 2026 to 24 October 2026',/Which property/],
    ['Move the cleaning at Casa Ejemplo on 22 October 2026 to Villa Mar',/not its property/]
  ])assert.match(app.route(command).message,reply,command);
  app.run("D.props.push({id:'p-copy',name:'Casa Ejemplo'})");assert.match(app.route('Add task for Casa Ejemplo: check gate').message,/more than one property/);
});

test('unknown properties are never dropped silently, even beside a valid one; unsupported priorities ask instead of defaulting',()=>{
  const app=runtime();const before=app.data();
  for(const [command,reply] of [
    ['Add task for Ocean House due tomorrow: test',/couldn’t find “Ocean House”/],
    ['Add task for ocean house due tomorrow: test',/didn’t understand “ocean house”/],
    ['Add task for Casa Ejemplo and Ocean House: test',/ocean house/i],
    ['Add task check gate for Casa Ejemplo at Ocean House',/couldn’t find “Ocean House”/],
    ['Add task for Casa Ejemplo at Villa Marjals Beach: test',/more than one property/],
    ['Add task for Villa Marjals Beach: test',/couldn’t find “Villa Marjals Beach”/],
    ['Change task check pool pump at Ocean House to 22 October 2026',/couldn’t find “Ocean House”/],
    ['Move the cleaning at Casa Ejemplo and Ocean House on 22 October 2026 to 24 October 2026',/ocean house/i],
    ['Move the cleaning at Ocean House on 22 October 2026 to 24 October 2026',/couldn’t find “Ocean House”/],
    ['Add task for Casa Ejemplo priority critical: test',/high, medium or low/],
    ['Add task for Casa Ejemplo critical priority: test',/high, medium or low/],
    ['Add task check pump top priority',/high, medium or low/],
    ['Change task check pool pump to 22 October 2026 and critical priority',/high, medium or low/],
    ['Change the priority of task check pool pump to critical',/Which priority/]
  ]){const r=app.route(command);assert.equal(r.kind,'correct',command+' → '+JSON.stringify(r));assert.match(r.message,reply,command);}
  const ok=app.route('Add task for Casa Ejemplo due tomorrow priority high: test').draft.proposed;
  assert.deepEqual(ok,{text:'test',propId:'p-casa',dueDate:'2026-10-15',priority:'high'});
  assert.equal(app.route('Add task: buy gift for Antonio').draft.proposed.propId,'');
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('ambiguous or unknown tasks and cleanings, invalid dates and times, and closed cleanings are refused',()=>{
  const app=runtime();const before=app.data();
  for(const [command,reply] of [
    ['Change task check pool to 22 October 2026',/2 open tasks match/],
    ['Change task call the mayor to 22 October 2026',/couldn’t find an open task/],
    ['Change task old task to 22 October 2026',/couldn’t find an open task/],
    ['Change task check pool pump to 31 February 2026',/doesn’t exist/],
    ['Change task check pool pump to 22 October',/include the year/],
    ['Change task check pool pump to 22/10/2026',/day, month and year/],
    ['Change task check pool pump to next Friday',/day, month and year/],
    ['Change the priority of task check pool pump to soon',/Which priority/],
    ['Move the cleaning at Villa Mar on 28 October 2026 to 29 October 2026',/2 cleanings at Villa Mar/],
    ['Move the cleaning at Casa Ejemplo to 24 October 2026',/current date/],
    ['Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at 25:00',/time doesn’t exist/],
    ['Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at 11:00 and 12:00',/Which new time/],
    ['Move the cleaning at Casa Ejemplo on 25 October 2026 to 27 October 2026',/already completed/],
    ['Move the cleaning at Casa Ejemplo on 26 October 2026 to 27 October 2026',/cancelled/],
    ['Move the cleaning at Casa Ejemplo on 20 October 2026 to 27 October 2026',/couldn’t find a cleaning/],
    ['Move the cleaning at Casa Ejemplo on 22 October 2026 to 22 October 2026 at 10:00',/already at that date/]
  ]){const r=app.route(command);assert.equal(r.kind,'correct',command);assert.match(r.message,reply,command);}
  assert.equal(app.route('Move the cleaning at Villa Mar on 28 October 2026 at 15:00 to 29 October 2026').draft.id,'s7');
  assert.equal(app.route('Move the cleaning at Casa Ejemplo on 2026-10-22 to tomorrow').draft.proposed.date,'2026-10-15');
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);
});

test('App tools and Hermes route explicit requests into review; questions, negations and hypotheticals ask instead; normal questions keep chatting',()=>{
  const app=runtime();const before=app.data();
  for(const mode of ['local','hermes']){
    for(const command of [CREATE,UPDATE,MOVE,'Jarvis, add task: buy pool chlorine'])assert.equal(app.route(command,mode).kind,'review',mode+' '+command);
    for(const command of ['Can you add a task?','Could you move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','Don’t add a task for Casa Ejemplo',"Don't move the cleaning at Casa Ejemplo",'If I move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','Maybe add a task: test','Add task check the pump if it rains','Move the cleaning at Casa Ejemplo on 22 October 2026 to 23 or 24 October 2026','"Add task: quoted"'])assert.equal(app.route(command,mode).kind,'reply',mode+' '+command);
    assert.equal(app.route('Add task',mode).kind,'correct');
    for(const command of ['How many cleanings next week?','What tasks are due today?','Hello Jarvis','Remind me what changed in the cleaning schedule'])assert.equal(app.route(command,mode).kind,'chat',mode+' '+command);
  }
  assert.equal(app.route('Add issue for Villa Mar: AC not cooling','local').kind,'legacy');assert.equal(app.route('Add note for Villa Mar: baby cot','local').kind,'legacy');
  assert.equal(app.route('Add issue for Villa Mar: AC not cooling','hermes').kind,'chat');
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('Jarvis send opens the review locally without network, and an ordinary question does not',async()=>{
  const app=runtime();const before=app.data();
  await app.run("SV_JARVIS.send('Add task for Casa Ejemplo: check lockbox code')");
  assert.equal(app.context.modals.length,1);assert.match(app.context.modals[0],/Review new task/);assert.equal(app.current().proposed.text,'check lockbox code');
  await app.run("SV_JARVIS.send('How many cleanings next week?')");assert.equal(app.context.modals.length,1);
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

/* Exact recognised inputs from the live voice test. */
const LIVE=[
  'Move the cleaning at Casa a Hemplo on 22nd of October 2026 to 24 of October 2026 at 11.',
  'Move Move the cleaning at Casa Ejemplo on 22nd of October 2026 to 24 of October 2026 at 11.',
  'No, you should move the cleaning at Casa Ejemplo on 22nd October 2026 to 24th of October 2026 at 11:00.',
  'I need you to move the cleaning at Casa El Jamplo on 22nd of October to 24th of October 2026 at 11:00.'
];
function openFix(app,text){
  const r=app.route(text);assert.equal(r.kind,'correct',text+' → '+JSON.stringify(r));
  assert.equal(app.run('SV_JARVIS_ACTIONS.openCorrection('+JSON.stringify(r.correction)+')'),true);
  app.fields.set('jx-command',{value:r.correction.command});app.fields.set('jx-fix-error',{textContent:r.correction.message});
  return r;
}
const fixText=app=>app.fields.get('jx-command').value,fixError=app=>app.fields.get('jx-fix-error').textContent;

test('live inputs: a repeated verb and corrective lead-in open the review with the bare hour shown as 11:00',()=>{
  const app=runtime();const before=app.data();
  for(const text of [LIVE[1],LIVE[2]]){
    const r=app.route(text);assert.equal(r.kind,'review',text);assert.equal(r.draft.id,'s1');assert.deepEqual(r.draft.proposed,{date:'2026-10-24',time:'11:00'});
    app.run('SV_JARVIS_ACTIONS.openReview('+JSON.stringify(r.draft)+')');assert.match(app.context.modals.at(-1),/Proposed: Sat 24 Oct 2026 at 11:00 \(24-hour clock\)/);app.run('SV_JARVIS_ACTIONS.cancel()');
  }
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('live input with a misheard property opens a correction; choosing Casa Ejemplo keeps the dates and time and leads to review without saving',()=>{
  const app=runtime();const before=app.data();
  const r=openFix(app,LIVE[0]);assert.equal(r.correction.command,LIVE[0].trim());assert.match(r.message,/couldn’t find “Casa a Hemplo”/);
  const modal=app.context.modals.at(-1);assert.match(modal,/Check the request/);assert.match(modal,/<textarea id="jx-command"[^>]*>Move the cleaning at Casa a Hemplo/);assert.match(modal,/<option value="p-casa">Casa Ejemplo<\/option>/);assert.match(modal,/Review command/);
  assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),false);assert.equal(app.current(),null);assert.match(fixError(app),/Casa a Hemplo/);
  assert.equal(app.run("SV_JARVIS_ACTIONS.useProperty('not-a-property')"),false);assert.equal(fixText(app),LIVE[0]);
  assert.equal(app.run("SV_JARVIS_ACTIONS.useProperty('p-casa')"),true);
  assert.equal(fixText(app),'Move the cleaning at Casa Ejemplo on 22nd of October 2026 to 24 of October 2026 at 11.');
  const modals=app.context.modals.length;assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),true);
  assert.equal(app.context.modals.length,modals+1);assert.match(app.context.modals.at(-1),/Review cleaning move/);
  assert.deepEqual(app.current().proposed,{date:'2026-10-24',time:'11:00'});assert.equal(app.run('SV_JARVIS_ACTIONS.correction()'),null);
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('live input with an unknown property and a missing year stays in correction until both are fixed',()=>{
  const app=runtime();const before=app.data();
  assert.match(openFix(app,LIVE[3]).message,/couldn’t find “Casa El Jamplo”/);
  assert.equal(app.run("SV_JARVIS_ACTIONS.useProperty('p-casa')"),true);
  assert.equal(fixText(app),'I need you to move the cleaning at Casa Ejemplo on 22nd of October to 24th of October 2026 at 11:00.');
  assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),false);assert.match(fixError(app),/include the year in “22nd of October”/);assert.equal(app.current(),null);
  app.fields.get('jx-command').value='I need you to move the cleaning at Casa Ejemplo on 22nd of October 2026 to 24th of October 2026 at 11:00.';
  assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),true);assert.deepEqual(app.current().proposed,{date:'2026-10-24',time:'11:00'});
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);
});

test('correction refuses invalid text, adds a missing property only where expected, and Cancel changes nothing',()=>{
  const app=runtime();const before=app.data();
  openFix(app,'Move the cleaning on 22 October 2026 to 24 October 2026 at 11:00');assert.match(fixError(app),/Which property/);
  app.run("SV_JARVIS_ACTIONS.useProperty('p-casa')");assert.equal(fixText(app),'Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at 11:00');
  for(const [text,reply] of [['hello there',/isn’t a task or cleaning change/],['Can you move the cleaning?',/direct request/],['Move the cleaning at Casa Ejemplo on 22 October to 24 October 2026',/include the year/],['Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at 25',/time doesn’t exist/]]){
    app.fields.get('jx-command').value=text;assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),false,text);assert.match(fixError(app),reply,text);assert.equal(app.current(),null);
  }
  app.run('SV_JARVIS_ACTIONS.cancel()');assert.equal(app.run('SV_JARVIS_ACTIONS.correction()'),null);assert.equal(app.run('SV_JARVIS_ACTIONS.recheck()'),false);
  assert.equal(app.data(),before);assert.equal(app.context.saves,0);assert.equal(app.requests.length,0);assert.equal(app.context.toasts.length,0);
});

test('bare clock hours use 24-hour notation; am/pm converts; invalid or multiple times are refused',()=>{
  const app=runtime();const base='Move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026 at ';
  for(const [time,expected] of [['11','11:00'],['7pm','19:00'],['12am','00:00'],['9:30 am','09:30'],["11 o'clock",'11:00'],['23','23:00']])assert.equal(app.route(base+time).draft.proposed.time,expected,time);
  for(const time of ['25','13pm','11:75','11:00 and 12:00'])assert.equal(app.route(base+time).kind,'correct',time);
});

test('only bounded direct-request lead-ins are normalised; questions, negations and third-party words never become actions',()=>{
  const app=runtime();
  for(const text of ['I want you to add task: buy chlorine','I would like you to add task: buy chlorine','I’d like you to add task: buy chlorine','You should add task: buy chlorine','Add add task: buy chlorine','Jarvis, please, I need you to add task: buy chlorine'])assert.equal(app.route(text).draft.proposed.text,'buy chlorine',text);
  for(const text of ['I need you to not move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','You should move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026?','No, move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','Should you move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','He said I need you to move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026','"I need you to move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026"',"No, you shouldn't move the cleaning at Casa Ejemplo on 22 October 2026 to 24 October 2026"])assert.equal(app.route(text).kind,'reply',text);
});

test('a standalone time or date fragment gets a short local question in both modes, with no network, save or form',async()=>{
  const app=runtime();const before=app.data();
  for(const mode of ['local','hermes'])for(const text of ['11:00','at 11','11:00.','22 October 2026'])assert.equal(app.route(text,mode).kind,'reply',mode+' '+text);
  await app.run("SV_JARVIS.send('11:00')");
  assert.equal(app.requests.length,0);assert.equal(app.context.saves,0);assert.equal(app.context.modals.length,0);assert.equal(app.data(),before);
  await app.run("SV_JARVIS.send('"+LIVE[0].replace(/'/g,"\\'")+"')");assert.equal(app.context.modals.length,1);assert.match(app.context.modals[0],/Check the request/);assert.equal(app.requests.length,0);
});

test('WhatsApp voice commands open the inbox with the intent before task routing; a spoken send never sends; other commands are unchanged',async()=>{
  const app=runtime();const before=app.data();
  app.run("window.waOpened=[];window.SV_JARVIS_WHATSAPP={parseCommand:SV_JARVIS_WHATSAPP.parseCommand,open(o){waOpened.push({intent:o.intent})}}");
  await app.run("SV_JARVIS.send('Write a WhatsApp message to Bex saying This is a voice test.')");
  assert.deepEqual(plain(app.run('waOpened')),[{intent:{kind:'write',name:'Bex',group:false,text:'This is a voice test.'}}]);
  await app.run("SV_JARVIS.send('Open WhatsApp chat with Bex')");assert.equal(app.run('waOpened.length'),2);assert.equal(app.run('waOpened[1].intent.kind'),'open');
  for(const text of ['Send it','Approve and send','Can you write a WhatsApp message to Bex saying hi?','Write a WhatsApp message to Bex'])await app.run('SV_JARVIS.send('+JSON.stringify(text)+')');
  assert.equal(app.run('waOpened.length'),2);assert.equal(app.context.modals.length,0);
  await app.run("SV_JARVIS.send('Add task for Casa Ejemplo: check lockbox code')");assert.equal(app.context.modals.length,1);assert.match(app.context.modals[0],/Review new task/);
  assert.equal(app.run('waOpened.length'),2);assert.equal(app.requests.length,0);assert.equal(app.context.saves,0);assert.equal(app.data(),before);
});
