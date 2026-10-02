// Development preview: seed sample data into development storage only, once
if(DEV_MODE&&!SV_STORAGE.getItem(DB)){
  try{SV_STORAGE.setItem(DB,JSON.stringify(svDevSeedData()));}catch(e){}
}
load();updateHeader();
if(DEV_MODE){
  // Development preview: open directly. No access key, no cloud, no migrations.
  setSyncStatus('idle');
  var _devBanner=document.createElement('div');
  _devBanner.className='dev-banner';
  _devBanner.textContent=SV_CONFIG.devLabel;
  document.documentElement.classList.add('dev-preview');
  document.body.insertBefore(_devBanner,document.body.firstChild);
  document.title='SeraVillas — '+SV_CONFIG.devLabel;
  render();
  checkReminder();
} else
// Startup: check if secret exists
if(!SYNC_SECRET){
  // No secret saved — show setup screen
  showSetup();
} else {
  // Secret exists — start normally
  (async()=>{
    render();
    const pulled=await pullFromCloud();
    runBookingMigration();
    runBookingMigration2027();
    render();
    checkReminder();
  })();
}
