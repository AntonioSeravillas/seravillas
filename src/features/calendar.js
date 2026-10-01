/* ── CALENDAR ── */
function renderCalendar(){
  if(calView==='events'||calView==='week')calView='timeline';
  var tlAct=calView==='timeline'?' active':'';
  var mAct=calView==='month'?' active':'';
  var waIco='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.527 5.849L0 24l6.304-1.654C8.006 23.431 9.961 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.584-.493-5.084-1.355l-.364-.214-3.742.981.999-3.647-.239-.374A9.93 9.93 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg>';

  var h='<div class="sv-page">';

  /* Page header */
  h+='<div class="sv-page-header">';
  h+='<div class="sv-page-heading"><div class="sv-title">Calendar</div><div class="sv-subtitle">Timeline view of bookings, cleanings and operations.</div></div>';
  h+='<div class="sv-actions">';
  h+='<button class="sv-btn sv-btn-secondary" onclick="openAddSessModal()">+ Cleaning</button>';
  h+='<button class="sv-btn sv-btn-primary" onclick="openAddBookingModal()">+ Booking</button>';
  h+='<button onclick="showScheduleModal()" title="WhatsApp schedule" style="width:36px;height:36px;border-radius:50%;border:none;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(37,211,102,0.3)">'+waIco+'</button>';
  h+='</div></div>';

  /* View tabs */
  h+='<div class="sv-tabs" style="margin-bottom:12px">';
  h+='<button class="sv-tab'+tlAct+'" onclick="calView=\'timeline\';if(!calWeekStart)calWeekStart=startOfWeek();render()">Timeline</button>';
  h+='<button class="sv-tab'+mAct+'" onclick="calView=\'month\';render()">Month</button>';
  h+='</div>';

  /* Property/type filters — shown for timeline */
  if(calView==='timeline'){
    h+='<div class="sv-chip-row" style="margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px">';
    h+='<button class="sv-chip'+(calFilter==='all'?' active':'')+'" onclick="calFilter=\'all\';render()">All</button>';
    h+='<button class="sv-chip'+(calFilter==='cleanings'?' active':'')+'" onclick="calFilter=\'cleanings\';render()">🧹 Cleanings</button>';
    D.props.forEach(function(p){
      var fid='prop-'+p.id;
      h+='<button class="sv-chip'+(calFilter===fid?' active':'')+'" onclick="calFilter=\''+fid+'\';render()">'+esc(p.name)+'</button>';
    });
    h+='</div>';
  }

  /* Body */
  var body=calView==='month'?renderCalendarMonth():renderCalendarTimeline();
  h+=body;
  h+='</div>';

  /* Floating action buttons (visible on mobile, hidden on desktop) */
  var waFab='<button class="cal-wa-fab" onclick="showScheduleModal()" aria-label="WhatsApp"><svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.527 5.849L0 24l6.304-1.654C8.006 23.431 9.961 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.584-.493-5.084-1.355l-.364-.214-3.742.981.999-3.647-.239-.374A9.93 9.93 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg></button>';
  var fab='<button class="cal-fab" onclick="calView===\'month\'?openAddCalEvent(today()):showCalQuickAdd()" aria-label="Add"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>';
  return h+waFab+fab;
}
/* ── EVENTS VIEW ── */
const EVENT_CATS={
  worker:      {label:'Worker',      icon:'👷', bg:'#edf5fe', color:'#1a5a9a', dark:{bg:'#0c1f3a',color:'#85b7eb'}},
  maintenance: {label:'Maintenance', icon:'🔧', bg:'#fef5e7', color:'#b06800', dark:{bg:'#1e1200',color:'#fac775'}},
  meeting:     {label:'Meeting',     icon:'💼', bg:'#f0eeff', color:'#5b21b6', dark:{bg:'#1a1530',color:'#b8adee'}},
  delivery:    {label:'Delivery',    icon:'📦', bg:'#edf7f3', color:'#0f6e56', dark:{bg:'#0a2820',color:'#9fe1cb'}},
  personal:    {label:'Personal',    icon:'🌿', bg:'#fef0f6', color:'#993556', dark:{bg:'#1e0a12',color:'#f4c0d1'}},
  other:       {label:'Other',       icon:'📌', bg:'var(--surface2)', color:'var(--text2)', dark:{bg:'var(--surface2)',color:'var(--text2)'}},
};

function evCatCfg(cat){return EVENT_CATS[cat]||EVENT_CATS.other;}

function renderCalendarEvents(){
  D.events=D.events||[];
  const td=today();

  // Header: view toggle + add button
  let h='<div class="sv-page-header" style="margin-bottom:14px">'
    +'<div class="sv-tabs" style="margin:0">'
    +'<button class="sv-tab'+(evView==='list'?' active':'')+'" onclick="evView=\'list\';render()">List</button>'
    +'<button class="sv-tab'+(evView==='month'?' active':'')+'" onclick="evView=\'month\';render()">Month</button>'
    +'</div>'
    +'<div class="sv-actions"><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddEvent()">+ Add event</button></div>'
    +'</div>';

  if(evView==='month') return h+renderEventsMonthGrid();

  // ── List view ──
  const upcoming=D.events.filter(e=>e.date>=td).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));
  const past=D.events.filter(e=>e.date<td).sort((a,b)=>b.date.localeCompare(a.date));

  if(upcoming.length===0&&past.length===0){
    h+='<div class="ev-empty">No events yet.<br><span style="font-size:12px;color:var(--text3)">Add meetings, worker visits, deliveries…</span></div>';
  }
  if(upcoming.length){
    const groups={};
    upcoming.forEach(e=>{if(!groups[e.date])groups[e.date]=[];groups[e.date].push(e);});
    Object.keys(groups).sort().forEach(date=>{
      const isT=date===td;
      const label=isT?'Today — '+fmtFull(date):fmtFull(date);
      h+='<div class="ev-date-hdr'+(isT?' is-today-hdr':'')+'">'+label+'</div>';
      groups[date].forEach(e=>{h+=eventCardHtml(e,false);});
    });
  }
  if(past.length){
    h+='<div class="task-group-label tgl-done" style="cursor:pointer;margin-top:20px" onclick="_showPastEvents=!_showPastEvents;render()">'
      +'Past ('+past.length+')<span style="margin-left:auto">'+(_showPastEvents?'▲':'▼')+'</span></div>';
    if(_showPastEvents){
      const groups={};
      past.forEach(e=>{if(!groups[e.date])groups[e.date]=[];groups[e.date].push(e);});
      h+='<div class="ev-past">';
      Object.keys(groups).sort().reverse().forEach(date=>{
        h+='<div class="ev-date-hdr">'+fmtFull(date)+'</div>';
        groups[date].forEach(e=>{h+=eventCardHtml(e,true);});
      });
      h+='</div>';
    }
  }
  return h;
}

function renderEventsMonthGrid(){
  const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DW=['Mo','Tu','We','Th','Fr','Sa','Su'];
  const fd=new Date(evCalY,evCalM,1);
  const ld=new Date(evCalY,evCalM+1,0);
  const dow=fd.getDay(),sd=dow===0?6:dow-1;
  const dim=ld.getDate();
  const pl=new Date(evCalY,evCalM,0).getDate();
  const td=today();

  // Build cells
  let cells=[];
  for(let i=0;i<sd;i++)cells.push({d:pl-sd+1+i,cur:false});
  for(let d=1;d<=dim;d++)cells.push({d,cur:true});
  while(cells.length%7!==0)cells.push({d:cells.length-sd-dim+1,cur:false});

  // Navigation
  let h='<div class="cal-header">'
    +'<button class="cal-nav" onclick="evCalM--;if(evCalM<0){evCalM=11;evCalY--;}render()">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>'
    +'<div class="cal-month">'+MN[evCalM]+' '+evCalY+'</div>'
    +'<button class="cal-nav" onclick="evCalM++;if(evCalM>11){evCalM=0;evCalY++;}render()">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>'
    +'</div>';

  // Day-of-week headers
  h+='<div class="cal-grid">';
  h+=DW.map(d=>'<div class="cal-dow">'+d+'</div>').join('');

  cells.forEach(c=>{
    if(!c.cur){h+='<div class="cal-day other-month"><div class="cal-num">'+c.d+'</div></div>';return;}
    const ds=evCalY+'-'+pad(evCalM+1)+'-'+pad(c.d);
    const isT=ds===td;

    // Events on this day (including multi-day spans)
    const dayEvs=D.events.filter(e=>{
      const start=e.date;
      const end=e.endDate&&e.endDate>=e.date?e.endDate:e.date;
      return ds>=start&&ds<=end;
    }).sort((a,b)=>(a.time||'').localeCompare(b.time||''));

    const hasEvs=dayEvs.length>0;
    const visible=dayEvs.slice(0,3);
    const extra=dayEvs.length-3;

    let inner='<div class="cal-num">'+c.d+'</div>';
    if(hasEvs){
      inner+='<div style="width:100%;padding:0 1px">';
      visible.forEach(e=>{
        const cfg=evCatCfg(e.category);
        inner+='<div class="ev-pill" style="background:'+cfg.bg+';color:'+cfg.color+'">'
          +'<span class="ev-pill-icon">'+cfg.icon+'</span>'
          +'<span class="ev-pill-text">'+esc(e.title)+'</span>'
          +'</div>';
      });
      if(extra>0)inner+='<div style="font-size:8px;font-weight:700;color:var(--text3);padding:0 3px">+'+extra+' more</div>';
      inner+='</div>';
    }

    h+='<div class="cal-day cal-day-ev'+(isT?' today':'')+(hasEvs?' has-sess':'')+'"'
      +(hasEvs?' onclick="openDayEvents(\''+ds+'\')"':' onclick="openAddEvent(\''+ds+'\')"')
      +' title="'+(hasEvs?dayEvs.length+' event'+(dayEvs.length>1?'s':''):'Add event')+'">'
      +inner+'</div>';
  });
  h+='</div>';

  // Category legend
  h+='<div class="tl-legend" style="margin-top:14px;flex-wrap:wrap;gap:8px 14px">';
  Object.values(EVENT_CATS).forEach(cfg=>{
    h+='<div class="tl-legend-item"><div style="width:10px;height:10px;border-radius:3px;background:'+cfg.bg+';border:1.5px solid '+cfg.color+'"></div>'+cfg.label+'</div>';
  });
  h+='</div>';
  return h;
}

function openDayEvents(ds){
  const dayEvs=D.events.filter(e=>{
    const start=e.date;
    const end=e.endDate&&e.endDate>=e.date?e.endDate:e.date;
    return ds>=start&&ds<=end;
  }).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if(!dayEvs.length){openAddEvent(ds);return;}
  let h='<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<div class="modal-title" style="margin-bottom:0">'+fmtFull(ds)+'</div>'
    +'<button class="btn btn-primary btn-sm" onclick="closeModal();openAddEvent(\''+ds+'\')">+ Add</button>'
    +'</div>';
  dayEvs.forEach(e=>{h+=eventCardHtml(e,e.date<ds);});
  h+='<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">Close</button>';
  showModal(h);
}

function eventCardHtml(e,isPast){
  const cfg=evCatCfg(e.category);
  const prop=e.propId?D.props.find(p=>p.id===e.propId):null;
  const hasEnd=e.endDate&&e.endDate!==e.date;
  return'<div class="ev-card" onclick="openEventDetail(\''+e.id+'\')">'
    +'<div class="ev-card-ico" style="background:'+cfg.bg+'"><span style="font-size:17px">'+cfg.icon+'</span></div>'
    +'<div class="ev-card-body">'
    +'<div class="ev-card-title">'+esc(e.title)+'</div>'
    +'<div class="ev-card-meta">'
    +(e.time?'<span class="ev-meta-chip">'+esc(e.time)+'</span>':'')
    +(hasEnd?'<span class="ev-meta-chip">until '+fmtDate(e.endDate)+'</span>':'')
    +'<span class="ev-meta-chip" style="background:'+cfg.bg+';color:'+cfg.color+'">'+cfg.label+'</span>'
    +(prop?'<span class="ev-meta-chip">'+esc(prop.name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,''))+'</span>':'')
    +'</div>'
    +(e.note?'<div class="ev-card-note">'+esc(e.note)+'</div>':'')
    +'</div>'
    +'</div>';
}

function openAddEvent(prefillDate){
  const dateVal=prefillDate||'';
  const po='<option value="">No property</option>'+D.props.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const catOpts=Object.entries(EVENT_CATS).map(([k,v])=>'<option value="'+k+'">'+v.icon+' '+v.label+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Add event</div>'
    +'<div class="field"><label>Title</label><input type="text" id="ev-title" placeholder="e.g. Plumber visit, Agency call…"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div class="field"><label>Date</label><input type="date" id="ev-date" value="'+dateVal+'"></div>'
    +'<div class="field"><label>Time <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="time" id="ev-time"></div>'
    +'</div>'
    +'<div class="field"><label>End date <span style="font-weight:400;color:var(--text3)">(optional — for multi-day)</span></label><input type="date" id="ev-enddate"></div>'
    +'<div class="field"><label>Category</label><select id="ev-cat">'+catOpts+'</select></div>'
    +'<div class="field"><label>Property <span style="font-weight:400;color:var(--text3)">(optional)</span></label><select id="ev-prop">'+po+'</select></div>'
    +'<div class="field"><label>Notes <span style="font-weight:400;color:var(--text3)">(optional)</span></label><textarea id="ev-note" placeholder="Extra details…" style="height:68px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveNewEvent()">Save event</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
  setTimeout(()=>document.getElementById('ev-title')?.focus(),100);
}

function saveNewEvent(){
  const title=(document.getElementById('ev-title')||{}).value||'';
  const date=(document.getElementById('ev-date')||{}).value||'';
  if(!title.trim()){alert('Please enter a title.');return;}
  if(!date){alert('Please pick a date.');return;}
  const time=(document.getElementById('ev-time')||{}).value||'';
  const endDate=(document.getElementById('ev-enddate')||{}).value||'';
  const category=(document.getElementById('ev-cat')||{}).value||'other';
  const propId=(document.getElementById('ev-prop')||{}).value||'';
  const note=(document.getElementById('ev-note')||{}).value||'';
  D.events.push({id:uid(),title:title.trim(),date,time,endDate,category,propId,note,createdAt:today()});
  save();closeModal();calView='events';render();toast('Event added!');
}

function openEventDetail(id){
  const e=D.events.find(x=>x.id===id);if(!e)return;
  window._evid=id;
  const cfg=evCatCfg(e.category);
  const prop=e.propId?D.props.find(p=>p.id===e.propId):null;
  const hasEnd=e.endDate&&e.endDate!==e.date;
  showModal('<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="display:flex;align-items:center;gap:10px">'
    +'<div style="width:40px;height:40px;border-radius:12px;background:'+cfg.bg+';display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">'+cfg.icon+'</div>'
    +'<div class="modal-title" style="margin-bottom:0">'+esc(e.title)+'</div></div>'
    +'<button class="btn btn-ghost btn-sm" onclick="openEditEvent(window._evid)">Edit</button></div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">'
    +'<span class="badge b-open" style="background:'+cfg.bg+';color:'+cfg.color+'">'+cfg.label+'</span>'
    +'<span class="badge b-past">'+fmtFull(e.date)+(e.time?' · '+e.time:'')+'</span>'
    +(hasEnd?'<span class="badge b-past">until '+fmtFull(e.endDate)+'</span>':'')
    +(prop?'<span class="badge b-past">'+esc(prop.name)+'</span>':'')
    +'</div>'
    +(e.note?'<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:14px;border-left:3px solid var(--border2)">'+esc(e.note)+'</div>':'')
    +'<div class="divider"></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btn btn-danger" style="flex:1" onclick="deleteEvent(window._evid)">Delete</button>'
    +'<button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button>'
    +'</div>');
}

function openEditEvent(id){
  const e=D.events.find(x=>x.id===id);if(!e)return;
  window._evid=id;
  const po='<option value="">No property</option>'+D.props.map(p=>'<option value="'+p.id+'"'+(e.propId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const catOpts=Object.entries(EVENT_CATS).map(([k,v])=>'<option value="'+k+'"'+(e.category===k?' selected':'')+'>'+v.icon+' '+v.label+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit event</div>'
    +'<div class="field"><label>Title</label><input type="text" id="ev-title" value="'+esc(e.title)+'"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div class="field"><label>Date</label><input type="date" id="ev-date" value="'+esc(e.date)+'"></div>'
    +'<div class="field"><label>Time</label><input type="time" id="ev-time" value="'+esc(e.time||'')+'"></div>'
    +'</div>'
    +'<div class="field"><label>End date <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="date" id="ev-enddate" value="'+esc(e.endDate||'')+'"></div>'
    +'<div class="field"><label>Category</label><select id="ev-cat">'+catOpts+'</select></div>'
    +'<div class="field"><label>Property</label><select id="ev-prop">'+po+'</select></div>'
    +'<div class="field"><label>Notes</label><textarea id="ev-note" style="height:68px">'+esc(e.note||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveEditEvent(window._evid)">Save</button><button class="btn btn-ghost" style="flex:1" onclick="openEventDetail(window._evid)">Cancel</button></div>');
}

function saveEditEvent(id){
  const e=D.events.find(x=>x.id===id);if(!e)return;
  const title=(document.getElementById('ev-title')||{}).value||'';
  const date=(document.getElementById('ev-date')||{}).value||'';
  if(!title.trim()||!date){alert('Title and date required.');return;}
  e.title=title.trim();
  e.date=date;
  e.time=(document.getElementById('ev-time')||{}).value||'';
  e.endDate=(document.getElementById('ev-enddate')||{}).value||'';
  e.category=(document.getElementById('ev-cat')||{}).value||'other';
  e.propId=(document.getElementById('ev-prop')||{}).value||'';
  e.note=(document.getElementById('ev-note')||{}).value||'';
  save();closeModal();render();toast('Event updated!');
}

function deleteEvent(id){
  if(!confirm('Delete this event?'))return;
  D.events=D.events.filter(x=>x.id!==id);
  save();closeModal();render();toast('Event deleted');
}

let TL_DAY_W=46;
let TL_PROP_W=80;
const TL_BEFORE=30;  // days before today to render
const TL_AFTER=150;  // days after today to render

function daysBetween(a,b){
  const pa=a.split('-'),pb=b.split('-');
  const da=new Date(+pa[0],+pa[1]-1,+pa[2]),db=new Date(+pb[0],+pb[1]-1,+pb[2]);
  return Math.round((db-da)/(1000*60*60*24));
}

function renderCalendarTimeline(){
  TL_DAY_W=window.innerWidth>=768?60:46;
  TL_PROP_W=window.innerWidth>=768?180:80;
  const isTLDesktop=window.innerWidth>=768;
  const td=today();
  const yrEnd=td.slice(0,4)+'-12-31';
  const tlAfter=Math.max(TL_AFTER,daysBetween(td,yrEnd));
  const winStart=addDays(td,-TL_BEFORE);
  const winEnd=addDays(td,tlAfter);
  const totalDays=TL_BEFORE+tlAfter+1;

  const days=[];for(let i=0;i<totalDays;i++)days.push(addDays(winStart,i));

  const filterPropId=calFilter.startsWith('prop-')?calFilter.slice(5):null;
  const props=filterPropId?D.props.filter(p=>p.id===filterPropId):D.props;

  let h='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px">';
  h+='<div style="font-size:11px;color:var(--text3);font-weight:500">'+totalDays+' days · scroll to navigate</div>';
  h+='<button class="sv-btn sv-btn-ghost" style="font-size:11px;padding:5px 12px" onclick="tlScrollToday()">Today ↩</button>';
  h+='</div>';

  if(!props.length){
    h+='<div class="sv-empty"><div class="sv-empty-title">No properties yet</div></div>';
    return h;
  }

  h+='<div class="tl-outer'+(isTLDesktop?' tl-desk':'')+'" id="tl-outer"><div class="tl-inner">';

  // ── Header row ──
  h+='<div class="tl-hdr-row"><div class="tl-corner"></div>';
  days.forEach((d,i)=>{
    const parts=d.split('-');
    const dObj=new Date(+parts[0],+parts[1]-1,+parts[2]);
    const dow=dObj.getDay();
    const isT=d===td;
    const isWk=dow===0||dow===6;
    const isFirst=+parts[2]===1||i===0;
    const dayName=dObj.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2);
    const dayNum=parts[2].replace(/^0/,'');
    const monthName=isFirst?dObj.toLocaleDateString('en-GB',{month:'short'}):'';
    h+='<div class="tl-day-hdr'+(isT?' is-today':'')+'"'+(isT?' id="tl-today-hdr"':'')+' style="background:'+(isT?'rgba(224,106,58,0.09)':isWk?'var(--surface2)':'transparent')+'">';
    h+=(monthName?'<div style="font-size:8px;font-weight:800;color:var(--accent);letter-spacing:0.06em;line-height:1;margin-bottom:1px">'+monthName.toUpperCase()+'</div>':'<div style="font-size:8px;line-height:1;margin-bottom:1px">&nbsp;</div>');
    h+='<div class="tl-day-hdr-name">'+dayName+'</div>';
    h+='<div class="tl-day-hdr-num">'+dayNum+'</div>';
    h+='</div>';
  });
  h+='</div>';

  // ── Property rows ──
  props.forEach(prop=>{
    const clr=propBarColor(prop.id);
    const bks=D.bookings.filter(b=>
      b.propId===prop.id&&
      b.status!=='cancelled'&&
      b.checkIn<=winEnd&&b.checkOut>winStart
    ).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
    const cleans=D.sessions.filter(s=>
      s.propId===prop.id&&s.date>=winStart&&s.date<=winEnd&&s.status!=='cancelled'
    );
    const shortName=prop.name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,'');

    h+='<div class="tl-prop-row">';
    const photos=prop.photos||[];
    const firstPhoto=photos[0]||'';
    const initials=shortName.split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2)||'?';
    const propBkCount=D.bookings.filter(function(bx){return bx.propId===prop.id&&bx.status!=='cancelled';}).length;
    if(isTLDesktop){
      h+='<div class="tl-prop-label">';
      h+='<div class="tl-prop-label-dot" style="background:'+clr.border+'"></div>';
      h+='<div style="display:flex;align-items:center;gap:9px;padding:0 10px 0 16px;width:100%;min-width:0">';
      if(firstPhoto){
        h+='<img class="tl-prop-photo" src="'+esc(firstPhoto)+'" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">';
        h+='<div class="tl-prop-photo-fallback" style="display:none">'+initials+'</div>';
      } else {
        h+='<div class="tl-prop-photo-fallback">'+initials+'</div>';
      }
      h+='<div class="tl-prop-label-inner">';
      h+='<div class="tl-prop-label-text">'+esc(shortName)+'</div>';
      if(propBkCount>0)h+='<div class="tl-prop-label-count">'+propBkCount+' bk'+(propBkCount!==1?'s':'')+'</div>';
      h+='</div></div></div>';
    } else {
      h+='<div class="tl-prop-label">'
        +'<div class="tl-prop-label-dot" style="background:'+clr.border+'"></div>'
        +'<div class="tl-prop-label-text">'+esc(shortName)+'</div>'
        +'</div>';
    }
    h+='<div class="tl-row-body">';

    days.forEach(d=>{
      const parts=d.split('-');
      const dow=new Date(+parts[0],+parts[1]-1,+parts[2]).getDay();
      const isT=d===td;
      const isWk=dow===0||dow===6;
      const hasClean=cleans.some(s=>s.date===d);
      const isFirst=+parts[2]===1;
      h+='<div class="tl-day-cell'+(isT?' is-today':'')+(isWk?' is-weekend':'')+'"'
        +' style="'+(isFirst?'border-left:2px solid var(--border2);':'')+'">'
        +(hasClean?'<div class="tl-clean-stripe" style="background:'+clr.border+'"></div>':'')
        +'</div>';
    });

    bks.forEach(b=>{
      const isCancelled=b.status==='cancelled';
      const checkInOff=daysBetween(winStart,b.checkIn);
      const checkOutOff=daysBetween(winStart,b.checkOut);
      if(checkInOff>totalDays-1)return;
      if(checkOutOff<0)return;
      const clampedIn=Math.max(checkInOff,0);
      const clampedOut=Math.min(checkOutOff,totalDays-1);
      const startsInWin=checkInOff>=0;
      const endsInWin=checkOutOff<=totalDays-1;
      const leftPx=startsInWin?clampedIn*TL_DAY_W+Math.floor(TL_DAY_W/2):0;
      const rightPx=endsInWin?clampedOut*TL_DAY_W+Math.floor(TL_DAY_W/2):totalDays*TL_DAY_W;
      const widthPx=rightPx-leftPx-2;
      if(widthPx<4)return;
      let rCls;
      if(startsInWin&&endsInWin)rCls='tl-r-both';
      else if(startsInWin)rCls='tl-r-clip-end';
      else if(endsInWin)rCls='tl-r-clip-start';
      else rCls='tl-r-clip-both';

      const nights=daysBetween(b.checkIn,b.checkOut);
      const platform=b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking':(b.agencyName?b.agencyName.slice(0,10):'Direct');
      const guestFirst=b.guestName?b.guestName.split(' ')[0].slice(0,14):'';
      let line1='',line2='';
      if(widthPx>=TL_DAY_W*4){
        line1=platform+(nights?' · '+nights+'n':'');
        line2=guestFirst;
      } else if(widthPx>=TL_DAY_W*2){
        line1=platform.slice(0,8)+(nights?' '+nights+'n':'');
      } else if(widthPx>=TL_DAY_W){
        line1=platform.slice(0,5);
      } else if(widthPx>=TL_DAY_W/2){
        line1=platform.slice(0,3);
      }

      var bkSt=b.status||'confirmed';
      // Determine platform class (strict lookup, no substring)
      var plat=(b.platform||'').toLowerCase().trim();
      var platCls=plat==='airbnb'?'tl-bk-airbnb':plat==='booking'||plat==='booking.com'?'tl-bk-booking':plat==='agency'||plat==='direct'||(b.agencyName&&b.agencyName.length>0)?'tl-bk-agency':'tl-bk-confirmed';
      var bkStCls;
      if(isCancelled){bkStCls=platCls+' tl-bk-cancelled';}
      else if(bkSt==='blocked'||bkSt==='owner'){bkStCls='tl-bk-blocked';}
      else if(bkSt==='pending'){bkStCls=platCls+' tl-bk-pending';}
      else{bkStCls=platCls;}
      const bkCls='tl-bk '+rCls+' '+bkStCls+(calSelectedBk===b.id?' tl-bk-selected':'');
      const bkClick=isTLDesktop?'selectTLBooking(\''+b.id+'\')':'openBookingDetail(\''+b.id+'\')';
      h+='<div class="'+bkCls+'" data-bk="'+b.id+'" style="left:'+leftPx+'px;width:'+widthPx+'px" onclick="'+bkClick+'">';
      if(startsInWin) h+='<div class="tl-bk-dot"></div>';
      if(line1||line2){
        h+='<div class="tl-bk-content"><span class="tl-bk-text">'+esc(line1)+'</span>';
        if(line2) h+='<span class="tl-bk-sub">'+esc(line2)+'</span>';
        h+='</div>';
      }
      h+='</div>';
    });

    h+='</div></div>';
  });

  h+='</div></div>';

  // Legend — platform colors
  h+='<div class="tl-legend">';
  h+='<div class="tl-legend-item"><div class="tl-bk-agency" style="width:20px;height:10px;border-radius:3px;border:1.5px solid"></div>Agency</div>';
  h+='<div class="tl-legend-item"><div class="tl-bk-airbnb" style="width:20px;height:10px;border-radius:3px;border:1.5px solid"></div>Airbnb</div>';
  h+='<div class="tl-legend-item"><div class="tl-bk-booking" style="width:20px;height:10px;border-radius:3px;border:1.5px solid"></div>Booking.com</div>';
  h+='<div class="tl-legend-item"><div style="width:20px;height:5px;border-radius:2px;background:var(--accent);opacity:0.85"></div>Cleaning</div>';
  h+='<div class="tl-legend-item"><div style="width:20px;height:10px;border-radius:3px;border:1.5px dashed rgba(120,120,128,0.5);opacity:0.6;background:rgba(120,120,128,0.1)"></div>Cancelled</div>';
  h+='</div>';

  if(isTLDesktop){
    return '<div class="tl-desk-grid"><div>'+h+'</div><div class="tl-detail-panel" id="tl-detail-panel">'+renderTLDetailPanel()+'</div></div>';
  }
  return h;
}
function tlScrollToday(){
  const outer=document.getElementById('tl-outer');
  const hdr=document.getElementById('tl-today-hdr');
  if(!outer||!hdr)return;
  outer.scrollLeft=hdr.offsetLeft-TL_PROP_W-20;
}

function selectTLBooking(id){
  if(window.innerWidth<768){openBookingDetail(id);return;}
  calSelectedBk=id;
  var panel=document.getElementById('tl-detail-panel');
  if(panel)panel.innerHTML=renderTLDetailPanel();
  document.querySelectorAll('.tl-bk').forEach(function(el){
    if(el.dataset.bk===id)el.classList.add('tl-bk-selected');
    else el.classList.remove('tl-bk-selected');
  });
}

function renderTLDetailPanel(){
  if(!calSelectedBk){
    return '<div class="tl-dp-empty">'
      +'<div class="tl-dp-empty-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>'
      +'<div class="tl-dp-empty-title">No booking selected</div>'
      +'<div class="tl-dp-empty-sub">Click a booking bar to view details</div>'
      +'</div>';
  }
  var b=D.bookings.find(function(x){return x.id===calSelectedBk;});
  if(!b){calSelectedBk=null;return renderTLDetailPanel();}
  var prop=D.props.find(function(p){return p.id===b.propId;});
  var pname=prop?prop.name:'Unknown property';
  var photos=prop?(prop.photos||[]):[];
  var firstPhoto=photos[0]||'';
  var shortPname=pname.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,'');
  var initials=shortPname.split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2)||'?';
  var nights=daysBetween(b.checkIn,b.checkOut);
  var platform=b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':(b.agencyName?b.agencyName:'Direct');
  var st=b.status||'confirmed';
  var stColors={confirmed:'rgba(52,199,89,0.15)',pending:'rgba(10,132,255,0.15)',cancelled:'rgba(255,69,58,0.15)',blocked:'rgba(120,120,128,0.15)'};
  var stLabels={confirmed:'Confirmed',pending:'Pending',cancelled:'Cancelled',blocked:'Blocked',owner:'Owner stay'};
  var stColor=stColors[st]||stColors.confirmed;
  var stLabel=stLabels[st]||'Confirmed';
  var linkedSess=b.linkedCleaningId?D.sessions.find(function(s){return s.id===b.linkedCleaningId;}):null;
  if(!linkedSess){
    linkedSess=D.sessions.find(function(s){
      return s.propId===b.propId&&s.date>=b.checkOut&&daysBetween(b.checkOut,s.date)<2;
    });
  }

  var h='';
  if(firstPhoto){
    h+='<img class="tl-dp-photo" src="'+esc(firstPhoto)+'" alt="" loading="lazy" onerror="this.style.display=\'none\';">';
  } else {
    h+='<div class="tl-dp-photo-fallback">'+initials+'</div>';
  }
  h+='<div class="tl-dp-platform">'+esc(platform)+'</div>';
  h+='<div class="tl-dp-guest">'+(b.guestName?esc(b.guestName):'Guest')+'</div>';
  h+='<span class="tl-dp-badge" style="background:'+stColor+'">'+stLabel+'</span>';
  h+='<div class="tl-dp-rows">';
  h+='<div class="tl-dp-row"><span class="tl-dp-label">Property</span><span class="tl-dp-val">'+esc(pname)+'</span></div>';
  h+='<div class="tl-dp-row"><span class="tl-dp-label">Check-in</span><span class="tl-dp-val">'+esc(fmtFull(b.checkIn))+(b.checkInTime?' · '+esc(b.checkInTime):'')+'</span></div>';
  h+='<div class="tl-dp-row"><span class="tl-dp-label">Check-out</span><span class="tl-dp-val">'+esc(fmtFull(b.checkOut))+(b.checkOutTime?' · '+esc(b.checkOutTime):'')+'</span></div>';
  h+='<div class="tl-dp-row"><span class="tl-dp-label">Nights</span><span class="tl-dp-val">'+nights+'</span></div>';
  if(b.guestCount)h+='<div class="tl-dp-row"><span class="tl-dp-label">Guests</span><span class="tl-dp-val">'+esc(String(b.guestCount))+'</span></div>';
  if(b._excel&&b._excel.priceUnknown)h+='<div class="tl-dp-row"><span class="tl-dp-label">Total</span><span class="tl-dp-val">Price unknown</span></div>';
  else if(b.totalPrice||b._excel)h+='<div class="tl-dp-row"><span class="tl-dp-label">Total</span><span class="tl-dp-val">€'+esc(String(b.totalPrice))+'</span></div>';
  if(st==='cancelled')h+='<div class="tl-dp-row"><span class="tl-dp-label">Money retained</span><span class="tl-dp-val">'+fmtRevenueAmount(bookingRevenueCents(b)/100)+'</span></div>';
  if(linkedSess){
    var cnames='';
    if(linkedSess.cleanerIds&&linkedSess.cleanerIds.length){
      cnames=D.cleaners.filter(function(c){return(linkedSess.cleanerIds||[]).indexOf(c.id)>=0;}).map(function(c){return c.name;}).join(', ');
    }
    h+='<div class="tl-dp-row"><span class="tl-dp-label">Cleaning</span><span class="tl-dp-val">'+esc(fmtFull(linkedSess.date))+(linkedSess.time?' · '+esc(linkedSess.time):'')+(cnames?' · '+esc(cnames):'')+'</span></div>';
  }
  h+='</div>';
  if(b.notes)h+='<div class="tl-dp-notes">'+esc(b.notes)+'</div>';
  h+='<div class="tl-dp-actions">';
  h+='<button class="sv-btn sv-btn-secondary" style="flex:1" onclick="openEditBooking(\''+b.id+'\')">Edit</button>';
  h+='<button class="sv-btn sv-btn-ghost" style="flex:1" onclick="calSelectedBk=null;var p=document.getElementById(\'tl-detail-panel\');if(p)p.innerHTML=renderTLDetailPanel();document.querySelectorAll(\'.tl-bk-selected\').forEach(function(e){e.classList.remove(\'tl-bk-selected\');});">Close</button>';
  h+='</div>';
  h+='<div style="margin-top:8px">';
  if(st!=='cancelled'){
    h+='<button class="sv-btn sv-btn-danger" style="width:100%" onclick="cancelBookingTL(\''+b.id+'\')">Cancel booking</button>';
  } else {
    h+='<button class="sv-btn sv-btn-secondary" style="width:100%" onclick="restoreBookingTL(\''+b.id+'\')">Restore booking</button>';
  }
  h+='</div>';
  return h;
}

function renderCalendarMonth(){
  D.events=D.events||[];
  const td=today();
  const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  /* Build month grid */
  const firstOfMonth=new Date(calY,calM,1);
  const lastOfMonth=new Date(calY,calM+1,0);
  /* Start from Monday before first day */
  var startDow=firstOfMonth.getDay(); // 0=Sun
  var offset=(startDow===0)?6:startDow-1; // days before first
  var gridStart=new Date(calY,calM,1-offset);
  /* Always show 6 rows = 42 cells */
  var cells=[];
  for(var i=0;i<42;i++){
    var d=new Date(gridStart);
    d.setDate(gridStart.getDate()+i);
    var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    cells.push({date:ds,inMonth:d.getMonth()===calM,num:d.getDate()});
  }

  /* Collect events for a date */
  function eventsFor(date){
    var evs=[];
    /* Cleanings */
    D.sessions.filter(function(s){return s.date===date&&s.status!=='cancelled';}).forEach(function(s){
      var p=D.props.find(function(x){return x.id===s.propId;});
      var cleaners=(s.cleanerIds||[]).map(function(id){return D.cleaners.find(function(c){return c.id===id;});}).filter(Boolean);
      var pname=p?p.name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,''):'?';
      evs.push({type:'clean',text:pname+(cleaners.length?' · '+cleaners[0].name:''),sub:s.time||'',sid:s.id});
    });
    /* Tasks with dueDate */
    D.tasks.filter(function(t){return !t.done&&t.dueDate===date;}).forEach(function(t){
      evs.push({type:'task',text:t.text,sub:t.propId?propName(t.propId):'',tid:t.id});
    });
    /* Custom events */
    (D.events||[]).filter(function(e){
      return e.date===date||(e.date<=date&&e.endDate&&e.endDate>=date);
    }).forEach(function(e){
      var isWorker=['worker','maintenance','delivery'].indexOf(e.category||'other')>=0;
      evs.push({type:isWorker?'person':'event',text:e.title,sub:e.propId?propName(e.propId):'',eid:e.id});
    });
    return evs;
  }

  /* SVG icons per type */
  var ico={
    clean:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18"/><path d="M7 21V9l5-6 5 6v12"/><path d="M10 21v-4h4v4"/></svg>',
    task:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    event:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };

  /* Max chips shown per cell before "+N more" */
  var MAX_CHIPS=3;

  /* Build header */
  var h='<div class="mcal-wrap">';
  h+='<div class="mcal-header">';
  h+='<div class="mcal-nav">';
  h+='<button class="mcal-nav-btn" onclick="calM--;if(calM<0){calM=11;calY--;}render()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>';
  h+='<span class="mcal-month">'+MN[calM]+' '+calY+'</span>';
  h+='<button class="mcal-nav-btn" onclick="calM++;if(calM>11){calM=0;calY++;}render()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>';
  h+='</div>';
  h+='<div class="mcal-header-right">';
  var nowY=new Date().getFullYear(),nowM=new Date().getMonth();
  if(calY!==nowY||calM!==nowM)h+='<button class="mcal-today-btn" onclick="calY='+nowY+';calM='+nowM+';render()">Today</button>';
  h+='<button class="mcal-add-btn" onclick="openAddCalEvent(null)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Add event</span></button>';
  h+='</div></div>';

  /* DOW row */
  h+='<div class="mcal-dow-row">';
  DOW.forEach(function(d){h+='<div class="mcal-dow">'+d+'</div>';});
  h+='</div>';

  /* Grid */
  h+='<div class="mcal-grid">';
  cells.forEach(function(cell){
    var isT=cell.date===td;
    var cls='mcal-cell'+(cell.inMonth?'':' other-month')+(isT?' is-today':'');
    h+='<div class="'+cls+'" onclick="openDayModal(\''+cell.date+'\')">';
    h+='<div class="mcal-dn">'+cell.num+'</div>';
    var evs=eventsFor(cell.date);
    var shown=evs.slice(0,MAX_CHIPS);
    shown.forEach(function(ev){
      h+='<div class="mcal-chip mcal-chip-'+ev.type+'">'+ico[ev.type]+' '+esc(ev.text)+'</div>';
    });
    if(evs.length>MAX_CHIPS){
      h+='<div class="mcal-more">+' +(evs.length-MAX_CHIPS)+' more</div>';
    }
    h+='</div>';
  });
  h+='</div>';

  /* Legend */
  h+='<div class="mcal-legend">';
  h+='<div class="mcal-leg"><div class="mcal-leg-dot" style="background:rgba(56,189,248,0.5)"></div>Cleaning</div>';
  h+='<div class="mcal-leg"><div class="mcal-leg-dot" style="background:rgba(168,85,247,0.5)"></div>Person coming</div>';
  h+='<div class="mcal-leg"><div class="mcal-leg-dot" style="background:rgba(232,120,12,0.5)"></div>Task due</div>';
  h+='<div class="mcal-leg"><div class="mcal-leg-dot" style="background:rgba(20,184,166,0.5)"></div>Custom event</div>';
  h+='</div>';

  h+='</div>';
  return h;
}

function renderCalendarList(){
  const td=today();
  const filterPropId=calFilter.startsWith('prop-')?calFilter.slice(5):null;
  const endDate=addDays(td,90);

  /* Gather upcoming bookings */
  var bookings=calFilter==='cleanings'?[]:D.bookings.filter(function(b){
    return b.status!=='cancelled'&&b.checkIn>=td&&b.checkIn<=endDate&&
      (!filterPropId||b.propId===filterPropId);
  }).sort(function(a,b){return a.checkIn.localeCompare(b.checkIn);});

  /* Gather upcoming cleanings */
  var cleans=calFilter.startsWith('prop-')&&!filterPropId?[]:D.sessions.filter(function(s){
    return s.status!=='cancelled'&&s.date>=td&&s.date<=endDate&&
      (!filterPropId||s.propId===filterPropId);
  }).sort(function(a,b){return a.date.localeCompare(b.date);});

  if(calFilter==='all'||calFilter.startsWith('prop-')){/* keep both */}
  else if(calFilter==='cleanings'){ bookings=[]; }

  if(!bookings.length&&!cleans.length){
    return '<div class="sv-empty"><div class="sv-empty-title">Nothing upcoming</div><div class="sv-empty-sub">No bookings or cleanings in the next 90 days.</div></div>';
  }

  /* Merge items keyed by date */
  var items=[];
  bookings.forEach(function(b){items.push({date:b.checkIn,type:'booking',data:b});});
  cleans.forEach(function(s){items.push({date:s.date,type:'clean',data:s});});
  items.sort(function(a,b){return a.date.localeCompare(b.date)||(a.type==='booking'?-1:1);});

  /* Group by date */
  var groups={};
  items.forEach(function(item){
    if(!groups[item.date])groups[item.date]=[];
    groups[item.date].push(item);
  });

  var h='<div style="display:flex;flex-direction:column">';
  Object.keys(groups).sort().forEach(function(date){
    var isT=date===td;
    var parts=date.split('-');
    var dObj=new Date(+parts[0],+parts[1]-1,+parts[2]);
    var label=isT?'Today':'';
    if(!label){
      var opts={weekday:'short',day:'numeric',month:'short'};
      label=dObj.toLocaleDateString('en-GB',opts);
    }
    h+='<div class="cal-list-date'+(isT?' is-today':'')+'">'+label+'</div>';
    h+='<div class="sv-card" style="padding:0;margin-bottom:12px;overflow:hidden">';
    groups[date].forEach(function(item){
      if(item.type==='booking'){
        var b=item.data;
        var prop=D.props.find(function(p){return p.id===b.propId;});
        var pname=prop?prop.name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,''):'?';
        var platform=b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':(b.agencyName||'Direct');
        var nights=daysBetween(b.checkIn,b.checkOut);
        var clr=propBarColor(b.propId);
        h+='<div class="sv-work-row" style="cursor:pointer" onclick="openBookingDetail(\''+b.id+'\')">';
        h+='<div style="width:34px;height:34px;border-radius:10px;background:'+clr.bg+';display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>';
        h+='<div style="flex:1;min-width:0">';
        h+='<div style="font-size:13px;font-weight:700;color:var(--text)">'+(b.guestName?esc(b.guestName):'Guest')+'</div>';
        h+='<div style="font-size:11px;color:var(--text3);margin-top:1px">'+esc(pname)+' · '+esc(platform)+(b.checkInTime?' · '+esc(b.checkInTime):'')+'</div>';
        h+='</div>';
        h+='<div style="text-align:right;flex-shrink:0"><div style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--accent);color:#fff;white-space:nowrap">Check-in</div><div style="font-size:10px;color:var(--text3);margin-top:3px;font-weight:600">'+nights+'n</div></div>';
        h+='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" style="flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>';
        h+='</div>';
      } else {
        var s=item.data;
        var prop=D.props.find(function(p){return p.id===s.propId;});
        var pname=prop?prop.name.replace(/^Villa\s+/i,'').replace(/^Can\s+/i,''):'?';
        var cleaners=(s.cleanerIds||[]).map(function(id){return D.cleaners.find(function(c){return c.id===id;});}).filter(Boolean);
        h+='<div class="sv-work-row">';
        h+='<div style="width:34px;height:34px;border-radius:10px;background:rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0369a1" stroke-width="2.5"><path d="M3 21h18"/><path d="M7 21V9l5-6 5 6v12"/><path d="M10 21v-4h4v4"/></svg></div>';
        h+='<div style="flex:1;min-width:0">';
        h+='<div style="font-size:13px;font-weight:700;color:var(--text)">'+esc(pname)+'</div>';
        h+='<div style="font-size:11px;color:var(--text3);margin-top:1px">'+(s.time?s.time+' · ':'')+''+(cleaners.length?cleaners.map(function(c){return esc(c.name);}).join(', '):'No cleaner assigned')+'</div>';
        h+='</div>';
        h+='<div style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgba(56,189,248,0.15);color:#0369a1;white-space:nowrap;flex-shrink:0">Cleaning</div>';
        h+='</div>';
      }
    });
    h+='</div>';
  });
  h+='</div>';
  return h;
}
function calPrev(){calM--;if(calM<0){calM=11;calY--;}render()}
function calNext(){calM++;if(calM>11){calM=0;calY++;}render()}

/* Open day detail modal */
function openDayModal(date){
  D.events=D.events||[];
  var parts=date.split('-');
  var dt=new Date(+parts[0],+parts[1]-1,+parts[2]);
  var dateLabel=dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  var td=today();
  var isToday=date===td;

  var cleans=D.sessions.filter(function(s){return s.date===date&&s.status!=='cancelled';});
  var tasks=D.tasks.filter(function(t){return !t.done&&t.dueDate===date;});
  var events=(D.events||[]).filter(function(e){return e.date===date||(e.date<=date&&e.endDate&&e.endDate>=date);});

  var h='<div class="modal-handle"></div>';
  h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:10px">';
  h+='<div>';
  h+='<div class="modal-title" style="margin-bottom:2px">'+(isToday?'Today — ':'')+dateLabel+'</div>';
  var total=cleans.length+tasks.length+events.length;
  h+='<div style="font-size:12px;color:var(--text3);font-weight:500">'+total+' item'+(total!==1?'s':'')+'</div>';
  h+='</div>';
  h+='<button class="btn btn-primary btn-sm" onclick="closeModal();openAddCalEvent(\''+date+'\')">+ Add</button>';
  h+='</div>';

  function section(title,items){
    if(!items.length)return'';
    var s='<div style="margin-bottom:14px">';
    s+='<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.10em;color:var(--text3);margin-bottom:8px">'+title+'</div>';
    items.forEach(function(item){s+=item;});
    s+='</div>';
    return s;
  }

  /* Cleanings section */
  var cleanHtml=cleans.map(function(s){
    var p=D.props.find(function(x){return x.id===s.propId;});
    var cleaners=(s.cleanerIds||[]).map(function(id){return D.cleaners.find(function(c){return c.id===id;});}).filter(Boolean);
    return'<div class="mcal-modal-item">'
      +'<div class="mcal-modal-ico" style="background:rgba(56,189,248,0.14);color:#0369a1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M3 21h18"/><path d="M7 21V9l5-6 5 6v12"/><path d="M10 21v-4h4v4"/></svg></div>'
      +'<div><div class="mcal-modal-title">'+(p?esc(p.name):'Property')+'</div>'
      +'<div class="mcal-modal-sub">'+(cleaners.length?cleaners.map(function(c){return esc(c.name);}).join(', '):'No cleaner assigned')+(s.time?' · '+s.time:'')+(s.status==='done'?' · Done ✓':'')+'</div></div>'
      +'</div>';
  });

  /* Tasks section */
  var taskHtml=tasks.map(function(t){
    return'<div class="mcal-modal-item" onclick="closeModal();tab=\'tasks\';render()" style="cursor:pointer">'
      +'<div class="mcal-modal-ico" style="background:rgba(232,120,12,0.13);color:#9a3412"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>'
      +'<div><div class="mcal-modal-title">'+esc(t.text)+'</div>'
      +'<div class="mcal-modal-sub">'+(t.propId?esc(propName(t.propId))+' · ':'')+(t.priority||'medium')+' priority</div></div>'
      +'</div>';
  });

  /* Events section */
  var eventHtml=events.map(function(e){
    var isWorker=['worker','maintenance','delivery'].indexOf(e.category||'other')>=0;
    var bg=isWorker?'rgba(168,85,247,0.14)':'rgba(20,184,166,0.14)';
    var col=isWorker?'#6b21a8':'#0f766e';
    var ico=isWorker
      ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    return'<div class="mcal-modal-item" onclick="closeModal();openEventDetail(\''+e.id+'\')" style="cursor:pointer">'
      +'<div class="mcal-modal-ico" style="background:'+bg+';color:'+col+'">'+ico+'</div>'
      +'<div><div class="mcal-modal-title">'+esc(e.title)+'</div>'
      +'<div class="mcal-modal-sub">'+(e.time?e.time+' · ':'')+(e.propId?esc(propName(e.propId))+' · ':'')+esc(e.category||'event')+(e.note?' — '+esc(e.note):'')+'</div></div>'
      +'</div>';
  });

  h+=section('Cleanings',cleanHtml);
  h+=section('Tasks due',taskHtml);
  h+=section('Events',eventHtml);

  if(!total){
    h+='<div style="text-align:center;padding:24px 0 16px">';
    h+='<div style="font-size:28px;margin-bottom:10px">📋</div>';
    h+='<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Nothing scheduled</div>';
    h+='<div style="font-size:12px;color:var(--text3)">Tap + Add to schedule something for this day</div>';
    h+='</div>';
  }

  h+='<button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="closeModal()">Close</button>';
  showModal(h);
}

/* Add event pre-filled with date */
function openAddCalEvent(prefillDate){
  var dateVal=prefillDate||today();
  var po='<option value="">No property</option>'+D.props.map(function(p){return'<option value="'+p.id+'">'+esc(p.name)+'</option>';}).join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Add calendar event</div>'
    +'<div class="field"><label>Title</label><input type="text" id="ev-title" placeholder="e.g. Denis fixes wall, Pep visit, Buy supplies…"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div class="field"><label>Date</label><input type="date" id="ev-date" value="'+dateVal+'"></div>'
    +'<div class="field"><label>Time <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="time" id="ev-time"></div>'
    +'</div>'
    +'<div class="field"><label>Type</label><select id="ev-cat">'
    +'<option value="other">📌 Custom event</option>'
    +'<option value="worker">👷 Person coming / worker</option>'
    +'<option value="maintenance">🔧 Maintenance / repair</option>'
    +'<option value="meeting">💼 Meeting</option>'
    +'<option value="delivery">📦 Delivery</option>'
    +'<option value="personal">🌿 Personal</option>'
    +'</select></div>'
    +'<div class="field"><label>Property <span style="font-weight:400;color:var(--text3)">(optional)</span></label><select id="ev-prop">'+po+'</select></div>'
    +'<div class="field"><label>Notes <span style="font-weight:400;color:var(--text3)">(optional)</span></label><textarea id="ev-note" placeholder="Extra details…" style="height:60px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveCalEvent()">Save</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
  setTimeout(function(){var el=document.getElementById('ev-title');if(el)el.focus();},100);
}

function saveCalEvent(){
  var title=(document.getElementById('ev-title')||{}).value||'';
  var date=(document.getElementById('ev-date')||{}).value||'';
  if(!title.trim()){alert('Please enter a title.');return;}
  if(!date){alert('Please pick a date.');return;}
  D.events=D.events||[];
  D.events.push({
    id:uid(),title:title.trim(),date:date,
    time:(document.getElementById('ev-time')||{}).value||'',
    endDate:'',
    category:(document.getElementById('ev-cat')||{}).value||'other',
    propId:(document.getElementById('ev-prop')||{}).value||'',
    note:(document.getElementById('ev-note')||{}).value||'',
    createdAt:today()
  });
  save();closeModal();calView='month';
  // Navigate to the month of the saved event
  var parts=date.split('-');
  calY=parseInt(parts[0]);calM=parseInt(parts[1])-1;
  render();toast('Event saved ✓');
}
function calWeekPrev(){calWeekStart=addDays(calWeekStart,-7);render()}
function calWeekNext(){calWeekStart=addDays(calWeekStart,7);render()}
function openDay(ds){
  const ss=D.sessions.filter(s=>s.date===ds).sort((a,b)=>a.time.localeCompare(b.time));
  const bks=D.bookings.filter(b=>b.checkIn<=ds&&b.checkOut>=ds&&b.status!=='cancelled');
  if(!ss.length&&!bks.length)return;
  if(ss.length===1&&!bks.length){openSess(ss[0].id);return;}
  if(bks.length===1&&!ss.length){openBookingDetail(bks[0].id);return;}
  let h='';
  if(bks.length){
    h+='<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Bookings</div>';
    h+=bks.map(b=>{
      const p=D.props.find(x=>x.id===b.propId);
      const clr=propBarColor(b.propId);
      return'<div class="bk-card" style="background:'+clr.bg+';border-color:'+clr.border+';margin-bottom:8px" onclick="closeModal();openBookingDetail(\''+b.id+'\')">'
        +'<div class="bk-card-body"><div class="bk-card-prop" style="color:'+clr.text+'">'+esc(p?p.name:'?')+platformBadge(b.platform,b.agencyName)+'</div>'
        +'<div class="bk-card-dates" style="color:'+clr.text+';opacity:0.7">'+fmtDate(b.checkIn)+' → '+fmtDate(b.checkOut)+'</div></div>'
        +'</div>';
    }).join('');
  }
  if(ss.length){
    h+='<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin:'+(bks.length?'12px':'0')+' 0 8px">Cleanings</div>';
    h+=ss.map(s=>{const p=D.props.find(x=>x.id===s.propId);const cln=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean);const tags=cln.map(c=>'<span class="badge tc-'+colorFor(c.name)+'">'+esc(c.name)+'</span>').join('');const sb=s.status==='done'?'<span class="badge b-done">Done</span>':s.status==='cancelled'?'<span class="badge b-cancelled">Cancelled</span>':'';return'<div class="card card-tap card-clean" onclick="closeModal();openSess(\''+s.id+'\')" style="margin-bottom:8px;padding:12px 14px"><div class="sess-prop">'+esc(p?p.name:'?')+sb+'</div>'+(s.time?'<div class="sess-date">'+s.time+'</div>':'')+'<div class="sess-tags">'+tags+'</div></div>';}).join('');
  }
  showModal('<div class="modal-handle"></div><div class="modal-title">'+fmtFull(ds)+'</div>'+h+'<button class="btn btn-ghost" style="margin-top:6px" onclick="closeModal()">Close</button>');
}

/* ── WHATSAPP SCHEDULE ── */
function showScheduleModal(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Send schedule</div>'
    +'<div style="font-size:13px;color:var(--text3);margin-bottom:18px;font-weight:500">WhatsApp opens with the schedule pre-typed. Select your group and send.</div>'
    +'<div class="period-grid">'
    +'<button class="period-btn" onclick="sendScheduleWA(\'today\')"><span class="period-btn-icon">📅</span>Today</button>'
    +'<button class="period-btn" onclick="sendScheduleWA(\'tomorrow\')"><span class="period-btn-icon">📆</span>Tomorrow</button>'
    +'<button class="period-btn" onclick="sendScheduleWA(\'this_week\')"><span class="period-btn-icon">📋</span>This week</button>'
    +'<button class="period-btn" onclick="sendScheduleWA(\'next_week\')"><span class="period-btn-icon">🗓</span>Next week</button>'
    +'</div>'
    +'<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>');
}
function sendScheduleWA(period){
  let s1,s2,title;
  const t=today(),sow=startOfWeek(),eow=endOfWeek();
  if(period==='today'){s1=s2=t;title='Today — '+fmtDate(t);}
  else if(period==='tomorrow'){s1=s2=addDays(t,1);title='Tomorrow — '+fmtDate(addDays(t,1));}
  else if(period==='this_week'){s1=sow;s2=eow;title='This Week  •  '+fmtDateRange(sow,eow);}
  else{s1=addDays(eow,1);s2=addDays(eow,7);title='Next Week  •  '+fmtDateRange(addDays(eow,1),addDays(eow,7));}
  const sessions=D.sessions.filter(s=>s.date>=s1&&s.date<=s2&&s.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  if(!sessions.length){closeModal();toast('No sessions scheduled for this period');return;}
  let msg='🏡 *SeraVillas — Cleaning Schedule*\n📅 *'+title+'*\n\n';
  let ld='';
  sessions.forEach(s=>{
    const p=D.props.find(x=>x.id===s.propId);
    const cleaners=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean);
    if(s.date!==ld){msg+='*'+fmtDate(s.date)+'*\n';ld=s.date;}
    msg+='📍 '+(p?p.name:'?');if(s.time)msg+=' · '+s.time;msg+='\n';
    if(cleaners.length)msg+='👤 '+cleaners.map(c=>c.name).join(', ')+'\n';
    if(s.note)msg+='📝 '+s.note+'\n';
    msg+='\n';
  });
  msg+=sessions.length+' session'+(sessions.length>1?'s':'')+' total\n_Sent via SeraVillas_';
  closeModal();
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

/* ── HOME QUICK ADD ── */
function showHomeQuickAdd(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Quick Add</div>'
    +'<div class="qa-option" onclick="closeModal();openQuickTaskModal()">'
    +'<div class="qa-icon" style="background:var(--surface2)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>'
    +'<div><div class="qa-label">Add Task</div><div class="qa-sub">Capture a new task</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openAddSessModal()">'
    +'<div class="qa-icon" style="background:var(--accent-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>'
    +'<div><div class="qa-label">Schedule cleaning</div><div class="qa-sub">Add a new cleaning session</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openAddBookingModal()">'
    +'<div class="qa-icon" style="background:#fff0f0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c0392b" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>'
    +'<div><div class="qa-label">Add booking</div><div class="qa-sub">Log a guest reservation</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openAddIssue()">'
    +'<div class="qa-icon" style="background:var(--amber-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>'
    +'<div><div class="qa-label">Log Issue</div><div class="qa-sub">Track a property issue</div></div></div>'
    +'<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>');
}

/* ── CAL QUICK ADD ── */
function showCalQuickAdd(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Add to calendar</div>'
    +'<div class="qa-option" onclick="closeModal();openAddSessModal()">'
    +'<div class="qa-icon" style="background:var(--accent-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>'
    +'<div><div class="qa-label">Schedule cleaning</div><div class="qa-sub">Add a new cleaning session</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openAddBookingModal()">'
    +'<div class="qa-icon" style="background:#fff0f0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c0392b" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg></div>'
    +'<div><div class="qa-label">Add booking</div><div class="qa-sub">Log a guest reservation</div></div></div>'
    +'<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>');
}

/* ── BOOKING CRUD ── */
function openAddBookingModal(prefillDate){
  window._bkPlatform='airbnb';
  const propOpts='<option value="">Select property</option>'+D.props.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const today2=prefillDate||today();
  showModal('<div class="modal-handle"></div><div class="modal-title">Add booking</div>'
    +'<div class="field"><label>Property</label><select id="bk-prop">'+propOpts+'</select></div>'
    +'<div class="field"><label>Platform</label><div class="chips" style="margin-top:6px">'
    +'<button type="button" class="chip on" onclick="setBkPlatform(\'airbnb\')">Airbnb</button>'
    +'<button type="button" class="chip" onclick="setBkPlatform(\'booking\')">Booking.com</button>'
    +'<button type="button" class="chip" onclick="setBkPlatform(\'agency\')">Agency</button>'
    +'<button type="button" class="chip" onclick="setBkPlatform(\'direct\')">Direct</button>'
    +'</div></div>'
    +'<div class="field" id="bk-agency-field" style="display:none"><label>Agency name</label><input type="text" id="bk-agency" placeholder="e.g. Costa Rentals"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field"><label>Check-in</label><input type="date" id="bk-checkin" value="'+today2+'"></div>'
    +'<div class="field"><label>Check-out</label><input type="date" id="bk-checkout" value="'+addDays(today2,7)+'"></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field"><label>Guest name</label><input type="text" id="bk-guest" placeholder="Optional"></div>'
    +'<div class="field"><label>Guests</label><input type="number" id="bk-gcount" placeholder="0" min="0"></div>'
    +'</div>'
    +'<div class="field"><label>Total price (€)</label><input type="number" id="bk-rate" placeholder="0" min="0"></div>'
    +'<div class="field"><label>Notes</label><textarea id="bk-notes" placeholder="Any extra details..." style="height:60px"></textarea></div>'
    +'<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--accent-bg);border-radius:var(--radius-sm);margin-bottom:14px;border:1px solid var(--accent-border)">'
    +'<input type="checkbox" id="bk-clean-toggle" checked style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer;flex-shrink:0">'
    +'<label for="bk-clean-toggle" style="font-size:13px;font-weight:600;color:var(--accent-text);cursor:pointer">Schedule cleaning on check-out day</label>'
    +'</div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="saveNewBooking()">Save booking</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function setBkPlatform(p){
  window._bkPlatform=p;
  document.querySelectorAll('#modal-root .chips .chip').forEach(c=>{
    const matches=(c.textContent==='Airbnb'&&p==='airbnb')||(c.textContent==='Booking.com'&&p==='booking')||(c.textContent==='Agency'&&p==='agency')||(c.textContent==='Direct'&&p==='direct');
    c.classList.toggle('on',matches);
  });
  const af=document.getElementById('bk-agency-field');
  if(af)af.style.display=p==='agency'?'block':'none';
}
function saveNewBooking(){
  const propId=(document.getElementById('bk-prop')||{}).value||'';
  const checkIn=(document.getElementById('bk-checkin')||{}).value||'';
  const checkOut=(document.getElementById('bk-checkout')||{}).value||'';
  if(!propId){toast('Please select a property');return;}
  if(!checkIn||!checkOut){toast('Please set check-in and check-out dates');return;}
  if(checkOut<=checkIn){toast('Check-out must be after check-in');return;}
  const platform=window._bkPlatform||'airbnb';
  const agencyName=platform==='agency'?((document.getElementById('bk-agency')||{}).value||'').trim():'';
  const guestName=((document.getElementById('bk-guest')||{}).value||'').trim();
  const guestCount=parseInt((document.getElementById('bk-gcount')||{}).value)||0;
  const totalPrice=parseFloat((document.getElementById('bk-rate')||{}).value)||0;
  const notes=((document.getElementById('bk-notes')||{}).value||'').trim();
  const scheduleClean=(document.getElementById('bk-clean-toggle')||{}).checked;
  const bkId=uid();
  let linkedCleaningId='';
  if(scheduleClean){
    const cid=uid();
    D.sessions.push({id:cid,propId,date:checkOut,time:'',cleanerIds:[],status:'scheduled',note:'Checkout cleaning — '+fmtDate(checkIn)+' booking'});
    linkedCleaningId=cid;
  }
  D.bookings.push({id:bkId,propId,platform,agencyName,checkIn,checkOut,guestName,guestCount,totalPrice,notes,status:'confirmed',linkedCleaningId});
  save();closeModal();render();
  toast('Booking saved'+(scheduleClean?' + cleaning scheduled':'')+'!');
}
function openBookingDetail(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  const prop=D.props.find(x=>x.id===b.propId);
  const clr=propBarColor(b.propId);
  const nights=nightsBetween(b.checkIn,b.checkOut);
  const linkedSess=b.linkedCleaningId?D.sessions.find(s=>s.id===b.linkedCleaningId):null;
  const cleanBtn=linkedSess
    ?'<button class="btn btn-ghost btn-sm" onclick="closeModal();openSess(\''+linkedSess.id+'\')">🧹 View cleaning</button>'
    :b.status==='cancelled'?'':'<button class="btn btn-ghost btn-sm" onclick="scheduleCleanFromBooking(\''+id+'\')">🧹 Schedule cleaning</button>';
  showModal('<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<div style="width:4px;height:40px;border-radius:99px;background:'+clr.border+';flex-shrink:0"></div>'
    +'<div><div style="font-size:18px;font-weight:800;letter-spacing:-0.3px">'+esc(prop?prop.name:'?')+'</div>'
    +'<div style="margin-top:4px">'+platformBadge(b.platform,b.agencyName)+'</div>'
    +'</div></div>'
    +'<div style="background:'+clr.bg+';border:1px solid '+clr.border+';border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:14px">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div><div style="font-size:10px;font-weight:700;color:'+clr.text+';opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px">Check-in</div><div style="font-size:14px;font-weight:700;color:'+clr.text+'">'+fmtDate(b.checkIn)+'</div></div>'
    +'<div><div style="font-size:10px;font-weight:700;color:'+clr.text+';opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px">Check-out</div><div style="font-size:14px;font-weight:700;color:'+clr.text+'">'+fmtDate(b.checkOut)+'</div></div>'
    +'</div>'
    +'<div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between">'
    +'<div style="font-size:12px;font-weight:600;color:'+clr.text+';opacity:0.7">'+nights+' night'+(nights!==1?'s':'')+'</div>'
    +(b._excel&&b._excel.priceUnknown?'<div style="font-size:12px">Price unknown</div>':b.totalPrice||b._excel?'<div style="font-size:18px;font-weight:800;color:'+clr.text+';font-family:\'DM Mono\',monospace;letter-spacing:-0.5px">€'+b.totalPrice.toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:2})+'</div>':'')
    +'</div>'
    +'</div>'
    +(b.guestName||b.guestCount?'<div style="display:flex;gap:10px;margin-bottom:12px">'
    +(b.guestName?'<div style="flex:1;background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px"><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Guest</div><div style="font-size:13px;font-weight:600">'+esc(b.guestName)+'</div></div>':'')
    +(b.guestCount?'<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px"><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Guests</div><div style="font-size:13px;font-weight:600">'+b.guestCount+'</div></div>':'')
    +'</div>':'')
    +(b.status==='cancelled'?'<p style="font-size:12px;color:var(--amber);margin-bottom:12px">Cancelled · Money retained: '+fmtRevenueAmount(bookingRevenueCents(b)/100)+'</p>':'')
    +(b._excel&&b._excel.cleaningNeedsReview?'<p style="font-size:12px;color:var(--amber);margin-bottom:12px">Linked cleaning needs review after the Excel import. Check its date and assignment.</p>':'')
    +(b.notes?'<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:12px;border-left:3px solid var(--border2)">'+esc(b.notes)+'</div>':'')
    +'<div class="divider"></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    +cleanBtn
    +'<button class="btn btn-ghost btn-sm" onclick="openEditBooking(\''+id+'\')">Edit</button>'
    +(b.status==='confirmed'?'<button class="btn btn-amber-sm btn-sm" onclick="cancelBooking(\''+id+'\')">Cancel booking</button>':'<button class="btn btn-ghost btn-sm" onclick="restoreBooking(\''+id+'\')">Restore</button>')
    +'</div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-danger" style="flex:1" onclick="deleteBooking(\''+id+'\')">Delete</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button></div>');
}
function openEditBooking(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  window._bkPlatform=b.platform;
  const propOpts=D.props.map(p=>'<option value="'+p.id+'"'+(p.id===b.propId?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit booking</div>'
    +'<div class="field"><label>Property</label><select id="bk-prop">'+propOpts+'</select></div>'
    +'<div class="field"><label>Platform</label><div class="chips" style="margin-top:6px">'
    +'<button type="button" class="chip'+(b.platform==='airbnb'?' on':'')+'" onclick="setBkPlatform(\'airbnb\')">Airbnb</button>'
    +'<button type="button" class="chip'+(b.platform==='booking'?' on':'')+'" onclick="setBkPlatform(\'booking\')">Booking.com</button>'
    +'<button type="button" class="chip'+(b.platform==='agency'?' on':'')+'" onclick="setBkPlatform(\'agency\')">Agency</button>'
    +'<button type="button" class="chip'+(b.platform==='direct'?' on':'')+'" onclick="setBkPlatform(\'direct\')">Direct</button>'
    +'</div></div>'
    +'<div class="field" id="bk-agency-field" style="display:'+(b.platform==='agency'?'block':'none')+'"><label>Agency name</label><input type="text" id="bk-agency" value="'+esc(b.agencyName)+'"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field"><label>Check-in</label><input type="date" id="bk-checkin" value="'+b.checkIn+'"></div>'
    +'<div class="field"><label>Check-out</label><input type="date" id="bk-checkout" value="'+b.checkOut+'"></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field"><label>Guest name</label><input type="text" id="bk-guest" value="'+esc(b.guestName)+'"></div>'
    +'<div class="field"><label>Guests</label><input type="number" id="bk-gcount" value="'+(b.guestCount||'')+'"></div>'
    +'</div>'
    +'<div class="field"><label>Total price (€)</label><input type="number" id="bk-rate" value="'+(b.totalPrice===null?'':b.totalPrice)+'"></div>'
    +(b.status==='cancelled'?'<div class="field"><label for="bk-cancellation-revenue">Money retained after cancellation (€)</label><input type="number" id="bk-cancellation-revenue" min="0" step="0.01" value="'+(bookingRevenueCents(b)/100)+'"><div style="font-size:11px;color:var(--text3);margin-top:6px">Enter the amount actually kept. Use 0 if fully refunded. Included in revenue for the scheduled check-in month.</div></div>':'')
    +'<div class="field"><label>Notes</label><textarea id="bk-notes" style="height:60px">'+esc(b.notes)+'</textarea></div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="saveEditBooking(\''+id+'\')">Save changes</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveEditBooking(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  const checkIn=(document.getElementById('bk-checkin')||{}).value||'';
  const checkOut=(document.getElementById('bk-checkout')||{}).value||'';
  if(!checkIn||!checkOut||checkOut<=checkIn){toast('Check-out must be after check-in');return;}
  let cancellationRevenue;
  if(b.status==='cancelled'){
    const retainedInput=(document.getElementById('bk-cancellation-revenue')||{}).value;
    cancellationRevenue=Number(retainedInput);
    if(retainedInput===undefined||String(retainedInput).trim()===''||!Number.isFinite(cancellationRevenue)||cancellationRevenue<0){toast('Enter money retained as 0 or a positive amount');return;}
    const retainedCents=Math.round(cancellationRevenue*100);
    if(!Number.isSafeInteger(retainedCents)){toast('Money retained is too large');return;}
    cancellationRevenue=retainedCents/100;
  }
  b.propId=(document.getElementById('bk-prop')||{}).value||b.propId;
  b.platform=window._bkPlatform||b.platform;
  b.agencyName=b.platform==='agency'?((document.getElementById('bk-agency')||{}).value||'').trim():'';
  b.checkIn=checkIn;b.checkOut=checkOut;
  b.guestName=((document.getElementById('bk-guest')||{}).value||'').trim();
  const guestInput=((document.getElementById('bk-gcount')||{}).value||'').trim();
  const priceInput=((document.getElementById('bk-rate')||{}).value||'').trim();
  b.guestCount=guestInput===''&&b.guestCount===null?null:(parseInt(guestInput)||0);
  b.totalPrice=priceInput===''&&b._excel&&b._excel.priceUnknown?null:(parseFloat(priceInput)||0);
  if(b._excel)b._excel.priceUnknown=b.totalPrice===null;
  if(b.status==='cancelled')b.cancellationRevenue=cancellationRevenue;
  b.notes=((document.getElementById('bk-notes')||{}).value||'').trim();
  save();closeModal();render();toast('Booking updated!');
}
function scheduleCleanFromBooking(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  if(b.status==='cancelled'){toast('Cancelled bookings do not need a checkout cleaning');return;}
  const cid=uid();
  D.sessions.push({id:cid,propId:b.propId,date:b.checkOut,time:'',cleanerIds:[],status:'scheduled',note:'Checkout cleaning'});
  b.linkedCleaningId=cid;
  save();closeModal();toast('Cleaning scheduled!');render();
}
function cancelBooking(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  b.status='cancelled';save();closeModal();render();toast('Booking cancelled');
}
function restoreBooking(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  b.status='confirmed';save();closeModal();render();toast('Booking restored');
}
function cancelBookingTL(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  b.status='cancelled';save();render();toast('Booking cancelled');
  var p=document.getElementById('tl-detail-panel');if(p)p.innerHTML=renderTLDetailPanel();
}
function restoreBookingTL(id){
  const b=D.bookings.find(x=>x.id===id);if(!b)return;
  b.status='confirmed';save();render();toast('Booking restored');
  var p=document.getElementById('tl-detail-panel');if(p)p.innerHTML=renderTLDetailPanel();
}
function deleteBooking(id){
  if(!confirm('Delete this booking?'))return;
  D.bookings=D.bookings.filter(x=>x.id!==id);
  save();closeModal();render();toast('Booking deleted');
}

