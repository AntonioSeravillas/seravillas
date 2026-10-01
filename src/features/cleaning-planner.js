/* Cleaning calculations and manager planning view. No cloud requests. */
(function(root){
  function crew(session,cleaners){
    if(session&&session.crew){
      return {main:Array.isArray(session.crew.main)?session.crew.main.map(m=>({...m})):[],alinaSpots:Math.max(0,Number(session.crew.alinaSpots)||0),alinaStatus:session.crew.alinaStatus||'offered',...(session.crew.alinaCompletedAt?{alinaCompletedAt:session.crew.alinaCompletedAt}:{})};
    }
    const ids=[...new Set((session&&session.cleanerIds)||[])];
    return {main:ids.map(id=>({cleanerId:id,name:(cleaners.find(c=>c.id===id)||{}).name||'Former cleaner',status:'confirmed'})),alinaSpots:0,alinaStatus:'offered'};
  }
  function assignedIds(session,cleaners){
    const current=crew(session,cleaners);
    const ids=current.main.filter(m=>m.status!=='cancelled').map(m=>m.cleanerId).filter(Boolean);
    const alina=cleaners.find(c=>String(c.name||'').toLowerCase().trim()==='alina');
    if(alina&&current.alinaSpots>0&&current.alinaStatus!=='cancelled')ids.push(alina.id);
    return [...new Set(ids)];
  }
  function context(session,bookings){
    const active=bookings.filter(b=>b.propId===session.propId&&b.status!=='cancelled');
    const departure=active.find(b=>b.checkOut===session.date);
    const arrival=active.filter(b=>b.checkIn>=session.date).sort((a,b)=>a.checkIn.localeCompare(b.checkIn))[0];
    return {departure:departure?{date:departure.checkOut,time:departure.checkOutTime||'10:00'}:null,arrival:arrival?{date:arrival.checkIn,time:arrival.checkInTime||'16:00'}:null,sameDayArrival:!!arrival&&arrival.checkIn===session.date};
  }
  function checkouts(data,start,end,propId){
    return data.bookings.filter(b=>b.status!=='cancelled'&&b.checkOut>=start&&b.checkOut<=end&&(!propId||b.propId===propId)).map(b=>{
      const linked=data.sessions.find(s=>s.id===b.linkedCleaningId&&s.status!=='cancelled');
      if(linked&&linked.propId===b.propId&&linked.date===b.checkOut)return null;
      const candidates=data.sessions.filter(s=>s.propId===b.propId&&s.date===b.checkOut&&s.status!=='cancelled');
      return {bookingId:b.id,propId:b.propId,date:b.checkOut,time:b.checkOutTime||'10:00',kind:linked?'review':candidates.length?'link':'missing',linkedId:linked?linked.id:null,candidateIds:candidates.map(s=>s.id)};
    }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  }
  root.SV_CLEANING=Object.freeze({crew,assignedIds,context,checkouts});
})(typeof window!=='undefined'?window:globalThis);

function getCleaningAssignedCleanerIds(s){return SV_CLEANING.assignedIds(s,D.cleaners);}
function syncCleaningCleanerIds(s){s.cleanerIds=getCleaningAssignedCleanerIds(s);}
function setScheduleDate(value){
  if(!SV_EXCEL.validDate(value))return;
  schedWeekOffset=daysBetween(startOfWeek(),startOfWeek(value))/7;
  render();
}
function setScheduleView(value){if(value!=='villas'&&value!=='cleaners')return;schedView=value;render();}
function setScheduleProperty(value){if(value&&!D.props.some(p=>p.id===value))return;schedPropFilter=value;render();}
function cleaningContextHtml(s){
  const context=SV_CLEANING.context(s,D.bookings);
  return '<div class="cp-context">'
    +(context.departure?'<span>Check-out '+esc(context.departure.time)+'</span>':'')
    +(context.arrival?'<span'+(context.sameDayArrival?' class="cp-turnaround"':'')+'>Next arrival '+(context.sameDayArrival?'today':fmtDate(context.arrival.date))+' · '+esc(context.arrival.time)+'</span>':'<span>No next arrival booked</span>')
    +'</div>';
}
function cleaningStaffHtml(s){
  const crew=getCleaningCrew(s),main=crew.main.filter(m=>m.status!=='cancelled');
  return '<div class="cp-staff">'+main.map(m=>'<span>'+esc(m.name||((D.cleaners.find(c=>c.id===m.cleanerId)||{}).name)||'Cleaner')+' · '+(m.status==='confirmed'?'Confirmed':'Offered')+(m.completedAt?' · Work done':'')+'</span>').join('')
    +(crew.alinaSpots&&crew.alinaStatus!=='cancelled'?'<span>Alina team · '+crew.alinaSpots+' · '+esc(crew.alinaStatus)+(s.crew&&s.crew.alinaCompletedAt?' · Work done':'')+'</span>':'')
    +(!main.length&&(!crew.alinaSpots||crew.alinaStatus==='cancelled')?'<span>No team assigned</span>':'')+'</div>';
}
function renderCleaningPlanning(start,end,sessions){
  const pending=SV_CLEANING.checkouts(D,start,end,schedPropFilter);
  let h='<div class="cp-controls"><label>Week of <input type="date" aria-label="Cleaning schedule date" value="'+start+'" onchange="setScheduleDate(this.value)"></label>'
    +'<label>Villa <select aria-label="Cleaning schedule villa" onchange="setScheduleProperty(this.value)"><option value="">All villas</option>'+D.props.map(p=>'<option value="'+esc(p.id)+'"'+(schedPropFilter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'
    +'<div class="sv-tabs"><button class="sv-tab'+(schedView==='villas'?' active':'')+'" onclick="setScheduleView(\'villas\')">Daily plan</button><button class="sv-tab'+(schedView==='cleaners'?' active':'')+'" onclick="setScheduleView(\'cleaners\')">By cleaner</button></div></div>';
  if(pending.length){
    h+='<section class="cp-panel"><h3>Checkout cleanings to plan <span>'+pending.length+'</span></h3><p class="cp-help">Review existing sessions or schedule the missing cleaning.</p>';
    pending.forEach(item=>{
      h+='<div class="cp-pending"><div><strong>'+esc(propName(item.propId))+'</strong><div class="cp-help">'+fmtDate(item.date)+' · Check-out '+esc(item.time)+'</div><div class="cp-help">'+(item.kind==='review'?'Linked cleaning has a different date or villa':item.kind==='link'?'A cleaning exists but is not linked':'No checkout cleaning scheduled')+'</div></div>';
      if(item.kind==='missing')h+='<button class="sv-btn sv-btn-secondary sv-btn-sm" data-checkout-booking="'+esc(item.bookingId)+'" onclick="scheduleMissingCheckout(this.dataset.checkoutBooking)">Schedule cleaning</button>';
      else if(item.kind==='link'&&item.candidateIds.length===1)h+='<button class="sv-btn sv-btn-secondary sv-btn-sm" data-checkout-booking="'+esc(item.bookingId)+'" onclick="linkExistingCheckout(this.dataset.checkoutBooking)">Link existing cleaning</button>';
      else h+='<button class="sv-btn sv-btn-secondary sv-btn-sm" data-session="'+esc(item.linkedId||item.candidateIds[0])+'" onclick="openSess(this.dataset.session)">Review cleaning</button>';
      h+='</div>';
    });
    h+='</section>';
  }
  if(schedView!=='villas')return h;
  const days=Array.from({length:7},(_,i)=>addDays(start,i)).filter(date=>sessions.some(s=>s.date===date)||pending.some(item=>item.date===date));
  if(!days.length)return h+'<div class="sv-empty"><div class="sv-empty-title">No cleanings planned this week</div><div class="sv-empty-sub">Choose another week or add a cleaning session.</div></div>';
  h+='<div class="cp-days">';
  days.forEach(date=>{
    const daySessions=sessions.filter(s=>s.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    h+='<section class="cp-day"><h3>'+fmtFull(date)+'</h3>';
    if(!daySessions.length)h+='<p class="cp-help">No cleaning sessions planned.</p>';
    daySessions.forEach(s=>{
      const risk=getCleaningRisk(s),crew=getCleaningCrew(s);
      const offered=crew.main.filter(m=>m.status==='offered').length+(crew.alinaStatus==='offered'?crew.alinaSpots:0);
      h+='<article class="cp-card" data-cleaning="'+esc(s.id)+'" style="border-left-color:'+propBarColor(s.propId).border+'">'
        +'<div class="cp-card-head"><strong>'+esc(propName(s.propId))+'</strong><span>'+esc(s.time||'Time not set')+'</span></div>'
        +cleaningContextHtml(s)+cleaningStaffHtml(s)
        +'<div class="cp-coverage">'+(s.status==='done'?'Done':getConfirmedCrewCount(s)+'/'+getRequiredCleanersForProperty(s.propId)+' confirmed'+(offered?' · '+offered+' offered':'')+(getMissingCrewCount(s)?' · '+getMissingCrewCount(s)+' still needed':''))+'</div>'
        +(s.status!=='done'&&risk!=='normal'?'<div class="cp-alert">'+esc({critical:'Same-day arrival: team still needed',conflict:'A cleaner is assigned to another villa that day',backup_needed:'Team needed within the next three days'}[risk]||risk)+'</div>':'')
        +'<div class="cp-card-actions"><button class="sv-btn sv-btn-secondary sv-btn-sm" data-session="'+esc(s.id)+'" onclick="openCrewModal(this.dataset.session)">Assign team</button><button class="sv-btn sv-btn-ghost sv-btn-sm" data-session="'+esc(s.id)+'" onclick="openSess(this.dataset.session)">Details</button></div></article>';
    });
    h+='</section>';
  });
  return h+'</div>';
}
function currentCheckoutItem(id){
  const b=D.bookings.find(b=>b.id===id);if(!b||b.status==='cancelled')return null;
  return SV_CLEANING.checkouts(D,b.checkOut,b.checkOut,b.propId).find(item=>item.bookingId===id)||null;
}
function scheduleMissingCheckout(id){
  const item=currentCheckoutItem(id);if(!item||item.kind!=='missing'){toast('A cleaning already exists. Review the schedule.');return;}
  const b=D.bookings.find(b=>b.id===id),session={id:uid(),propId:item.propId,date:item.date,time:item.time,cleanerIds:[],status:'scheduled',note:'Checkout cleaning'};
  D.sessions.push(session);b.linkedCleaningId=session.id;
  save();render();openSess(session.id);toast('Checkout cleaning scheduled — assign the team');
}
function linkExistingCheckout(id){
  const item=currentCheckoutItem(id);if(!item||item.kind!=='link'||item.candidateIds.length!==1){toast('Review the existing cleaning first');return;}
  const b=D.bookings.find(b=>b.id===id);b.linkedCleaningId=item.candidateIds[0];save();render();toast('Checkout cleaning linked');
}
