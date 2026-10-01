/* ── CLOUD SYNC ENGINE ── */
function cloudFetch(url,opts){
  if(DEV_MODE)return Promise.reject(new Error('Cloud sync disabled in development preview'));
  return fetch(url,opts);
}
function setSyncStatus(s,label){
  if(DEV_MODE){s='idle';label='Cloud sync disabled';}
  syncStatus=s;
  ['sync-dot','sync-dot-mobile'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.className='sync-dot '+s;}
  });
  const lbl=document.getElementById('sync-label');
  if(lbl)lbl.textContent=label||{idle:'Not synced',syncing:'Syncing…',ok:'Synced',error:'Sync failed'}[s]||s;
}

async function pushToCloud(){
  if(DEV_MODE)return;
  if(!SYNC_URL||!SYNC_SECRET)return;
  setSyncStatus('syncing');
  try{
    D._savedAt=Date.now(); // timestamp every push
    const res=await cloudFetch(SYNC_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Secret':SYNC_SECRET},
      body:JSON.stringify(D)
    });
    if(res.ok){
      setSyncStatus('ok','Saved to cloud');
      SV_STORAGE.setItem(DB+'_lastSync',Date.now().toString());
    } else {
      setSyncStatus('error','Save failed');
    }
  }catch(e){
    setSyncStatus('error','Offline');
  }
}

async function pullFromCloud(){
  if(DEV_MODE)return false;
  if(!SYNC_URL||!SYNC_SECRET)return false;
  setSyncStatus('syncing','Loading…');
  try{
    const res=await cloudFetch(SYNC_URL,{
      method:'GET',
      headers:{'X-Secret':SYNC_SECRET}
    });
    if(!res.ok){setSyncStatus('error','Load failed');return false;}
    const text=await res.text();
    if(!text||text==='null'){setSyncStatus('ok','Cloud empty — using local');return false;}
    const remote=JSON.parse(text);
    // Conflict detection: compare timestamps
    const localTs=D._savedAt||0;
    const remoteTs=remote._savedAt||0;
    const localBks=(D.bookings||[]).length;
    const remoteBks=(remote.bookings||[]).length;
    // Use remote if: it's newer by timestamp, OR it has more bookings (fallback for old data)
    const remoteWins=remoteTs>localTs||(remoteTs===localTs&&remoteBks>=localBks);
    if(remoteWins){
      Object.assign(D,remote);
      D.bookings=D.bookings||[];
      D.props=D.props||[];
      D.sessions=D.sessions||[];
      D.tasks=D.tasks||[];
      D.issues=D.issues||[];
      D.supplies=D.supplies||[];
      D.projects=D.projects||[];
      D.cleaners=D.cleaners||[];
      D.events=D.events||[];
      save();
      setSyncStatus('ok','Synced from cloud');
      return true;
    } else {
      setSyncStatus('ok','Local is newer');
      await pushToCloud();
      return false;
    }
  }catch(e){
    setSyncStatus('error','Offline');
    return false;
  }
}

// Debounced auto-push — saves 2s after last change
function schedulePush(){
  if(DEV_MODE)return;
  if(syncTimeout)clearTimeout(syncTimeout);
  syncTimeout=setTimeout(()=>pushToCloud(),2000);
}

async function refreshApp(){
  if(DEV_MODE){render();toast('Preview — cloud sync is disabled');return;}
  const btn=document.getElementById('refresh-btn');
  if(btn){btn.classList.add('refresh-spin');setTimeout(()=>btn.classList.remove('refresh-spin'),550);}
  const pulled=await pullFromCloud();
  render();
  toast(pulled?'Synced from cloud ✓':'Up to date ✓');
}

async function syncNow(){
  if(DEV_MODE){toast('Preview — cloud sync is disabled');return;}
  const pulled=await pullFromCloud();
  if(pulled){render();}
}

