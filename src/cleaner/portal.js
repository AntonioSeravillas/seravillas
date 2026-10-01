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
  function login(){el.innerHTML='<div class="ct-login"><h1>SeraVillas</h1><p>Cleaning team sign-in</p>'+(DEV?'<div class="ct-preview">Development preview · fictional schedule · cloud disabled</div><label for="ct-demo">Preview as</label><select id="ct-demo"><option value="demo-a">Maribel</option><option value="demo-b">Emi</option><option value="demo-team">Alina</option></select>':'<label for="ct-code">Personal access code</label><input id="ct-code" type="password" autocomplete="off" placeholder="Code from your manager"><label class="ct-remember"><input type="checkbox" id="ct-remember">Keep me signed in on this private device</label>')+'<p class="ct-message" role="status">'+esc(message)+'</p><button class="sv-btn sv-btn-primary" data-action="login">'+(DEV?'Open sample schedule':'Sign in')+'</button></div>';}
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
  function render(){
    if(!auth){login();return;}
    const data=cache, end=add(week,6), inside=data&&data.start===week;
    let html=(DEV?'<div class="ct-preview">Development preview · fictional schedule · cloud disabled</div>':'')+'<header class="ct-head"><div><h1>SeraVillas</h1><div class="ct-message">Cleaning team'+(data?' · '+esc(data.user.name):'')+'</div></div><div class="ct-buttons"><button class="sv-btn sv-btn-secondary sv-btn-sm" data-action="refresh"'+(busy?' disabled':'')+'>Refresh</button><button class="sv-btn sv-btn-ghost sv-btn-sm" data-action="signout">Sign out</button></div></header>';
    html+='<div class="ct-controls"><button class="sv-btn sv-btn-secondary sv-btn-sm" data-action="previous" aria-label="Previous week">‹</button><label>Week of<input id="ct-week" type="date" value="'+week+'"></label><button class="sv-btn sv-btn-secondary sv-btn-sm" data-action="next" aria-label="Next week">›</button><label>Villa<select id="ct-villa"><option value="">All villas</option>'+(data?data.properties.map(p=>'<option value="'+esc(p.id)+'"'+(filter===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join(''):'')+'</select></label><button class="sv-btn sv-btn-secondary sv-btn-sm" data-action="view">'+(view==='schedule'?'Villa calendar':'Cleaning schedule')+'</button></div>';
    html+='<div class="ct-message" role="status">'+esc(message||(busy?'Syncing…':!navigator.onLine?'Offline · showing the last downloaded schedule':data?'Last downloaded '+new Date(data.downloadedAt||Date.now()).toLocaleString():'Connect to download your schedule'))+'</div>';
    if(queue.length)html+='<div class="ct-warning">'+queue.length+' update'+(queue.length===1?'':'s')+' waiting to sync. '+(queue.some(q=>q.error)?'An assignment changed. Review the update below.':'Your changes are saved on this device.')+'</div>';
    if(!inside)html+='<p>'+(navigator.onLine?'Loading this week…':'This week has not been downloaded. Choose the last downloaded week to view it offline.')+'</p>';
    else if(view==='calendar'){
      html+='<div class="ct-calendar"><table><thead><tr><th>Villa</th>'+Array.from({length:7},(_,i)=>'<th>'+esc(date(add(week,i)))+'</th>').join('')+'</tr></thead><tbody>';
      data.properties.filter(p=>!filter||p.id===filter).forEach(p=>{html+='<tr><th>'+esc(p.name)+'</th>'+Array.from({length:7},(_,i)=>{const d=add(week,i),stays=data.stays.filter(s=>s.propId===p.id&&s.arrival<=d&&s.departure>=d),cleans=data.sessions.filter(s=>s.propId===p.id&&s.date===d);return '<td'+(stays.some(s=>s.arrival<=d&&s.departure>d)?' class="ct-stay"':'')+'>'+stays.filter(s=>s.departure===d).map(s=>'<span>Departure '+esc(s.departureTime)+'</span>').join('')+stays.filter(s=>s.arrival===d).map(s=>'<span>Arrival '+esc(s.arrivalTime)+'</span>').join('')+(stays.some(s=>s.arrival<d&&s.departure>d)?'<span>Occupied</span>':'')+cleans.map(s=>'<span>Cleaning '+esc(s.time)+'</span>').join('')+'</td>';}).join('')+'</tr>';});html+='</tbody></table></div>';
    }else{
      const sessions=data.sessions.filter(s=>!filter||s.propId===filter).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      for(const d of [...new Set(sessions.map(s=>s.date))]){
        html+='<h2>'+esc(date(d))+'</h2><div class="ct-cards">';
        for(const s of sessions.filter(s=>s.date===d)){
          const prop=data.properties.find(p=>p.id===s.propId),count=s.crew.main.filter(m=>m.status==='confirmed').length+(s.crew.alinaStatus==='confirmed'?s.crew.alinaSpots:0);
          html+='<article class="ct-card'+(s.own.length?' ct-own':'')+'" data-cleaning="'+esc(s.id)+'"><div class="ct-card-head"><h3>'+esc(prop?.name||'Villa')+'</h3><span>'+esc(s.time||'Time pending')+'</span></div><p class="ct-message">'+(s.departure?'Check-out '+esc(s.departure.time)+'<br>':'')+(s.arrival?'Next arrival '+(s.arrival.date===s.date?'today':esc(date(s.arrival.date)))+' · '+esc(s.arrival.time):'No next arrival booked')+'</p><div class="ct-staff">'+s.crew.main.map(m=>'<span>'+(m.cleanerId===auth.cleanerId?'<strong>'+esc(m.name)+' (you)</strong>':esc(m.name))+' · '+esc(m.status)+(m.completedAt?' · Work done':'')+'</span>').join('')+(s.crew.alinaSpots?'<span>Alina team · '+s.crew.alinaSpots+' · '+esc(s.crew.alinaStatus)+(s.crew.alinaCompletedAt?' · Work done':'')+'</span>':'')+'</div><div class="ct-message">'+(s.status==='done'?'Cleaning closed':count+'/'+s.required+' confirmed')+'</div>';
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
      }if(!sessions.length)html+='<p>No cleanings planned for this week.</p>';
    }
    // Failed queued actions remain visible even after the manager removes the session.
    const hidden=queue.filter(q=>q.error&&(!inside||!data.sessions.some(s=>s.id===q.sessionId&&s.own.some(o=>o.kind===q.kind))));
    if(hidden.length)html+='<h2>Updates to review</h2>'+hidden.map(q=>'<div class="ct-warning">'+esc(q.error)+' <button class="sv-btn sv-btn-ghost sv-btn-sm" data-action="discard" data-session="'+esc(q.sessionId)+'" data-kind="'+esc(q.kind)+'">Discard update</button></div>').join('');
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
    else if(action==='view'){view=view==='schedule'?'calendar':'schedule';render();}
    else if(action==='discard'){queue=queue.filter(q=>!(q.sessionId===b.dataset.session&&q.kind===b.dataset.kind));saveLocal();render();}
    else if(['confirm','decline','complete'].includes(action))await update(b.dataset.session,b.dataset.kind,action);
  });
  el.addEventListener('change',async event=>{if(event.target.id==='ct-week'){if(!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))return;week=monday(event.target.value);render();await refresh();}if(event.target.id==='ct-villa'){filter=event.target.value;render();}});
  el.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id==='ct-code')signIn();});
  window.addEventListener('online',()=>refresh());window.addEventListener('offline',()=>render());
  if(auth){readLocal();render();refresh();}else login();
  if(!DEV&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
