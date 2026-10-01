/* ── HOME ── */

function renderHome(){
  const t=today();
  const hr=new Date().getHours();
  const gr=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const dayLabel=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(typeof migrateTask==='function')D.tasks.forEach(migrateTask);
  const activeBooking=b=>b.status!=='cancelled';
  const todayIns=D.bookings.filter(b=>b.checkIn===t&&activeBooking(b));
  const todayOuts=D.bookings.filter(b=>b.checkOut===t&&activeBooking(b));
  const todayCleans=D.sessions.filter(s=>s.date===t&&s.status!=='cancelled');
  const openIssues=D.issues.filter(i=>i.status==='open');
  const urgentIssues=openIssues.filter(i=>i.urgent||i.priority==='high');
  const overdueTasks=D.tasks.filter(tk=>!tk.done&&tk.dueDate&&tk.dueDate<t).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const dueTodayTasks=D.tasks.filter(tk=>!tk.done&&tk.dueDate===t);
  const focusOpen=D.tasks.filter(tk=>tk.inFocus&&!tk.done);
  const focusDoneToday=D.tasks.filter(tk=>tk.inFocus&&tk.done&&tk.completedAt===t);
  const focusAll=[...focusDoneToday,...focusOpen].slice(0,5);
  const focusTotal=Math.max(focusAll.length,focusOpen.length+focusDoneToday.length);
  const focusDone=focusDoneToday.length;
  const focusPct=focusTotal?Math.round((focusDone/focusTotal)*100):0;
  const weekStart=addDays(startOfWeek(t),homeWeekOffset*7);
  const weekDays=[];for(let i=0;i<7;i++)weekDays.push(addDays(weekStart,i));
  const upcoming=D.bookings.filter(b=>b.checkIn>=t&&b.checkIn<=addDays(t,14)&&activeBooking(b)).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,4);
  const q=id=>String(id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const svg={
    in:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    clean:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 21h18"/><path d="M7 21V9l5-6 5 6v12"/><path d="M10 21v-6h4v6"/></svg>',
    issue:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };
  function platformShort(b){return b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':(b.agencyName||'Direct');}
  function initials(name){return avInit(name||'?')||'?';}
  function thumb(p){
    if(p&&p.photos&&p.photos.length)return '<img class="tc-thumb" src="'+p.photos[0]+'" alt="">';
    return '<div class="tc-thumb">✦</div>';
  }
  function stat(cls,icon,n,label,sub,click){
    return '<div class="tc-stat '+cls+'" onclick="'+click+'"><div class="tc-stat-ico">'+icon+'</div><div class="tc-stat-n">'+n+'</div><div class="tc-stat-l">'+label+'</div><div class="tc-stat-sub">'+sub+'</div></div>';
  }
  function opRow(time,chipCls,chip,meta,sub,avatar){
    return '<div class="tc-op"><div class="tc-time">'+(time||'—')+'</div><div><span class="tc-chip '+chipCls+'">'+chip+'</span></div><div class="tc-op-meta">'+meta+(sub?'<small>'+sub+'</small>':'')+'</div>'+(avatar?'<div class="tc-avatar">'+avatar+'</div>':'')+'</div>';
  }
  function propertyCards(){
    const rows=[];
    D.props.forEach(p=>{
      const ins=todayIns.filter(b=>b.propId===p.id);
      const outs=todayOuts.filter(b=>b.propId===p.id);
      const cleans=todayCleans.filter(s=>s.propId===p.id);
      const issues=openIssues.filter(i=>i.propId===p.id&&(i.urgent||i.priority==='high'||i.status==='open'));
      if(!ins.length&&!outs.length&&!cleans.length&&!issues.length)return;
      let body='';
      outs.forEach(b=>{body+=opRow(b.checkOutTime||'10:00','tc-chip-out','Check-out',b.guestName?'Guest: '+esc(b.guestName):'Guest check-out',b.guestCount?b.guestCount+' guests':'',platformShort(b).slice(0,1));});
      cleans.forEach(s=>{const cleaners=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean);body+=opRow(s.time||'—','tc-chip-clean','Cleaning',cleaners.length?cleaners.map(c=>esc(c.name)).join(', '):'No cleaner assigned',s.status==='done'?'Done':'Scheduled',cleaners[0]?initials(cleaners[0].name):'!');});
      ins.forEach(b=>{body+=opRow(b.checkInTime||'16:00','tc-chip-in','Check-in',platformShort(b),b.guestName?'Guest: '+esc(b.guestName):'Guest name missing',b.platform==='airbnb'?'A':b.platform==='booking'?'B':'•');});
      issues.slice(0,2).forEach(i=>{body+=opRow('', 'tc-chip-issue','Issue', esc(i.title), 'Open issue', '!');});
      rows.push('<div class="tc-prop-card"><div class="tc-prop-head" onclick="go(\'properties\',\''+q(p.id)+'\')">'+thumb(p)+'<div class="tc-prop-name">'+esc(p.name)+'</div><div class="tc-chev">›</div></div><div class="tc-flow">'+body+'</div></div>');
    });
    if(!rows.length)return '<div class="tc-allclear" style="padding:16px;border-radius:12px;font-size:13px;font-weight:600;text-align:center;border:1px solid rgba(48,209,88,0.22);background:rgba(48,209,88,0.06);color:var(--success,#30D158)">All properties are quiet today — no operations scheduled.</div>';
    return rows.join('');
  }
  function attentionItems(){
    const items=[];
    overdueTasks.slice(0,3).forEach(tk=>{const days=Math.max(1,Math.round((Date.parse(t)-Date.parse(tk.dueDate))/86400000));items.push(['red',svg.clock,'Overdue task',esc(tk.text),days+'d overdue',tk.propId?propName(tk.propId):'',"tab='tasks';render()"]);});
    dueTodayTasks.slice(0,3).forEach(tk=>items.push(['amber',svg.cal,'Due today',esc(tk.text),'Due today',tk.propId?propName(tk.propId):'',"tab='tasks';render()"]));
    urgentIssues.slice(0,3).forEach(i=>items.push(['red',svg.issue,'Urgent issue',esc(i.title),'Urgent',propName(i.propId),"tab='manage';manageTab='issues';render()"]));
    todayIns.filter(b=>!b.guestName||!b.guestCount).slice(0,2).forEach(b=>items.push(['amber',svg.issue,'Missing guest info',propName(b.propId),'View','Check-in today',"tab='calendar';calView='timeline';render()"]));
    todayOuts.filter(b=>!todayCleans.some(s=>s.propId===b.propId)).slice(0,2).forEach(b=>items.push(['amber',svg.issue,'Warning','Check-out today with no cleaning scheduled','View',propName(b.propId),"tab='calendar';calView='timeline';render()"]));
    todayCleans.filter(s=>!(s.cleanerIds||[]).length).slice(0,2).forEach(s=>items.push(['amber',svg.issue,'Warning','Cleaning today with no cleaner assigned','View',propName(s.propId),"tab='manage';manageTab='schedule';render()"]));
    if(!items.length)return '<div class="tc-allclear" style="padding:16px;border-radius:12px;font-size:13px;font-weight:600;text-align:center;border:1px solid rgba(48,209,88,0.22);background:rgba(48,209,88,0.06);color:var(--success,#30D158)">All clear — no urgent issues or overdue tasks.</div>';
    return items.slice(0,8).map(it=>'<div class="tc-attn tc-attn-'+it[0]+'" onclick="'+it[6]+'"><div class="tc-attn-ico">'+it[1]+'</div><div class="tc-attn-body"><div class="tc-attn-k">'+it[2]+'</div><div class="tc-attn-t">'+it[3]+'</div>'+(it[5]?'<div class="tc-attn-m">'+esc(it[5])+'</div>':'')+'</div><div class="tc-attn-b">'+it[4]+'</div></div>').join('');
  }
  function focusPanel(){
    let list='';
    if(!focusAll.length){
      list='<div class="tc-empty" onclick="openMorningRitual()" style="cursor:pointer">Tap to set your focus for today. Choose 3–5 important tasks.</div>';
    }else{
      focusAll.forEach(tk=>{const done=tk.done?' done':'';list+='<div class="tc-focus-row" onclick="tab=\'tasks\';render()"><div class="tc-check'+(tk.done?' done':'')+'">'+(tk.done?'✓':'')+'</div><div class="tc-focus-text'+done+'">'+esc(tk.text)+'</div></div>';});
    }
    return '<div class="tc-panel"><div class="tc-focus-top"><div class="tc-focus-title">My Focus</div><div class="tc-focus-count">'+focusDone+' of '+focusTotal+' done</div></div><div class="tc-progress"><div class="tc-progress-fill" style="width:'+focusPct+'%"></div></div>'+list+'</div>';
  }
  function weekPanel(){
    var dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var ins,outs,cleans,count,dt,p,cls,card;
    var totalIns=0,totalOuts=0,totalCleans=0;
    var cards='<div class="tc-week-cal">';
    for(var wi=0;wi<weekDays.length;wi++){
      var wd=weekDays[wi];
      ins=D.bookings.filter(function(b){return b.checkIn===wd&&activeBooking(b);});
      outs=D.bookings.filter(function(b){return b.checkOut===wd&&activeBooking(b);});
      cleans=D.sessions.filter(function(s){return s.date===wd&&s.status!=='cancelled';});
      totalIns+=ins.length; totalOuts+=outs.length; totalCleans+=cleans.length;
      count=ins.length+outs.length+cleans.length;
      p=wd.split('-'); dt=new Date(+p[0],+p[1]-1,+p[2]);
      cls='tc-day-card'+(wd===t?' is-today':'')+(count?' is-busy':'');
      card='<div class="'+cls+'" onclick="openTcWeekDay(this.dataset.d)" data-d="'+wd+'">';
      card+='<div class="tc-day-hd"><span class="tc-day-name">'+dn[dt.getDay()]+'</span>';
      card+='<span class="tc-day-badge">'+count+'</span></div>';
      card+='<div class="tc-day-num">'+String(dt.getDate()).padStart(2,'0')+'</div>';
      card+='<div class="tc-day-sep"></div>';
      card+='<div class="tc-day-rows">';
      card+='<div class="tc-day-row tc-row-in'+(ins.length?' on':'')+'"><span class="tc-row-dot"></span><span class="tc-row-lbl">Check-in</span><span class="tc-row-n">'+ins.length+'</span></div>';
      card+='<div class="tc-day-row tc-row-out'+(outs.length?' on':'')+'"><span class="tc-row-dot"></span><span class="tc-row-lbl">Check-out</span><span class="tc-row-n">'+outs.length+'</span></div>';
      card+='<div class="tc-day-row tc-row-clean'+(cleans.length?' on':'')+'"><span class="tc-row-dot"></span><span class="tc-row-lbl">Cleaning</span><span class="tc-row-n">'+cleans.length+'</span></div>';
      card+='</div></div>';
      cards+=card;
    }
    cards+='</div>';
    var totalAll=totalIns+totalOuts+totalCleans;
    var openWeekFn='tcOpenCalendarWeek(this.dataset.d)';
    var summary='<div class="tc-week-summary">'
      +'<div class="tc-week-sum" onclick="'+openWeekFn+'" data-d="'+t+'"><div class="tc-week-sum-n">'+totalIns+'</div><div class="tc-week-sum-l">Check-ins</div></div>'
      +'<div class="tc-week-sum" onclick="'+openWeekFn+'" data-d="'+t+'"><div class="tc-week-sum-n">'+totalOuts+'</div><div class="tc-week-sum-l">Check-outs</div></div>'
      +'<div class="tc-week-sum" onclick="'+openWeekFn+'" data-d="'+t+'"><div class="tc-week-sum-n">'+totalCleans+'</div><div class="tc-week-sum-l">Cleanings</div></div>'
      +'</div>';
    var pill='<div class="tc-week-total-pill">'+totalAll+' items</div>';
    var openBtn='<button class="tc-view" onclick="'+openWeekFn+'" data-d="'+t+'">Open week</button>';
    // Week label
    var wStart=weekDays[0],wEnd=weekDays[6];
    var wLabel=homeWeekOffset===0?'This week':homeWeekOffset===1?'Next week':homeWeekOffset===-1?'Last week':'Week of '+fmtDate(wStart);
    var wRange=fmtDate(wStart)+' – '+fmtDate(wEnd);
    var prevBtn='<button class="tc-nav-btn" onclick="homeWeekOffset--;render()" title="Previous week"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>';
    var nextBtn='<button class="tc-nav-btn" onclick="homeWeekOffset++;render()" title="Next week"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>';
    var todayBtn=homeWeekOffset!==0?'<button class="tc-today-btn" onclick="homeWeekOffset=0;render()">Today</button>':'';
    return '<div class="tc-panel tc-week-panel">'
      +'<div class="tc-panel-hd">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">'
      +prevBtn
      +'<span class="tc-panel-title" style="flex:1">'+wLabel+'</span>'
      +nextBtn
      +todayBtn
      +'</div>'
      +'<div class="tc-panel-sub">'+wRange+' · Tap a day to inspect</div>'
      +'</div>'
      +'<div class="tc-week-head-actions">'+pill+openBtn+'</div>'
      +'</div>'
      +cards+summary
      +'</div>';
  }
  function upcomingPanel(){
    let rows='';
    upcoming.forEach(b=>{const days=Math.round((Date.parse(b.checkIn)-Date.parse(t))/86400000);const label=days===0?'Today':days===1?'Tomorrow':fmtDate(b.checkIn);const platform=b.platform==='airbnb'?'A':b.platform==='booking'?'B.':'Ag';rows+='<div class="tc-up-item" onclick="tab=\'calendar\';calView=\'timeline\';render()"><div><div class="tc-up-date">'+label+'</div><div class="tc-up-time">'+(b.checkInTime||'16:00')+'</div></div><div><div class="tc-up-prop">'+esc(propName(b.propId))+'</div><div class="tc-up-guest">'+(b.guestName?esc(b.guestName):'Guest')+'</div></div><div class="tc-platform">'+platform+'</div></div>';});
    if(!rows)rows='<div class="tc-empty">No check-ins in the next 14 days.</div>';
    return '<div class="tc-panel"><div class="tc-panel-hd"><div><div class="tc-panel-title">Upcoming Check-ins</div></div><button class="tc-view" onclick="tab=\'calendar\';calView=\'timeline\';render()">View all</button></div>'+rows+'</div>';
  }
  let h='<div class="tc-page">';
  h+='<div class="sv-page-header" style="margin-bottom:16px">';
  h+='<div class="sv-page-heading"><div class="sv-title">Today</div><div class="sv-subtitle">'+gr+' · '+dayLabel+'</div></div>';
  h+='<div class="sv-actions"><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="showHomeQuickAdd()">+ Quick Add</button></div>';
  h+='</div>';
  h+='<div class="tc-board"><div class="tc-primary">';
  h+='<div class="tc-stats">'
    +stat('tc-stat-in',svg.cal,todayIns.length,'Check-ins Today',todayIns.length?todayIns.map(b=>propName(b.propId)).slice(0,2).join(', '):'No arrivals today',"tab='calendar';calView='timeline';render()")
    +stat('tc-stat-out',svg.out,todayOuts.length,'Check-outs Today',todayOuts.length?todayOuts.map(b=>propName(b.propId)).slice(0,2).join(', '):'No departures today',"tab='calendar';calView='timeline';render()")
    +stat('tc-stat-clean',svg.clean,todayCleans.length,'Cleanings Today',todayCleans.length?[...new Set(todayCleans.map(s=>propName(s.propId)))].slice(0,2).join(', '):'No cleanings today',"tab='manage';manageTab='schedule';render()")
    +stat('tc-stat-issue',svg.issue,openIssues.length,'Open Issues',openIssues.length?urgentIssues.length+' urgent / high priority':'All clear',"tab='manage';manageTab='issues';render()")
    +'</div>';
  h+='<div class="tc-columns"><div class="tc-panel"><div class="tc-panel-hd"><div><div class="tc-panel-title">Today’s Operations</div><div class="tc-panel-sub">Grouped by property · all times local</div></div><button class="tc-view" onclick="tab=\'calendar\';calView=\'timeline\';render()">Timeline</button></div>'+propertyCards()+'</div><div class="tc-panel"><div class="tc-panel-hd"><div><div class="tc-panel-title">Needs Attention</div><div class="tc-panel-sub">Exceptions, risks and overdue loops</div></div><div class="tc-pill">'+openIssues.length+' open issues</div></div>'+attentionItems()+'</div></div>';
  h+=weekPanel()+'</div><div class="tc-side">'+focusPanel()+upcomingPanel()+'</div></div>';
  h+='<button class="home-fab" onclick="openVoiceCommandModal()" aria-label="Voice command" title="Voice command"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></svg></button>';
  h+='</div>';
  return h;
}



function tcOpenCalendarWeek(el){
  var date=typeof el==='string'?el:(el&&el.dataset?el.dataset.d:today());
  calView='week';
  calWeekStart=startOfWeek(date||today());
  tab='calendar';
  closeModal();
  render();
}
function openTcWeekDay(el){
  var date=typeof el==='string'?el:(el&&el.dataset?el.dataset.d:'');
  const activeBooking=b=>b.status!=='cancelled';
  const ins=D.bookings.filter(b=>b.checkIn===date&&activeBooking(b));
  const outs=D.bookings.filter(b=>b.checkOut===date&&activeBooking(b));
  const cleans=D.sessions.filter(s=>s.date===date&&s.status!=='cancelled');
  const events=(D.events||[]).filter(e=>e.date===date);
  function section(title,items,empty){
    if(!items.length)return '<div class="tc-day-modal-section"><div class="tc-day-modal-h">'+title+'</div><div class="tc-empty" style="padding:14px">'+empty+'</div></div>';
    return '<div class="tc-day-modal-section"><div class="tc-day-modal-h">'+title+'</div>'+items.join('')+'</div>';
  }
  function bookingItem(b,type){
    const isIn=type==='in';
    const time=isIn?(b.checkInTime||'16:00'):(b.checkOutTime||'10:00');
    const badge=isIn?'Check-in':'Check-out';
    const cls=isIn?'tc-b-in':'tc-b-out';
    const source=b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':(b.agencyName||'Direct');
    const sub=(b.guestName?esc(b.guestName):'Guest name missing')+' · '+source+(b.guestCount?' · '+b.guestCount+' guests':'');
    return '<div class="tc-day-modal-item" onclick="closeModal();openBookingDetail(\''+b.id+'\')"><div class="tc-day-modal-time">'+time+'</div><div><div class="tc-day-modal-title">'+esc(propName(b.propId))+'</div><div class="tc-day-modal-sub">'+sub+'</div></div><div class="tc-day-modal-badge '+cls+'">'+badge+'</div></div>';
  }
  function cleaningItem(s){
    const cleaners=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean).map(c=>c.name).join(', ');
    return '<div class="tc-day-modal-item" onclick="closeModal();openSess(\''+s.id+'\')"><div class="tc-day-modal-time">'+(s.time||'—')+'</div><div><div class="tc-day-modal-title">'+esc(propName(s.propId))+'</div><div class="tc-day-modal-sub">'+(cleaners?esc(cleaners):'No cleaner assigned')+(s.status==='done'?' · Done':'')+'</div></div><div class="tc-day-modal-badge tc-b-clean">Cleaning</div></div>';
  }
  function eventItem(e){
    return '<div class="tc-day-modal-item"><div class="tc-day-modal-time">'+(e.time||'—')+'</div><div><div class="tc-day-modal-title">'+esc(e.title||'Event')+'</div><div class="tc-day-modal-sub">'+(e.propId?esc(propName(e.propId)):'General')+(e.note?' · '+esc(e.note):'')+'</div></div><div class="tc-day-modal-badge tc-b-event">Event</div></div>';
  }
  const total=ins.length+outs.length+cleans.length+events.length;
  let h='<div class="modal-handle"></div><div class="modal-title">'+fmtFull(date)+'</div><div class="tc-day-modal-date">'+total+' scheduled item'+(total===1?'':'s')+'</div>';
  h+=section('Check-ins',ins.map(b=>bookingItem(b,'in')),'No check-ins on this day.');
  h+=section('Check-outs',outs.map(b=>bookingItem(b,'out')),'No check-outs on this day.');
  h+=section('Cleanings',cleans.map(cleaningItem),'No cleanings scheduled.');
  if(events.length)h+=section('Events',events.map(eventItem),'');
  h+='<div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-primary" style="flex:1" onclick="tcOpenCalendarWeek(\''+date+'\')">Open in Calendar</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button></div>';
  showModal(h);
}

