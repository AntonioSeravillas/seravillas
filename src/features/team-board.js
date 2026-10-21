/* Jarvis-themed Team page (classic script, after manage.js, properties.js and actions.js). Presentation only: it reads
   the same cleaner records the workspace Team screen lists (D.cleaners) and each cleaning's crew from getCleaningCrew,
   and calls the existing actions (openAddCleanerModal/saveNewCleaner, openEditCleaner/saveEditCleaner, delCleaner,
   openWA, openCleanerAccess, openSess). Rendering never changes a person or an assignment and sends nothing.
   Offered work is never shown as confirmed. Values are escaped; no element ids on the page. */
(function(){
  const svg=(path,size=16)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  const I={plus:'<path d="M12 5.5v13M5.5 12h13"/>',down:'<path d="m6 9 6 6 6-6"/>'};
  const q=v=>JSON.stringify(String(v)).replace(/"/g,'&quot;');
  const plural=(n,one,many)=>n+' '+(n===1?one:many);
  const STATE={offered:'Offered',confirmed:'Confirmed'};
  const expanded=new Set();
  const initials=name=>typeof avInit==='function'?avInit(String(name||'?')):String(name||'?').slice(0,2).toUpperCase();
  /* A cleaner's upcoming work: active main-crew places from today on, with the crew's own status. */
  function upcoming(c,td){
    const out=[];
    for(const s of D.sessions||[]){
      if(s.date<td||s.status==='cancelled'||s.status==='done')continue;
      const m=getCleaningCrew(s).main.find(x=>x.cleanerId===c.id&&x.status!=='cancelled');
      if(m)out.push({s,status:m.status==='confirmed'?'confirmed':'offered'});
    }
    return out.sort((a,b)=>a.s.date.localeCompare(b.s.date)||String(a.s.time||'').localeCompare(String(b.s.time||'')));
  }
  function counts(work){const c=work.filter(w=>w.status==='confirmed').length;return {confirmed:c,offered:work.length-c};}
  const workText=k=>!k.confirmed&&!k.offered?'No upcoming cleanings':[k.confirmed?k.confirmed+' confirmed':'',k.offered?k.offered+' offered':''].filter(Boolean).join(' · ');
  function workList(work,inDialog){
    if(!work.length)return '<p class="jc-none">No upcoming cleanings.</p>';
    return '<ul class="jt-list jp-rows">'+work.map(({s,status})=>'<li class="jt-task jp-row"><button type="button" class="jt-main" '+(inDialog?'onclick="openSess('+q(s.id)+')"':'data-jm-sess="'+esc(s.id)+'"')+'><b>'+esc(fmtDate(s.date)+(s.time?' · '+s.time:'')+' · '+propName(s.propId))+'</b><small><span'+(status==='offered'?' class="is-late"':'')+'>'+STATE[status]+'</span></small></button></li>').join('')+'</ul>';
  }
  function render(host){
    if(!host)return;const td=today(),scroller=host.querySelector('.jc-body'),top=scroller?scroller.scrollTop:0;
    const people=D.cleaners||[],all=people.map(c=>({c,work:upcoming(c,td)}));
    const total=all.reduce((n,x)=>{const k=counts(x.work);n.confirmed+=k.confirmed;n.offered+=k.offered;return n;},{confirmed:0,offered:0});
    let h='<header class="jb-head"><div class="jb-heading"><small class="jv-label">Team</small><div class="jb-title"><h2>'+esc(plural(people.length,'cleaner','cleaners'))+'</h2></div></div>'
      +'<div class="jb-tools"><button type="button" class="jv-btn" data-jm="access">Cleaner logins</button><button type="button" class="jv-icon-btn" data-jm="create" aria-label="Add cleaner" title="Add cleaner">'+svg(I.plus)+'</button></div></header>'
      +'<p class="jc-summary">'+(people.length?'Upcoming cleanings: '+esc(workText(total).toLowerCase()):'No team yet')+'</p>';
    if(!people.length)h+='<div class="jc-body"><div class="jb-empty"><p>No cleaners yet.</p><small>Add your first cleaner to assign cleanings.</small><button type="button" class="jv-btn" data-jm="create">Add cleaner</button></div></div>';
    else h+='<div class="jc-body"><ul class="jt-list jm-list">'+all.map(({c,work})=>{
      const open=expanded.has(c.id),k=counts(work);
      return '<li class="jt-task jm-person'+(open?' is-open':'')+'"><span class="jm-avatar" aria-hidden="true">'+esc(initials(c.name))+'</span>'
        +'<button type="button" class="jt-main" data-jm-open="'+esc(c.id)+'"><b>'+esc(c.name)+'</b><small><span>'+(c.phone?esc(c.phone):'No phone — edit to add')+'</span><span'+(k.offered?' class="is-late"':'')+'>'+esc(workText(k))+'</span></small></button>'
        +'<button type="button" class="jv-icon-btn jc-expand" data-jm-expand="'+esc(c.id)+'" aria-expanded="'+open+'" aria-label="'+(open?'Hide':'Show')+' actions for '+esc(c.name)+'">'+svg(I.down,15)+'</button>'
        +(open?'<div class="jt-actions">'+(c.phone?'<button type="button" class="jv-btn" data-jm-wa="'+esc(c.id)+'">WhatsApp chat</button>':'')+'<button type="button" class="jv-btn" data-jm-edit="'+esc(c.id)+'">Edit</button>'
          +'<span class="jt-delete"><button type="button" class="jv-btn jv-btn-danger" data-jm-ask="'+esc(c.id)+'">Remove</button><span class="jt-delete-ask" role="group" aria-label="Confirm removal">Remove '+esc(c.name)+'? <button type="button" class="jv-btn jv-btn-danger" data-jm-remove="'+esc(c.id)+'">Remove</button><button type="button" class="jv-btn" data-jm-keep="'+esc(c.id)+'">Keep</button></span></span></div>':'')
        +'</li>';
    }).join('')+'</ul></div>';
    host.innerHTML=h;const next=host.querySelector('.jc-body');if(next&&top)next.scrollTop=top;
  }
  function bind(host){
    if(!host||host.dataset.jmBound)return;host.dataset.jmBound='1';
    host.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-jm],[data-jm-open],[data-jm-expand],[data-jm-wa],[data-jm-edit],[data-jm-ask],[data-jm-keep],[data-jm-remove],[data-jm-sess]');if(!t)return;const d=t.dataset;
      if(d.jmOpen){openDetail(d.jmOpen);return;}
      if(d.jmSess){openSess(d.jmSess);return;}
      if(d.jmExpand){const id=d.jmExpand;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render(host);host.querySelector('[data-jm-expand="'+CSS.escape(id)+'"]')?.focus?.();return;}
      if(d.jmWa){const c=D.cleaners.find(x=>x.id===d.jmWa);if(c&&c.phone)openWA(c.phone);return;}
      if(d.jmEdit){openEditCleaner(d.jmEdit);return;}
      if(d.jmAsk){const box=t.closest('.jt-delete');box?.classList.add('is-asking');box?.querySelector('[data-jm-remove]')?.focus?.();return;}
      if(d.jmKeep){const box=t.closest('.jt-delete');box?.classList.remove('is-asking');box?.querySelector('[data-jm-ask]')?.focus?.();return;}
      if(d.jmRemove){expanded.delete(d.jmRemove);delCleaner(d.jmRemove,true);render(host);return;}
      if(d.jm==='create')openAddCleanerModal();else if(d.jm==='access')openCleanerAccess();
    });
  }
  /* ── Dialogs in the Jarvis theme with the workspace field ids, saved by the existing functions. ── */
  function detail(c){
    const work=upcoming(c,today()),k=counts(work),id=q(c.id);
    return '<div class="jv-modal jt-dialog"><small class="jv-label">Team</small><div class="modal-title">'+esc(c.name)+'</div>'
      +'<dl class="jv-facts"><dt>Phone</dt><dd>'+(c.phone?esc(c.phone):'No phone')+'</dd><dt>Upcoming</dt><dd>'+esc(workText(k))+'</dd></dl>'
      +'<small class="jv-label">Upcoming cleanings</small><div class="jm-work">'+workList(work,true)+'</div>'
      +'<div class="jv-actions jv-actions-end">'+(c.phone?'<button type="button" class="jv-btn" onclick="openWA('+q(c.phone)+')">WhatsApp chat</button>':'')+'<button type="button" class="jv-btn" onclick="openEditCleaner('+id+')">Edit</button><button type="button" class="jv-btn jv-btn-primary" onclick="closeModal()">Close</button></div></div>';
  }
  function openDetail(id){const c=(D.cleaners||[]).find(x=>x.id===id);if(c)showModal(detail(c));}
  function form(kind,c){
    const p=kind==='new'?'nc':'ec',id=c?q(c.id):'';
    return '<form class="jv-modal jt-dialog" onsubmit="event.preventDefault();SV_TEAM_VIEW.saveForm(\''+kind+'\','+(c?id:'&quot;&quot;')+')"><small class="jv-label">'+(kind==='new'?'New cleaner':'Edit cleaner')+'</small><div class="modal-title">'+(kind==='new'?'Add a cleaner':esc(c.name))+'</div>'
      +'<div class="field"><label for="'+p+'-name">Name</label><input type="text" id="'+p+'-name" autocomplete="off" value="'+(c?esc(c.name):'')+'" placeholder="e.g. Maria" aria-describedby="jm-form-error" data-jv-guard></div>'
      +'<p class="jv-note jt-form-error" id="jm-form-error" role="alert" hidden>Please enter a name.</p>'
      +'<div class="field"><label for="'+p+'-phone">WhatsApp number</label><input type="tel" id="'+p+'-phone" autocomplete="off" value="'+(c?esc(c.phone||''):'')+'" placeholder="e.g. +34 612 345 678" aria-describedby="jm-phone-help" data-jv-guard></div>'
      +'<p class="jv-modal-help" id="jm-phone-help">With country code.</p>'
      +'<div class="jv-actions jv-actions-end"><button type="button" class="jv-btn" onclick="closeModal()">Cancel</button><button type="submit" class="jv-btn jv-btn-primary">'+(kind==='new'?'Add cleaner':'Save changes')+'</button></div></form>';
  }
  /* The same empty-name rule as saveNewCleaner/saveEditCleaner, shown in the dialog instead of a browser alert. */
  function saveForm(kind,id){
    const box=document.getElementById(kind==='new'?'nc-name':'ec-name'),err=document.getElementById('jm-form-error');
    if(!box||!box.value.trim()){if(err)err.hidden=false;box?.setAttribute('aria-invalid','true');box?.focus();return;}
    if(kind==='new')saveNewCleaner();else saveEditCleaner(id);
  }
  window.SV_TEAM_VIEW={render,bind,detail,form,saveForm,upcoming};
})();
