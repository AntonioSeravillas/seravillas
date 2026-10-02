/* ── TASK HELPERS ── */
function quickAddTask(type){type=type||'ops';const el=document.getElementById('task-input');const text=(el?.value||'').trim();if(!text)return;D.tasks.push({id:uid(),text,propId:'',priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:today(),type,projectId:''});el.value='';save();render();}
function quickAddTaskForProp(propId){const el=document.getElementById('hub-task-input');const text=(el?.value||'').trim();if(!text)return;D.tasks.push({id:uid(),text,propId,priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:today(),type:'ops',projectId:''});el.value='';save();render();toast('Task added!');}
function toggleTask(id){toggleTaskDone(id);}
function deleteTask(id){D.tasks=D.tasks.filter(x=>x.id!==id);save();render();}
function toggleCleaner(id){const i=selCleaners.indexOf(id);if(i>=0)selCleaners.splice(i,1);else selCleaners.push(id);document.querySelectorAll('#cleaner-chips .chip').forEach(c=>c.classList.toggle('on',selCleaners.includes(c.dataset.id)));}

/* ── CRUD ── */
function addSess(){const propId=(document.getElementById('f-prop')||{}).value||'';const date=(document.getElementById('f-date')||{}).value||'';const time=(document.getElementById('f-time')||{}).value||'';const note=(document.getElementById('f-note')||{}).value||'';const cids=[...selCleaners];if(!propId){alert('Please select a property.');return;}if(!date){alert('Please pick a date.');return;}if(!cids.length){alert('Please select at least one cleaner.');return;}D.sessions.push({id:uid(),propId,cleanerIds:cids,date,time,note,status:'scheduled'});selCleaners=[];save();toast('Session saved!');go('home');}
function addProp(){const el=document.getElementById('prop-in');const n=(el?.value||'').trim();if(!n)return;D.props.push({id:uid(),name:n,notes:'',photos:[]});el.value='';save();toast('Property added');render();}
function delProp(id){if(!confirm('Remove this property and all its sessions, tasks and issues?'))return;D.props=D.props.filter(p=>p.id!==id);D.sessions=D.sessions.filter(s=>s.propId!==id);D.tasks=D.tasks.filter(t=>t.propId!==id);D.issues=D.issues.filter(i=>i.propId!==id);propHubId=null;save();render();}
function delCleaner(id){if(!confirm('Remove this cleaner?'))return;D.cleaners=D.cleaners.filter(c=>c.id!==id);D.sessions.forEach(s=>s.cleanerIds=(s.cleanerIds||[]).filter(cid=>cid!==id));save();render();}
function delSess(id){if(!confirm('Delete this session?'))return;D.sessions=D.sessions.filter(s=>s.id!==id);save();closeModal();render();}

/* ── NOTIFICATIONS ── */
function requestNotif(){if(!('Notification' in window)){alert('Not supported.');return;}Notification.requestPermission().then(p=>{if(p==='granted'){toast('Reminders enabled!');checkReminder();}else toast('Permission not granted');render();});}
function checkReminder(){if(!('Notification' in window)||Notification.permission!=='granted')return;const now=new Date();if(now.getHours()<17)return;const tom=addDays(today(),1);const ss=D.sessions.filter(s=>s.date===tom&&s.status==='scheduled');if(!ss.length)return;const key='sv_notif_'+today();if(SV_STORAGE.getItem(key))return;const pnames=[...new Set(ss.map(s=>propName(s.propId)))];new Notification('SeraVillas — tomorrow\'s cleanings',{body:ss.length+' cleaning'+(ss.length>1?'s':'')+' at: '+pnames.join(', '),tag:'sv-reminder'});SV_STORAGE.setItem(key,'1');}

/* ── BACKUP (import only — export/restore defined above) ── */
function importData(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=function(ev){try{const parsed=JSON.parse(ev.target.result);if(!parsed.props||!parsed.cleaners||!parsed.sessions)throw new Error('Invalid backup file');if(!confirm('Replace all current data with this backup?'))return;Object.assign(D,parsed);D.tasks=D.tasks||[];D.issues=D.issues||[];D.scratch=D.scratch||'';D.supplies=D.supplies||[];D.events=D.events||[];D.bookings=D.bookings||[];D.projects=D.projects||[];save();render();toast('Backup restored ✓');}catch(err){alert('Could not read backup file — may be corrupted.');}e.target.value='';};reader.readAsText(file);}

/* ── MODAL ── */
let modalReturnFocus=null;
function showModal(html){
  const root=document.getElementById('modal-root');
  if(!root.querySelector?.('.modal'))modalReturnFocus=document.activeElement;
  root.innerHTML='<div class="modal-wrap" onclick="closeModal(event)"><div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick="event.stopPropagation()"><button class="modal-close" aria-label="Close dialog" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button>'+html+'</div></div>';
  const dialog=root.querySelector?.('.modal');
  if(dialog){dialog.setAttribute('aria-label',dialog.querySelector?.('.modal-title')?.textContent||'Details');dialog.focus?.();}
}
function closeModal(e){
  if(e&&!e.target.classList.contains('modal-wrap'))return;
  document.getElementById('modal-root').innerHTML='';
  if(modalReturnFocus?.isConnected)modalReturnFocus.focus?.();modalReturnFocus=null;
}
document.addEventListener('keydown',function(event){
  const dialog=document.querySelector('#modal-root .modal');if(!dialog)return;
  if(event.key==='Escape'){event.preventDefault();closeModal();return;}
  if(event.key!=='Tab')return;
  const controls=Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length);
  if(!controls.length){event.preventDefault();dialog.focus();return;}
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){event.preventDefault();first.focus();}
});

document.addEventListener('keydown',function(e){if(e.key!=='Enter')return;if(e.target.id==='prop-in')addProp();if(e.target.id==='supply-input')addSupply();});
document.addEventListener('click',function(e){
  const supplyBtn=e.target.closest('[data-supply]');
  if(supplyBtn){const id=supplyBtn.dataset.supply;const field=supplyBtn.dataset.field;const delta=parseInt(supplyBtn.dataset.delta);adjustSupply(id,field,delta);return;}
  const delBtn=e.target.closest('[data-del-supply]');
  if(delBtn){deleteSupply(delBtn.dataset.delSupply);return;}

  const issueStatusBtn=e.target.closest('[data-issue-status]');
  if(issueStatusBtn&&window._iid){setIssueStatus(window._iid,issueStatusBtn.dataset.issueStatus);return;}
  const viewPhotoBtn=e.target.closest('[data-view-issue-photo]');
  if(viewPhotoBtn){viewIssuePhoto(window._iid,parseInt(viewPhotoBtn.dataset.viewIssuePhoto));return;}
  const addPhotoBtn=e.target.closest('[data-add-issue-photo]');
  if(addPhotoBtn&&window._iid){_photoIssueId=window._iid;document.getElementById('issue-photo-file').click();return;}
});
