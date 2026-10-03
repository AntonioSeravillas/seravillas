/* App controls live here; the original data, notification and authentication actions are reused. */
function setAppSettingsView(view){
  if(!['preferences','backups','sync'].includes(view))return;
  settingsView=view;render();
}
function setAppTheme(theme){
  if(theme!=='light'&&theme!=='dark')return;
  if(document.documentElement.getAttribute('data-theme')!==theme)toggleTheme();
  render();
}
function renderAppSettings(){
  const tabs=[['preferences','Preferences'],['backups','Data & backups'],['sync','Sync & access']];
  let h='<div class="sv-page settings-page"><div class="sv-page-header"><div class="sv-page-heading"><div class="sv-title">Settings</div><div class="sv-subtitle">App preferences, backups and cloud access.</div></div></div><div class="sv-tabs" aria-label="Settings sections">';
  tabs.forEach(([key,label])=>h+=`<button class="sv-tab${settingsView===key?' active':''}" aria-pressed="${settingsView===key}" onclick="setAppSettingsView('${key}')">${label}</button>`);
  h+='</div><div class="settings-content">';
  return h+(settingsView==='backups'?renderSettingsBackups():settingsView==='sync'?renderSettingsSync():renderSettingsPreferences())+'</div></div>';
}
function renderSettingsPreferences(){
  const theme=document.documentElement.getAttribute('data-theme')||'light';
  const notifPerm='Notification' in window?Notification.permission:'unsupported';
  const notifHtml=notifPerm==='granted'
    ?'<div class="settings-state">Reminders enabled ✓</div>'
    :notifPerm==='denied'
    ?'<div class="settings-help">Reminders are blocked. Allow notifications in your browser settings to enable them.</div>'
    :'<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="requestNotif()">Enable day-before reminders</button>';
  return `<section class="sv-card settings-card" aria-labelledby="settings-appearance"><h2 id="settings-appearance">Appearance</h2><p class="settings-help">Choose the app theme for this device.</p>
    <div class="settings-actions">${[['light','Light'],['dark','Dark']].map(([key,label])=>`<button class="sv-btn ${theme===key?'sv-btn-primary':'sv-btn-secondary'}" aria-pressed="${theme===key}" onclick="setAppTheme('${key}')">${label}</button>`).join('')}</div></section>
    <section class="sv-card settings-card" aria-labelledby="settings-reminders"><h2 id="settings-reminders">Cleaning reminders</h2><p class="settings-help">Day-before reminders for scheduled cleanings.</p>${notifHtml}</section>`;
}
function renderSettingsBackups(){
  const size=getDataSizeKB(),date=SV_STORAGE.getItem(BACKUP_DATE_KEY);
  return `<section class="sv-card settings-card" aria-labelledby="settings-storage"><h2 id="settings-storage">Storage used</h2><p class="settings-help">${size} KB of approximately 5,000 KB in this browser.</p><div class="settings-storage-track"><div style="width:${Math.min(100,Math.round(size/50))}%"></div></div></section>
    <section class="sv-card settings-card" aria-labelledby="settings-backups"><h2 id="settings-backups">Data &amp; backups</h2><p class="settings-help">Export your full app data, or restore an existing backup.</p>
    <div class="settings-actions"><button class="sv-btn sv-btn-primary" onclick="exportData()">Export backup</button><button class="sv-btn sv-btn-secondary" onclick="restoreBackup()">Restore auto-backup</button><button class="sv-btn sv-btn-secondary" onclick="document.getElementById('import-file').click()">Import backup</button></div>
    <p class="settings-help">${date?'Auto-backup from '+esc(date):'No auto-backup yet'}</p>
    ${SV_STORAGE.getItem(DB+'_beforeExcelImport')?`<div class="settings-divider"><h3>Before your last Excel import</h3><p class="settings-help">Restore the full app snapshot saved before the latest workbook was applied.</p><button class="sv-btn sv-btn-secondary" onclick="restoreBeforeExcelImport()">Restore before last Excel import</button></div>`:''}</section>`;
}
function renderSettingsSync(){
  const label=DEV_MODE?'Cloud sync disabled (development preview)':{idle:'Not synced',syncing:'Syncing…',ok:'Synced',error:'Sync failed'}[syncStatus];
  return `<section class="sv-card settings-card" aria-labelledby="settings-cloud"><h2 id="settings-cloud">Cloud sync</h2><p class="settings-help">Keep your manager data up to date across devices.</p>
    <div class="settings-sync" role="status"><span class="sync-dot ${syncStatus}" id="sync-dot-settings"></span><span id="sync-label-settings">${label||'Not synced'}</span><button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="syncNow()"${DEV_MODE?' disabled title="Cloud sync is disabled in the development preview"':''}>Sync now</button></div>
    ${DEV_MODE?'<p class="settings-help">Development preview: data stays in this browser only.</p>':''}</section>
    <section class="sv-card settings-card" aria-labelledby="settings-access"><h2 id="settings-access">Manager access</h2>
    ${DEV_MODE?'<p class="settings-help">No access key is needed in the development preview.</p>':`<p class="settings-help">Manage the access key saved on this device.</p><button class="sv-btn sv-btn-secondary" onclick="resetAccess()">Sign out / change access key</button>`}</section>`;
}
