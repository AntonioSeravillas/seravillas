/* Jarvis-themed Cleanings page with FICTIONAL records: offered people are never shown or counted as confirmed, crew and
   Alina figures come from the existing helpers, risks are labelled in words, dialogs only call existing actions, and
   rendering writes nothing. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function runtime(){
  const sandbox={console,Date,Math,JSON,window:null,document:{activeElement:null,getElementById:()=>null},CSS:{escape:s=>s},
    D:{props:[{id:'mar',name:'Villa <Mar>'},{id:'casa',name:'Casa Ejemplo'}],cleaners:[{id:'c1',name:'Maribel'},{id:'c2',name:'Tanja'},{id:'al',name:'Alina'}],sessions:[],bookings:[]}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run(fs.readFileSync(path.join(root,'src/utils/dates.js'),'utf8'));
  run(`var schedWeekOffset=0,schedView='villas',schedPropFilter='';function today(){return '2026-10-19';}
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function propName(id){return (D.props.find(p=>p.id===id)||{}).name||'General';}`);
  for(const f of ['src/features/cleaning-planner.js','src/features/cleanings.js','src/features/cleaning-board.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
  const host={innerHTML:'',dataset:{},querySelector:()=>null};
  return {run,host,html:()=>{context.SV_CLEANINGS_VIEW.render(host);return host.innerHTML;}};
}
const crew=(main,spots=0,st='offered')=>({main,alinaSpots:spots,alinaStatus:st});
test('team status is exact: offered stays offered, confirmed counts against the villa requirement, Alina spots shown with status',()=>{
  const app=runtime();
  app.run(`D.sessions=[{id:'s1',propId:'mar',date:'2026-10-19',time:'10:00',status:'scheduled',crew:${JSON.stringify(crew([{cleanerId:'c1',name:'Maribel',status:'confirmed'},{cleanerId:'c2',name:'Tanja',status:'offered'}],1,'offered'))}}]`);
  const f=JSON.parse(app.run(`JSON.stringify(SV_CLEANINGS_VIEW.facts(D.sessions[0]))`));
  assert.equal(f.confirmed,1);assert.equal(f.offered,2);assert.deepEqual(f.people.map(p=>[p.name,p.status]),[['Maribel','confirmed'],['Tanja','offered']]);assert.deepEqual(f.alina,{spots:1,status:'offered'});
  const before=app.run('JSON.stringify(D)'),html=app.html();
  assert.match(html,/Maribel<small>Confirmed/);assert.match(html,/Tanja<small>Offered/);assert.match(html,/Alina team ×1<small>Offered/);assert.doesNotMatch(html,/Tanja<small>Confirmed/);
  assert.match(html,/1\/1 confirmed · 2 offered/);assert.ok(html.includes('Villa &lt;Mar&gt;')&&!html.includes('<Mar>'));assert.equal(app.run('JSON.stringify(D)'),before);
});
test('risks and states are written in words: no team, conflict, same-day turnaround, done and cancelled',()=>{
  const app=runtime();
  app.run(`D.bookings=[{id:'b1',propId:'casa',checkIn:'2026-10-20',checkOut:'2026-10-25',status:'confirmed'}];
    D.sessions=[{id:'a',propId:'mar',date:'2026-10-19',time:'09:00',status:'scheduled',cleanerIds:[]},
      {id:'b',propId:'casa',date:'2026-10-20',time:'10:00',status:'scheduled',crew:${JSON.stringify(crew([{cleanerId:'c1',name:'Maribel',status:'offered'}]))}},
      {id:'c',propId:'mar',date:'2026-10-21',time:'10:00',status:'scheduled',crew:${JSON.stringify(crew([{cleanerId:'c2',name:'Tanja',status:'confirmed'}]))}},
      {id:'d',propId:'casa',date:'2026-10-21',time:'12:00',status:'scheduled',crew:${JSON.stringify(crew([{cleanerId:'c2',name:'Tanja',status:'confirmed'}]))}},
      {id:'e',propId:'mar',date:'2026-10-22',status:'done',cleanerIds:['c1']},{id:'f',propId:'casa',date:'2026-10-22',status:'cancelled',cleanerIds:[]}]`);
  const label=id=>app.run(`SV_CLEANINGS_VIEW.facts(D.sessions.find(s=>s.id==='${id}')).label`);
  assert.equal(label('a'),'No team');assert.equal(label('b'),'Same-day turnaround');assert.equal(label('c'),'Conflict');assert.equal(label('e'),'Done');assert.equal(label('f'),'Cancelled');
  const html=app.html();assert.match(html,/Next arrival today · 16:00/);assert.ok(html.indexOf('data-session="e"')<html.indexOf('data-session="f"'));
});
test('missing checkout cleanings are listed once with the existing schedule action; dialogs offer only existing actions',()=>{
  const app=runtime();
  app.run(`D.bookings=[{id:'b2',propId:'mar',checkIn:'2026-10-15',checkOut:'2026-10-21',checkOutTime:'10:00',status:'confirmed'}];D.sessions=[{id:"q'1",propId:'casa',date:'2026-10-23',time:'11:00',status:'scheduled',crew:${JSON.stringify(crew([{cleanerId:'c1',name:'Maribel',status:'offered'}]))}}]`);
  const html=app.html();assert.equal((html.match(/data-jc-checkout="schedule" data-booking="b2"/g)||[]).length,1);assert.match(html,/Checkout cleanings to plan <b>1<\/b>/);
  const d=app.run(`SV_CLEANINGS_VIEW.detail(D.sessions[0])`),c=app.run(`function getMainCleanerNames(){return ['maribel','tanja'];}SV_CLEANINGS_VIEW.crewDialog(D.sessions[0])`);
  for(const fn of ['openCrewModal','openSessEdit','setStatus','delSess','closeModal'])assert.ok(d.includes(fn+'('),fn);
  for(const fn of ['crewSetMainStatus','crewRemoveMain','crewAddMain','crewSetAlina'])assert.ok(c.includes(fn+'('),fn);
  assert.match(c,/Maribel<\/span><span class="jc-crew-status is-offered">Offered/);assert.match(c,/0 of 1|0\/1/);
  assert.ok(!d.includes('send')&&!c.includes('send'));
});
