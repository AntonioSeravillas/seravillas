/* Jarvis local drafts. Only the manager's own typed or spoken request is parsed — never
   model replies, quotes or snapshot data. A draft opens an editable review; records change
   only when Confirm is pressed, and then through the app's existing save rules. A request
   with a missing or unknown detail opens a local correction form instead; nothing is guessed. */
(function(){
  /* "mar" is deliberately not a month so Villa Mar is never read as March. */
  const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const MON='(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
  const PRIORITIES=['high','medium','low'];
  const VERBS='add|create|make|log|move|reschedule|change|update|set|shift|postpone|push';
  const ACTION_RE=new RegExp('\\b(?:'+VERBS+')\\b(?:\\s+\\S+){0,4}?\\s+(?:task|cleaning)s?\\b','i');
  const FIELD_RE=new RegExp('\\b(?:'+VERBS+')\\b.*\\b(?:due date|deadline|priority)\\b.*\\btask\\b','i');
  const UNSURE_RE=/\b(?:if|unless|maybe|perhaps|not|don['’]?t|do not|never|or|whether)\b/i;
  /* Bounded direct-request lead-ins only; anything else is left as said. */
  const LEAD_RE=/^(?:no[,.!]?\s+you\s+should|you\s+should|i\s+(?:need|want)\s+you\s+to|i\s+would\s+like\s+you\s+to|i['’]d\s+like\s+you\s+to)\s+/i;
  const REPEAT_RE=new RegExp('^('+VERBS+')(?:[\\s,]+\\1\\b)+','i');
  const EXAMPLE='for example “Move the cleaning at [property] on 22 October 2026 to 24 October 2026 at 11:00”.';
  const DATE_HELP='Please give the date with day, month and year, for example 22 October 2026, or say today or tomorrow.';
  const STALE='This record changed after the review opened, so nothing was saved. Ask Jarvis again.';
  let state={draft:null,busy:false,correction:null};

  const two=n=>String(n).padStart(2,'0');
  const clarify=message=>({kind:'clarify',message});
  const fix=(message,extra={})=>({kind:'correct',message,clause:null,...extra});
  const draftResult=draft=>({kind:'draft',draft});
  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');const y=+value.slice(0,4);return y>=2000&&y<=2100&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  const validTime=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||'');
  function plainWords(text){return String(text||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/['’]s\b/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);}
  function hasRun(tokens,words){for(let i=0;i+words.length<=tokens.length;i++){if(words.every((w,j)=>tokens[i+j]===w))return true;}return false;}
  const reEsc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  /* Exact property names from current app data, compared as whole-word sequences. */
  function findProps(text){
    const tokens=plainWords(text),hits=[];
    for(const p of D.props||[]){const words=plainWords(p.name);if(!words.length)continue;for(let i=0;i+words.length<=tokens.length;i++){if(words.every((w,j)=>tokens[i+j]===w))hits.push({prop:p,start:i,end:i+words.length});}}
    const kept=hits.filter(h=>!hits.some(o=>o!==h&&o.start<=h.start&&o.end>=h.end&&o.end-o.start>h.end-h.start));
    return [...new Set(kept.map(h=>h.prop))];
  }
  const DATE_WORDS=new Set([...Object.keys(MONTHS),'march','today','tomorrow','monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
  const FILLER=new Set(['the','a','an','for','at','in','on','from','of','by','due','date','and','with','as','priority','cleaning','clean','checkout','scheduled','current','currently','s','please','same','day','time','to','is','its','it','new','instead','o','clock']);
  const TIME_RE=/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|o['’]?clock)?(?![\w:])/gi;
  const PRIORITY_RE=/\b(?:high|medium|low)\s+priority\b|\bpriority\s+(?:is\s+|of\s+|to\s+)?(?:high|medium|low)\b|\burgent\b/gi;
  const withoutProps=text=>findProps(text).reduce((out,p)=>stripProp(out,p),String(text));
  /* Words left after removing exact properties, dates, times and priority. Anything left is unrecognised. */
  function leftover(text,reference,allowed=[]){
    const work=withoutProps(blank(text,scanDates(text,reference))).replace(TIME_RE,' ').replace(PRIORITY_RE,' ');
    return plainWords(work).filter(w=>!FILLER.has(w)&&!allowed.includes(w)).join(' ');
  }
  function unknownPlace(text){
    /* Any capitalised name after for/at/in must be an exact property, even when another valid property is named too. */
    for(const m of String(text).matchAll(/\b(?:[Ff]or|[Aa]t|[Ii]n)\s+(?:the\s+)?([A-ZÀ-Þ][\wÀ-ÿ’'-]*(?:\s+[A-ZÀ-Þ][\wÀ-ÿ’'-]*)*)/g)){
      const rest=withoutProps(m[1]);
      if(plainWords(rest).some(w=>!DATE_WORDS.has(w)))return rest.replace(/\s{2,}/g,' ').trim();
    }
    for(const m of String(text).matchAll(/\b(?:for|at|in)\s+((?:villa|casa|can|ca|finca|la|el|apartment|apartamento)\s+[a-zà-ÿ]+)/gi)){if(!findProps(m[1]).length)return m[1];}
    for(const m of String(text).matchAll(/\b(?:for|at|in)\s+(?:the\s+)?([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)/gi)){
      const phrase=m[1].replace(/\s+(?:on|to|at|for|due|by|from|today|tomorrow)$/i,'');
      if(!findProps(phrase).length&&typeof resolveVoiceProperty==='function'&&resolveVoiceProperty(phrase))return phrase;
    }
    return '';
  }
  /* The whole property clause the user said ("at Casa a Hemplo"), so a chosen property replaces exactly that. */
  const BOUNDARY=/\s+(?:on|from|due|to|by|with|before)\b|\s*[:,;.!?]|\s+\d|\s+(?:today|tomorrow)\b|\s+(?:high|medium|low|urgent|priority)\b|\s*$/i;
  function clauseFor(text,phrase){
    const src=String(text);
    const words=plainWords(phrase);
    const hit=words.length?new RegExp('\\b'+words.map(reEsc).join('[^a-z0-9]+'),'i').exec(src.normalize('NFD').replace(/\p{M}/gu,'')):null;
    const preps=[...src.matchAll(/\b(for|at|in)\s+(?=\S)/gi)].filter(m=>{const next=plainWords(src.slice(m.index+m[0].length).split(/\s+/)[0])[0]||'';return next&&!/^\d/.test(next)&&!DATE_WORDS.has(next);});
    const prep=hit?preps.filter(m=>m.index<hit.index).pop():preps[0];
    if(!prep)return null;
    const tail=src.slice(prep.index+prep[0].length);
    const text_=tail.slice(0,tail.search(BOUNDARY)).trim();
    return text_?{prep:prep[1],text:text_}:null;
  }
  function propertyProblem(props,text,action){
    if(props.length>1)return fix('That matches more than one property ('+props.map(p=>p.name).join(', ')+'). Choose one.',{action,clause:clauseFor(text,props[0].name)});
    const unknown=unknownPlace(text);
    if(unknown){const clause=clauseFor(text,unknown);return fix('I couldn’t find “'+(clause?clause.text:unknown.trim())+'” in your properties. Choose it below or use the full name.',{action,clause});}
    return null;
  }
  function priorityProblem(text,action){
    const bad=fix('Priority can only be high, medium or low.',{action});
    for(const m of String(text).matchAll(/\bpriority\s+(?:is\s+|of\s+|to\s+|level\s+)?([a-z]+)/gi)){if(!PRIORITIES.includes(m[1].toLowerCase())&&!['due','for','at','on','and','with','by'].includes(m[1].toLowerCase()))return bad;}
    return /\b(?:critical|top|highest|lowest|normal|max|maximum|min|minimum|very|extreme|urgent)\s+priority\b/i.test(text)?bad:null;
  }
  const unclear=(left,text,action)=>fix('I didn’t understand “'+left+'”. Choose the property or edit the text.',{action,clause:clauseFor(text,left)});
  function stripProp(text,prop){
    const words=String(prop.name).trim().split(/\s+/).map(reEsc).join('[\\s-]+');
    return String(text).replace(new RegExp('(?:\\b(?:for|at|in)\\s+)?(?:the\\s+)?\\b'+words+'\\b','ig'),' ');
  }

  function ymd(y,m,d,raw){if(!y)return {error:'Please include the year in “'+String(raw).trim()+'”, for example 22 October 2026.'};const iso=y+'-'+two(m)+'-'+two(d);return validDate(iso)?{iso}:{error:'“'+String(raw).trim()+'” doesn’t exist. Please check the day and month.'};}
  function scanDates(text,reference){
    const src=String(text),found=[],taken=[];
    const take=(m,value)=>{const a=m.index,b=a+m[0].length;if(taken.some(([x,y])=>a<y&&b>x))return;taken.push([a,b]);found.push({start:a,end:b,...value});};
    for(const m of src.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))take(m,ymd(+m[1],+m[2],+m[3],m[0]));
    for(const m of src.matchAll(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?'+MON+'\\b\\.?,?(?:\\s+(\\d{4})\\b)?','gi')))take(m,ymd(m[3]?+m[3]:null,MONTHS[m[2].toLowerCase()],+m[1],m[0]));
    for(const m of src.matchAll(new RegExp('\\b'+MON+'\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?(?:\\s+(\\d{4})\\b)?','gi')))take(m,ymd(m[3]?+m[3]:null,MONTHS[m[1].toLowerCase()],+m[2],m[0]));
    for(const m of src.matchAll(/\b(?:day after tomorrow|yesterday|tonight|(?:(?:next|this|last)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|month))\b/gi))take(m,{error:DATE_HELP});
    for(const m of src.matchAll(/\b(today|tomorrow)(?:['’]s)?(?![\w])/gi))take(m,{iso:m[1].toLowerCase()==='today'?reference:addDays(reference,1)});
    for(const m of src.matchAll(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g))take(m,{error:DATE_HELP});
    return found.sort((a,b)=>a.start-b.start);
  }
  function blank(text,spans){let out=String(text);for(const s of spans)out=out.slice(0,s.start)+' '.repeat(s.end-s.start)+out.slice(s.end);return out;}
  /* 24-hour times. "at 11" and "11 o'clock" are read as 11:00; am/pm is converted; anything else is refused. */
  function scanTimes(text){
    const src=String(text),found=[];let error='';
    for(const m of src.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o['’]?clock)?(?![\w:])/gi)){
      const suffix=(m[3]||'').replace(/[.’']/g,'').toLowerCase(),ampm=suffix==='am'||suffix==='pm'?suffix:'';
      if(m[2]===undefined&&!suffix&&!/\bat\s+$/i.test(src.slice(0,m.index)))continue;
      let h=+m[1];const min=m[2]===undefined?0:+m[2];
      if(ampm){if(h<1||h>12){error='That time doesn’t exist.';continue;}h=h%12+(ampm==='pm'?12:0);}
      if(h>23||min>59){error='That time doesn’t exist.';continue;}
      found.push(two(h)+':'+two(min));
    }
    return {times:found,error};
  }
  function priorityIn(text){
    const hits=new Set();
    for(const m of String(text).matchAll(/\b(high|medium|low)\s+priority\b|\bpriority\s+(?:is\s+|of\s+|to\s+)?(high|medium|low)\b|\b(urgent)\b/gi))hits.add((m[1]||m[2]||'high').toLowerCase());
    return [...hits];
  }
  function tidy(text){
    let out=String(text).replace(/\s{2,}/g,' ').trim();
    for(let i=0;i<3;i++)out=out.replace(/^[\s,:;-]*(?:to|that|saying|called|named|for|and)?\s*[,:;-]?\s+/i,'').replace(/^[,:;-]+/,'').replace(/[\s,;:-]+(?:for|at|on|due|by|and|with|as)?\s*$/i,'').trim();
    return out;
  }

  function createTask(rest,reference){
    const colon=rest.indexOf(':');
    const meta=colon>=0?rest.slice(0,colon):rest;
    if(UNSURE_RE.test(meta))return clarify('That sounds uncertain, so I haven’t prepared anything. Tell me exactly what to add, with a colon before the task text.');
    if(colon<0&&ACTION_RE.test(rest))return clarify('One change at a time, please. If that is all task text, put a colon before it, for example “Add task: update the cleaning checklist”.');
    const props=findProps(meta),problem=propertyProblem(props,meta,'create')||priorityProblem(meta,'create');if(problem)return problem;
    const dates=scanDates(meta,reference),bad=dates.find(d=>d.error);if(bad)return fix(bad.error,{action:'create'});
    if(dates.length>1)return fix('I heard more than one date. Which due date should the task have?',{action:'create'});
    const priorities=priorityIn(meta);if(priorities.length>1)return fix('Which priority: high, medium or low?',{action:'create'});
    const left=colon>=0?leftover(meta,reference):'';if(left)return unclear(left,meta,'create');
    let text;
    if(colon>=0)text=rest.slice(colon+1).trim();
    else{
      let work=rest;
      for(const d of dates.slice().reverse()){const before=work.slice(0,d.start).replace(/\b(?:due(?:\s+(?:date|on|by))?|on|by|for|before)\s*$/i,'');work=before+' '+work.slice(d.end);}
      if(props[0])work=stripProp(work,props[0]);
      work=work.replace(/(?:\b(?:with|as|at)\s+)?(?:\b(?:high|medium|low)\s+priority\b|\bpriority\s+(?:high|medium|low)\b|\burgent\b)/gi,' ');
      text=tidy(work);
    }
    text=text.replace(/^["“'‘]+|["”'’]+$/g,'').trim().slice(0,300);
    if(!text)return fix('What should the task say? Add it after a colon.',{action:'create'});
    const prop=props[0]||null;
    return draftResult({type:'create_task',current:null,proposed:{text,propId:prop?prop.id:'',dueDate:dates[0]?dates[0].iso:'',priority:priorities[0]||'medium'},
      form:{'nt-text':text,'nt-prop':prop?prop.id:'','nt-due':dates[0]?dates[0].iso:'','nt-prio':priorities[0]||'medium'}});
  }

  function effectivePriority(t){return t.priority||(t.urgent?'high':'low');}
  function updateTask(name,field,value,reference){
    const act={action:'update'};
    if(UNSURE_RE.test(value))return clarify('That sounds uncertain, so I haven’t prepared anything. Tell me the exact change.');
    const nameProps=findProps(name),problem=propertyProblem(nameProps,name,'update');if(problem)return problem;
    if(findProps(value).length)return fix('I can only change a task’s due date or priority here.',act);
    const dates=scanDates(value,reference),bad=dates.find(d=>d.error);if(bad)return fix(bad.error,act);
    if(dates.length>1)return fix('I heard more than one date. Which due date should it have?',act);
    const prio=[...new Set([...value.matchAll(/\b(high|medium|low|urgent)\b/gi)].map(m=>m[1].toLowerCase()==='urgent'?'high':m[1].toLowerCase()))];
    if(prio.length>1)return fix('Which priority: high, medium or low?',act);
    if(field==='priority'&&!prio.length)return fix('Which priority: high, medium or low?',act);
    if(field==='due'&&!dates.length)return fix('What is the new due date? '+DATE_HELP,act);
    if(!dates.length&&!prio.length)return fix('Tell me the new due date (with the year) or the priority.',act);
    const priorityBad=priorityProblem(value,'update');if(priorityBad)return priorityBad;
    const left=leftover(value,reference,['high','medium','low','urgent']);if(left)return unclear(left,value,'update');
    const prop=nameProps[0]||null;
    const label=tidy((prop?stripProp(name,prop):name).replace(/^["“'‘]+|["”'’]+$/g,''));
    const words=plainWords(label);if(!words.length)return fix('Which task? Please add its name.',act);
    const open=(D.tasks||[]).filter(t=>!t.done&&(!prop||t.propId===prop.id));
    const exact=open.filter(t=>plainWords(t.text).join(' ')===words.join(' '));
    const matches=exact.length?exact:open.filter(t=>hasRun(plainWords(t.text),words));
    if(!matches.length)return fix('I couldn’t find an open task matching “'+label+'”.',act);
    if(matches.length>1)return fix(matches.length+' open tasks match “'+label+'”. Use more of the task name or add its property.',act);
    const t=matches[0];
    const proposed={dueDate:dates.length?dates[0].iso:(t.dueDate||''),priority:prio[0]||effectivePriority(t)};
    if(proposed.dueDate===(t.dueDate||'')&&proposed.priority===effectivePriority(t))return fix('That task already has that '+(dates.length?'due date':'priority')+'.',act);
    return draftResult({type:'update_task',id:t.id,snapshot:JSON.stringify(t),current:{text:t.text,propId:t.propId||'',dueDate:t.dueDate||'',priority:effectivePriority(t)},proposed,form:{'jx-due':proposed.dueDate,'jx-prio':proposed.priority}});
  }

  function moveCleaning(rest,reference){
    const act={action:'move'};
    if(UNSURE_RE.test(rest))return clarify('That sounds uncertain, so I haven’t prepared anything. Tell me the cleaning and its new date.');
    const cut=rest.search(/\s+to\s+(?!.*\s+to\s+)/i);
    if(cut<0)return fix('Add the new date after “to”, '+EXAMPLE,act);
    const src=rest.slice(0,cut),dst=rest.slice(cut).replace(/^\s+to\s+/i,'');
    if(findProps(dst).length)return fix('I can only change the date or time of a cleaning, not its property.',act);
    const props=findProps(src),problem=propertyProblem(props,src,'move');if(problem)return problem;
    if(!props.length)return fix('Which property? Choose it below.',act);
    const prop=props[0];
    const srcDates=scanDates(src,reference),badSrc=srcDates.find(d=>d.error);if(badSrc)return fix(badSrc.error,act);
    if(srcDates.length!==1)return fix('Which day is the cleaning on now? Add its current date, for example “on 22 October 2026”.',act);
    const srcTimes=scanTimes(blank(src,srcDates));if(srcTimes.error)return fix(srcTimes.error,act);if(srcTimes.times.length>1)return fix('Which current time do you mean?',act);
    const dstDates=scanDates(dst,reference),badDst=dstDates.find(d=>d.error);if(badDst)return fix(badDst.error,act);
    if(dstDates.length>1)return fix('I heard more than one new date. Which one?',act);
    const dstTimes=scanTimes(blank(dst,dstDates));if(dstTimes.error)return fix(dstTimes.error,act);if(dstTimes.times.length>1)return fix('Which new time do you mean?',act);
    if(!dstDates.length&&!dstTimes.times.length)return fix('What is the new date or time? '+DATE_HELP,act);
    const left=leftover(src,reference);if(left)return unclear(left,src,'move');
    const leftDst=leftover(dst,reference);if(leftDst)return unclear(leftDst,dst,'move');
    const day=srcDates[0].iso,time=srcTimes.times[0];
    const sameDay=(D.sessions||[]).filter(s=>s.propId===prop.id&&s.date===day&&(time===undefined||(s.time||'')===time));
    const active=sameDay.filter(s=>s.status!=='cancelled');
    if(!active.length)return fix(sameDay.length?'That cleaning was cancelled, so it can’t be moved.':'I couldn’t find a cleaning at '+prop.name+' on '+fmtDate(day)+(time?' at '+time:'')+'.',act);
    if(active.length>1)return fix('There are '+active.length+' cleanings at '+prop.name+' on '+fmtDate(day)+'. Add the current time, for example “at 09:00”.',act);
    const s=active[0];
    if(s.status!=='scheduled')return fix('That cleaning is already completed, so it can’t be moved.',act);
    const proposed={date:dstDates.length?dstDates[0].iso:s.date,time:dstTimes.times.length?dstTimes.times[0]:(s.time||'')};
    if(proposed.date===s.date&&proposed.time===(s.time||''))return fix('That cleaning is already at that date and time.',act);
    const crew=getCleaningCrew(s);
    const staff=crew.main.filter(m=>m.status!=='cancelled').map(m=>((D.cleaners||[]).find(c=>c.id===m.cleanerId)||{}).name||m.name||'Former cleaner');
    if(crew.alinaSpots>0&&crew.alinaStatus!=='cancelled')staff.push('Alina team ('+crew.alinaSpots+')');
    return draftResult({type:'move_cleaning',id:s.id,snapshot:JSON.stringify(s),current:{propId:s.propId,date:s.date,time:s.time||'',staff},proposed,form:{'e-date':proposed.date,'e-time':proposed.time,'e-note':s.note||''}});
  }

  /* Bounded clean-up of the user's own words: wake word, "please", a direct-request lead-in, a repeated first verb. */
  function command(input){
    let text=String(input||'').replace(/\s+/g,' ').trim().slice(0,2000);
    text=text.replace(/^(?:hey\s+|ok\s+|okay\s+)?jarvis[,:!\s]+/i,'').replace(/^please[,\s]+/i,'');
    text=text.replace(LEAD_RE,'').replace(/^please[,\s]+/i,'').replace(REPEAT_RE,'$1');
    return text.trim();
  }
  /* Returns null (keep chatting), {kind:'clarify'} (non-action reply), {kind:'correct'} (local correction form) or {kind:'draft'}. Never mutates data. */
  function detect(input,reference=today()){
    const original=String(input||'').replace(/\s+/g,' ').trim().slice(0,2000);
    let text=command(original);
    if(!text)return null;
    const actionLike=ACTION_RE.test(text)||FIELD_RE.test(text);
    if(/^(?:add|create|log|make|new)\s+(?:a\s+|an\s+|new\s+)?(?:issue|note|contact|booking)\b/i.test(text))return null;
    const question=/\?\s*$/.test(text)||/^(?:can|could|would|will|should|shall|do|does|did|is|are|was|were|have|has|how|what|why|when|where|who|which|may|might)\b/i.test(text);
    if(question||/^["“'‘]/.test(text))return actionLike?clarify('I can prepare that for you to review. Please say it as a direct request, not a question.'):null;
    text=text.replace(/[.!\s]+$/,'').replace(/,?\s+please$/i,'');
    let m=text.match(/^(?:add|create|make|log)\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?task\b\s*(.*)$/i),result=null;
    if(m)result=createTask(m[1],reference);
    else if((m=text.match(/^(?:change|update|set|move|reschedule|push|postpone|make)\s+(?:the\s+)?(due date|deadline|priority)\s+(?:of|for|on)\s+(?:the\s+)?task\s+(.+)\s+to\s+(.+)$/i)))result=updateTask(m[2],m[1].toLowerCase()==='priority'?'priority':'due',m[3],reference);
    else if((m=text.match(/^(?:change|update|set|move|reschedule|push|postpone)\s+(?:the\s+)?task\s+(.+)\s+to\s+(.+)$/i))){
      const field=/\bpriority\s*$/i.test(m[1])?'priority':/\b(?:due date|deadline|due)\s*$/i.test(m[1])?'due':'';
      result=updateTask(m[1].replace(/(?:['’]s)?\s*\b(?:priority|due date|deadline|due)\s*$/i,''),field,m[2],reference);
    }
    else if(/^(?:move|reschedule|change|shift|push|postpone)\s+(?:\S+\s+){0,4}?cleaning\b/i.test(text))result=moveCleaning(text.replace(/^\S+\s+/,''),reference);
    else return actionLike?clarify('I didn’t prepare anything because the request wasn’t clear. Say it directly, '+EXAMPLE):null;
    if(result.kind==='correct')result.command=original;
    return result;
  }
  /* A bare time or date with no request ("11:00") is answered locally, never sent to the agent to fill in. */
  function fragment(text,reference){
    const t=command(text).replace(/[.!?\s]+$/,'');if(!t)return false;
    const dates=scanDates(t,reference),times=scanTimes(blank(t,dates));
    return (dates.length>0||times.times.length>0||!!times.error)&&!leftover(t,reference);
  }

  function legacyCreate(text){
    const body=String(text||'').replace(/^\s*(?:hey\s+)?(?:jarvis[,\s]+)?/i,'');
    if(!/^\s*(?:add|create|log|make)\b/i.test(body)||typeof parseVoiceCommandLocal!=='function')return false;
    const type=parseVoiceCommandLocal(body).type;
    return ['create_issue','create_note','create_contact','create_booking'].includes(type)||(type==='needs_clarification'&&!/\btask\b/i.test(body));
  }
  /* Same routing in App tools and Hermes modes: explicit changes never reach the model. */
  function route(text,mode,reference=today()){
    const result=detect(text,reference);
    if(result&&result.kind==='draft')return {kind:'review',draft:result.draft,message:'I’ve prepared a review. Nothing is saved until you press Confirm.'};
    if(result&&result.kind==='correct')return {kind:'correct',correction:{command:result.command,message:result.message,clause:result.clause,action:result.action},message:result.message};
    if(result&&result.kind==='clarify')return {kind:'reply',message:result.message};
    if(fragment(text,reference))return {kind:'reply',message:'Please say the whole request in one go, '+EXAMPLE};
    if(mode==='local'&&legacyCreate(text))return {kind:'legacy'};
    return {kind:'chat'};
  }

  const fieldValue=id=>String((document.getElementById(id)||{}).value||'');
  const priorityLabel=p=>({high:'High',medium:'Medium',low:'Low'})[p]||'Not set';
  const dateLabel=d=>d?fmtDate(d)+' '+d.slice(0,4):'None';
  const row=(label,now,next)=>'<div style="display:grid;grid-template-columns:minmax(80px,1fr) minmax(90px,1.2fr) minmax(120px,1.6fr);gap:8px;align-items:center;margin-bottom:10px;font-size:13px"><b>'+esc(label)+'</b><span style="color:var(--text2)">'+now+'</span><div>'+next+'</div></div>';
  const head='<div style="display:grid;grid-template-columns:minmax(80px,1fr) minmax(90px,1.2fr) minmax(120px,1.6fr);gap:8px;margin-bottom:6px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em"><span></span><span>Now</span><span>Proposed</span></div>';
  const prioSelect=(id,value)=>'<select id="'+id+'" aria-label="Proposed priority">'+PRIORITIES.map(p=>'<option value="'+p+'"'+(p===value?' selected':'')+'>'+priorityLabel(p)+'</option>').join('')+'</select>';
  function reviewHtml(d){
    const f=d.form;let title,body='';
    if(d.type==='create_task'){
      title='Review new task';
      const props='<option value="">No property</option>'+(D.props||[]).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===f['nt-prop']?' selected':'')+'>'+esc(p.name)+'</option>').join('');
      body=head+row('Task','None — new task','<input type="text" id="nt-text" maxlength="300" aria-label="Task text" value="'+esc(f['nt-text'])+'">')
        +row('Property','—','<select id="nt-prop" aria-label="Property">'+props+'</select>')
        +row('Due date','—','<input type="date" id="nt-due" aria-label="Due date" value="'+esc(f['nt-due'])+'">')
        +row('Priority','—',prioSelect('nt-prio',f['nt-prio']));
    }else if(d.type==='update_task'){
      title='Review task change';
      body='<div style="font-size:14px;font-weight:600;margin-bottom:4px">'+esc(d.current.text)+'</div><div style="font-size:12px;color:var(--text2);margin-bottom:12px">'+esc(d.current.propId?propName(d.current.propId):'No property')+'</div>'
        +head+row('Due date',esc(dateLabel(d.current.dueDate)),'<input type="date" id="jx-due" aria-label="Proposed due date" value="'+esc(f['jx-due'])+'">')
        +row('Priority',esc(priorityLabel(d.current.priority)),prioSelect('jx-prio',f['jx-prio']));
    }else{
      title='Review cleaning move';
      body='<div style="font-size:14px;font-weight:600;margin-bottom:4px">'+esc(propName(d.current.propId))+'</div><div style="font-size:12px;color:var(--text2);margin-bottom:12px">Staff: '+esc(d.current.staff.join(', ')||'None assigned')+'</div>'
        +head+row('Date',esc(dateLabel(d.current.date)),'<input type="date" id="e-date" aria-label="New date" value="'+esc(f['e-date'])+'">')
        +row('Time',esc(d.current.time||'No time'),'<input type="time" id="e-time" aria-label="New time" value="'+esc(f['e-time'])+'">')
        +'<textarea id="e-note" hidden aria-hidden="true">'+esc(f['e-note'])+'</textarea>'
        +'<p style="font-size:13px;font-weight:600;margin:4px 0 6px">Proposed: '+esc(dateLabel(f['e-date']))+(f['e-time']?' at '+esc(f['e-time'])+' (24-hour clock)':', no time')+'</p>'
        +'<p style="font-size:12px;color:var(--text2);line-height:1.5;margin:0">'+(d.current.staff.length?'Assigned staff will be asked to confirm again. ':'')+'No one is messaged automatically. Staff conflicts are checked when you confirm.</p>';
    }
    return '<div class="modal-handle"></div><div class="modal-title">'+title+'</div>'
      +'<div class="sv-card" style="font-size:13px;margin-bottom:14px;background:var(--surface2)">Nothing is saved until you press <b>Confirm</b>. You can edit the proposed details first.</div>'
      +body+'<div id="jx-review-error" role="alert" style="font-size:13px;color:var(--red-text);margin-top:10px" hidden></div>'
      +'<div style="display:flex;gap:8px;margin-top:14px"><button class="sv-btn sv-btn-primary" id="jx-confirm" style="flex:1" onclick="SV_JARVIS_ACTIONS.confirm()">Confirm</button><button class="sv-btn sv-btn-secondary" style="flex:1" onclick="SV_JARVIS_ACTIONS.cancel()">Cancel</button></div>';
  }
  function openReview(draft){
    if(!draft||!['create_task','update_task','move_cleaning'].includes(draft.type))return false;
    state={draft:JSON.parse(JSON.stringify(draft)),busy:false,correction:null};showModal(reviewHtml(state.draft));return true;
  }
  function showError(text){const node=document.getElementById('jx-review-error');if(node){node.textContent=text;node.hidden=false;}}
  function setBusy(on){const button=document.getElementById('jx-confirm');if(button)button.disabled=on;}

  /* Local correction form: the recognised words, the specific problem and a property list. Nothing is saved from here. */
  function correctionHtml(c){
    const props='<option value="">Choose a property…</option>'+(D.props||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    return '<div class="modal-handle"></div><div class="modal-title">Check the request</div>'
      +'<div id="jx-fix-error" role="alert" style="font-size:13px;font-weight:600;color:var(--red-text);margin-bottom:12px">'+esc(c.message)+'</div>'
      +'<div class="field"><label for="jx-command">What I heard</label><textarea id="jx-command" maxlength="2000" style="height:96px">'+esc(c.command)+'</textarea></div>'
      +'<div class="field"><label for="jx-fix-prop">Property</label><select id="jx-fix-prop" onchange="SV_JARVIS_ACTIONS.useProperty(this.value)">'+props+'</select></div>'
      +'<p style="font-size:12px;color:var(--text2);line-height:1.5;margin:0">Choosing a property only replaces the property name in the text. Nothing is saved here.</p>'
      +'<div style="display:flex;gap:8px;margin-top:14px"><button class="sv-btn sv-btn-primary" style="flex:1" onclick="SV_JARVIS_ACTIONS.recheck()">Review command</button><button class="sv-btn sv-btn-secondary" style="flex:1" onclick="SV_JARVIS_ACTIONS.cancel()">Cancel</button></div>';
  }
  function openCorrection(c){
    if(!c||typeof c.command!=='string'||typeof c.message!=='string')return false;
    state={draft:null,busy:false,correction:JSON.parse(JSON.stringify(c))};showModal(correctionHtml(state.correction));return true;
  }
  function fixMessage(text){const node=document.getElementById('jx-fix-error');if(node)node.textContent=text;}
  /* Replace only the recognised property clause with the chosen property, or add one where the request expects it. */
  function withProperty(text,prop){
    const r=detect(text),action=r&&r.kind==='correct'?r.action:state.correction&&state.correction.action;
    let clause=r&&r.kind==='correct'?r.clause:null;
    if(!clause){const found=findProps(text);if(found.length===1)clause=clauseFor(text,found[0].name);}
    if(clause){const re=new RegExp('\\b'+reEsc(clause.prep)+'\\s+'+reEsc(clause.text),'i');if(re.test(text))return text.replace(re,()=>clause.prep+' '+prop.name);}
    if(action==='move'&&/\bcleaning\b/i.test(text))return text.replace(/\bcleaning\b/i,()=>'cleaning at '+prop.name);
    if(action==='create'&&/\btask\b/i.test(text))return text.replace(/\btask\b/i,()=>'task for '+prop.name);
    return null;
  }
  function useProperty(propId){
    if(!state.correction)return false;
    const prop=(D.props||[]).find(p=>p.id===propId),box=document.getElementById('jx-command');
    if(!prop||!box)return false;
    const next=withProperty(String(box.value||''),prop);
    if(next===null){fixMessage('Please type the property name in the text.');return false;}
    box.value=next;state.correction={...state.correction,command:next};fixMessage(prop.name+' chosen. Press Review command.');return true;
  }
  function recheck(){
    if(!state.correction)return false;
    const text=fieldValue('jx-command').trim(),r=detect(text);
    if(r&&r.kind==='draft')return openReview(r.draft);
    const message=r?r.message:'That isn’t a task or cleaning change I can prepare. Edit the text or Cancel.';
    state.correction={...state.correction,command:text,message,...(r&&r.kind==='correct'?{clause:r.clause,action:r.action}:{})};
    fixMessage(message);return false;
  }

  function applyCreate(){
    const text=fieldValue('nt-text').trim(),propId=fieldValue('nt-prop'),due=fieldValue('nt-due'),prio=fieldValue('nt-prio');
    if(!text)return {message:'Please enter the task text.'};
    if(propId&&!(D.props||[]).some(p=>p.id===propId))return {message:'That property is no longer in the app. Choose another.'};
    if(due&&!validDate(due))return {message:'Please choose a valid due date.'};
    if(!PRIORITIES.includes(prio))return {message:'Please choose a priority.'};
    const before=D.tasks.length;window._ntType='ops';saveNewTask();
    return D.tasks.length===before+1?{ok:true}:{message:'The task was not saved. Please try again.'};
  }
  function applyUpdate(d){
    const t=(D.tasks||[]).find(x=>x.id===d.id);
    if(!t||t.done||JSON.stringify(t)!==d.snapshot)return {message:STALE,final:true};
    const due=fieldValue('jx-due'),prio=fieldValue('jx-prio');
    if(due&&!validDate(due))return {message:'Please choose a valid due date.'};
    if(!PRIORITIES.includes(prio))return {message:'Please choose a priority.'};
    const dueChanged=due!==(t.dueDate||''),prioChanged=prio!==effectivePriority(t);
    if(!dueChanged&&!prioChanged)return {message:'Nothing has changed yet.'};
    if(dueChanged)t.dueDate=due;
    if(prioChanged){t.priority=prio;t.urgent=prio==='high';}
    save();closeModal();render();toast('Task updated');return {ok:true};
  }
  function applyMove(d){
    const s=(D.sessions||[]).find(x=>x.id===d.id);
    if(!s||s.status!=='scheduled'||JSON.stringify(s)!==d.snapshot)return {message:STALE,final:true};
    const date=fieldValue('e-date'),time=fieldValue('e-time');
    if(!validDate(date))return {message:'Please choose a valid date.'};
    if(time&&!validTime(time))return {message:'Please choose a valid time.'};
    if(date===s.date&&time===(s.time||''))return {message:'Choose a new date or time first.'};
    /* Same crew list openSessEdit prepares; saveSessEdit applies the native conflict, capacity and re-confirmation rules. */
    window._ec=getCleaningCrew(s).main.filter(m=>m.status!=='cancelled').map(m=>m.cleanerId);
    saveSessEdit(s.id);
    if(s.date===date&&(s.time||'')===time)return {ok:true};
    return JSON.stringify(s)===d.snapshot?{message:'Not saved — see the message above. Choose another date or time, or Cancel.'}:{message:STALE,final:true};
  }
  function confirm(){
    const d=state.draft;if(!d||state.busy)return false;
    state.busy=true;setBusy(true);
    let result;
    try{result=d.type==='create_task'?applyCreate():d.type==='update_task'?applyUpdate(d):applyMove(d);}
    catch{result={message:'Something went wrong, so nothing more was saved. Please check the record.',final:true};}
    if(result.ok||result.final)state.draft=null;
    if(!result.ok){showError(result.message);if(!result.final){state.busy=false;setBusy(false);}}
    return result.ok===true;
  }
  function cancel(){state={draft:null,busy:false,correction:null};closeModal();}
  const copy=value=>value?JSON.parse(JSON.stringify(value)):null;
  window.SV_JARVIS_ACTIONS=Object.freeze({detect,route,openReview,openCorrection,useProperty,recheck,confirm,cancel,validDate,current:()=>copy(state.draft),correction:()=>copy(state.correction)});
})();
