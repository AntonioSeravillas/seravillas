/* ── Dates ── (Mon-Sun week, timezone-safe) */
function today(){
  const d=new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function pad(n){return String(n).padStart(2,'0')}
function addDays(s,n){
  const parts=s.split('-');
  const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function startOfWeek(refDate){
  const ref=refDate||today();
  const parts=ref.split('-');
  const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const dow=d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff=dow===0?-6:1-dow; // shift to Monday
  d.setDate(d.getDate()+diff);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function endOfWeek(refDate){return addDays(startOfWeek(refDate),6)} // Sunday
function isToday(s){return s===today()}
function isPast(s){return s<today()}
function fmtDate(s){if(!s)return'';const parts=s.split('-');const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
function fmtFull(s){if(!s)return'';const parts=s.split('-');const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));return d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function fmtDateRange(s,e){const ps=s.split('-');const pe=e.split('-');const ds=new Date(parseInt(ps[0]),parseInt(ps[1])-1,parseInt(ps[2]));const de=new Date(parseInt(pe[0]),parseInt(pe[1])-1,parseInt(pe[2]));return ds.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' – '+de.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
function fmtDayName(s){if(!s)return'';const parts=s.split('-');const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}

