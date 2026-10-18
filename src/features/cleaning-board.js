/* Jarvis-themed Cleanings page (classic script, after cleanings.js and cleaning-planner.js). Presentation only: it reads
   the same cleaning state the workspace uses (schedWeekOffset, schedView, schedPropFilter) and calls the existing helpers
   and actions (getCleaningCrew, getCleaningRisk, SV_CLEANING.checkouts, openCrewModal, openSess, scheduleMissingCheckout,
   linkExistingCheckout, openCleaningMessageModal, setStatus, ...). Rendering never assigns staff or creates cleanings.
   Values are escaped; no element ids, so nothing collides with the workspace page. */
(function(){
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={prev:'<path d="m15 18-6-6 6-6"/>',next:'<path d="m9 18 6-6-6-6"/>',down:'<path d="m6 9 6 6 6-6"/>',plus:'<path d="M12 5.5v13M5.5 12h13"/>',more:'<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="2.6"/>'};
  const parse=d=>{const p=d.split('-');return new Date(+p[0],+p[1]-1,+p[2]);};
  const q=v=>JSON.stringify(String(v)).replace(/"/g,'&quot;');
  const expanded=new Set();
  function week(){const start=addDays(startOfWeek(),schedWeekOffset*7);return {start,end:addDays(start,6)};}
  function rangeLabel(w){const a=parse(w.start),b=parse(w.end),sameMonth=a.getMonth()===b.getMonth();
    return a.getDate()+(sameMonth?'':' '+a.toLocaleDateString('en-GB',{month:'short'}))+' – '+b.getDate()+' '+b.toLocaleDateString('en-GB',{month:'short'})+' '+b.getFullYear();}
  function cleanerName(m){return m.name||((D.cleaners.find(c=>c.id===m.cleanerId)||{}).name)||'Cleaner';}
  /* Everything a row shows, from the existing helpers. Offered people are never counted or shown as confirmed. */
  function facts(s){
    const crew=getCleaningCrew(s),required=getRequiredCleanersForProperty(s.propId),confirmed=getConfirmedCrewCount(s),missing=getMissingCrewCount(s);
    const people=crew.main.filter(m=>m.status!=='cancelled').map(m=>({name:cleanerName(m),status:m.status==='confirmed'?'confirmed':'offered',done:!!m.completedAt}));
    const alina=crew.alinaSpots>0&&crew.alinaStatus!=='cancelled'?{spots:crew.alinaSpots,status:crew.alinaStatus==='confirmed'?'confirmed':'offered'}:null;
    const offered=people.filter(p=>p.status==='offered').length+(alina&&alina.status==='offered'?alina.spots:0);
    const ctx=SV_CLEANING.context(s,D.bookings),risk=s.status==='cancelled'||s.status==='done'?'normal':getCleaningRisk(s);
    let state='covered',label='Covered';
    if(s.status==='cancelled'){state='cancelled';label='Cancelled';}
    else if(s.status==='done'){state='done';label='Done';}
    else if(risk==='conflict'){state='alert';label='Conflict';}
    else if(risk==='critical'){state='alert';label='Same-day turnaround';}
    else if(!people.length&&!alina){state='alert';label='No team';}
    else if(missing>0&&offered>0&&confirmed===0){state='pending';label='Offered';}
    else if(missing>0){state='pending';label=risk==='backup_needed'?'Backup needed':'Team needed';}
    return {crew,required,confirmed,missing,offered,people,alina,ctx,risk,state,label};
  }
  function toolbar(){
    const w=week(),props=[['','All properties']].concat(D.props.map(p=>[p.id,p.name]));
    return '<header class="jb-head"><div class="jb-heading"><small class="jv-label">Cleanings</small><div class="jb-title"><h2 data-jc-title>'+esc(rangeLabel(w))+'</h2>'
      +'<label class="jb-month-pick" title="Go to week">'+svg(I.down,16)+'<span class="jarvis-sr">Go to the week of</span><input type="date" data-jc-date value="'+w.start+'"></label></div></div>'
      +'<label class="jv-select jb-filter"><span class="jarvis-sr">Villa</span><select data-jc-filter>'+props.map(([v,l])=>'<option value="'+esc(v)+'"'+(schedPropFilter===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+svg(I.down,14)+'</label>'
      +'<div class="jb-tools"><button type="button" class="jv-icon-btn" data-jc="prev" aria-label="Previous week">'+svg(I.prev)+'</button><button type="button" class="jv-btn'+(schedWeekOffset===0?' is-current':'')+'" data-jc="this-week"'+(schedWeekOffset===0?' aria-pressed="true"':'')+'>This week</button><button type="button" class="jv-icon-btn" data-jc="next" aria-label="Next week">'+svg(I.next)+'</button>'
      +'<label class="jv-select jb-view"><span class="jarvis-sr">Cleaning view</span><select data-jc-view><option value="villas"'+(schedView==='villas'?' selected':'')+'>Daily plan</option><option value="cleaners"'+(schedView==='cleaners'?' selected':'')+'>By cleaner</option></select>'+svg(I.down,14)+'</label>'
      +'<button type="button" class="jv-icon-btn" data-jc="create" aria-label="Add cleaning" title="Add cleaning">'+svg(I.plus)+'</button>'
      +'<div class="jb-more"><button type="button" class="jv-icon-btn" data-jc="more" aria-haspopup="true" aria-expanded="false" aria-label="More cleaning tools" title="More cleaning tools">'+svg(I.more,18)+'</button>'
      +'<div class="jv-menu jb-menu" role="menu" hidden>'+[['weekly','Group schedule message'],['alina','Alina spots message'],['urgent','Urgent backup message']].map(([a,l])=>'<button type="button" role="menuitem" data-jc-msg="'+a+'">'+esc(l)+'</button>').join('')
      +'<p class="jc-menu-note">Messages open for review and copying. Nothing is sent from here.</p></div></div></div></header>';
  }
  function summary(sessions){
    const active=sessions.filter(s=>s.status!=='cancelled'),need=active.filter(s=>s.status!=='done'&&getMissingCrewCount(s)>0).length;
    const conflicts=active.filter(s=>s.status!=='done'&&getCleaningRisk(s)==='conflict').length,offers=active.filter(s=>s.status!=='done'&&facts(s).offered>0).length;
    const parts=[active.length+' cleaning'+(active.length===1?'':'s')];
    if(need)parts.push('<em>'+need+' need'+(need===1?'s':'')+' team</em>');if(offers)parts.push(offers+' with open offers');if(conflicts)parts.push('<em>'+conflicts+' conflict'+(conflicts===1?'':'s')+'</em>');
    return '<p class="jc-summary">'+parts.join(' · ')+'</p>';
  }
  /* Missing checkout cleanings: compact, labelled, with the existing schedule / link / review actions. */
  function planning(w){
    const pending=SV_CLEANING.checkouts(D,w.start,w.end,schedPropFilter);if(!pending.length)return '';
    let h='<details class="jc-plan"'+(planOpen?' open':'')+' data-jc-plan><summary><span class="jc-plan-dot" aria-hidden="true"></span>Checkout cleanings to plan <b>'+pending.length+'</b><small>Review before the week starts</small></summary><ul>';
    pending.forEach(item=>{
      const what=item.kind==='review'?'Linked cleaning has a different date or villa':item.kind==='link'?'A cleaning exists but is not linked':'No checkout cleaning scheduled';
      const action=item.kind==='missing'?'<button type="button" class="jv-btn" data-jc-checkout="schedule" data-booking="'+esc(item.bookingId)+'">Schedule cleaning</button>'
        :item.kind==='link'&&item.candidateIds.length===1?'<button type="button" class="jv-btn" data-jc-checkout="link" data-booking="'+esc(item.bookingId)+'">Link existing</button>'
        :'<button type="button" class="jv-btn" data-jc-open="'+esc(item.linkedId||item.candidateIds[0])+'">Review</button>';
      h+='<li><span class="jc-plan-villa">'+esc(propName(item.propId))+'</span><span class="jc-plan-when">'+esc(fmtDate(item.date))+' · Check-out '+esc(item.time)+'</span><span class="jc-plan-what">'+esc(what)+'</span>'+action+'</li>';
    });
    return h+'</ul></details>';
  }
  let planOpen=true;
  function teamHtml(f){
    const chips=f.people.map(p=>'<span class="jc-member is-'+p.status+'">'+esc(p.name)+'<small>'+(p.status==='confirmed'?'Confirmed':'Offered')+(p.done?' · done':'')+'</small></span>');
    if(f.alina)chips.push('<span class="jc-member is-'+f.alina.status+'">Alina team ×'+f.alina.spots+'<small>'+(f.alina.status==='confirmed'?'Confirmed':'Offered')+'</small></span>');
    return chips.length?chips.join(''):'<span class="jc-member is-none">No team assigned</span>';
  }
  function row(s){
    const f=facts(s),open=expanded.has(s.id),c=f.ctx;
    const timing=[c.departure?'Check-out '+c.departure.time:'',c.arrival?(c.sameDayArrival?'Next arrival today · '+c.arrival.time:'Next arrival '+fmtDate(c.arrival.date)+' · '+c.arrival.time):'No next arrival booked'].filter(Boolean).join(' · ');
    const coverage=s.status==='cancelled'?'—':f.confirmed+'/'+f.required+' confirmed'+(f.offered?' · '+f.offered+' offered':'')+(f.missing&&s.status!=='done'?' · '+f.missing+' needed':'');
    let h='<li class="jc-row is-'+f.state+(open?' is-open':'')+'" data-session="'+esc(s.id)+'">'
      +'<button type="button" class="jc-main" data-jc-open="'+esc(s.id)+'" aria-label="'+esc(propName(s.propId)+', '+fmtFull(s.date)+(s.time?' at '+s.time:'')+', '+f.label+', '+coverage+'. Open details')+'">'
      +'<span class="jc-time">'+esc(s.time||'—')+'</span><span class="jc-villa"><b>'+esc(propName(s.propId))+'</b><small'+(c.sameDayArrival&&s.status!=='cancelled'?' class="is-turn"':'')+'>'+esc(timing)+'</small></span>'
      +'<span class="jc-team">'+teamHtml(f)+'</span><span class="jc-cover">'+esc(coverage)+'</span><span class="jc-state"><i aria-hidden="true"></i>'+esc(f.label)+'</span></button>'
      +'<button type="button" class="jv-icon-btn jc-expand" data-jc-expand="'+esc(s.id)+'" aria-expanded="'+open+'" aria-label="'+(open?'Hide':'Show')+' more for '+esc(propName(s.propId))+'">'+svg(I.down,15)+'</button>';
    if(open){
      const alinaFree=getAlinaRemainingSpotsForDate(s.date);
      h+='<div class="jc-more"><dl>'
        +'<dt>Crew needed</dt><dd>'+f.required+' (confirmed '+f.confirmed+(f.offered?', '+f.offered+' offered':'')+')</dd>'
        +'<dt>Alina capacity</dt><dd>'+alinaFree+' of '+ALINA_MAX_SPOTS_PER_DAY+' spots free that day</dd>'
        +(f.risk==='conflict'?'<dt>Conflict</dt><dd>A cleaner is assigned to another villa that day</dd>':'')
        +(f.risk==='critical'?'<dt>Turnaround</dt><dd>Guests arrive the same day and the team is incomplete</dd>':'')
        +(s.note?'<dt>Note</dt><dd>'+esc(s.note)+'</dd>':'')+'</dl>'
        +'<div class="jc-more-actions">'+(s.status==='cancelled'?'':'<button type="button" class="jv-btn jv-btn-primary" data-jc-crew="'+esc(s.id)+'">Assign team</button>')+'<button type="button" class="jv-btn" data-jc-open="'+esc(s.id)+'">Details</button></div></div>';
    }
    return h+'</li>';
  }
  function dailyPlan(w,sessions){
    const pending=SV_CLEANING.checkouts(D,w.start,w.end,schedPropFilter),td=today();
    const days=Array.from({length:7},(_,i)=>addDays(w.start,i)).filter(d=>sessions.some(s=>s.date===d)||pending.some(p=>p.date===d));
    if(!days.length)return '<div class="jb-empty"><p>No cleanings planned this week.</p><small>Choose another week, change the villa filter or add a cleaning.</small><button type="button" class="jv-btn" data-jc="create">Add cleaning</button></div>';
    const order=s=>(s.status==='cancelled'?1:0);
    let h='<div class="jc-days">';
    days.forEach(d=>{
      const list=sessions.filter(s=>s.date===d).sort((a,b)=>order(a)-order(b)||(a.time||'99:99').localeCompare(b.time||'99:99'));
      const o=parse(d),gaps=pending.filter(p=>p.date===d&&p.kind==='missing').length;
      h+='<section class="jc-day'+(d===td?' is-today':'')+'"><h3><span>'+esc(o.toLocaleDateString('en-GB',{weekday:'long'}))+'</span>'+esc(o.toLocaleDateString('en-GB',{day:'numeric',month:'long'}))+(d===td?'<em>Today</em>':'')+(gaps?'<small>'+gaps+' checkout cleaning'+(gaps===1?'':'s')+' to plan</small>':'')+'</h3>';
      h+=list.length?'<ul class="jc-list">'+list.map(row).join('')+'</ul>':'<p class="jc-none">No cleaning sessions yet.</p>';
      h+='</section>';
    });
    return h+'</div>';
  }
  /* By cleaner: one row per team member, each assignment with that person's own status. */
  function byCleaner(w,sessions){
    const days=Array.from({length:7},(_,i)=>addDays(w.start,i)),td=today(),active=sessions.filter(s=>s.status!=='cancelled');
    let h='<div class="jc-grid-wrap"><table class="jc-grid"><thead><tr><th scope="col" class="jc-who">Team</th>'+days.map(d=>{const o=parse(d);return '<th scope="col"'+(d===td?' class="is-today"':'')+'><small>'+esc(o.toLocaleDateString('en-GB',{weekday:'short'}).toUpperCase())+'</small><b>'+o.getDate()+'</b></th>';}).join('')+'</tr></thead><tbody>';
    const cell=(s,status)=>'<button type="button" class="jc-chip is-'+status+'" data-jc-open="'+esc(s.id)+'"><b>'+esc(propName(s.propId))+'</b><small>'+esc(s.time||'Time not set')+' · '+(s.status==='done'?'Done':status==='confirmed'?'Confirmed':'Offered')+'</small></button>';
    D.cleaners.forEach(c=>{
      const isAlina=String(c.name||'').toLowerCase().trim()==='alina';
      h+='<tr><th scope="row" class="jc-who">'+esc(c.name)+'</th>'+days.map(d=>{
        const items=active.filter(s=>s.date===d).map(s=>{const cr=getCleaningCrew(s);
          if(isAlina)return cr.alinaSpots>0&&cr.alinaStatus!=='cancelled'?cell(s,cr.alinaStatus==='confirmed'?'confirmed':'offered'):'';
          const m=cr.main.find(m=>m.cleanerId===c.id&&m.status!=='cancelled');return m?cell(s,m.status==='confirmed'?'confirmed':'offered'):'';}).join('');
        return '<td'+(d===td?' class="is-today"':'')+'>'+(items||'<span class="jc-free" aria-label="Free">·</span>')+'</td>';}).join('')+'</tr>';
    });
    const open=active.filter(s=>s.status!=='done'&&!getCleaningAssignedCleanerIds(s).length);
    if(open.length)h+='<tr class="jc-unassigned"><th scope="row" class="jc-who">No team</th>'+days.map(d=>'<td>'+open.filter(s=>s.date===d).map(s=>'<button type="button" class="jc-chip is-none" data-jc-open="'+esc(s.id)+'"><b>'+esc(propName(s.propId))+'</b><small>'+esc(s.time||'Time not set')+' · team needed</small></button>').join('')+'</td>').join('')+'</tr>';
    return h+'</tbody></table></div>';
  }
  function render(host){
    if(!host)return;const w=week();
    const sessions=D.sessions.filter(s=>s.date>=w.start&&s.date<=w.end&&(!schedPropFilter||s.propId===schedPropFilter));
    const plan=host.querySelector('[data-jc-plan]');if(plan)planOpen=plan.open;
    const scroller=host.querySelector('.jc-body'),top=scroller?scroller.scrollTop:0;
    host.innerHTML=toolbar()+'<div class="jc-body">'+summary(sessions)+planning(w)+(schedView==='cleaners'?byCleaner(w,sessions):dailyPlan(w,sessions))+'</div>';
    const body=host.querySelector('.jc-body');if(body&&scroller)body.scrollTop=top;
  }
  function closeMenu(host){const m=host.querySelector('.jb-menu');if(m&&!m.hidden){m.hidden=true;host.querySelector('[data-jc="more"]')?.setAttribute('aria-expanded','false');}}
  function bind(host){
    if(!host||host.dataset.jcBound)return;host.dataset.jcBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-jc],[data-jc-open],[data-jc-expand],[data-jc-crew],[data-jc-checkout],[data-jc-msg]');if(!t)return;
      if(t.dataset.jc!=='more'&&!t.closest('.jb-menu'))closeMenu(host);
      if(t.dataset.jcOpen){openSess(t.dataset.jcOpen);return;}
      if(t.dataset.jcCrew){openCrewModal(t.dataset.jcCrew);return;}
      if(t.dataset.jcExpand){const id=t.dataset.jcExpand;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render(host);host.querySelector('[data-jc-expand="'+CSS.escape(id)+'"]')?.focus();return;}
      if(t.dataset.jcCheckout){if(t.dataset.jcCheckout==='schedule')scheduleMissingCheckout(t.dataset.booking);else linkExistingCheckout(t.dataset.booking);return;}
      if(t.dataset.jcMsg){closeMenu(host);openCleaningMessageModal(t.dataset.jcMsg);return;}
      const a=t.dataset.jc;
      if(a==='prev'){schedWeekOffset--;window.render();return;}
      if(a==='next'){schedWeekOffset++;window.render();return;}
      if(a==='this-week'){schedWeekOffset=0;window.render();return;}
      if(a==='create'){openAddSessModal();const sel=document.getElementById('f-prop');if(sel&&schedPropFilter)sel.value=schedPropFilter;const d=document.getElementById('f-date');const w=week();if(d&&schedWeekOffset!==0)d.value=w.start<today()?today():w.start;return;}
      if(a==='more'){const m=host.querySelector('.jb-menu');m.hidden=!m.hidden;t.setAttribute('aria-expanded',String(!m.hidden));if(!m.hidden)m.querySelector('button')?.focus();}
    });
    host.addEventListener('change',e=>{
      const t=e.target;
      if(t.matches?.('[data-jc-filter]'))setScheduleProperty(t.value);
      else if(t.matches?.('[data-jc-view]'))setScheduleView(t.value);
      else if(t.matches?.('[data-jc-date]')&&t.value)setScheduleDate(t.value);
    });
    host.addEventListener('toggle',e=>{if(e.target.matches?.('[data-jc-plan]'))planOpen=e.target.open;},true);
    host.addEventListener('keydown',e=>{if(e.key==='Escape'&&host.querySelector('.jb-menu:not([hidden])')){e.stopPropagation();closeMenu(host);host.querySelector('[data-jc="more"]')?.focus();}});
  }
  /* Cleaning details in the Jarvis theme: the same actions as the workspace dialog, with each person's real status. */
  function detail(s){
    const f=facts(s),prop=D.props.find(p=>p.id===s.propId),id=q(s.id),c=f.ctx;
    const row=(k,v)=>'<dt>'+esc(k)+'</dt><dd>'+v+'</dd>';
    let h='<div class="jv-modal"><small class="jv-label">Cleaning</small><div class="modal-title">'+esc(prop?prop.name:'Session')+'</div>'
      +'<p class="jv-modal-sub">'+esc(fmtFull(s.date))+(s.time?' · '+esc(s.time):'')+' · <span class="jv-status jc-status-'+esc(f.state)+'">'+esc(f.label)+'</span></p>'
      +'<dl class="jv-facts">'+row('Crew',f.confirmed+' of '+f.required+' confirmed'+(f.offered?' · '+f.offered+' offered':'')+(f.missing&&s.status!=='done'&&s.status!=='cancelled'?' · '+f.missing+' still needed':''))
      +(c.departure?row('Check-out',esc(c.departure.time)):'')+row('Next arrival',c.arrival?(c.sameDayArrival?'Today · ':esc(fmtDate(c.arrival.date))+' · ')+esc(c.arrival.time):'None booked')
      +(f.risk==='conflict'?row('Conflict','A cleaner is assigned to another villa that day'):'')+'</dl>'
      +'<small class="jv-label">Team</small><div class="jc-team jc-team-dialog">'+teamHtml(f)+'</div>'
      +(s.note?'<p class="jv-notes">'+esc(s.note)+'</p>':'')
      +(prop&&prop.notes&&prop.notes.trim()?'<small class="jv-label">Property notes</small><p class="jv-notes">'+esc(prop.notes)+'</p>':'')
      +'<div class="jv-actions">'+(s.status==='cancelled'?'':'<button type="button" class="jv-btn jv-btn-primary" onclick="openCrewModal('+id+')">Assign team</button>')
      +'<button type="button" class="jv-btn" onclick="openSessEdit('+id+')">Edit</button>'
      +(s.status!=='done'?'<button type="button" class="jv-btn" onclick="setStatus('+id+',\'done\')">Mark done</button>':'')
      +(s.status!=='cancelled'?'<button type="button" class="jv-btn" onclick="setStatus('+id+',\'cancelled\')">Cancel cleaning</button>':'')
      +(s.status!=='scheduled'?'<button type="button" class="jv-btn" onclick="setStatus('+id+',\'scheduled\')">Reschedule</button>':'')
      +'</div><div class="jv-actions jv-actions-end"><button type="button" class="jv-btn jv-btn-danger" onclick="delSess('+id+')">Delete</button><button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
    return h;
  }
  /* Team assignment in the Jarvis theme. Same rules and mutations as the workspace dialog: crewAddMain (adds as
     offered), crewSetMainStatus, crewRemoveMain, crewSetAlina; conflicts and Alina capacity are enforced there. */
  function crewDialog(s){
    const f=facts(s),crew=f.crew,id=q(s.id),prop=D.props.find(p=>p.id===s.propId);
    const usedOthers=D.sessions.filter(x=>x.id!==s.id&&x.date===s.date&&x.status!=='cancelled').reduce((n,x)=>{const c=getCleaningCrew(x);return n+(c.alinaSpots>0&&c.alinaStatus!=='cancelled'?c.alinaSpots:0);},0);
    const maxHere=Math.max(0,ALINA_MAX_SPOTS_PER_DAY-usedOthers);
    const btn=(label,call,extra='')=>'<button type="button" class="jv-btn'+extra+'" onclick="'+call+'">'+esc(label)+'</button>';
    let h='<div class="jv-modal jc-crew"><small class="jv-label">Assign team</small><div class="modal-title">'+esc(prop?prop.name:'Session')+'</div>'
      +'<p class="jv-modal-sub">'+esc(fmtFull(s.date))+(s.time?' · '+esc(s.time):'')+'</p>'
      +'<div class="jc-coverage"><span><b>'+f.confirmed+'/'+f.required+'</b> confirmed</span>'+(f.offered?'<span>'+f.offered+' offered</span>':'')+(f.missing?'<span class="is-need">'+f.missing+' still needed</span>':'<span>Crew complete</span>')+'<span class="jv-status jc-status-'+esc(f.state)+'">'+esc(f.label)+'</span></div>'
      +'<small class="jv-label">Main cleaners</small><ul class="jc-crew-list">';
    getMainCleanerNames().forEach(nm=>{
      const db=D.cleaners.find(c=>String(c.name||'').toLowerCase().trim()===nm),display=db?db.name:nm,cid=db?db.id:'name_'+nm;
      const assigned=crew.main.find(m=>String(m.name||'').toLowerCase().trim()===nm);const n=q(nm);
      h+='<li><span class="jc-crew-name">'+esc(display)+'</span>';
      if(!assigned){h+=getCleanerDailyConflict(cid,s.date,s.id)?'<span class="jc-crew-note">Assigned elsewhere this day</span>':'<span class="jc-crew-status">Not assigned</span><span class="jc-crew-actions">'+btn('Offer','crewAddMain('+id+','+n+')')+'</span>';}
      else{
        h+='<span class="jc-crew-status is-'+esc(assigned.status)+'">'+esc(assigned.status.charAt(0).toUpperCase()+assigned.status.slice(1))+'</span><span class="jc-crew-actions">';
        if(assigned.status!=='offered')h+=btn('Offered','crewSetMainStatus('+id+','+n+',\'offered\')');
        if(assigned.status!=='confirmed')h+=btn('Confirm','crewSetMainStatus('+id+','+n+',\'confirmed\')',' jv-btn-primary');
        if(assigned.status!=='cancelled')h+=btn('Cancel','crewSetMainStatus('+id+','+n+',\'cancelled\')');
        h+=btn('Remove','crewRemoveMain('+id+','+n+')')+'</span>';
      }
      h+='</li>';
    });
    h+='</ul><small class="jv-label">Alina team</small><div class="jc-alina"><p>'+maxHere+' of '+ALINA_MAX_SPOTS_PER_DAY+' spots free this day'+(usedOthers?' (other villas use '+usedOthers+')':'')+'</p>'
      +'<div class="jc-seg" role="group" aria-label="Alina spots">'+[0,1,2,3,4].map(n=>'<button type="button" class="jc-seg-btn'+(crew.alinaSpots===n?' is-on':'')+(n>maxHere&&crew.alinaSpots!==n?' is-over':'')+'" aria-pressed="'+(crew.alinaSpots===n)+'"'+(n>maxHere&&crew.alinaSpots!==n?' title="Exceeds the day\'s capacity"':'')+' onclick="crewSetAlina('+id+','+n+',null)">'+n+'</button>').join('')+'</div>';
    if(crew.alinaSpots>0)h+='<div class="jc-seg" role="group" aria-label="Alina status">'+['offered','confirmed','cancelled'].map(st=>'<button type="button" class="jc-seg-btn'+(crew.alinaStatus===st?' is-on':'')+'" aria-pressed="'+(crew.alinaStatus===st)+'" onclick="crewSetAlina('+id+',null,\''+st+'\')">'+st.charAt(0).toUpperCase()+st.slice(1)+'</button>').join('')+'</div>';
    if(crew.alinaSpots>maxHere)h+='<p class="jv-note">These spots exceed the day\'s remaining capacity.</p>';
    return h+'</div><div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="openSess('+id+')">Details</button><button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Done</button></div></div>';
  }
  window.SV_CLEANINGS_VIEW={render,bind,detail,crewDialog,facts};
})();
