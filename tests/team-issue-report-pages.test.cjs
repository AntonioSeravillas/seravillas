/* Jarvis-themed Team, Issues and Reports pages with FICTIONAL records and the app's real feature code: rendering writes
   nothing and sends nothing, offered work is never shown as confirmed, every control calls the existing action, removals
   keep their confirmation, and Reports shows the existing report's own figures. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const TODAY='2026-10-21';
const src=f=>fs.readFileSync(path.join(root,f),'utf8');
function runtime(data,{jarvisOpen=true}={}){
  const calls=[],fields={},modal={html:''};let confirms=0,alerts=0;
  const sandbox={console,Date,Math,JSON,Intl,CSS:{escape:s=>s},calls,fields,modal,window:null,setTimeout:()=>0,
    confirm:()=>{confirms++;return true;},alert:()=>{alerts++;},counts:()=>({confirms,alerts}),
    document:{body:{classList:{contains:c=>c==='jarvis-open'&&jarvisOpen}},getElementById:id=>fields[id]||null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:()=>{}},
    D:{props:[],bookings:[],sessions:[],tasks:[],issues:[],cleaners:[],contacts:[],supplies:[],...data}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run(src('src/utils/dates.js'));
  run(`let _photoPropId=null,_photoIssueId=null,propHubId=null,issueFilter='all',issueStatusFilter='all',issueSearch='',iccSelId=null,reportYear=2026,schedWeekOffset=0;const ALINA_MAX_SPOTS_PER_DAY=4;`);
  for(const f of ['src/features/properties.js','src/features/issues.js','src/ui/actions.js','src/features/reports.js','src/features/revenue-reports.js'])run(src(f));
  run(`function today(){return '${TODAY}';}
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function fmtDate(d){return d;}function propName(id){return (D.props.find(p=>p.id===id)||{}).name||'General';}function pad(n){return String(n).padStart(2,'0');}
    function avInit(n){return n.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}function propColorIdx(){return 0;}function propBarColor(){return {border:'#999'};}
    function workspaceIcon(){return '';}function platformBadge(){return '';}
    var __n=0;function uid(){return 'new'+(++__n);}
    /* The crew helper as the cleaning module defines it: crew.main entries carry each person's own status. */
    function getCleaningCrew(s){return s.crew||{main:(s.cleanerIds||[]).map(id=>({cleanerId:id,status:'confirmed'})),alinaSpots:0,alinaStatus:'cancelled'};}
    function save(){calls.push('save');}function render(){calls.push('render');}function toast(m){calls.push('toast:'+m);}
    function showModal(h){modal.html=h;calls.push('modal');}function closeModal(){modal.html='';calls.push('close');}
    function openSess(id){calls.push('sess:'+id);}function openWA(p){calls.push('wa:'+p);}function openCleanerAccess(){calls.push('access');}
    function openBookingDetail(id){calls.push('booking:'+id);}`);
  for(const f of ['src/features/team-board.js','src/features/issue-board.js','src/features/report-board.js'])run(src(f));
  const listeners={};
  const host={innerHTML:'',dataset:{},querySelector:s=>({focus(){},scrollTop:0,setSelectionRange(){}}),addEventListener:(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);}};
  const fire=(type,target)=>listeners[type].forEach(f=>f({target}));
  const click=(data,extra={})=>fire('click',{closest:()=>({dataset:data,closest:()=>({classList:{add:c=>calls.push('class:'+c),remove:c=>calls.push('unclass:'+c)},querySelector:()=>({focus(){}})}),...extra})});
  return {run,host,click,fire,calls,modal,fields,listeners,counts:()=>run('counts()')};
}
const crew=(id,status)=>({cleanerId:id,status});
const teamData=()=>({props:[{id:'mar',name:'Villa Mar'}],cleaners:[{id:'c1',name:'Sample <Cleaner> A',phone:'+34 600 000 001'},{id:'c2',name:'Sample Cleaner B',phone:''}],
  sessions:[{id:'s1',propId:'mar',date:'2026-10-22',time:'10:00',status:'scheduled',crew:{main:[crew('c1','confirmed'),crew('c2','offered')],alinaSpots:0,alinaStatus:'cancelled'},cleanerIds:['c1','c2']},
    {id:'s2',propId:'mar',date:'2026-10-24',time:'',status:'scheduled',crew:{main:[crew('c1','offered')],alinaSpots:0,alinaStatus:'cancelled'},cleanerIds:['c1']},
    {id:'s3',propId:'mar',date:'2026-10-25',status:'cancelled',crew:{main:[crew('c1','confirmed')]},cleanerIds:['c1']},
    {id:'s4',propId:'mar',date:'2026-10-10',status:'done',crew:{main:[crew('c2','confirmed')]},cleanerIds:['c2']},
    {id:'s5',propId:'mar',date:'2026-10-23',status:'scheduled',crew:{main:[crew('c2','cancelled')]},cleanerIds:[]}]});
test('Team: real cleaners and their upcoming work, offered kept apart from confirmed; rendering writes and sends nothing',()=>{
  const app=runtime(teamData());app.run('SV_TEAM_VIEW.bind')(app.host);const before=app.run('JSON.stringify(D)');app.run('SV_TEAM_VIEW.render')(app.host);const h=app.host.innerHTML;
  assert.equal(app.run('JSON.stringify(D)'),before);assert.deepEqual(app.calls,[],'no save, render, message or dialog');
  assert.match(h,/<h2>2 cleaners<\/h2>/);assert.match(h,/Upcoming cleanings: 1 confirmed · 2 offered/);
  assert.ok(h.includes('Sample &lt;Cleaner&gt; A')&&!h.includes('<Cleaner>'),'escaped');assert.match(h,/1 confirmed · 1 offered/);assert.match(h,/No phone — edit to add/);
  assert.doesNotMatch(h,/\sid="/);
  app.click({jmOpen:'c1'});assert.match(app.modal.html,/2026-10-22 · 10:00 · Villa Mar/);assert.match(app.modal.html,/Confirmed/);assert.match(app.modal.html,/2026-10-24 · Villa Mar[\s\S]*Offered/);
  assert.doesNotMatch(app.modal.html,/2026-10-25|2026-10-10/,'cancelled and past cleanings are not upcoming work');
  const work=JSON.parse(app.run('JSON.stringify(SV_TEAM_VIEW.upcoming(D.cleaners[1],today()))'));assert.deepEqual(work.map(w=>[w.s.id,w.status]),[['s1','offered']],'a cancelled place is not work');
});
test('Team: each control calls the existing action; removal asks first and keeps the workspace prompt elsewhere',()=>{
  const app=runtime(teamData());app.run('SV_TEAM_VIEW.bind')(app.host);app.run('SV_TEAM_VIEW.render')(app.host);
  app.click({jm:'access'});assert.equal(app.calls.at(-1),'access');
  app.click({jmExpand:'c1'});assert.match(app.host.innerHTML,/WhatsApp chat/);app.click({jmWa:'c1'});assert.equal(app.calls.at(-1),'wa:+34 600 000 001','opens the chat link only; nothing is sent');
  app.click({jmSess:'s1'});assert.equal(app.calls.at(-1),'sess:s1');
  app.click({jmAsk:'c2'});assert.equal(app.run('D.cleaners.length'),2,'asking removes nothing');
  app.click({jmRemove:'c2'});assert.equal(app.run('D.cleaners.map(c=>c.id).join()'),'c1');assert.equal(app.counts().confirms,0,'the page asked instead of a browser prompt');
  assert.deepEqual(app.run('JSON.stringify(D.sessions[0].cleanerIds)'),'["c1"]','the existing removal also unassigns');
  app.run('delCleaner("c1")');assert.equal(app.counts().confirms,1,'without the flag the existing prompt still asks');
});
test('Team: add/edit dialogs keep the field ids, inline name error, and save through saveNewCleaner/saveEditCleaner with stable ids',()=>{
  const app=runtime(teamData());app.run('openAddCleanerModal()');assert.match(app.modal.html,/jv-modal/);assert.match(app.modal.html,/id="nc-name"[^>]*data-jv-guard/);
  const err={hidden:true};app.fields['jm-form-error']=err;app.fields['nc-name']={value:' ',setAttribute(){},focus(){}};app.fields['nc-phone']={value:'+34 1'};
  app.run('SV_TEAM_VIEW.saveForm("new","")');assert.equal(err.hidden,false);assert.equal(app.run('D.cleaners.length'),2);assert.equal(app.counts().alerts,0);
  app.fields['nc-name'].value=' Sample New ';app.run('SV_TEAM_VIEW.saveForm("new","")');assert.equal(app.run('JSON.stringify(D.cleaners[2])'),JSON.stringify({id:'new1',name:'Sample New',phone:'+34 1'}));
  app.run('openEditCleaner("c1")');assert.match(app.modal.html,/value="Sample &lt;Cleaner&gt; A"/);app.fields['ec-name']={value:'Renamed'};app.fields['ec-phone']={value:'+34 9'};app.run('SV_TEAM_VIEW.saveForm("edit","c1")');
  assert.equal(app.run('D.cleaners[0].id+"|"+D.cleaners[0].name+"|"+D.cleaners[0].phone'),'c1|Renamed|+34 9');
  const out=runtime(teamData(),{jarvisOpen:false});out.run('openAddCleanerModal()');assert.match(out.modal.html,/modal-handle/,'outside Jarvis the workspace dialog is unchanged');
});
const issueData=()=>({props:[{id:'mar',name:'Villa Mar'},{id:'casa',name:'Casa Ejemplo'}],issues:[
  {id:'i1',propId:'mar',title:'Broken <b>boiler</b>',status:'open',priority:'high',category:'plumbing',createdAt:'2026-10-18',resolveBy:'2026-10-20',photos:['data:image/png;base64,AA'],note:'Fictional note'},
  {id:'i2',propId:'mar',title:'Loose tile',status:'waiting',priority:'medium',category:'maintenance',waitingFor:'Sample tiler',createdAt:'2026-10-19',photos:[]},
  {id:'i3',propId:'casa',title:'Old fix',status:'resolved',resolvedAt:'2026-10-20',createdAt:'2026-10-01',photos:[]},
  {id:'i4',propId:'gone',title:'Orphan issue',status:'in_progress',createdAt:'2026-10-02',photos:[]}]});
test('Issues: the workspace counts, grouping, order and filters; escaped; rendering writes nothing',()=>{
  const app=runtime(issueData());app.run('SV_ISSUES_VIEW.bind')(app.host);const before=app.run('JSON.stringify(D)');app.run('SV_ISSUES_VIEW.render')(app.host);let h=app.host.innerHTML;
  assert.equal(app.run('JSON.stringify(D)'),before);assert.deepEqual(app.calls,[]);
  assert.match(h,/<h2>2 open issues<\/h2>/,'open = open + in progress, as the workspace counts');assert.match(h,/<em>1 urgent<\/em> · 1 waiting · 1 resolved in the last 7 days/);
  assert.ok(h.includes('Broken &lt;b&gt;boiler&lt;/b&gt;'));assert.match(h,/Overdue · 2026-10-20/);assert.match(h,/1 photo/);assert.match(h,/No specific villa/,'an issue whose villa no longer exists stays visible');
  assert.ok(h.indexOf('Broken')<h.indexOf('Loose tile'),'open before waiting');assert.match(h,/Villa Mar<small class="jt-count is-alert">2 open · 1 urgent/);assert.match(h,/Casa Ejemplo<small class="jt-count">All clear/);
  app.fire('change',{matches:s=>s==='[data-ji-status]',value:'resolved'});h=app.host.innerHTML;assert.match(h,/Old fix/,'a Resolved filter lists the resolved issues');assert.doesNotMatch(h,/Loose tile/);
  app.fire('change',{matches:s=>s==='[data-ji-status]',value:'all'});app.fire('input',{matches:s=>s==='[data-ji-search]',value:'tile',selectionStart:4});h=app.host.innerHTML;assert.match(h,/Loose tile/);assert.doesNotMatch(h,/Broken/);
  assert.equal(app.run('issueSearch'),'tile','the shared workspace search state');
  app.fire('input',{matches:s=>s==='[data-ji-search]',value:'zzz',selectionStart:3});assert.match(app.host.innerHTML,/No matching issues/);app.click({ji:'reset'});assert.equal(app.run('issueSearch+issueStatusFilter+issueFilter'),'allall');
  const empty=runtime({issues:[]});empty.run('SV_ISSUES_VIEW.render')(empty.host);assert.match(empty.host.innerHTML,/No issues logged yet/);
});
test('Issues: details, status changes, edit, photos and delete through the existing functions; confirmation kept',()=>{
  const app=runtime(issueData());app.run('SV_ISSUES_VIEW.bind')(app.host);app.run('SV_ISSUES_VIEW.render')(app.host);
  app.click({jiOpen:'i1'});let m=app.modal.html;assert.match(m,/jv-modal/);assert.match(m,/High priority/);assert.match(m,/Plumbing/);assert.doesNotMatch(m,/🚿/);assert.match(m,/overdue/);assert.match(m,/Photos · 1 of 5/);assert.match(m,/Mark in progress/);
  app.run('setIssueStatus("i1","in_progress")');assert.equal(app.run('D.issues[0].status'),'in_progress');assert.match(app.modal.html,/Mark waiting/);assert.doesNotMatch(app.modal.html,/Mark in progress/);
  app.run('setIssueStatus("i1","resolved")');assert.equal(app.run('D.issues[0].resolvedAt'),TODAY);assert.match(app.modal.html,/Reopen/);
  app.run('setIssueStatus("i1","open")');assert.equal(app.run('D.issues[0].resolvedAt'),'');
  assert.match(app.modal.html,/_photoIssueId=&quot;i1&quot;/,'Add photo sets the issue the existing upload handler reads');
  app.run('viewIssuePhoto("i1",0)');assert.match(app.modal.html,/Delete this photo\?/);app.run('removeIssuePhoto("i1",0,true)');assert.equal(app.run('D.issues[0].photos.length'),0);assert.equal(app.counts().confirms,0);
  app.run('openEditIssue("i2")');assert.match(app.modal.html,/id="ei-title"[^>]*data-jv-guard/);assert.match(app.modal.html,/value="Sample tiler"/);
  const err={hidden:true};app.fields['ji-form-error']=err;for(const [k,v] of Object.entries({'ei-title':'','ei-prop':'casa','ei-note':'n','ei-resolve-by':'','ei-priority':'low','ei-cat':'other','ei-waiting':''}))app.fields[k]={value:v,setAttribute(){},focus(){}};
  app.run('SV_ISSUES_VIEW.saveForm("edit","i2")');assert.equal(err.hidden,false);assert.equal(app.run('D.issues[1].title'),'Loose tile');assert.equal(app.counts().alerts,0);
  app.fields['ei-title'].value='Loose tile, hall';app.run('SV_ISSUES_VIEW.saveForm("edit","i2")');assert.equal(app.run('JSON.stringify([D.issues[1].id,D.issues[1].title,D.issues[1].propId,D.issues[1].priority])'),JSON.stringify(['i2','Loose tile, hall','casa','low']));
  app.run('openAddIssueFor("casa")');assert.match(app.modal.html,/<option value="casa" selected>/);
  for(const [k,v] of Object.entries({'iss-title':'Sample leak','iss-prop':'casa','iss-note':'','iss-resolve-by':'','iss-priority':'medium','iss-cat':'plumbing','iss-waiting':''}))app.fields[k]={value:v,setAttribute(){},focus(){}};
  app.run('SV_ISSUES_VIEW.saveForm("new","")');assert.equal(app.run('D.issues.at(-1).title+"|"+D.issues.at(-1).status+"|"+D.issues.at(-1).propId'),'Sample leak|open|casa');
  app.run('openIssue("i2")');assert.match(app.modal.html,/Delete this issue\?/);app.run('delIssue("i2",true)');assert.ok(!app.run('D.issues.some(i=>i.id==="i2")'));assert.equal(app.counts().confirms,0);
  app.run('delIssue("i3")');assert.equal(app.counts().confirms,1,'without the flag the existing prompt still asks');
  const out=runtime(issueData(),{jarvisOpen:false});out.run('openIssue("i1")');assert.match(out.modal.html,/modal-handle/,'outside Jarvis the workspace dialog is unchanged');
});
test('Reports: the existing report and its own figures, with jv- ids; the booking search updates the Jarvis list; nothing is written',()=>{
  const data={props:[{id:'mar',name:'Villa Mar'},{id:'mo4hhdwukkja',name:'Excluded Villa'}],bookings:[
    {id:'b1',propId:'mar',guestName:'Sample Guest',checkIn:'2026-10-10',checkOut:'2026-10-14',status:'confirmed',platform:'airbnb',totalPrice:1000,guestCount:2},
    {id:'b2',propId:'mar',guestName:'Cancelled Guest',checkIn:'2026-11-02',checkOut:'2026-11-05',status:'cancelled',platform:'booking',totalPrice:600,cancellationRevenue:150},
    {id:'b3',propId:'mo4hhdwukkja',guestName:'Excluded Guest',checkIn:'2026-10-10',checkOut:'2026-10-12',status:'confirmed',platform:'direct',totalPrice:999}]};
  const app=runtime(data);const before=app.run('JSON.stringify(D)');app.run('SV_REPORTS_VIEW.render')(app.host);const h=app.host.innerHTML;
  assert.equal(app.run('JSON.stringify(D)'),before);assert.ok(!app.calls.includes('save'));
  const own=app.run('SV_REPORTS_VIEW.prefix(renderBookingReport())');assert.equal(h,'<div class="jc-body jr-body">'+own+'</div>','exactly the existing report');
  assert.doesNotMatch(h,/\sid="report-/);assert.match(h,/id="jv-report-booking-results"/);assert.match(h,/for="jv-report-villa"/);
  const total=app.run('reportMoney(bookingReportData(D,2026,null,"").revenueCents)');assert.ok(h.includes(total),'the existing total');assert.doesNotMatch(h,/Excluded Guest/,'the excluded villa stays excluded');
  assert.match(h,/booked values; the app does not track payment receipts or expenses/,'the meaning of the figures is kept');
  const list={innerHTML:''};app.fields['jv-report-booking-results']=list;app.run('updateReportBookingList("sample")');assert.match(list.innerHTML,/Sample Guest/);assert.doesNotMatch(list.innerHTML,/Cancelled Guest/);
});
