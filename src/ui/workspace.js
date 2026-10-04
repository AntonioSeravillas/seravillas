/* Presentation and navigation only. Booking, cleaning and sync records retain their existing models. */
function workspaceIcon(name){
  if(name==='plus')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  if(name==='arrow')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  const paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',cleaning:'<path d="m8 15 9-12M5 13l6 4-3 5H2l3-9ZM17 3l3 2"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',home:'<path d="m3 10 9-7 9 7v10H3ZM9 20v-7h6v7"/>',tasks:'<path d="m9 11 3 3 9-10M21 12v8H3V4h11"/>',property:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 8h.01M15 8h.01M9 12h.01M15 12h.01"/>',report:'<path d="M4 3v18h17M9 16v-5M14 16V7M19 16v-8"/>',team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a4 4 0 0 1 4 4v2"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',issues:'<path d="m12 3 10 18H2L12 3ZM12 9v4M12 17h.01"/>',stock:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v10M7 5l10 4"/>',contacts:'<rect x="5" y="3" width="16" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M10 17h6"/><circle cx="13" cy="10" r="2"/>',notes:'<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M9 12h6M9 16h6"/>',close:'<path d="M8 4H4v16h4M11 12h10m-6-5-5 5 5 5"/>',filter:'<path d="M4 7h16M7 12h10M10 17h4"/>'};
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.calendar)+'</svg>';
}
function workspaceNavigate(destination,section){
  closeModal();
  if(destination==='manage')manageTab=section||'overview';
  go(destination);
}
/* Desktop navigation is a device preference, stored outside the shared app records. */
const WORKSPACE_NAV_GROUPS=[
  ['Workspace',[
    ['home','home','','home','Today'],
    ['calendar','calendar','','calendar','Bookings'],
    ['cleaning','cleaning','','cleaning','Cleaning'],
    ['tasks','tasks','','tasks','Tasks'],
    ['properties','properties','','property','Properties'],
    ['reports','booking-report','','report','Reports']
  ]],
  ['Management',[
    ['team','manage','cleaners','team','Team'],
    ['manage','manage','overview','settings','Overview'],
    ['issues','manage','issues','issues','Issues'],
    ['stock','manage','supplies','stock','Stock'],
    ['contacts','manage','contacts','contacts','Contacts'],
    ['notes','manage','notes','notes','Notes']
  ]],
  ['App',[[ 'settings','settings','','settings','Settings' ]]]
];
let workspaceSidebarCollapsed=false;
try{workspaceSidebarCollapsed=SV_STORAGE.getItem('sv_sidebar_collapsed')==='1';}catch(e){}

function applyWorkspaceSidebar(){
  document.documentElement.classList.toggle('workspace-sidebar-collapsed',workspaceSidebarCollapsed);
  const sidebar=document.getElementById('workspace-sidebar');
  if(sidebar){if(workspaceSidebarCollapsed)sidebar.setAttribute('inert','');else sidebar.removeAttribute?.('inert');}
  const opener=document.getElementById('workspace-sidebar-open');
  if(opener)opener.setAttribute('aria-expanded',String(!workspaceSidebarCollapsed));
}
function setWorkspaceSidebar(collapsed){
  workspaceSidebarCollapsed=!!collapsed;
  applyWorkspaceSidebar();
  try{SV_STORAGE.setItem('sv_sidebar_collapsed',workspaceSidebarCollapsed?'1':'0');}catch(e){}
  const focus=document.getElementById(workspaceSidebarCollapsed?'workspace-sidebar-open':'workspace-sidebar-close');
  if(focus&&typeof focus.focus==='function')focus.focus();
}
function workspaceCurrentCategory(){
  if(tab==='booking-report')return 'reports';
  if(['booking-availability','calendar-events','calendar-agenda'].includes(tab))return 'calendar';
  if(tab==='manage')return ({cleaners:'team',overview:'manage',issues:'issues',supplies:'stock',schedule:'cleaning',contacts:'contacts',notes:'notes'})[manageTab]||'manage';
  return tab==='review'?'manage':tab;
}
function renderWorkspaceSidebarLink(item){
  return '<button class="workspace-sidebar-link" id="workspace-side-'+item[0]+'" onclick="workspaceNavigate(\''+item[1]+'\',\''+item[2]+'\')">'+workspaceIcon(item[3])+'<span>'+item[4]+'</span></button>';
}
function initializeWorkspaceSidebar(){
  const sidebar=document.getElementById('workspace-sidebar');if(!sidebar)return;
  let appLinks='';
  let h='<div class="workspace-sidebar-head"><span class="workspace-brand">SeraVillas</span><button class="workspace-icon" id="workspace-sidebar-close" onclick="setWorkspaceSidebar(true)" aria-label="Hide navigation" title="Hide navigation" aria-controls="workspace-sidebar">'+workspaceIcon('close')+'</button></div><nav class="workspace-sidebar-nav" aria-label="All categories">';
  WORKSPACE_NAV_GROUPS.forEach(function(group){
    if(group[0]==='App'){appLinks+=group[1].map(renderWorkspaceSidebarLink).join('');return;}
    h+='<div class="workspace-sidebar-group"><div class="workspace-sidebar-heading">'+group[0]+'</div>';
    h+=group[1].map(renderWorkspaceSidebarLink).join('');
    h+='</div>';
  });
  sidebar.innerHTML=h+'</nav><nav class="workspace-sidebar-footer" aria-label="App controls">'+appLinks+'</nav>';
  applyWorkspaceSidebar();
}
function updateWorkspaceNav(){
  const selected=workspaceCurrentCategory();
  const current=selected==='calendar'?'calendar':selected==='cleaning'?'cleaning':'more';
  ['calendar','cleaning','more'].forEach(function(key){
    const el=document.getElementById('workspace-'+key);if(!el)return;
    el.classList.toggle('active',key===current);
    if(key===current)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  WORKSPACE_NAV_GROUPS.forEach(function(group){group[1].forEach(function(item){
    const el=document.getElementById('workspace-side-'+item[0]);if(!el)return;
    el.classList.toggle('active',item[0]===selected);
    if(item[0]===selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
    if(item[0]===selected){const label=document.getElementById('workspace-page-label');if(label)label.textContent=item[4];}
  });});
}
initializeWorkspaceSidebar();
/* The timeline uses different date/label widths on phones. Rebuild only when that breakpoint changes. */
let workspaceWideTimeline=window.innerWidth>=768;
if(typeof window.addEventListener==='function')window.addEventListener('resize',function(){
  const wide=window.innerWidth>=768;
  if(wide===workspaceWideTimeline)return;
  workspaceWideTimeline=wide;
  if(tab==='calendar'&&calView==='timeline')render();
});
const WORKSPACE_CATEGORY_DESCRIPTIONS={
  home:'Arrivals, departures & priorities',calendar:'Timeline, month & booking tools',cleaning:'Schedule, coverage & assignments',tasks:'Tasks & property projects',properties:'Villa details, photos & property work',reports:'Revenue, channels & villa performance',team:'Cleaners & individual logins',manage:'Operations summary & weekly review',issues:'Repairs, priorities & progress',stock:'Supplies & stock levels',contacts:'Service providers & directory',notes:'Your operations scratchpad',settings:'Preferences, backups & cloud access'
};
function openWorkspaceMenu(){
  let h='<div class="modal-title">Your workspace</div><div class="sv-subtitle">Choose a category.</div>';
  WORKSPACE_NAV_GROUPS.forEach(function(group){
    h+='<section class="workspace-menu-group"><h2>'+group[0]+'</h2><div class="workspace-menu">';
    group[1].forEach(function(item){h+='<button onclick="workspaceNavigate(\''+item[1]+'\',\''+item[2]+'\')">'+workspaceIcon(item[3])+'<span>'+item[4]+'<small>'+WORKSPACE_CATEGORY_DESCRIPTIONS[item[0]]+'</small></span></button>';});
    h+='</div></section>';
  });
  showModal(h);
}
function openWorkspaceCreate(){
  const items=[['calendar','New booking','Add a stay to the villa calendar','openAddBookingModal()'],['cleaning','Plan cleaning','Choose the villa, window and team','openAddSessModal()'],['tasks','New task','Create property or team work','openNewTaskModal()'],['calendar','Calendar event','Add maintenance, meetings or deliveries','openAddCalEvent(today())'],['calendar','Import bookings','Review your Excel workbook','openExcelImport()']];
  let h='<div class="modal-title">Create</div><div class="create-menu">';
  items.forEach(item=>h+='<button onclick="closeModal();'+item[3]+'"><span class="create-icon">'+workspaceIcon(item[0])+'</span><span><strong>'+item[1]+'</strong><small>'+item[2]+'</small></span>'+workspaceIcon('arrow')+'</button>');
  showModal(h+'</div>');
}
function calendarFilterLabel(){
  if(calFilter==='cleanings')return 'Cleanings only';
  if(calFilter.startsWith('prop-'))return propName(calFilter.slice(5));
  return 'All villas';
}
function switchCalendarView(view){
  if(view!=='timeline'&&view!=='month')return;
  if(view==='month'&&calView!=='month'){
    const parts=(calTimelineDate||today()).split('-');calY=Number(parts[0]);calM=Number(parts[1])-1;
  }else if(view==='timeline'&&calView==='month'){
    const now=new Date();calTimelineDate=calY===now.getFullYear()&&calM===now.getMonth()?'':calY+'-'+pad(calM+1)+'-01';
  }
  calView=view;render();
}
function setCalendarFilter(value){
  if(value!=='all'&&value!=='cleanings'&&!D.props.some(p=>'prop-'+p.id===value))return;
  calFilter=value;closeModal();render();
}
function openCalendarFilters(){
  let h='<div class="modal-title">Calendar filters</div><div class="sv-subtitle">Choose what appears in Timeline and Month.</div><div class="filter-options">';
  [['all','All villas'],['cleanings','Cleanings only']].concat(D.props.map(p=>['prop-'+p.id,p.name])).forEach(function(item){
    const colour=item[0].startsWith('prop-')?propBarColor(item[0].slice(5)).border:'var(--text3)';
    h+='<button class="filter-option" aria-pressed="'+(calFilter===item[0])+'" onclick="setCalendarFilter(\''+item[0]+'\')"><span class="villa-dot" style="background:'+colour+'"></span>'+esc(item[1])+'</button>';
  });
  showModal(h+'</div>');
}
function calendarPropertyMatches(record){return !calFilter.startsWith('prop-')||record.propId===calFilter.slice(5);}
function calendarDayItems(date){
  return {
    bookings:calFilter==='cleanings'?[]:D.bookings.filter(b=>b.status!=='cancelled'&&b.checkIn<=date&&b.checkOut>=date&&calendarPropertyMatches(b)),
    cleanings:D.sessions.filter(s=>s.date===date&&s.status!=='cancelled'&&calendarPropertyMatches(s)),
    tasks:calFilter==='cleanings'?[]:D.tasks.filter(t=>!t.done&&t.dueDate===date&&calendarPropertyMatches(t)),
    events:calFilter==='cleanings'?[]:(D.events||[]).filter(e=>(e.date===date||(e.date<=date&&e.endDate&&e.endDate>=date))&&calendarPropertyMatches(e))
  };
}
/* Checkout is exclusive for stay bars. Departures remain visible in the day's details. */
function calendarWeekStays(start){
  if(calFilter==='cleanings')return [];
  const end=addDays(start,7),lanes=[];
  return D.bookings.filter(b=>b.status!=='cancelled'&&b.checkIn<end&&b.checkOut>start&&b.checkOut>b.checkIn&&calendarPropertyMatches(b))
    .sort((a,b)=>propColorIdx(a.propId)-propColorIdx(b.propId)||a.checkIn.localeCompare(b.checkIn)||String(a.id).localeCompare(String(b.id)))
    .map(function(booking){
      const left=Math.max(0,daysBetween(start,booking.checkIn)),right=Math.min(7,daysBetween(start,booking.checkOut));
      let lane=lanes.findIndex(cells=>!cells.some(segment=>left<segment.right&&right>segment.left));
      if(lane<0){lane=lanes.length;lanes.push([]);}lanes[lane].push({left,right});
      return {booking,left,right,lane};
    });
}
function changeBookingMonth(delta){calM+=delta;if(calM<0){calM=11;calY--;}if(calM>11){calM=0;calY++;}render();}
function calendarThisMonth(){const now=new Date();calY=now.getFullYear();calM=now.getMonth();render();}
function renderWorkspaceMonth(){
  const monthName=new Date(calY,calM,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const first=calY+'-'+pad(calM+1)+'-01',start=startOfWeek(first),td=today();
  const last=calY+'-'+pad(calM+1)+'-'+pad(new Date(calY,calM+1,0).getDate());
  const weekCount=Math.ceil((daysBetween(start,last)+1)/7);
  let h='<div class="wm-calendar"><div class="wm-header"><div class="wm-monthnav"><button class="cal-nav" aria-label="Previous month" onclick="changeBookingMonth(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 18-6-6 6-6"/></svg></button><h2>'+monthName+'</h2><button class="cal-nav" aria-label="Next month" onclick="changeBookingMonth(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg></button></div><button class="sv-btn sv-btn-secondary" onclick="calendarThisMonth()">Today</button></div><div class="wm-dow">';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>h+='<span>'+d+'</span>');h+='</div>';
  for(let week=0;week<weekCount;week++){
    const weekStart=addDays(start,week*7),stays=calendarWeekStays(weekStart);
    const rows=stays.reduce((max,item)=>Math.max(max,item.lane+1),0);
    h+='<div class="wm-week" style="--week-rows:'+rows+'"><div class="wm-days">';
    for(let i=0;i<7;i++){
      const date=addDays(weekStart,i),items=calendarDayItems(date),inMonth=date.slice(0,7)===first.slice(0,7);
      const changes=items.bookings.filter(b=>b.checkIn===date||b.checkOut===date).length;
      const turnover=D.props.filter(p=>items.bookings.some(b=>b.propId===p.id&&b.checkOut===date)&&items.bookings.some(b=>b.propId===p.id&&b.checkIn===date)).length;
      const label=fmtFull(date)+': '+items.bookings.length+' bookings, '+items.cleanings.length+' cleanings, '+items.tasks.length+' tasks, '+items.events.length+' events';
      h+='<button class="wm-day'+(!inMonth?' other-month':'')+(date===td?' is-today':'')+'" aria-label="'+esc(label)+'" onclick="openDayModal(\''+date+'\')"><span class="wm-number">'+Number(date.slice(8))+'</span><span class="wm-signals">';
      if(items.cleanings.length)h+='<span class="wm-signal clean" title="Cleanings">'+workspaceIcon('cleaning')+items.cleanings.length+'</span>';
      if(changes)h+='<span class="wm-signal'+(turnover?' turn':'')+'" title="Arrivals and departures">↔ '+changes+'</span>';
      if(items.tasks.length+items.events.length)h+='<span class="wm-signal" title="Tasks and events">· '+(items.tasks.length+items.events.length)+'</span>';
      h+='</span></button>';
    }
    h+='</div><div class="wm-stays">';
    stays.forEach(function(item){
      const b=item.booking,c=propBarColor(b.propId),name=propName(b.propId),continuing=b.checkIn<weekStart,continues=b.checkOut>addDays(weekStart,7);
      const short=name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,'');
      const label=name+' · '+(b.guestName||'Guest')+' · '+fmtDate(b.checkIn)+' – '+fmtDate(b.checkOut);
      h+='<button class="wm-stay'+(continuing?' is-continuing':'')+(continues?' continues':'')+'" style="grid-column:'+(item.left+1)+' / span '+(item.right-item.left)+';grid-row:'+(item.lane+1)+';--stay-bg:'+c.bg+';--stay-border:'+c.border+';--stay-text:'+c.text+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" onclick="openBookingDetail(\''+b.id+'\')"><i aria-hidden="true">'+(continuing?'':'›')+'</i><span>'+esc(short)+(item.right-item.left>=3?' · '+esc(b.guestName||'Guest'):'')+'</span></button>';
    });
    h+='</div></div>';
  }
  h+='</div><div class="wm-legend">';
  D.props.filter(calendarPropertyMatchesForLegend).forEach(function(p){h+='<span><i class="villa-dot" style="background:'+propBarColor(p.id).border+'"></i>'+esc(p.name)+'</span>';});
  h+='<span>↔ Arrivals / departures</span><span>'+workspaceIcon('cleaning')+' Cleaning</span></div><div class="sv-subtitle">Select a stay for booking details, or a day for its full schedule. Stay bars end at checkout.</div>';
  return h;
}
function calendarPropertyMatchesForLegend(p){return !calFilter.startsWith('prop-')||p.id===calFilter.slice(5);}
