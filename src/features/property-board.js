/* Jarvis-themed Properties page (classic script, after properties.js and actions.js). Presentation only: it reads the
   same state the workspace Properties screen and property hub use (D.props, D.bookings, D.sessions, D.tasks, D.issues,
   propOccupancyStatus, propNextBooking) and calls their existing actions (addProp, savePropNotes, handlePhoto via
   #photo-file, removePhoto, delProp, openBookingDetail, openAddBookingModal, openSess, openAddSessModal, openTaskDetail,
   openNewTaskModal, tcbDone, openIssue, openAddIssueFor). Rendering never changes a property; no second store.
   Values are escaped; no element ids on the page, so nothing collides with the workspace screen. */
(function(){
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={back:'<path d="m15 18-6-6 6-6"/>',plus:'<path d="M12 5.5v13M5.5 12h13"/>',check:'<path d="m6.8 12.4 3.3 3.3 7.1-7.4"/>',next:'<path d="m9 18 6-6-6-6"/>'};
  const q=v=>JSON.stringify(String(v)).replace(/"/g,'&quot;');
  const STATUS={occupied:'Occupied',checkin:'Check-in today',checkout:'Check-out today',empty:'Empty'};
  const PLATFORM={direct:'Direct',airbnb:'Airbnb',booking:'Booking.com'};
  /* The property shown in detail; '' is the list. Kept across re-renders, reset when the page is opened. */
  let selected='';
  const plural=(n,one,many)=>n+' '+(n===1?one:many);
  const initials=name=>typeof avInit==='function'?avInit(name):String(name||'?').trim().slice(0,2).toUpperCase();
  const colour=id=>typeof propColorIdx==='function'?propColorIdx(id):0;
  function photo(p,cls){
    const src=(p.photos||[])[0];
    return src?'<img class="'+cls+'" src="'+esc(src)+'" alt="">':'<span class="'+cls+' jp-initials avatar pc-'+esc(colour(p.id))+'" aria-hidden="true">'+esc(initials(p.name))+'</span>';
  }
  /* The facts the workspace card and hub show, from the same helpers and filters. */
  function facts(p,td){
    const occ=propOccupancyStatus(p.id,td),nextBk=propNextBooking(p.id,td);
    const uc=D.sessions.filter(s=>s.propId===p.id&&s.date>=td&&s.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'').localeCompare(String(b.time||'')));
    const ot=D.tasks.filter(t=>t.propId===p.id&&!t.done).sort((a,b)=>(b.urgent?1:0)-(a.urgent?1:0));
    const oi=D.issues.filter(i=>i.propId===p.id&&i.status==='open');
    let guest='';
    if(occ.booking&&occ.booking.guestName){
      if(occ.type==='occupied')guest=occ.booking.guestName+' · until '+fmtDate(occ.booking.checkOut);
      else if(occ.type==='checkin')guest=occ.booking.guestName+' · '+plural(nightsBetween(occ.booking.checkIn,occ.booking.checkOut),'night','nights');
      else if(occ.type==='checkout')guest=occ.booking.guestName+' checking out';
    }else if(nextBk&&nextBk.guestName)guest='Next: '+nextBk.guestName+' · '+fmtDate(nextBk.checkIn);
    return {occ,nextBk,uc,ot,oi,guest};
  }
  const status=occ=>'<span class="jv-status jp-status is-'+esc(occ.type)+'">'+esc(STATUS[occ.type]||occ.label)+'</span>';
  /* ── List ── */
  function listView(td){
    const all=D.props.map(p=>({p,f:facts(p,td)}));
    const counts={};all.forEach(x=>{counts[x.f.occ.type]=(counts[x.f.occ.type]||0)+1;});
    let h='<header class="jb-head"><div class="jb-heading"><small class="jv-label">Properties</small><div class="jb-title"><h2>'+esc(plural(D.props.length,'property','properties'))+'</h2></div></div>'
      +'<div class="jb-tools"><button type="button" class="jv-icon-btn" data-jp="create" aria-label="Add property" title="Add property">'+svg(I.plus)+'</button></div></header>';
    h+='<p class="jc-summary">'+(all.length?['occupied','checkin','checkout','empty'].filter(k=>counts[k]).map(k=>counts[k]+' '+STATUS[k].toLowerCase()).join(' · '):'No villas yet')+'</p>';
    if(!all.length)return h+'<div class="jc-body jp-body"><div class="jb-empty"><p>No properties yet.</p><small>Add your first villa to plan its bookings, cleanings and tasks.</small><button type="button" class="jv-btn" data-jp="create">Add property</button></div></div>';
    h+='<div class="jc-body jp-body"><ul class="jp-grid">';
    all.forEach(({p,f})=>{
      const meta=[];
      if(f.uc[0])meta.push('<span>Cleaning '+esc(fmtDate(f.uc[0].date))+'</span>');
      if(f.oi.length)meta.push('<span class="is-alert">'+esc(plural(f.oi.length,'issue','issues'))+'</span>');
      if(f.ot.length)meta.push('<span>'+esc(plural(f.ot.length,'task','tasks'))+'</span>');
      if(!f.uc[0]&&!f.oi.length&&!f.ot.length)meta.push('<span>All clear</span>');
      h+='<li><button type="button" class="jp-card" data-jp-open="'+esc(p.id)+'" aria-label="'+esc(p.name+', '+(STATUS[f.occ.type]||f.occ.label)+'. Show details')+'">'+photo(p,'jp-card-photo')
        +'<span class="jp-card-body"><span class="jp-card-row"><b>'+esc(p.name)+'</b>'+status(f.occ)+'</span>'
        +(f.guest?'<small class="jp-card-guest">'+esc(f.guest)+'</small>':'')
        +'<small class="jp-card-meta">'+meta.join('')+'</small></span>'+svg(I.next,16)+'</button></li>';
    });
    return h+'</ul></div>';
  }
  /* ── Details: the property hub's sections and actions ── */
  function rows(items,empty){return items.length?'<ul class="jt-list jp-rows">'+items.join('')+'</ul>':'<p class="jc-none">'+esc(empty)+'</p>';}
  function row(attr,title,meta,extra=''){return '<li class="jt-task jp-row'+extra+'"><button type="button" class="jt-main" '+attr+'><b>'+esc(title)+'</b><small>'+meta.map(m=>'<span>'+esc(m)+'</span>').join('')+'</small></button></li>';}
  function section(title,count,action,body){return '<section class="jc-day jp-section"><h3>'+esc(title)+(count!=null?'<small class="jt-count">'+esc(count)+'</small>':'')+(action||'')+'</h3>'+body+'</section>';}
  const addBtn=(attr,label)=>'<button type="button" class="jv-btn jt-add" '+attr+'>'+esc(label)+'</button>';
  function sessionRow(s){
    const names=(s.cleanerIds||[]).map(id=>(D.cleaners.find(c=>c.id===id)||{}).name).filter(Boolean);
    const state=s.status==='done'?'Done':s.status==='cancelled'?'Cancelled':isToday(s.date)?'Today':'';
    return row('data-jp-sess="'+esc(s.id)+'"',fmtDate(s.date)+(s.time?' · '+s.time:''),[names.length?names.join(', '):'No cleaners assigned'].concat(state?[state]:[]).concat(s.note?[s.note]:[]),s.status==='cancelled'?' is-done':'');
  }
  function detailView(p,td){
    const f=facts(p,td),pid=p.id,photos=p.photos||[];
    const sessions=D.sessions.filter(s=>s.propId===pid),past=sessions.filter(s=>s.date<td).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
    const occBk=f.occ.booking;
    let guest='—',guestLabel='Guest';
    if(occBk&&occBk.guestName){guest=occBk.guestName.split(' ')[0];guestLabel=f.occ.type==='checkout'?'Checking out':'Current guest';}
    else if(f.nextBk&&f.nextBk.guestName){guest=f.nextBk.guestName.split(' ')[0];guestLabel='Next guest';}
    let date='—',dateLabel='Next check-in';
    if((f.occ.type==='occupied'||f.occ.type==='checkin')&&occBk){date=fmtDate(occBk.checkOut);dateLabel='Check-out';}
    else if(f.nextBk){date=fmtDate(f.nextBk.checkIn);}
    const sub=[plural(sessions.length,'session','sessions')+' total'].concat(f.oi.length?[plural(f.oi.length,'open issue','open issues')]:[]).concat(f.ot.length?[plural(f.ot.length,'task','tasks')]:[]);
    let h='<header class="jb-head jp-head"><button type="button" class="jv-btn jp-back" data-jp="back">'+svg(I.back,15)+'All properties</button>'
      +'<div class="jp-hero">'+photo(p,'jp-hero-photo')+'<div class="jb-heading"><small class="jv-label">Property</small><div class="jb-title"><h2>'+esc(p.name)+'</h2></div></div></div>'
      +'<div class="jb-tools"><button type="button" class="jv-btn" data-jp="notes">Notes</button></div></header>'
      +'<p class="jc-summary">'+esc(sub.join(' · '))+'</p>';
    h+='<div class="jc-body jp-body jp-detail">';
    const strip=[[STATUS[f.occ.type]||f.occ.label,'Status',' is-'+f.occ.type],[guest,guestLabel,''],[date,dateLabel,''],[f.uc[0]?fmtDate(f.uc[0].date):'—','Next cleaning',''],
      [f.oi.length?String(f.oi.length):'None',f.oi.length?'Open issues':'No issues',f.oi.length?' is-alert':''],[f.ot.length?String(f.ot.length):'None',f.ot.length?'Open tasks':'No tasks','']];
    h+='<dl class="jp-strip">'+strip.map(([v,l,c])=>'<div class="jp-fact'+c+'"><dt>'+esc(l)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>';
    if(p.notes&&p.notes.trim())h+='<p class="jv-notes jp-notes">'+esc(p.notes)+'</p>';
    h+=section('Photos',photos.length+' of 3',photos.length<3?addBtn('data-jp="photo-add"','Add photo'):'',
      photos.length?'<div class="jp-photos">'+photos.map((src,i)=>'<button type="button" class="jp-thumb" data-jp-photo="'+i+'" aria-label="Photo '+(i+1)+' of '+photos.length+'. Open"><img src="'+esc(src)+'" alt=""></button>').join('')+'</div>':'<p class="jc-none">No photos yet.</p>');
    const bookings=(D.bookings||[]).filter(b=>b.propId===pid&&b.status!=='cancelled'&&b.checkOut>=td).sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,8);
    h+=section('Upcoming bookings',bookings.length,addBtn('data-jp="booking-add"','Add booking'),rows(bookings.map(b=>{
      const price=b._excel&&b._excel.priceUnknown?'Price unknown':b.totalPrice||b._excel?fmtEur(b.totalPrice):'';
      return row('data-jp-booking="'+esc(b.id)+'"',b.guestName||'Guest',[b.platform in PLATFORM?PLATFORM[b.platform]:(b.agencyName||'Agency'),fmtDate(b.checkIn)+' → '+fmtDate(b.checkOut),plural(nightsBetween(b.checkIn,b.checkOut),'night','nights')].concat(b.guestCount?[plural(+b.guestCount,'guest','guests')]:[]).concat(price?[price]:[]));
    }),'No upcoming bookings.'));
    h+=section('Upcoming cleanings',f.uc.length,addBtn('data-jp="sess-add"','Schedule'),rows(f.uc.slice(0,4).map(sessionRow),'None scheduled.'));
    h+=section('Open tasks',f.ot.length,addBtn('data-jp="task-add"','Add task'),f.ot.length?'<ul class="jt-list jp-rows">'+f.ot.map(t=>{
      const meta=[];if(t.priority==='high')meta.push('<span class="is-high">High priority</span>');
      if(t.dueDate)meta.push('<span'+(t.dueDate<=td?' class="is-late"':'')+'>'+esc(t.dueDate<td?'Overdue · '+fmtDate(t.dueDate):t.dueDate===td?'Due today':'Due '+fmtDate(t.dueDate))+'</span>');
      return '<li class="jt-task"><button type="button" class="jt-check" data-jp-done="'+esc(t.id)+'" aria-label="Mark “'+esc(t.text)+'” done">'+svg(I.check,14)+'</button><button type="button" class="jt-main" data-jp-task="'+esc(t.id)+'"><b>'+esc(t.text)+'</b><small>'+meta.join('')+'</small></button></li>';
    }).join('')+'</ul>':'<p class="jc-none">No open tasks.</p>');
    h+=section('Open issues',f.oi.length,addBtn('data-jp="issue-add"','Log issue'),rows(f.oi.map(i=>{
      const meta=[];if(i.resolveBy)meta.push((i.resolveBy<td?'Overdue · ':'By ')+fmtDate(i.resolveBy));if((i.photos||[]).length)meta.push(plural(i.photos.length,'photo','photos'));if(i.note)meta.push(i.note);
      return row('data-jp-issue="'+esc(i.id)+'"',i.title||'Issue',meta);
    }),'No open issues.'));
    if(past.length)h+=section('Recent history',null,'',rows(past.map(sessionRow),''));
    h+='<div class="jp-danger"><span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" data-jp="remove-ask">Remove this property</button>'
      +'<span class="jt-delete-ask" role="group" aria-label="Confirm removal">Remove '+esc(p.name)+' and all its sessions, tasks and issues? <button type="button" class="jv-btn jv-btn-danger" data-jp="remove">Remove</button><button type="button" class="jv-btn" data-jp="remove-keep">Keep</button></span></span></div>';
    return h+'</div>';
  }
  function render(host){
    if(!host)return;const td=today(),p=selected&&D.props.find(x=>x.id===selected);if(!p)selected='';
    const scroller=host.querySelector('.jc-body'),same=host.dataset.jpView===(selected||'list'),top=scroller&&same?scroller.scrollTop:0;
    host.innerHTML=p?detailView(p,td):listView(td);host.dataset.jpView=selected||'list';
    const next=host.querySelector('.jc-body');if(next&&top)next.scrollTop=top;
  }
  function select(host,id){
    const from=selected;selected=id;render(host);
    (id?host.querySelector('[data-jp="back"]'):from&&host.querySelector('[data-jp-open="'+CSS.escape(from)+'"]'))?.focus?.();
  }
  /* Opening an existing dialog for this villa, then preselecting it where the dialog has a villa field. */
  function preselect(open,field){open();const sel=document.getElementById(field);if(sel&&selected&&[...sel.options||[]].some(o=>o.value===selected))sel.value=selected;}
  function bind(host){
    if(!host||host.dataset.jpBound)return;host.dataset.jpBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-jp],[data-jp-open],[data-jp-photo],[data-jp-booking],[data-jp-sess],[data-jp-task],[data-jp-done],[data-jp-issue]');if(!t)return;
      const d=t.dataset,pid=selected;
      if(d.jpOpen){select(host,d.jpOpen);return;}
      if(d.jpBooking){openBookingDetail(d.jpBooking);return;}
      if(d.jpSess){openSess(d.jpSess);return;}
      if(d.jpTask){openTaskDetail(d.jpTask);return;}
      if(d.jpDone){tcbDone(d.jpDone);return;}
      if(d.jpIssue){openIssue(d.jpIssue);return;}
      if(d.jpPhoto!==undefined){viewPhoto(pid,Number(d.jpPhoto));return;}
      const a=d.jp;
      if(a==='create'){openAdd();return;}
      if(a==='back'){select(host,'');return;}
      if(!pid)return;
      if(a==='notes')openPropNotes(pid);
      else if(a==='photo-add'){_photoPropId=pid;document.getElementById('photo-file')?.click();}
      else if(a==='booking-add')preselect(()=>openAddBookingModal(),'bk-prop');
      else if(a==='sess-add')preselect(()=>openAddSessModal(),'f-prop');
      else if(a==='task-add')openNewTaskModal(pid,'ops','');
      else if(a==='issue-add')openAddIssueFor(pid);
      else if(a==='remove-ask'){t.parentNode.classList.add('is-asking');t.parentNode.querySelector('[data-jp="remove"]')?.focus();}
      else if(a==='remove-keep'){const box=t.closest('.jt-delete');box?.classList.remove('is-asking');box?.querySelector('[data-jp="remove-ask"]')?.focus();}
      else if(a==='remove'){selected='';delProp(pid,true);render(host);}
    });
  }
  function reset(){selected='';}
  /* ── Dialogs in the Jarvis theme. Inputs that hold typed text carry data-jv-guard, so a spoken "close it" or page
     change does not discard them unseen. The existing save functions do the validation and persistence. ── */
  function addDialog(){
    return '<form class="jv-modal jt-dialog" onsubmit="event.preventDefault();SV_PROPERTIES_VIEW.saveAdd()"><small class="jv-label">New property</small><div class="modal-title">Add a villa</div>'
      +'<div class="field"><label for="jp-new-name">Name</label><input type="text" id="jp-new-name" autocomplete="off" placeholder="e.g. Villa Mar" aria-describedby="jp-new-error" data-jv-guard></div>'
      +'<p class="jv-note jt-form-error" id="jp-new-error" role="alert" hidden>Please enter the villa’s name.</p>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="closeModal()">Cancel</button><button type="submit" class="jv-btn jv-btn-primary">Add property</button></div></form>';
  }
  function openAdd(){showModal(addDialog());setTimeout(()=>document.getElementById('jp-new-name')?.focus(),60);}
  function saveAdd(){
    const box=document.getElementById('jp-new-name'),err=document.getElementById('jp-new-error');if(!box)return;
    const name=box.value.trim();if(!name){if(err)err.hidden=false;box.setAttribute('aria-invalid','true');box.focus();return;}
    closeModal();addProp(name);
  }
  function notesDialog(p){
    return '<form class="jv-modal jt-dialog" onsubmit="event.preventDefault();savePropNotes('+q(p.id)+')"><small class="jv-label">Notes</small><div class="modal-title">'+esc(p.name)+'</div>'
      +'<div class="field"><label for="p-notes">Property notes</label><textarea id="p-notes" rows="7" placeholder="Entry code: 1234&#10;Replace towels&#10;Check fridge..." aria-describedby="jp-notes-help" data-jv-guard>'+esc(p.notes||'')+'</textarea></div>'
      +'<p class="jv-modal-help" id="jp-notes-help">Shown with this villa’s cleaning details.</p>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="closeModal()">Cancel</button><button type="submit" class="jv-btn jv-btn-primary">Save notes</button></div></form>';
  }
  function photoDialog(p,idx){
    const id=q(p.id),n=(p.photos||[]).length;
    return '<div class="jv-modal jt-dialog jp-photo-dialog"><small class="jv-label">Photo '+(idx+1)+' of '+n+'</small><div class="modal-title">'+esc(p.name)+'</div>'
      +'<img class="jp-photo-full" src="'+esc(p.photos[idx])+'" alt="Photo of '+esc(p.name)+'">'
      +'<div class="jv-actions jv-actions-end"><span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" onclick="this.parentNode.classList.add(\'is-asking\');this.nextElementSibling.querySelector(\'button\').focus()">Delete photo</button>'
      +'<span class="jt-delete-ask" role="group" aria-label="Confirm delete">Delete this photo? <button type="button" class="jv-btn jv-btn-danger" onclick="removePhoto('+id+','+idx+',true)">Delete</button><button type="button" class="jv-btn" onclick="this.closest(\'.jt-delete\').classList.remove(\'is-asking\')">Keep</button></span></span>'
      +'<button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
  }
  window.SV_PROPERTIES_VIEW={render,bind,reset,selected:()=>selected,openAdd,saveAdd,addDialog,notesDialog,photoDialog};
})();
