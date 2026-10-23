/* On-demand morning briefing: a read-only summary of one business day built from the full app records (never from the
   conversation or a model). Crew state comes from the dashboard's crewOf, so it matches the dashboard and cleaning pages:
   offered is never counted as confirmed. Times are only those recorded on the record; nothing is inferred. A category
   whose records are missing is reported as not checked, never as zero. Classic script and CommonJS; no writes. */
(function(root){
  const DASH=()=>root&&root.SV_JARVIS_DASHBOARD||(typeof require==='function'?require('./jarvis-dashboard.js'):null);
  const clip=(v,n=120)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
  const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  const hhmm=v=>/^\d{1,2}:\d{2}$/.test(String(v||''))?String(v).padStart(5,'0'):'';
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const toDate=s=>{const p=s.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2],12));};
  /* Dates are composed from fixed names so every browser and the tests read them the same way. */
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const longDate=s=>{const d=toDate(s);return DAYS[d.getUTCDay()]+' '+d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear();};
  const shortDate=s=>{const d=toDate(s);return d.getUTCDate()+' '+MONTHS[d.getUTCMonth()].slice(0,3);};
  const plural=(n,one,many=one+'s')=>n+' '+(n===1?one:many);
  const CATEGORIES={bookings:'bookings',sessions:'cleanings',tasks:'tasks',issues:'issues'};
  const byTime=(a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.property.localeCompare(b.property);

  /* d: the app records (D); ref: the app's business day (today()). sync: {status,lastSync} of this device's copy. */
  function build(d,ref,{required=()=>1,now=new Date(),sync=null,dash=DASH()}={}){
    if(!isDay(ref))throw Error('A valid business day is required.');
    const gaps=[],list=k=>{const v=d&&d[k];if(Array.isArray(v))return v;gaps.push(CATEGORIES[k]);return null;};
    const bookings=list('bookings'),sessions=list('sessions'),tasks=list('tasks'),issues=list('issues');
    const props=Array.isArray(d&&d.props)?d.props:[],name=id=>clip((props.find(p=>p.id===id)||{}).name||'Unknown villa',80);
    const plus=dash.plus,weekEnd=plus(ref,6);
    const stay=(b,kind)=>({entity:'bookings',id:String(b.id),kind,property:name(b.propId),time:hhmm(kind==='arrival'?b.checkInTime:b.checkOutTime)});
    const arrivals=bookings?bookings.filter(b=>b&&b.status!=='cancelled'&&b.checkIn===ref).map(b=>stay(b,'arrival')).sort(byTime):null;
    const departures=bookings?bookings.filter(b=>b&&b.status!=='cancelled'&&b.checkOut===ref).map(b=>stay(b,'departure')).sort(byTime):null;
    const cleaning=s=>{const c=dash.crewOf(d,s,required(s.propId));return {entity:'cleanings',id:String(s.id),property:name(s.propId),date:s.date,time:hhmm(s.time),done:s.status==='done',state:c.state,label:c.label,confirmed:c.confirmed,offered:c.offered,required:c.required};};
    const cleanings=sessions?sessions.filter(s=>s&&s.status!=='cancelled'&&s.date===ref).map(cleaning).sort(byTime):null;
    /* Same rule as the records "needs_team" filter: scheduled, not done, fewer confirmed than the villa needs. */
    const needStaff=sessions?sessions.filter(s=>s&&s.status!=='cancelled'&&s.status!=='done'&&isDay(s.date)&&s.date>=ref&&s.date<=weekEnd).map(cleaning)
      .filter(c=>c.state!=='confirmed').sort((a,b)=>a.date.localeCompare(b.date)||byTime(a,b)):null;
    const task=t=>({entity:'tasks',id:String(t.id),text:clip(t.text,140)||'Untitled task',property:t.propId?name(t.propId):'',due:t.dueDate,priority:t.urgent?'high':t.priority||'medium'});
    const overdue=tasks?tasks.filter(t=>t&&!t.done&&isDay(t.dueDate)&&t.dueDate<ref).map(task).sort((a,b)=>a.due.localeCompare(b.due)||a.text.localeCompare(b.text)):null;
    const dueToday=tasks?tasks.filter(t=>t&&!t.done&&t.dueDate===ref).map(task).sort((a,b)=>a.text.localeCompare(b.text)):null;
    /* Unresolved issues (open, in progress, waiting). High/urgent priority or a passed resolve-by date needs attention. */
    const issue=i=>({entity:'issues',id:String(i.id),title:clip(i.title||i.text,140)||'Untitled issue',property:i.propId?name(i.propId):'',status:i.status||'open',priority:i.priority||'medium',
      high:i.priority==='high'||i.priority==='urgent',late:isDay(i.resolveBy)&&i.resolveBy<ref,resolveBy:isDay(i.resolveBy)?i.resolveBy:''});
    const unresolved=issues?issues.filter(i=>i&&i.status!=='resolved'&&i.status!=='closed').map(issue):null;
    const rank=i=>(i.high?0:2)+(i.late?0:1);
    const attentionIssues=unresolved?unresolved.filter(i=>i.high||i.late).sort((a,b)=>rank(a)-rank(b)||a.title.localeCompare(b.title)):null;
    const otherIssues=unresolved?unresolved.filter(i=>!i.high&&!i.late).sort((a,b)=>a.title.localeCompare(b.title)):null;
    return {date:ref,dateLabel:longDate(ref),weekEnd,checkedAt:now.toISOString(),gaps:[...new Set(gaps)],sync:sync?{status:String(sync.status||''),lastSync:Number(sync.lastSync)||0,dev:!!sync.dev}:null,
      arrivals,departures,cleanings,needStaff,overdue,dueToday,attentionIssues,otherIssues,waiting:unresolved?unresolved.filter(i=>i.status==='waiting').length:null};
  }

  /* Every record the briefing shows, once, for follow-ups such as "open that issue". */
  function items(b){
    const seen=new Set(),out=[];
    const push=(entity,id,label,kind)=>{const k=entity+':'+id;if(seen.has(k))return;seen.add(k);out.push({entity,id,label:clip(label,140),kind});};
    for(const c of b.needStaff||[])push('cleanings',c.id,c.property+' cleaning, '+(c.date===b.date?'today':shortDate(c.date)),'cleaning');
    for(const c of b.cleanings||[])push('cleanings',c.id,c.property+' cleaning, today','cleaning');
    for(const s of b.arrivals||[])push('bookings',s.id,s.property+' arrival','arrival');
    for(const s of b.departures||[])push('bookings',s.id,s.property+' departure','departure');
    for(const t of [...(b.overdue||[]),...(b.dueToday||[])])push('tasks',t.id,t.text+(t.property?' at '+t.property:''),'task');
    for(const i of [...(b.attentionIssues||[]),...(b.otherIssues||[])])push('issues',i.id,i.title+(i.property?' at '+i.property:''),'issue');
    return out;
  }

  const when=(c,ref)=>(c.date===ref?'today':DAYS[toDate(c.date).getUTCDay()])+(c.time?' at '+c.time:'');
  const names=(rows,label,max=2)=>{const shown=rows.slice(0,max).map(label);return shown.join(rows.length>max?', ':' and ')+(rows.length>max?', and '+(rows.length-max)+' more':'');};
  /* Spoken briefing: problems first, then the day, about 30–45 seconds; the card holds every detail. */
  function speech(b,{owner='',greet=false}={}){
    const out=[];
    out.push((greet?'Good morning'+(owner?', '+owner:'')+'. ':'')+'Here’s your briefing for '+b.dateLabel.replace(/ \d{4}$/,'')+'.');
    const problems=[];
    if(b.needStaff&&b.needStaff.length)problems.push(plural(b.needStaff.length,'cleaning')+' still '+(b.needStaff.length===1?'needs':'need')+' confirmed staff: '+names(b.needStaff,c=>c.property+' '+when(c,b.date))+'.');
    if(b.overdue&&b.overdue.length)problems.push(b.overdue.length===1?'One task is overdue: '+b.overdue[0].text+'.':plural(b.overdue.length,'task')+' are overdue, the oldest due '+shortDate(b.overdue[0].due)+'.');
    const high=(b.attentionIssues||[]).filter(i=>i.high),late=(b.attentionIssues||[]).filter(i=>!i.high);
    if(high.length)problems.push((high.length===1?'One high-priority issue: ':plural(high.length,'high-priority issue')+': ')+names(high,i=>i.title+(i.property?' at '+i.property:''))+'.');
    if(late.length)problems.push(plural(late.length,'issue')+' '+(late.length===1?'is':'are')+' past '+(late.length===1?'its':'their')+' resolve-by date.');
    out.push(...problems);
    const day=[];
    if(b.arrivals){const timed=b.arrivals.filter(a=>a.time);if(b.arrivals.length)day.push(plural(b.arrivals.length,'arrival')+(timed.length?' (first at '+timed[0].time+')':''));}
    if(b.departures&&b.departures.length)day.push(plural(b.departures.length,'departure'));
    if(b.cleanings&&b.cleanings.length){const ok=b.cleanings.filter(c=>c.done||c.state==='confirmed').length;day.push(plural(b.cleanings.length,'cleaning')+(ok===b.cleanings.length?(b.cleanings.length===1?', confirmed':', all confirmed'):''));}
    if(b.dueToday&&b.dueToday.length)day.push(plural(b.dueToday.length,'task')+' due');
    const scheduleChecked=b.arrivals&&b.departures&&b.cleanings;
    if(day.length)out.push('Today: '+day.join(', ')+'.');
    else if(scheduleChecked)out.push('No arrivals, departures or cleanings are recorded for today.');
    if(b.otherIssues&&b.otherIssues.length)out.push(plural(b.otherIssues.length,'other open issue')+'.');
    if(!problems.length&&!b.gaps.length)out.push('Nothing needs attention in the bookings, cleanings, tasks and issues I checked.');
    if(b.gaps.length)out.push('I couldn’t check '+b.gaps.join(' or ')+', so this isn’t complete.');
    if(b.sync&&!b.sync.dev&&b.sync.status==='error')out.push('Cloud sync last failed, so this device’s records may be out of date.');
    out.push('The details are on screen.');
    return out.join(' ');
  }

  /* The card. Every value is escaped; rows use the existing open-record action. stale: why it may be out of date. */
  function html(b,{stale='',timeZone='Europe/Madrid'}={}){
    const at=new Date(b.checkedAt),checked=isNaN(at)?'':at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone});
    const row=(entity,id,main,meta,cls='')=>'<li><button type="button" class="jarvis-brief-row'+cls+'" data-j="open-record" data-entity="'+esc(entity)+'" data-id="'+esc(id)+'"><span>'+esc(main)+'</span><small>'+esc(meta)+'</small></button></li>';
    const limit=(rows,map,max=10)=>rows.slice(0,max).map(map).join('')+(rows.length>max?'<li class="jarvis-brief-more">and '+(rows.length-max)+' more</li>':'');
    const section=(title,body,extra='')=>body?'<section class="jarvis-brief-section'+extra+'"><h3>'+esc(title)+'</h3><ul>'+body+'</ul></section>':'';
    const missing=t=>'<li class="jarvis-brief-none">'+esc(t)+'</li>';
    const crew=c=>c.done?'Done':c.label+' · '+c.confirmed+' of '+c.required+' confirmed'+(c.offered?' · '+c.offered+' offered':'');
    let attention='';
    if(b.needStaff)attention+=limit(b.needStaff,c=>row('cleanings',c.id,c.property+' cleaning',(c.date===b.date?'Today':shortDate(c.date))+(c.time?' '+c.time:'')+' · '+crew(c),' is-alert'));
    if(b.overdue)attention+=limit(b.overdue,t=>row('tasks',t.id,t.text,'Overdue · due '+shortDate(t.due)+(t.property?' · '+t.property:''),' is-alert'));
    if(b.attentionIssues)attention+=limit(b.attentionIssues,i=>row('issues',i.id,i.title,[i.high?'High priority':'',i.late?'Past resolve-by '+shortDate(i.resolveBy):'',i.property].filter(Boolean).join(' · '),' is-alert'));
    const schedule=[...(b.departures||[]).map(s=>({...s,label:'Departure'})),...(b.arrivals||[]).map(s=>({...s,label:'Arrival'})),...(b.cleanings||[]).map(c=>({...c,label:'Cleaning · '+crew(c)}))].sort(byTime);
    let scheduleBody=limit(schedule,s=>row(s.entity,s.id,(s.time||'No time recorded')+' · '+s.property,s.label,s.entity==='cleanings'&&!s.done&&s.state!=='confirmed'?' is-alert':''),14);
    if(!scheduleBody&&b.arrivals&&b.departures&&b.cleanings)scheduleBody=missing('No arrivals, departures or cleanings recorded for today.');
    let open='';
    if(b.dueToday)open+=limit(b.dueToday,t=>row('tasks',t.id,t.text,'Due today'+(t.property?' · '+t.property:'')));
    if(b.otherIssues)open+=limit(b.otherIssues,i=>row('issues',i.id,i.title,[i.status==='waiting'?'Waiting':i.status==='in_progress'?'In progress':'Open',i.property].filter(Boolean).join(' · ')),6);
    const notes=[];
    if(b.gaps.length)notes.push('Not checked: '+b.gaps.join(', ')+' (records unavailable).');
    if(b.sync&&b.sync.dev)notes.push('Fictional preview records.');
    else if(b.sync&&b.sync.status==='error')notes.push('Cloud sync last failed; this device’s records may be out of date.');
    else if(b.sync&&b.sync.status==='syncing')notes.push('Cloud sync was in progress when checked.');
    return '<header class="jarvis-brief-head"><small>Briefing · '+esc(b.dateLabel)+'</small><p>Checked '+esc(checked)+' · this device’s app records'+(b.needStaff?' · staff checked to '+esc(shortDate(b.weekEnd)):'')+'</p></header>'
      +(stale?'<p class="jarvis-brief-stale" role="status">'+esc(stale)+' Say “refresh my briefing” or tap Refresh.</p>':'')
      +(attention?section('Needs attention',attention,' is-attention'):b.gaps.length?'':'<p class="jarvis-brief-clear">Nothing needs attention in the records checked.</p>')
      +section('Today’s schedule',scheduleBody)
      +section('Open work',open)
      +(notes.length?'<p class="jarvis-brief-note">'+esc(notes.join(' '))+'</p>':'')
      +'<div><button type="button" data-j="briefing-refresh">Refresh</button><button type="button" data-j="briefing-close">Close</button></div>';
  }

  /* Owner wording that asks for the briefing (not a filtered question such as "arrivals today"). */
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  function intent(text){
    const t=norm(text);if(!t||/\b(?:dont|do not|no need|never|stop|cancel)\b/.test(t))return null;
    if(/\b(?:refresh|update|redo|recheck|rerun|re run)\b.*\bbriefing\b|\bbriefing\b.*\b(?:again|refresh)\b/.test(t))return {kind:'refresh',greet:false};
    const greet=/^(?:(?:hi|hey|hello|ok|okay)\s+)?good morning\b/.test(t);
    if(/\b(?:briefing|brief me|morning (?:report|update|summary|rundown|overview)|daily (?:briefing|summary|rundown|overview))\b/.test(t))return {kind:'briefing',greet};
    if(/\bwhat (?:needs|requires) (?:my )?attention\b|\bwhat should i (?:know|focus on|look at) today\b|\bwhats (?:on|happening|going on) today\b|\bhow (?:does|is) today looking\b|\bhow does today look\b|\b(?:run|walk) me through (?:today|the day)\b|\b(?:give me )?(?:an |the |my )?overview of (?:today|the day)\b/.test(t))return {kind:'briefing',greet};
    return null;
  }
  /* Follow-ups that use the shown briefing: staff, overdue tasks, first arrival, "open that …". */
  function followUp(text){
    const t=norm(text);if(!t)return null;
    if(/\bclean\w*\b.*\b(?:need|needs|needing|without|missing|short of)\b.*\b(?:staff|team|teams|cleaners?|crew|people)\b|\bwho (?:still )?needs? (?:staff|a team|cleaners)\b/.test(t))return {kind:'staff'};
    if(/\boverdue\b/.test(t)&&/\btasks?\b/.test(t))return {kind:'overdue'};
    if(/\b(?:first|earliest|next)\b.*\barrivals?\b|\bwhen\b.*\b(?:first|earliest)\b.*\b(?:arriv\w*|guests?)\b/.test(t))return {kind:'first-arrival'};
    const m=t.match(/\b(?:open|show(?: me)?|pull up|bring up|go to)\s+(?:that|this|the)\s+(issue|cleaning|task|arrival|departure|booking)\b/);
    if(m)return {kind:'open',entity:{issue:'issues',cleaning:'cleanings',task:'tasks',arrival:'bookings',departure:'bookings',booking:'bookings'}[m[1]],what:m[1]};
    return null;
  }
  /* Narrow a list of shown records by the owner's answer: an ordinal or distinctive words. */
  function choose(options,text){
    const t=norm(text),ord=[/\b(?:first|1|one)\b/,/\b(?:second|2|two)\b/,/\b(?:third|3|three)\b/];
    for(let i=0;i<Math.min(options.length,3);i++)if(ord[i].test(t)&&!ord.some((r,j)=>j!==i&&r.test(t)))return options[i];
    if(/\blast\b/.test(t))return options[options.length-1];
    const words=new Set(t.split(' ').filter(w=>w.length>=3));
    const STOP=new Set(['the','that','this','one','open','show','villa','casa','finca','issue','task','cleaning','arrival','departure','booking','with','and','for','please','jarvis']);
    const scored=options.map(o=>({o,n:norm(o.label).split(' ').filter(w=>w.length>=3&&!STOP.has(w)&&words.has(w)).length})).sort((a,b)=>b.n-a.n);
    return scored[0]&&scored[0].n>0&&(!scored[1]||scored[1].n<scored[0].n)?scored[0].o:null;
  }
  /* A cheap fingerprint of the records the briefing reads, to tell whether a shown briefing may be stale. */
  function fingerprint(d){
    const pick=(k,f)=>Array.isArray(d&&d[k])?d[k].map(f):null;
    return JSON.stringify([pick('bookings',b=>[b.id,b.status,b.checkIn,b.checkOut,b.checkInTime,b.checkOutTime,b.propId]),pick('sessions',s=>[s.id,s.status,s.date,s.time,s.propId,s.crew,s.cleanerIds]),
      pick('tasks',t=>[t.id,t.done,t.dueDate,t.text]),pick('issues',i=>[i.id,i.status,i.priority,i.resolveBy,i.title])]);
  }

  const api={build,speech,html,items,intent,followUp,choose,fingerprint};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SV_JARVIS_BRIEFING=api;
})(typeof window!=='undefined'?window:null);
