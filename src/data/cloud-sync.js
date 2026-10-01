/* Manager sync: optimistic versions + three-way merge. Old KV service remains supported. */
let cloudBusy=false,cloudAgain=false,cloudConflict=null;
function cloudFetch(url,opts){if(DEV_MODE)return Promise.reject(new Error('Cloud sync disabled in development preview'));return fetch(url,opts);}
function cloudState(){try{return JSON.parse(SV_STORAGE.getItem(DB+'_cloudState')||'null');}catch{return null;}}
function rememberCloud(base,etag){SV_STORAGE.setItem(DB+'_cloudState',JSON.stringify({base,etag}));}
function localCloudSave(){SV_STORAGE.setItem(DB,JSON.stringify(D));}
function setSyncStatus(s,label){
  if(DEV_MODE){s='idle';label='Cloud sync disabled';}syncStatus=s;
  ['sync-dot','sync-dot-mobile'].forEach(id=>{const el=document.getElementById(id);if(el)el.className='sync-dot '+s;});
  const lbl=document.getElementById('sync-label');if(lbl)lbl.textContent=label||{idle:'Not synced',syncing:'Syncing…',ok:'Synced',error:'Sync failed'}[s]||s;
}
function showCloudConflict(remote,etag,base){
  cloudConflict={remote,etag,base};setSyncStatus('error','Sync needs review');
  const conflicts=base?SV_SYNC.merge(base,D,remote).conflicts:['Existing local changes'];
  showModal('<div class="modal-handle"></div><div class="modal-title">Review sync changes</div><p>Your local changes are saved on this device. Some records also changed in the cloud.</p><p>'+conflicts.slice(0,10).map(p=>esc(p)).join('<br>')+'</p><p>Choose which version to use for conflicting fields. Other changes will be combined.</p><button class="btn btn-ghost" onclick="exportData()">Export local backup</button><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-teal" onclick="resolveCloudConflict(\'local\')">Keep my changes</button><button class="btn btn-ghost" onclick="resolveCloudConflict(\'remote\')">Use cloud changes</button></div>');
}
function resolveCloudConflict(prefer){
  if(!cloudConflict)return;const {remote,etag,base}=cloudConflict;
  const merged=base?SV_SYNC.merge(base,D,remote,prefer).data:prefer==='local'?JSON.parse(JSON.stringify(D)):remote;
  Object.keys(D).forEach(k=>delete D[k]);Object.assign(D,merged);
  rememberCloud(remote,etag);localCloudSave();cloudConflict=null;closeModal();render();schedulePush();
}
async function readCloud(){
  const res=await cloudFetch(SYNC_URL,{method:'GET',headers:{'X-Secret':SYNC_SECRET}});
  if(!res.ok)throw new Error('Load failed');const text=await res.text();
  return {remote:text&&text!=='null'?JSON.parse(text):null,etag:res.headers?.get('ETag')||null};
}
function acceptVersionedCloud(remote,etag){
  const state=cloudState();let merged=remote;
  if(state?.etag){
    const result=SV_SYNC.merge(state.base,D,remote);
    if(result.conflicts.length){showCloudConflict(remote,etag,state.base);return false;}merged=result.data;
  }else if((D._savedAt||0)>(remote._savedAt||0)){
    showCloudConflict(remote,etag,null);return false;
  }
  Object.keys(D).forEach(k=>delete D[k]);Object.assign(D,merged);rememberCloud(remote,etag);localCloudSave();return true;
}
async function pushToCloud(){
  if(DEV_MODE||!SYNC_URL||!SYNC_SECRET||cloudConflict)return;
  if(cloudBusy){cloudAgain=true;return;}cloudBusy=true;setSyncStatus('syncing');
  try{
    let state=cloudState();
    if(!state?.etag){const {remote,etag}=await readCloud();if(etag&&remote){if(!acceptVersionedCloud(remote,etag))return;state=cloudState();}}
    if(state?.etag&&SV_SYNC.equal({...state.base,_savedAt:0},{...D,_savedAt:0})){setSyncStatus('ok','Up to date');return;}
    D._savedAt=Date.now();localCloudSave();const sent=JSON.parse(JSON.stringify(D));
    const res=await cloudFetch(SYNC_URL,{method:'POST',headers:{'Content-Type':'application/json','X-Secret':SYNC_SECRET,...(state?.etag?{'If-Match':state.etag}:{})},body:JSON.stringify(sent)});
    if(res.status===409||res.status===428){const {remote,etag}=await readCloud();if(remote&&etag&&acceptVersionedCloud(remote,etag))cloudAgain=true;return;}
    if(!res.ok){setSyncStatus('error',res.status===413?'Data too large — export backup':'Save failed');return;}
    const tag=res.headers?.get('ETag');
    if(tag){const result=await res.json();sent._savedAt=result.savedAt;rememberCloud(sent,tag);if(SV_SYNC.equal({...D,_savedAt:0},{...sent,_savedAt:0}))D._savedAt=sent._savedAt;localCloudSave();}
    setSyncStatus('ok','Saved to cloud');SV_STORAGE.setItem(DB+'_lastSync',Date.now().toString());
  }catch(error){setSyncStatus('error','Offline');}
  finally{cloudBusy=false;if(cloudAgain&&!cloudConflict){cloudAgain=false;schedulePush();}}
}
async function pullFromCloud(){
  if(DEV_MODE||!SYNC_URL||!SYNC_SECRET||cloudConflict)return false;
  if(cloudBusy){cloudAgain=true;return false;}cloudBusy=true;setSyncStatus('syncing','Loading…');
  try{
    const {remote,etag}=await readCloud();if(!remote){setSyncStatus('ok','Cloud empty — using local');return false;}
    if(etag){if(!acceptVersionedCloud(remote,etag))return false;setSyncStatus('ok','Synced from cloud');cloudAgain=true;return true;}
    const localTs=D._savedAt||0,remoteTs=remote._savedAt||0;
    if(remoteTs>localTs||(remoteTs===localTs&&(remote.bookings||[]).length>=(D.bookings||[]).length)){
      Object.assign(D,remote);['bookings','props','sessions','tasks','issues','supplies','projects','cleaners','events'].forEach(k=>D[k]=D[k]||[]);save();setSyncStatus('ok','Synced from cloud');return true;
    }
    setSyncStatus('ok','Local is newer');cloudAgain=true;return false;
  }catch(error){setSyncStatus('error','Offline');return false;}
  finally{cloudBusy=false;if(cloudAgain&&!cloudConflict){cloudAgain=false;schedulePush();}}
}
function schedulePush(){if(DEV_MODE)return;if(syncTimeout)clearTimeout(syncTimeout);syncTimeout=setTimeout(()=>pushToCloud(),2000);}
async function refreshApp(){if(DEV_MODE){render();toast('Preview — cloud sync is disabled');return;}const pulled=await pullFromCloud();render();toast(cloudConflict?'Sync needs review':syncStatus==='error'?'Could not sync — local data is saved':pulled?'Synced from cloud ✓':'Up to date ✓');}
async function syncNow(){if(DEV_MODE){toast('Preview — cloud sync is disabled');return;}if(cloudConflict){showCloudConflict(cloudConflict.remote,cloudConflict.etag,cloudConflict.base);return;}if(await pullFromCloud())render();}
