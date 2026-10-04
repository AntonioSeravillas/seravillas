/* Read-only projections of existing bookings and cleaning records. All edits use the original planner actions. */
function bookingOperationsWindow(){
  const month=calView==='month'?calY+'-'+pad(calM+1):(calTimelineDate||today()).slice(0,7);
  const parts=month.split('-'),year=Number(parts[0]),index=Number(parts[1])-1;
  return {start:month+'-01',end:month+'-'+pad(new Date(year,index+1,0).getDate()),label:new Date(year,index,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})};
}
function bookingOperations(){
  const range=bookingOperationsWindow(),propId=calFilter.startsWith('prop-')?calFilter.slice(5):'';
  const sessions=D.sessions.filter(s=>s.status!=='cancelled'&&s.date>=range.start&&s.date<=range.end&&(!propId||s.propId===propId)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')||propName(a.propId).localeCompare(propName(b.propId)));
  const crewNeeds=sessions.filter(s=>s.status!=='done'&&getMissingCrewCount(s)>0);
  const attention=sessions.filter(s=>s.status!=='done'&&(getMissingCrewCount(s)>0||getCleaningRisk(s)==='conflict'));
  const checkouts=SV_CLEANING.checkouts(D,range.start,range.end,propId);
  const sameDay=attention.filter(s=>SV_CLEANING.context(s,D.bookings).sameDayArrival).length;
  const items=sessions.map(s=>({date:s.date,time:s.time||'',session:s})).concat(checkouts.map(c=>({date:c.date,time:c.time||'',checkout:c}))).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  return {range,propId,sessions,crewNeeds,attention,checkouts,sameDay,items};
}
function operationsSessionStatus(s){
  const state=getCleaningCrewStatus(s);
  if(state==='done')return {label:'Done',tone:'covered'};
  if(getCleaningRisk(s)==='conflict')return {label:'Team conflict',tone:'attention'};
  if(state==='fully_covered')return {label:'Covered',tone:'covered'};
  if(state==='waiting_confirmation')return {label:'Awaiting confirmation',tone:'attention'};
  if(state==='unassigned')return {label:'Needs a team',tone:'attention'};
  return {label:getConfirmedCrewCount(s)+' / '+getRequiredCleanersForProperty(s.propId)+' confirmed',tone:'attention'};
}
function operationsTeamLabel(s){
  const crew=getCleaningCrew(s),names=crew.main.filter(m=>m.status!=='cancelled').map(m=>m.name||((D.cleaners.find(c=>c.id===m.cleanerId)||{}).name)||'Cleaner');
  if(crew.alinaSpots>0&&crew.alinaStatus!=='cancelled')names.push('Alina team · '+crew.alinaSpots);
  return names.length?names.join(', '):'No team assigned';
}
function renderOperationsNotice(data){
  const count=data.attention.length+data.checkouts.length;
  const title=count?'Cleaning needs attention':'No cleaning gaps';
  let details=data.range.label+' · '+calendarFilterLabel();
  if(data.crewNeeds.length)details+=' · '+data.crewNeeds.length+' need team coverage';
  const missing=data.checkouts.filter(c=>c.kind==='missing').length,linking=data.checkouts.length-missing;
  if(missing)details+=' · '+missing+' checkout'+(missing===1?'':'s')+' to plan';
  if(linking)details+=' · '+linking+' checkout link'+(linking===1?'':'s')+' to review';
  const conflicts=data.attention.filter(s=>getCleaningRisk(s)==='conflict').length;
  if(conflicts)details+=' · '+conflicts+' team conflict'+(conflicts===1?'':'s');
  if(data.sameDay)details+=' · '+data.sameDay+' same-day arrival'+(data.sameDay===1?'':'s');
  if(!count)details+=' · '+(data.sessions.length?data.sessions.length+' scheduled cleaning'+(data.sessions.length===1?'':'s'):'No cleanings scheduled');
  return '<section class="ops-notice'+(count?' needs-attention':'')+'" aria-label="Cleaning coverage"><span class="ops-notice-icon">'+workspaceIcon('cleaning')+'</span><div><strong>'+title+'</strong><p>'+esc(details)+'</p></div><button class="sv-btn sv-btn-secondary" onclick="'+(count?'openBookingOperations()':'openOperationsSchedule()')+'">'+(count?'Review coverage':'Open schedule')+workspaceIcon('arrow')+'</button></section>';
}
function operationsRow(item,dialog){
  const s=item.session,c=item.checkout,pId=s?s.propId:c.propId,colour=propBarColor(pId);
  const status=s?operationsSessionStatus(s):{label:c.kind==='missing'?'Not scheduled':'Link to checkout',tone:'attention'};
  const context=s?SV_CLEANING.context(s,D.bookings):null;
  const windowText=context?(context.departure?'Checkout '+context.departure.time:'Start '+(s.time||'not set'))+(context.arrival?' · Arrival '+(context.sameDayArrival?'same day':fmtDate(context.arrival.date))+' '+context.arrival.time:''):'Checkout '+(c.time||'10:00');
  let action,label;
  if(s){action='closeModal();'+(status.tone==='attention'?'openCrewModal':'openSessModal')+'(\''+s.id+'\')';label=status.tone==='attention'?'Assign team':'Details';}
  else if(c.kind==='missing'){action='closeModal();scheduleMissingCheckout(\''+c.bookingId+'\')';label='Plan cleaning';}
  else if(c.kind==='link'){action='closeModal();linkExistingCheckout(\''+c.bookingId+'\')';label='Link cleaning';}
  else{action='closeModal();openSessModal(\''+(c.linkedId||c.candidateIds[0])+'\')';label='Review cleaning';}
  return '<div class="ops-row'+(dialog?' ops-dialog-row':'')+'"><span class="ops-villa-icon" style="--ops-villa-bg:'+colour.bg+';--ops-villa-text:'+colour.text+'">'+workspaceIcon('property')+'</span><div class="ops-row-villa"><strong>'+esc(propName(pId))+'</strong><small>'+esc(fmtDate(item.date))+' · '+esc(windowText)+'</small></div><div class="ops-row-team"><span>'+esc(s?operationsTeamLabel(s):'Checkout cleaning to plan')+'</span><small class="ops-status '+status.tone+'">'+status.label+'</small></div><button class="sv-btn sv-btn-secondary sv-btn-sm" aria-label="'+esc(label+' for '+propName(pId)+' on '+fmtDate(item.date))+'" onclick="'+action+'">'+label+'</button></div>';
}
function renderOperationsList(data){
  let h='<section class="ops-panel ops-cleaning"><div class="ops-panel-head"><div><h2>Cleaning this month</h2><p>'+esc(data.range.label)+' · '+data.sessions.length+' scheduled</p></div><button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openOperationsSchedule()">Open schedule'+workspaceIcon('arrow')+'</button></div>';
  if(!data.items.length)h+='<div class="ops-empty">No cleaning sessions or checkouts in this month. <button class="sv-btn sv-btn-secondary" onclick="openAddSessModal()">Plan cleaning</button></div>';
  else{
    const upcoming=data.items.filter(item=>item.date>=today()),past=data.items.filter(item=>item.date<today()).reverse();
    h+=upcoming.concat(past).slice(0,6).map(item=>operationsRow(item,false)).join('');
    if(data.items.length>6)h+='<button class="ops-more" onclick="openOperationsSchedule()">Continue in the cleaning planner</button>';
  }
  return h+'</section>';
}
function openBookingOperations(){
  const data=bookingOperations();
  let h='<div class="modal-title">Cleaning coverage</div><p class="settings-help">'+esc(data.range.label)+' · '+esc(calendarFilterLabel())+'. Assign a team, check confirmations or plan a checkout cleaning.</p>';
  const items=data.items.filter(item=>item.checkout||data.attention.includes(item.session));
  h+=items.length?items.map(item=>operationsRow(item,true)).join(''):'<p class="settings-help">No cleaning gaps in this month.</p>';
  showModal(h);
}
function openOperationsSchedule(){
  const data=bookingOperations(),month=today().slice(0,7);
  setScheduleDate(data.range.start.slice(0,7)===month?today():data.range.start);
  schedPropFilter=data.propId;schedView='villas';workspaceNavigate('cleaning');
}
