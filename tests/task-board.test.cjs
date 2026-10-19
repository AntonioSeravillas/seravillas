/* Jarvis-themed Tasks page with FICTIONAL records and the app's real tasks.js actions: the board keeps the app's
   statuses and order, rendering writes nothing, every control calls the existing action, and empty views say so. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function runtime(tasks,{jarvisOpen=false,realDialogs=false}={}){
  const calls=[],fields={},modal={html:''};
  const sandbox={console,Date,Math,JSON,CSS:{escape:s=>s},calls,window:null,
    D:{props:[{id:'mar',name:'Villa <Mar>'},{id:'casa',name:'Casa Ejemplo'}],projects:[],tasks},
    prompt:()=>'Fictional plumber',toast:m=>calls.push('toast:'+m),fields,modal,setTimeout:()=>0,
    document:{body:{classList:{contains:c=>c==='jarvis-open'&&jarvisOpen}},getElementById:id=>fields[id]||null,querySelectorAll:()=>[]}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run(fs.readFileSync(path.join(root,'src/utils/dates.js'),'utf8'));
  run(`function today(){return '2026-10-19';}
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function propName(id){return (D.props.find(p=>p.id===id)||{}).name||'General';}function fmtDate(d){return d;}function uid(){return 'u1';}
    function save(){calls.push('save');}function render(){calls.push('render');}function showModal(h){modal.html=h;calls.push('modal');}function closeModal(){modal.html='';calls.push('close');}`);
  run(fs.readFileSync(path.join(root,'src/features/tasks.js'),'utf8'));
  if(!realDialogs)run(`function openTaskDetail(id){calls.push('detail:'+id);}function openNewTaskModal(p,t,j){calls.push('new:'+[p,t,j].join('|'));}`);
  run(fs.readFileSync(path.join(root,'src/features/task-board.js'),'utf8'));
  const listeners={};
  const host={innerHTML:'',dataset:{},querySelector:()=>null,addEventListener:(t,f)=>{listeners[t]=f;}};
  run('SV_TASKS_VIEW.bind').call(null,host);
  const html=()=>{run('SV_TASKS_VIEW.render')(host);return host.innerHTML;};
  /* A click on an element carrying these data attributes, as the browser's closest() would return it. */
  const click=data=>listeners.click({target:{closest:()=>({dataset:data,closest:()=>null})}});
  return {run,host,html,click,calls,listeners,modal,fields};
}
const task=(id,text,extra={})=>({id,text,status:'inbox',propId:'',priority:'medium',urgent:false,done:false,dueDate:'',completedAt:'',...extra});
test('board: the app’s statuses in its order, escaped long names, priority and due shown in words, and rendering writes nothing',()=>{
  const long='Check the pool pump, the filter housing and the <b>timer</b> settings before the guests arrive on Friday afternoon';
  const app=runtime([task('a',long,{status:'today',propId:'mar',priority:'high',dueDate:'2026-10-18'}),task('b','Restock towels',{status:'doing',dueDate:'2026-10-19'}),task('c','Call the plumber',{status:'waiting',waitingFor:'Fictional plumber'}),task('d','Old job',{done:true,status:'done',completedAt:'2026-10-19'})]);
  app.html();const before=app.run('JSON.stringify(D)');const h=app.html();
  assert.equal(app.run('JSON.stringify(D)'),before,'rendering never changes a task');assert.ok(!app.calls.includes('save'));
  const order=['Inbox','Today','Doing','Waiting'].map(l=>h.indexOf('<span>'+l+'</span>'));assert.ok(order.every((x,i)=>x>0&&(i===0||x>order[i-1])),'status columns keep the board order');
  assert.ok(h.includes('&lt;b&gt;timer&lt;/b&gt;')&&!h.includes('<b>timer</b>'),'task text is escaped');assert.ok(h.includes('Villa &lt;Mar&gt;'));
  assert.match(h,/High priority/);assert.match(h,/Overdue · 2026-10-18/);assert.match(h,/Due today/);assert.match(h,/Waiting for Fictional plumber/);
  assert.match(h,/3 open tasks/);assert.match(h,/1 of 3 done today/);assert.doesNotMatch(h,/Old job/,'done tasks stay out of the board');
});
test('every control calls the existing task action and persists through it',()=>{
  const app=runtime([task('a','Restock towels',{status:'today'}),task('b','Fix gate',{status:'inbox'}),task('c','Old job',{done:true,status:'done',completedAt:'2026-10-19'})]);app.html();const j=e=>JSON.parse(app.run('JSON.stringify('+e+')'));
  app.click({jtDone:'a'});assert.deepEqual(j('[D.tasks[0].done,D.tasks[0].status,D.tasks[0].completedAt]'),[true,'done','2026-10-19']);
  app.click({jtMove:'doing',id:'b'});assert.equal(app.run('D.tasks[1].status'),'doing');
  app.click({jtMove:'waiting',id:'b'});assert.deepEqual(j('[D.tasks[1].status,D.tasks[1].waitingFor]'),['waiting','Fictional plumber']);
  app.click({jtReopen:'c'});assert.deepEqual(j('[D.tasks[2].done,D.tasks[2].status]'),[false,'inbox']);
  assert.equal(app.calls.filter(c=>c==='save').length,4,'each change saved once through the app');
  app.click({jtOpen:'b'});app.click({jt:'create'});app.click({jtAddProp:'mar'});
  assert.deepEqual(app.calls.filter(c=>/^(detail|new):/.test(c)),['detail:b','new:|ops|','new:mar|ops|']);
});
test('views: by villa (with general), projects, done; phone status tab; clear empty states',()=>{
  const app=runtime([task('a','Water garden',{propId:'casa'}),task('b','Buy bulbs'),task('c','Old job',{done:true,status:'done',completedAt:'2026-10-19'})]);
  app.run("window._tcbView='properties'");let h=app.html();assert.match(h,/Casa Ejemplo<small class="jt-count">1 open/);assert.match(h,/No villa \/ general<small class="jt-count">1 open/);assert.match(h,/Villa &lt;Mar&gt;<small class="jt-count">0 open<\/small>.*All clear\./s);
  app.run("window._tcbView='done'");h=app.html();assert.match(h,/Done today<small class="jt-count">1/);assert.match(h,/data-jt-reopen="c"/);
  app.run("window._tcbView='projects'");assert.match(app.html(),/No projects yet\./);
  app.run("window._tcbView='board'");app.click({jtTab:'today'});assert.equal(app.run('window._tcbTab'),'today');assert.match(app.html(),/class="jt-col is-tab[^"]*"><h3><span>Today/);
  const empty=runtime([]);assert.match(empty.html(),/No open tasks\./);empty.run("window._tcbView='done'");assert.match(empty.html(),/Nothing done yet\./);
});
test('inside Jarvis the existing task dialogs open in the Jarvis style and keep the app fields; outside they are unchanged',()=>{
  const inside=runtime([task('a','Fix <gate>',{status:'today',propId:'mar',priority:'high',note:'Bring the spare remote'})],{jarvisOpen:true,realDialogs:true});
  inside.run("openTaskDetail('a')");let h=inside.modal.html;
  assert.match(h,/class="jv-modal jt-dialog"/);assert.ok(h.includes('Fix &lt;gate&gt;')&&!h.includes('<gate>'));assert.match(h,/>Today<\/span> · High priority/);assert.match(h,/Bring the spare remote/);
  for(const call of ['tcbDone(','openEditTaskModal(','togglePin(','toggleFocus(','deleteTask(','closeModal()'])assert.ok(h.includes(call),call);
  assert.match(h,/Delete this task\?/,'delete asks first');
  inside.run("openNewTaskModal('mar','ops','')");h=inside.modal.html;
  for(const id of ['nt-text','nt-prio','nt-prop','nt-due','nt-time','nt-note','nt-proj'])assert.match(h,new RegExp('id="'+id+'"'),id);
  assert.match(h,/<option value="mar" selected>/);assert.match(h,/setNTType\('growth'\)/);
  inside.run("openEditTaskModal('a')");h=inside.modal.html;assert.match(h,/id="et-text"[^>]*value="Fix &lt;gate&gt;"/);assert.match(h,/<option value="high" selected>High/);
  const outside=runtime([task('a','Fix gate')],{realDialogs:true});outside.run("openTaskDetail('a')");assert.doesNotMatch(outside.modal.html,/jt-dialog/);assert.match(outside.modal.html,/Mark done/);
});
test('new/edit keep the app’s empty-text rule (shown in the dialog) and save through the existing functions',()=>{
  const app=runtime([task('a','Fix gate')],{jarvisOpen:true,realDialogs:true});
  const field=(id,value)=>{app.fields[id]={value,hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){app.calls.push('focus:'+id);}};};
  app.run("openNewTaskModal('','ops','')");field('nt-text','   ');field('jt-form-error','');app.fields['jt-form-error'].hidden=true;
  app.run("SV_TASKS_VIEW.saveForm('new','')");assert.equal(app.fields['jt-form-error'].hidden,false);assert.equal(app.fields['nt-text'].attrs['aria-invalid'],'true');assert.equal(app.run('D.tasks.length'),1);assert.ok(!app.calls.includes('save'));
  field('nt-text','Order pool salt');for(const [k,v] of [['nt-prop','mar'],['nt-due','2026-10-23'],['nt-time',''],['nt-note',''],['nt-prio','high']])field(k,v);
  app.run("SV_TASKS_VIEW.saveForm('new','')");const t=JSON.parse(app.run('JSON.stringify(D.tasks[1])'));
  assert.deepEqual([t.text,t.propId,t.dueDate,t.priority,t.urgent],['Order pool salt','mar','2026-10-23','high',true]);assert.equal(app.calls.filter(c=>c==='save').length,1);
});
test('Waiting: Jarvis dialog inside Jarvis, browser prompt outside; cancel changes nothing; save trims and stores once',()=>{
  const app=runtime([task('a','Call plumber',{status:'today'})],{jarvisOpen:true,realDialogs:true});
  app.run("tcbWaiting('a')");assert.match(app.modal.html,/<label for="jt-waiting">Waiting for<\/label>/);assert.equal(app.run('D.tasks[0].status'),'today','opening the dialog changes nothing');
  app.run("tcbSetWaiting('a',null)");assert.equal(app.run('D.tasks[0].status'),'today','cancel changes nothing');assert.ok(!app.calls.includes('save'));
  app.fields['jt-waiting']={value:'  Fictional plumber '};app.run("SV_TASKS_VIEW.saveWaiting('a')");
  assert.equal(app.run('D.tasks[0].status+"|"+D.tasks[0].waitingFor'),'waiting|Fictional plumber');assert.equal(app.calls.filter(c=>c==='save').length,1);
  const outside=runtime([task('b','Call roofer')],{realDialogs:true});outside.run("tcbWaiting('b')");assert.equal(outside.modal.html,'');assert.equal(outside.run('D.tasks[0].waitingFor'),'Fictional plumber','the existing prompt path is unchanged');
});
