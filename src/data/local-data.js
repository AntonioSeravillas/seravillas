/* ── Data ── */
function load(){
  try{
    const raw=SV_STORAGE.getItem(DB)||SV_STORAGE.getItem('cleanly_v1');
    if(raw){
      const p=JSON.parse(raw);
      D.props=p.props||[];D.cleaners=p.cleaners||[];D.sessions=p.sessions||[];
      D.tasks=p.tasks||[];D.issues=p.issues||[];D.scratch=p.scratch||'';D.supplies=p.supplies||[];
      D.sessions.forEach(s=>{if(!s.status)s.status='scheduled';if(s.note===undefined)s.note='';});
      D.props.forEach(p=>{if(p.notes===undefined)p.notes='';if(!p.photos)p.photos=[];});
      D.cleaners.forEach(c=>{if(!c.phone)c.phone='';});
      D.tasks.forEach(t=>{if(t.urgent===undefined)t.urgent=false;if(t.done===undefined)t.done=false;if(!t.priority)t.priority=t.urgent?'high':'low';if(t.pinned===undefined)t.pinned=false;if(!t.note)t.note='';if(!t.dueDate)t.dueDate='';if(!t.timeEst)t.timeEst='';if(t.photo===undefined)t.photo=null;if(t.inFocus===undefined)t.inFocus=false;if(t.completedAt===undefined)t.completedAt='';if(!t.priority)t.priority=t.urgent?'high':'low';if(t.pinned===undefined)t.pinned=false;if(t.note===undefined)t.note='';if(t.dueDate===undefined)t.dueDate='';if(t.timeEst===undefined)t.timeEst='';if(t.photo===undefined)t.photo=null;if(t.inFocus===undefined)t.inFocus=false;if(t.completedAt===undefined)t.completedAt='';});
      D.issues.forEach(i=>{if(i.status===undefined)i.status='open';if(!i.photos)i.photos=[];if(!i.resolveBy)i.resolveBy='';if(!i.priority)i.priority='medium';if(!i.category)i.category='other';if(!i.waitingFor)i.waitingFor='';if(!i.createdAt)i.createdAt=today();if(!i.resolvedAt)i.resolvedAt=''});
      D.supplies.forEach(s=>{if(s.have===undefined)s.have=0;if(s.need===undefined)s.need=1;if(s.checked===undefined)s.checked=false;});
      D.projects=p.projects||[];
      D.focusSetDate=p.focusSetDate||'';
      D.tasks.forEach(t=>{if(!t.type)t.type='ops';if(!t.projectId)t.projectId='';});
      D.bookings=p.bookings||[];
      D.bookings.forEach(b=>{
        if(!b.status)b.status='confirmed';
        if(!b.guestName)b.guestName='';
        if(b.guestCount===undefined)b.guestCount=0;
        if(!b.totalPrice)b.totalPrice=0;
        if(!b.notes)b.notes='';
        if(!b.agencyName)b.agencyName='';
        if(!b.linkedCleaningId)b.linkedCleaningId='';
      });
      D.events=p.events||[];
      D.events.forEach(e=>{
        if(!e.category)e.category='other';
        if(!e.time)e.time='';
        if(!e.endDate)e.endDate='';
        if(!e.propId)e.propId='';
        if(!e.note)e.note='';
      });
      D.contacts=p.contacts||[];
      D.contacts.forEach(c=>{
        if(!c.category)c.category='other';
        if(!c.phone)c.phone='';
        if(!c.whatsapp)c.whatsapp='';
        if(!c.company)c.company='';
        if(!c.area)c.area='';
        if(!c.priceInfo)c.priceInfo='';
        if(!c.availability)c.availability='';
        if(!c.status)c.status='new';
        if(!c.notes)c.notes='';
        if(!c.lastContacted)c.lastContacted='';
        if(!c.createdAt)c.createdAt='';
        if(!c.updatedAt)c.updatedAt='';
      });
    }
  }catch(e){}
}
const BACKUP_KEY=DB+'_backup';
const BACKUP_DATE_KEY=DB+'_backupDate';

function save(){
  try{
    const json=JSON.stringify(D);
    SV_STORAGE.setItem(DB,json);
    // Auto daily backup
    const today_=new Date().toISOString().slice(0,10);
    const lastBackup=SV_STORAGE.getItem(BACKUP_DATE_KEY)||'';
    if(lastBackup!==today_){
      SV_STORAGE.setItem(BACKUP_KEY,json);
      SV_STORAGE.setItem(BACKUP_DATE_KEY,today_);
    }
  }catch(e){
    toast('⚠️ Storage full — please export your data');
  }
  schedulePush();
}

function getDataSizeKB(){
  try{return Math.round((SV_STORAGE.getItem(DB)||'').length/1024);}catch(e){return 0;}
}

function restoreBackup(){
  const backup=SV_STORAGE.getItem(BACKUP_KEY);
  const backupDate=SV_STORAGE.getItem(BACKUP_DATE_KEY)||'unknown date';
  if(!backup){toast('No backup found');return;}
  if(!confirm('Restore backup from '+backupDate+'? Current data will be replaced.'))return;
  try{
    const parsed=JSON.parse(backup);
    Object.assign(D,parsed);
    save();render();
    toast('Backup restored from '+backupDate+' ✓');
  }catch(e){toast('Backup file is corrupted');}
}

function exportData(){
  try{
    const json=JSON.stringify(D,null,2);
    const blob=new Blob([json],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='seravillas-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('Data exported ✓');
  }catch(e){toast('Export failed');}
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

