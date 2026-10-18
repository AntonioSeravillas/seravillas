/* Validated app operations. The AI interprets Antonio's meaning and proposes typed fields; this module resolves the
   real records, applies the app's cleaning rules, keeps the pending plan and writes only after an app-owned confirmation.
   No model text is executed. The model has no confirm power: confirmation needs Antonio's own explicit words after the
   plan was read back (voice) or shown (typed/screen), bound to the exact current plan version. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SV_JARVIS_OPERATIONS=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  const RECORDS=typeof module==='object'&&module.exports?require('./jarvis-records.js'):root.SV_JARVIS_RECORDS;
  const ACTIONS=['plan_checkout_cleanings','revise','confirm','cancel','repeat'];
  const SCOPES=['results','dates','options'];
  const FIELDS=['action','scope','period','start','end','property','options','time','items','removeItems','keepItems','onlyProperties','removeProperties','cleaners'];
  const TTL=10*60*1000,MAX_ITEMS=40;
  const copy=v=>v===undefined||v===null?v:JSON.parse(JSON.stringify(v));
  const norm=v=>String(v||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const isDate=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const isTime=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v||'');
  const bad=message=>Object.assign(Error(message),{safe:true});

  /* ── Tool argument contract ── */
  function list(v,kind,max){
    if(v===undefined||v===null||v==='')return undefined;
    const raw=Array.isArray(v)?v:typeof v==='string'?v.split(/\s*(?:,|;|\band\b)\s*/i):typeof v==='number'?[v]:null;
    if(!raw||raw.length>max)throw bad('Use a short list for '+kind+'.');
    const out=raw.map(x=>typeof x==='string'?x.trim():x).filter(x=>x!==''&&x!==undefined&&x!==null);
    if(kind==='numbers'){const n=out.map(x=>typeof x==='string'&&/^\d+$/.test(x)?+x:x);if(n.some(x=>!Number.isInteger(x)||x<1||x>MAX_ITEMS))throw bad('Use plan item numbers.');return [...new Set(n)];}
    if(out.some(x=>typeof x!=='string'||x.length>80||/[\u0000-\u001f\u007f]/.test(x)))throw bad('Use short names.');
    return [...new Set(out)];
  }
  function time(v){
    if(v===undefined||v===null||v==='')return undefined;
    const m=String(v).trim().toLowerCase().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
    if(!m)throw bad('Give the time as HH:MM on the 24-hour clock.');
    let h=+m[1];const min=m[2]===undefined?0:+m[2],ampm=(m[3]||'').replace(/\./g,'');
    if(ampm){if(h<1||h>12)throw bad('That time does not exist.');h=h%12+(ampm==='pm'?12:0);}
    const out=String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');if(!isTime(out))throw bad('That time does not exist.');return out;
  }
  function sanitize(input){
    let a=input;
    if(a&&typeof a==='object'&&Object.keys(a).length===1&&typeof a.operation==='string'){try{a=JSON.parse(a.operation);}catch{throw bad('Invalid operation.');}}
    else if(a&&typeof a==='object'&&Object.keys(a).length===1&&a.operation&&typeof a.operation==='object')a=a.operation;
    if(!a||typeof a!=='object'||Array.isArray(a)||!ACTIONS.includes(a.action))throw bad('Use one of the supported app operations.');
    const unknown=Object.keys(a).filter(k=>!FIELDS.includes(k));if(unknown.length)throw bad('Unknown operation field: '+unknown.join(', ')+'. Use only the documented fields.');
    const out={action:a.action};
    if(a.scope!==undefined&&a.scope!==''){if(!SCOPES.includes(a.scope))throw bad('Scope must be results, dates or options.');out.scope=a.scope;}
    if(a.period!==undefined&&a.period!==''){if(!RECORDS.PERIODS.includes(a.period))throw bad('That period is not supported.');out.period=a.period;}
    for(const k of ['start','end'])if(a[k]!==undefined&&a[k]!==''){if(!isDate(a[k]))throw bad('Dates must be YYYY-MM-DD.');out[k]=a[k];}
    if(out.start&&out.end&&out.start>out.end)throw bad('The end date is before the start date.');
    if(a.property!==undefined&&a.property!==''){if(typeof a.property!=='string'||a.property.length>80||!a.property.trim())throw bad('Use a short property name.');out.property=a.property.trim();}
    const t=time(a.time);if(t)out.time=t;
    for(const [k,kind] of [['options','numbers'],['items','numbers'],['removeItems','numbers'],['keepItems','numbers'],['onlyProperties','names'],['removeProperties','names'],['cleaners','names']]){const v=list(a[k],kind,kind==='numbers'?MAX_ITEMS:8);if(v&&v.length)out[k]=v;}
    if(out.options&&out.options.some(n=>n>8))throw bad('Options refer to the displayed results, 1 to 8.');
    return out;
  }

  /* ── App-owned confirmation of Antonio's own words. Not a model decision. ──
     Requires an explicit go-ahead/commit meaning, rejects negation, hesitation, hypotheticals, questions about
     confirming, quotations, changes in the same breath, and anything about sending messages. */
  const NUMBERS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,both:2};
  const COMMIT=/\b(?:confirm(?:ed)?|approve(?:d)?|go ahead|go for it|do it|do that|do them|proceed|book (?:it|them|those|these|that)|schedule|create|save|add (?:it|them|those|these)|arrange|put (?:it|them|those|these) in|lock (?:it|them) in|make (?:it|them) happen|set (?:it|them) up)\b/;
  /* Anything that adds, narrows, defers or questions belongs to the conversation, not to a confirmation. */
  const HOLD=/\b(?:no|nope|not|dont|don t|do not|never|wait|hold on|hang on|stop|cancel|actually|but|except|instead|only|change|without|remove|leave|first|later|tomorrow|today|tonight|next|week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|too|also|another|more|other|again|maybe|perhaps|probably|if|unless|whether|should i|shall i|should we|shall we|would it|would that|what if|not sure|i think|dunno|don t know|send|message|whatsapp|text|email|tell|ask|said|says|told|wrote|task|tasks|issue|note|remind|move)\b|\bfor (?!me\b|us\b)\w/;
  /* A cancellation is an utterance made only of cancel phrases ("no, forget it, cancel that"). */
  const CANCEL_WORDS=/\b(?:no|nope|ok|okay|please|actually|cancel(?: (?:it|that|this|them|those|the plan|the cleanings|everything))?|forget (?:it|that|about it|the plan)|never mind|scrap (?:it|that|the plan)|drop (?:it|that|the plan)|don t (?:do it|bother))\b/g;
  const CANCEL={test:w=>/\b(?:cancel|forget|never mind|scrap|drop|bother)\b/.test(w)&&!w.replace(CANCEL_WORDS,' ').trim()};
  function cleanWords(text){return norm(String(text||'').replace(/[’']/g,' ')).replace(/\b(?:um+|uh+|er+|erm+|hm+|ah+|well|so|jarvis|hey|ok jarvis|okay jarvis)\b/g,' ').replace(/\s+/g,' ').trim();}
  function confirmation(text,expected,names){
    const raw=String(text||'');if(!raw.trim()||raw.length>300)return null;
    if(/["“”«»]/.test(raw))return null;
    const w=cleanWords(raw);if(!w)return null;
    if(CANCEL.test(w))return 'cancel';
    if(w.split(' ').length>18||HOLD.test(w))return null;
    const question=/\?\s*$/.test(raw.trim());
    if(question&&!/^(?:can|could|would|will) you\b/.test(w))return null;
    if(/^(?:is|are|do|does|did|should|shall|what|why|how|when|where|which|who|have|has|was|were)\b/.test(w))return null;
    if(/\b(?:\d{1,2}(?: \d{2})?\s*(?:am|pm|h)?|at \w+ (?:o clock|thirty|fifteen))\b/.test(w.replace(/\b(?:those|these|the|all)\s+\d+\b/g,' ')))return null;
    if(!COMMIT.test(w))return null;
    if(names&&names.some(n=>(' '+w+' ').includes(' '+n+' ')))return null;
    /* "Yes, schedule those three" must match the plan being confirmed. */
    if(expected!==undefined){
      const counts=[...w.matchAll(/\b(?:those|these|the|all|them|all of the|both)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b|\b(both)\b/g)].map(m=>NUMBERS[m[1]||m[2]]||+m[1]);
      if(counts.some(n=>n!==expected))return 'mismatch';
    }
    return 'confirm';
  }

  /* ── Names: exact words first, then a clearly closest spelling; anything else is a question. ── */
  function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
  const GENERIC=new Set(['villa','casa','can','ca','finca','la','el','the','apartment','apartamento','house']);
  function resolveName(spoken,candidates,label){
    if(label==='property'){const personal=(typeof window!=='undefined'?window:globalThis).SV_JARVIS_PERSONAL,alias=personal?.resolve(spoken,candidates);if(alias)return alias;}
    const q=norm(spoken),qWords=q.split(' ').filter(w=>w&&!GENERIC.has(w));
    if(!q)return {error:'Which '+label+'?'};
    const exact=candidates.filter(c=>norm(c.name)===q);if(exact.length===1)return {match:exact[0]};
    const need=qWords.length?qWords:q.split(' ');
    const words=candidates.filter(c=>{const cw=norm(c.name).split(' ');return need.every(w=>cw.includes(w));});
    if(words.length===1)return {match:words[0]};
    if(words.length>1)return {ambiguous:words,error:'“'+spoken+'” matches '+words.map(c=>c.name).join(' and ')+'. Which one?'};
    const key=qWords.join('');if(key.length<3)return {error:'I couldn’t find '+label+' “'+spoken+'”. Which one do you mean?',unknown:true};
    const scored=candidates.map(c=>{const ck=norm(c.name).split(' ').filter(w=>!GENERIC.has(w)).join('');return {c,d:distance(key,ck),len:Math.max(key.length,ck.length)};}).sort((a,b)=>a.d-b.d);
    const best=scored[0],next=scored[1];
    if(best&&best.d<=Math.max(1,Math.floor(best.len*0.3))&&(!next||next.d-best.d>=2))return {match:best.c,assumed:spoken};
    const close=scored.filter(s=>s.d<=Math.max(2,Math.floor(s.len*0.4))).map(s=>s.c);
    return close.length?{ambiguous:close,error:'Did you mean '+close.map(c=>c.name).join(' or ')+'?'}:{error:'I couldn’t find '+label+' “'+spoken+'” in the app. Which one do you mean?',unknown:true};
  }

  function create({getData,reference=()=>new Date().toISOString().slice(0,10),records=()=>null,persist=()=>({ok:true,cloud:'disabled'}),newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8),now=()=>Date.now()}={}){
    let plan=null,partial=null,partialAt=0,lastCommit=null,seq=0;
    const data=()=>{const d=getData()||{};return {props:d.props||[],bookings:d.bookings||[],sessions:d.sessions||[],cleaners:d.cleaners||[]};};
    const propName=(d,id)=>(d.props.find(p=>p.id===id)||{}).name||'Unknown property';
    const SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],LONG=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
    const day=v=>{const x=new Date(v+'T12:00:00Z');return LONG[x.getUTCDay()]+' '+x.getUTCDate()+' '+MON[x.getUTCMonth()];};
    const shortDay=v=>{const x=new Date(v+'T12:00:00Z');return SHORT[x.getUTCDay()]+' '+x.getUTCDate()+' '+MON[x.getUTCMonth()].slice(0,3);};
    const active=s=>s&&s.status!=='cancelled';
    const crewIds=s=>{const c=s.crew&&Array.isArray(s.crew.main)?s.crew.main.filter(m=>m.status!=='cancelled').map(m=>m.cleanerId):(s.cleanerIds||[]);return c.filter(Boolean);};
    const fingerprint=b=>JSON.stringify([b.propId,b.checkIn,b.checkOut,b.checkOutTime||'',b.status||'',b.linkedCleaningId||'']);

    /* Source booking set: the complete matched set from the last lookup, displayed options, or a date range. */
    function source(op){
      const d=data(),td=reference();
      if(op.scope==='options'||op.options&&!op.scope){
        const m=records()?.matches?.();if(!m||m.entity!=='bookings'||!m.page.length)return {question:'Which bookings do you mean? Ask me to list them first, for example next week’s bookings.'};
        const ids=op.options.map(n=>m.page[n-1]);if(ids.some(x=>!x))return {question:'I only showed '+m.page.length+' bookings. Which ones do you mean?'};
        return {ids,label:'the selected bookings',query:m.query};
      }
      if(op.scope==='results'||!op.scope&&!op.period&&!op.start&&!op.end){
        const m=records()?.matches?.();
        if(!m||m.entity!=='bookings')return {question:'Which bookings should I plan cleanings for — for example next week’s?'};
        if(m.choices)return {question:'I first need to know which of those bookings you mean.'};
        if(!m.ids.length)return {question:'That booking search found nothing, so there is nothing to plan. Which dates should I use?'};
        const q=m.query||{};let label='those bookings';
        if(q.start&&q.end)label=(q.period?q.period.replace('_',' ')+'’s ':'')+(q.dateBy==='arrival'?'arrivals':q.dateBy==='departure'?'departures':'bookings')+' ('+RECORDS.rangeLabel(q.start,q.end)+')';
        return {ids:m.ids,label,query:q,range:q.start&&q.end?{start:q.start,end:q.end}:null,partialPage:m.ids.length>m.page.length};
      }
      let start=op.start,end=op.end,name='';
      if(op.period){const p=RECORDS.period(op.period,td);start=p.start;end=p.end;name=op.period.replace('_',' ');}
      if(!start||!end)return {question:'Which dates should I use for the checkout cleanings?'};
      let prop=null;
      if(op.property){const r=resolveName(op.property,d.props,'property');if(!r.match)return {question:r.error,partialProperty:true};prop=r;}
      const ids=d.bookings.filter(b=>b.checkOut>=start&&b.checkOut<=end&&(!prop||b.propId===prop.match.id)).map(b=>String(b.id));
      return {ids,label:'checkouts '+(name?name+' (':'')+RECORDS.rangeLabel(start,end)+(name?')':'')+(prop?' at '+prop.match.name:''),range:{start,end},byCheckout:true,assumed:prop&&prop.assumed?[{spoken:prop.assumed,name:prop.match.name}]:[]};
    }

    /* Item rules mirror SV_CLEANING.checkouts and scheduleMissingCheckout: active bookings, the real checkout date and
       property, linked cleanings, unlinked same-day cleanings, same-day arrivals and cleaner day conflicts. */
    function build(src,edits){
      const d=data(),items=[],seen=new Set(),booked=new Set();
      const bookings=src.ids.map(id=>d.bookings.find(b=>String(b.id)===id)||{id,missing:true});
      bookings.sort((a,b)=>String(a.checkOut||'').localeCompare(String(b.checkOut||''))||String(a.id).localeCompare(String(b.id)));
      for(const b of bookings.slice(0,MAX_ITEMS)){
        const n=items.length+1,base={n,bookingId:String(b.id),propId:b.propId||'',property:b.propId?propName(d,b.propId):'Unknown property',guest:String(b.guestName||'').slice(0,100),date:b.checkOut||'',checkOutTime:b.checkOutTime||'10:00',time:'',fingerprint:b.missing?'':fingerprint(b),warnings:[],cleaners:[]};
        const item=(action,reason,extra={})=>items.push({...base,action,reason,...extra});
        if(b.missing){item('skip','This booking is no longer in the app.');continue;}
        if(b.status==='cancelled'){item('skip','Cancelled booking — no cleaning needed.');continue;}
        if(!isDate(b.checkOut)||!d.props.some(p=>p.id===b.propId)){item('skip','The booking’s checkout date or property is incomplete. Check it in the app.');continue;}
        const key=b.propId+'|'+b.checkOut;
        if(src.range&&!src.byCheckout&&(b.checkOut<src.range.start||b.checkOut>src.range.end))base.outside=true;
        if(edits.removed.includes(n)||edits.only&&!edits.only.includes(b.propId)||edits.removedProps.includes(b.propId)){item('left_out','Left out at your request.');continue;}
        const linked=d.sessions.find(s=>s.id===b.linkedCleaningId&&active(s));
        if(linked&&linked.propId===b.propId&&linked.date===b.checkOut){item('exists',linked.time?'At '+linked.time+'.':'',{sessionId:linked.id,time:linked.time||''});seen.add(key);continue;}
        if(linked){item('skip','Its linked cleaning is on another date or villa. Review it in the cleaning planner.',{sessionId:linked.id});continue;}
        const candidates=d.sessions.filter(s=>active(s)&&s.propId===b.propId&&s.date===b.checkOut);
        if(candidates.length===1&&!d.bookings.some(o=>o.id!==b.id&&o.linkedCleaningId===candidates[0].id)){item('link','A cleaning already exists that day'+(candidates[0].time?' at '+candidates[0].time:'')+'; I’ll link it to this booking instead of adding another.',{sessionId:candidates[0].id,time:candidates[0].time||''});seen.add(key);continue;}
        if(candidates.length){item('skip','There are already cleanings that day. Review them in the cleaning planner.');continue;}
        if(seen.has(key)){item('skip','Another booking in this plan checks out of the same villa that day; one cleaning covers both.');continue;}
        seen.add(key);
        const next=d.bookings.filter(o=>o.id!==b.id&&o.status!=='cancelled'&&o.propId===b.propId&&o.checkIn===b.checkOut)[0];
        const chosen=edits.times[n]||edits.time||'';const at=chosen||b.checkOutTime||'10:00';
        const extra={time:at,defaultTime:!chosen,sameDayArrival:next?(next.checkInTime||'16:00'):''};
        const warnings=[];let blocked='';
        if(next){warnings.push('New guests arrive the same day at '+extra.sameDayArrival+'.');if(at>=extra.sameDayArrival)blocked='The cleaning time '+at+' is not before the same-day arrival at '+extra.sameDayArrival+'. Choose an earlier time.';}
        if(chosen&&chosen<(b.checkOutTime||'10:00'))warnings.push('That is before the '+(b.checkOutTime||'10:00')+' checkout.');
        const names=edits.cleaners[n]||edits.allCleaners||[];
        const team=[];
        for(const c of names){
          const person=d.cleaners.find(x=>x.id===c);if(!person){blocked=blocked||'A chosen cleaner is no longer in the app.';continue;}
          if(d.sessions.some(s=>active(s)&&s.date===b.checkOut&&crewIds(s).includes(person.id))||booked.has(b.checkOut+'|'+person.id))blocked=blocked||person.name+' is already assigned to another cleaning that day.';
          booked.add(b.checkOut+'|'+person.id);
          team.push({id:person.id,name:person.name});
        }
        if(blocked)item('blocked',blocked,{...extra,warnings,cleaners:team});
        else item('create','',{...extra,warnings,cleaners:team});
      }
      return items;
    }
    /* Property and cleaner names next to a yes mean a change or a new scope, so they are never a bare confirmation. */
    const nameWords=()=>{const d=data();return [...new Set([...d.props,...d.cleaners].flatMap(x=>norm(x.name).split(' ')).filter(w=>w.length>2&&!GENERIC.has(w)))];};
    const actionable=p=>p.items.filter(i=>i.action==='create'||i.action==='link');
    /* Item numbers Antonio sees and hears: only the cleanings to approve (new, link, needs a change), in plan order.
       Internally items keep a stable key (n); every number from the model or screen is a shown number. */
    const listed=p=>p.items.filter(i=>i.action==='create'||i.action==='link'||i.action==='blocked');
    const shownOf=(p,i)=>listed(p).indexOf(i)+1;
    function summary(p){
      const make=p.items.filter(i=>i.action==='create'),link=p.items.filter(i=>i.action==='link'),exists=p.items.filter(i=>i.action==='exists'),skip=p.items.filter(i=>i.action==='skip'),blocked=p.items.filter(i=>i.action==='blocked'),out=p.items.filter(i=>i.action==='left_out');
      const parts=[];
      for(const a of p.assumed||[])parts.push('I’ve taken “'+a.spoken+'” to mean '+a.name+'.');
      if(!make.length&&!link.length&&!blocked.length){
        parts.push('For '+p.label+', there is nothing new to schedule.');
        if(exists.length)parts.push(exists.length===1?exists[0].property+' already has its cleaning on '+day(exists[0].date)+'.':exists.length+' checkouts already have cleanings.');
        if(skip.length)parts.push(skip.map(i=>i.property+': '+i.reason).join(' '));
        return parts.join(' ');
      }
      const line=i=>shownOf(p,i)+', '+i.property+' on '+day(i.date)+' at '+i.time+(i.cleaners.length?' with '+i.cleaners.map(c=>c.name).join(' and ')+' offered':'');
      if(make.length)parts.push('For '+p.label+', I can schedule '+(make.length===1?'one checkout cleaning':make.length+' checkout cleanings')+': '+make.map(line).join('; ')+'.');
      else parts.push('For '+p.label+':');
      if(make.some(i=>i.defaultTime))parts.push('Times default to each checkout time.');
      if(make.length&&make.every(i=>!i.cleaners.length))parts.push('No team is assigned yet.');
      const turn=make.filter(i=>i.sameDayArrival);if(turn.length)parts.push(turn.map(i=>'New guests arrive at '+i.property+' the same day at '+i.sameDayArrival+'.').join(' '));
      if(link.length)parts.push(link.map(i=>shownOf(p,i)+', '+i.property+' on '+day(i.date)+' already has a cleaning'+(i.time?' at '+i.time:'')+'; I’ll link it to the booking.').join(' '));
      if(exists.length)parts.push(exists.length===1?exists[0].property+' on '+day(exists[0].date)+' is already scheduled.':exists.length+' other checkouts are already scheduled.');
      const outside=p.items.filter(i=>i.outside&&i.action!=='left_out');if(outside.length)parts.push('Note: '+outside.map(i=>i.property+' checks out on '+day(i.date)).join(' and ')+', outside those dates.');
      if(skip.length)parts.push('Not included: '+skip.map(i=>i.property+(i.date?' on '+shortDay(i.date):'')+' — '+i.reason).join(' '));
      if(out.length)parts.push('Left out: '+out.map(i=>i.property).join(', ')+'.');
      if(blocked.length)parts.push('Needs a change first: '+blocked.map(i=>'number '+shownOf(p,i)+', '+i.reason).join(' '));
      parts.push(blocked.length?'Nothing is saved yet.':'Nothing is saved yet. Say “confirm these cleanings”, tap Confirm, or tell me what to change.');
      return parts.join(' ');
    }
    /* Spoken version: the essential facts only (what will be created, by number, plus anything needing attention).
       The full summary is shown on screen and read on request ("read it again"). */
    function brief(p){
      const make=p.items.filter(i=>i.action==='create'),link=p.items.filter(i=>i.action==='link'),blocked=p.items.filter(i=>i.action==='blocked');
      if(!make.length&&!link.length&&!blocked.length)return summary(p);
      const wd=v=>LONG[new Date(v+'T12:00:00Z').getUTCDay()],parts=[];
      for(const a of p.assumed||[])parts.push('I took “'+a.spoken+'” as '+a.name+'.');
      if(make.length&&make.length<=3)parts.push('Plan ready: '+make.map(i=>(make.length>1?shownOf(p,i)+', ':'')+i.property+' '+wd(i.date)+' at '+i.time+(i.cleaners.length?' with '+i.cleaners.map(c=>c.name).join(' and ')+' offered':'')).join('; ')+'.');
      else if(make.length)parts.push('Plan ready: '+make.length+' new checkout cleanings, '+shortDay(make[0].date)+' to '+shortDay(make[make.length-1].date)+'.');
      else parts.push('Plan ready.');
      if(link.length)parts.push(link.length===1?'One existing cleaning will be linked.':link.length+' existing cleanings will be linked.');
      const turn=make.filter(i=>i.sameDayArrival);if(turn.length)parts.push(turn.length===1?'Number '+shownOf(p,turn[0])+' has guests arriving the same day.':turn.length+' have guests arriving the same day.');
      const outside=p.items.filter(i=>i.outside&&(i.action==='create'||i.action==='link'));if(outside.length)parts.push(outside.length===1?'One checks out after those dates.':outside.length+' check out after those dates.');
      if(blocked.length)parts.push('Number '+blocked.map(i=>shownOf(p,i)).join(' and ')+' needs a change: '+blocked[0].reason);
      parts.push(blocked.length?'Nothing is saved yet.':'Details are on screen.');
      return parts.join(' ');
    }
    function publish(p,note=''){
      p.version=++seq;p.presented=false;p.heard=false;p.expires=now()+TTL;p.text=(note?note+' ':'')+summary(p);plan=p;partial=null;
      return {kind:'plan',text:p.text,spoken:(note==='Updated.'?'Updated. ':note?note+' ':'')+brief(p),plan:view()};
    }
    const freshEdits=()=>({removed:[],only:null,removedProps:[],time:'',times:{},allCleaners:null,cleaners:{}});

    function resolveCleaners(names){
      const d=data(),ids=[],notes=[];
      for(const n of names){const r=resolveName(n,d.cleaners,'cleaner');if(!r.match)return {question:r.error+' I can offer known cleaners only.'};ids.push(r.match.id);if(r.assumed)notes.push({spoken:r.assumed,name:r.match.name});}
      return {ids:[...new Set(ids)],notes};
    }
    function planProps(p,names){
      const d=data(),inPlan=[...new Set(p.items.map(i=>i.propId).filter(Boolean))].map(id=>d.props.find(x=>x.id===id)).filter(Boolean);
      const ids=[],notes=[];
      for(const n of names){
        const r=resolveName(n,inPlan,'property');
        if(!r.match){const anywhere=resolveName(n,d.props,'property');return {question:anywhere.match?anywhere.match.name+' isn’t in this plan. The plan covers '+inPlan.map(x=>x.name).join(', ')+'.':r.error};}
        ids.push(r.match.id);if(r.assumed)notes.push({spoken:r.assumed,name:r.match.name});
      }
      return {ids,notes};
    }

    /* Details already understood survive a clarification; the answer only has to supply what was missing. */
    function remember(op,drop){partial={};for(const k of ['period','start','end','property','time','cleaners','onlyProperties','removeProperties'])if(op[k]!==undefined&&!drop.includes(k))partial[k]=op[k];partialAt=now();}
    function plan_(op){
      if(partial&&now()-partialAt>TTL)partial=null;
      const merged={...(partial||{}),...op};
      const src=source(merged);
      if(src.question){remember(merged,src.partialProperty?['property']:[]);return {kind:'clarify',text:src.question,pending:copy(partial)};}
      if(!src.ids.length){partial=null;return {kind:'reply',text:'No bookings check out in '+src.label.replace(/^checkouts /,'')+', so there is nothing to schedule.'};}
      const edits=freshEdits();if(merged.time)edits.time=merged.time;
      const p={id:newId(),kind:'checkout_cleanings',label:src.label,source:{ids:src.ids,range:src.range||null,byCheckout:!!src.byCheckout},edits,assumed:src.assumed||[]};
      if(merged.cleaners){const c=resolveCleaners(merged.cleaners);if(c.question){remember(merged,['cleaners']);return {kind:'clarify',text:c.question,pending:copy(partial)};}edits.allCleaners=c.ids;p.assumed.push(...c.notes);}
      p.items=build(p.source,edits);
      if(merged.onlyProperties||merged.removeProperties){const r=revise_(p,{onlyProperties:merged.onlyProperties,removeProperties:merged.removeProperties},true);if(r)return r;}
      return publish(p);
    }
    function revise_(p,op,inPlace=false){
      const e=copy(p.edits),notes=[];
      const shown=listed(p).map(i=>i.n);
      for(const k of ['removeItems','keepItems','items'])if(op[k]){if(op[k].some(x=>!shown[x-1]))return {kind:'clarify',text:shown.length?'The plan has '+(shown.length===1?'one cleaning':'cleanings 1 to '+shown.length)+'. Which one do you mean?':'There are no cleanings left in the plan to change.'};op={...op,[k]:op[k].map(x=>shown[x-1])};}
      if(op.removeItems)e.removed=[...new Set([...e.removed,...op.removeItems])];
      if(op.keepItems)e.removed=[...new Set([...e.removed,...shown.filter(n=>!op.keepItems.includes(n))])];
      if(op.onlyProperties){const r=planProps(p,op.onlyProperties);if(r.question)return {kind:'clarify',text:r.question};e.only=e.only?e.only.filter(id=>r.ids.includes(id)):r.ids;notes.push(...r.notes);}
      if(op.removeProperties){const r=planProps(p,op.removeProperties);if(r.question)return {kind:'clarify',text:r.question};e.removedProps=[...new Set([...e.removedProps,...r.ids])];notes.push(...r.notes);}
      if(op.time){if(op.items)for(const n of op.items)e.times[n]=op.time;else{e.time=op.time;e.times={};}}
      if(op.cleaners){const c=resolveCleaners(op.cleaners);if(c.question)return {kind:'clarify',text:c.question};if(op.items)for(const n of op.items)e.cleaners[n]=c.ids;else{e.allCleaners=c.ids;e.cleaners={};}notes.push(...c.notes);}
      if(!op.removeItems&&!op.keepItems&&!op.onlyProperties&&!op.removeProperties&&!op.time&&!op.cleaners)return {kind:'clarify',text:'What should I change in the plan — a villa, an item, the time or the team?'};
      p.edits=e;p.assumed=[...(inPlace?p.assumed:[]),...notes];p.items=build(p.source,e);
      if(inPlace)return null;
      return publish(p,'Updated.');
    }
    function revise(op){
      if(!plan||plan.committed)return {kind:'clarify',text:'There’s no cleaning plan waiting to be changed. What would you like me to plan?'};
      if(now()>plan.expires){plan=null;return {kind:'clarify',text:'That plan expired, so I dropped it. Shall I prepare it again?'};}
      const next=copy(plan);return revise_(next,op);
    }
    function cancel(){const had=!!plan&&!plan.committed;plan=null;partial=null;return {kind:'reply',sound:had?'cancelled':null,text:had?'Okay, I’ve dropped that plan. Nothing was saved.':'There’s nothing pending, and nothing was saved.'};}
    /* “Read it again”: the full plan, spoken in full. */
    function repeat(){if(!plan)return {kind:'reply',text:'There’s no cleaning plan waiting.'};const r=publish(copy(plan));r.spoken=r.text.replace(/ Say “confirm these cleanings”, tap Confirm, or tell me what to change.$/,'');return r;}

    /* Commit. Requires: the current plan version, completed read-back (voice) or display (typed/screen), and Antonio's
       own explicit words (voice/typed). Rechecks every item against current records; all-or-nothing; never twice. */
    function commit({version,ownerText='',channel='voice'}={}){
      if(!plan)return lastCommit&&now()-lastCommit.at<TTL?{kind:'reply',text:'Those were already saved. Nothing more was changed.',duplicate:true}:{kind:'reply',text:'There’s no cleaning plan waiting to confirm.',refused:true};
      if(now()>plan.expires){plan=null;return {kind:'reply',text:'That plan expired, so nothing was saved. Ask me again and I’ll recheck the bookings.',refused:true};}
      if(version!==undefined&&version!==plan.version)return {kind:'reply',text:'The plan changed after that. Please review the latest plan before confirming.',refused:true};
      if(channel==='voice'&&!plan.heard)return {kind:'reply',text:'Let me finish the plan first, or use the button on screen. Nothing is saved yet.',refused:true,needsReadback:true};
      if(!plan.presented)return {kind:'reply',text:'Please review the plan on screen first. Nothing is saved yet.',refused:true};
      if(channel!=='screen'){
        const c=confirmation(ownerText,actionable(plan).length,nameWords());
        if(c==='mismatch')return {kind:'reply',text:'The plan has '+actionable(plan).length+' to save, not the number you said. Please check it and confirm again. Nothing is saved yet.',refused:true};
        if(c!=='confirm')return {kind:'reply',text:'That wasn’t a clear yes, so nothing is saved yet. The options are on screen.',refused:true};
      }
      const blocked=plan.items.filter(i=>i.action==='blocked');
      if(blocked.length)return {kind:'reply',text:'Number '+blocked.map(i=>shownOf(plan,i)).join(' and ')+' needs a change first: '+blocked[0].reason+' Nothing is saved yet.',refused:true};
      const todo=actionable(plan);
      if(!todo.length)return {kind:'reply',text:'There’s nothing new to save in that plan.',refused:true};
      /* Recheck the whole batch against current records before the first write. */
      const fresh=build(plan.source,plan.edits),key=i=>JSON.stringify([i.n,i.action,i.bookingId,i.propId,i.date,i.time,i.sessionId||'',i.fingerprint,i.cleaners.map(c=>c.id)]);
      if(fresh.length!==plan.items.length||fresh.some((i,x)=>key(i)!==key(plan.items[x]))){
        const p=copy(plan);p.items=fresh;const out=publish(p,'Something changed in the bookings or cleanings since I read the plan, so nothing was saved. Here is the updated plan.');out.stale=true;return out;
      }
      const d=getData(),sessionsBefore=d.sessions.slice(),links=[],created=[];
      try{
        for(const i of todo){
          const b=d.bookings.find(x=>String(x.id)===i.bookingId);
          if(i.action==='link'){links.push([b,b.linkedCleaningId]);b.linkedCleaningId=i.sessionId;continue;}
          const s={id:newId(),propId:i.propId,date:i.date,time:i.time,cleanerIds:i.cleaners.map(c=>c.id),status:'scheduled',note:'Checkout cleaning'};
          if(i.cleaners.length)s.crew={main:i.cleaners.map(c=>({cleanerId:c.id,name:c.name,status:'offered'})),alinaSpots:0,alinaStatus:'offered'};
          d.sessions.push(s);created.push({n:i.n,id:s.id,property:i.property,date:i.date,time:i.time});links.push([b,b.linkedCleaningId]);b.linkedCleaningId=s.id;
        }
        const saved=persist({created:created.map(c=>c.id),linked:todo.filter(i=>i.action==='link').map(i=>i.sessionId)});
        if(!saved||saved.ok!==true)throw Object.assign(Error('save'),{detail:saved&&saved.message});
        const linkedOnly=todo.filter(i=>i.action==='link');
        plan.committed=true;lastCommit={id:plan.id,version:plan.version,created,linked:linkedOnly.map(i=>({n:i.n,id:i.sessionId,property:i.property,date:i.date})),cloud:saved.cloud,at:now()};
        const done=plan;plan=null;
        const cloud=saved.cloud==='disabled'?'Saved in this preview; cloud sync is off here.':saved.cloud==='queued'?'Saved on this device and syncing to the cloud now.':'Saved.';
        const text=(created.length?'Scheduled '+(created.length===1?'one checkout cleaning':created.length+' checkout cleanings')+': '+created.map(c=>c.property+' on '+day(c.date)+' at '+c.time).join('; ')+'.':'')+(linkedOnly.length?' Linked '+linkedOnly.length+' existing cleaning'+(linkedOnly.length===1?'':'s')+'.':'')+' '+cloud+(created.length&&done.items.every(i=>!i.cleaners.length)?' The team still needs assigning.':'');
        const spoken=(created.length?'Scheduled '+(created.length===1?'one checkout cleaning':created.length+' checkout cleanings')+'.':'')+(linkedOnly.length?' Linked '+linkedOnly.length+'.':'')+(saved.cloud==='queued'?' Syncing to the cloud.':saved.cloud==='disabled'?' Saved in this preview.':'');
        return {kind:'committed',text:text.trim(),spoken:spoken.trim(),created:copy(created),linked:copy(lastCommit.linked),cloud:saved.cloud};
      }catch(e){
        d.sessions.splice(0,d.sessions.length,...sessionsBefore);for(const [b,old] of links.reverse())b.linkedCleaningId=old;
        try{persist({rollback:true});}catch{}
        return {kind:'failed',text:'The cleanings could not be saved, so nothing was changed. '+(e&&e.detail?e.detail+' ':'')+'Please try again or use the cleaning planner.'};
      }
    }

    function handle(input,{ownerText='',channel='voice'}={}){
      let op;try{op=sanitize(input);}catch(e){return {kind:'error',text:e.safe?e.message:'Invalid operation.'};}
      if(op.action==='plan_checkout_cleanings'){if(plan&&!plan.committed&&!op.scope&&!op.period&&!op.start&&!op.options&&(op.time||op.cleaners||op.onlyProperties||op.removeProperties))return revise(op);return plan_(op);}
      if(op.action==='revise')return revise(op);
      if(op.action==='cancel')return cancel();
      if(op.action==='repeat')return repeat();
      return commit({ownerText,channel,version:plan?.version});
    }
    function view(){
      if(!plan)return null;
      return copy({id:plan.id,version:plan.version,label:plan.label,text:plan.text,presented:plan.presented,heard:plan.heard,
        items:plan.items.map(i=>({n:i.n,shown:shownOf(plan,i)||null,action:i.action,property:i.property,guest:i.guest,date:i.date,time:i.time,reason:i.reason,warnings:i.warnings,cleaners:i.cleaners.map(c=>c.name),outside:!!i.outside,sameDayArrival:i.sameDayArrival||''}))});
    }
    return {handle,commit,cancel,
      /* Display/read-back completion of a specific version. A later version needs its own. */
      presented(version){if(plan&&plan.version===version)plan.presented=true;},
      heard(version){if(plan&&plan.version===version&&plan.presented)plan.heard=true;},
      unheard(){if(plan)plan.heard=false;},
      pending:()=>!!plan&&!plan.committed,view,
      confirmation:text=>confirmation(text,plan?actionable(plan).length:undefined,nameWords()),
      /* Model context: plan items by number with property, date, time and status; no guest names or IDs. */
      context:()=>({plan:plan?{version:plan.version,label:plan.label,awaitingConfirmation:true,readBack:plan.heard,items:plan.items.map(i=>({n:shownOf(plan,i)||null,property:i.property,date:i.date,time:i.time,status:i.action}))}:null,
        clarification:partial?{collected:Object.fromEntries(Object.entries(partial).filter(([k,v])=>k!=='action'&&v!==undefined))}:null,
        lastSaved:lastCommit&&now()-lastCommit.at<TTL?{cleanings:lastCommit.created.map(c=>({property:c.property,date:c.date,time:c.time})),linked:lastCommit.linked.length}:null}),
      reset(){plan=null;partial=null;lastCommit=null;}};
  }
  return Object.freeze({create,sanitize,confirmation,resolveName,ACTIONS});
});
