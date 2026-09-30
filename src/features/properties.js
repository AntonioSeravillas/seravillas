/* ── PROPERTIES LIST ── */
/* ── Property occupancy helpers ── */
function propOccupancyStatus(propId,td){
  var bks=(D.bookings||[]).filter(function(b){return b.propId===propId&&b.status!=='cancelled';});
  var b=bks.find(function(b2){return b2.checkIn===td;});
  if(b)return{type:'checkin',label:'Check-in today',booking:b};
  b=bks.find(function(b2){return b2.checkIn<td&&b2.checkOut>td;});
  if(b)return{type:'occupied',label:'Occupied',booking:b};
  b=bks.find(function(b2){return b2.checkOut===td;});
  if(b)return{type:'checkout',label:'Check-out today',booking:b};
  return{type:'empty',label:'Empty',booking:null};
}
function propNextBooking(propId,td){
  return(D.bookings||[]).filter(function(b){return b.propId===propId&&b.status!=='cancelled'&&b.checkIn>td;}).sort(function(a,b){return a.checkIn.localeCompare(b.checkIn);})[0]||null;
}
function phStripItem(val,label,color){
  return'<div class="ph-strip-item"><div class="ph-strip-n"'+(color?' style="color:'+color+'"':'')+'>'+val+'</div><div class="ph-strip-l">'+label+'</div></div>';
}

function renderProperties(){
  // Sub-tabs: Properties | Report
  const subTabs='<div class="sv-tabs" style="margin-bottom:20px">'
    +'<button class="sv-tab'+(propsView==='list'?' active':'')+'" onclick="propsView=\'list\';render()">Properties</button>'
    +'<button class="sv-tab'+(propsView==='report'?' active':'')+'" onclick="propsView=\'report\';render()">Revenue</button>'
    +'</div>';
  if(propsView==='report') return subTabs+renderBookingReport();

  // Property cards
  const td=today();
  const _sChipCls={occupied:'ph-status-occupied',checkin:'ph-status-checkin',checkout:'ph-status-checkout',empty:'ph-status-empty'};
  const pCards=D.props.map(p=>{
    const occ=propOccupancyStatus(p.id,td);
    const nextBk=propNextBooking(p.id,td);
    const nextClean=D.sessions.filter(s=>s.propId===p.id&&s.date>=td&&s.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date))[0];
    const ot=D.tasks.filter(t=>t.propId===p.id&&!t.done).length;
    const oi=D.issues.filter(i=>i.propId===p.id&&i.status==='open').length;
    const ci=propColorIdx(p.id);
    const photo=(p.photos||[])[0];
    const photoEl=photo
      ?'<img class="ph-prop-photo" src="'+photo+'" alt="'+esc(p.name)+'">'
      :'<div class="avatar pc-'+ci+' ph-prop-avatar">'+avInit(p.name)+'</div>';
    const statusChip='<span class="ph-status-chip '+(_sChipCls[occ.type]||'ph-status-empty')+'">'+occ.label+'</span>';
    let guestLine='';
    if(occ.booking&&occ.booking.guestName){
      if(occ.type==='occupied')guestLine='👤 '+esc(occ.booking.guestName)+' · until '+fmtDate(occ.booking.checkOut);
      else if(occ.type==='checkin')guestLine='👤 '+esc(occ.booking.guestName)+' · '+nightsBetween(occ.booking.checkIn,occ.booking.checkOut)+' nights';
      else if(occ.type==='checkout')guestLine='👤 '+esc(occ.booking.guestName)+' checking out';
    }else if(nextBk&&nextBk.guestName){guestLine='Next: '+esc(nextBk.guestName)+' · '+fmtDate(nextBk.checkIn);}
    const allClear=!nextClean&&!ot&&!oi;
    const metaChips=(nextClean?'<span style="font-size:11px;font-weight:600;color:var(--accent);display:inline-flex;align-items:center;gap:3px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'+fmtDate(nextClean.date)+'</span>':'')
      +(oi?'<span style="font-size:11px;font-weight:600;color:var(--amber-text,var(--amber))">'+oi+' issue'+(oi>1?'s':'')+'</span>':'')
      +(ot?'<span style="font-size:11px;font-weight:600;color:var(--purple)">'+ot+' task'+(ot>1?'s':'')+'</span>':'')
      +(allClear?'<span style="font-size:11px;font-weight:600;color:var(--accent)">All clear ✓</span>':'');
    return'<div class="ph-prop-card" onclick="go(\'properties\',\''+p.id+'\')">'
      +photoEl
      +'<div class="ph-prop-body">'
      +'<div class="ph-prop-row1"><div class="ph-prop-name">'+esc(p.name)+'</div>'+statusChip+'</div>'
      +(guestLine?'<div class="ph-prop-guest">'+guestLine+'</div>':'')
      +'<div class="ph-prop-meta">'+metaChips+'</div>'
      +'</div>'
      +'<svg class="ph-prop-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
      +'</div>';
  }).join('');

  const notifPerm='Notification' in window?Notification.permission:'unsupported';
  const notifHtml=notifPerm==='granted'
    ?'<div style="font-size:13px;color:var(--accent);font-weight:600">Reminders enabled ✓</div>'
    :notifPerm==='denied'
    ?'<div style="font-size:13px;color:var(--danger,var(--red));font-weight:500">Blocked — allow in Settings → Safari</div>'
    :'<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="requestNotif()">Enable day-before reminders</button>';

  return subTabs
    +'<div class="sv-page-header" style="margin-bottom:16px">'
    +'<div class="sv-page-heading"><div class="sv-title">Properties</div><div class="sv-subtitle">Tap a villa to view sessions, tasks and issues</div></div>'
    +'<div class="sv-actions"><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="document.getElementById(\'prop-in\').focus()">+ Villa</button></div>'
    +'</div>'
    +(D.props.length===0?'<div class="sv-empty"><div class="sv-empty-title">No properties yet</div><div class="sv-empty-sub">Add your first villa below.</div></div>':pCards)
    +'<div style="margin-bottom:20px"><div class="input-row"><input type="text" id="prop-in" placeholder="Add new property..."><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="addProp()">Add</button></div></div>'
    +'<div class="sv-card" style="margin-bottom:10px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Reminders</div>'
    +notifHtml+'</div>'
    +'<div class="sv-card" style="margin-bottom:10px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px">Data &amp; Backup</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    +'<div><div style="font-size:13px;font-weight:600;color:var(--text)">Storage used</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-top:2px">'+getDataSizeKB()+' KB of ~5,000 KB</div></div>'
    +'<div style="background:var(--surface2);border-radius:99px;height:6px;width:80px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:99px;width:'+Math.min(100,Math.round(getDataSizeKB()/50))+'%"></div></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:8px">'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" style="flex:1" onclick="exportData()">⬇ Export</button>'
    +'<button class="sv-btn sv-btn-ghost sv-btn-sm" style="flex:1" onclick="restoreBackup()">↩ Restore</button>'
    +'<button class="sv-btn sv-btn-ghost sv-btn-sm" style="flex:1" onclick="document.getElementById(\'import-file\').click()">Import backup</button>'
    +'</div>'
    +(SV_STORAGE.getItem(BACKUP_DATE_KEY)?'<div style="font-size:11px;color:var(--accent);font-weight:600">✓ Auto-backup from '+SV_STORAGE.getItem(BACKUP_DATE_KEY)+'</div>':'<div style="font-size:11px;color:var(--text3)">No auto-backup yet</div>')
    +'</div>'
    +'<button class="sv-btn sv-btn-secondary sv-btn-sm" style="width:100%;margin-bottom:10px" onclick="openExcelImport()">Import bookings from Excel</button>'
    +(SV_STORAGE.getItem(DB+'_beforeExcelImport')?'<button class="sv-btn sv-btn-ghost sv-btn-sm" style="width:100%;margin-bottom:20px" onclick="restoreBeforeExcelImport()">Restore before last Excel import</button>':'')
    +'<div class="sv-card">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Cloud Sync</div>'
    +'<div class="sync-bar" style="margin-bottom:10px"><div class="sync-dot '+syncStatus+'" id="sync-dot-props"></div><span id="sync-label-props">'+(DEV_MODE?'Cloud sync disabled (development preview)':{idle:'Not synced',syncing:'Syncing…',ok:'Synced',error:'Sync failed'}[syncStatus])+'</span><button class="sync-btn" onclick="syncNow()"'+(DEV_MODE?' disabled title="Cloud sync is disabled in the development preview" style="opacity:.5;cursor:not-allowed"':'')+'>Sync now</button></div>'
    +(DEV_MODE?'<div style="font-size:11px;color:var(--text3)">Development preview — no access key needed. Data stays in this browser only.</div>':'<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="resetAccess()">Sign out / change access key</button>')
    +'</div>';
}


/* ── PROPERTY HUB ── */
function renderPropHub(pid){
  const p=D.props.find(x=>x.id===pid);if(!p)return'';
  const td=today();
  const uc=D.sessions.filter(s=>s.propId===pid&&s.date>=td&&s.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const ot=D.tasks.filter(t=>t.propId===pid&&!t.done).sort((a,b)=>(b.urgent?1:0)-(a.urgent?1:0));
  const oi=D.issues.filter(i=>i.propId===pid&&i.status==='open');
  const past=D.sessions.filter(s=>s.propId===pid&&s.date<td).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  const ci=propColorIdx(pid);
  const photo=(p.photos||[])[0];
  const heroPhoto=photo
    ?'<img src="'+photo+'" style="width:56px;height:56px;border-radius:16px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)" alt="'+esc(p.name)+'">'
    :'<div class="avatar pc-'+ci+'" style="width:56px;height:56px;border-radius:16px;font-size:17px;font-weight:800;flex-shrink:0">'+avInit(p.name)+'</div>';

  let h='<button class="back-btn" onclick="go(\'properties\')">'
    +'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>All properties</button>';

  h+='<div class="sv-page-header" style="margin-bottom:14px">'
    +'<div style="display:flex;align-items:center;gap:14px;min-width:0">'
    +heroPhoto
    +'<div style="flex:1;min-width:0">'
    +'<div class="sv-title" style="font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'
    +'<div class="sv-subtitle" style="margin-top:2px">'+D.sessions.filter(s=>s.propId===pid).length+' sessions total'+(oi.length?' · '+oi.length+' open issue'+(oi.length>1?'s':''):'')+(ot.length?' · '+ot.length+' task'+(ot.length>1?'s':''):'')+'</div>'
    +'</div></div>'
    +'<div class="sv-actions">'
    +'<button class="sv-btn sv-btn-ghost sv-btn-sm" onclick="openPropNotes(\''+pid+'\')">Notes</button>'
    +'</div></div>';

  // ── Summary strip ──
  const occ=propOccupancyStatus(pid,td);
  const nextBkHub=propNextBooking(pid,td);
  const occBk=occ.booking;
  const _sColors={occupied:'var(--accent-text)',checkin:'#0A84FF',checkout:'var(--amber-text,var(--amber))',empty:'#30D158'};
  let _guestDisp='—',_guestLbl='Guest';
  if(occBk&&occBk.guestName){
    _guestDisp=esc(occBk.guestName.split(' ')[0]);
    _guestLbl=occ.type==='checkout'?'Checking out':'Current guest';
  }else if(nextBkHub&&nextBkHub.guestName){
    _guestDisp=esc(nextBkHub.guestName.split(' ')[0]);
    _guestLbl='Next guest';
  }
  let _dateDisp='—',_dateLbl='Next check-in';
  if((occ.type==='occupied'||occ.type==='checkin')&&occBk){
    _dateDisp=fmtDate(occBk.checkOut);_dateLbl='Check-out';
  }else if(nextBkHub){
    _dateDisp=fmtDate(nextBkHub.checkIn);_dateLbl='Next check-in';
  }
  h+='<div class="ph-strip">'
    +phStripItem(occ.label,'Status',_sColors[occ.type]||'#30D158')
    +phStripItem(_guestDisp,_guestLbl,'')
    +phStripItem(_dateDisp,_dateLbl,'')
    +phStripItem(uc[0]?fmtDate(uc[0].date):'—','Next cleaning',uc[0]?'var(--accent)':'')
    +phStripItem(oi.length?String(oi.length):'✓',oi.length?'Open issues':'No issues',oi.length?'var(--amber-text,var(--amber))':'var(--accent)')
    +phStripItem(ot.length?String(ot.length):'✓',ot.length?'Open tasks':'No tasks',ot.length?'var(--purple-text,var(--purple))':'var(--accent)')
    +'</div>';

  if(p.notes&&p.notes.trim())h+='<div class="prop-notes-box" style="margin-bottom:14px">'+esc(p.notes)+'</div>';

  // Photos
  h+='<div class="sv-card" style="margin-bottom:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Photos</div>'
    +'<div class="photos-row">';
  (p.photos||[]).forEach((ph,idx)=>{h+='<img class="photo-thumb" src="'+ph+'" onclick="viewPhoto(\''+pid+'\','+idx+')" alt="Property photo">';});
  if((p.photos||[]).length<3)h+='<div class="photo-add-btn" onclick="_photoPropId=\''+pid+'\';document.getElementById(\'photo-file\').click()">+</div>';
  h+='</div></div>';

  // Upcoming bookings
  const _upBks=(D.bookings||[]).filter(function(b){return b.propId===pid&&b.status!=='cancelled'&&b.checkOut>=td;}).sort(function(a,b){return a.checkIn.localeCompare(b.checkIn);}).slice(0,8);
  h+='<div class="sv-card" style="margin-bottom:12px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em">Upcoming Bookings</div>'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" onclick="openAddBookingModal()">+ Booking</button></div>';
  if(_upBks.length===0){
    h+='<div class="sv-empty" style="padding:8px 0 4px"><div class="sv-empty-title">No upcoming bookings</div></div>';
  }else{
    _upBks.forEach(function(b){
      var nights=nightsBetween(b.checkIn,b.checkOut);
      h+='<div class="ph-bk-row" onclick="openBookingDetail(\''+b.id+'\')">'
        +'<div style="min-width:0">'
        +'<div class="ph-bk-guest">'+esc(b.guestName||'Guest')+'</div>'
        +'<div class="ph-bk-meta">'
        +platformBadge(b.platform,b.agencyName)
        +'<span style="font-size:10px;font-weight:700;color:var(--text3);font-family:\'DM Mono\',monospace">'+fmtDate(b.checkIn)+' → '+fmtDate(b.checkOut)+'</span>'
        +(b.guestCount?'<span style="font-size:10px;font-weight:600;color:var(--text3)">👥 '+b.guestCount+'</span>':'')
        +'</div></div>'
        +'<div class="ph-bk-right">'
        +(b._excel&&b._excel.priceUnknown?'<div class="ph-bk-price">Price unknown</div>':b.totalPrice||b._excel?'<div class="ph-bk-price">'+fmtEur(b.totalPrice)+'</div>':'')
        +'<div class="ph-bk-nights">'+nights+'n</div>'
        +'</div></div>';
    });
  }
  h+='</div>';

  // Upcoming cleanings
  h+='<div class="sv-card" style="margin-bottom:12px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em">Upcoming Cleanings</div>'
    +'<button class="sv-btn sv-btn-primary sv-btn-sm" data-nav="add">+ Schedule</button></div>'
    +(uc.length===0?'<div class="sv-empty" style="padding:8px 0 4px"><div class="sv-empty-title">None scheduled</div></div>':uc.slice(0,4).map(s=>sessCard(s,true)).join(''))
    +'</div>';

  // Open tasks
  h+='<div class="sv-card" style="margin-bottom:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Open Tasks</div>';
  if(ot.length===0)h+='<div class="sv-empty" style="padding:8px 0 4px"><div class="sv-empty-title">No open tasks</div></div>';
  else h+=ot.map(t=>taskSwipeWrap(t)).join('');
  h+='<div style="margin-top:10px"><div class="quick-add"><input type="text" id="hub-task-input" placeholder="Add task..." onkeydown="if(event.key===\'Enter\')quickAddTaskForProp(\''+pid+'\')"><button class="sv-btn sv-btn-primary sv-btn-sm" onclick="quickAddTaskForProp(\''+pid+'\')">Add</button></div></div>'
    +'</div>';

  // Issues
  h+='<div class="sv-card" style="margin-bottom:12px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em">Open Issues</div>'
    +'<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="openAddIssueFor(\''+pid+'\')">+ Issue</button></div>';
  if(oi.length===0)h+='<div class="sv-empty" style="padding:8px 0 4px"><div class="sv-empty-title">No open issues</div></div>';
  else h+=oi.map(i=>issueHtml(i)).join('');
  h+='</div>';

  // Recent history
  if(past.length){
    h+='<div class="sv-card" style="margin-bottom:12px">'
      +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Recent History</div>'
      +past.map(s=>sessCard(s,true)).join('')
      +'</div>';
  }

  // Danger zone
  h+='<div style="padding-top:4px;margin-bottom:8px">'
    +'<button class="sv-btn sv-btn-danger" style="width:100%" onclick="delProp(\''+pid+'\')">Remove this property</button>'
    +'</div>';

  return h;
}


/* ── PHOTOS (property) ── */
function compressImage(file,cb){
  const img=new Image();const reader=new FileReader();
  reader.onload=ev=>{img.onload=()=>{
    const canvas=document.createElement('canvas');
    let w=img.width,hh=img.height;
    if(w>800){hh=hh*800/w;w=800;}if(hh>600){w=w*600/hh;hh=600;}
    canvas.width=Math.round(w);canvas.height=Math.round(hh);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    cb(canvas.toDataURL('image/jpeg',0.7));
  };img.src=ev.target.result;};
  reader.readAsDataURL(file);
}
function handlePhoto(e){
  const file=e.target.files[0];if(!file||!_photoPropId)return;
  compressImage(file,data=>{
    const p=D.props.find(x=>x.id===_photoPropId);
    if(p){if(!p.photos)p.photos=[];p.photos.push(data);save();render();toast('Photo added!');}
    _photoPropId=null;
  });
  e.target.value='';
}
function viewPhoto(pid,idx){
  const p=D.props.find(x=>x.id===pid);if(!p||!p.photos[idx])return;
  showModal('<div class="modal-handle"></div><img src="'+p.photos[idx]+'" style="width:100%;border-radius:12px;margin-bottom:14px" alt="Property photo"><div style="display:flex;gap:8px"><button class="btn btn-danger" style="flex:1" onclick="removePhoto(\''+pid+'\','+idx+')">Delete photo</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button></div>');
}
function removePhoto(pid,idx){if(!confirm('Delete this photo?'))return;const p=D.props.find(x=>x.id===pid);if(p){p.photos.splice(idx,1);save();closeModal();render();}}

/* ── PHOTOS (issue) ── */
function handleIssuePhoto(e){
  const file=e.target.files[0];if(!file||!_photoIssueId)return;
  compressImage(file,data=>{
    const i=D.issues.find(x=>x.id===_photoIssueId);
    if(i){if(!i.photos)i.photos=[];i.photos.push(data);save();openIssue(i.id);toast('Photo added!');}
    _photoIssueId=null;
  });
  e.target.value='';
}
/* ── SESSION MODAL ── */
function openSess(id){
  const s=D.sessions.find(x=>x.id===id);if(!s)return;
  const prop=D.props.find(p=>p.id===s.propId);
  const cls=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean);
  const tags=cls.map(c=>'<span class="badge tc-'+colorFor(c.name)+'" style="font-size:12px;padding:5px 12px">'+esc(c.name)+'</span>').join('');
  const propNotes=prop&&prop.notes&&prop.notes.trim()?'<div class="divider"></div><div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Property notes</div><div class="prop-notes-box">'+esc(prop.notes)+'</div>':'';
  const noteHtml=s.note?'<div class="divider"></div><div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:6px">Note</div><div style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:8px;font-weight:500">'+esc(s.note)+'</div>':'';
  const doneBtn=s.status!=='done'?'<button class="btn btn-sm btn-accent-sm" onclick="setStatus(\''+s.id+'\',\'done\')">Mark done</button>':'';
  const cancelBtn=s.status!=='cancelled'?'<button class="btn btn-sm btn-ghost" onclick="setStatus(\''+s.id+'\',\'cancelled\')">Cancel</button>':'';
  const reschedBtn=s.status!=='scheduled'?'<button class="btn btn-sm btn-purple-sm" onclick="setStatus(\''+s.id+'\',\'scheduled\')">Reschedule</button>':'';
  showModal('<div class="modal-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><div class="modal-title" style="margin-bottom:0">'+esc(prop?prop.name:'Session')+'</div><button class="btn btn-ghost btn-sm" onclick="openSessEdit(\''+s.id+'\')">Edit</button></div>'
    +'<div style="font-size:13px;color:var(--text2);font-weight:500;margin-bottom:2px">'+fmtFull(s.date)+'</div>'
    +(s.time?'<div style="font-size:16px;font-weight:700;color:var(--accent);margin-bottom:12px;font-family:\'DM Mono\',monospace">'+s.time+'</div>':'<div style="margin-bottom:10px"></div>')
    +'<div class="divider"></div><div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Cleaners</div>'
    +'<div class="sess-tags" style="margin-bottom:12px">'+(tags||'<span style="color:var(--text3);font-size:13px;font-weight:500">None assigned</span>')+'</div>'
    +noteHtml+propNotes
    +'<div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+doneBtn+cancelBtn+reschedBtn+'</div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-danger" style="flex:1" onclick="delSess(\''+s.id+'\')">Delete</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Close</button></div>');
}
function openSessEdit(id){
  const s=D.sessions.find(x=>x.id===id);if(!s)return;
  window._ec=[...(s.cleanerIds||[])];
  const chips=D.cleaners.map(c=>'<button type="button" class="chip'+(window._ec.includes(c.id)?' on':'')+'" data-id="'+c.id+'" onclick="toggleEC(\''+c.id+'\')">'+esc(c.name)+'</button>').join('');
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit session</div>'
    +'<div class="field"><label>Date</label><input type="date" id="e-date" value="'+s.date+'"></div>'
    +'<div class="field"><label>Time</label><input type="time" id="e-time" value="'+(s.time||'')+'"></div>'
    +'<div class="field"><label>Cleaners</label><div class="chips" id="edit-chips" style="margin-top:6px">'+chips+'</div></div>'
    +'<div class="field"><label>Note</label><textarea id="e-note" style="height:72px">'+esc(s.note||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-teal" style="flex:1" onclick="saveSessEdit(\''+s.id+'\')">Save</button><button class="btn btn-ghost" style="flex:1" onclick="openSess(\''+s.id+'\')">Cancel</button></div>');
}
function toggleEC(id){if(!window._ec)window._ec=[];const i=window._ec.indexOf(id);if(i>=0)window._ec.splice(i,1);else window._ec.push(id);document.querySelectorAll('#edit-chips .chip').forEach(c=>c.classList.toggle('on',window._ec.includes(c.dataset.id)));}
function saveSessEdit(id){const s=D.sessions.find(x=>x.id===id);if(!s)return;const date=(document.getElementById('e-date')||{}).value;const time=(document.getElementById('e-time')||{}).value||'';const note=(document.getElementById('e-note')||{}).value||'';const cids=window._ec||[];if(!date){alert('Please pick a date.');return;}if(!cids.length){alert('At least one cleaner needed.');return;}s.date=date;s.time=time;s.note=note;s.cleanerIds=cids;save();closeModal();render();toast('Session updated!');}
function setStatus(id,status){const s=D.sessions.find(x=>x.id===id);if(!s)return;s.status=status;save();openSess(id);render();}

/* ── PROP NOTES ── */
function openPropNotes(id){
  const p=D.props.find(x=>x.id===id);if(!p)return;
  showModal('<div class="modal-handle"></div><div class="modal-title">'+esc(p.name)+' — notes</div>'
    +'<div class="field"><textarea id="p-notes" placeholder="Entry code: 1234&#10;Replace towels&#10;Check fridge..." style="height:170px">'+esc(p.notes||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px"><button class="btn btn-teal" style="flex:1" onclick="savePropNotes(\''+id+'\')">Save</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function savePropNotes(id){const p=D.props.find(x=>x.id===id);if(!p)return;p.notes=(document.getElementById('p-notes')||{}).value||'';save();closeModal();render();toast('Notes saved!');}

/* ── CLEANER MODALS ── */
function openAddCleanerModal(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Add cleaner</div>'
    +'<div class="field"><label>Name</label><input type="text" id="nc-name" placeholder="e.g. Maria"></div>'
    +'<div class="field"><label>WhatsApp number <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(with country code)</span></label><input type="tel" id="nc-phone" placeholder="e.g. +34 612 345 678"></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-purple-sm" style="flex:1;padding:14px" onclick="saveNewCleaner()">Add cleaner</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveNewCleaner(){
  const name=(document.getElementById('nc-name')||{}).value||'';
  const phone=(document.getElementById('nc-phone')||{}).value||'';
  if(!name.trim()){alert('Please enter a name.');return;}
  D.cleaners.push({id:uid(),name:name.trim(),phone:phone.trim()});
  save();closeModal();render();toast('Cleaner added!');
}
function openEditCleaner(id){
  const c=D.cleaners.find(x=>x.id===id);if(!c)return;
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit cleaner</div>'
    +'<div class="field"><label>Name</label><input type="text" id="ec-name" value="'+esc(c.name)+'"></div>'
    +'<div class="field"><label>WhatsApp number <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text3)">(with country code)</span></label><input type="tel" id="ec-phone" value="'+esc(c.phone||'')+'" placeholder="e.g. +34 612 345 678"></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-purple-sm" style="flex:1;padding:14px" onclick="saveEditCleaner(\''+id+'\')">Save changes</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveEditCleaner(id){
  const c=D.cleaners.find(x=>x.id===id);if(!c)return;
  const name=(document.getElementById('ec-name')||{}).value||'';
  const phone=(document.getElementById('ec-phone')||{}).value||'';
  if(!name.trim()){alert('Please enter a name.');return;}
  c.name=name.trim();c.phone=phone.trim();
  save();closeModal();render();toast('Cleaner updated!');
}
function openWA(phone){const num=phone.replace(/\D/g,'');window.open('https://wa.me/'+num,'_blank');}

/* ── CONTACT MODALS ── */
function _contactCatOpts(sel){return Object.entries(CONTACT_CATS).map(function(e){return'<option value="'+e[0]+'"'+(sel===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('');}
function _contactStatusOpts(sel){return Object.entries(CONTACT_STATUS_LABELS).map(function(e){return'<option value="'+e[0]+'"'+(sel===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('');}
function openAddContactModal(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Add Contact</div>'
    +'<div class="field"><label>Name *</label><input type="text" id="nc-name" placeholder="e.g. Maria Garcia"></div>'
    +'<div class="field"><label>Category</label><select id="nc-cat">'+_contactCatOpts('other')+'</select></div>'
    +'<div class="field"><label>Phone / WhatsApp</label><input type="tel" id="nc-phone" placeholder="+34 612 345 678"></div>'
    +'<div class="field"><label>WhatsApp (if different)</label><input type="tel" id="nc-wa" placeholder="+34 612 345 678"></div>'
    +'<div class="field"><label>Company</label><input type="text" id="nc-company" placeholder="e.g. CleanPro Services"></div>'
    +'<div class="field"><label>Area / Location</label><input type="text" id="nc-area" placeholder="e.g. Ibiza Norte"></div>'
    +'<div class="field"><label>Prices / Rates</label><input type="text" id="nc-price" placeholder="e.g. 120€/session"></div>'
    +'<div class="field"><label>Availability</label><input type="text" id="nc-avail" placeholder="e.g. Mon–Fri, short notice ok"></div>'
    +'<div class="field"><label>Status</label><select id="nc-status">'+_contactStatusOpts('new')+'</select></div>'
    +'<div class="field"><label>Last Contacted</label><input type="date" id="nc-last"></div>'
    +'<div class="field"><label>Notes</label><textarea id="nc-notes" placeholder="Any details..." style="height:72px"></textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-purple-sm" style="flex:1;padding:14px" onclick="saveNewContact()">Add contact</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveNewContact(){
  const name=(document.getElementById('nc-name')||{}).value||'';
  if(!name.trim()){alert('Please enter a name.');return;}
  const now=new Date().toISOString().slice(0,10);
  D.contacts.push({
    id:uid(),
    name:name.trim(),
    category:(document.getElementById('nc-cat')||{}).value||'other',
    phone:((document.getElementById('nc-phone')||{}).value||'').trim(),
    whatsapp:((document.getElementById('nc-wa')||{}).value||'').trim(),
    company:((document.getElementById('nc-company')||{}).value||'').trim(),
    area:((document.getElementById('nc-area')||{}).value||'').trim(),
    priceInfo:((document.getElementById('nc-price')||{}).value||'').trim(),
    availability:((document.getElementById('nc-avail')||{}).value||'').trim(),
    status:(document.getElementById('nc-status')||{}).value||'new',
    notes:((document.getElementById('nc-notes')||{}).value||'').trim(),
    lastContacted:((document.getElementById('nc-last')||{}).value||'').trim(),
    createdAt:now,
    updatedAt:now
  });
  save();closeModal();render();toast('Contact added!');
}
function openEditContact(id){
  const c=(D.contacts||[]).find(function(x){return x.id===id;});if(!c)return;
  showModal('<div class="modal-handle"></div><div class="modal-title">Edit Contact</div>'
    +'<div class="field"><label>Name *</label><input type="text" id="ec-name" value="'+esc(c.name)+'"></div>'
    +'<div class="field"><label>Category</label><select id="ec-cat">'+_contactCatOpts(c.category)+'</select></div>'
    +'<div class="field"><label>Phone / WhatsApp</label><input type="tel" id="ec-phone" value="'+esc(c.phone||'')+'"></div>'
    +'<div class="field"><label>WhatsApp (if different)</label><input type="tel" id="ec-wa" value="'+esc(c.whatsapp||'')+'"></div>'
    +'<div class="field"><label>Company</label><input type="text" id="ec-company" value="'+esc(c.company||'')+'"></div>'
    +'<div class="field"><label>Area / Location</label><input type="text" id="ec-area" value="'+esc(c.area||'')+'"></div>'
    +'<div class="field"><label>Prices / Rates</label><input type="text" id="ec-price" value="'+esc(c.priceInfo||'')+'"></div>'
    +'<div class="field"><label>Availability</label><input type="text" id="ec-avail" value="'+esc(c.availability||'')+'"></div>'
    +'<div class="field"><label>Status</label><select id="ec-status">'+_contactStatusOpts(c.status)+'</select></div>'
    +'<div class="field"><label>Last Contacted</label><input type="date" id="ec-last" value="'+esc(c.lastContacted||'')+'"></div>'
    +'<div class="field"><label>Notes</label><textarea id="ec-notes" style="height:72px">'+esc(c.notes||'')+'</textarea></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-purple-sm" style="flex:1;padding:14px" onclick="saveEditContact(\''+id+'\')">Save changes</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
}
function saveEditContact(id){
  const c=(D.contacts||[]).find(function(x){return x.id===id;});if(!c)return;
  const name=(document.getElementById('ec-name')||{}).value||'';
  if(!name.trim()){alert('Please enter a name.');return;}
  c.name=name.trim();
  c.category=(document.getElementById('ec-cat')||{}).value||'other';
  c.phone=((document.getElementById('ec-phone')||{}).value||'').trim();
  c.whatsapp=((document.getElementById('ec-wa')||{}).value||'').trim();
  c.company=((document.getElementById('ec-company')||{}).value||'').trim();
  c.area=((document.getElementById('ec-area')||{}).value||'').trim();
  c.priceInfo=((document.getElementById('ec-price')||{}).value||'').trim();
  c.availability=((document.getElementById('ec-avail')||{}).value||'').trim();
  c.status=(document.getElementById('ec-status')||{}).value||'new';
  c.notes=((document.getElementById('ec-notes')||{}).value||'').trim();
  c.lastContacted=((document.getElementById('ec-last')||{}).value||'').trim();
  c.updatedAt=new Date().toISOString().slice(0,10);
  save();closeModal();render();toast('Contact updated!');
}
function deleteContact(id){
  if(!confirm('Delete this contact?'))return;
  D.contacts=(D.contacts||[]).filter(function(c){return c.id!==id;});
  save();render();toast('Contact deleted.');
}

