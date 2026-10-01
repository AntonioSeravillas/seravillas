/* ── TASKS TAB ── */
/* Priority config */
const PRIO_CFG = {
  high:   {bg:'var(--red-bg)',    border:'var(--red-border)',    text:'var(--red-text)',    dot:'var(--red)',    label:'High',   badgeCls:'pb-high'},
  medium: {bg:'var(--amber-bg)',  border:'var(--amber-border)',  text:'var(--amber-text)',  dot:'var(--amber)',  label:'Medium', badgeCls:'pb-medium'},
  low:    {bg:'var(--purple-bg)', border:'var(--purple-border)', text:'var(--purple-text)', dot:'var(--purple)', label:'Low',    badgeCls:'pb-low'},
};

function projName(id){const p=D.projects.find(x=>x.id===id);return p?p.name:'';}

function calcWeekScore(){
  const total=D.tasks.length;if(!total)return 0;
  return Math.round(D.tasks.filter(t=>t.done).length/total*100);
}
function calcTodayTimeEst(tasks){
  let mins=0,hasAny=false;
  tasks.forEach(t=>{if(!t.timeEst)return;hasAny=true;const e=t.timeEst.toLowerCase();const h=e.match(/(\d+\.?\d*)\s*h/);const m=e.match(/(\d+)\s*m/);if(h)mins+=parseFloat(h[1])*60;if(m)mins+=parseInt(m[1]);});
  if(!hasAny||mins===0)return null;
  if(mins<60)return mins+'m';
  const h=Math.floor(mins/60);const m=mins%60;return h+'h'+(m?m+'m':'');
}

function tcbMomentumData(){
  var days=[],t=new Date();
  for(var i=6;i>=0;i--){
    var d=new Date(t);d.setDate(d.getDate()-i);
    var ds=d.toISOString().slice(0,10);
    days.push({ds:ds,n:D.tasks.filter(function(x){return x.done&&x.completedAt===ds;}).length});
  }
  return days;
}
function tcbLineChart(data,w,h,gId,showLabels,showVals){
  var vals=data.map(function(d){return d.n;});
  var max=Math.max.apply(null,vals.concat([1]));
  var pad={t:showVals?22:8,b:showLabels?20:4,l:4,r:4};
  var W=w-pad.l-pad.r,H=h-pad.t-pad.b;
  var pts=vals.map(function(v,i){return[pad.l+i*(W/(vals.length-1||1)),pad.t+H*(1-v/max)];});
  var path='M'+pts[0][0]+','+pts[0][1];
  for(var i=1;i<pts.length;i++){
    var cp1x=(pts[i-1][0]+pts[i][0])/2,cp1y=pts[i-1][1];
    var cp2x=(pts[i-1][0]+pts[i][0])/2,cp2y=pts[i][1];
    path+=' C'+cp1x+','+cp1y+' '+cp2x+','+cp2y+' '+pts[i][0]+','+pts[i][1];
  }
  var fillPath=path+' L'+pts[pts.length-1][0]+','+(pad.t+H)+' L'+pts[0][0]+','+(pad.t+H)+' Z';
  var svg='<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="overflow:visible">'
    +'<defs><linearGradient id="'+gId+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
    +'<path d="'+fillPath+'" fill="url(#'+gId+')" />'
    +'<path d="'+path+'" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  if(showVals){pts.forEach(function(pt,i){if(vals[i]>0){svg+='<text x="'+pt[0]+'" y="'+(pt[1]-6)+'" text-anchor="middle" font-size="9" font-weight="700" fill="var(--text3)">'+vals[i]+'</text>';}});}
  if(showLabels){var dayN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];pts.forEach(function(pt,i){svg+='<text x="'+pt[0]+'" y="'+(pad.t+H+14)+'" text-anchor="middle" font-size="9" fill="var(--text3)">'+dayN[i]+'</text>';});}
  svg+='</svg>';return svg;
}
function tcbMomentumCard(){
  var data=tcbMomentumData();
  var todayN=data[data.length-1].n;
  var weekTotal=data.reduce(function(a,d){return a+d.n;},0);
  var prev=data[data.length-2].n;
  var trend=todayN>prev?'↑ +'+(todayN-prev):todayN<prev?'↓ '+(todayN-prev):'→ same';
  return'<div class="tcb-momentum" onclick="openMomentumModal()">'
    +'<div class="tcb-momentum-hd"><div class="tcb-momentum-title">Task Momentum</div>'
    +'<span class="tcb-momentum-trend">'+trend+'</span></div>'
    +'<div class="tcb-momentum-body">'
    +'<div class="tcb-momentum-nums"><div class="tcb-momentum-big">'+weekTotal+'</div><div class="tcb-momentum-sub">Done this week</div></div>'
    +'<div class="tcb-momentum-chart">'+tcbLineChart(data,200,60,'mom-g',false,true)+'</div>'
    +'</div></div>';
}
function openMomentumModal(){
  var data=tcbMomentumData();
  var weekTotal=data.reduce(function(a,d){return a+d.n;},0);
  showModal('<div class="modal-handle"></div><div class="modal-title">Task Momentum</div>'
    +'<div style="text-align:center;margin-bottom:16px">'+tcbLineChart(data,320,120,'mom-modal-g',true,true)+'</div>'
    +'<div style="text-align:center;font-size:24px;font-weight:800;color:var(--text);font-family:\'DM Mono\',monospace">'+weekTotal+' <span style="font-size:13px;font-weight:600;color:var(--text3)">tasks done this week</span></div>'
    +'<div style="margin-top:16px"><button class="btn btn-ghost" style="width:100%" onclick="closeModal()">Close</button></div>');
}
function renderTasks(){
  D.tasks.forEach(migrateTask);
  D.projects=D.projects||[];
  var t=today();
  var view=window._tcbView||'board';

  var doneToday=D.tasks.filter(function(x){return x.done&&x.completedAt===t;}).length;
  var totalToday=D.tasks.filter(function(x){return x.status==='today'||x.status==='doing'||(x.done&&x.completedAt===t);}).length;
  var pct=totalToday?Math.round(doneToday/totalToday*100):0;

  var h='<div class="sv-page">';

  h+='<div class="sv-page-header">';
  h+='<div class="sv-page-heading"><div class="sv-title">Tasks</div><div class="sv-subtitle">Capture, organise and get things done.</div></div>';
  h+='<div class="sv-actions"><button class="sv-btn sv-btn-primary" onclick="openNewTaskModal(\'\',\'ops\',\'\')">+ Add Task</button></div>';
  h+='</div>';

  h+='<div class="tcb-capture">';
  h+='<input class="tcb-capture-input" type="text" id="tcb-input" placeholder="What\'s on your mind?" onkeydown="if(event.key===\'Enter\')tcbAdd()">';
  h+='<button class="tcb-capture-btn" onclick="tcbAdd()">Add</button>';
  h+='</div>';

  h+='<div class="tcb-progress">';
  h+='<div class="tcb-progress-nums">'+doneToday+'<span>/'+totalToday+'</span></div>';
  h+='<div class="tcb-progress-bar-wrap"><div class="tcb-progress-label">Today\'s progress</div>';
  h+='<div class="tcb-progress-bar"><div class="tcb-progress-fill" style="width:'+pct+'%"></div></div></div>';
  h+='<div class="tcb-progress-pct">'+pct+'%</div>';
  h+='</div>';

  h+=tcbMomentumCard();

  var views=[['board','Board'],['projects','Projects'],['properties','Properties'],['done','Done']];
  h+='<div class="sv-tabs" style="margin-bottom:8px">';
  views.forEach(function(v){h+='<button class="sv-tab'+(view===v[0]?' active':'')+'" onclick="window._tcbView=\''+v[0]+'\';render()">'+v[1]+'</button>';});
  h+='</div>';

  if(view==='board')           h+=tcbBoardView(t);
  else if(view==='projects')   h+=tcbProjectsView(t);
  else if(view==='properties') h+=tcbPropertiesView(t);
  else                         h+=tcbDoneView(t);

  h+='</div>';
  return h;
}
/* ── BOARD VIEW ── */
function tcbBoardView(t){
  var statuses=['inbox','today','doing','waiting'];
  var labels={inbox:'Inbox',today:'Today',doing:'Doing',waiting:'Waiting'};
  var colClass={inbox:'tcb-col-inbox',today:'tcb-col-today',doing:'tcb-col-doing',waiting:'tcb-col-waiting'};
  var colDot={inbox:'#38bdf8',today:'var(--accent)',doing:'#a855f7',waiting:'#f59e0b'};
  var mobStatus=window._tcbTab||'inbox';
  var h='';
  h+='<div class="sv-chip-row" style="margin-bottom:12px">';
  statuses.forEach(function(s){
    var cnt=D.tasks.filter(function(x){return x.status===s;}).length;
    h+='<button class="sv-chip'+(mobStatus===s?' active':'')+'" onclick="window._tcbTab=\''+s+'\';render()">'+labels[s]+'<span style="opacity:.55;font-weight:600;margin-left:4px">'+cnt+'</span></button>';
  });
  h+='</div>';
  h+='<div class="tcb-board">';
  statuses.forEach(function(s){
    var tasks=D.tasks.filter(function(x){return x.status===s;});
    var isMobHidden=mobStatus!==s;
    h+='<div class="tcb-col '+colClass[s]+(isMobHidden?' mob-hidden':'')+'">';
    h+='<div class="tcb-col-hd">';
    h+='<span class="tcb-col-dot" style="background:'+colDot[s]+'"></span>';
    h+='<span class="tcb-col-title">'+labels[s]+'</span>';
    h+='<span class="tcb-col-count">'+tasks.length+'</span>';
    h+='<button style="margin-left:4px;width:20px;height:20px;border-radius:50%;border:1px solid var(--border2);background:none;cursor:pointer;color:var(--text3);font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center" onclick="tcbAddTo(\''+s+'\')" title="Add to '+labels[s]+'">+</button>';
    h+='</div>';
    h+='<div class="tcb-col-body">';
    if(!tasks.length) h+='<div class="tcb-empty">Empty</div>';
    else tasks.forEach(function(task){h+=tcbCard(task,t);});
    h+='</div></div>';
  });
  h+='</div>';
  return h;
}
/* ── PROJECTS VIEW ── */
function tcbProjectsView(t){
  D.projects=D.projects||[];
  if(!D.projects.length&&!D.tasks.filter(function(x){return x.type==='growth';}).length){
    return '<div class="sv-empty"><div class="sv-empty-title">No projects yet</div><div class="sv-empty-sub">Use + Add Task and set type to Growth to start a project.</div></div>';
  }
  var h='<div class="tcb-grid">';
  D.projects.forEach(function(proj){
    var pt=D.tasks.filter(function(x){return x.projectId===proj.id;});
    var done=pt.filter(function(x){return x.done;}).length;
    var pct=pt.length?Math.round(done/pt.length*100):0;
    var clr=proj.color||'var(--accent)';
    h+='<div class="tcb-pj-card">';
    h+='<div class="tcb-pj-hd"><div class="tcb-pj-dot" style="background:'+esc(clr)+'"></div>';
    h+='<span class="tcb-pj-name">'+esc(proj.name)+'</span>';
    h+='<span class="tcb-pj-tag">Growth</span></div>';
    h+='<div class="tcb-pj-stats"><span class="tcb-pj-frac">'+done+'/'+pt.length+' tasks</span><div class="tcb-pj-bar"><div class="tcb-pj-fill" style="width:'+pct+'%;background:'+esc(clr)+'"></div></div><span class="tcb-pj-pct">'+pct+'%</span></div>';
    h+='<div class="tcb-pj-tasks">';
    if(!pt.length) h+='<div class="tcb-empty">No tasks yet</div>';
    else pt.slice(0,6).forEach(function(task){
      var stClr={inbox:'var(--text3)',today:'var(--accent-text)',doing:'#7c3aed',waiting:'#d97706',done:'#16a34a'};
      var stBg={inbox:'var(--surface2)',today:'var(--accent-bg)',doing:'rgba(168,85,247,.12)',waiting:'rgba(245,158,11,.12)',done:'rgba(34,197,94,.12)'};
      h+='<div class="tcb-pj-row" onclick="openTaskDetail(\''+task.id+'\')">';
      h+='<div class="tcb-pj-chk'+(task.done?' done':'')+'" onclick="event.stopPropagation();'+(task.done?'tcbReopen(\''+task.id+'\')':'tcbDone(\''+task.id+'\')')+'">'+(task.done?'✓':'')+'</div>';
      h+='<span class="tcb-pj-txt'+(task.done?' done':'')+'">'+esc(task.text)+'</span>';
      if(!task.done) h+='<span class="tcb-pj-st" style="color:'+stClr[task.status||'inbox']+';background:'+stBg[task.status||'inbox']+'">'+esc(task.status||'inbox')+'</span>';
      h+='</div>';
    });
    if(pt.length>6) h+='<div class="tcb-empty">+'+(pt.length-6)+' more</div>';
    h+='</div>';
    h+='<div class="tcb-add-row" onclick="openNewTaskModal(\'\',\'growth\',\''+proj.id+'\')">';
    h+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add task</div>';
    h+='</div>';
  });
  var unassigned=D.tasks.filter(function(x){return x.type==='growth'&&(!x.projectId||!D.projects.find(function(p){return p.id===x.projectId;}));});
  if(unassigned.length){
    h+='<div class="tcb-pj-card">';
    h+='<div class="tcb-pj-hd"><div class="tcb-pj-dot" style="background:var(--text3)"></div><span class="tcb-pj-name">Unassigned Growth Tasks</span></div>';
    h+='<div class="tcb-pj-tasks">';
    unassigned.slice(0,8).forEach(function(task){
      h+='<div class="tcb-pj-row" onclick="openTaskDetail(\''+task.id+'\')">';
      h+='<div class="tcb-pj-chk'+(task.done?' done':'')+'" onclick="event.stopPropagation();'+(task.done?'tcbReopen(\''+task.id+'\')':'tcbDone(\''+task.id+'\')')+'">'+(task.done?'✓':'')+'</div>';
      h+='<span class="tcb-pj-txt'+(task.done?' done':'')+'">'+esc(task.text)+'</span>';
      h+='</div>';
    });
    h+='</div>';
    h+='<div class="tcb-add-row" onclick="openNewTaskModal(\'\',\'growth\',\'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add growth task</div>';
    h+='</div>';
  }
  h+='</div>';
  return h;
}
/* ── PROPERTIES VIEW ── */
function tcbPropertiesView(t){
  var h='<div class="tcb-grid">';
  D.props.forEach(function(prop){
    var tasks=D.tasks.filter(function(x){return !x.done&&x.propId===prop.id;});
    var ci=propColorIdx(prop.id);
    var clr=propBarColor(prop.id);
    h+='<div class="tcb-pr-card">';
    h+='<div class="tcb-pr-hd">';
    h+='<div class="tcb-pr-avatar pc-'+ci+'" style="width:36px;height:36px;border-radius:10px">'+avInit(prop.name)+'</div>';
    h+='<div><div class="tcb-pr-name">'+esc(prop.name)+'</div><div class="tcb-pr-cnt">'+tasks.length+' open task'+(tasks.length!==1?'s':'')+'</div></div>';
    h+='</div>';
    h+='<div class="tcb-pj-tasks">';
    if(!tasks.length) h+='<div class="tcb-empty">All clear ✓</div>';
    else tasks.slice(0,6).forEach(function(task){
      var stClr={inbox:'var(--text3)',today:'var(--accent-text)',doing:'#7c3aed',waiting:'#d97706'};
      var stBg={inbox:'var(--surface2)',today:'var(--accent-bg)',doing:'rgba(168,85,247,.12)',waiting:'rgba(245,158,11,.12)'};
      var s=task.status||'inbox';
      h+='<div class="tcb-pj-row" onclick="openTaskDetail(\''+task.id+'\')">';
      h+='<div class="tcb-pj-chk" onclick="event.stopPropagation();tcbDone(\''+task.id+'\')"></div>';
      h+='<span class="tcb-pj-txt">'+esc(task.text)+'</span>';
      h+='<span class="tcb-pj-st" style="color:'+(stClr[s]||'var(--text3)')+';background:'+(stBg[s]||'var(--surface2)')+'">'+s+'</span>';
      h+='</div>';
    });
    if(tasks.length>6) h+='<div class="tcb-empty">+'+(tasks.length-6)+' more</div>';
    h+='</div>';
    h+='<div class="tcb-add-row" onclick="openNewTaskModal(\''+prop.id+'\',\'ops\',\'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add task</div>';
    h+='</div>';
  });
  /* No property / General */
  var genTasks=D.tasks.filter(function(x){return !x.done&&!x.propId;});
  if(genTasks.length){
    h+='<div class="tcb-pr-card">';
    h+='<div class="tcb-pr-hd"><div class="tcb-pr-avatar" style="background:var(--surface2);color:var(--text3)">✦</div>';
    h+='<div><div class="tcb-pr-name">No Property / General</div><div class="tcb-pr-cnt">'+genTasks.length+' open task'+(genTasks.length!==1?'s':'')+'</div></div></div>';
    h+='<div class="tcb-pj-tasks">';
    genTasks.slice(0,6).forEach(function(task){
      h+='<div class="tcb-pj-row" onclick="openTaskDetail(\''+task.id+'\')">';
      h+='<div class="tcb-pj-chk" onclick="event.stopPropagation();tcbDone(\''+task.id+'\')"></div>';
      h+='<span class="tcb-pj-txt">'+esc(task.text)+'</span>';
      var s=task.status||'inbox';
      h+='<span class="tcb-pj-st" style="color:var(--text3);background:var(--surface2)">'+s+'</span>';
      h+='</div>';
    });
    if(genTasks.length>6) h+='<div class="tcb-empty">+'+(genTasks.length-6)+' more</div>';
    h+='</div>';
    h+='<div class="tcb-add-row" onclick="openNewTaskModal(\'\',\'ops\',\'\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add task</div>';
    h+='</div>';
  }
  h+='</div>';
  return h;
}

/* ── DONE VIEW ── */
function tcbDoneView(t){
  if(!window._tcbDoneSections) window._tcbDoneSections={today:true,week:false,month:false,older:false};
  var ds=window._tcbDoneSections;
  var done=D.tasks.filter(function(x){return x.done;}).sort(function(a,b){return(b.completedAt||'').localeCompare(a.completedAt||'');});
  var ws=startOfWeek(t);
  var ms=t.slice(0,7)+'-01';
  var sections=[
    {key:'today',label:'Done Today',tasks:done.filter(function(x){return x.completedAt===t;})},
    {key:'week',label:'Done This Week',tasks:done.filter(function(x){return x.completedAt>=ws&&x.completedAt<t;})},
    {key:'month',label:'Done This Month',tasks:done.filter(function(x){return x.completedAt>=ms&&x.completedAt<ws;})},
    {key:'older',label:'Older',tasks:done.filter(function(x){return !x.completedAt||x.completedAt<ms;})}
  ];
  var checkSvg='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
  var h='';
  sections.forEach(function(sec){
    if(!sec.tasks.length)return;
    var open=ds[sec.key];
    h+='<div class="tcb-done-section">';
    h+='<div class="tcb-done-hd" onclick="window._tcbDoneSections[\''+sec.key+'\']=!window._tcbDoneSections[\''+sec.key+'\'];render()">';
    h+='<div class="tcb-done-icon" style="background:rgba(34,197,94,.15);color:#16a34a">'+checkSvg+'</div>';
    h+='<span class="tcb-done-label">'+sec.label+'</span>';
    h+='<span class="tcb-done-badge">'+sec.tasks.length+'</span>';
    h+='<span class="tcb-done-chev'+(open?' open':'')+'">▾</span>';
    h+='</div>';
    if(open){
      h+='<div class="tcb-done-body">';
      sec.tasks.forEach(function(task){
        h+='<div class="tcb-done-chip">';
        h+='<div class="tcb-done-chip-chk">'+checkSvg+'</div>';
        h+='<span class="tcb-done-chip-text">'+esc(task.text)+'</span>';
        if(task.propId) h+='<span class="tcb-done-chip-prop">'+esc(propName(task.propId).replace(/^Villa /i,''))+'</span>';
        h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="tcbReopen(\''+task.id+'\')">Reopen</button>';
        h+='</div>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  if(!done.length) h='<div class="sv-empty"><div class="sv-empty-title">Nothing done yet</div><div class="sv-empty-sub">Complete tasks in the board to see them here.</div></div>';
  return h;
}
/* ── Quick-add to a specific column ── */
function tcbAddTo(status){
  var text=prompt('New task for '+status+':');
  if(!text||!text.trim())return;
  D.tasks.push({id:uid(),text:text.trim(),status:status,propId:'',priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:today(),type:'ops',projectId:'',waitingFor:''});
  save();render();
}

function tcbCard(task,t){
  var s=task.status||'inbox';
  var h='<div class="tcb-card status-'+s+'">';
  h+='<div class="tcb-card-text">'+esc(task.text)+'</div>';
  var meta='';
  if(task.propId) meta+='<span class="tcb-badge tcb-badge-prop">'+esc(propName(task.propId).replace(/^Villa /i,''))+'</span>';
  if(task.priority==='high') meta+='<span class="tcb-badge tcb-badge-high">High</span>';
  else if(task.priority==='medium') meta+='<span class="tcb-badge tcb-badge-medium">Med</span>';
  if(task.dueDate){
    var isOvd=task.dueDate<t;
    var isDueToday=task.dueDate===t;
    if(isOvd) meta+='<span class="tcb-badge tcb-badge-overdue">Overdue</span>';
    else if(isDueToday) meta+='<span class="tcb-badge tcb-badge-due">Due today</span>';
    else meta+='<span class="tcb-badge tcb-badge-prop">'+fmtDate(task.dueDate)+'</span>';
  }
  if(task.status==='waiting'&&task.waitingFor) meta+='<span class="tcb-badge tcb-badge-waiting">Waiting: '+esc(task.waitingFor)+'</span>';
  if(meta) h+='<div class="tcb-card-meta">'+meta+'</div>';
  if(task.note&&task.note.trim()) h+='<div class="tcb-card-note">'+esc(task.note.slice(0,80))+'</div>';
  h+='<div class="tcb-card-actions">';
  if(s!=='done'){
    if(s!=='inbox')   h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="tcbMove(\''+task.id+'\',\'inbox\')">Inbox</button>';
    if(s!=='today')   h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="tcbMove(\''+task.id+'\',\'today\')">Today</button>';
    if(s!=='doing')   h+='<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="tcbMove(\''+task.id+'\',\'doing\')">Start</button>';
    if(s!=='waiting') h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="tcbWaiting(\''+task.id+'\')">Waiting</button>';
    h+='<button class="sv-btn sv-btn-primary sv-btn-sm" onclick="tcbDone(\''+task.id+'\')">Done ✓</button>';
    h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openTaskDetailDesk(\''+task.id+'\')">⋯</button>';
  } else {
    h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="tcbReopen(\''+task.id+'\')">Reopen</button>';
    h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openTaskDetailDesk(\''+task.id+'\')">⋯</button>';
  }
  h+='</div>';
  h+='</div>';
  return h;
}
/* ── Board actions ── */
function tcbAdd(){
  var el=document.getElementById('tcb-input');
  var text=(el?el.value:'').trim();
  if(!text)return;
  D.tasks.push({id:uid(),text:text,status:'inbox',propId:'',priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:today(),type:'ops',projectId:'',waitingFor:''});
  el.value='';save();render();
  setTimeout(function(){var el2=document.getElementById('tcb-input');if(el2)el2.focus();},50);
}

function tcbMove(id,status){
  var task=D.tasks.find(function(t){return t.id===id;});
  if(!task)return;
  task.status=status;
  save();render();
}

function tcbDone(id){
  var task=D.tasks.find(function(t){return t.id===id;});
  if(!task)return;
  task.done=true;task.status='done';task.completedAt=today();
  save();render();toast('Done ✓');
}

function tcbReopen(id){
  var task=D.tasks.find(function(t){return t.id===id;});
  if(!task)return;
  task.done=false;task.status='inbox';task.completedAt='';
  save();render();
}

function tcbWaiting(id){
  var task=D.tasks.find(function(t){return t.id===id;});
  if(!task)return;
  var who=prompt('Waiting for whom?',task.waitingFor||'');
  if(who===null)return;
  task.status='waiting';task.waitingFor=who.trim();
  save();render();
}

/* Keep openTaskDetailDesk for the ⋯ button */
function openTaskDetailDesk(id){
  taskDetailId=(taskDetailId===id)?null:id;
  if(taskDetailId){
    openTaskDetail(id);
  }
}

function migrateTask(t){
  if(!t.priority) t.priority = t.urgent ? 'high' : 'low';
  if(t.pinned===undefined)  t.pinned   = false;
  if(t.note===undefined)    t.note     = '';
  if(t.dueDate===undefined) t.dueDate  = '';
  if(t.timeEst===undefined) t.timeEst  = '';
  if(t.photo===undefined)   t.photo    = null;
  if(t.inFocus===undefined) t.inFocus  = false;
  if(t.completedAt===undefined) t.completedAt = '';
  if(!t.type) t.type='ops';
  if(!t.projectId) t.projectId='';
  if(!t.createdAt) t.createdAt='';
  if(!t.waitingFor) t.waitingFor='';
  /* Status migration */
  if(!t.status){
    if(t.done) t.status='done';
    else if(t.dueDate===today()) t.status='today';
    else t.status='inbox';
  }
  return t;
}

function dueBadgeHtml(dueDate){
  if(!dueDate) return '';
  const t=today();
  if(dueDate<t)  return '<span class="due-badge due-overdue">Overdue '+fmtDate(dueDate)+'</span>';
  if(dueDate===t)return '<span class="due-badge due-today">Due today</span>';
  return '<span class="due-badge due-ok">'+fmtDate(dueDate)+'</span>';
}


function toggleDoneSection(){ window._showDone = !window._showDone; render(); }

function taskSwipeWrap(t){
  return'<div id="sw-'+t.id+'">'+taskBubble(t,false)+'</div>';
}

function taskBubble(t,compact){
  migrateTask(t);
  const prioCls = t.done?'prio-none':('prio-'+(t.priority||'low'));
  const pinCls  = t.pinned?' is-pinned':'';
  const doneCls = t.done?' is-done':'';
  const prioC   = PRIO_CFG[t.priority||'low'];
  const isGrowth = t.type==='growth';
  const contextBadge = isGrowth
    ? '<span class="prop-badge" style="background:var(--purple-bg);color:var(--purple-text);font-size:10px;padding:2px 8px">'+(projName(t.projectId)||'Growth')+'</span>'
    : (t.propId ? '<span class="prop-badge pc-'+propColorIdx(t.propId)+'" style="font-size:10px;padding:2px 8px">'+esc(propName(t.propId))+'</span>' : '');
  const dueBadge  = dueBadgeHtml(t.dueDate);
  const timeBadge = t.timeEst ? '<span class="time-badge">⏱ '+esc(t.timeEst)+'</span>' : '';
  const photoEl   = (!compact&&t.photo) ? '<div><img class="task-photo-thumb" src="'+t.photo+'" alt="task photo"></div>' : '';
  const noteEl    = t.note ? '<div class="task-bubble-note">'+esc(t.note)+'</div>' : '';
  const focusStar = '<button class="task-pin-btn'+(t.inFocus?' pinned':'')+'" onclick="event.stopPropagation();toggleFocus(\''+t.id+'\')" title="Add to daily focus">⭐</button>';
  const pinIcon   = compact?'':'<button class="task-pin-btn'+(t.pinned?' pinned':'')+'" onclick="event.stopPropagation();togglePin(\''+t.id+'\')" title="Pin task">📌</button>';

  return'<div class="task-bubble '+prioCls+pinCls+doneCls+'" id="tb-'+t.id+'" onclick="openTaskDetail(\''+t.id+'\')">'
    +'<div class="task-bubble-top">'
    +'<div class="task-bubble-check" onclick="event.stopPropagation();startComplete(\''+t.id+'\')">'
    +'<svg class="chk-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    +'<circle class="chk-circle" cx="12" cy="12" r="9"/>'
    +'<path class="chk-mark" d="M7.5 12.5l3 3 6-6.5"/>'
    +'</svg>'
    +'</div>'
    +'<div class="task-bubble-body">'
    +'<div class="task-bubble-text">'+esc(t.text)+'</div>'
    +'<div class="task-bubble-meta">'
    +(t.done?'<span class="prio-badge pb-low" style="background:var(--accent-bg);color:var(--accent-text)">Done</span>':'<span class="prio-badge '+(prioC?prioC.badgeCls:'')+'">'+((prioC?prioC.label:'')||'')+'</span>')
    +contextBadge+dueBadge+timeBadge
    +'</div>'
    +noteEl+photoEl
    +'</div>'
    +'<div class="task-bubble-actions">'+focusStar+pinIcon+'</div>'
    +'</div></div>';
}

/* ── Completion animation ── */
function startComplete(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t) return;
  if(t.done){ t.done=false; t.completedAt=''; save(); render(); return; }
  const el=document.getElementById('tb-'+id);
  if(!el){ toggleTaskDone(id); return; }

  // Haptic tap on mobile
  if(navigator.vibrate) navigator.vibrate(12);

  // Animate the checkbox: pop + fill + draw checkmark
  const chkEl=el.querySelector('.task-bubble-check');
  const svgEl=el.querySelector('.chk-svg');
  const markEl=el.querySelector('.chk-mark');
  if(chkEl) chkEl.classList.add('filling');
  if(svgEl){ svgEl.classList.remove('popping'); void svgEl.offsetWidth; svgEl.classList.add('popping'); }
  if(markEl){ markEl.style.transition='stroke-dashoffset 0.2s ease 0.05s'; markEl.style.strokeDashoffset='0'; }

  // Burst particles from checkbox centre
  const chkRect=(chkEl||el).getBoundingClientRect();
  spawnBurst(chkRect.left+chkRect.width/2, chkRect.top+chkRect.height/2);

  // Card sweeps right after brief pause
  setTimeout(()=>el.classList.add('completing'), 140);
  setTimeout(()=>toggleTaskDone(id), 600);
}

function spawnBurst(cx,cy){
  const colors=['var(--accent)','var(--amber)','var(--text)','#5dcaa5','#efa040','#888888','#1a7a5e'];
  const count=14;
  for(let i=0;i<count;i++){
    const angle=(360/count)*i+(Math.random()*18-9);
    const rad=angle*Math.PI/180;
    const dist=42+Math.random()*38;
    const tx=Math.cos(rad)*dist;
    const ty=Math.sin(rad)*dist;
    const size=3+Math.random()*5;
    const isSquare=i%3===2;
    const dur=0.42+Math.random()*0.28;
    const delay=Math.random()*0.07;
    const p=document.createElement('div');
    p.style.cssText='position:fixed;left:'+cx+'px;top:'+cy+'px;width:'+size+'px;height:'+size+'px'
      +';border-radius:'+(isSquare?'3px':'50%')+';background:'+colors[i%colors.length]
      +';pointer-events:none;z-index:999'
      +';--tx:'+tx.toFixed(1)+'px;--ty:'+ty.toFixed(1)+'px'
      +';animation:particleBurst '+dur.toFixed(2)+'s cubic-bezier(0.25,0.46,0.45,0.94) '+delay.toFixed(2)+'s forwards';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),(dur+delay)*1000+120);
  }
}

function toggleTaskDone(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  t.done=!t.done;
  t.completedAt=t.done?today():'';
  if(t.done&&t.inFocus) t.inFocus=false;
  save();render();
}

/* ── Task detail modal ── */
function openTaskDetail(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  migrateTask(t);
  window._dtid=id; // store for onclick handlers
  const prioC=PRIO_CFG[t.priority||'low'];
  const propBadge=t.propId?'<span class="prop-badge pc-'+propColorIdx(t.propId)+'" style="font-size:11px;padding:3px 9px">'+esc(propName(t.propId))+'</span>':'';
  const photoSection=t.photo
    ?'<div style="margin-bottom:12px"><img src="'+t.photo+'" style="width:100%;border-radius:12px;max-height:200px;object-fit:cover"><br><button class="btn btn-red-sm btn-sm" style="margin-top:6px" onclick="removeTaskPhoto(window._dtid)">Remove photo</button></div>'
    :'<button class="btn btn-ghost btn-sm" style="margin-bottom:12px" onclick="_photoTaskId=window._dtid;document.getElementById(\'task-photo-file\').click()">+ Add photo</button>';
  const doneBtn=t.done
    ?'<button class="btn btn-ghost btn-sm" onclick="toggleTaskDone(window._dtid);closeModal()">Reopen</button>'
    :'<button class="btn btn-accent-sm btn-sm" onclick="startComplete(window._dtid);closeModal()">Mark done ✓</button>';
  showModal('<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div class="modal-title" style="margin-bottom:0">'+esc(t.text)+'</div>'
    +'<button class="btn btn-ghost btn-sm" onclick="openEditTaskModal(window._dtid)">Edit</button></div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'
    +'<span class="prio-badge '+(prioC?prioC.badgeCls:'')+'">'+(prioC?prioC.label:'')+'</span>'
    +propBadge
    +(t.dueDate?dueBadgeHtml(t.dueDate):'')
    +(t.timeEst?'<span class="time-badge">⏱ '+esc(t.timeEst)+'</span>':'')
    +(t.pinned?'<span class="prio-badge" style="background:var(--amber-bg);color:var(--amber-text)">📌 Pinned</span>':'')
    +(t.inFocus?'<span class="prio-badge" style="background:var(--purple-bg);color:var(--purple-text)">⭐ Focus</span>':'')
    +'</div>'
    +(t.note?'<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:14px;border-left:3px solid var(--border2)">'+esc(t.note)+'</div>':'')
    +photoSection
    +'<div class="divider"></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    +doneBtn
    +'<button class="btn btn-sm" style="background:var(--surface2);color:var(--text2);border:1.5px solid var(--border)" onclick="togglePin(window._dtid);openTaskDetail(window._dtid)">'+(t.pinned?'Unpin':'📌 Pin')+'</button>'
    +'<button class="btn btn-sm" style="background:var(--surface2);color:var(--text2);border:1.5px solid var(--border)" onclick="toggleFocus(window._dtid);openTaskDetail(window._dtid)">'+(t.inFocus?'Remove focus':'⭐ Focus')+'</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-danger" style="flex:1" onclick="deleteTask(window._dtid);closeModal()">Delete</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button></div>');
}

function openNewTaskModal(prefillPropId, prefillType, prefillProjectId){
  prefillType=prefillType||'ops';
  prefillProjectId=prefillProjectId||'';
  window._ntType=prefillType;
  const po='<option value="">No property</option>'+D.props.map(p=>'<option value="'+p.id+'"'+(prefillPropId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const projOpts='<option value="">Unassigned</option>'+D.projects.map(p=>'<option value="'+p.id+'"'+(prefillProjectId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">New task</div>'
    +'<div class="field"><label>Task</label><input type="text" id="nt-text" placeholder="What needs doing?"></div>'
    +'<div class="field"><label>Type</label><div class="chips" style="margin-top:6px">'
    +'<button type="button" class="chip'+(prefillType==='ops'?' on':'')+'" onclick="setNTType(\'ops\')">Ops</button>'
    +'<button type="button" class="chip'+(prefillType==='growth'?' on':'')+'" onclick="setNTType(\'growth\')">Growth</button>'
    +'</div></div>'
    +'<div class="field" id="nt-proj-field" style="display:'+(prefillType==='growth'?'block':'none')+'">'
    +'<label>Project</label><select id="nt-proj">'+projOpts+'</select></div>'
    +'<div class="field"><label>Priority</label>'
    +'<select id="nt-prio"><option value="high">🔴 High</option><option value="medium" selected>🟡 Medium</option><option value="low">🟣 Low</option></select></div>'
    +'<div class="field"><label>Property</label><select id="nt-prop">'+po+'</select></div>'
    +'<div class="field"><label>Due date</label><input type="date" id="nt-due"></div>'
    +'<div class="field"><label>Time estimate</label><input type="text" id="nt-time" placeholder="e.g. 30 min, 2 hours"></div>'
    +'<div class="field"><label>Notes</label><textarea id="nt-note" placeholder="Extra details..." style="height:68px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveNewTask()">Save task</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
  setTimeout(()=>document.getElementById('nt-text')?.focus(),100);
}
function setNTType(type){
  window._ntType=type;
  document.querySelectorAll('#modal-root .chips .chip').forEach(c=>{
    if(c.textContent==='Ops'||c.textContent==='Growth')c.classList.toggle('on',c.textContent===(type==='ops'?'Ops':'Growth'));
  });
  const pf=document.getElementById('nt-proj-field');if(pf)pf.style.display=type==='growth'?'block':'none';
}

function saveNewTask(){
  const text=(document.getElementById('nt-text')||{}).value||'';
  if(!text.trim()){alert('Please enter a task.');return;}
  const propId=(document.getElementById('nt-prop')||{}).value||'';
  const dueDate=(document.getElementById('nt-due')||{}).value||'';
  const timeEst=(document.getElementById('nt-time')||{}).value||'';
  const note=(document.getElementById('nt-note')||{}).value||'';
  const priority=(document.getElementById('nt-prio')||{}).value||'medium';
  const type=window._ntType||'ops';
  const projectId=(type==='growth'&&document.getElementById('nt-proj'))?(document.getElementById('nt-proj').value||''):'';
  D.tasks.push({id:uid(),text:text.trim(),propId,priority,urgent:priority==='high',done:false,pinned:false,inFocus:false,note,dueDate,timeEst,photo:null,completedAt:'',createdAt:today(),type,projectId});
  save();closeModal();render();toast('Task added!');
}

/* ── Edit task modal ── */
function openEditTaskModal(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;migrateTask(t);
  window._etType=t.type||'ops';
  const po='<option value="">No property</option>'+D.props.map(p=>'<option value="'+p.id+'"'+(t.propId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const projOpts='<option value="">Unassigned</option>'+D.projects.map(p=>'<option value="'+p.id+'"'+(t.projectId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit task</div>'
    +'<div class="field"><label>Task</label><input type="text" id="et-text" value="'+esc(t.text)+'"></div>'
    +'<div class="field"><label>Type</label><div class="chips" style="margin-top:6px">'
    +'<button type="button" class="chip'+(window._etType==='ops'?' on':'')+'" onclick="setETType(\'ops\')">Ops</button>'
    +'<button type="button" class="chip'+(window._etType==='growth'?' on':'')+'" onclick="setETType(\'growth\')">Growth</button>'
    +'</div></div>'
    +'<div class="field" id="et-proj-field" style="display:'+(window._etType==='growth'?'block':'none')+'">'
    +'<label>Project</label><select id="et-proj">'+projOpts+'</select></div>'
    +'<div class="field"><label>Priority</label>'
    +'<select id="et-prio" style="margin-top:4px">'
    +'<option value="high"'+(t.priority==='high'?' selected':'')+'>🔴 High</option>'
    +'<option value="medium"'+(t.priority==='medium'?' selected':'')+'>🟡 Medium</option>'
    +'<option value="low"'+(t.priority==='low'?' selected':'')+'>🟣 Low</option>'
    +'</select></div>'
    +'<div class="field"><label>Property</label><select id="et-prop">'+po+'</select></div>'
    +'<div class="field"><label>Due date</label><input type="date" id="et-due" value="'+(t.dueDate||'')+'"></div>'
    +'<div class="field"><label>Time estimate</label><input type="text" id="et-time" value="'+esc(t.timeEst||'')+'" placeholder="e.g. 30 min"></div>'
    +'<div class="field"><label>Notes</label><textarea id="et-note" style="height:68px">'+esc(t.note||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveEditTask(window._dtid)">Save</button><button class="btn btn-ghost" style="flex:1" onclick="openTaskDetail(window._dtid)">Cancel</button></div>');
}
function setETType(type){
  window._etType=type;
  document.querySelectorAll('#modal-root .chips .chip').forEach(c=>{
    if(c.textContent==='Ops'||c.textContent==='Growth')c.classList.toggle('on',c.textContent===(type==='ops'?'Ops':'Growth'));
  });
  const pf=document.getElementById('et-proj-field');if(pf)pf.style.display=type==='growth'?'block':'none';
}

function saveEditTask(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  const text=(document.getElementById('et-text')||{}).value||'';
  if(!text.trim()){alert('Please enter a task.');return;}
  t.text=text.trim();
  t.propId=(document.getElementById('et-prop')||{}).value||'';
  t.dueDate=(document.getElementById('et-due')||{}).value||'';
  t.timeEst=(document.getElementById('et-time')||{}).value||'';
  t.note=(document.getElementById('et-note')||{}).value||'';
  t.priority=(document.getElementById('et-prio')||{}).value||'medium';
  t.urgent=t.priority==='high';
  t.type=window._etType||t.type||'ops';
  t.projectId=(t.type==='growth'&&document.getElementById('et-proj'))?(document.getElementById('et-proj').value||''):'';
  save();closeModal();render();toast('Task updated!');
}

function togglePin(id){ const t=D.tasks.find(x=>x.id===id);if(!t)return;t.pinned=!t.pinned;save();render(); }
function toggleFocus(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  if(!t.inFocus && D.tasks.filter(x=>x.inFocus&&!x.done).length>=3){ toast('Focus list is full — max 3 tasks');return; }
  t.inFocus=!t.inFocus;save();render();
}

/* ── Task photo ── */
let _photoTaskId=null;
function handleTaskPhoto(e){
  const file=e.target.files[0];if(!file||!_photoTaskId)return;
  compressImage(file,data=>{
    const t=D.tasks.find(x=>x.id===_photoTaskId);
    if(t){t.photo=data;save();openTaskDetail(t.id);toast('Photo added!');}
    _photoTaskId=null;
  });
  e.target.value='';
}
function removeTaskPhoto(id){ const t=D.tasks.find(x=>x.id===id);if(!t)return;t.photo=null;save();openTaskDetail(id); }



