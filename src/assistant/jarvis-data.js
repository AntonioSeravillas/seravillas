/* Read-only assistant projections. Never send D, cloud baselines, keys or photos. */
(function(){
  const clean=(value,max=300)=>String(value||'').slice(0,max);
  function dateWindow(text,reference){
    const lower=String(text).toLowerCase();
    if(/\b(next week|semana que viene|pr[oó]xima semana)\b/.test(lower))return {start:addDays(startOfWeek(reference),7),end:addDays(startOfWeek(reference),13),label:'next week'};
    if(/\b(this week|esta semana)\b/.test(lower))return {start:startOfWeek(reference),end:endOfWeek(reference),label:'this week'};
    if(/\b(tomorrow|ma[nñ]ana)\b/.test(lower)){const day=addDays(reference,1);return {start:day,end:day,label:'tomorrow'};}
    return {start:reference,end:reference,label:'today'};
  }
  function selectedProperty(text){return typeof resolveVoiceProperty==='function'?resolveVoiceProperty(text):null;}
  function sessions(window_,property){return D.sessions.filter(s=>s.status!=='cancelled'&&s.date>=window_.start&&s.date<=window_.end&&(!property||s.propId===property.id)).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.time||'').localeCompare(String(b.time||'')));}
  function names(s){
    if(s.crew){return (s.crew.main||[]).filter(c=>c.status!=='cancelled').map(c=>{const person=D.cleaners.find(p=>p.id===c.cleanerId);return clean(person?.name||c.name,80)+(c.status==='offered'?' (pending)':'');}).join(', ')+(s.crew.alinaSpots>0&&s.crew.alinaStatus!=='cancelled'?' · '+s.crew.alinaSpots+' team spot(s)'+(s.crew.alinaStatus==='offered'?' (pending)':''):'');}
    return (s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean).map(c=>clean(c.name,80)).join(', ');
  }
  function localAnswer(text,reference=today()){
    const lower=String(text).toLowerCase().replace(/^\s*(hey\s+)?jarvis[,!\s]*/,'');
    let prop=selectedProperty(lower);const w=dateWindow(lower,reference);
    if(prop&&!prop.found)return 'I could not find '+prop.name+' in your current app data.';
    if(/\b(cleaning|cleanings|limpieza|limpiezas)\b/.test(lower)&&/\b(week|today|tomorrow|semana|hoy|ma[nñ]ana)\b/.test(lower)){
      /* Same exact property resolution as the on-screen focus: unknown or ambiguous names never get an all-villas answer. */
      const place=focusProperty(text);
      if(place.unknown)return 'I could not find “'+place.unknown+'” in your current app data, so I have not listed any cleanings.';
      if(place.ambiguous)return 'More than one property matches “'+place.ambiguous+'”. Please say one full property name.';
      prop=place.prop?{id:place.prop.id,name:place.prop.name,found:true}:null;
      const rows=sessions(w,prop),range=fmtDate(w.start)+(w.end!==w.start?' – '+fmtDate(w.end):'');
      let answer='You have '+rows.length+' scheduled cleaning'+(rows.length===1?'':'s')+' '+w.label+(prop?' at '+prop.name:'')+' ('+range+').';
      if(rows.length)answer+='\n'+rows.map(s=>fmtDate(s.date)+' · '+propName(s.propId)+(s.time?' · '+s.time:'')+' · '+(names(s)||'No staff assigned')+(s.status==='done'?' · Done':'')).join('\n');
      const gaps=D.bookings.filter(b=>b.status!=='cancelled'&&b.checkOut>=w.start&&b.checkOut<=w.end&&(!prop||b.propId===prop.id)&&!D.sessions.some(s=>s.status!=='cancelled'&&s.propId===b.propId&&s.date===b.checkOut));
      if(gaps.length)answer+='\nAlso, '+gaps.length+' departure'+(gaps.length===1?' has':'s have')+' no cleaning recorded on the checkout date. Review the cleaning planner.';
      return answer;
    }
    if(/\b(arrival|arrivals|check[ -]?ins?|departure|departures|check[ -]?outs?)\b/.test(lower)){
      const out=/\b(departure|departures|check[ -]?outs?)\b/.test(lower),key=out?'checkOut':'checkIn';
      const rows=D.bookings.filter(b=>b.status!=='cancelled'&&b[key]>=w.start&&b[key]<=w.end&&(!prop||b.propId===prop.id)).slice().sort((a,b)=>a[key].localeCompare(b[key]));
      return 'You have '+rows.length+' '+(out?'departure':'arrival')+(rows.length===1?'':'s')+' '+w.label+'.'+(rows.length?'\n'+rows.map(b=>fmtDate(b[key])+' · '+propName(b.propId)+' · '+(b[out?'checkOutTime':'checkInTime']||(out?'10:00':'16:00'))).join('\n'):'');
    }
    if(/\b(tasks?|tareas?)\b/.test(lower)&&/\b(today|hoy|overdue)\b/.test(lower)){
      const rows=D.tasks.filter(t=>!t.done&&t.dueDate&&t.dueDate<=reference&&(!prop||t.propId===prop.id));
      return rows.length?rows.length+' task'+(rows.length===1?' needs':'s need')+' attention.\n'+rows.map(t=>clean(t.text,300)+(t.propId?' · '+propName(t.propId):'')+(t.dueDate<reference?' · overdue':' · due today')).join('\n'):'No tasks are due today or overdue in the current app data.';
    }
    if(/^(hello|hi|hey|hola)[.!\s]*$/.test(lower))return 'At your service, '+(window.SV_JARVIS_PERSONAL?.address()||'Antonio')+'. Ask me about cleanings, arrivals or tasks.';
    if(/\b(time|hora)\b/.test(lower))return 'It is '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'.';
    return null;
  }
  function context(reference=today()){
    const start=addDays(reference,-7),end=addDays(reference,35);
    const rows=sessions({start,end});
    return {
      generatedAt:new Date().toISOString(),today:reference,timeZone:'Europe/Madrid',source:DEV_MODE?'Fictional development preview':'Current app snapshot',window:{start,end},
      properties:D.props.slice(0,30).map(p=>({name:clean(p.name,80)})),
      cleanings:rows.slice(0,150).map(s=>({date:s.date,time:clean(s.time,20),property:clean(propName(s.propId),80),status:clean(s.status,30),crew:clean(names(s),300)})),
      arrivals:D.bookings.filter(b=>b.status!=='cancelled'&&b.checkIn>=start&&b.checkIn<=end).slice(0,100).map(b=>({date:b.checkIn,time:clean(b.checkInTime||'16:00',20),property:clean(propName(b.propId),80)})),
      departures:D.bookings.filter(b=>b.status!=='cancelled'&&b.checkOut>=start&&b.checkOut<=end).slice(0,100).map(b=>({date:b.checkOut,time:clean(b.checkOutTime||'10:00',20),property:clean(propName(b.propId),80),cleaningScheduled:D.sessions.some(s=>s.status!=='cancelled'&&s.propId===b.propId&&s.date===b.checkOut)})),
      tasks:D.tasks.filter(t=>!t.done).slice(0,40).map(t=>({text:clean(t.text,300),dueDate:clean(t.dueDate,10),property:clean(propName(t.propId),80),priority:clean(t.priority,30)})),
      issues:D.issues.filter(i=>i.status==='open').slice(0,40).map(i=>({title:clean(i.title,300),property:clean(propName(i.propId),80),priority:clean(i.priority,30)}))
    };
  }
  /* Desktop dashboard: today's operations and tasks from current app data. Read-only, bounded, no guest identity. */
  function dashboard(reference=today(),limits={today:6,tasks:5}){
    const time=value=>/^\d{1,2}:\d{2}$/.test(String(value||''))?String(value).padStart(5,'0'):'';
    const rows=[];
    for(const s of D.sessions||[])if(s.status!=='cancelled'&&s.date===reference)rows.push({time:time(s.time),property:clean(propName(s.propId),80),label:s.status==='done'?'Cleaning · done':'Cleaning',kind:'cleaning'});
    for(const b of D.bookings||[]){
      if(b.status==='cancelled')continue;
      if(b.checkIn===reference)rows.push({time:time(b.checkInTime||'16:00'),property:clean(propName(b.propId),80),label:'Arrival',kind:'arrival'});
      if(b.checkOut===reference)rows.push({time:time(b.checkOutTime||'10:00'),property:clean(propName(b.propId),80),label:'Departure',kind:'departure'});
    }
    rows.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.property.localeCompare(b.property)||a.label.localeCompare(b.label));
    const tomorrow=addDays(reference,1);
    const open=(D.tasks||[]).map((t,i)=>({t,i})).filter(({t})=>!t.done);
    const rank=({t})=>!t.dueDate?2:t.dueDate<=reference?0:1;
    open.sort((a,b)=>rank(a)-rank(b)||String(a.t.dueDate||'').localeCompare(String(b.t.dueDate||''))||a.i-b.i);
    const due=d=>!d?'':d<reference?'Overdue':d===reference?'Today':d===tomorrow?'Tomorrow':fmtDate(d);
    const parts=reference.split('-').map(Number),label=new Date(parts[0],parts[1]-1,parts[2]).toLocaleDateString('en-GB',{day:'numeric',month:'long'});
    return {date:reference,dateLabel:label,today:rows.slice(0,limits.today),todayMore:Math.max(0,rows.length-limits.today),
      tasks:open.slice(0,limits.tasks).map(({t})=>({text:clean(t.text,120),due:due(t.dueDate),overdue:!!t.dueDate&&t.dueDate<reference})),tasksMore:Math.max(0,open.length-limits.tasks)};
  }
  /* Attention focus for the user's own question: which cleanings the left column should show while Jarvis answers.
     Same date window and exact property resolver as the local answers. Read-only; no guest fields; an unknown
     property shows nothing rather than every villa. Tasks are a region-only focus (no invented task filters). */
  function longDate(d){const p=d.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('en-GB',{day:'numeric',month:'long'});}
  const words=value=>String(value||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  const DATE_WORDS=new Set(['today','tomorrow','this','next','week','weekend','month','hoy','manana','semana','que','viene','proxima','esta']);
  /* Exact property for the focus view: an explicit "at/for/in <name>" phrase (date words removed) must equal one whole
     D.props name, or a legacy alias of exactly one D.props name. Without a phrase, a whole name in the text counts.
     Returns {prop}, {unknown:name}, {ambiguous:name} or {} — never a partial or fuzzy match. */
  function focusProperty(text){
    const personal=window.SV_JARVIS_PERSONAL?.resolve(text,D.props,{phrase:true});
    if(personal)return personal.match?{prop:personal.match}:personal.ambiguous?{ambiguous:clean(text,80)}:{unknown:clean(text,80)};
    const props=D.props||[],named=props.map(p=>({p,w:words(p.name).join(' ')}));
    const byName=phrase=>{
      let hits=named.filter(x=>x.w===phrase).map(x=>x.p);
      if(!hits.length&&typeof VOICE_PROP_ALIASES!=='undefined'){const alias=VOICE_PROP_ALIASES.find(([,list])=>list.some(a=>words(a).join(' ')===phrase));if(alias){const canon=words(alias[0]).join(' ');hits=named.filter(x=>x.w===canon).map(x=>x.p);}}
      return hits;
    };
    for(const m of String(text||'').matchAll(/\b(?:at|for|in)\s+(.+?)(?=\s+(?:at|for|in|on|from|during|please)\b|[?.!;]|$)/gi)){
      const raw=m[1].replace(/[\s,]+$/,'').trim();
      const tokens=words(raw).filter(t=>!DATE_WORDS.has(t)&&!/^\d+$/.test(t)&&!['am','pm','and','or'].includes(t));while(tokens[0]==='the')tokens.shift();
      if(!tokens.length)continue;
      const phrase=tokens.join(' ');
      /* "all villas" is an explicit request for every property; a list of names is never narrowed to its first. */
      if(/^(?:all|every|each)(?: (?:the|of the))?(?: (?:villas?|propert(?:y|ies)|houses?))?$/.test(phrase))return {};
      if(/,|&|\band\b|\bor\b/i.test(raw))return {ambiguous:clean(raw,80)};
      const hits=byName(phrase);
      if(hits.length===1)return {prop:hits[0]};
      return hits.length?{ambiguous:clean(raw,80)}:{unknown:clean(raw,80)};
    }
    const all=words(text).join(' '),found=named.filter(x=>x.w&&(' '+all+' ').includes(' '+x.w+' '));
    const longest=found.filter(x=>!found.some(o=>o!==x&&o.w.length>x.w.length&&(' '+o.w+' ').includes(' '+x.w+' ')));
    const names=[...new Set(longest.map(x=>x.w))];
    if(names.length>1||longest.length>1)return {ambiguous:longest.map(x=>x.p.name).join(', ')};
    return longest.length?{prop:longest[0].p}:{};
  }
  function cleaningFocus(text,reference=today(),limit=6){
    const lower=String(text||'').toLowerCase().replace(/^\s*(hey\s+)?jarvis[,!\s]*/,'');
    if(!/\b(cleaning|cleanings|limpieza|limpiezas)\b/.test(lower))return null;
    const w=dateWindow(lower,reference),place=focusProperty(text),multiDay=w.start!==w.end;
    const range=multiDay?fmtDateRange(w.start,w.end):(w.label==='tomorrow'?'Tomorrow · ':'')+longDate(w.start);
    if(place.unknown||place.ambiguous)return {kind:'cleanings',label:range,multiDay,rows:[],more:0,unknownProperty:!!place.unknown,ambiguousProperty:!!place.ambiguous,
      empty:place.unknown?'“'+place.unknown+'” isn’t a property in your app data, so nothing is highlighted.':'More than one property matches, so nothing is highlighted. Say the full name.'};
    /* Chronological by date then padded time (no time last), before the row limit, so "9:00" comes before "14:00". */
    const hhmm=t=>/^\d{1,2}:\d{2}$/.test(String(t||''))?String(t).padStart(5,'0'):'';
    const prop=place.prop||null,all=sessions(w,prop).slice().sort((a,b)=>a.date.localeCompare(b.date)||(hhmm(a.time)||'99:99').localeCompare(hhmm(b.time)||'99:99'));
    const rows=all.slice(0,limit).map(s=>({date:s.date,dateLabel:fmtDate(s.date),time:hhmm(s.time),property:clean(propName(s.propId),80),status:s.status==='done'?'Done':'Scheduled'}));
    const when=w.label==='today'||w.label==='tomorrow'?w.label:'for '+w.label;
    return {kind:'cleanings',label:range+(prop?' · '+clean(prop.name,80):''),multiDay,rows,more:Math.max(0,all.length-limit),unknownProperty:false,empty:rows.length?'':'No cleanings scheduled '+when+(prop?' at '+clean(prop.name,80):'')+'.'};
  }
  function focusFor(text,reference=today()){
    return cleaningFocus(text,reference)||(/\b(tasks?|tareas?)\b/i.test(String(text||''))?{kind:'tasks',label:'Tasks'}:null);
  }
  window.SV_JARVIS_DATA={dateWindow,localAnswer,context,dashboard,cleaningFocus,focusFor};
})();
