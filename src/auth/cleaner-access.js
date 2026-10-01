/* Manager controls for individual cleaner codes. Codes are shown once, never put in app data. */
async function openCleanerAccess(){
  if(DEV_MODE){showCleanerAccess({accounts:[]},true);return;}
  showModal('<div class="modal-title">Cleaner access</div><p>Checking cloud setup…</p>');
  try{
    const capabilities=await cloudFetch(SYNC_URL+'/api/admin/capabilities',{headers:{'X-Secret':SYNC_SECRET}});
    if(!capabilities.ok || !(await capabilities.json()).cleanerAccess){showModal('<div class="modal-title">Cleaner access is being prepared</div><p>The new cloud database must be activated before cleaner codes can be created.</p><p>The schedule continues to work with your current cloud service.</p><button class="btn btn-ghost" onclick="closeModal()">Close</button>');return;}
    const res=await cloudFetch(SYNC_URL+'/api/admin/accounts',{headers:{'X-Secret':SYNC_SECRET}});if(!res.ok)throw new Error();showCleanerAccess(await res.json(),false);
  }catch{showModal('<div class="modal-title">Could not load cleaner access</div><p>Check your connection and try again.</p><button class="btn btn-ghost" onclick="closeModal()">Close</button>');}
}
function showCleanerAccess(data,preview){
  const url=new URL('./cleaner/',location.href).href;
  showModal('<div class="modal-handle"></div><div class="modal-title">Cleaner access</div><p>Each cleaner uses her own personal code. She can see the team schedule, confirm or decline her own assignments, and mark her own work done.</p><p>Guest details, prices, contact details and manager notes are excluded.</p>'+(preview?'<p><strong>Preview only — no real accounts are created.</strong></p>':'')+'<p><a href="'+esc(url)+'" target="_blank" rel="noopener">Open cleaner sign-in page</a></p>'+D.cleaners.map(c=>{
    const account=data.accounts.find(a=>a.cleaner_id===c.id),active=account&&!account.revoked;
    return '<div class="sv-work-row"><div style="flex:1"><strong>'+esc(c.name)+'</strong><div class="cp-help">'+(active?'Access enabled':'No active code')+'</div></div><button class="btn btn-sm btn-ghost" data-cleaner-id="'+esc(c.id)+'" data-preview="'+preview+'" onclick="changeCleanerAccess(this.dataset.cleanerId,\'issue\',this.dataset.preview===\'true\')">'+(active?'Replace code':'Create code')+'</button>'+(active?'<button class="btn btn-sm btn-ghost" data-cleaner-id="'+esc(c.id)+'" onclick="changeCleanerAccess(this.dataset.cleanerId,\'revoke\',false)">Disable</button>':'')+'</div>';
  }).join('')+'<p class="cp-help">Keep codes private and send them to each cleaner yourself. Disabling a code stops further cloud access; a schedule already saved offline stays on that device until sign-out.</p>');
}
async function changeCleanerAccess(cleanerId,action,preview){
  const cleaner=D.cleaners.find(c=>c.id===cleanerId);if(!cleaner)return;
  if(preview){showModal('<div class="modal-title">Preview: '+esc(cleaner.name)+'</div><p>A private code would appear here once cloud access is activated.</p><button class="btn btn-ghost" onclick="openCleanerAccess()">Back</button>');return;}
  if(!confirm((action==='issue'?'Create a new personal code for ':'Disable cloud access for ')+cleaner.name+'?'+(action==='issue'?' Any previous code will stop working.':'')))return;
  try{
    const res=await cloudFetch(SYNC_URL+'/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json','X-Secret':SYNC_SECRET},body:JSON.stringify({cleanerId,action})});if(!res.ok)throw new Error();const result=await res.json();
    if(action==='revoke'){await openCleanerAccess();toast('Cleaner access disabled');return;}
    showModal('<div class="modal-title">Personal code for '+esc(cleaner.name)+'</div><p>Copy this code and give it privately to '+esc(cleaner.name)+'. It is shown only once.</p><div class="field"><label>Personal access code</label><input readonly value="'+esc(result.accessCode)+'" onclick="this.select()" style="font-family:monospace"></div><p>Sign-in page: <a href="'+esc(new URL('./cleaner/',location.href).href)+'" target="_blank" rel="noopener">SeraVillas cleaning team</a></p><button class="btn btn-ghost" onclick="openCleanerAccess()">Done</button>');
  }catch{toast('Could not change cleaner access. Please try again.');}
}
