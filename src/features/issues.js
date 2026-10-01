const ICC_CATS={maintenance:'🔧 Maintenance',cleaning:'🧹 Cleaning',electrical:'⚡ Electrical',plumbing:'🚿 Plumbing',appliance:'📱 Appliance',other:'📋 Other'};
const ICC_STATUS_LABELS={open:'Open',in_progress:'In Progress',waiting:'Waiting',resolved:'Resolved'};
function iccStat(label,val,color,bg,icon){
  return'<div class="icc-stat">'
    +'<div class="icc-stat-icon" style="background:'+bg+'">'+icon+'</div>'
    +'<div class="icc-stat-n" style="color:'+color+'">'+val+'</div>'
    +'<div class="icc-stat-l">'+label+'</div>'
    +'</div>';
}
function iccIssueRow(i){
  const td=today();
  const isOverdue=i.status!=='resolved'&&i.resolveBy&&i.resolveBy<td;
  const dateLabel=i.resolveBy?fmtDate(i.resolveBy):(i.createdAt?fmtDate(i.createdAt):'');
  const dotClass='icc-dot icc-dot-'+(i.status||'open');
  const isSelected=iccSelId===i.id;
  let badges='';
  if((i.priority||'medium')==='high')badges+='<span class="icc-badge icc-badge-high">High</span>';
  if(i.status==='in_progress')badges+='<span class="icc-badge icc-badge-prog">In Progress</span>';
  else if(i.status==='waiting')badges+='<span class="icc-badge icc-badge-wait">Waiting</span>';
  else if(i.status==='resolved')badges+='<span class="icc-badge icc-badge-done">Resolved</span>';
  if((i.photos||[]).length>0)badges+='<span class="icc-badge icc-badge-photo">📷 '+(i.photos||[]).length+'</span>';
  return'<div class="icc-row'+(i.status==='resolved'?' icc-row-resolved':'')+(isSelected?' icc-row-selected':'')+'" onclick="iccClickIssue(\''+i.id+'\')">'
    +'<div class="'+dotClass+'"></div>'
    +'<div class="icc-row-main">'
    +'<div class="icc-row-title">'+esc(i.title)+'</div>'
    +(badges?'<div class="icc-row-badges">'+badges+'</div>':'')
    +'</div>'
    +'<div class="icc-row-date'+(isOverdue?' overdue':'')+'">'+dateLabel+'</div>'
    +'<svg class="icc-row-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>'
    +'</div>';
}
function iccPropCard(sec){
  const p=sec.prop;
  const issues=sec.issues;
  const openIssues=issues.filter(i=>i.status!=='resolved');
  const urgentIssues=openIssues.filter(i=>(i.priority||'medium')==='high');
  const allClear=openIssues.length===0;
  let borderColor='#A1A1AA';
  if(urgentIssues.length>0)borderColor='#EF4444';
  else if(openIssues.filter(i=>i.status==='waiting').length>0)borderColor='#F59E0B';
  else if(openIssues.length>0)borderColor='#F59E0B';
  if(allClear&&issues.length>0)borderColor='#22C55E';
  let photoHtml='';
  if(p){
    const photo=(p.photos||[])[0];
    const ci=propColorIdx(p.id);
    if(photo){
      photoHtml='<img class="icc-prop-photo" src="'+photo+'" alt="'+esc(p.name)+'">';
    }else{
      photoHtml='<div class="icc-prop-photo-placeholder avatar pc-'+ci+'" title="Add property photo" onclick="_photoPropId=\''+p.id+'\';document.getElementById(\'photo-file\').click()">'+avInit(p.name)+'</div>';
    }
  }else{
    photoHtml='<div class="icc-prop-photo-placeholder" style="background:var(--surface2);color:var(--text3);font-size:22px">🏠</div>';
  }
  const name=p?esc(p.name):'General';
  const openCount=openIssues.length;
  const countStr=openCount===0?'✓ All clear':openCount+' open'+(urgentIssues.length?' \xb7 '+urgentIssues.length+' urgent':'');
  const addBtn='<button class="icc-add-issue-btn" onclick="openAddIssueFor(\''+(p?p.id:'')+'\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Issue</button>';
  let h='<div class="icc-prop-card" style="border-left-color:'+borderColor+'">';
  h+='<div class="icc-prop-card-hd">'+photoHtml;
  h+='<div class="icc-prop-card-info">';
  h+='<div class="icc-prop-card-name">'+name+'</div>';
  h+='<div class="icc-prop-card-counts'+(urgentIssues.length?' has-urgent':'')+'">'+countStr+'</div>';
  h+='</div>'+addBtn+'</div>';
  if(allClear){
    h+='<div class="icc-allclear"><div class="icc-allclear-icon">✓</div><div style="font-size:12px;font-weight:600;color:#15803d">No open issues — Everything looks good.</div></div>';
  }else{
    issues.sort((a,b)=>{const o={open:0,in_progress:1,waiting:2,resolved:3};return(o[a.status||'open']||0)-(o[b.status||'open']||0);});
    issues.forEach(function(i){h+=iccIssueRow(i);});
  }
  h+='</div>';
  return h;
}
function iccDetailPanel(){
  if(!iccSelId){
    return'<div class="icc-detail"><div class="icc-detail-empty">'
      +'<div style="font-size:32px;margin-bottom:12px">📋</div>'
      +'<div style="font-size:14px;font-weight:600;color:var(--text2)">Select an issue to view details.</div>'
      +'</div></div>';
  }
  const i=D.issues.find(x=>x.id===iccSelId);
  if(!i){iccSelId=null;return iccDetailPanel();}
  const p=D.props.find(x=>x.id===i.propId);
  const td=today();
  const isOverdue=i.status!=='resolved'&&i.resolveBy&&i.resolveBy<td;
  let photosHtml='<div class="icc-detail-sec-label" style="margin-top:4px">Photos</div><div class="photos-row" style="padding:0 18px 14px;flex-wrap:wrap;">';
  (i.photos||[]).forEach(function(ph,idx){photosHtml+='<img class="photo-thumb" src="'+ph+'" onclick="window._iid=\''+i.id+'\';viewIssuePhoto(\''+i.id+'\','+idx+')" style="width:64px;height:64px;border-radius:8px;object-fit:cover;cursor:pointer;border:1px solid var(--border)">';});
  if((i.photos||[]).length<5){photosHtml+='<div style="width:64px;height:64px;border-radius:8px;border:2px dashed var(--border2);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);font-size:20px;background:var(--surface2)" onclick="window._iid=\''+i.id+'\';document.getElementById(\'issue-photo-file\').click()">+</div>';}
  photosHtml+='</div>';
  const priLbl=(i.priority||'medium')==='high'?'High Priority':'Medium Priority';
  const priCls=(i.priority||'medium')==='high'?'icc-badge-high':'icc-badge-med';
  let actionBtns='';
  if(i.status==='resolved'){
    actionBtns+='<button class="icc-action-btn icc-action-reopen" onclick="iccStatus(\''+i.id+'\',\'open\')">↩ Reopen Issue</button>';
  }else{
    if(i.status!=='in_progress')actionBtns+='<button class="icc-action-btn icc-action-prog" onclick="iccStatus(\''+i.id+'\',\'in_progress\')">▶ Mark In Progress</button>';
    if(i.status!=='waiting')actionBtns+='<button class="icc-action-btn icc-action-wait" onclick="iccStatus(\''+i.id+'\',\'waiting\')">⏸ Mark Waiting</button>';
    actionBtns+='<button class="icc-action-btn icc-action-resolve" onclick="iccStatus(\''+i.id+'\',\'resolved\')">✓ Mark Resolved</button>';
  }
  actionBtns+='<button class="icc-action-btn" onclick="openEditIssue(\''+i.id+'\')">✎ Edit Issue</button>';
  actionBtns+='<button class="icc-action-btn icc-action-del" onclick="iccDelIssue(\''+i.id+'\')">✕ Delete Issue</button>';
  return'<div class="icc-detail">'
    +'<div class="icc-detail-hd"><div class="icc-detail-hd-title">Issue Details</div><button class="icc-detail-close" onclick="iccSelId=null;render()">\xd7</button></div>'
    +'<div style="padding:12px 18px 0;display:flex;align-items:center;gap:8px"><span class="icc-badge '+priCls+'" style="padding:4px 10px;font-size:10px">'+priLbl+'</span></div>'
    +'<div class="icc-detail-title">'+esc(i.title)+'</div>'
    +'<div class="icc-detail-meta">'
    +'<div class="icc-detail-meta-row"><span class="icc-detail-meta-label">Status</span><span class="icc-detail-meta-val">'+(ICC_STATUS_LABELS[i.status||'open']||'Open')+'</span></div>'
    +(p?'<div class="icc-detail-meta-row"><span class="icc-detail-meta-label">Property</span><span class="icc-detail-meta-val">'+esc(p.name)+'</span></div>':'')
    +'<div class="icc-detail-meta-row"><span class="icc-detail-meta-label">Category</span><span class="icc-detail-meta-val">'+(ICC_CATS[i.category||'other']||'Other')+'</span></div>'
    +(i.createdAt?'<div class="icc-detail-meta-row"><span class="icc-detail-meta-label">Reported</span><span class="icc-detail-meta-val">'+fmtDate(i.createdAt)+'</span></div>':'')
    +(i.resolveBy?'<div class="icc-detail-meta-row"><span class="icc-detail-meta-label">Resolve by</span><span class="icc-detail-meta-val'+(isOverdue?' overdue':'')+'">'+fmtDate(i.resolveBy)+(isOverdue?' ⚠':'')+'</span></div>':'')
    +'</div>'
    +(i.waitingFor?'<div class="icc-detail-waiting">⏸ Waiting for: '+esc(i.waitingFor)+'</div>':'')
    +(i.note?'<div class="icc-detail-note">'+esc(i.note)+'</div>':'')
    +photosHtml
    +'<div class="icc-detail-actions">'+actionBtns+'</div>'
    +'</div>';
}
function iccClickIssue(id){
  if(window.innerWidth>=900){iccSelId=id;render();}
  else{openIssue(id);}
}
function iccStatus(id,status){
  const i=D.issues.find(x=>x.id===id);if(!i)return;
  i.status=status;
  i.resolvedAt=status==='resolved'?today():'';
  iccSelId=id;save();render();
}
function iccDelIssue(id){
  if(!confirm('Delete this issue?'))return;
  D.issues=D.issues.filter(x=>x.id!==id);
  if(iccSelId===id)iccSelId=null;
  save();render();toast('Issue deleted.');
}
function issueHtml(i){
  const p=D.props.find(x=>x.id===i.propId);
  const resolved=i.status==='resolved';
  const sb=resolved?'<span class="badge b-resolved">Resolved</span>':'<span class="badge b-open">Open</span>';
  const photoCount=(i.photos||[]).length;
  const td=today();
  const isOverdue=!resolved&&i.resolveBy&&i.resolveBy<td;
  const resolveLabel=i.resolveBy?'<span style="font-size:10px;font-weight:700;color:'+(isOverdue?'var(--red)':resolved?'var(--accent)':'var(--text3)')+';font-family:\'DM Mono\',monospace;margin-left:4px">'+(resolved?'✓ resolved':'by '+fmtDate(i.resolveBy))+(isOverdue?' ⚠':'')+'</span>':'';
  return'<div class="issue-item" onclick="openIssue(\''+i.id+'\')" style="'+(resolved?'background:var(--accent-bg);border-color:var(--accent-border)':'')+';">'
    +'<div class="issue-title" style="color:'+(resolved?'var(--accent-text)':'var(--text)')+'">'+esc(i.title)+sb+(photoCount?'<span class="badge" style="background:var(--surface2);color:var(--text3)">📷 '+photoCount+'</span>':'')+'</div>'
    +(p?'<div class="issue-meta" style="color:'+(resolved?'var(--accent)':'var(--text2)')+'">'+esc(p.name)+resolveLabel+'</div>':''+resolveLabel)
    +(i.note?'<div style="font-size:12px;color:'+(resolved?'var(--accent)':'var(--text3)')+';opacity:0.8;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">'+esc(i.note)+'</div>':'')
    +'</div>';
}
function renderIssuesList(){
  const td=today();
  const weekAgo=addDays(td,-7);
  const openCount=D.issues.filter(i=>i.status==='open'||i.status==='in_progress').length;
  const urgentCount=D.issues.filter(i=>(i.priority||'medium')==='high'&&i.status!=='resolved').length;
  const waitCount=D.issues.filter(i=>i.status==='waiting').length;
  const resolvedCount=D.issues.filter(i=>i.status==='resolved'&&i.resolvedAt&&i.resolvedAt>=weekAgo).length;
  let h='<div class="icc-page">';
  h+='<div class="sv-page-header" style="margin-bottom:20px"><div class="sv-page-heading"><div class="sv-title">Issues</div><div class="sv-subtitle">Track, organise and resolve property issues</div></div>';
  h+='<button class="sv-btn sv-btn-primary" onclick="openAddIssue()">+ Log Issue</button></div>';
  h+='<div class="icc-summary">';
  h+=iccStat('Open',openCount,'var(--amber-text)','var(--amber-bg)','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>');
  h+=iccStat('Urgent',urgentCount,'var(--red-text)','var(--red-bg)','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>');
  h+=iccStat('Waiting',waitCount,'#b91c1c','rgba(248,113,113,.12)','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>');
  h+=iccStat('Resolved /7d',resolvedCount,'var(--accent-text)','var(--accent-bg)','<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>');
  h+='</div>';
  h+='<div class="icc-controls">';
  h+='<input class="icc-search" type="text" placeholder="🔍 Search issues..." value="'+esc(issueSearch||'')+'" oninput="issueSearch=this.value;render()">';
  h+='<div class="sv-chip-row" style="padding-bottom:2px">';
  [['all','All'],['open','Open'],['in_progress','In Progress'],['waiting','Waiting'],['resolved','Resolved']].forEach(function(s){
    h+='<button class="sv-chip'+(issueStatusFilter===s[0]?' active':'')+'" onclick="issueStatusFilter=\''+s[0]+'\';render()">'+s[1]+'</button>';
  });
  if(D.props.length>0){D.props.forEach(function(p){h+='<button class="sv-chip'+(issueFilter===p.id?' active':'')+'" onclick="issueFilter=(issueFilter===\''+p.id+'\'?\'all\':\''+p.id+'\');render()">'+esc(p.name)+'</button>';});}
  h+='</div></div>';
  const filtered=D.issues.filter(function(i){
    if(issueStatusFilter!=='all'&&i.status!==issueStatusFilter)return false;
    if(issueFilter!=='all'&&i.propId!==issueFilter)return false;
    if(issueSearch){const q=issueSearch.toLowerCase();if(!i.title.toLowerCase().includes(q)&&!(i.note||'').toLowerCase().includes(q))return false;}
    return true;
  });
  const sections=[];
  D.props.forEach(function(p){
    const pIssues=filtered.filter(function(i){return i.propId===p.id;});
    if(pIssues.length>0||(issueFilter==='all'&&issueStatusFilter==='all'&&!issueSearch)){sections.push({prop:p,issues:pIssues});}
  });
  const noProps=filtered.filter(function(i){return!i.propId;});
  if(noProps.length>0)sections.push({prop:null,issues:noProps});
  if(D.props.length===0&&filtered.length>0)sections.push({prop:null,issues:filtered});
  h+='<div class="icc-layout"><div class="icc-left">';
  if(sections.length===0&&D.issues.length===0){
    h+='<div class="sv-empty"><div class="sv-empty-title">No issues logged yet</div><div class="sv-empty-sub">Use the Log Issue button to track property issues.</div></div>';
  }else if(sections.length===0){
    h+='<div class="sv-empty"><div class="sv-empty-title">No matching issues</div><div class="sv-empty-sub">Try adjusting the filters above.</div></div>';
  }else{h+='<div class="icc-board">';sections.forEach(function(sec){h+=iccPropCard(sec);});h+='</div>';}
  h+='</div><div class="icc-right'+(iccSelId?' has-sel':'')+'">'+iccDetailPanel()+'</div></div></div>';
  return h;
}


/* ── SUPPLIES RENDERING ── */
function renderSupplies(){
  const needBuy=D.supplies.filter(s=>s.have<s.need).length;
  let h='<div class="sv-page-header" style="margin-bottom:14px"><div class="sv-page-heading"><div class="sv-title">Stock</div><div class="sv-subtitle">'+(needBuy>0?needBuy+' item'+(needBuy>1?'s':'')+' need restocking':'All items stocked ✓')+'</div></div>'
    +'<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="resetSupplies()">Reset</button></div>';
  h+='<div class="quick-add"><input type="text" id="supply-input" placeholder="Add supply item..." onkeydown="if(event.which===13)addSupply()"><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="addSupply()">Add</button></div>';
  if(D.supplies.length===0)return h+'<div class="sv-empty"><div class="sv-empty-title">No items yet</div><div class="sv-empty-sub">Add supply items you track for your properties.</div></div>';
  const needed=D.supplies.filter(s=>s.have<s.need);
  const stocked=D.supplies.filter(s=>s.have>=s.need);
  if(needed.length){h+='<div class="sec sec-amber" style="margin-top:0">Need to buy ('+needed.length+')</div><div class="supplies-grid">'+needed.map(s=>supplyCard(s)).join('')+'</div>';}
  if(stocked.length){h+='<div class="sec sec-teal">Stocked ('+stocked.length+')</div><div class="supplies-grid">'+stocked.map(s=>supplyCard(s)).join('')+'</div>';}
  return h;
}
function supplyCard(s){
  const toBuy=Math.max(0,s.need-s.have);
  const isStocked=s.have>=s.need;
  const sid=s.id;
  return'<div class="supply-card">'
    +'<div class="supply-row1"><span class="supply-name">'+esc(s.text)+'</span>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +(isStocked?'<span class="supply-status stocked">Stocked</span>':'<span class="supply-status needed">Buy '+toBuy+'</span>')
    +'<button style="font-size:13px;padding:4px 8px;background:none;border:none;color:var(--text3);cursor:pointer;font-weight:700" data-del-supply="'+sid+'">✕</button>'
    +'</div></div>'
    +'<div class="supply-qty-row">'
    +'<div class="qty-group"><span class="qty-label">Have</span>'
    +'<div class="qty-controls">'
    +'<button class="qty-btn" data-supply="'+sid+'" data-field="have" data-delta="-1">−</button>'
    +'<span class="qty-val">'+s.have+'</span>'
    +'<button class="qty-btn" data-supply="'+sid+'" data-field="have" data-delta="1">+</button>'
    +'</div></div>'
    +'<div style="color:var(--text3);font-size:18px;font-weight:300;padding-top:16px">→</div>'
    +'<div class="qty-group"><span class="qty-label">Need</span>'
    +'<div class="qty-controls">'
    +'<button class="qty-btn" data-supply="'+sid+'" data-field="need" data-delta="-1">−</button>'
    +'<span class="qty-val">'+s.need+'</span>'
    +'<button class="qty-btn" data-supply="'+sid+'" data-field="need" data-delta="1">+</button>'
    +'</div></div>'
    +'</div></div>';
}

function adjustSupply(id,field,delta){const s=D.supplies.find(x=>x.id===id);if(!s)return;s[field]=Math.max(0,s[field]+delta);save();render();}
function addSupply(){const el=document.getElementById('supply-input');const text=(el?.value||'').trim();if(!text)return;D.supplies.push({id:uid(),text,have:0,need:1});el.value='';save();render();}
function deleteSupply(id){D.supplies=D.supplies.filter(x=>x.id!==id);save();render();}
function resetSupplies(){D.supplies.forEach(s=>{s.have=0;});save();render();toast('Supplies reset!');}
function toggleSupply(id){const s=D.supplies.find(x=>x.id===id);if(!s)return;s.checked=!s.checked;save();render();}

/* ── SCRATCHPAD ── */
function renderScratch(){
  return'<div class="sv-page-header" style="margin-bottom:16px"><div class="sv-page-heading"><div class="sv-title">Ops Notes</div><div class="sv-subtitle">A free space for notes, ideas, anything.</div></div></div>'
    +'<textarea class="scratch-area" id="scratch-area" placeholder="Start typing..." oninput="saveScratch()">'+esc(D.scratch)+'</textarea>';
}
function saveScratch(){const el=document.getElementById('scratch-area');if(el){D.scratch=el.value;save();}}

/* ── ISSUE MODALS ── */
function openAddIssue(){openAddIssueFor('');}
function openAddIssueFor(propId){
  const po='<option value="">No specific property</option>'+D.props.map(p=>'<option value="'+p.id+'"'+(propId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const catOpts=Object.keys(ICC_CATS).map(k=>'<option value="'+k+'">'+ICC_CATS[k]+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Log an issue</div>'
    +'<div class="field"><label>What is the issue?</label><input type="text" id="iss-title" placeholder="e.g. Broken boiler"></div>'
    +'<div class="field"><label>Property</label><select id="iss-prop">'+po+'</select></div>'
    +'<div class="field"><label>Priority</label><select id="iss-priority"><option value="medium">Medium</option><option value="high">High / Urgent</option><option value="low">Low</option></select></div>'
    +'<div class="field"><label>Category</label><select id="iss-cat">'+catOpts+'</select></div>'
    +'<div class="field"><label>Resolve by date <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="date" id="iss-resolve-by"></div>'
    +'<div class="field"><label>Waiting for <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="text" id="iss-waiting" placeholder="e.g. Plumber callback"></div>'
    +'<div class="field"><label>Details <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(optional)</span></label><textarea id="iss-note" placeholder="Any extra details..." style="height:68px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-amber-sm" style="flex:1;padding:14px" onclick="saveIssue()">Save issue</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}

function saveIssue(){
  const title=(document.getElementById('iss-title')||{}).value||'';
  const propId=(document.getElementById('iss-prop')||{}).value||'';
  const note=(document.getElementById('iss-note')||{}).value||'';
  const resolveBy=(document.getElementById('iss-resolve-by')||{}).value||'';
  const priority=(document.getElementById('iss-priority')||{}).value||'medium';
  const category=(document.getElementById('iss-cat')||{}).value||'other';
  const waitingFor=(document.getElementById('iss-waiting')||{}).value||'';
  if(!title.trim()){alert('Please describe the issue.');return;}
  D.issues.push({id:uid(),title:title.trim(),propId,note,status:'open',createdAt:today(),resolvedAt:'',photos:[],resolveBy,priority,category,waitingFor});
  save();closeModal();render();toast('Issue logged!');
}

function openIssue(id){
  const i=D.issues.find(x=>x.id===id);if(!i)return;
  window._iid=id;
  const p=D.props.find(x=>x.id===i.propId);
  const resolved=i.status==='resolved';
  const td2=today();
  const isOverdue=!resolved&&i.resolveBy&&i.resolveBy<td2;
  const resolveByHtml=i.resolveBy?'<div style="font-size:12px;font-weight:700;color:'+(isOverdue?'var(--red)':resolved?'var(--accent)':'var(--text3)')+';margin-bottom:10px;font-family:\'DM Mono\',monospace">'+(resolved?'✓ Resolved by '+fmtDate(i.resolveBy):'Resolve by: '+fmtDate(i.resolveBy))+(isOverdue?' ⚠ overdue':'')+'</div>':'';
  let photosHtml='<div class="photos-row" style="margin-bottom:8px">';
  (i.photos||[]).forEach(function(ph,idx2){
    photosHtml+='<img class="photo-thumb" src="'+ph+'" data-view-issue-photo="'+idx2+'" alt="Issue photo" style="width:68px;height:68px;border-radius:10px;object-fit:cover;cursor:pointer;border:1px solid var(--border)">';
  });
  if((i.photos||[]).length<3){
    photosHtml+='<div class="photo-add-btn" data-add-issue-photo="1" style="width:68px;height:68px;border-radius:10px;border:2px dashed var(--border2);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);font-size:22px;background:var(--surface2)">+</div>';
  }
  photosHtml+='</div>';
  const statusBtn=resolved
    ?'<button class="btn btn-amber-sm btn-sm" onclick="setIssueStatus(window._iid,\'open\')">Reopen</button>'
    :'<button class="btn btn-accent-sm btn-sm" onclick="setIssueStatus(window._iid,\'resolved\')">Mark resolved ✓</button>';
  showModal('<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
    +'<div class="modal-title" style="margin-bottom:0">'+esc(i.title)+'</div>'
    +'<div style="display:flex;gap:6px"><span class="badge '+(resolved?'b-resolved':'b-open')+'">'+(resolved?'Resolved':'Open')+'</span>'
    +'<button class="btn btn-ghost btn-sm" onclick="openEditIssue(window._iid)">Edit</button></div></div>'
    +(p?'<div style="font-size:13px;color:var(--text2);font-weight:600;margin-bottom:6px">'+esc(p.name)+'</div>':'')
    +resolveByHtml
    +(i.note?'<div style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:12px;font-weight:500">'+esc(i.note)+'</div>':'')
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Photos</div>'
    +photosHtml
    +'<div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap">'
    +statusBtn
    +'<button class="btn btn-red-sm btn-sm" onclick="delIssue(window._iid)">Delete</button>'
    +'<button class="btn btn-ghost btn-sm" onclick="closeModal()">Close</button></div>');
}

function openEditIssue(id){
  const i=D.issues.find(x=>x.id===id);if(!i)return;
  const po='<option value="">No specific property</option>'+D.props.map(p=>'<option value="'+p.id+'"'+(i.propId===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('');
  const catOpts=Object.keys(ICC_CATS).map(k=>'<option value="'+k+'"'+(i.category===k?' selected':'')+'>'+ICC_CATS[k]+'</option>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit issue</div>'
    +'<div class="field"><label>Title</label><input type="text" id="ei-title" value="'+esc(i.title)+'"></div>'
    +'<div class="field"><label>Property</label><select id="ei-prop">'+po+'</select></div>'
    +'<div class="field"><label>Priority</label><select id="ei-priority"><option value="medium"'+(i.priority!=='high'&&i.priority!=='low'?' selected':'')+'>Medium</option><option value="high"'+(i.priority==='high'?' selected':'')+'>High / Urgent</option><option value="low"'+(i.priority==='low'?' selected':'')+'>Low</option></select></div>'
    +'<div class="field"><label>Category</label><select id="ei-cat">'+catOpts+'</select></div>'
    +'<div class="field"><label>Resolve by date <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="date" id="ei-resolve-by" value="'+(i.resolveBy||'')+'"></div>'
    +'<div class="field"><label>Waiting for <span style="font-weight:400;color:var(--text3)">(optional)</span></label><input type="text" id="ei-waiting" placeholder="e.g. Plumber callback" value="'+esc(i.waitingFor||'')+'"></div>'
    +'<div class="field"><label>Details</label><textarea id="ei-note" style="height:80px">'+esc(i.note||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-amber-sm" style="flex:1;padding:14px" onclick="saveEditIssue(\''+id+'\')">Save changes</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveEditIssue(id){
  const i=D.issues.find(x=>x.id===id);if(!i)return;
  const title=(document.getElementById('ei-title')||{}).value||'';
  const propId=(document.getElementById('ei-prop')||{}).value||'';
  const note=(document.getElementById('ei-note')||{}).value||'';
  const resolveBy=(document.getElementById('ei-resolve-by')||{}).value||'';
  const priority=(document.getElementById('ei-priority')||{}).value||'medium';
  const category=(document.getElementById('ei-cat')||{}).value||'other';
  const waitingFor=(document.getElementById('ei-waiting')||{}).value||'';
  if(!title.trim()){alert('Please enter a title.');return;}
  i.title=title.trim();i.propId=propId;i.note=note;i.resolveBy=resolveBy;
  i.priority=priority;i.category=category;i.waitingFor=waitingFor;
  save();closeModal();iccSelId=id;render();toast('Issue updated!');
}

function setIssueStatus(id,status){const i=D.issues.find(x=>x.id===id);if(!i)return;i.status=status;i.resolvedAt=status==='resolved'?today():'';save();openIssue(id);render();}
function delIssue(id){if(!confirm('Delete this issue?'))return;D.issues=D.issues.filter(x=>x.id!==id);save();closeModal();render();}
function viewIssuePhoto(id,idx){
  const i=D.issues.find(x=>x.id===id);if(!i||!i.photos[idx])return;
  window._iid=id;window._iidx=idx;
  showModal('<div class="modal-handle"></div><img src="'+i.photos[idx]+'" style="width:100%;max-height:220px;object-fit:contain;border-radius:12px;margin-bottom:14px;background:var(--surface2)" alt="Issue photo">'
    +'<div style="display:flex;gap:8px"><button class="btn btn-danger" style="flex:1" onclick="removeIssuePhoto(window._iid,window._iidx)">Delete</button>'
    +'<button class="btn btn-ghost" style="flex:1" onclick="openIssue(window._iid)">Back</button></div>');
}

function removeIssuePhoto(id,idx){if(!confirm('Delete this photo?'))return;const i=D.issues.find(x=>x.id===id);if(i){i.photos.splice(idx,1);save();openIssue(id);}}

