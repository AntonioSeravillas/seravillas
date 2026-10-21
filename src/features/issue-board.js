/* Jarvis-themed Issues page (classic script, after issues.js and actions.js). Presentation only: it reads the same issue
   records and filters as the workspace Issues screen (D.issues, issueSearch, issueStatusFilter, issueFilter) and calls
   the existing actions (openAddIssueFor/saveIssue, openEditIssue/saveEditIssue, setIssueStatus, delIssue, viewIssuePhoto,
   removeIssuePhoto, handleIssuePhoto via #issue-photo-file). Rendering never changes an issue and sends nothing.
   Values are escaped; no element ids on the page. */
(function(){
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={plus:'<path d="M12 5.5v13M5.5 12h13"/>',down:'<path d="m6 9 6 6 6-6"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'};
  const q=v=>JSON.stringify(String(v)).replace(/"/g,'&quot;');
  const STATUS={open:'Open',in_progress:'In progress',waiting:'Waiting',resolved:'Resolved'};
  const ORDER={open:0,in_progress:1,waiting:2,resolved:3};
  const PRIORITY={high:'High priority',medium:'Medium priority',low:'Low priority'};
  /* The workspace category labels without their emoji. */
  const category=k=>String((typeof ICC_CATS!=='undefined'&&ICC_CATS[k])||(typeof ICC_CATS!=='undefined'&&ICC_CATS.other)||'Other').replace(/^[^\p{L}]+/u,'');
  const PHOTO_LIMIT=5;
  const status=i=>STATUS[i.status]?i.status:'open';
  function when(i,td){
    const overdue=i.status!=='resolved'&&i.resolveBy&&i.resolveBy<td;
    return i.resolveBy?{text:(overdue?'Overdue · ':i.status==='resolved'?'Resolve by ':'By ')+fmtDate(i.resolveBy),late:!!overdue}:i.createdAt?{text:'Reported '+fmtDate(i.createdAt),late:false}:null;
  }
  /* The workspace screen's filters, applied the same way. */
  function filtered(){
    const term=String(issueSearch||'').toLowerCase();
    return (D.issues||[]).filter(i=>(issueStatusFilter==='all'||i.status===issueStatusFilter)&&(issueFilter==='all'||i.propId===issueFilter)
      &&(!term||String(i.title||'').toLowerCase().includes(term)||String(i.note||'').toLowerCase().includes(term)));
  }
  function row(i,td){
    const s=status(i),w=when(i,td),meta=['<span'+(s!=='open'&&s!=='resolved'?' class="is-late"':'')+'>'+esc(STATUS[s])+'</span>'];
    if(i.priority==='high')meta.push('<span class="is-high">High priority</span>');
    if(w)meta.push('<span'+(w.late?' class="is-late"':'')+'>'+esc(w.text)+'</span>');
    if((i.photos||[]).length)meta.push('<span>'+esc((i.photos.length)+' photo'+(i.photos.length===1?'':'s'))+'</span>');
    return '<li class="jt-task jp-row ji-row is-'+esc(s)+'"><button type="button" class="jt-main" data-ji-open="'+esc(i.id)+'"><b>'+esc(i.title)+'</b><small>'+meta.join('')+'</small></button></li>';
  }
  function render(host){
    if(!host)return;const td=today(),scroller=host.querySelector('.jc-body'),top=scroller?scroller.scrollTop:0;
    if(issueFilter!=='all'&&!D.props.some(p=>p.id===issueFilter))issueFilter='all';
    const all=D.issues||[],weekAgo=addDays(td,-7);
    const open=all.filter(i=>i.status==='open'||i.status==='in_progress').length,urgent=all.filter(i=>(i.priority||'medium')==='high'&&i.status!=='resolved').length;
    const waiting=all.filter(i=>i.status==='waiting').length,resolved=all.filter(i=>i.status==='resolved'&&i.resolvedAt&&i.resolvedAt>=weekAgo).length;
    let h='<header class="jb-head"><div class="jb-heading"><small class="jv-label">Issues</small><div class="jb-title"><h2>'+esc(open+' open issue'+(open===1?'':'s'))+'</h2></div></div>'
      +'<label class="jv-search"><span class="jarvis-sr">Search issues</span>'+svg(I.search,15)+'<input type="search" data-ji-search value="'+esc(issueSearch||'')+'" placeholder="Search issues" autocomplete="off"></label>'
      +'<label class="jv-select"><span class="jarvis-sr">Status</span><select data-ji-status>'+[['all','All statuses']].concat(Object.entries(STATUS)).map(([v,l])=>'<option value="'+v+'"'+(issueStatusFilter===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'+svg(I.down,14)+'</label>'
      +'<label class="jv-select"><span class="jarvis-sr">Villa</span><select data-ji-villa><option value="all">All villas</option>'+D.props.map(p=>'<option value="'+esc(p.id)+'"'+(issueFilter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select>'+svg(I.down,14)+'</label>'
      +'<div class="jb-tools"><button type="button" class="jv-icon-btn" data-ji="create" aria-label="Log issue" title="Log issue">'+svg(I.plus)+'</button></div></header>'
      +'<p class="jc-summary">'+[open+' open',urgent?'<em>'+urgent+' urgent</em>':'0 urgent',waiting+' waiting',resolved+' resolved in the last 7 days'].join(' · ')+'</p>';
    const list=filtered(),plain=issueFilter==='all'&&issueStatusFilter==='all'&&!issueSearch;
    const sections=D.props.map(p=>({p,issues:list.filter(i=>i.propId===p.id)})).filter(s=>s.issues.length||plain);
    const loose=list.filter(i=>!D.props.some(p=>p.id===i.propId));if(loose.length)sections.push({p:null,issues:loose});
    h+='<div class="jc-body">';
    if(!all.length)h+='<div class="jb-empty"><p>No issues logged yet.</p><small>Log an issue to track it to resolution.</small><button type="button" class="jv-btn" data-ji="create">Log issue</button></div>';
    else if(!sections.length)h+='<div class="jb-empty"><p>No matching issues.</p><small>Try another search, status or villa.</small><button type="button" class="jv-btn" data-ji="reset">Show all issues</button></div>';
    else h+='<div class="jc-days">'+sections.map(({p,issues})=>{
      const openHere=issues.filter(i=>i.status!=='resolved'),urgentHere=openHere.filter(i=>(i.priority||'medium')==='high').length;
      const count=openHere.length?openHere.length+' open'+(urgentHere?' · '+urgentHere+' urgent':''):'All clear';
      return '<section class="jc-day jp-section"><h3>'+esc(p?p.name:'No specific villa')+'<small class="jt-count'+(urgentHere?' is-alert':'')+'">'+esc(count)+'</small><button type="button" class="jv-btn jt-add" data-ji-add="'+esc(p?p.id:'')+'">Log issue</button></h3>'
        +(issues.length?'<ul class="jt-list jp-rows">'+issues.slice().sort((a,b)=>(ORDER[status(a)])-(ORDER[status(b)])).map(i=>row(i,td)).join('')+'</ul>':'<p class="jc-none">No open issues.</p>')+'</section>';
    }).join('')+'</div>';
    host.innerHTML=h+'</div>';const next=host.querySelector('.jc-body');if(next&&top)next.scrollTop=top;
  }
  function bind(host){
    if(!host||host.dataset.jiBound)return;host.dataset.jiBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-ji],[data-ji-open],[data-ji-add]');if(!t)return;const d=t.dataset;
      if(d.jiOpen){openIssue(d.jiOpen);return;}
      if(d.jiAdd!==undefined){openAddIssueFor(d.jiAdd);return;}
      if(d.ji==='create')openAddIssueFor(issueFilter!=='all'?issueFilter:'');
      else if(d.ji==='reset'){issueSearch='';issueStatusFilter='all';issueFilter='all';render(host);}
    });
    host.addEventListener('change',e=>{
      if(e.target.matches?.('[data-ji-status]')){issueStatusFilter=e.target.value;render(host);}
      else if(e.target.matches?.('[data-ji-villa]')){issueFilter=e.target.value;render(host);}
    });
    /* Searching re-renders the results only, so typing keeps its place in the field. */
    host.addEventListener('input',e=>{
      if(!e.target.matches?.('[data-ji-search]'))return;issueSearch=e.target.value;
      const box=e.target,pos=box.selectionStart;render(host);const again=host.querySelector('[data-ji-search]');if(again){again.focus();try{again.setSelectionRange(pos,pos);}catch{}}
    });
  }
  /* ── Dialogs in the Jarvis theme, with the workspace field ids and save functions. ── */
  function detail(i){
    const id=q(i.id),s=status(i),p=D.props.find(x=>x.id===i.propId),td=today(),w=when(i,td),photos=i.photos||[];
    const row=(k,v)=>'<dt>'+esc(k)+'</dt><dd>'+v+'</dd>';
    const moves=s==='resolved'?'<button type="button" class="jv-btn jv-btn-primary" onclick="setIssueStatus('+id+',\'open\')">Reopen</button>'
      :(s!=='in_progress'?'<button type="button" class="jv-btn" onclick="setIssueStatus('+id+',\'in_progress\')">Mark in progress</button>':'')
      +(s!=='waiting'?'<button type="button" class="jv-btn" onclick="setIssueStatus('+id+',\'waiting\')">Mark waiting</button>':'')
      +'<button type="button" class="jv-btn jv-btn-primary" onclick="setIssueStatus('+id+',\'resolved\')">Mark resolved</button>';
    return '<div class="jv-modal jt-dialog"><small class="jv-label">Issue</small><div class="modal-title">'+esc(i.title)+'</div>'
      +'<p class="jv-modal-sub"><span class="jv-status'+(s==='resolved'?'':i.priority==='high'||w&&w.late?' is-pending':'')+'">'+esc(STATUS[s])+'</span> · '+esc(PRIORITY[i.priority]||PRIORITY.medium)+'</p>'
      +'<dl class="jv-facts">'+row('Villa',p?esc(p.name):'No specific villa')+row('Category',esc(category(i.category||'other')))
      +(i.createdAt?row('Reported',esc(fmtDate(i.createdAt))):'')+(i.resolveBy?row('Resolve by',esc(fmtDate(i.resolveBy))+(w&&w.late?' · overdue':'')):'')
      +(i.waitingFor?row('Waiting for',esc(i.waitingFor)):'')+(s==='resolved'&&i.resolvedAt?row('Resolved',esc(fmtDate(i.resolvedAt))):'')+'</dl>'
      +(i.note?'<p class="jv-notes">'+esc(i.note)+'</p>':'')
      +'<small class="jv-label">Photos · '+photos.length+' of '+PHOTO_LIMIT+'</small><div class="jp-photos ji-photos">'+photos.map((src,n)=>'<button type="button" class="jp-thumb" onclick="viewIssuePhoto('+id+','+n+')" aria-label="Photo '+(n+1)+' of '+photos.length+'. Open"><img src="'+esc(src)+'" alt=""></button>').join('')
      +(photos.length<PHOTO_LIMIT?'<button type="button" class="jv-btn ji-add-photo" onclick="_photoIssueId='+id+';window._iid='+id+';document.getElementById(\'issue-photo-file\').click()">Add photo</button>':'')+'</div>'
      +'<div class="jv-actions">'+moves+'<button type="button" class="jv-btn" onclick="openEditIssue('+id+')">Edit</button></div>'
      +'<div class="jv-actions jv-actions-end"><span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" onclick="this.parentNode.classList.add(\'is-asking\');this.nextElementSibling.querySelector(\'button\').focus()">Delete</button>'
      +'<span class="jt-delete-ask" role="group" aria-label="Confirm delete">Delete this issue? <button type="button" class="jv-btn jv-btn-danger" onclick="delIssue('+id+',true)">Delete</button><button type="button" class="jv-btn" onclick="this.closest(\'.jt-delete\').classList.remove(\'is-asking\')">Keep</button></span></span>'
      +'<button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
  }
  function photoDialog(i,idx){
    const id=q(i.id);
    return '<div class="jv-modal jt-dialog"><small class="jv-label">Photo '+(idx+1)+' of '+i.photos.length+'</small><div class="modal-title">'+esc(i.title)+'</div>'
      +'<img class="jp-photo-full" src="'+esc(i.photos[idx])+'" alt="Photo of the issue: '+esc(i.title)+'">'
      +'<div class="jv-actions jv-actions-end"><span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" onclick="this.parentNode.classList.add(\'is-asking\');this.nextElementSibling.querySelector(\'button\').focus()">Delete photo</button>'
      +'<span class="jt-delete-ask" role="group" aria-label="Confirm delete">Delete this photo? <button type="button" class="jv-btn jv-btn-danger" onclick="removeIssuePhoto('+id+','+idx+',true)">Delete</button><button type="button" class="jv-btn" onclick="this.closest(\'.jt-delete\').classList.remove(\'is-asking\')">Keep</button></span></span>'
      +'<button type="button" class="jv-btn jv-btn-primary" onclick="openIssue('+id+')">Back</button></div></div>';
  }
  /* Log issue and Edit issue: one layout; `kind` selects the existing field ids (iss-*, ei-*) and save function. */
  function form(kind,i,propId){
    const p=kind==='new'?'iss':'ei',v=i||{},sel=kind==='new'?propId||'':v.propId||'',prio=kind==='new'?'medium':(v.priority==='high'||v.priority==='low'?v.priority:'medium');
    const opt=(val,label,on)=>'<option value="'+esc(val)+'"'+(on?' selected':'')+'>'+esc(label)+'</option>';
    return '<form class="jv-modal jt-dialog" onsubmit="event.preventDefault();SV_ISSUES_VIEW.saveForm(\''+kind+'\','+(i?q(i.id):'&quot;&quot;')+')"><small class="jv-label">'+(kind==='new'?'New issue':'Edit issue')+'</small><div class="modal-title">'+(kind==='new'?'Log an issue':esc(v.title))+'</div>'
      +'<div class="field"><label for="'+p+'-title">'+(kind==='new'?'What is the issue?':'Title')+'</label><input type="text" id="'+p+'-title" autocomplete="off" value="'+esc(v.title||'')+'" placeholder="e.g. Broken boiler" aria-describedby="ji-form-error" data-jv-guard></div>'
      +'<p class="jv-note jt-form-error" id="ji-form-error" role="alert" hidden>'+(kind==='new'?'Please describe the issue.':'Please enter a title.')+'</p>'
      +'<div class="jt-fields"><div class="field"><label for="'+p+'-prop">Villa</label><select id="'+p+'-prop">'+opt('','No specific villa',!sel)+D.props.map(x=>opt(x.id,x.name,x.id===sel)).join('')+'</select></div>'
      +'<div class="field"><label for="'+p+'-priority">Priority</label><select id="'+p+'-priority">'+[['medium','Medium'],['high','High / Urgent'],['low','Low']].map(([a,b])=>opt(a,b,a===prio)).join('')+'</select></div>'
      +'<div class="field"><label for="'+p+'-cat">Category</label><select id="'+p+'-cat">'+Object.keys(ICC_CATS).map(k=>opt(k,category(k),kind==='new'?k===Object.keys(ICC_CATS)[0]:v.category===k)).join('')+'</select></div>'
      +'<div class="field"><label for="'+p+'-resolve-by">Resolve by</label><input type="date" id="'+p+'-resolve-by" value="'+esc(v.resolveBy||'')+'"></div></div>'
      +'<div class="field"><label for="'+p+'-waiting">Waiting for</label><input type="text" id="'+p+'-waiting" autocomplete="off" value="'+esc(v.waitingFor||'')+'" placeholder="e.g. Plumber callback" data-jv-guard></div>'
      +'<div class="field"><label for="'+p+'-note">Details</label><textarea id="'+p+'-note" rows="3" placeholder="Any extra details" data-jv-guard>'+esc(v.note||'')+'</textarea></div>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="'+(kind==='new'?'closeModal()':'openIssue('+q(v.id)+')')+'">Cancel</button><button type="submit" class="jv-btn jv-btn-primary">'+(kind==='new'?'Save issue':'Save changes')+'</button></div></form>';
  }
  /* The same empty-title rule as saveIssue/saveEditIssue, shown in the dialog instead of a browser alert. */
  function saveForm(kind,id){
    const box=document.getElementById(kind==='new'?'iss-title':'ei-title'),err=document.getElementById('ji-form-error');
    if(!box||!box.value.trim()){if(err)err.hidden=false;box?.setAttribute('aria-invalid','true');box?.focus();return;}
    if(kind==='new')saveIssue();else saveEditIssue(id);
  }
  window.SV_ISSUES_VIEW={render,bind,detail,photoDialog,form,saveForm};
})();
