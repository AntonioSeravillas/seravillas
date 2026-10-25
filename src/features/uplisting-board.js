/* Jarvis-themed Uplisting 2027 preview (classic script, after src/imports/uplisting-bookings.js). Opened from Settings.
   It asks the existing Cloudflare service (manager key, as for cloud sync) for a read-only retrieval and shows what a
   later approved import would do, using SV_UPLISTING.plan over the current app records. Import and continuous sync are
   not available in this release: nothing here changes Uplisting, bookings, villas, cleanings, tasks or messages.
   Property mapping choices and match decisions stay in this browser only (never in app data or cloud sync). */
(function(){
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const KIND={review:'Needs review',new:'New',update:'Possible update',cancelled:'Cancelled in Uplisting',unchanged:'Unchanged',excluded:'Excluded'};
  const ORDER=['review','new','update','cancelled','unchanged'];
  const FIELD={checkIn:'Arrival',checkOut:'Departure',guestCount:'Guests',status:'Status'};
  const st={status:null,statusError:'',loading:false,response:null,error:'',decisions:{},filter:'attention',source:null};
  const MAP_KEY=()=>(typeof DB==='string'?DB:'seravillas_v1')+'_uplistingMappings';
  function mappings(){try{return JSON.parse(SV_STORAGE.getItem(MAP_KEY())||'{}')||{};}catch{return {};}}
  function saveMappings(m){try{SV_STORAGE.setItem(MAP_KEY(),JSON.stringify(m));}catch{}}
  const e=v=>typeof esc==='function'?esc(v):String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?Number(v.slice(8))+' '+MONTHS[Number(v.slice(5,7))-1]+' '+v.slice(0,4):'date missing';
  const when=iso=>{const d=new Date(iso);if(!iso||!Number.isFinite(d.getTime()))return '';const tz=typeof BUSINESS!=='undefined'&&BUSINESS.timeZone||'Europe/Madrid';
    try{return new Intl.DateTimeFormat('en-GB',{timeZone:tz,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}catch{return d.toISOString().slice(0,16).replace('T',' ');}};
  const nights=r=>Math.round((Date.parse(r.checkOut+'T12:00:00Z')-Date.parse(r.checkIn+'T12:00:00Z'))/864e5);
  const money=(a,cur)=>a.state==='missing'?'not provided':a.state==='unknown'?'unknown':(cur?e(cur)+' ':'')+Number(a.value).toFixed(2);
  const villa=id=>(D.props||[]).find(p=>p.id===id)?.name||'Unknown villa';
  const booking=id=>(D.bookings||[]).find(b=>b.id===id);
  /* Production: the existing Worker with the manager key, as cloud sync does. Local preview: no request at all unless a
     fictional source is supplied (tests/browser checks). */
  async function call(path){
    if(st.source)return st.source(path);
    if(typeof DEV_MODE!=='undefined'&&DEV_MODE)throw new Error('Local preview: the Uplisting connection runs only in the cloud service, so no request was made.');
    if(typeof SYNC_URL==='undefined'||typeof SYNC_SECRET==='undefined'||!SYNC_URL||!SYNC_SECRET)throw new Error('Sign in to cloud sync first. The Uplisting connection uses the same manager access.');
    let res;try{res=await cloudFetch(SYNC_URL+path,{method:'GET',headers:{'X-Secret':SYNC_SECRET}});}catch{throw new Error('The cloud service could not be reached. Check the internet connection.');}
    let body=null;try{body=await res.json();}catch{}
    if(!body||body.service!=='uplisting'){if(res.status===401)throw new Error('The cloud service did not accept this device’s manager access.');throw new Error('The cloud service has not been updated for Uplisting yet.');}
    if(!res.ok&&body.error)throw new Error(typeof body.error==='string'?body.error:body.error.message);
    return body;
  }
  async function loadStatus(host){
    st.statusError='';
    try{st.status=await call('/api/uplisting/status');}catch(error){st.status=null;st.statusError=error.message;}
    render(host);
  }
  async function retrieve(host){
    if(st.loading)return;st.loading=true;st.error='';render(host);
    try{const body=await call('/api/uplisting/preview?year=2027');st.response=body;if(!body.ok)st.error=body.error?.message||'The retrieval failed.';
      st.status={...(st.status||{}),configured:body.configured!==false,lastAttemptAt:body.retrievedAt||'',lastSuccessAt:body.lastSuccessAt||st.status?.lastSuccessAt||'',lastOutcome:!body.ok?'failed':body.complete?'complete':'incomplete'};}
    catch(error){st.error=error.message;st.response=null;}
    st.loading=false;render(host);
  }
  function statusHtml(){
    const s=st.status;
    if(st.statusError)return '<p class="ju-line is-warn">'+e(st.statusError)+'</p>';
    if(!s)return '<p class="ju-line">Checking the connection…</p>';
    if(!s.configured)return '<p class="ju-line is-warn">Not connected: the Uplisting API key has not been added to the cloud service yet.</p>';
    const outcome={complete:'Last retrieval was complete.',incomplete:'Last retrieval was incomplete.',failed:'Last retrieval failed.',auth_failed:'Uplisting did not accept the API key at the last retrieval.'}[s.lastOutcome]||'No retrieval yet.';
    return '<p class="ju-line">Connected through the cloud service · read-only · sync off</p><p class="ju-line">'+e(outcome)+(s.lastSuccessAt?' Last successful retrieval: '+e(when(s.lastSuccessAt))+'.':' No successful retrieval yet.')+'</p>';
  }
  function mappingHtml(p){
    const props=D.props||[],sel=p.state==='ignored'?'@ignore':p.propId;
    const basis={exact:'Exact name match — suggested',likely:'Likely match — choose to confirm',uncertain:'Several possible villas — choose one',none:'No matching villa — choose one'}[p.suggestion.basis];
    const state=p.state==='chosen'?'Chosen by you':p.state==='ignored'?'Excluded by you':p.state==='conflict'?'Two listings point to this villa':basis;
    const hint=p.suggestion.basis==='likely'||p.suggestion.basis==='uncertain'?' · possible: '+p.suggestion.candidates.map(id=>e(villa(id))).join(', '):'';
    return '<div class="ju-map'+(p.propId&&p.state!=='conflict'?'':' is-open')+'"><div><strong>'+e(p.name||'Unnamed listing')+'</strong>'+(p.nickname&&p.nickname!==p.name?' <span>('+e(p.nickname)+')</span>':'')+'<small>Uplisting listing ID '+e(p.id)+(p.incomplete?' · retrieval incomplete':'')+'</small></div>'
      +'<label><span class="ju-sr">Seravillas villa for '+e(p.name)+'</span><select data-up-map="'+e(p.id)+'"><option value="">Choose a villa…</option>'+props.map(v=>'<option value="'+e(v.id)+'"'+(sel===v.id?' selected':'')+'>'+e(v.name)+' · ID '+e(v.id)+'</option>').join('')+'<option value="@ignore"'+(sel==='@ignore'?' selected':'')+'>Not one of these villas</option></select></label>'
      +'<small class="ju-basis'+(p.state==='conflict'||!p.propId&&p.state!=='ignored'?' is-warn':'')+'">'+e(state)+hint+'</small></div>';
  }
  function rowHtml(row){
    const r=row.r,b=row.bookingId?booking(row.bookingId):null,cur=r.currency||'';
    const title=(row.propId?villa(row.propId):r.propertyName||'Unmapped listing')+' · '+(r.guestName||'Guest name missing');
    const n=nights(r),dates=day(r.checkIn)+' → '+day(r.checkOut)+(Number.isFinite(n)&&n>0?' · '+n+(n===1?' night':' nights'):'');
    let h='<details class="ju-row is-'+row.kind+'"'+(row.kind==='review'?' open':'')+'><summary><span class="ju-kind">'+e(KIND[row.kind])+'</span><strong>'+e(title)+'</strong><span>'+e(dates)+(r.status?' · '+e(r.status.replace(/_/g,' ')):'')+(row.cleaningReview?' · cleaning review':'')+'</span></summary><div class="ju-body">';
    if(row.reason)h+='<p class="ju-reason">'+e(row.reason)+'</p>';
    if(row.changes.length&&b)h+='<p>Would change: '+row.changes.map(f=>e(FIELD[f]||f)+' '+e(f==='checkIn'?day(b.checkIn)+' → '+day(r.checkIn):f==='checkOut'?day(b.checkOut)+' → '+day(r.checkOut):f==='guestCount'?(b.guestCount==null?'unknown':b.guestCount)+' → '+row.guests.value:(b.status||'confirmed')+' → '+r.status)).join('; ')+'.</p>';
    for(const w of row.warnings)h+='<p class="ju-warn">'+e(w)+'</p>';
    for(const n of row.notes)h+='<p class="ju-note">'+e(n)+'</p>';
    h+='<dl class="ju-facts"><div><dt>Uplisting</dt><dd>Reservation '+e(r.id||'no ID')+' · listing '+e(r.propertyName||'')+' (ID '+e(r.propertyId||'?')+')</dd></div>'
      +'<div><dt>Channel</dt><dd>'+e(r.channel||'not provided')+(r.externalReservationId?' · ref '+e(r.externalReservationId):has(r,'externalReservationId')?' · no reference':'')+'</dd></div>'
      +'<div><dt>Guests</dt><dd>'+(row.guests.state==='known'?e(row.guests.value):row.guests.state==='unknown'?'unknown':'not provided')+'</dd></div>'
      +'<div><dt>Times</dt><dd>'+(r.arrivalTime?'arrival '+e(r.arrivalTime.slice(0,5)):'arrival time not provided')+' · '+(r.departureTime?'departure '+e(r.departureTime.slice(0,5)):'departure time not provided')+'</dd></div>'
      +'<div><dt>Uplisting amounts</dt><dd>Accommodation '+money(row.accommodationTotal,cur)+' · cleaning fee '+money(row.cleaningFee,cur)+' · payout '+money(row.totalPayout,cur)+'</dd></div>'
      +(b?'<div><dt>Seravillas</dt><dd>Booking '+e(b.id)+' · '+e(b.guestName||'no guest name')+' · '+e(day(b.checkIn))+' → '+e(day(b.checkOut))+(b.status==='cancelled'?' · cancelled':'')+' · matched by '+e(row.basis)+'</dd></div>':'')+'</dl>';
    if(row.kind==='review'&&row.candidates.length||st.decisions[r.id]){
      const cands=[...new Set([...row.candidates,...(st.decisions[r.id]||'').startsWith('match:')?[st.decisions[r.id].slice(6)]:[]])].map(booking).filter(Boolean);
      h+='<label class="ju-decide">Is this the same stay?<select data-up-decide="'+e(r.id)+'"><option value="">Decide later</option>'+cands.map(c=>'<option value="match:'+e(c.id)+'"'+(st.decisions[r.id]==='match:'+c.id?' selected':'')+'>Same as '+e(c.guestName||'booking')+' · '+e(day(c.checkIn))+' → '+e(day(c.checkOut))+(c.status==='cancelled'?' (cancelled)':'')+'</option>').join('')
        +'<option value="new"'+(st.decisions[r.id]==='new'?' selected':'')+'>A different stay</option></select></label><p class="ju-note">Your decision only updates this preview. Nothing is saved to your records.</p>';
    }
    return h+'</div></details>';
  }
  const has=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  function group(rows,label){
    const shown=rows.filter(x=>st.filter==='all'||x.kind!=='unchanged');
    let h='<section class="ju-part"><h3>'+e(label)+' <span>'+rows.length+'</span></h3>';
    if(!rows.length)return h+'<p class="ju-line">None returned.</p></section>';
    for(const kind of ORDER){const list=shown.filter(x=>x.kind===kind);if(list.length)h+='<h4>'+e(KIND[kind])+' · '+list.length+'</h4>'+list.map(rowHtml).join('');}
    if(st.filter!=='all'&&rows.some(x=>x.kind==='unchanged'))h+='<p class="ju-line">'+rows.filter(x=>x.kind==='unchanged').length+' unchanged hidden. Choose “Show all” to list them.</p>';
    return h+'</section>';
  }
  function render(host){
    if(!host)return;
    const scroller=host.querySelector('.jc-body'),top=scroller?scroller.scrollTop:0;
    let h='<header class="jb-head"><div class="jb-heading"><small class="jv-label">Settings · Bookings</small><div class="jb-title"><h2 tabindex="-1" id="jarvis-uplisting-title">Uplisting · 2027 preview</h2></div></div><div class="jb-tools">'
      +'<button type="button" class="jv-btn" data-j="nav-settings">‹ Settings</button><button type="button" class="jv-btn jv-btn-primary" data-up="retrieve"'+(st.loading||st.status&&!st.status.configured?' disabled':'')+'>'+(st.loading?'Retrieving…':st.response?'Retrieve again':'Retrieve 2027 bookings')+'</button></div></header><div class="jc-body ju-body-wrap">';
    h+='<section class="ju-card"><h3>Connection</h3>'+statusHtml()+'<p class="ju-line">Read-only. This preview never changes Uplisting or your Seravillas records. Import and continuous sync are not switched on.</p></section>';
    const resp=st.response;
    if(st.loading)h+='<p class="ju-line" role="status">Retrieving reservations from Uplisting. This takes a few seconds per villa…</p>';
    if(st.error)h+='<section class="ju-card is-warn" role="alert"><h3>No preview</h3><p>'+e(st.error)+'</p><p class="ju-line">Nothing is shown as empty or complete when the retrieval fails.</p></section>';
    if(resp&&resp.ok){
      const plan=SV_UPLISTING.plan(resp,D,{mappings:mappings(),decisions:st.decisions,year:2027}),ageMin=Math.round((Date.now()-Date.parse(resp.retrievedAt))/6e4);
      h+='<section class="ju-card"><h3>Scope</h3><p class="ju-line">Stays overlapping 1 Jan – 31 Dec 2027. The departure day is not a night. Uplisting was asked for bookings from '+e(day(resp.scope.fetchFrom))+'; '+e(resp.outsideScope)+' outside 2027 were left out.</p>'
        +'<p class="ju-line">Retrieved '+e(when(resp.retrievedAt))+(resp.account?.name?' · account '+e(resp.account.name):'')+' · '+e(resp.requests)+' read requests'+(resp.duplicatesMerged?' · '+e(resp.duplicatesMerged)+' repeated results merged':'')+'.</p>'
        +(ageMin>=30?'<p class="ju-line is-warn">This retrieval is '+ageMin+' minutes old. Retrieve again for current Uplisting data.</p>':'')+'</section>';
      if(!plan.complete)h+='<section class="ju-card is-warn" role="alert"><h3>Retrieval incomplete</h3><p>This preview is not complete, so it must not be used as a full list. Bookings missing from it are not treated as cancelled.</p><ul>'+plan.problems.map(p=>'<li>'+(p.propertyId?'Listing '+e(p.propertyId)+': ':'')+e(p.message)+'</li>').join('')+'</ul></section>';
      h+='<section class="ju-card"><h3>Property mapping</h3><p class="ju-line">Each Uplisting listing must point to one existing villa. Exact names are suggested; anything else needs your choice. Villas and nicknames are never created or renamed. Choices are kept on this device for the preview only.</p>'+plan.properties.map(mappingHtml).join('')+'</section>';
      h+='<div class="ju-counts">'+[['review','Needs review'],['new','New'],['update','Updates'],['unchanged','Unchanged'],['cancelled','Cancelled'],['excluded','Excluded']].map(([k,l])=>'<div class="is-'+k+'"><strong>'+plan.counts[k]+'</strong><span>'+l+'</span></div>').join('')+'</div>';
      h+='<div class="ju-toolbar"><button type="button" class="jv-btn'+(st.filter!=='all'?' is-current':'')+'" data-up-filter="attention">Hide unchanged</button><button type="button" class="jv-btn'+(st.filter==='all'?' is-current':'')+'" data-up-filter="all">Show all</button></div>';
      h+=group(plan.rows.filter(x=>x.segment==='arrives'),'Arriving in 2027');
      h+=group(plan.rows.filter(x=>x.segment==='crosses'),'Arrived in 2026, departing in 2027');
      const excluded=plan.rows.filter(x=>x.kind==='excluded');
      h+='<section class="ju-part"><h3>Excluded or unsupported <span>'+excluded.length+'</span></h3>'+(excluded.length?excluded.map(rowHtml).join(''):'<p class="ju-line">None.</p>')+'</section>';
      h+='<section class="ju-part"><h3>In Seravillas but not returned by Uplisting <span>'+plan.seravillasOnly.length+'</span></h3><p class="ju-line">Shown for information only. A booking missing from Uplisting is never cancelled automatically.</p>'
        +plan.seravillasOnly.map(x=>'<p class="ju-only">'+e(villa(x.booking.propId))+' · '+e(x.booking.guestName||'no guest name')+' · '+e(day(x.booking.checkIn))+' → '+e(day(x.booking.checkOut))+(x.comparable?'':' · cannot compare: retrieval incomplete')+'</p>').join('')+'</section>';
      h+='<section class="ju-card"><h3>Before anything is imported</h3><p class="ju-line">Uplisting amounts are reservation figures, not proof of payment received. Unknown and missing amounts stay unknown; zero is shown as zero.</p><button type="button" class="jv-btn" disabled aria-disabled="true">Import · not available in this release</button></section>';
    }
    h+='</div>';
    host.innerHTML=h;
    const next=host.querySelector('.jc-body');if(next&&top)next.scrollTop=top;
    if(!st.status&&!st.statusError&&!host.dataset.upChecking){host.dataset.upChecking='1';loadStatus(host).finally(()=>{delete host.dataset.upChecking;});}
  }
  function bind(host){
    if(!host||host.dataset.upBound)return;host.dataset.upBound='1';
    host.addEventListener('click',ev=>{
      const t=ev.target.closest?.('[data-up],[data-up-filter]');if(!t)return;
      if(t.dataset.up==='retrieve'){void retrieve(host);return;}
      if(t.dataset.upFilter){st.filter=t.dataset.upFilter;render(host);}
    });
    host.addEventListener('change',ev=>{
      const t=ev.target;
      if(t.dataset.upMap!==undefined){const m=mappings();if(t.value)m[t.dataset.upMap]=t.value;else delete m[t.dataset.upMap];saveMappings(m);render(host);host.querySelector('[data-up-map="'+CSS.escape(t.dataset.upMap)+'"]')?.focus?.();return;}
      if(t.dataset.upDecide!==undefined){if(t.value)st.decisions[t.dataset.upDecide]=t.value;else delete st.decisions[t.dataset.upDecide];render(host);}
    });
  }
  /* Opening the page rechecks the connection status (the cloud service only; no Uplisting request). */
  function reset(){st.status=null;st.statusError='';}
  window.SV_UPLISTING_VIEW={render,bind,reset,useSource(fn){st.source=typeof fn==='function'?fn:null;st.status=null;st.statusError='';st.response=null;st.error='';st.decisions={};},_state:st};
})();
