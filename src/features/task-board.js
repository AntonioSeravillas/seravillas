/* Jarvis-themed Tasks page (classic script, after tasks.js). Presentation only: it reads the same task state the
   workspace Tasks tab uses (D.tasks, window._tcbView, window._tcbTab) and calls its existing actions (tcbDone, tcbMove,
   tcbWaiting, tcbReopen, openTaskDetail, openNewTaskModal). Rendering never changes a task; no second task store.
   Values are escaped; no element ids, so nothing collides with the workspace page. */
(function(){
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={down:'<path d="m6 9 6 6 6-6"/>',plus:'<path d="M12 5.5v13M5.5 12h13"/>',check:'<path d="m6.8 12.4 3.3 3.3 7.1-7.4"/>'};
  /* The workspace board's statuses, order and labels. */
  const STATUSES=['inbox','today','doing','waiting'],LABEL={inbox:'Inbox',today:'Today',doing:'Doing',waiting:'Waiting',done:'Done'};
  const VIEWS=[['board','Board'],['properties','By villa'],['projects','Projects'],['done','Done']];
  const expanded=new Set();
  const view=()=>VIEWS.some(v=>v[0]===window._tcbView)?window._tcbView:'board';
  const tab=()=>STATUSES.includes(window._tcbTab)?window._tcbTab:'inbox';
  const prio=t=>(typeof PRIO_CFG!=='undefined'&&PRIO_CFG[t.priority]?PRIO_CFG[t.priority].label:'');
  function due(t,td){if(!t.dueDate)return null;return t.dueDate<td?{text:'Overdue · '+fmtDate(t.dueDate),late:true}:t.dueDate===td?{text:'Due today',late:true}:{text:'Due '+fmtDate(t.dueDate),late:false};}
  function toolbar(){
    const td=today(),doneToday=D.tasks.filter(x=>x.done&&x.completedAt===td).length;
    const totalToday=D.tasks.filter(x=>x.status==='today'||x.status==='doing'||(x.done&&x.completedAt===td)).length;
    const open=D.tasks.filter(x=>!x.done).length;
    return '<header class="jb-head"><div class="jb-heading"><small class="jv-label">Tasks</small><div class="jb-title"><h2>'+esc(open+' open task'+(open===1?'':'s'))+'</h2></div></div>'
      +'<div class="jb-tools"><label class="jv-select jb-view"><span class="jarvis-sr">Task view</span><select data-jt-view>'+VIEWS.map(([v,l])=>'<option value="'+v+'"'+(view()===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+svg(I.down,14)+'</label>'
      +'<button type="button" class="jv-icon-btn" data-jt="create" aria-label="Add task" title="Add task">'+svg(I.plus)+'</button></div></header>'
      +'<p class="jc-summary">'+(totalToday?doneToday+' of '+totalToday+' done today':'Nothing planned for today yet')+'</p>';
  }
  function meta(t,td,{villa=true}={}){
    const parts=[];const d=due(t,td);
    if(villa&&t.propId)parts.push('<span>'+esc(propName(t.propId))+'</span>');
    if(t.priority==='high')parts.push('<span class="is-high">High priority</span>');else if(prio(t))parts.push('<span>'+esc(prio(t))+'</span>');
    if(d)parts.push('<span'+(d.late?' class="is-late"':'')+'>'+esc(d.text)+'</span>');
    if(t.status==='waiting'&&t.waitingFor)parts.push('<span>Waiting for '+esc(t.waitingFor)+'</span>');
    return parts.join('');
  }
  /* One task: done checkbox, the wording (opens the existing details), and its existing moves on demand. */
  function item(t,td,opts={}){
    const open=expanded.has(t.id),s=t.status||'inbox',d=due(t,td);
    let h='<li class="jt-task'+(open?' is-open':'')+(t.priority==='high'?' is-high':'')+(d&&d.late?' is-late':'')+'" data-task="'+esc(t.id)+'">'
      +'<button type="button" class="jt-check" data-jt-done="'+esc(t.id)+'" aria-label="Mark “'+esc(t.text)+'” done">'+svg(I.check,14)+'</button>'
      +'<button type="button" class="jt-main" data-jt-open="'+esc(t.id)+'"><b>'+esc(t.text)+'</b><small>'+meta(t,td,opts)+(opts.status?'<span>'+esc(LABEL[s]||s)+'</span>':'')+'</small></button>'
      +'<button type="button" class="jv-icon-btn jc-expand" data-jt-expand="'+esc(t.id)+'" aria-expanded="'+open+'" aria-label="'+(open?'Hide':'Show')+' actions for “'+esc(t.text)+'”">'+svg(I.down,15)+'</button>';
    if(open){
      h+='<div class="jt-actions">'+STATUSES.filter(x=>x!==s).map(x=>'<button type="button" class="jv-btn" data-jt-move="'+x+'" data-id="'+esc(t.id)+'">'+(x==='doing'?'Start':LABEL[x])+'</button>').join('')
        +'<button type="button" class="jv-btn jv-btn-primary" data-jt-done="'+esc(t.id)+'">Done</button><button type="button" class="jv-btn" data-jt-open="'+esc(t.id)+'">Details</button></div>';
    }
    return h+'</li>';
  }
  const list=(tasks,td,opts)=>tasks.length?'<ul class="jt-list">'+tasks.map(t=>item(t,td,opts)).join('')+'</ul>':'<p class="jc-none">'+esc(opts&&opts.empty||'No tasks.')+'</p>';
  function board(td){
    /* Open tasks only: a task completed from its details keeps its old status, so done ones are filtered here too. */
    const of=s=>D.tasks.filter(x=>x.status===s&&!x.done);
    let h='<div class="jt-chips" role="group" aria-label="Status">'+STATUSES.map(s=>'<button type="button" class="jv-btn'+(tab()===s?' is-current':'')+'" data-jt-tab="'+s+'" aria-pressed="'+(tab()===s)+'">'+LABEL[s]+' <span>'+of(s).length+'</span></button>').join('')+'</div>';
    /* Empty columns take less room, so wording in the busy ones wraps less. */
    h+='<div class="jt-board" style="--jt-cols:'+STATUSES.map(s=>of(s).length?'minmax(0,1fr)':'minmax(120px,.5fr)').join(' ')+'">';
    STATUSES.forEach(s=>{
      const tasks=of(s);
      h+='<section class="jt-col'+(tab()===s?' is-tab':'')+(tasks.length?'':' is-empty')+'"><h3><span>'+LABEL[s]+'</span><b>'+tasks.length+'</b></h3>'+list(tasks,td,{empty:'Nothing here.'})+'</section>';
    });
    return h+'</div>';
  }
  function byVilla(td){
    const groups=D.props.map(p=>({name:p.name,propId:p.id,tasks:D.tasks.filter(x=>!x.done&&x.propId===p.id)}));
    const general=D.tasks.filter(x=>!x.done&&!x.propId);if(general.length)groups.push({name:'No villa / general',propId:'',tasks:general});
    if(!groups.length)return empty('No villas yet.','Add villas in the app to group tasks by villa.');
    return '<div class="jc-days">'+groups.map(g=>'<section class="jc-day"><h3>'+esc(g.name)+'<small class="jt-count">'+g.tasks.length+' open</small><button type="button" class="jv-btn jt-add" data-jt-add-prop="'+esc(g.propId)+'">Add task</button></h3>'+list(g.tasks,td,{villa:false,status:true,empty:'All clear.'})+'</section>').join('')+'</div>';
  }
  function projects(td){
    const projs=D.projects||[];
    if(!projs.length&&!D.tasks.some(x=>x.type==='growth'))return empty('No projects yet.','Add a task and set its type to Growth to start a project.');
    const groups=projs.map(p=>({name:p.name,id:p.id,tasks:D.tasks.filter(x=>x.projectId===p.id)}));
    const loose=D.tasks.filter(x=>x.type==='growth'&&(!x.projectId||!projs.some(p=>p.id===x.projectId)));if(loose.length)groups.push({name:'Unassigned growth tasks',id:'',tasks:loose});
    return '<div class="jc-days">'+groups.map(g=>{const done=g.tasks.filter(x=>x.done).length;const openT=g.tasks.filter(x=>!x.done);
      return '<section class="jc-day"><h3>'+esc(g.name)+'<small class="jt-count">'+done+' of '+g.tasks.length+' done</small><button type="button" class="jv-btn jt-add" data-jt-add-project="'+esc(g.id)+'">Add task</button></h3>'+list(openT,td,{status:true,empty:g.tasks.length?'All done.':'No tasks yet.'})+'</section>';}).join('')+'</div>';
  }
  function doneView(td){
    const done=D.tasks.filter(x=>x.done).sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
    if(!done.length)return empty('Nothing done yet.','Completed tasks appear here.');
    const ws=startOfWeek(td),ms=td.slice(0,7)+'-01';
    const sections=[['Done today',done.filter(x=>x.completedAt===td)],['Done this week',done.filter(x=>x.completedAt>=ws&&x.completedAt<td)],['Done this month',done.filter(x=>x.completedAt>=ms&&x.completedAt<ws)],['Older',done.filter(x=>!x.completedAt||x.completedAt<ms)]].filter(s=>s[1].length);
    return '<div class="jc-days">'+sections.map(([label,tasks])=>'<section class="jc-day"><h3>'+esc(label)+'<small class="jt-count">'+tasks.length+'</small></h3><ul class="jt-list">'+tasks.map(t=>'<li class="jt-task is-done"><span class="jt-check is-on" aria-hidden="true">'+svg(I.check,14)+'</span><button type="button" class="jt-main" data-jt-open="'+esc(t.id)+'"><b>'+esc(t.text)+'</b><small>'+(t.propId?'<span>'+esc(propName(t.propId))+'</span>':'')+(t.completedAt?'<span>Completed '+esc(fmtDate(t.completedAt))+'</span>':'')+'</small></button><button type="button" class="jv-btn" data-jt-reopen="'+esc(t.id)+'">Reopen</button></li>').join('')+'</ul></section>').join('')+'</div>';
  }
  function empty(title,sub){return '<div class="jb-empty"><p>'+esc(title)+'</p><small>'+esc(sub)+'</small><button type="button" class="jv-btn" data-jt="create">Add task</button></div>';}
  function render(host){
    if(!host)return;D.tasks.forEach(migrateTask);D.projects=D.projects||[];
    const td=today(),v=view(),scroller=host.querySelector('.jc-body'),top=scroller?scroller.scrollTop:0;
    const body=v==='properties'?byVilla(td):v==='projects'?projects(td):v==='done'?doneView(td):D.tasks.some(x=>!x.done)?board(td):empty('No open tasks.','Add a task, or ask Jarvis to add one for you.');
    host.innerHTML=toolbar()+'<div class="jc-body jt-body is-'+v+'">'+body+'</div>';
    const next=host.querySelector('.jc-body');if(next&&scroller)next.scrollTop=top;
  }
  function bind(host){
    if(!host||host.dataset.jtBound)return;host.dataset.jtBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-jt],[data-jt-open],[data-jt-done],[data-jt-expand],[data-jt-move],[data-jt-reopen],[data-jt-tab],[data-jt-add-prop],[data-jt-add-project]');if(!t)return;
      const d=t.dataset;
      if(d.jtOpen){openTaskDetail(d.jtOpen);return;}
      if(d.jtDone){expanded.delete(d.jtDone);tcbDone(d.jtDone);return;}
      if(d.jtReopen){tcbReopen(d.jtReopen);return;}
      if(d.jtMove){expanded.delete(d.id);if(d.jtMove==='waiting')tcbWaiting(d.id);else tcbMove(d.id,d.jtMove);return;}
      if(d.jtExpand){const id=d.jtExpand;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render(host);host.querySelector('[data-jt-expand="'+CSS.escape(id)+'"]')?.focus();return;}
      if(d.jtTab){window._tcbTab=d.jtTab;render(host);return;}
      if(d.jtAddProp!==undefined){openNewTaskModal(d.jtAddProp,'ops','');return;}
      if(d.jtAddProject!==undefined){openNewTaskModal('','growth',d.jtAddProject);return;}
      if(d.jt==='create')openNewTaskModal('','ops','');
    });
    host.addEventListener('change',e=>{if(e.target.matches?.('[data-jt-view]')){window._tcbView=e.target.value;expanded.clear();render(host);}});
  }
  /* ── Dialogs in the Jarvis theme. They keep the workspace field ids (nt-*, et-*) so the existing saveNewTask /
     saveEditTask / tcbSetWaiting do the validation, persistence and sync; only the presentation differs. ── */
  const q=v=>JSON.stringify(String(v)).replace(/"/g,'&quot;');
  const opt=(v,l,sel)=>'<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(l)+'</option>';
  function waitingDialog(t){
    return '<form class="jv-modal jt-dialog" onsubmit="event.preventDefault();SV_TASKS_VIEW.saveWaiting('+q(t.id)+')"><small class="jv-label">Waiting</small><div class="modal-title">'+esc(t.text)+'</div>'
      +'<div class="field"><label for="jt-waiting">Waiting for</label><input type="text" id="jt-waiting" maxlength="120" autocomplete="off" value="'+esc(t.waitingFor||'')+'" placeholder="A person or company" aria-describedby="jt-waiting-help"></div>'
      +'<p class="jv-modal-help" id="jt-waiting-help">Optional. The task moves to Waiting.</p>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="closeModal()">Cancel</button><button type="submit" class="jv-btn jv-btn-primary">Move to Waiting</button></div></form>';
  }
  function openWaiting(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;showModal(waitingDialog(t));setTimeout(()=>document.getElementById('jt-waiting')?.focus(),60);}
  function saveWaiting(id){const box=document.getElementById('jt-waiting');if(!box)return;const who=box.value;closeModal();tcbSetWaiting(id,who);}
  /* New task and Edit task: one layout; `kind` selects the existing field ids and save function. */
  function taskForm(kind,t,prefill={}){
    const p=kind==='new'?'nt':'et',type=kind==='new'?(prefill.type||'ops'):(t.type||'ops'),prio=kind==='new'?'medium':(t.priority||'medium');
    const propId=kind==='new'?(prefill.propId||''):(t.propId||''),projectId=kind==='new'?(prefill.projectId||''):(t.projectId||'');
    const setType=kind==='new'?'setNTType':'setETType',id=kind==='new'?'':t.id;
    const chip=(v,l)=>'<button type="button" class="chip'+(type===v?' on':'')+'" aria-pressed="'+(type===v)+'" onclick="'+setType+'(\''+v+'\');SV_TASKS_VIEW.syncType()">'+l+'</button>';
    return '<div class="jv-modal jt-dialog"><small class="jv-label">'+(kind==='new'?'New task':'Edit task')+'</small><div class="modal-title">'+(kind==='new'?'What needs doing?':esc(t.text))+'</div>'
      +'<div class="field"><label for="'+p+'-text">Task</label><input type="text" id="'+p+'-text" maxlength="300" value="'+(kind==='new'?'':esc(t.text))+'" placeholder="Describe the task" aria-describedby="jt-form-error"></div>'
      +'<p class="jv-note jt-form-error" id="jt-form-error" role="alert" hidden>Please enter the task.</p>'
      +'<div class="field"><span class="jt-field-label" id="'+p+'-type-label">Type</span><div class="chips" role="group" aria-labelledby="'+p+'-type-label">'+chip('ops','Ops')+chip('growth','Growth')+'</div></div>'
      +'<div class="field" id="'+p+'-proj-field" style="display:'+(type==='growth'?'block':'none')+'"><label for="'+p+'-proj">Project</label><select id="'+p+'-proj">'+opt('','Unassigned',!projectId)+(D.projects||[]).map(x=>opt(x.id,x.name,x.id===projectId)).join('')+'</select></div>'
      +'<div class="jt-fields">'
      +'<div class="field"><label for="'+p+'-prio">Priority</label><select id="'+p+'-prio">'+[['high','High'],['medium','Medium'],['low','Low']].map(([v,l])=>opt(v,l,v===prio)).join('')+'</select></div>'
      +'<div class="field"><label for="'+p+'-prop">Villa</label><select id="'+p+'-prop">'+opt('','No villa',!propId)+D.props.map(x=>opt(x.id,x.name,x.id===propId)).join('')+'</select></div>'
      +'<div class="field"><label for="'+p+'-due">Due date</label><input type="date" id="'+p+'-due" value="'+(kind==='new'?'':esc(t.dueDate||''))+'"></div>'
      +'<div class="field"><label for="'+p+'-time">Time estimate</label><input type="text" id="'+p+'-time" value="'+(kind==='new'?'':esc(t.timeEst||''))+'" placeholder="e.g. 30 min"></div></div>'
      +'<div class="field"><label for="'+p+'-note">Notes</label><textarea id="'+p+'-note" rows="3" placeholder="Extra details">'+(kind==='new'?'':esc(t.note||''))+'</textarea></div>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="'+(kind==='new'?'closeModal()':'openTaskDetail('+q(id)+')')+'">Cancel</button><button type="button" class="jv-btn jv-btn-primary" onclick="SV_TASKS_VIEW.saveForm(\''+kind+'\','+q(id)+')">'+(kind==='new'?'Save task':'Save changes')+'</button></div></div>';
  }
  /* The same empty-text rule as saveNewTask/saveEditTask, shown in the dialog instead of a browser alert. */
  function saveForm(kind,id){
    const box=document.getElementById(kind==='new'?'nt-text':'et-text'),err=document.getElementById('jt-form-error');
    if(!box||!box.value.trim()){if(err)err.hidden=false;box?.setAttribute('aria-invalid','true');box?.focus();return;}
    if(kind==='new')saveNewTask();else saveEditTask(id);
  }
  function syncType(){document.querySelectorAll('#modal-root .chips .chip').forEach(c=>c.setAttribute('aria-pressed',String(c.classList.contains('on'))));}
  function detail(t){
    const id=q(t.id),td=today(),d=due(t,td),s=t.done?'done':(t.status||'inbox');window._dtid=t.id;
    const row=(k,v)=>'<dt>'+esc(k)+'</dt><dd>'+v+'</dd>';
    return '<div class="jv-modal jt-dialog"><small class="jv-label">Task</small><div class="modal-title">'+esc(t.text)+'</div>'
      +'<p class="jv-modal-sub"><span class="jv-status'+(t.done?'':t.priority==='high'||d&&d.late?' is-pending':'')+'">'+esc(LABEL[s]||s)+'</span>'+(prio(t)?' · '+esc(prio(t))+' priority':'')+(d?' · '+esc(d.text):'')+'</p>'
      +'<dl class="jv-facts">'+row('Villa',t.propId?esc(propName(t.propId)):'No villa')+row('Due',t.dueDate?esc(fmtDate(t.dueDate)):'No deadline')
      +(t.timeEst?row('Time estimate',esc(t.timeEst)):'')+(t.status==='waiting'&&t.waitingFor?row('Waiting for',esc(t.waitingFor)):'')
      +(t.type==='growth'?row('Project',esc((D.projects||[]).find(x=>x.id===t.projectId)?.name||'Unassigned')):'')
      +(t.pinned||t.inFocus?row('Marked',[t.pinned?'Pinned':'',t.inFocus?'In focus':''].filter(Boolean).join(' · ')):'')+(t.done&&t.completedAt?row('Completed',esc(fmtDate(t.completedAt))):'')+'</dl>'
      +(t.note?'<p class="jv-notes">'+esc(t.note)+'</p>':'')
      +(t.photo?'<img class="jt-photo" src="'+esc(t.photo)+'" alt="Photo attached to this task">':'')
      +'<div class="jv-actions">'+(t.done?'<button type="button" class="jv-btn jv-btn-primary" onclick="closeModal();tcbReopen('+id+')">Reopen</button>':'<button type="button" class="jv-btn jv-btn-primary" onclick="closeModal();tcbDone('+id+')">Mark done</button>')
      +'<button type="button" class="jv-btn" onclick="openEditTaskModal('+id+')">Edit</button>'
      +'<button type="button" class="jv-btn" aria-pressed="'+!!t.pinned+'" onclick="togglePin('+id+');openTaskDetail('+id+')">'+(t.pinned?'Unpin':'Pin')+'</button>'
      +'<button type="button" class="jv-btn" aria-pressed="'+!!t.inFocus+'" onclick="toggleFocus('+id+');openTaskDetail('+id+')">'+(t.inFocus?'Remove focus':'Focus')+'</button>'
      +(t.photo?'<button type="button" class="jv-btn" onclick="removeTaskPhoto('+id+')">Remove photo</button>':'<button type="button" class="jv-btn" onclick="_photoTaskId='+id+';document.getElementById(\'task-photo-file\').click()">Add photo</button>')
      +'</div><div class="jv-actions jv-actions-end"><span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" onclick="this.parentNode.classList.add(\'is-asking\');this.nextElementSibling.querySelector(\'button\').focus()">Delete</button>'
      +'<span class="jt-delete-ask" role="group" aria-label="Confirm delete">Delete this task? <button type="button" class="jv-btn jv-btn-danger" onclick="closeModal();deleteTask('+id+')">Delete</button><button type="button" class="jv-btn" onclick="this.closest(\'.jt-delete\').classList.remove(\'is-asking\')">Keep</button></span></span>'
      +'<button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
  }
  window.SV_TASKS_VIEW={render,bind,detail,taskForm,waitingDialog,openWaiting,saveWaiting,saveForm,syncType};
})();
