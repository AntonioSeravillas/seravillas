/* Independent cleaner page: never loads manager data, migrations or manager access keys. */
(function(){
  'use strict';
  const DEV=['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname)||location.protocol==='file:';
  const API=DEV?'':'https://seravillas-sync.antonio-01e.workers.dev';
  const KEY=DEV?'seravillas_cleaner_preview':'seravillas_cleaner';
  const el=document.getElementById('portal');
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=x=>JSON.parse(JSON.stringify(x));
  const date=x=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(new Date(x+'T12:00:00'));
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const add=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
  const monday=d=>{const x=new Date(d+'T12:00:00');return add(d,-(x.getDay()+6)%7);};
  const load=(key,store=localStorage)=>{try{return JSON.parse(store.getItem(key)||'null');}catch{return null;}};
  const write=(key,value,store=localStorage)=>store.setItem(key,JSON.stringify(value));
  let auth=load(KEY+'_auth',sessionStorage)||load(KEY+'_auth'),cache=null,queue=[],week=monday(today()),filter='',view='schedule',busy=false,message='';
  function saveLocal(){if(!auth)return;try{write(KEY+'_cache_'+auth.cleanerId,cache);write(KEY+'_queue_'+auth.cleanerId,queue);}catch{message='Device storage is full. Keep this page open and sync your updates.';}}
  function readLocal(){cache=load(KEY+'_cache_'+auth.cleanerId);queue=load(KEY+'_queue_'+auth.cleanerId)||[];if(cache)week=cache.start;}
  const THEME_KEY=(DEV?'seravillas_dev:':'')+'sv_theme';
  const ICON={
    schedule:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    calendar:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 3v18M15 3v18M3 15h18"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  };
  const isLight=()=>document.documentElement.getAttribute('data-theme')==='light';
  function toggleTheme(){
    const next=isLight()?'dark':'light';
    document.documentElement.setAttribute('data-theme',next);
    try{localStorage.setItem(THEME_KEY,next);}catch{}
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',next==='light'?'#EDF1F2':'#191E21');
    render();
  }
  function themeButton(){return '<button class="ct-icon-btn" data-action="theme" title="'+(isLight()?'Switch to dark mode':'Switch to light mode')+'" aria-label="Switch theme">'+(isLight()?ICON.moon:ICON.sun)+'</button>';}
  function previewBanner(){return DEV?'<div class="ct-preview">Development preview · fictional schedule · cloud disabled</div>':'';}
  function login(){
    el.innerHTML='<header class="ct-header"><div class="ct-header-in"><div class="logo">SeraVillas</div><div class="ct-tools">'+themeButton()+'</div></div></header><main class="ct-main">'+previewBanner()+'<div class="ct-login sv-card"><div><div class="sv-title">Cleaning team</div><div class="sv-subtitle">Sign in to see the team schedule</div></div>'+(DEV?'<div class="field"><label for="ct-demo">Preview as</label><select id="ct-demo"><option value="demo-a">Maribel</option><option value="demo-b">Emi</option><option value="demo-team">Alina</option></select></div>':'<div class="field"><label for="ct-code">Personal access code</label><input id="ct-code" type="password" autocomplete="off" placeholder="Code from your manager"></div><label class="ct-remember"><input type="checkbox" id="ct-remember">Keep me signed in on this private device</label>')+'<p class="ct-message" role="status">'+esc(message)+'</p><button class="sv-btn sv-btn-primary" data-action="login">'+(DEV?'Open sample schedule':'Sign in')+'</button></div></main>';
  }
  async function api(path,options={}){
    if(DEV)throw new Error('Cloud disabled in preview');
    const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.code,...options.headers}});
    let result;try{result=await response.json();}catch{result={};}
    if(!response.ok){const error=new Error(result.error||'Cannot connect right now');error.status=response.status;throw error;}
    return result;
  }
  function sample(start,cleanerId){
    const own=(id,status,kind='main')=>cleanerId===id?[{kind,version:'preview-'+status}]:[];
    const friday=add(start,4),saturday=add(start,5);
    return {user:{id:cleanerId,name:({'demo-a':'Maribel','demo-b':'Emi','demo-team':'Alina'})[cleanerId]},revision:1,start,end:add(start,6),properties:[{id:'demo-mar',name:'Villa Mar'},{id:'demo-forca',name:'La Forca'}],stays:[{propId:'demo-mar',arrival:add(start,-3),departure:friday,arrivalTime:'16:00',departureTime:'10:00'},{propId:'demo-mar',arrival:friday,departure:add(start,11),arrivalTime:'16:00',departureTime:'10:00'}],sessions:[{id:'demo-1',propId:'demo-mar',date:friday,time:'10:00',status:'scheduled',required:4,departure:{date:friday,time:'10:00'},arrival:{date:friday,time:'16:00'},crew:{main:[{cleanerId:'demo-a',name:'Maribel',status:'offered',completedAt:''},{cleanerId:'demo-b',name:'Emi',status:'confirmed',completedAt:''}],alinaSpots:0,alinaStatus:'offered',alinaCompletedAt:''},own:[...own('demo-a','offered'),...own('demo-b','confirmed')]},{id:'demo-2',propId:'demo-forca',date:saturday,time:'10:00',status:'scheduled',required:3,departure:{date:saturday,time:'10:00'},arrival:null,crew:{main:[],alinaSpots:3,alinaStatus:'offered',alinaCompletedAt:''},own:own('demo-team','offered','alina')}]};
  }
  async function signIn(){
    if(busy)return;busy=true;message='Checking…';
    const code=DEV?'preview':(document.getElementById('ct-code')?.value||'').trim();
    const remember=!!document.getElementById('ct-remember')?.checked, demoId=document.getElementById('ct-demo')?.value;
    try{
      if(!DEV&&!/^[a-f0-9]{64}$/.test(code))throw new Error('Enter the personal code provided by your manager.');
      auth={code,cleanerId:demoId||'',remember};const result=DEV?sample(week,demoId):await api('/api/cleaner/schedule?start='+week+'&end='+add(week,6));
      auth.cleanerId=result.user.id;readLocal();cache=result;week=result.start;
      localStorage.removeItem(KEY+'_auth');sessionStorage.removeItem(KEY+'_auth');write(KEY+'_auth',auth,remember?localStorage:sessionStorage);
      saveLocal();message='';render();
    }catch(error){auth=null;message=error.message;login();}finally{busy=false;render();}
  }
  function ownItem(session,kind){return kind==='alina'?{status:session.crew.alinaStatus,completedAt:session.crew.alinaCompletedAt||''}:session.crew.main.find(m=>m.cleanerId===auth.cleanerId);}
  function pending(session,kind){return queue.find(q=>q.sessionId===session.id&&q.kind===kind);}
  function button(label,action,session,kind){return '<button class="sv-btn sv-btn-secondary sv-btn-sm" data-action="'+action+'" data-session="'+esc(session.id)+'" data-kind="'+kind+'"'+(busy?' disabled':'')+'>'+label+'</button>';}
  const STATUS_BADGE={confirmed:'sv-badge-resolved',offered:'sv-badge-waiting',declined:'sv-badge-open',cancelled:'sv-badge-open'};
  function badge(status){return '<span class="sv-badge '+(STATUS_BADGE[status]||'sv-badge-low')+'">'+esc(status)+'</span>';}
  function navItem(id,label){return '<button class="nav-item'+(view===id?' active':'')+'" data-action="view" data-view="'+id+'"'+(view===id?' aria-current="page"':'')+'>'+ICON[id]+label+'</button>';}
  function tabItem(id,label){return '<button class="sv-tab'+(view===id?' active':'')+'" data-action="view" data-view="'+id+'"'+(view===id?' aria-selected="true"':'')+'>'+label+'</button>';}
  function render(){
    if(!auth){login();return;}
    const data=cache, end=add(week,6), inside=data&&data.start===week;
    const statusClass=busy?'syncing':(!navigator.onLine||message.startsWith('Connection')||message.startsWith('Access'))?'error':data?'ok':'idle';
    let html='<header class="ct-header"><div class="ct-header-in"><div class="logo">SeraVillas</div><nav class="ct-tabs sv-tabs" aria-label="Sections">'+tabItem('schedule','Schedule')+tabItem('calendar','Calendar')+'</nav><div class="ct-tools"><span class="ct-user">'+(data?esc(data.user.name):'')+'</span><span class="header-date ct-date">'+esc(date(today()))+'</span><button class="ct-icon-btn" data-action="refresh" title="Refresh" aria-label="Refresh"'+(busy?' disabled':'')+'>'+ICON.refresh+'</button>'+themeButton()+'<button class="sv-btn sv-btn-ghost sv-btn-sm" data-action="signout">Sign out</button></div></div></header><main class="ct-main">'+previewBanner();
    html+='<div class="sv-page-header"><div class="sv-page-heading"><div class="sv-title">'+(view==='calendar'?'Villa calendar':'Cleaning schedule')+'</div><div class="sv-subtitle">'+esc(date(week))+' – '+esc(date(end))+(data?' · '+esc(data.user.name):'')+'</div></div></div>';
    html+='<div class="ct-controls sv-card"><div class="ct-weeknav"><button class="sv-btn sv-btn-secondary" data-action="previous" aria-label="Previous week">‹</button><div class="field"><label for="ct-week">Week of</label><input id="ct-week" type="date" value="'+week+'"></div><button class="sv-btn sv-btn-secondary" data-action="next" aria-label="Next week">›</button></div><div class="field"><label for="ct-villa">Villa</label><select id="ct-villa"><option value="">All villas</option>'+(data?data.properties.map(p=>'<option value="'+esc(p.id)+'"'+(filter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join(''):'')+'</select></div></div>';
    html+='<div class="ct-status" role="status"><span class="sync-dot '+statusClass+'"></span><span>'+esc(message||(busy?'Syncing…':!navigator.onLine?'Offline · showing the last downloaded schedule':data?'Last downloaded '+new Date(data.downloadedAt||Date.now()).toLocaleString():'Connect to download your schedule'))+'</span></div>';
    if(queue.length)html+='<div class="ct-warning">'+queue.length+' update'+(queue.length===1?'':'s')+' waiting to sync. '+(queue.some(q=>q.error)?'An assignment changed. Review the update below.':'Your changes are saved on this device.')+'</div>';
    if(!inside)html+='<p class="ct-note">'+(navigator.onLine?'Loading this week…':'This week has not been downloaded. Choose the last downloaded week to view it offline.')+'</p>';
    else if(view==='calendar'){
      html+='<div class="ct-calendar sv-card"><table><thead><tr><th>Villa</th>'+Array.from({length:7},(_,i)=>'<th>'+esc(date(add(week,i)))+'</th>').join('')+'</tr></thead><tbody>';
      data.properties.filter(p=>!filter||p.id===filter).forEach(p=>{html+='<tr><th>'+esc(p.name)+'</th>'+Array.from({length:7},(_,i)=>{const d=add(week,i),stays=data.stays.filter(s=>s.propId===p.id&&s.arrival<=d&&s.departure>=d),cleans=data.sessions.filter(s=>s.propId===p.id&&s.date===d);return '<td'+(stays.some(s=>s.arrival<=d&&s.departure>d)?' class="ct-stay"':'')+'>'+stays.filter(s=>s.departure===d).map(s=>'<span>Departure '+esc(s.departureTime)+'</span>').join('')+stays.filter(s=>s.arrival===d).map(s=>'<span>Arrival '+esc(s.arrivalTime)+'</span>').join('')+(stays.some(s=>s.arrival<d&&s.departure>d)?'<span>Occupied</span>':'')+cleans.map(s=>'<span class="ct-clean">Cleaning '+esc(s.time)+'</span>').join('')+'</td>';}).join('')+'</tr>';});html+='</tbody></table></div>';
    }else{
      const sessions=data.sessions.filter(s=>!filter||s.propId===filter).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      for(const d of [...new Set(sessions.map(s=>s.date))]){
        html+='<h2 class="ct-day">'+esc(date(d))+(d===today()?' <span class="sv-badge sv-badge-medium">Today</span>':'')+'</h2><div class="ct-cards">';
        for(const s of sessions.filter(s=>s.date===d)){
          const prop=data.properties.find(p=>p.id===s.propId),count=s.crew.main.filter(m=>m.status==='confirmed').length+(s.crew.alinaStatus==='confirmed'?s.crew.alinaSpots:0);
          html+='<article class="ct-card sv-card'+(s.own.length?' ct-own':'')+'" data-cleaning="'+esc(s.id)+'"><div class="ct-card-head"><h3>'+esc(prop?.name||'Villa')+'</h3><span class="ct-time">'+esc(s.time||'Time pending')+'</span></div><p class="ct-message">'+(s.departure?'Check-out '+esc(s.departure.time)+'<br>':'')+(s.arrival?'Next arrival '+(s.arrival.date===s.date?'today':esc(date(s.arrival.date)))+' · '+esc(s.arrival.time):'No next arrival booked')+'</p><div class="ct-staff">'+s.crew.main.map(m=>'<span><span>'+(m.cleanerId===auth.cleanerId?'<strong>'+esc(m.name)+' (you)</strong>':esc(m.name))+(m.completedAt?' · Work done':'')+'</span>'+badge(m.status)+'</span>').join('')+(s.crew.alinaSpots?'<span><span>Alina team · '+s.crew.alinaSpots+(s.crew.alinaCompletedAt?' · Work done':'')+'</span>'+badge(s.crew.alinaStatus)+'</span>':'')+'</div><div class="ct-coverage">'+(s.status==='done'?'Cleaning closed':count+'/'+s.required+' confirmed')+'</div>';
          for(const own of s.own){const item=ownItem(s,own.kind),q=pending(s,own.kind);html+='<div class="ct-actions">';
            if(q){html+='<span class="ct-message">'+esc(q.error||q.action+' waiting to sync')+'</span>'+(q.error?button('Discard update','discard',s,own.kind):'');}
            else if(s.status==='done')html+='<span class="ct-message">Completed</span>';
            else if(item.completedAt)html+='<span class="ct-message">Your work is marked done ✓</span>';
            else if(item.status==='offered')html+=button('Confirm','confirm',s,own.kind)+button('Decline','decline',s,own.kind);
            else if(item.status==='confirmed')html+=(s.date<=today()?button('My work is done','complete',s,own.kind):'<span class="ct-message">You are confirmed ✓</span>')+button('Cannot attend','decline',s,own.kind);
            else html+='<span class="ct-message">Assignment declined · ask the manager to offer it again</span>';
            html+='</div>';
          }html+='</article>';
        }html+='</div>';
      }if(!sessions.length)html+='<p class="ct-note">No cleanings planned for this week.</p>';
    }
    // Failed queued actions remain visible even after the manager removes the session.
    const hidden=queue.filter(q=>q.error&&(!inside||!data.sessions.some(s=>s.id===q.sessionId&&s.own.some(o=>o.kind===q.kind))));
    if(hidden.length)html+='<h2 class="ct-day">Updates to review</h2>'+hidden.map(q=>'<div class="ct-warning">'+esc(q.error)+' <button class="sv-btn sv-btn-ghost sv-btn-sm" data-action="discard" data-session="'+esc(q.sessionId)+'" data-kind="'+esc(q.kind)+'">Discard update</button></div>').join('');
    html+='</main><nav class="nav ct-nav" aria-label="Sections">'+navItem('schedule','Schedule')+navItem('calendar','Calendar')+'</nav>';
    el.innerHTML=html;
  }
  async function refresh(){
    if(!auth||busy)return;busy=true;render();
    try{
      if(DEV){if(!cache||cache.start!==week)cache=sample(week,auth.cleanerId);cache.downloadedAt=Date.now();message='Sample schedule · no cloud requests';}
      else{
        for(const q of queue.filter(q=>!q.error)){
          try{await api('/api/cleaner/assignment',{method:'POST',body:JSON.stringify({operationId:q.operationId,sessionId:q.sessionId,kind:q.kind,version:q.version,action:q.action})});queue=queue.filter(x=>x.operationId!==q.operationId);saveLocal();}
          catch(error){if([403,404,409,400].includes(error.status)){q.error=error.message;saveLocal();continue;}throw error;}
        }
        cache=await api('/api/cleaner/schedule?start='+week+'&end='+add(week,6));cache.downloadedAt=Date.now();message=queue.some(q=>q.error)?'Review updates that could not be applied':'Schedule up to date';
      }saveLocal();
    }catch(error){
      if(error.status===401){clearAuth();message='Access is no longer valid. Ask the manager for a new code.';}
      else message=error.status?error.message:'Connection unavailable · your schedule and updates are saved on this device';
    }finally{busy=false;render();}
  }
  function clearAuth(){
    if(auth){localStorage.removeItem(KEY+'_cache_'+auth.cleanerId);localStorage.removeItem(KEY+'_queue_'+auth.cleanerId);}
    localStorage.removeItem(KEY+'_auth');sessionStorage.removeItem(KEY+'_auth');auth=null;cache=null;queue=[];
  }
  async function update(sessionId,kind,action){
    const s=cache?.sessions.find(s=>s.id===sessionId),own=s?.own.find(x=>x.kind===kind);if(!s||!own||pending(s,kind)||busy)return;
    if(action==='decline'&&!confirm('Tell the manager you cannot attend this assignment?'))return;
    if(DEV){const item=ownItem(s,kind);if(action==='complete')item.completedAt=new Date().toISOString();else item.status=action==='confirm'?'confirmed':'cancelled';if(kind==='alina'){s.crew.alinaStatus=item.status;s.crew.alinaCompletedAt=item.completedAt||'';}saveLocal();message='Preview updated · sample data only';render();return;}
    queue.push({operationId:crypto.randomUUID(),sessionId,kind,version:own.version,action});saveLocal();render();await refresh();
  }
  el.addEventListener('click',async event=>{
    const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;
    if(action==='login')await signIn();else if(action==='refresh')await refresh();
    else if(action==='signout'){if(queue.length&&!confirm('You have unsynced updates. Signing out will remove them from this device. Continue?'))return;clearAuth();message='Signed out';login();}
    else if(action==='previous'||action==='next'){week=add(week,action==='next'?7:-7);render();await refresh();}
    else if(action==='view'){view=b.dataset.view||(view==='schedule'?'calendar':'schedule');render();}
    else if(action==='theme')toggleTheme();
    else if(action==='discard'){queue=queue.filter(q=>!(q.sessionId===b.dataset.session&&q.kind===b.dataset.kind));saveLocal();render();}
    else if(['confirm','decline','complete'].includes(action))await update(b.dataset.session,b.dataset.kind,action);
  });
  el.addEventListener('change',async event=>{if(event.target.id==='ct-week'){if(!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))return;week=monday(event.target.value);render();await refresh();}if(event.target.id==='ct-villa'){filter=event.target.value;render();}});
  el.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id==='ct-code')signIn();});
  window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>render());
  if(auth){readLocal();render();refresh();}else login();
  if(!DEV&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
