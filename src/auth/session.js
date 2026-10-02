/* ── SETUP / LOGIN ── */
function showSetup(){
  if(DEV_MODE)return;
  document.getElementById('setup-screen').style.display='flex';
  document.querySelector('.app-wrapper').style.display='none';
  const legacyNav=document.querySelector('.nav');if(legacyNav)legacyNav.style.display='none';
  setTimeout(()=>document.getElementById('setup-secret').focus(),100);
}
function hideSetup(){
  document.getElementById('setup-screen').style.display='none';
  document.querySelector('.app-wrapper').style.display='';
  const legacyNav=document.querySelector('.nav');if(legacyNav)legacyNav.style.display='';
}
async function setupSubmit(){
  if(DEV_MODE)return;
  const input=document.getElementById('setup-secret');
  const errEl=document.getElementById('setup-error');
  const secret=(input.value||'').trim();
  if(!secret){errEl.textContent='Please enter your access key';return;}
  errEl.textContent='Checking…';
  input.disabled=true;
  // Test the secret by trying a GET request
  try{
    const res=await cloudFetch(SYNC_URL,{method:'GET',headers:{'X-Secret':secret}});
    if(res.status===401){
      errEl.textContent='Wrong access key — please try again';
      input.disabled=false;input.select();return;
    }
    if(!res.ok){
      errEl.textContent='Connection error — check your internet and try again';
      input.disabled=false;return;
    }
    // Success — save secret and continue
    SYNC_SECRET=secret;
    SV_STORAGE.setItem('sv_secret',secret);
    errEl.textContent='';
    input.disabled=false;
    hideSetup();
    // Load cloud data
    load();updateHeader();render();
    const pulled=await pullFromCloud();
    if(pulled)render();
    checkReminder();
  }catch(e){
    errEl.textContent='Cannot connect — check your internet connection';
    input.disabled=false;
  }
}
function resetAccess(){
  if(DEV_MODE){toast('Preview — no access key in development');return;}
  if(!confirm('This will sign out and clear your access key. You will need to re-enter it to use the app. Continue?'))return;
  SV_STORAGE.removeItem('sv_secret');
  SYNC_SECRET='';
  location.reload();
}

document.addEventListener('click',function(e){
  const navEl=e.target.closest('[data-nav]');
  if(navEl){e.stopPropagation();navTo(navEl.dataset.nav);}
},true);

document.addEventListener('click',function(e2){
  const dfnEl=e2.target.closest('[data-dfn]');
  if(dfnEl){e2.stopPropagation();const fn=dfnEl.dataset.dfn;const id=dfnEl.dataset.did;if(fn&&id&&window[fn])window[fn](id);}
},true);

