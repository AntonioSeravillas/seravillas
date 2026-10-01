/* ── ISSUES RENDERING ── */
/* ── CLEANER SCHEDULE ── */
/* ═══════════════════════════════════════════════════════════════
   CLEANING COMMAND CENTER — Phase 1: Data Helpers
   Pure calculation functions only. No UI changes.
   All functions are safe with old sessions that have no crew field.
═══════════════════════════════════════════════════════════════ */

/* ── Property minimum crew requirements ──
   Exact alias matching only — never substring.
   Villa Mar and Villa Marjals alias sets are explicitly disjoint. */
var CREW_REQUIREMENTS=[
  {aliases:['villa mar','mar'],                        required:4},
  {aliases:['villa marjals','can marjals','marjals'],  required:4},
  {aliases:['villa diagonal','diagonal'],              required:3},
  {aliases:['la forca','forca'],                       required:3},
  {aliases:['can vallori','vallori'],                  required:1},
];

function getRequiredCleanersForProperty(propId){
  var p=D.props.find(function(x){return x.id===propId;});
  if(!p)return 1;
  var norm=String(p.name||'').toLowerCase().trim();
  for(var i=0;i<CREW_REQUIREMENTS.length;i++){
    if(CREW_REQUIREMENTS[i].aliases.indexOf(norm)>=0)return CREW_REQUIREMENTS[i].required;
  }
  return 1;
}

/* ── Main cleaner roster ── */
var MAIN_CLEANER_NAMES=['maribel','lutfyie','tanja','emi'];
var ALINA_MAX_SPOTS_PER_DAY=4;

function getMainCleanerNames(){return D.cleaners.filter(c=>c.name&&String(c.name).toLowerCase().trim()!=='alina').map(c=>String(c.name).toLowerCase().trim());}

function isMainCleaner(cleaner){
  if(!cleaner||!cleaner.name)return false;
  return MAIN_CLEANER_NAMES.indexOf(String(cleaner.name).toLowerCase().trim())>=0;
}

/* ── Crew structure accessor ──
   cleaning.crew shape:
     { main:[{cleanerId,name,status}], alinaSpots:0, alinaStatus:'offered'|'confirmed'|'cancelled' }
   Returns a safe empty default for any old session without a crew field. */
function getCleaningCrew(cleaning){return SV_CLEANING.crew(cleaning,D.cleaners);}
/* Legacy assigned cleaners count as confirmed. Explicit crew records own their status. */

function getConfirmedCrewCount(cleaning){
  var crew=getCleaningCrew(cleaning);
  var n=crew.main.filter(function(m){return m.status==='confirmed';}).length;
  if(crew.alinaSpots>0&&crew.alinaStatus==='confirmed')n+=crew.alinaSpots;
  return n;
}

/* ── Missing crew count ──
   required minus confirmed, never below 0. */
function getMissingCrewCount(cleaning){
  var required=getRequiredCleanersForProperty(cleaning.propId);
  return Math.max(0,required-getConfirmedCrewCount(cleaning));
}

/* ── Crew status ──
   Priority: done > cancelled > unassigned > fully_covered > partially_covered
             > waiting_confirmation > backup_needed */
function getCleaningCrewStatus(cleaning){
  if(!cleaning)return'unassigned';
  if(cleaning.status==='done')return'done';
  if(cleaning.status==='cancelled')return'cancelled';
  var crew=getCleaningCrew(cleaning);
  var required=getRequiredCleanersForProperty(cleaning.propId);
  var activeMain=crew.main.filter(function(m){return m.status!=='cancelled';});
  var activeAlina=crew.alinaSpots>0&&crew.alinaStatus!=='cancelled';
  if(!activeMain.length&&!activeAlina)return'unassigned';
  var confirmed=getConfirmedCrewCount(cleaning);
  if(confirmed>=required)return'fully_covered';
  if(confirmed>0)return'partially_covered';
  var offeredMain=crew.main.filter(function(m){return m.status==='offered';}).length;
  var offeredAlina=(crew.alinaSpots>0&&crew.alinaStatus==='offered')?crew.alinaSpots:0;
  if(offeredMain>0||offeredAlina>0)return'waiting_confirmation';
  return'backup_needed';
}

/* ── Cleaning risk level ──
   critical     : today or tomorrow + missing crew + same-day check-in at the property
   backup_needed: missing crew and cleaning is within 3 days
   conflict     : a main cleaner appears in crew.main of more than one session that day
   normal       : fully covered or not urgent */
function getCleaningRisk(cleaning){
  if(!cleaning)return'normal';
  if(cleaning.status==='done'||cleaning.status==='cancelled')return'normal';
  var td=today();
  var msPerDay=86400000;
  var daysAway=Math.round((new Date(cleaning.date+'T00:00:00')-new Date(td+'T00:00:00'))/msPerDay);
  // Conflict check: any non-cancelled main cleaner in another session that day
  var crew=getCleaningCrew(cleaning);
  var mainIds=crew.main.filter(function(m){return m.status!=='cancelled';}).map(function(m){return m.cleanerId;});
  for(var i=0;i<mainIds.length;i++){
    if(getCleanerDailyConflict(mainIds[i],cleaning.date,cleaning.id))return'conflict';
  }
  var missing=getMissingCrewCount(cleaning);
  if(missing>0&&(daysAway===0||daysAway===1)){
    var hasSameDayCheckIn=(D.bookings||[]).some(function(b){
      return b.propId===cleaning.propId&&b.checkIn===cleaning.date&&b.status!=='cancelled';
    });
    if(hasSameDayCheckIn)return'critical';
  }
  if(missing>0&&daysAway>=0&&daysAway<=3)return'backup_needed';
  return'normal';
}

/* ── Available / assigned main cleaners for a date ──
   Phase 1: getAvailableMainCleanersForDate returns all main cleaners from D.cleaners.
   Phase 2 will layer real date-availability on top of this. */
function getAvailableMainCleanersForDate(date){
  return D.cleaners.filter(function(c){return isMainCleaner(c);});
}

function getAssignedMainCleanersForDate(date){
  var assigned=[];
  D.sessions.forEach(function(s){
    if(s.date!==date||s.status==='cancelled')return;
    var crew=getCleaningCrew(s);
    crew.main.forEach(function(m){
      if(m.status!=='cancelled'&&assigned.indexOf(m.cleanerId)<0)assigned.push(m.cleanerId);
    });
  });
  return assigned;
}

/* ── Cleaner daily conflict detection ──
   Returns true if cleanerId appears in crew.main (non-cancelled) of any
   other non-cancelled session on the same date. */
function getCleanerDailyConflict(cleanerId,date,exceptSessionId){
  return D.sessions.some(function(s){
    if(s.id===exceptSessionId||s.date!==date||s.status==='cancelled')return false;
    var crew=getCleaningCrew(s);
    return crew.main.some(function(m){return m.cleanerId===cleanerId&&m.status!=='cancelled';});
  });
}

/* ── Alina capacity helpers ──
   "Used" counts both offered and confirmed alinaSpots on that date — both
   count against capacity so spots are not accidentally double-allocated. */
function getAlinaUsedSpotsForDate(date){
  var total=0;
  D.sessions.forEach(function(s){
    if(s.date!==date||s.status==='cancelled')return;
    var crew=getCleaningCrew(s);
    if(crew.alinaSpots>0&&crew.alinaStatus!=='cancelled')total+=crew.alinaSpots;
  });
  return total;
}

function getAlinaRemainingSpotsForDate(date){
  return Math.max(0,ALINA_MAX_SPOTS_PER_DAY-getAlinaUsedSpotsForDate(date));
}

/* ── END Phase 1 helpers ── */

/* ── Phase 2A: crew coverage HTML for schedule session cards ──
   Called inside renderCleanerSchedule() for each session card.
   Safe on old sessions — getCleaningCrew() returns empty defaults. */
function schedSessCrewHtml(s){
  if(!s||s.status==='cancelled')return'';
  var required=getRequiredCleanersForProperty(s.propId);
  var confirmed=getConfirmedCrewCount(s);
  var missing=getMissingCrewCount(s);
  var status=getCleaningCrewStatus(s);
  var risk=getCleaningRisk(s);
  // Risk overrides take priority over status badge
  if(risk==='critical'){
    return'<div class="sched-crew">'
      +'<div class="sched-crew-badge" style="background:var(--red)">⚠ Critical</div>'
      +'<div class="sched-crew-frac">'+confirmed+'/'+required+' conf</div>'
      +(missing>0?'<div class="sched-crew-missing">Missing '+missing+'</div>':'')
      +'<div class="sched-crew-alina">Alina '+getAlinaRemainingSpotsForDate(s.date)+'/'+ALINA_MAX_SPOTS_PER_DAY+'</div>'
      +'</div>';
  }
  if(risk==='conflict'){
    return'<div class="sched-crew">'
      +'<div class="sched-crew-badge" style="background:var(--red)">⚡ Conflict</div>'
      +'<div class="sched-crew-frac">'+confirmed+'/'+required+' conf</div>'
      +'</div>';
  }
  var badgeCfg={
    done:                {label:'✓ Done',    bg:'rgba(48,209,88,0.70)'},
    fully_covered:       {label:'✓ Covered', bg:'rgba(48,209,88,0.80)'},
    partially_covered:   {label:'Partial',   bg:'rgba(255,149,0,0.85)'},
    waiting_confirmation:{label:'Waiting',   bg:'rgba(10,132,255,0.85)'},
    backup_needed:       {label:'Backup',    bg:'rgba(255,69,58,0.85)'},
    unassigned:          {label:'No crew',   bg:'rgba(0,0,0,0.35)'},
  };
  var cfg=badgeCfg[status]||{label:status,bg:'rgba(0,0,0,0.30)'};
  var html='<div class="sched-crew">'
    +'<div class="sched-crew-badge" style="background:'+cfg.bg+'">'+cfg.label+'</div>'
    +'<div class="sched-crew-frac">'+confirmed+'/'+required+' conf</div>';
  if(missing>0)html+='<div class="sched-crew-missing">Missing '+missing+'</div>';
  if(missing>0||risk==='backup_needed'||risk==='critical'){
    html+='<div class="sched-crew-alina">Alina '+getAlinaRemainingSpotsForDate(s.date)+'/'+ALINA_MAX_SPOTS_PER_DAY+'</div>';
  }
  html+='</div>';
  return html;
}

/* ── Phase 2B: Crew assignment modal and mutation helpers ── */

/* Initialise crew field safely on a session object in memory only.
   Does not save — call save() explicitly after mutations. */
function crewEnsure(s){
  if(!s.crew)s.crew=getCleaningCrew(s);
  if(!Array.isArray(s.crew.main))s.crew.main=[];
  if(typeof s.crew.alinaSpots!=='number')s.crew.alinaSpots=0;
  if(!s.crew.alinaStatus)s.crew.alinaStatus='offered';
}

function openCrewModal(sessId){
  var s=D.sessions.find(function(x){return x.id===sessId;});
  if(!s)return;
  var prop=D.props.find(function(p){return p.id===s.propId;});
  var crew=getCleaningCrew(s);
  var required=getRequiredCleanersForProperty(s.propId);
  var confirmed=getConfirmedCrewCount(s);
  var missing=getMissingCrewCount(s);
  var crewSt=getCleaningCrewStatus(s);
  var risk=getCleaningRisk(s);
  // Alina slots used by other sessions today (not counting this one)
  var alinaUsedOthers=D.sessions.filter(function(sx){
    return sx.id!==sessId&&sx.date===s.date&&sx.status!=='cancelled';
  }).reduce(function(sum,sx){
    var cx=getCleaningCrew(sx);
    return sum+(cx.alinaSpots>0&&cx.alinaStatus!=='cancelled'?cx.alinaSpots:0);
  },0);
  var alinaMaxForThis=Math.max(0,ALINA_MAX_SPOTS_PER_DAY-alinaUsedOthers);
  // Badge style for coverage summary
  var isBad=risk==='critical'||risk==='conflict'||crewSt==='backup_needed';
  var isGood=crewSt==='fully_covered'||crewSt==='done';
  var badgeStyle=isBad?'color:var(--red-text);background:var(--red-bg)':isGood?'color:var(--accent-text);background:var(--accent-bg)':'color:var(--text3);background:var(--surface2)';
  var crewBadgeMap={done:'✓ Done',fully_covered:'✓ Covered',partially_covered:'Partial',waiting_confirmation:'Waiting',backup_needed:'Backup needed',unassigned:'No crew',cancelled:'Cancelled'};
  var crewLabel=risk==='critical'?'⚠ Critical':risk==='conflict'?'⚡ Conflict':(crewBadgeMap[crewSt]||crewSt);
  var h='<div class="modal-handle"></div>';
  h+='<div class="modal-title">'+esc(prop?prop.name:'Session')+'</div>';
  h+='<div style="font-size:13px;color:var(--text2);margin-bottom:14px">'+fmtFull(s.date)+(s.time?' &middot; <b style="color:var(--accent)">'+esc(s.time)+'</b>':'')+'</div>';
  // Coverage summary row
  h+='<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">';
  h+='<span style="font-size:12px;font-weight:600;color:var(--text2)">Required: <b style="color:var(--text)">'+required+'</b></span>';
  h+='<span style="font-size:12px;font-weight:600;color:var(--text2)">Confirmed: <b style="color:var(--text)">'+confirmed+'/'+required+'</b></span>';
  if(missing>0)h+='<span style="font-size:12px;font-weight:600;color:var(--red-text)">Missing: '+missing+'</span>';
  h+='<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;'+badgeStyle+'">'+crewLabel+'</span>';
  h+='</div>';
  // ── Main cleaners ──
  h+='<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px">Main Cleaners</div>';
  h+='<div style="margin-bottom:16px">';
  getMainCleanerNames().forEach(function(nm){
    const dbCleaner=D.cleaners.find(c=>String(c.name||'').toLowerCase().trim()===nm);
    const displayName=dbCleaner?dbCleaner.name:nm;
    const assigned=crew.main.find(m=>String(m.name||'').toLowerCase().trim()===nm);
    const cid=dbCleaner?dbCleaner.id:'name_'+nm;
    const attrs=' data-session="'+esc(sessId)+'" data-cleaner-name="'+esc(nm)+'"';
    function crewButton(label,operation,status){
      return '<button class="btn btn-sm btn-ghost"'+attrs+(status?' data-crew-status="'+status+'"':'')+' onclick="'+operation+'(this.dataset.session,this.dataset.cleanerName'+(status?',this.dataset.crewStatus':'')+')">'+label+'</button>';
    }
    h+='<div class="crew-modal-row"><div style="font-size:13px;font-weight:700;min-width:72px">'+esc(displayName)+'</div>';
    if(!assigned){
      h+=getCleanerDailyConflict(cid,s.date,s.id)?'<span style="font-size:11px;color:var(--amber)">Assigned elsewhere today</span>':crewButton('+ Offered','crewAddMain');
    }else{
      h+='<span style="font-size:11px;color:var(--text2)">'+esc(assigned.status)+'</span><div style="display:flex;gap:4px;margin-left:auto;flex-wrap:wrap">';
      if(assigned.status!=='offered')h+=crewButton('Offered','crewSetMainStatus','offered');
      if(assigned.status!=='confirmed')h+=crewButton('Confirm','crewSetMainStatus','confirmed');
      if(assigned.status!=='cancelled')h+=crewButton('Cancel','crewSetMainStatus','cancelled');
      h+=crewButton('Remove','crewRemoveMain')+'</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  // ── Alina team ──
  h+='<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Alina Team</div>';
  h+='<div style="background:var(--surface2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px">';
  h+='<div style="font-size:12px;color:var(--text3)">Daily capacity: <b style="color:var(--text)">'+alinaMaxForThis+'/'+ALINA_MAX_SPOTS_PER_DAY+' spots free</b> (other villas using '+alinaUsedOthers+')</div>';
  h+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:12px;font-weight:600;color:var(--text2);min-width:44px">Spots:</span>';
  [0,1,2,3,4].forEach(function(n){
    var sel=crew.alinaSpots===n;
    var over=n>alinaMaxForThis&&!sel;
    h+='<button class="btn btn-sm '+(sel?'btn-accent-sm':'btn-ghost')+'"'+(over?' style="opacity:0.4" title="Exceeds daily capacity"':'')+' onclick="crewSetAlina(\''+sessId+'\','+n+',null)">'+n+'</button>';
  });
  h+='</div>';
  if(crew.alinaSpots>0){
    h+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:12px;font-weight:600;color:var(--text2);min-width:44px">Status:</span>';
    ['offered','confirmed','cancelled'].forEach(function(st){
      var sel=crew.alinaStatus===st;
      h+='<button class="btn btn-sm '+(sel?'btn-accent-sm':'btn-ghost')+'" onclick="crewSetAlina(\''+sessId+'\',null,\''+st+'\')">'+st.charAt(0).toUpperCase()+st.slice(1)+'</button>';
    });
    h+='</div>';
  }
  if(crew.alinaSpots>alinaMaxForThis){
    h+='<div style="font-size:11px;color:var(--amber-text);font-weight:600">⚠ Exceeds today\'s remaining capacity</div>';
  }
  h+='</div>';
  h+='<div style="margin-top:16px"><button class="btn btn-ghost" style="width:100%" onclick="closeModal()">Done</button></div>';
  showModal(h);
}

function crewAddMain(sessId,cleanerName){
  var s=D.sessions.find(function(x){return x.id===sessId;});if(!s)return;
  var nm=String(cleanerName).toLowerCase();
  if(getCleaningCrew(s).main.find(function(m){return String(m.name||'').toLowerCase()===nm;})){openCrewModal(sessId);return;}
  var dbCleaner=D.cleaners.find(function(c){return String(c.name||'').toLowerCase()===nm;});
  var cid=dbCleaner?dbCleaner.id:'name_'+nm;
  if(getCleanerDailyConflict(cid,s.date,s.id)){
    toast('⚠ '+cleanerName.charAt(0).toUpperCase()+cleanerName.slice(1)+' is already assigned to another cleaning today');
    openCrewModal(sessId);return;
  }
  crewEnsure(s);
  s.crew.main.push({cleanerId:cid,name:dbCleaner?dbCleaner.name:cleanerName,status:'offered'});
  syncCleaningCleanerIds(s);
  save();render();openCrewModal(sessId);
}

function crewSetMainStatus(sessId,cleanerName,status){
  const s=D.sessions.find(x=>x.id===sessId);if(!s)return;
  const nm=String(cleanerName).toLowerCase();
  const m=getCleaningCrew(s).main.find(m=>String(m.name||'').toLowerCase()===nm);
  if(!m||!['offered','confirmed','cancelled'].includes(status))return;
  if(status!=='cancelled'&&getCleanerDailyConflict(m.cleanerId,s.date,s.id)){toast('This cleaner is already assigned elsewhere that day');return;}
  crewEnsure(s);const member=s.crew.main.find(m=>String(m.name||'').toLowerCase()===nm);member.status=status;if(status!=='confirmed')delete member.completedAt;
  syncCleaningCleanerIds(s);save();render();openCrewModal(sessId);
}

function crewRemoveMain(sessId,cleanerName){
  var s=D.sessions.find(function(x){return x.id===sessId;});if(!s)return;
  crewEnsure(s);
  var nm=String(cleanerName).toLowerCase();
  s.crew.main=s.crew.main.filter(function(m){return String(m.name||'').toLowerCase()!==nm;});
  syncCleaningCleanerIds(s);
  save();render();openCrewModal(sessId);
}

function crewSetAlina(sessId,spots,status){
  const s=D.sessions.find(x=>x.id===sessId);if(!s)return;
  const current=getCleaningCrew(s);
  const nextSpots=spots==null?current.alinaSpots:spots;
  const nextStatus=status==null?current.alinaStatus:status;
  if(!Number.isInteger(nextSpots)||nextSpots<0||nextSpots>ALINA_MAX_SPOTS_PER_DAY||!['offered','confirmed','cancelled'].includes(nextStatus))return;
  const usedOthers=D.sessions.filter(x=>x.id!==s.id&&x.date===s.date&&x.status!=='cancelled').reduce((n,x)=>{const c=getCleaningCrew(x);return n+(c.alinaStatus!=='cancelled'?c.alinaSpots:0);},0);
  if(nextStatus!=='cancelled'&&nextSpots+usedOthers>ALINA_MAX_SPOTS_PER_DAY){toast('Only '+Math.max(0,ALINA_MAX_SPOTS_PER_DAY-usedOthers)+' Alina spots available that day');return;}
  crewEnsure(s);if(nextSpots!==current.alinaSpots||nextStatus!=='confirmed')delete s.crew.alinaCompletedAt;s.crew.alinaSpots=nextSpots;s.crew.alinaStatus=nextStatus;
  syncCleaningCleanerIds(s);save();render();openCrewModal(sessId);
}

function renderCleanerSchedule(){
  const DW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const td=today();

  // Week start = Monday of this week + offset
  const base=startOfWeek(); // your existing Monday helper
  const wStart=addDays(base,schedWeekOffset*7);
  const wEnd=addDays(wStart,6);
  const days=Array.from({length:7},(_,i)=>addDays(wStart,i));

  // Week label
  const ws=new Date(wStart+'T00:00:00');
  const we=new Date(wEnd+'T00:00:00');
  const label=(schedWeekOffset===0?'This week — ':'')
    +ws.getDate()+' '+MN[ws.getMonth()]
    +' – '+we.getDate()+' '+MN[we.getMonth()]+' '+we.getFullYear();

  // Navigation + header
  let h='<div class="sv-page-header" style="margin-bottom:16px"><div class="sv-page-heading"><div class="sv-title">Schedule</div><div class="sv-subtitle">Cleaning team weekly view</div></div>'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddSessModal()">+ Session</button></div>';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px">'
    +'<button class="cal-nav" onclick="schedWeekOffset--;render()">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
    +'</button>'
    +'<div style="flex:1;text-align:center">'
    +'<div style="font-size:13px;font-weight:700;color:var(--text)">'+label+'</div>'
    +(schedWeekOffset!==0?'<div style="font-size:11px;color:var(--accent);cursor:pointer;margin-top:2px;font-weight:600" onclick="schedWeekOffset=0;render()">↩ Back to this week</div>':'')
    +'</div>'
    +'<button class="cal-nav" onclick="schedWeekOffset++;render()">'
    +'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>'
    +'</button>'
    +'</div>';

  // Sessions in this week window
  const weekSessions=D.sessions.filter(s=>s.date>=wStart&&s.date<=wEnd&&s.status!=='cancelled'&&(!schedPropFilter||s.propId===schedPropFilter));

  // ── Summary strip ── total sessions + unassigned alert
  const totalSess=weekSessions.length;
  const unassigned=weekSessions.filter(s=>s.status!=='done'&&!getCleaningAssignedCleanerIds(s).length&&!(getCleaningCrew(s).alinaSpots&&getCleaningCrew(s).alinaStatus!=='cancelled')).length;
  h+='<div style="display:flex;gap:8px;margin-bottom:14px">'
    +'<div style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;text-align:center">'
    +'<div style="font-size:20px;font-weight:800;color:var(--accent)">'+totalSess+'</div>'
    +'<div style="font-size:10px;color:var(--text2);font-weight:600;margin-top:1px">Sessions this week</div></div>'
    +(unassigned?'<div style="flex:1;background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--radius-sm);padding:10px 12px;text-align:center">'
      +'<div style="font-size:20px;font-weight:800;color:var(--amber)">'+unassigned+'</div>'
      +'<div style="font-size:10px;color:var(--amber);font-weight:600;margin-top:1px">Unassigned ⚠️</div></div>':'')
    +'</div>';

  // ── Message generators — Phase 2C ──
  h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px 13px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    +'<span style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0">Messages</span>'
    +'<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="openCleaningMessageModal(\'weekly\')">Group schedule</button>'
    +'<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="openCleaningMessageModal(\'alina\')">Alina spots</button>'
    +'<button class="sv-btn sv-btn-danger sv-btn-sm" onclick="openCleaningMessageModal(\'urgent\')">⚠ Urgent</button>'
    +'</div>';

  h+=renderCleaningPlanning(wStart,wEnd,weekSessions);
  if(schedView==='villas')return h;

  // ── Grid (desktop/tablet — hidden on mobile via CSS) ──
  h+='<div class="sched-wrap sched-desktop-only"><table class="sched-table"><thead><tr>'
    +'<th class="sched-th" style="text-align:left;min-width:72px">Cleaner</th>';

  days.forEach((d,i)=>{
    const isT=d===td;
    const isWk=i>=5;
    const dd=new Date(d+'T00:00:00');
    h+='<th class="sched-th'+(isT?' is-today':'')+(isWk?' is-weekend':'')+'">'
      +'<div class="sched-th-day">'+dd.getDate()+'</div>'
      +'<div>'+DW[i]+'</div>'
      +'</th>';
  });
  h+='</tr></thead><tbody>';

  // One row per cleaner
  D.cleaners.forEach((c,ci)=>{
    const avatar='<div class="avatar pc-'+((ci)%6)+'" style="width:26px;height:26px;border-radius:50%;font-size:9px;font-weight:800;flex-shrink:0">'+avInit(c.name)+'</div>';
    h+='<tr>';
    // Name cell
    h+='<td class="sched-name-col">'
      +'<div class="sched-name-inner">'+avatar
      +'<div style="min-width:0"><div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px">'+esc(c.name.split(' ')[0])+'</div>'
      +(c.phone?'<div onclick="openWA(\''+esc(c.phone)+'\')" style="cursor:pointer;font-size:9px;color:#25D366;font-weight:600;margin-top:1px">WA</div>':'')
      +'</div></div>'
      +'</td>';

    // 7 day cells
    days.forEach((d,i)=>{
      const isT=d===td;
      const isWk=i>=5;
      const daySess=weekSessions.filter(s=>s.date===d&&getCleaningAssignedCleanerIds(s).includes(c.id));
      h+='<td class="sched-cell'+(isT?' is-today':'')+(isWk?' is-weekend':'')+'">';
      if(daySess.length){
        daySess.forEach(s=>{
          const prop=D.props.find(p=>p.id===s.propId);
          const clr=propBarColor(s.propId);
          const done=s.status==='done';
          const shortName=(prop?prop.name:'?').replace(/^Villa\s+/i,'').replace(/^Can\s+/i,'');
          h+='<div class="sched-sess'+(done?' sched-sess-done':'')+'" '
            +'style="background:'+clr.bg+';border-left-color:'+clr.border+'" '
            +'onclick="openSess(\''+s.id+'\')">'
            +'<div class="sched-sess-prop">'+esc(shortName)+'</div>'
            +(s.time?'<div class="sched-sess-time">'+esc(s.time)+'</div>':'')
            +(done?'<div class="sched-sess-time">✓ Done</div>':'')
            +schedSessCrewHtml(s)
            +'<button onclick="event.stopPropagation();openCrewModal(\''+s.id+'\')" style="font-size:8px;margin-top:4px;padding:1px 6px;border-radius:3px;border:none;background:rgba(255,255,255,0.18);color:rgba(255,255,255,0.9);cursor:pointer;font-family:\'Plus Jakarta Sans\',sans-serif;font-weight:700;display:block">Crew</button>'
            +'</div>';
        });
      } else {
        h+='<div class="sched-avail">·</div>';
      }
      h+='</td>';
    });
    h+='</tr>';
  });

  // ── Unassigned sessions row ──
  const unassignedSess=weekSessions.filter(s=>!getCleaningAssignedCleanerIds(s).length);
  if(unassignedSess.length){
    h+='<tr>';
    h+='<td class="sched-name-col"><div style="font-size:10px;font-weight:700;color:var(--amber)">⚠️ No cleaner</div></td>';
    days.forEach(d=>{
      const daySess=unassignedSess.filter(s=>s.date===d);
      h+='<td class="sched-cell">';
      daySess.forEach(s=>{
        const prop=D.props.find(p=>p.id===s.propId);
        const clr=propBarColor(s.propId);
        const shortName=(prop?prop.name:'?').replace(/^Villa\s+/i,'').replace(/^Can\s+/i,'');
        h+='<div class="sched-sess" style="background:var(--amber-bg);border-left-color:var(--amber)" onclick="openSess(\''+s.id+'\')">'
          +'<div class="sched-sess-prop" style="color:var(--amber)">'+esc(shortName)+'</div>'
          +(s.time?'<div class="sched-sess-time" style="color:var(--amber)">'+esc(s.time)+'</div>':'')
          +schedSessCrewHtml(s)
          +'</div>';
      });
      if(!daySess.length)h+='<div class="sched-avail">·</div>';
      h+='</td>';
    });
    h+='</tr>';
  }

  h+='</tbody></table></div>';

  // ── Mobile day-by-day list (shown only on small screens via CSS) ──
  // weekSessions is already deduplicated — one entry per session, no repeats.
  const DWFull=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  h+='<div class="sched-mobile-list">';
  days.forEach(function(d,di){
    const isT=d===td;
    const daySess=weekSessions.filter(function(s){return s.date===d;});
    const dd=new Date(d+'T00:00:00');
    const dayLabel=DWFull[di]+' '+dd.getDate()+' '+MN[dd.getMonth()];
    h+='<div><div class="sched-mobile-day-hdr'+(isT?' is-today':'')+'">' +dayLabel+'</div>';
    if(!daySess.length){
      h+='<div class="sched-mobile-empty">No cleanings</div>';
    }else{
      daySess.forEach(function(s){
        const prop=D.props.find(function(p){return p.id===s.propId;});
        const clr=propBarColor(s.propId);
        const fullName=prop?prop.name:'?';
        const required=getRequiredCleanersForProperty(s.propId);
        const confirmed=getConfirmedCrewCount(s);
        const missing=getMissingCrewCount(s);
        const crewStatus=getCleaningCrewStatus(s);
        const risk=getCleaningRisk(s);
        const mBadgeCfg={
          done:                {label:'✓ Done',        color:'var(--accent-text)',  bg:'var(--accent-bg)'},
          fully_covered:       {label:'✓ Covered',     color:'var(--accent-text)',  bg:'var(--accent-bg)'},
          partially_covered:   {label:'Partial',       color:'var(--amber-text)',   bg:'var(--amber-bg)'},
          waiting_confirmation:{label:'Waiting',       color:'#0A84FF',             bg:'rgba(10,132,255,0.13)'},
          backup_needed:       {label:'Backup needed', color:'var(--red-text)',     bg:'var(--red-bg)'},
          unassigned:          {label:'No crew',       color:'var(--text3)',        bg:'var(--surface2)'},
        };
        let badge=mBadgeCfg[crewStatus]||{label:crewStatus,color:'var(--text3)',bg:'var(--surface2)'};
        if(risk==='critical')badge={label:'⚠ Critical',color:'#fff',bg:'var(--red)'};
        if(risk==='conflict')badge={label:'⚡ Conflict',color:'#fff',bg:'var(--red)'};
        const showAlina=missing>0||risk==='backup_needed'||risk==='critical';
        h+='<div class="sched-mobile-card" style="border-left-color:'+clr.border+'" onclick="openSess(\''+s.id+'\')">'
          +'<div class="sched-mobile-prop">'+esc(fullName)+'</div>'
          +(s.time?'<div class="sched-mobile-time">'+esc(s.time)+'</div>':'')
          +cleaningContextHtml(s)+cleaningStaffHtml(s)
          +'<div class="sched-mobile-meta">'
          +'<span>Required: '+required+'</span>'
          +'<span>Crew: '+confirmed+'/'+required+' confirmed</span>'
          +(missing>0?'<span>Missing: '+missing+'</span>':'')
          +'</div>'
          +'<span class="sched-mobile-badge" style="color:'+badge.color+';background:'+badge.bg+'">'+badge.label+'</span>'
          +(showAlina?'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-top:5px">Alina remaining: '+getAlinaRemainingSpotsForDate(d)+'/'+ALINA_MAX_SPOTS_PER_DAY+'</div>':'')
          +'<button class="sv-btn sv-btn-secondary sv-btn-sm" style="margin-top:10px;width:100%" onclick="event.stopPropagation();openCrewModal(\''+s.id+'\')">Manage Crew</button>'
          +'</div>';
      });
    }
    h+='</div>';
  });
  h+='</div>';

  return h;
}


/* ═══════════════════════════════════════════════════════
   CLEANING COMMAND CENTER — Phase 2C: Message Generators
   WhatsApp-ready message builders for cleaning coordination.
   Read-only — do not modify bookings, crew, or sessions.
═══════════════════════════════════════════════════════ */

/* Returns non-cancelled sessions for the currently displayed week,
   sorted by date then time. Uses the global schedWeekOffset. */
function getScheduleWeekSessions(){
  var base=startOfWeek();
  var wStart=addDays(base,schedWeekOffset*7);
  var wEnd=addDays(wStart,6);
  return D.sessions.filter(function(s){
    return s.date>=wStart&&s.date<=wEnd&&s.status!=='cancelled';
  }).sort(function(a,b){return a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'');});
}

/* "Monday 25.05" */
function formatCleaningMessageDate(dateStr){
  var DW=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var d=new Date(dateStr+'T00:00:00');
  var dow=d.getDay();
  var idx=dow===0?6:dow-1;
  return DW[idx]+' '+pad(d.getDate())+'.'+pad(d.getMonth()+1);
}

/* " — 10:00" or "" */
function formatCleaningMessageTime(timeStr){
  return timeStr?(' — '+timeStr):'';
}

function generateMainCleanerWeeklyMessage(){
  var sessions=getScheduleWeekSessions();
  var base=startOfWeek();
  var wStart=addDays(base,schedWeekOffset*7);
  var allDays=Array.from({length:7},function(_,i){return addDays(wStart,i);});
  var weekLabel=schedWeekOffset===0?'this week':schedWeekOffset===1?'next week':'the week of '+pad(new Date(wStart+'T00:00:00').getDate())+'.'+pad(new Date(wStart+'T00:00:00').getMonth()+1);
  var msg='Hi girls, here is the cleaning schedule for '+weekLabel+'.\n\nPlease let me know which dates you are available:\n';
  allDays.forEach(function(day){
    var daySess=sessions.filter(function(s){return s.date===day;});
    msg+='\n'+formatCleaningMessageDate(day)+'\n';
    if(!daySess.length){
      msg+='No cleanings\n';
    }else{
      daySess.forEach(function(s){
        var prop=D.props.find(function(p){return p.id===s.propId;});
        var req=getRequiredCleanersForProperty(s.propId);
        msg+='• '+(prop?prop.name:'?')+formatCleaningMessageTime(s.time)+' — need '+req+' '+(req===1?'lady':'ladies')+'\n';
      });
    }
  });
  msg+='\nThank you 😊';
  return msg;
}

function generateAlinaMissingSpotsMessage(){
  var sessions=getScheduleWeekSessions().filter(function(s){
    return s.status!=='done'&&getMissingCrewCount(s)>0;
  });
  var base=startOfWeek();
  var wStart=addDays(base,schedWeekOffset*7);
  var weekLabel=schedWeekOffset===0?'this week':schedWeekOffset===1?'next week':'the week of '+pad(new Date(wStart+'T00:00:00').getDate())+'.'+pad(new Date(wStart+'T00:00:00').getMonth()+1);
  if(!sessions.length)return'Hi Alina, for '+weekLabel+' all cleanings are covered — no extra help needed! 😊';
  var msg='Hi Alina, for '+weekLabel+' I still need help with:\n';
  var seenDays=[];
  sessions.forEach(function(s){if(seenDays.indexOf(s.date)<0)seenDays.push(s.date);});
  seenDays.sort().forEach(function(day){
    msg+='\n'+formatCleaningMessageDate(day)+'\n';
    sessions.filter(function(s){return s.date===day;}).forEach(function(s){
      var prop=D.props.find(function(p){return p.id===s.propId;});
      var missing=getMissingCrewCount(s);
      msg+='• '+(prop?prop.name:'?')+formatCleaningMessageTime(s.time)+' — need '+missing+' extra '+(missing===1?'lady':'ladies')+'\n';
    });
  });
  msg+='\nCan your team cover this?';
  return msg;
}

function generateUrgentBackupMessage(){
  var td=today();
  var tom=addDays(td,1);
  var urgent=D.sessions.filter(function(s){
    if(s.date!==td&&s.date!==tom)return false;
    if(s.status==='cancelled'||s.status==='done')return false;
    var r=getCleaningRisk(s);
    return r==='critical'||r==='backup_needed';
  }).sort(function(a,b){return a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'');});
  if(!urgent.length)return'No urgent backup needed right now 😊';
  var msg='Hi Alina, urgent help needed:\n';
  var seenDays=[];
  urgent.forEach(function(s){if(seenDays.indexOf(s.date)<0)seenDays.push(s.date);});
  seenDays.sort().forEach(function(day){
    var isToday=day===td;
    var dd=new Date(day+'T00:00:00');
    var dayPrefix=(isToday?'Today':'Tomorrow')+' '+pad(dd.getDate())+'.'+pad(dd.getMonth()+1);
    msg+='\n'+dayPrefix+'\n';
    urgent.filter(function(s){return s.date===day;}).forEach(function(s){
      var prop=D.props.find(function(p){return p.id===s.propId;});
      var missing=getMissingCrewCount(s);
      var isCrit=getCleaningRisk(s)==='critical';
      msg+='• '+(prop?prop.name:'?')+formatCleaningMessageTime(s.time)+'\n';
      msg+='  Need '+missing+' extra '+(missing===1?'lady':'ladies')+'\n';
      if(isCrit)msg+='  Same-day check-in ⚡\n';
    });
  });
  msg+='\nCan your team help?';
  return msg;
}

function openCleaningMessageModal(type){
  var titles={weekly:'Group Schedule Message',alina:'Alina — Missing Spots',urgent:'Urgent Backup Request'};
  var generators={weekly:generateMainCleanerWeeklyMessage,alina:generateAlinaMissingSpotsMessage,urgent:generateUrgentBackupMessage};
  var gen=generators[type];if(!gen)return;
  var msg=gen();
  var isUrgent=type==='urgent';
  var h='<div class="modal-handle"></div>';
  h+='<div class="modal-title">'+esc(titles[type]||'Message')+'</div>';
  h+='<div class="field" style="margin-bottom:12px"><textarea id="msg-ta" style="height:260px;font-size:13px;line-height:1.7;font-family:\'Plus Jakarta Sans\',sans-serif" readonly>'+esc(msg)+'</textarea></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button class="sv-btn '+(isUrgent?'sv-btn-danger':'sv-btn-primary')+'" style="flex:1" onclick="copyCleaningMessage()">Copy message</button>';
  h+='<button class="sv-btn sv-btn-secondary" style="flex:1" onclick="closeModal()">Close</button>';
  h+='</div>';
  showModal(h);
}

function copyCleaningMessage(){
  var ta=document.getElementById('msg-ta');if(!ta)return;
  var text=ta.value;
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(function(){toast('Copied! ✓');}).catch(function(){ta.select();document.execCommand('copy');toast('Copied! ✓');});
  }else{ta.select();document.execCommand('copy');toast('Copied! ✓');}
}

/* ── END Phase 2C ── */

