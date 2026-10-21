/* Jarvis-themed Properties page with FICTIONAL records and the app's real properties.js / actions.js: the list and
   details show the workspace card and hub facts, rendering writes nothing, every control calls the existing action,
   removal still asks first, and empty states say so. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const TODAY='2026-10-21';
function runtime(data,{jarvisOpen=true}={}){
  const calls=[],fields={},modal={html:''};let confirms=0;
  const sandbox={console,Date,Math,JSON,CSS:{escape:s=>s},calls,fields,modal,window:null,setTimeout:()=>0,
    confirm:()=>{confirms++;return true;},confirms:()=>confirms,
    document:{body:{classList:{contains:c=>c==='jarvis-open'&&jarvisOpen}},getElementById:id=>fields[id]||null,querySelectorAll:()=>[],addEventListener:()=>{}},
    D:{props:[],bookings:[],sessions:[],tasks:[],issues:[],cleaners:[],...data}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run(fs.readFileSync(path.join(root,'src/utils/dates.js'),'utf8'));
  run(`let _photoPropId=null,_photoIssueId=null,propHubId=null;`);
  run(fs.readFileSync(path.join(root,'src/features/properties.js'),'utf8'));
  run(fs.readFileSync(path.join(root,'src/ui/actions.js'),'utf8'));
  run(`function today(){return '${TODAY}';}
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function fmtDate(d){return d;}function fmtEur(n){return '€'+n;}function isToday(d){return d===today();}function nightsBetween(a,b){return Math.round((Date.parse(b)-Date.parse(a))/864e5);}
    function avInit(n){return n.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}function propColorIdx(){return 0;}
    var __n=0;function uid(){return 'new'+(++__n);}
    function save(){calls.push('save');}function render(){calls.push('render');}function toast(m){calls.push('toast:'+m);}
    function showModal(h){modal.html=h;calls.push('modal');}function closeModal(){modal.html='';calls.push('close');}
    function openBookingDetail(id){calls.push('booking:'+id);}function openAddBookingModal(){calls.push('add-booking');}
    function openSess(id){calls.push('sess:'+id);}function openAddSessModal(){calls.push('add-sess');}
    function openTaskDetail(id){calls.push('task:'+id);}function openNewTaskModal(p,t,j){calls.push('new-task:'+[p,t,j].join('|'));}function tcbDone(id){calls.push('done:'+id);}
    function openIssue(id){calls.push('issue:'+id);}function openAddIssueFor(p){calls.push('add-issue:'+p);}`);
  run(fs.readFileSync(path.join(root,'src/features/property-board.js'),'utf8'));
  const listeners={};
  const focus=[];const host={innerHTML:'',dataset:{},querySelector:s=>({focus:()=>focus.push(s),scrollTop:0}),addEventListener:(t,f)=>{listeners[t]=f;}};
  run('SV_PROPERTIES_VIEW.bind')(host);
  const html=()=>{run('SV_PROPERTIES_VIEW.render')(host);return host.innerHTML;};
  const click=(data,extra={})=>listeners.click({target:{closest:()=>({dataset:data,closest:()=>null,parentNode:{classList:{add:c=>calls.push('class:'+c)},querySelector:()=>({focus(){}})},...extra})}});
  return {run,host,html,click,calls,modal,fields,focus,confirms:()=>run('confirms()')};
}
const LONG='Villa <b>Mar</b> del Sol con Vista al Mediterráneo y Jardín de los Naranjos Grandes';
const fixture=()=>({
  props:[{id:'mar',name:LONG,notes:'Entry code: fictional',photos:['data:image/jpeg;base64,AAAA','data:image/jpeg;base64,BBBB']},{id:'casa',name:'Casa Ejemplo',notes:'',photos:[]}],
  bookings:[{id:'b1',propId:'mar',guestName:'Fictional Guest',checkIn:'2026-10-19',checkOut:'2026-10-24',status:'confirmed',platform:'airbnb',totalPrice:900,guestCount:2},
    {id:'b2',propId:'mar',guestName:'Cancelled Guest',checkIn:'2026-10-25',checkOut:'2026-10-27',status:'cancelled',platform:'direct'},
    {id:'b3',propId:'casa',guestName:'Arriving Today',checkIn:TODAY,checkOut:'2026-10-23',status:'confirmed',platform:'booking'}],
  sessions:[{id:'s1',propId:'mar',date:'2026-10-24',time:'11:00',status:'scheduled',cleanerIds:['c1']},{id:'s0',propId:'mar',date:'2026-10-10',time:'10:00',status:'done',cleanerIds:[]}],
  cleaners:[{id:'c1',name:'Sample Cleaner'}],
  tasks:[{id:'t1',propId:'mar',text:'Fix the <gate>',done:false,priority:'high',dueDate:'2026-10-20'},{id:'t2',propId:'mar',text:'Old',done:true}],
  issues:[{id:'i1',propId:'mar',title:'Leaking tap',status:'open',resolveBy:'2026-10-30'},{id:'i2',propId:'mar',title:'Resolved one',status:'resolved'}]});
test('list: every villa with its photo or initials, escaped long names, occupancy and the hub counts; rendering writes nothing',()=>{
  const app=runtime(fixture());const before=app.run('JSON.stringify(D)');const h=app.html();
  assert.equal(app.run('JSON.stringify(D)'),before,'rendering never changes a record');assert.ok(!app.calls.includes('save'));
  assert.match(h,/<h2>2 properties<\/h2>/);assert.match(h,/1 occupied · 1 check-in today/);
  assert.ok(h.includes('Villa &lt;b&gt;Mar&lt;/b&gt;')&&!h.includes('<b>Mar</b>'),'names are escaped');
  assert.match(h,/src="data:image\/jpeg;base64,AAAA"/,'the existing first photo');assert.match(h,/jp-initials[^>]*>CE</,'initials when a villa has no photo');
  assert.match(h,/Fictional Guest · until 2026-10-24/);assert.match(h,/Arriving Today · 2 nights/);
  assert.match(h,/Cleaning 2026-10-24/);assert.match(h,/1 issue</);assert.match(h,/1 task</,'done tasks and resolved issues are not counted');
  assert.doesNotMatch(h,/Cancelled Guest/);assert.doesNotMatch(h,/\sid="/,'no element ids that could collide with the workspace screen');
});
test('details: the hub sections and actions, each calling the existing app function for this villa',()=>{
  const app=runtime(fixture());app.html();app.click({jpOpen:'mar'});const h=app.host.innerHTML;
  assert.match(h,/All properties/);assert.match(h,/2 sessions total · 1 open issue · 1 task/);
  for(const s of ['Photos','Upcoming bookings','Upcoming cleanings','Open tasks','Open issues','Recent history','Remove this property'])assert.ok(h.includes(s),s);
  assert.match(h,/Airbnb/);assert.match(h,/2026-10-19 → 2026-10-24/);assert.match(h,/5 nights/);assert.match(h,/€900/);assert.match(h,/Sample Cleaner/);assert.match(h,/Entry code: fictional/);
  assert.match(h,/Fix the &lt;gate&gt;/);assert.match(h,/Overdue · 2026-10-20/);assert.match(h,/Leaking tap/);assert.doesNotMatch(h,/Resolved one|Cancelled Guest/);
  assert.match(h,/2 of 3/);assert.match(h,/Add photo/);
  for(const [data,call] of [[{jpBooking:'b1'},'booking:b1'],[{jpSess:'s1'},'sess:s1'],[{jpTask:'t1'},'task:t1'],[{jpDone:'t1'},'done:t1'],[{jpIssue:'i1'},'issue:i1'],
    [{jp:'task-add'},'new-task:mar|ops|'],[{jp:'issue-add'},'add-issue:mar'],[{jp:'booking-add'},'add-booking'],[{jp:'sess-add'},'add-sess']]){app.click(data);assert.equal(app.calls.at(-1),call,JSON.stringify(data));}
  /* Add booking / Schedule preselect this villa in the existing dialog. */
  app.fields['bk-prop']={value:'',options:[{value:''},{value:'mar'}]};app.click({jp:'booking-add'});assert.equal(app.fields['bk-prop'].value,'mar');
  app.fields['f-prop']={value:'',options:[{value:'casa'}]};app.click({jp:'sess-add'});assert.equal(app.fields['f-prop'].value,'','an unknown option is never forced');
  /* Notes and photos use the existing functions, now in the Jarvis theme. */
  app.click({jp:'notes'});assert.match(app.modal.html,/jv-modal/);assert.match(app.modal.html,/id="p-notes"[^>]*data-jv-guard>Entry code: fictional</);
  app.fields['p-notes']={value:'New fictional notes'};app.run('savePropNotes("mar")');assert.equal(app.run('D.props[0].notes'),'New fictional notes');assert.ok(app.calls.includes('save'));
  app.click({jpPhoto:'1'});assert.match(app.modal.html,/Photo 2 of 2/);assert.match(app.modal.html,/BBBB/);
  let clicked=0;app.fields['photo-file']={click:()=>clicked++};app.click({jp:'photo-add'});assert.equal(clicked,1);assert.equal(app.run('_photoPropId'),'mar');
  app.click({jp:'back'});assert.match(app.host.innerHTML,/2 properties/);
});
test('removal and photo deletion keep their confirmation; the workspace screen still asks with its own prompt',()=>{
  const app=runtime(fixture());app.html();app.click({jpOpen:'mar'});
  app.click({jp:'remove-ask'});assert.ok(app.calls.includes('class:is-asking'));assert.equal(app.run('D.props.length'),2,'asking removes nothing');
  app.run('viewPhoto("mar",0)');assert.match(app.modal.html,/Delete this photo\?/);app.run('removePhoto("mar",0,true)');assert.equal(app.run('D.props[0].photos.length'),1);assert.equal(app.confirms(),0,'the Jarvis dialog asked instead of a browser prompt');
  app.click({jp:'remove'});assert.equal(app.run('D.props.map(p=>p.id).join()'),'casa');assert.equal(app.run('D.sessions.length+D.tasks.length+D.issues.length'),0,'the existing removal also removes its sessions, tasks and issues');
  assert.match(app.host.innerHTML,/1 property</,'back to the list after removal');
  app.run('delProp("casa")');assert.equal(app.confirms(),1,'without the confirmed flag the existing prompt still asks');
});
test('add villa: same addProp, inline error for an empty name, workspace input path unchanged; empty state',()=>{
  const app=runtime({props:[]});const h=app.html();assert.match(h,/No properties yet/);assert.match(h,/data-jp="create"/);
  app.click({jp:'create'});assert.match(app.modal.html,/Add a villa/);assert.match(app.modal.html,/data-jv-guard/);
  const err={hidden:true},box={value:'  ',setAttribute(k,v){this[k]=v;},focus(){}};app.fields['jp-new-name']=box;app.fields['jp-new-error']=err;
  app.run('SV_PROPERTIES_VIEW.saveAdd()');assert.equal(err.hidden,false);assert.equal(app.run('D.props.length'),0);
  box.value='  Villa Nueva ';app.run('SV_PROPERTIES_VIEW.saveAdd()');assert.equal(app.run('JSON.stringify(D.props)'),JSON.stringify([{id:'new1',name:'Villa Nueva',notes:'',photos:[]}]));assert.ok(app.calls.includes('toast:Property added'));
  app.fields['prop-in']={value:'Casa Input'};app.run('addProp()');assert.equal(app.run('D.props[1].name'),'Casa Input');assert.equal(app.fields['prop-in'].value,'','the workspace input still clears');
});
test('outside Jarvis the existing workspace dialogs are unchanged',()=>{
  const app=runtime(fixture(),{jarvisOpen:false});app.run('openPropNotes("mar")');assert.match(app.modal.html,/modal-handle/);assert.doesNotMatch(app.modal.html,/jv-modal/);
  app.run('viewPhoto("mar",0)');assert.match(app.modal.html,/btn btn-danger/);
});
