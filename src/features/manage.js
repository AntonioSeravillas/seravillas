/* ── ADD SESSION ── */
function openAddSessModal(){
  selCleaners=[];
  if(D.props.length===0||D.cleaners.length===0){
    showModal('<div class="modal-handle"></div><div class="modal-title">Add a session</div>'
      +'<div style="font-size:14px;color:var(--text2);margin-bottom:16px;font-weight:500">Add at least one property and one cleaner first.</div>'
      +'<button class="btn btn-primary" data-nav="properties">Go to Properties</button>');
    return;
  }
  const po='<option value="">Select property...</option>'+D.props.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const chips=D.cleaners.map(c=>'<button type="button" class="chip" data-id="'+c.id+'" onclick="toggleCleanerModal(\''+c.id+'\')">'+esc(c.name)+'</button>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Add a cleaning session</div>'
    +'<div class="field"><label>Property</label><select id="f-prop">'+po+'</select></div>'
    +'<div class="field"><label>Date</label><input type="date" id="f-date" min="'+today()+'"></div>'
    +'<div class="field"><label>Time</label><input type="time" id="f-time" value="08:00"></div>'
    +'<div class="field"><label>Cleaners</label><div class="chips" id="modal-cleaner-chips" style="margin-top:6px">'+chips+'</div></div>'
    +'<div class="field"><label>Note <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(optional)</span></label><textarea id="f-note" placeholder="Special instructions..." style="height:68px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-teal" style="flex:1" onclick="addSessFromModal()">Save session</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function toggleCleanerModal(id){
  const i=selCleaners.indexOf(id);
  if(i>=0)selCleaners.splice(i,1);else selCleaners.push(id);
  document.querySelectorAll('#modal-cleaner-chips .chip').forEach(c=>c.classList.toggle('on',selCleaners.includes(c.dataset.id)));
}
function addSessFromModal(){
  const propId=(document.getElementById('f-prop')||{}).value||'';
  const date=(document.getElementById('f-date')||{}).value||'';
  const time=(document.getElementById('f-time')||{}).value||'';
  const note=(document.getElementById('f-note')||{}).value||'';
  const cids=[...selCleaners];
  if(!propId){alert('Please select a property.');return;}
  if(!date){alert('Please pick a date.');return;}
  if(!cids.length){alert('Please select at least one cleaner.');return;}
  D.sessions.push({id:uid(),propId,cleanerIds:cids,date,time,note,status:'scheduled'});
  selCleaners=[];save();closeModal();render();toast('Session saved!');
}

function renderAdd(){
  if(D.props.length===0||D.cleaners.length===0){
    return'<div style="font-size:19px;font-weight:800;letter-spacing:-0.4px;margin-bottom:16px">Add a session</div>'
      +'<div class="card" style="text-align:center;padding:28px 20px"><div style="font-size:14px;color:var(--text2);margin-bottom:16px;font-weight:500">Add at least one property and one cleaner first.</div>'
      +'<button class="btn btn-primary btn-sm" data-nav="properties">Go to Properties</button></div>';
  }
  const po='<option value="">Select property...</option>'+D.props.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  const chips=D.cleaners.map(c=>'<button type="button" class="chip'+(selCleaners.includes(c.id)?' on':'')+'" data-id="'+c.id+'" onclick="toggleCleaner(\''+c.id+'\')">'+esc(c.name)+'</button>').join('');
  return'<div style="font-size:19px;font-weight:800;letter-spacing:-0.4px;margin-bottom:20px">Add a cleaning session</div>'
    +'<div class="field"><label>Property</label><select id="f-prop">'+po+'</select></div>'
    +'<div class="field"><label>Date</label><input type="date" id="f-date" min="'+today()+'"></div>'
    +'<div class="field"><label>Time</label><input type="time" id="f-time" value="08:00"></div>'
    +'<div class="field"><label>Assign cleaners</label><div class="chips" id="cleaner-chips" style="margin-top:6px">'+chips+'</div></div>'
    +'<div class="field"><label>Note <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(optional)</span></label><textarea id="f-note" placeholder="Special instructions..." style="height:72px"></textarea></div>'
    +'<div style="margin-top:8px"><button class="btn btn-teal" onclick="addSess()">Save session</button></div>';
}

/* ── MANAGE TAB ── */
function renderManage(){
  let body='';
  if(manageTab==='overview')      body=renderManageOverview();
  else if(manageTab==='cleaners') body=renderManageCleaners();
  else if(manageTab==='issues')   body=renderIssuesList();
  else if(manageTab==='supplies') body=renderSupplies();
  else if(manageTab==='schedule') body=renderCleanerSchedule();
  else if(manageTab==='contacts') body=renderManageContacts();
  else                            body=renderScratch();
  return body;
}
function renderManageOverview(){
  const td=today();
  const openI=D.issues.filter(i=>i.status==='open'||i.status==='in_progress').length;
  const urgentI=D.issues.filter(i=>(i.priority||'medium')==='high'&&i.status!=='resolved').length;
  const openTasks=D.tasks.filter(t=>!t.done).length;
  const lowStock=D.supplies.filter(s=>s.have<s.need).length;
  const upcomingCleans=D.sessions.filter(s=>s.date>=td&&s.status==='scheduled').length;
  return'<div class="sv-page-header" style="margin-bottom:18px"><div class="sv-page-heading"><div class="sv-title">Overview</div><div class="sv-subtitle">Property operations at a glance</div></div><button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="workspaceNavigate(\'review\')">Weekly review</button></div>'
    +'<div class="ops-grid">'
    +opsCard('Open Issues','<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',openI,'',urgentI?urgentI+' urgent':null,'issues')
    +opsCard('Pending Tasks','<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',openTasks,'','',null)
    +opsCard('Low Stock','<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>',lowStock,'','','supplies')
    +opsCard('Upcoming Cleans','<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',upcomingCleans,'','','schedule')
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">'
    +'<button class="sv-btn sv-btn-secondary" style="justify-content:flex-start" onclick="manageTab=\'issues\';render()">📋 Issues Command Center</button>'
    +'<button class="sv-btn sv-btn-secondary" style="justify-content:flex-start" onclick="manageTab=\'cleaners\';render()">👥 Manage Cleaners</button>'
    +'<button class="sv-btn sv-btn-secondary" style="justify-content:flex-start" onclick="manageTab=\'supplies\';render()">📦 Check Stock</button>'
    +'<button class="sv-btn sv-btn-secondary" style="justify-content:flex-start" onclick="manageTab=\'schedule\';render()">📅 Cleaning Schedule</button>'
    +'</div>';
}
function opsCard(label,icon,val,unit,note,tab){
  return'<div class="sv-metric-card" style="cursor:'+(tab?'pointer':'default')+'" onclick="'+(tab?'manageTab=\''+tab+'\';render()':'')+'"><div style="color:var(--text3);margin-bottom:4px">'+icon+'</div>'+'<div class="sv-metric-card-n">'+val+(unit?'<span style="font-size:13px;font-weight:600;margin-left:4px">'+unit+'</span>':'')+'</div>'+'<div class="sv-metric-card-l">'+label+'</div>'+(note?'<div style="font-size:11px;color:var(--danger,var(--red));font-weight:600;margin-top:4px">'+note+'</div>':'')+'</div>';
}

function renderManageCleaners(){
  let h='<div class="sv-page-header" style="margin-bottom:16px"><div class="sv-page-heading"><div class="sv-title">Cleaning Team</div></div>'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddCleanerModal()">+ Add</button></div>';
  h+='<div style="margin-bottom:14px"><button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="openCleanerAccess()">Cleaner logins</button></div>';
  h+='<div style="margin-bottom:14px"><div class="input-row"><input type="text" id="cleaner-in" placeholder="Name..."><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddCleanerModal()">Add</button></div></div>';
  if(!D.cleaners.length)return h+'<div class="sv-empty"><div class="sv-empty-title">No cleaners yet</div><div class="sv-empty-sub">Add your first cleaner above.</div></div>';
  h+='<div class="sv-entity-card" style="overflow:hidden">'+D.cleaners.map(c=>{
    const waBtn=c.phone?'<button class="btn btn-sm" style="background:#e8fdf0;color:#128C7E;border:1.5px solid #b2e8c8;padding:8px 12px;font-size:12px;flex-shrink:0" onclick="openWA(\''+esc(c.phone)+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" style="vertical-align:middle"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.527 5.849L0 24l6.304-1.654C8.006 23.431 9.961 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.584-.493-5.084-1.355l-.364-.214-3.742.981.999-3.647-.239-.374A9.93 9.93 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg></button>':'';
    return'<div class="sv-work-row">'
      +'<div class="avatar pc-2" style="width:38px;height:38px;border-radius:50%;font-size:13px;font-weight:800;flex-shrink:0">'+avInit(c.name)+'</div>'
      +'<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">'+esc(c.name)+'</div>'
      +(c.phone?'<div style="font-size:11px;color:var(--text3);font-family:\'DM Mono\',monospace">'+esc(c.phone)+'</div>':'<div style="font-size:11px;color:var(--text3)">No phone — tap edit to add</div>')+'</div>'
      +waBtn
      +'<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openEditCleaner(\''+c.id+'\')">Edit</button>'
      +'<button class="sv-btn sv-btn-danger sv-btn-sm" onclick="delCleaner(\''+c.id+'\')">✕</button>'
      +'</div>';
  }).join('')+'</div>';
  return h;
}


/* ── CONTACTS ── */
const CONTACT_CATS={cleaners:'Cleaners',private_chefs:'Private Chefs',private_transport:'Transport',workers:'Workers',boat_tours:'Boat Tours',other:'Other'};
const CONTACT_STATUS_LABELS={new:'New',contacted:'Contacted',interested:'Interested',active:'Active',not_suitable:'Not Suitable'};
const CONTACT_STATUS_STYLE={new:'background:var(--surface2);color:var(--text2);border:1px solid var(--border)',contacted:'background:rgba(10,132,255,0.12);color:#0A84FF;border:1px solid rgba(10,132,255,0.25)',interested:'background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border)',active:'background:rgba(48,209,88,0.12);color:#30D158;border:1px solid rgba(48,209,88,0.25)',not_suitable:'background:var(--red-bg,rgba(255,69,58,0.14));color:var(--red-text,#FF6961);border:1px solid var(--red-border)'};

function renderManageContacts(){
  const cats=[['all','All'],...Object.entries(CONTACT_CATS)];
  const q=(contactSearch||'').toLowerCase().trim();
  let list=(D.contacts||[]).filter(c=>{
    if(contactFilter!=='all'&&c.category!==contactFilter)return false;
    if(q){
      const haystack=[c.name,c.company,c.phone,c.whatsapp,c.area,c.notes].join(' ').toLowerCase();
      if(!haystack.includes(q))return false;
    }
    return true;
  });

  let h='<div class="sv-page-header" style="margin-bottom:16px"><div class="sv-page-heading"><div class="sv-title">Contacts</div><div class="sv-subtitle">Service providers &amp; directory</div></div>'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddContactModal()">+ Contact</button></div>';

  h+='<input type="text" placeholder="Search name, company, phone, area..." value="'+esc(contactSearch||'')+'" oninput="contactSearch=this.value;render()" style="width:100%;margin-bottom:12px;padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--surface);color:var(--text);font-family:\'Plus Jakarta Sans\',sans-serif">';

  h+='<div class="sv-chip-row" style="margin-bottom:16px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px">';
  cats.forEach(function(c){h+='<button class="sv-chip'+(contactFilter===c[0]?' active':'')+'" onclick="contactFilter=\''+c[0]+'\';render()">'+c[1]+'</button>';});
  h+='</div>';

  if(!list.length){
    h+='<div class="sv-empty"><div class="sv-empty-title">'+(q||contactFilter!=='all'?'No contacts match':'No contacts yet')+'</div><div class="sv-empty-sub">'+(q||contactFilter!=='all'?'Try a different search or filter.':'Tap "+ Contact" to add your first provider.')+'</div></div>';
    return h;
  }

  h+='<div style="display:flex;flex-direction:column;gap:10px">';
  list.forEach(function(c){
    const waNum=(c.whatsapp||c.phone||'').replace(/\D/g,'');
    const waBtn=waNum?'<button onclick="openWA(\''+esc(waNum)+'\')" title="WhatsApp" style="width:32px;height:32px;border-radius:50%;border:none;background:#e8fdf0;color:#128C7E;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.527 5.849L0 24l6.304-1.654C8.006 23.431 9.961 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.847 0-3.584-.493-5.084-1.355l-.364-.214-3.742.981.999-3.647-.239-.374A9.93 9.93 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg></button>':'';
    const statusStyle=CONTACT_STATUS_STYLE[c.status]||CONTACT_STATUS_STYLE['new'];
    const statusLabel=CONTACT_STATUS_LABELS[c.status]||'New';
    const catLabel=CONTACT_CATS[c.category]||'Other';

    h+='<div class="sv-entity-card" style="padding:14px 16px">';
    h+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">';
    h+='<div class="avatar pc-2" style="width:40px;height:40px;border-radius:50%;font-size:13px;font-weight:800;flex-shrink:0">'+avInit(c.name)+'</div>';
    h+='<div style="flex:1;min-width:0">';
    h+='<div style="font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name)+(c.company?'<span style="font-size:11px;font-weight:500;color:var(--text3);margin-left:6px">'+esc(c.company)+'</span>':'')+'</div>';
    h+='<div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">';
    h+='<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--text2);border:1px solid var(--border)">'+catLabel+'</span>';
    h+='<span class="sv-badge" style="'+statusStyle+'">'+statusLabel+'</span>';
    h+='</div></div>';
    h+=waBtn;
    h+='<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openEditContact(\''+c.id+'\')">Edit</button>';
    h+='<button class="sv-btn sv-btn-danger sv-btn-sm" onclick="deleteContact(\''+c.id+'\')">✕</button>';
    h+='</div>';

    const meta=[];
    if(c.phone)meta.push('<span style="font-size:12px;color:var(--text2);font-family:\'DM Mono\',monospace">'+esc(c.phone)+'</span>');
    if(c.area)meta.push('<span style="font-size:12px;color:var(--text3)">📍 '+esc(c.area)+'</span>');
    if(c.priceInfo)meta.push('<span style="font-size:12px;color:var(--text3)">💶 '+esc(c.priceInfo)+'</span>');
    if(c.availability)meta.push('<span style="font-size:12px;color:var(--text3)">🕐 '+esc(c.availability)+'</span>');
    if(meta.length)h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">'+meta.join('')+'</div>';

    if(c.notes)h+='<div style="font-size:12px;color:var(--text3);font-style:italic;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:4px">'+esc(c.notes)+'</div>';
    if(c.lastContacted)h+='<div style="font-size:11px;color:var(--text3);margin-top:2px">Last contacted: '+esc(c.lastContacted)+'</div>';

    h+='</div>';
  });
  h+='</div>';
  return h;
}

