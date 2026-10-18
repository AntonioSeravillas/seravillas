/* Jarvis-themed Bookings page (classic script, after calendar.js). Presentation only: it reads and changes the same
   calendar state the workspace uses (calView, calTimelineDate, calY/calM, calFilter) and calls the existing booking
   functions (openAddBookingModal, selectTLBooking, setTimelineMonth, switchCalendarView, setCalendarFilter, ...).
   Every value is escaped; there are no element ids, so it can never collide with the workspace calendar. */
(function(){
  const MONTH_RE=/^(19|20)\d{2}-(0[1-9]|1[0-2])$/;
  /* Column sizes follow the CSS viewport (bounded), matching the page's proportional type and controls. */
  const vw=()=>window.innerWidth||1280;
  const dayW=()=>vw()>=1100?Math.max(60,Math.min(100,Math.round(vw()*.039))):vw()>=768?56:44;
  const propW=()=>vw()>=1100?Math.max(146,Math.min(240,Math.round(vw()*.08))):vw()>=768?132:96;
  const parse=d=>{const p=d.split('-');return new Date(+p[0],+p[1]-1,+p[2]);};
  const monthKey=d=>d.slice(0,7);
  function shiftMonth(key,delta){const p=key.split('-').map(Number);const d=new Date(p[0],p[1]-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
  const monthLabel=key=>{const p=key.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});};
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={prev:'<path d="m15 18-6-6 6-6"/>',next:'<path d="m9 18 6-6-6-6"/>',down:'<path d="m6 9 6 6 6-6"/>',plus:'<path d="M12 5.5v13M5.5 12h13"/>',more:'<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="2.6"/>'};
  /* The timeline window: the same range rules as the workspace timeline (30 days before the focus, at least 150 after). */
  function windowFor(){
    const focus=calTimelineDate||today(),yrEnd=focus.slice(0,4)+'-12-31';
    const after=Math.max(TL_AFTER,daysBetween(focus,yrEnd)),start=addDays(focus,-TL_BEFORE),total=TL_BEFORE+after+1;
    return {focus,start,end:addDays(start,total-1),total};
  }
  function filteredProps(){const id=calFilter.startsWith('prop-')?calFilter.slice(5):null;return id?D.props.filter(p=>p.id===id):D.props;}
  function platformName(b){return b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':b.agencyName?String(b.agencyName).slice(0,18):b.platform==='direct'?'Direct':'Agency';}
  function toolbar(){
    const month=calView==='month';
    const key=month?calY+'-'+String(calM+1).padStart(2,'0'):monthKey(windowFor().focus);
    const opts=[['all','All properties'],['cleanings','Cleanings only']].concat(D.props.map(p=>['prop-'+p.id,p.name]));
    let h='<header class="jb-head"><div class="jb-heading"><small class="jv-label">Bookings</small><div class="jb-title"><h2 data-jb-title>'+esc(monthLabel(key))+'</h2>'
      +'<label class="jb-month-pick" title="Go to month">'+svg(I.down,16)+'<span class="jarvis-sr">Go to month</span><input type="month" data-bk-month min="1900-01" max="2099-12" value="'+key+'"></label></div></div>'
      +'<label class="jv-select jb-filter"><span class="jarvis-sr">Show</span><select data-bk-filter>'+opts.map(([v,l])=>'<option value="'+esc(v)+'"'+(calFilter===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+svg(I.down,14)+'</label>'
      +'<div class="jb-tools"><button type="button" class="jv-icon-btn" data-bk="prev" aria-label="Previous month">'+svg(I.prev)+'</button><button type="button" class="jv-btn" data-bk="today">Today</button><button type="button" class="jv-icon-btn" data-bk="next" aria-label="Next month">'+svg(I.next)+'</button>'
      +'<label class="jv-select jb-view"><span class="jarvis-sr">Calendar view</span><select data-bk-view><option value="timeline"'+(month?'':' selected')+'>Timeline</option><option value="month"'+(month?' selected':'')+'>Month</option></select>'+svg(I.down,14)+'</label>'
      +'<button type="button" class="jv-icon-btn" data-bk="create" aria-label="New booking" title="New booking">'+svg(I.plus)+'</button>'
      +'<div class="jb-more"><button type="button" class="jv-icon-btn" data-bk="more" aria-haspopup="true" aria-expanded="false" aria-label="More booking tools" title="More booking tools">'+svg(I.more,18)+'</button>'
      +'<div class="jv-menu jb-menu" role="menu" hidden>'
      +[['import','Import bookings from Excel'],['availability','Availability & gaps'],['agenda','Upcoming agenda'],['events','Calendar events'],['cleaning','Add cleaning'],['event','Add calendar event'],['share','Share cleaning schedule']].map(([a,l])=>'<button type="button" role="menuitem" data-bk-tool="'+a+'">'+esc(l)+'</button>').join('')
      +'</div></div></div></header>';
    return h;
  }
  /* Villas down the left (pinned), one column per day, stay bars from mid check-in day to mid checkout day. */
  function timeline(){
    const w=windowFor(),props=filteredProps(),td=today(),DW=dayW(),PW=propW();
    if(!D.props.length)return '<div class="jb-empty"><p>No properties yet.</p><small>Add a property first; its bookings will appear here.</small></div>';
    if(!props.length)return '<div class="jb-empty"><p>No property matches this filter.</p><button type="button" class="jv-btn" data-bk-reset>Show all properties</button></div>';
    const days=[];for(let i=0;i<w.total;i++)days.push(addDays(w.start,i));
    let h='<div class="jb-scroll" data-jb-scroll style="--day:'+DW+'px;--prop:'+PW+'px;--days:'+w.total+'" data-start="'+w.start+'" data-focus="'+w.focus+'"><div class="jb-grid">';
    h+='<div class="jb-row jb-dates"><div class="jb-corner"></div>';
    days.forEach((d,i)=>{const o=parse(d),dow=o.getDay(),first=+d.slice(8)===1;
      h+='<div class="jb-day'+(d===td?' is-today':'')+(dow===0||dow===6?' is-weekend':'')+(first&&i?' is-month-start':'')+'"><small>'+(first||!i?esc(o.toLocaleDateString('en-GB',{month:'short'}).toUpperCase())+' · ':'')+esc(o.toLocaleDateString('en-GB',{weekday:'short'}).toUpperCase())+'</small><b>'+o.getDate()+'</b></div>';});
    h+='</div>';
    const weekend=days.map((d,i)=>{const dow=parse(d).getDay();return dow===0||dow===6?i:-1;}).filter(i=>i>=0);
    const shade='<div class="jb-shade" aria-hidden="true">'+weekend.map(i=>'<i style="left:'+(i*DW)+'px"></i>').join('')+(days.indexOf(td)>=0?'<b style="left:'+(days.indexOf(td)*DW+DW/2)+'px"></b>':'')+'</div>';
    props.forEach(prop=>{
      const stays=calFilter==='cleanings'?[]:D.bookings.filter(b=>b.propId===prop.id&&b.status!=='cancelled'&&b.checkIn<=w.end&&b.checkOut>w.start&&b.checkOut>b.checkIn).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
      const cleans=D.sessions.filter(s=>s.propId===prop.id&&s.status!=='cancelled'&&s.date>=w.start&&s.date<=w.end);
      h+='<div class="jb-row" data-prop="'+esc(prop.id)+'" style="--lanes:'+laneCountFor(stays)+'"><div class="jb-prop" title="'+esc(prop.name)+'">'+esc(prop.name)+'</div><div class="jb-lane" data-bk-lane="'+esc(prop.id)+'" title="Select an empty day to add a booking for '+esc(prop.name)+'">'+shade;
      cleans.forEach(s=>{const i=daysBetween(w.start,s.date);h+='<i class="jb-clean" style="left:'+(i*DW+DW/2)+'px" title="Cleaning '+esc(fmtDate(s.date))+'"></i>';});
      /* Overlapping stays (double bookings) get their own lane so neither hides the other. */
      const lanes=[],laneOf=new Map();
      stays.forEach(b=>{let i=lanes.findIndex(end=>end<=b.checkIn);if(i<0){i=lanes.length;lanes.push('');}lanes[i]=b.checkOut;laneOf.set(b.id,i);});
      const laneCount=Math.max(1,lanes.length);
      stays.forEach(b=>{
        const lane=laneOf.get(b.id)||0,top=((lane+.5)/laneCount*100).toFixed(2)+'%';
        const inOff=daysBetween(w.start,b.checkIn),outOff=daysBetween(w.start,b.checkOut);
        const startsIn=inOff>=0,endsIn=outOff<=w.total-1;
        const left=startsIn?inOff*DW+Math.floor(DW/2):0,right=endsIn?outOff*DW+Math.floor(DW/2):w.total*DW,width=right-left-3;
        if(width<6)return;
        const nights=daysBetween(b.checkIn,b.checkOut),who=b.guestName?String(b.guestName):'Guest stay';
        const label=who+(width>=DW*2.2?' · '+platformName(b):'')+(width>=DW*3.2?' · '+nights+' night'+(nights===1?'':'s'):'');
        const range=fmtDateShort(b.checkIn)+' – '+fmtDateShort(b.checkOut);
        const status=b.status==='pending'?' is-pending':b.status==='blocked'||b.status==='owner'?' is-blocked':'';
        h+='<button type="button" class="jb-stay'+status+(startsIn?'':' clip-start')+(endsIn?'':' clip-end')+(calSelectedBk===b.id?' is-selected':'')+(laneCount>1?' is-lane':'')+'" data-bk-open="'+esc(b.id)+'" style="left:'+left+'px;width:'+width+'px;top:'+top+'" aria-label="'+esc(prop.name+' · '+who+' · '+platformName(b)+' · '+fmtDate(b.checkIn)+' to '+fmtDate(b.checkOut)+' · '+nights+' nights'+(b.status==='pending'?' · pending':''))+'">'
          +'<span class="jb-stay-label">'+esc(label)+(b.status==='pending'?' · pending':'')+'</span>'+(width>=DW*4.2?'<span class="jb-stay-dates">'+esc(range)+'</span>':'')+'</button>';
      });
      h+='</div></div>';
    });
    return h+'</div></div>';
  }
  function laneCountFor(stays){const lanes=[];stays.forEach(b=>{const i=lanes.findIndex(end=>end<=b.checkIn);if(i<0)lanes.push(b.checkOut);else lanes[i]=b.checkOut;});return Math.max(1,lanes.length);}
  function fmtDateShort(d){const o=parse(d);return o.getDate()+' '+o.toLocaleDateString('en-GB',{month:'short'});}
  function month(){return '<div class="jb-month">'+renderWorkspaceMonth()+'</div>';}
  /* Keep the horizontal position across ordinary rerenders; scroll to the focus date when it changes. */
  let lastFocus='',lastLeft=0,lastDayW=0;
  function render(host){
    if(!host)return;
    const prev=host.querySelector('[data-jb-scroll]');if(prev)lastLeft=prev.scrollLeft;
    host.innerHTML=toolbar()+'<div class="jb-body">'+(calView==='month'?month():timeline())+'</div>';
    const scroll=host.querySelector('[data-jb-scroll]');if(!scroll)return;
    const focus=scroll.dataset.focus;
    /* A new focus date scrolls to it; otherwise keep the same day in view, even if the day width changed with the screen. */
    if(focus!==lastFocus||!prev){lastFocus=focus;scroll.scrollLeft=Math.max(0,Math.round(daysBetween(scroll.dataset.start,focus)*dayW()-dayW()*1.5));}
    else scroll.scrollLeft=Math.round(lastDayW&&lastDayW!==dayW()?lastLeft/lastDayW*dayW():lastLeft);
    lastDayW=dayW();
    scroll.addEventListener('scroll',()=>updateTitle(host,scroll),{passive:true});updateTitle(host,scroll);
  }
  /* The heading follows the month in view while scrolling (no rerender). */
  function updateTitle(host,scroll){
    const title=host.querySelector('[data-jb-title]'),input=host.querySelector('[data-bk-month]');if(!title)return;
    const visible=addDays(scroll.dataset.start,Math.max(0,Math.round((scroll.scrollLeft+dayW()*1.5)/dayW()))),key=monthKey(visible);
    const text=monthLabel(key);if(title.textContent!==text)title.textContent=text;if(input&&document.activeElement!==input)input.value=key;
  }
  function visibleMonth(host){const s=host.querySelector('[data-jb-scroll]');return s?host.querySelector('[data-bk-month]')?.value||monthKey(windowFor().focus):monthKey(windowFor().focus);}
  function closeMenu(host){const m=host.querySelector('.jb-menu');if(m&&!m.hidden){m.hidden=true;host.querySelector('[data-bk="more"]')?.setAttribute('aria-expanded','false');}}
  /* One delegated listener per host; actions call the app's existing functions, which save and rerender as before. */
  function bind(host,{openPage}={}){
    if(!host||host.dataset.jbBound)return;host.dataset.jbBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-bk],[data-bk-open],[data-bk-tool],[data-bk-reset],[data-bk-lane]');if(!t)return;
      if(t.dataset.bk!=='more'&&!t.closest('.jb-menu'))closeMenu(host);
      if(t.dataset.bkOpen){selectTLBooking(t.dataset.bkOpen);return;}
      if(t.dataset.bkReset!==undefined){setCalendarFilter('all');return;}
      if(t.dataset.bkLane!==undefined){
        if(e.target.closest('.jb-stay'))return;const lane=t,rect=lane.getBoundingClientRect(),s=host.querySelector('[data-jb-scroll]');if(!s)return;
        const i=Math.floor((e.clientX-rect.left)/dayW()),date=addDays(s.dataset.start,Math.max(0,i));newBooking(date,lane.dataset.bkLane);return;
      }
      const a=t.dataset.bk;
      if(a==='prev'||a==='next'){const d=a==='prev'?-1:1;if(calView==='month')changeBookingMonth(d);else setTimelineMonth(shiftMonth(visibleMonth(host),d));return;}
      if(a==='today'){if(calView==='month')calendarThisMonth();else{lastFocus='';tlScrollToday();}return;}
      if(a==='create'){newBooking('','');return;}
      if(a==='more'){const m=host.querySelector('.jb-menu');m.hidden=!m.hidden;t.setAttribute('aria-expanded',String(!m.hidden));if(!m.hidden)m.querySelector('button')?.focus();return;}
      const tool=t.dataset.bkTool;closeMenu(host);
      if(tool==='import')openExcelImport();else if(tool==='cleaning')openAddSessModal();else if(tool==='event')openAddCalEvent(today());else if(tool==='share')showScheduleModal();
      else if(tool==='availability'){availabilityYear=calView==='month'?calY:Number((calTimelineDate||today()).slice(0,4));openPage?.('booking-availability');}
      else if(tool==='agenda')openPage?.('calendar-agenda');else if(tool==='events')openPage?.('calendar-events');
    });
    host.addEventListener('change',e=>{
      const t=e.target;
      if(t.matches?.('[data-bk-filter]'))setCalendarFilter(t.value);
      else if(t.matches?.('[data-bk-view]'))switchCalendarView(t.value);
      else if(t.matches?.('[data-bk-month]')&&MONTH_RE.test(t.value)){if(calView==='month'){const p=t.value.split('-').map(Number);calY=p[0];calM=p[1]-1;render_();}else setTimelineMonth(t.value);}
    });
    /* The day width follows the screen; redraw when it changes so stays stay aligned with their dates. */
    let resizeTimer=0;const onResize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(host.isConnected&&!host.hidden&&lastDayW&&lastDayW!==dayW())render(host);},150);};
    window.addEventListener('resize',onResize,{passive:true});
    host._jbCleanup=()=>{clearTimeout(resizeTimer);window.removeEventListener('resize',onResize);delete host.dataset.jbBound;};
    host.addEventListener('keydown',e=>{if(e.key==='Escape'&&host.querySelector('.jb-menu:not([hidden])')){e.stopPropagation();closeMenu(host);host.querySelector('[data-bk="more"]')?.focus();}});
  }
  const render_=()=>window.render();
  /* The real add-booking flow, with the day and property filled in when they are known. */
  function newBooking(date,propId){
    openAddBookingModal(date||undefined);
    const sel=document.getElementById('bk-prop'),pid=propId||(calFilter.startsWith('prop-')?calFilter.slice(5):'');
    if(sel&&pid&&D.props.some(p=>p.id===pid))sel.value=pid;
  }
  /* Booking details in the Jarvis theme: the same facts and the same existing actions as the workspace dialog. */
  function detail(b){
    const prop=D.props.find(p=>p.id===b.propId),nights=daysBetween(b.checkIn,b.checkOut),st=b.status||'confirmed';
    const status={confirmed:'Confirmed',pending:'Pending',cancelled:'Cancelled',blocked:'Blocked',owner:'Owner stay'}[st]||'Confirmed';
    const linked=b.linkedCleaningId?D.sessions.find(s=>s.id===b.linkedCleaningId):null;
    const id=JSON.stringify(b.id).replace(/"/g,'&quot;');
    const row=(k,v)=>'<dt>'+esc(k)+'</dt><dd>'+v+'</dd>';
    let money='';
    if(b._excel&&b._excel.priceUnknown)money='Price unknown';else if(b.totalPrice||b._excel)money='€'+Number(b.totalPrice||0).toLocaleString('en-GB',{maximumFractionDigits:2});
    let h='<div class="jv-modal"><small class="jv-label">Booking</small><div class="modal-title">'+esc(prop?prop.name:'Unknown property')+'</div>'
      +'<p class="jv-modal-sub">'+esc(platformName(b))+' · <span class="jv-status is-'+esc(st)+'">'+esc(status)+'</span></p>'
      +'<div class="jv-stay-range"><div><small class="jv-label">Check-in</small><b>'+esc(fmtFull(b.checkIn))+'</b>'+(b.checkInTime?'<span>'+esc(b.checkInTime)+'</span>':'')+'</div><i aria-hidden="true"></i>'
      +'<div><small class="jv-label">Check-out</small><b>'+esc(fmtFull(b.checkOut))+'</b>'+(b.checkOutTime?'<span>'+esc(b.checkOutTime)+'</span>':'')+'</div></div>'
      +'<dl class="jv-facts">'+row('Nights',String(nights))+(b.guestName?row('Guest',esc(b.guestName)):'')+(b.guestCount?row('Guests',esc(String(b.guestCount))):'')+(money?row('Total',esc(money)):'')
      +(st==='cancelled'?row('Money retained',esc(fmtRevenueAmount(bookingRevenueCents(b)/100))):'')
      +(linked?row('Cleaning',esc(fmtFull(linked.date))+(linked.time?' · '+esc(linked.time):'')):'')+'</dl>'
      +(b._excel&&b._excel.cleaningNeedsReview?'<p class="jv-note">Linked cleaning needs review after the Excel import. Check its date and assignment.</p>':'')
      +(b.notes?'<p class="jv-notes">'+esc(b.notes)+'</p>':'')
      +'<div class="jv-actions">'
      +(linked?'<button type="button" class="jv-btn" onclick="closeModal();openSess('+id+')">View cleaning</button>':st==='cancelled'?'':'<button type="button" class="jv-btn" onclick="scheduleCleanFromBooking('+id+')">Schedule cleaning</button>')
      +'<button type="button" class="jv-btn" onclick="openEditBooking('+id+')">Edit</button>'
      +(st!=='cancelled'?'<button type="button" class="jv-btn" onclick="cancelBooking('+id+')">Cancel booking</button>':'<button type="button" class="jv-btn" onclick="restoreBooking('+id+')">Restore</button>')
      +'</div><div class="jv-actions jv-actions-end"><button type="button" class="jv-btn jv-btn-danger" onclick="deleteBooking('+id+')">Delete</button><button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
    return h;
  }
  window.SV_BOOKINGS_VIEW={render,bind,detail};
})();
