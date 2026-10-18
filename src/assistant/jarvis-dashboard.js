/* Jarvis desktop dashboard: read-only projections of the current app data for the panels around the ring.
   No writes, no AI calls, no guest identity. Every function takes the data explicitly (the app passes D), so the
   counts shown are computed from the same records the workspace pages use. Classic script and CommonJS. */
(function(root){
  const clip=(v,n=120)=>String(v??'').slice(0,n);
  const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  const hhmm=v=>/^\d{1,2}:\d{2}$/.test(String(v||''))?String(v).padStart(5,'0'):'';
  const pad=n=>String(n).padStart(2,'0');
  const toDate=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2],12);};
  const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const plus=(s,n)=>{const d=toDate(s);d.setDate(d.getDate()+n);return iso(d);};
  const weekEnd=s=>{const d=toDate(s),dow=d.getDay();return plus(s,dow===0?0:7-dow);};
  const between=(a,b)=>Math.round((toDate(b)-toDate(a))/864e5);
  function propOf(d,id){return (d.props||[]).find(p=>p.id===id)||null;}
  function nameOf(d,id){return clip(propOf(d,id)?.name||'General',80);}
  /* Only image sources the app itself stores (data images, https, same-site paths) are shown; anything else falls back. */
  function photoOf(d,id){const src=(propOf(d,id)?.photos||[])[0];return typeof src==='string'&&/^(?:data:image\/(?:png|jpe?g|webp|gif);base64,|https:\/\/|\.?\/)/i.test(src)?src:'';}
  function initials(name){const w=String(name||'').replace(/^(?:villa|casa|finca|can|sa|es)\s+/i,'').split(/\s+/).filter(Boolean);return ((w[0]||'?')[0]+((w[1]||'')[0]||'')).toUpperCase();}
  function dayLabel(day,ref){if(day===ref)return 'Today';if(day===plus(ref,1))return 'Tomorrow';if(day===plus(ref,-1))return 'Yesterday';
    const n=between(ref,day);return n>0&&n<7?toDate(day).toLocaleDateString('en-GB',{weekday:'long'}):toDate(day).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}

  /* Crew status for a cleaning, in the same terms as the cleaning pages: legacy assigned cleaners count as confirmed;
     explicit crew records keep their own offered/confirmed status. */
  function crewOf(d,s,required=1){
    const legacy=!s.crew,main=legacy?[...new Set(s.cleanerIds||[])].map(id=>({cleanerId:id,status:'confirmed'})):(Array.isArray(s.crew.main)?s.crew.main:[]);
    const active=main.filter(m=>m.status!=='cancelled'),spots=s.crew&&s.crew.alinaSpots>0&&s.crew.alinaStatus!=='cancelled'?Number(s.crew.alinaSpots)||0:0;
    const confirmed=active.filter(m=>m.status==='confirmed').length+(spots&&s.crew.alinaStatus==='confirmed'?spots:0);
    const offered=active.filter(m=>m.status==='offered').length+(spots&&s.crew.alinaStatus==='offered'?spots:0);
    const names=active.map(m=>clip((d.cleaners||[]).find(c=>c.id===m.cleanerId)?.name||m.name||'',60)).filter(Boolean);
    let state='needed',label='Team needed';
    if(s.status==='done'){state='done';label='Done';}
    else if(!active.length&&!spots){state='needed';label='Team needed';}
    else if(confirmed>=required){state='confirmed';label=legacy?'Assigned':'Confirmed';}
    else if(confirmed>0){state='partial';label='Partly confirmed';}
    else if(offered>0){state='offered';label='Offered';}
    else{state='needed';label='Needs backup';}
    return {state,label,names,confirmed,offered,required};
  }

  /* Day plan: arrivals, departures, cleanings and tasks due that day, by time (untimed items last). */
  function calendar(d,day,{required=()=>1}={}){
    const rows=[];if(!isDay(day))return rows;
    for(const s of d.sessions||[])if(s.status!=='cancelled'&&s.date===day){const c=crewOf(d,s,required(s.propId));
      rows.push({kind:'cleaning',time:hhmm(s.time),title:nameOf(d,s.propId),meta:(s.status==='done'?'Cleaning · done':clip(s.note||'Cleaning',60))+(s.status==='done'?'':' · '+c.label),ref:{entity:'cleanings',id:s.id},attention:c.state==='needed'});}
    for(const b of d.bookings||[]){if(b.status==='cancelled')continue;
      if(b.checkOut===day)rows.push({kind:'departure',time:hhmm(b.checkOutTime||'10:00'),title:nameOf(d,b.propId),meta:'Departure',ref:{entity:'bookings',id:b.id}});
      if(b.checkIn===day)rows.push({kind:'arrival',time:hhmm(b.checkInTime||'16:00'),title:nameOf(d,b.propId),meta:'Guest arrival',ref:{entity:'bookings',id:b.id}});}
    for(const t of d.tasks||[])if(!t.done&&t.dueDate===day)rows.push({kind:'task',time:'',title:clip(t.text,90),meta:'Task'+(t.propId?' · '+nameOf(d,t.propId):''),ref:{entity:'tasks',id:t.id}});
    const order={departure:0,cleaning:1,arrival:2,task:3};
    return rows.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||order[a.kind]-order[b.kind]||a.title.localeCompare(b.title));
  }

  /* Open tasks in three windows: Today (due today, overdue, or marked for today), This week (due later this Monday–Sunday
     week) and Later (everything else that is open, including undated). */
  function tasks(d,ref){
    const out={today:[],week:[],later:[]},end=weekEnd(ref),rank={high:0,medium:1,low:2};
    for(const t of d.tasks||[]){if(t.done)continue;
      const due=isDay(t.dueDate)?t.dueDate:'',bucket=due&&due<=ref||!due&&t.status==='today'?'today':due&&due<=end?'week':'later';
      out[bucket].push({id:t.id,text:clip(t.text,120),property:t.propId?nameOf(d,t.propId):'',due,overdue:!!due&&due<ref,dueLabel:!due?(bucket==='today'?'Today':''):due<ref?'Overdue':dayLabel(due,ref),priority:t.urgent?'high':t.priority||'medium'});}
    for(const k of Object.keys(out))out[k].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||(rank[a.priority]??1)-(rank[b.priority]??1)||a.text.localeCompare(b.text));
    return {counts:{today:out.today.length,week:out.week.length,later:out.later.length},lists:out};
  }

  /* Upcoming cleanings with truthful crew status, then properties with nothing planned in the next fortnight. */
  function cleanings(d,ref,{limit=12,required=()=>1}={}){
    const rows=(d.sessions||[]).filter(s=>s.status!=='cancelled'&&s.status!=='done'&&isDay(s.date)&&s.date>=ref)
      .sort((a,b)=>a.date.localeCompare(b.date)||(hhmm(a.time)||'99:99').localeCompare(hhmm(b.time)||'99:99'))
      .slice(0,limit).map(s=>{const c=crewOf(d,s,required(s.propId)),name=nameOf(d,s.propId);
        return {id:s.id,propId:s.propId,property:name,initials:initials(name),photo:photoOf(d,s.propId),date:s.date,when:dayLabel(s.date,ref)+(hhmm(s.time)?' '+hhmm(s.time):''),state:c.state,status:c.label,crew:c.names};});
    const soon=plus(ref,14),planned=new Set((d.sessions||[]).filter(s=>s.status!=='cancelled'&&s.date>=ref&&s.date<=soon).map(s=>s.propId));
    const idle=(d.props||[]).filter(p=>!p.archived&&p.active!==false&&!planned.has(p.id)).map(p=>({id:'',propId:p.id,property:clip(p.name,80),initials:initials(p.name),photo:photoOf(d,p.id),date:'',when:'No cleaning planned',state:'none',status:'',crew:[]}));
    return {rows,idle};
  }

  /* Open and waiting issues, most urgent first. Dates in the app are days, so ages are given in days. */
  function issues(d,ref){
    const rank={urgent:0,high:1,medium:2,low:3};
    return (d.issues||[]).filter(i=>i.status!=='resolved'&&i.status!=='closed').map(i=>{
      const age=isDay(i.createdAt)?Math.round(between(i.createdAt,ref)):null;
      return {id:i.id,title:clip(i.title,120),property:i.propId?nameOf(d,i.propId):'General',status:i.status==='waiting'?'Waiting'+(i.waitingFor?' · '+clip(i.waitingFor,40):''):'Open',priority:i.priority||'medium',
        ago:age===null?'':age<=0?'Today':age===1?'Yesterday':age+' days ago',attention:i.priority==='high'||i.priority==='urgent'};
    }).sort((a,b)=>(rank[a.priority]??2)-(rank[b.priority]??2)||a.title.localeCompare(b.title));
  }

  /* Central insights, each with its window stated. WhatsApp counts only Jarvis's own inbox (null when unavailable). */
  function insights(d,ref,{inbox=null,required=()=>1}={}){
    const week=plus(ref,6),t=tasks(d,ref);
    const upcoming=(d.sessions||[]).filter(s=>s.status!=='cancelled'&&s.status!=='done'&&isDay(s.date)&&s.date>=ref&&s.date<=week);
    const short=upcoming.filter(s=>crewOf(d,s,required(s.propId)).state!=='confirmed').length;
    return {properties:(d.props||[]).filter(p=>!p.archived&&p.active!==false).length,
      arrivals:(d.bookings||[]).filter(b=>b.status!=='cancelled'&&isDay(b.checkIn)&&b.checkIn>=ref&&b.checkIn<=week).length,
      dueToday:t.counts.today,needTeams:short,cleaningsWeek:upcoming.length,
      unread:inbox&&inbox.connection&&inbox.connection.state!=='unreachable'&&Number.isInteger(inbox.unreadCount)?inbox.unreadCount:null};
  }

  /* WhatsApp summaries exactly as the Jarvis inbox stores them (stable chat keys, newest first). */
  function whatsapp(inbox,filter='all',{limit=30}={}){
    const chats=Array.isArray(inbox&&inbox.chats)?inbox.chats:[];
    const counts={all:chats.length,unread:chats.filter(c=>c.unreadCount>0).length,group:chats.filter(c=>c.kind==='group').length,direct:chats.filter(c=>c.kind!=='group').length};
    const pick=filter==='unread'?c=>c.unreadCount>0:filter==='group'?c=>c.kind==='group':filter==='direct'?c=>c.kind!=='group':()=>true;
    const rows=chats.filter(pick).slice(0,limit).map(c=>({key:clip(c.key,64),kind:c.kind==='group'?'group':'direct',name:clip(c.name,80),preview:clip(c.preview,140),updatedAt:Number(c.updatedAt)||0,unread:Math.max(0,Number(c.unreadCount)||0),
      draft:c.draftStatus==='ready'?'Draft ready':c.draftStatus==='generating'?'Drafting':'',uncertain:c.sendStatus==='uncertain',awaiting:c.awaitingReply===true,initials:initials(c.name)}));
    return {counts,rows};
  }

  const api={calendar,tasks,cleanings,issues,insights,whatsapp,crewOf,dayLabel,initials,plus,weekEnd};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SV_JARVIS_DASHBOARD=api;
})(typeof window!=='undefined'?window:null);
