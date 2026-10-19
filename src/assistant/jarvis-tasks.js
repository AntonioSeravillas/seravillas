/* Natural task drafts for Jarvis. The model only proposes typed fields (wording, villa, deadline, priority, which task);
   this module grounds them in Antonio's own words and the current app records, keeps ONE pending draft, presents it,
   and writes only after an app-owned approval: his own spoken or typed "yes"/"confirm" while the current version is
   awaiting approval and has been read back (voice) or shown (typed), or the on-screen Confirm button. A model reply or
   tool argument can never approve. Every write is revalidated, saved once through the app's storage and verified. */
(function(){
  const TTL=15*60*1000,PRIORITIES=['high','medium','low'];
  const LONG=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTH_WORDS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  const DAYS={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  const ORDINAL={first:1,second:2,third:3,fourth:4,fifth:5,one:1,two:2,three:3,four:4,five:5,'1':1,'2':2,'3':3,'4':4,'5':5,'1st':1,'2nd':2,'3rd':3,'4th':4,'5th':5,last:-1};
  const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function norm(text){return String(text||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[’']/g,'').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();}
  const words=text=>norm(text).split(' ').filter(Boolean);
  function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v&&+v.slice(0,4)>=2000&&+v.slice(0,4)<=2100;}
  const addDays=(iso,n)=>new Date(Date.parse(iso+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
  const dow=iso=>new Date(iso+'T12:00:00Z').getUTCDay();
  const two=n=>String(n).padStart(2,'0');
  function dayLabel(iso){const d=new Date(iso+'T12:00:00Z');return LONG[d.getUTCDay()]+' '+d.getUTCDate()+' '+MONTHS[d.getUTCMonth()];}
  function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
  const near=(a,b)=>a===b||a.length>3&&b.length>3&&distance(a,b)<=Math.max(1,Math.floor(Math.max(a.length,b.length)*0.25));
  const STOP=new Set(['a','an','the','to','for','at','in','on','of','and','or','is','it','be','by','with','my','me','please','task','tasks','villa','casa','can','ca','finca','la','el','house','apartment','that','this','up','do','add','new','create','make','put','set','change','update','jarvis']);

  /* ── Dates from Antonio's own words, resolved against the app's date. ──
     Returns {iso}, {clear:true} (remove the deadline), {vague:true} (date words the app can't resolve itself), or null. */
  function spokenDate(text,ref){
    const raw=String(text||''),w=' '+norm(raw)+' ';
    if(/\b(?:no|without|remove|removed|drop|clear|delete|take off|take away|get rid of|scrap|forget)\b(?: the| a| its| that)? (?:deadline|due date|date)\b|\bno (?:deadline|due date)\b|\b(?:deadline|due date) (?:off|removed)\b|\bdoesnt need a (?:deadline|date)\b/.test(w))return {clear:true};
    const found=[];
    for(const m of raw.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))if(validDate(m[0]))found.push({at:m.index,iso:m[0]});
    const pos=re=>{const out=[];for(const m of w.matchAll(re))out.push(m);return out;};
    for(const m of pos(/\b(the )?day after tomorrow\b/g))found.push({at:m.index,iso:addDays(ref,2)});
    for(const m of pos(/\b(?<!after )tomorrow\b/g))found.push({at:m.index,iso:addDays(ref,1)});
    for(const m of pos(/\b(?:today|tonight)\b/g))found.push({at:m.index,iso:ref});
    for(const m of pos(/\b(?:(this|next|on|by|for|until|till|before) )?(?:(coming) )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)){
      const target=DAYS[m[3]],now=dow(ref),ahead=(target-now+7)%7;
      if(m[1]==='next'){const monday=addDays(ref,-((now+6)%7));found.push({at:m.index,iso:addDays(monday,7+(target+6)%7)});}
      else if(m[1]==='this'){const iso=addDays(ref,ahead);found.push(ahead===0||(target+6)%7>=(now+6)%7?{at:m.index,iso}:{at:m.index,vague:true});}
      else found.push({at:m.index,iso:addDays(ref,ahead||7)});
    }
    const monthDay=(day,month,year,at)=>{const y=year||+ref.slice(0,4);let iso=y+'-'+two(month)+'-'+two(day);if(!validDate(iso))return found.push({at,vague:true});if(!year&&iso<ref)iso=(y+1)+'-'+two(month)+'-'+two(day);found.push({at,iso});};
    const MON='(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
    for(const m of pos(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?'+MON+'(?: (20\\d{2}))?\\b','g')))monthDay(+m[1],MONTH_WORDS[m[2]],m[3]?+m[3]:0,m.index);
    for(const m of pos(new RegExp('\\b'+MON+' (\\d{1,2})(?:st|nd|rd|th)?(?: (20\\d{2}))?\\b','g')))if(!found.some(f=>Math.abs(f.at-m.index)<12))monthDay(+m[2],MONTH_WORDS[m[1]],m[3]?+m[3]:0,m.index);
    for(const m of pos(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/g))if(!found.some(f=>Math.abs(f.at-m.index)<8)){const d=+m[1],y=+ref.slice(0,4),mo=+ref.slice(5,7);let iso=y+'-'+two(mo)+'-'+two(d);if(iso<ref){const n=mo===12?[y+1,1]:[y,mo+1];iso=n[0]+'-'+two(n[1])+'-'+two(d);}found.push(validDate(iso)?{at:m.index,iso}:{at:m.index,vague:true});}
    if(found.length)return found.sort((a,b)=>a.at-b.at).at(-1);
    if(/\b(?:week|weekend|month|end of|in (?:a|one|two|three|four|five|\d+) (?:days?|weeks?)|fortnight|deadline|due|asap|soon|later)\b/.test(w))return {vague:true};
    return null;
  }
  /* Priority from his own words: an explicit level wins; "priority" without a level lets the model's level stand. */
  function spokenPriority(text){
    const w=' '+norm(text)+' ';
    if(/\b(?:not|isnt|no) (?:urgent|important|a priority|high priority)\b|\bno rush\b|\blow(?:er)? priority\b|\bpriority (?:to |of |is )?low\b|\bmake it low\b|\bwhenever\b/.test(w))return 'low';
    if(/\b(?:medium|normal|standard|regular) priority\b|\bpriority (?:to |of |is )?(?:medium|normal)\b|\bmake it (?:medium|normal)\b/.test(w))return 'medium';
    if(/\b(?:high|top|highest|higher) priority\b|\bpriority (?:to |of |is )?high\b|\burgent(?:ly)?\b|\bimportant\b|\basap\b|\bcritical\b|\bmake it high\b/.test(w))return 'high';
    return /\bpriority\b/.test(w)?'model':null;
  }
  /* A field the model proposes must have support in his recent words, so nothing is taken from model knowledge alone. */
  function grounded(value,turns){
    const said=turns.flatMap(t=>words(t)),need=words(value).filter(x=>!STOP.has(x));
    if(!need.length)return false;return need.some(n=>said.some(s=>near(s,n)));
  }
  const REFERENCE=/^(?:it|that|this|that one|this one|that task|this task|the task|the same task|same task|selected|the selected task|the one|the last one|current|the current task)$/;

  /* ── Approval words, decided here from his own words only. Everything in the utterance must be a confirmation (or a
     cancellation) phrase plus fillers; anything left over — a change, a "but", a question, a quote, a negation, someone
     else's words — is not approval and goes to the conversation instead. ── */
  const FILLER=new Set(['um','uh','er','erm','hmm','hm','ah','oh','well','so','jarvis','hey','please','thanks','thank','you','sir','mate','then','now','just','great','lovely','brilliant','cheers','and']);
  const CONFIRM_STRONG=['go ahead','go for it','do it','do that','sounds good','looks good','thats right','that is right','thats correct','that is correct','thats fine','that is fine','thats good','that works','please do','save it','save that','save this','save the task','save the change','save the changes','add it','add that','add the task','create it','create the task','apply it','apply that','apply the change','apply the changes','make the change','make the changes','confirm it','confirm that','confirm the task','confirm the change','confirmed','confirm','approve it','approve the task','approved','approve','yes','yeah','yep','yup','yea','sure','correct','perfect','absolutely','definitely','of course','exactly','affirmative'];
  const CONFIRM_SOFT=['ok','okay','alright','all right','right','fine','good'];
  const CANCEL=['no thanks','no thank you','not now','dont save it','dont save that','dont save','do not save','dont add it','dont bother','forget it','forget about it','forget that','forget the task','never mind','nevermind','cancel it','cancel that','cancel the task','cancel the change','cancel','discard it','discard that','discard the task','discard','scrap it','scrap that','leave it','drop it','no','nope','nah'];
  const EXPLICIT=/\b(?:save|add|create|apply|make|confirm|approve)\b.*\b(?:it|that|this|task|change|changes)\b|\bconfirm(?:ed)?\b|\bapprove(?:d)?\b/;
  function approval(text){
    const raw=String(text||'').trim();if(!raw||raw.length>120||/["“”«»]/.test(raw)||/\?\s*$/.test(raw))return null;
    let rest=' '+norm(raw)+' ';if(rest.split(' ').filter(Boolean).length>10)return null;
    const hit={strong:false,soft:false,cancel:false};
    for(const [list,key] of [[CANCEL,'cancel'],[CONFIRM_STRONG,'strong'],[CONFIRM_SOFT,'soft']])for(const p of [...list].sort((a,b)=>b.length-a.length)){const re=new RegExp(' '+p+'(?= )','g');if(re.test(rest)){hit[key]=true;rest=rest.replace(re,' ');}}
    if(rest.split(' ').some(x=>x&&!FILLER.has(x)))return null;
    if(hit.cancel)return hit.strong?{verdict:'unclear'}:{verdict:'cancel'};
    if(hit.strong||hit.soft)return {verdict:'confirm',explicit:EXPLICIT.test(norm(raw))};
    return null;
  }

  function create({getData,reference=()=>new Date().toISOString().slice(0,10),persist=()=>({ok:true,cloud:'disabled'}),newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8),now=()=>Date.now(),resolveProperty=null,matches=()=>null}={}){
    let draft=null,seq=0,focusId='',lastCommit=null,busy=false;
    const data=()=>{const d=getData()||{};return {props:d.props||[],tasks:d.tasks||[]};};
    const propName=id=>(data().props.find(p=>String(p.id)===String(id))||{}).name||'';
    const priorityOf=t=>PRIORITIES.includes(t.priority)?t.priority:t.urgent?'high':'low';
    const fieldsOf=t=>({text:String(t.text||''),propId:String(t.propId||''),dueDate:validDate(t.dueDate)?t.dueDate:'',priority:priorityOf(t)});
    const openTasks=()=>data().tasks.filter(t=>!t.done&&t.status!=='done');
    function findProperty(spoken){
      const props=data().props;if(resolveProperty)return resolveProperty(spoken,props);
      const q=norm(spoken),exact=props.filter(p=>norm(p.name)===q);return exact.length===1?{match:exact[0]}:{error:'Which villa do you mean?'};
    }
    /* ── Which existing task: "it" is the task in focus; words match open tasks; several matches become a choice. ── */
    function target(o){
      const ref=norm(o.task||'');
      if(Number.isInteger(o.option)){const pool=draft?.choices||(matches()?.entity==='tasks'?matches().page:null);if(!pool)return {ask:'Which task do you mean?'};const id=pool[o.option===-1?pool.length-1:o.option-1];const t=openTasks().find(x=>x.id===id);return t?{task:t}:{ask:'I don’t have that option. Which task do you mean?'};}
      if(!ref||REFERENCE.test(ref)){
        const m=matches();const shown=m?.entity==='tasks'&&m.page?.length===1?m.page[0]:'';
        const id=draft?.type==='update'?draft.taskId:focusId||shown;const t=id&&openTasks().find(x=>x.id===id);
        return t?{task:t}:{ask:'Which task would you like to change?'};
      }
      const tasks=openTasks(),exact=tasks.filter(t=>norm(t.text)===ref);if(exact.length===1)return {task:exact[0]};
      const need=words(ref).filter(x=>!STOP.has(x));if(!need.length)return {ask:'Which task would you like to change?'};
      const scored=tasks.map(t=>{const tw=words(t.text);return {t,score:need.filter(n=>tw.some(x=>near(x,n))).length};}).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);
      const best=scored.filter(s=>s.score===scored[0]?.score&&s.score>=Math.min(need.length,Math.max(1,Math.ceil(need.length*0.6))));
      if(best.length===1)return {task:best[0].t};
      if(best.length>1)return {choose:best.slice(0,5).map(s=>s.t)};
      return {ask:'I couldn’t find an open task like “'+String(o.task).slice(0,60)+'”. Which task do you mean?'};
    }
    function apply(d,o,turns){
      const p=d.proposed,latest=turns.at(-1)||'';
      if(o.text!==undefined&&o.text.trim()){const t=o.text.trim().replace(/\s+/g,' ').slice(0,300);if(!grounded(t,turns))return {ask:'What should the task say?'};p.text=t[0].toUpperCase()+t.slice(1);}
      if(o.property!==undefined){
        if(!o.property.trim()){if(/\b(?:no|without|remove|any|not for|not at|drop|clear)\b.*\b(?:villa|property|house|place)\b|\bgeneral\b/.test(norm(latest)))p.propId='';}
        else if(grounded(o.property,turns)||aliasSaid(o.property,turns)||/\b(?:there|that villa|this villa|same villa|that property|that house)\b/.test(norm(turns.join(' ')))){
          const r=findProperty(o.property);
          if(r?.match){p.propId=String(r.match.id);if(r.assumed&&norm(r.assumed)!==norm(r.match.name))d.notes.push('I took “'+r.assumed+'” as '+r.match.name+'.');}
          else return {ask:r?.ambiguous?'Which villa: '+r.ambiguous.map(x=>x.name).join(' or ')+'?':'Which villa do you mean? I couldn’t find “'+o.property.slice(0,60)+'”.'};
        }
      }
      /* Deadline: his words decide when the app can read them; the model's date stands only for vaguer phrasing. */
      let said=null;for(const t of [...turns].reverse()){said=spokenDate(t,reference());if(said)break;}
      if(said?.clear)p.dueDate='';
      else if(said?.iso)p.dueDate=said.iso;
      else if(said?.vague&&o.dueDate!==undefined){if(!o.dueDate)p.dueDate='';else if(validDate(o.dueDate))p.dueDate=o.dueDate;else return {ask:'What date should it be due?'};}
      else if(said?.vague)return {ask:'Which date should it be due?'};
      if(p.dueDate&&p.dueDate<reference()&&p.dueDate!==(d.current?.dueDate||''))return {ask:dayLabel(p.dueDate)+' has already passed. What date should it be due?'};
      let level=null;for(const t of [...turns].reverse()){level=spokenPriority(t);if(level)break;}
      if(level&&level!=='model')p.priority=level;else if(level==='model'&&PRIORITIES.includes(o.priority))p.priority=o.priority;
      return null;
    }
    /* Saved villa nicknames count as his words for the villa they name. */
    function aliasSaid(spoken,turns){const r=findProperty(spoken);if(!r?.match)return false;const personal=(typeof window!=='undefined'?window:globalThis).SV_JARVIS_PERSONAL;return turns.some(t=>String(personal?.resolve?.(t,data().props,{phrase:true})?.match?.id||'')===String(r.match.id));}
    function summary(d){
      const p=d.proposed,place=p.propId?propName(p.propId):'',due=p.dueDate?'due '+dayLabel(p.dueDate):'no deadline';
      if(d.type==='create')return '“'+p.text+'”'+(place?' at '+place:'')+', '+due+', '+p.priority+' priority';
      const c=d.current,changes=[];
      if(p.text!==c.text)changes.push('wording “'+p.text+'”');
      if(p.propId!==c.propId)changes.push(p.propId?'villa '+place:'no villa');
      if(p.dueDate!==c.dueDate)changes.push(p.dueDate?'deadline '+dayLabel(p.dueDate):'no deadline');
      if(p.priority!==c.priority)changes.push(p.priority+' priority');
      return '“'+c.text+'”: '+changes.join(', ');
    }
    function present(d,lead=''){
      d.version=++seq;d.stage='review';d.presented=false;d.heard=false;d.asked=true;d.expires=now()+TTL;d.question='';d.choices=null;d.pendingOp=null;d.pendingTurns=null;draft=d;
      const notes=(d.notes||[]).join(' '),q=d.type==='create'?'Shall I save it?':'Shall I make the change?';
      const text=(lead?lead+' ':'')+(notes?notes+' ':'')+(d.type==='create'?'New task: ':'Change ')+summary(d)+'. '+q;
      return {kind:'review',version:d.version,text,spoken:text};
    }
    function ask(d,question){d.version=++seq;d.stage='question';d.question=question;d.choices=null;d.presented=d.heard=false;d.asked=false;d.expires=now()+TTL;draft=d;return {kind:'question',text:question};}
    /* Several open tasks match: list them and hold the requested change until he picks one. */
    function choose(list,op,turns){
      draft={type:'update',stage:'choose',current:null,proposed:null,notes:[],choices:list.map(t=>t.id),pendingOp:copy(op),pendingTurns:turns.slice(-3),version:++seq,presented:false,heard:false,asked:false,expires:now()+TTL};
      draft.question='More than one task matches: '+list.map((t,i)=>(i+1)+'. '+t.text+(t.propId&&propName(t.propId)?' ('+propName(t.propId)+')':'')).join('; ')+'. Which one?';
      return {kind:'question',text:draft.question};
    }
    function same(a,b){return a.text===b.text&&a.propId===b.propId&&a.dueDate===b.dueDate&&a.priority===b.priority;}
    function updateDraft(t){const c=fieldsOf(t);return {type:'update',taskId:t.id,snapshot:JSON.stringify(t),current:c,proposed:{...c},notes:[]};}
    /* Applies each requested change in order, then presents the draft or asks the one missing detail. */
    function build(d,steps,{lead=''}={}){
      for(const [op,turns] of steps){if(!op)continue;const problem=apply(d,op,turns);if(problem)return ask(d,problem.ask);}
      if(!d.proposed.text)return ask(d,'What should the task say?');
      if(d.type==='update'&&same(d.proposed,d.current)){if(draft&&draft.taskId===d.taskId)draft=null;return {kind:'reply',text:'What would you like to change about “'+d.current.text+'”?'};}
      if(d.type==='create'&&openTasks().some(t=>norm(t.text)===norm(d.proposed.text)&&String(t.propId||'')===d.proposed.propId))d.notes.push('There’s already an open task with that wording.');
      return present(d,lead);
    }
    const FIELDS=['text','property','dueDate','priority'];
    const only=o=>Object.fromEntries(FIELDS.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));

    /* Typed operation from the model. turns: his recent own words, newest last. */
    function handle(o,{turns=[]}={}){
      if(!o||typeof o!=='object')return {kind:'reply',text:'I didn’t catch the task details. Nothing was saved.'};
      /* The same bounded shape the server accepts: known fields only, short strings, a listed option. */
      if(Object.keys(o).some(k=>!['action','task','option','text','property','dueDate','priority'].includes(k))||['action','task','text','property','dueDate','priority'].some(k=>o[k]!==undefined&&(typeof o[k]!=='string'||o[k].length>300))||o.option!==undefined&&!(Number.isInteger(o.option)&&(o.option===-1||o.option>=1&&o.option<=5)))return {kind:'reply',text:'That task request isn’t one I can prepare. Nothing was saved.',refused:true};
      if(draft&&now()>draft.expires)draft=null;
      if(o.action==='cancel')return cancel();
      if(o.action==='repeat'){if(!draft)return {kind:'reply',text:'There’s no task waiting.'};return draft.stage==='review'?present(draft):{kind:'question',text:draft.question};}
      if(!['create','update','revise'].includes(o.action))return {kind:'reply',text:'I can prepare a new task or change an existing one. Nothing was saved.',refused:true};
      if(draft?.stage==='choose'&&o.action!=='create'&&(Number.isInteger(o.option)||o.task)){
        const r=target(o),held=draft;
        if(r.task){focusId=r.task.id;return build(updateDraft(r.task),[[held.pendingOp,held.pendingTurns||[]],[only(o),turns]]);}
        if(r.choose)return choose(r.choose,{...held.pendingOp,...only(o)},turns);
        return {kind:'question',text:r.ask};
      }
      if(o.action==='create')return build({type:'create',current:null,proposed:{text:'',propId:'',dueDate:'',priority:'medium'},notes:[]},[[o,turns]]);
      if(o.action==='revise'){
        if(!draft)return {kind:'question',text:'Which task would you like to change?'};
        if(draft.stage==='choose')return {kind:'question',text:draft.question};
        const d=copy(draft);d.notes=[];return build(d,[[o,turns]],{lead:draft.stage==='review'?'Updated.':''});
      }
      const r=target(o);
      if(r.choose)return choose(r.choose,only(o),turns);
      if(r.ask)return {kind:'question',text:r.ask};
      focusId=r.task.id;return build(updateDraft(r.task),[[o,turns]]);
    }
    /* Answer to "which one?": "the second one", "number two", "2". */
    function choice(text){
      if(draft?.stage!=='choose')return null;
      const m=norm(text).match(/^(?:(?:its|it s|its the|the) )?(?:number |option )?(first|second|third|fourth|fifth|last|one|two|three|four|five|[1-5]|1st|2nd|3rd|4th|5th)(?: one)?(?: please)?$/);
      if(!m)return null;
      return handle({action:'update',option:ORDINAL[m[1]]},{turns:[]});
    }
    function cancel(){if(!draft)return {kind:'reply',text:'There’s no task waiting.'};draft=null;return {kind:'cancelled',text:'Okay, cancelled. Nothing was saved.'};}
    /* Approval verdict for his own words: only while the current draft is awaiting approval. */
    function confirmation(text){
      if(!draft||now()>draft.expires)return null;
      const a=approval(text);if(!a)return null;
      if(a.verdict==='cancel')return a;
      if(draft.stage!=='review')return null;
      return a;
    }
    function reask(){if(!draft||draft.stage!=='review')return null;draft.asked=true;const text='Just to check: '+(draft.type==='create'?'save the new task ':'change ')+summary(draft)+'?';return {kind:'review',version:draft.version,text,spoken:text,again:true};}
    function commit({version,ownerText='',channel='voice'}={}){
      if(!draft){
        if(lastCommit&&now()-lastCommit.at<TTL)return lastCommit.uncertain?{kind:'reply',text:'I won’t try that again: the last save couldn’t be verified. Please check Tasks first.',duplicate:true}:{kind:'reply',text:'That’s already saved. Nothing more was changed.',duplicate:true};
        return {kind:'reply',text:'There’s no task waiting for approval.',refused:true};
      }
      if(now()>draft.expires){draft=null;return {kind:'reply',text:'That task draft expired, so nothing was saved. Ask me again when you’re ready.',refused:true};}
      if(draft.stage!=='review')return {kind:'question',text:draft.question,refused:true};
      if(version!==undefined&&version!==draft.version)return present(draft,'The task changed after that, so nothing was saved. The latest version:');
      if(channel!=='screen'){
        const a=approval(ownerText);if(a?.verdict!=='confirm')return {kind:'reply',text:'That wasn’t a clear yes, so nothing is saved yet.',refused:true};
        if(channel==='voice'&&!draft.heard)return present(draft,'Before I save anything, here are the details.');
        if(!draft.presented)return present(draft);
        if(!draft.asked&&!a.explicit)return reask();
      }else if(!draft.presented)return present(draft);
      if(busy)return {kind:'reply',text:'I’m already saving that task.',duplicate:true};
      busy=true;
      try{
        const d=draft,p=d.proposed,props=data().props;
        if(!p.text||p.text.length>300)return ask(d,'What should the task say?');
        if(p.propId&&!props.some(x=>String(x.id)===p.propId)){p.propId='';return present(d,'That villa is no longer in the app, so I removed it.');}
        if(p.dueDate&&!validDate(p.dueDate))return ask(d,'What date should it be due?');
        if(!PRIORITIES.includes(p.priority))p.priority='medium';
        const store=getData();
        let task,change;
        if(d.type==='create'){
          task={id:newId(),text:p.text,propId:p.propId,priority:p.priority,urgent:p.priority==='high',done:false,pinned:false,inFocus:false,note:'',dueDate:p.dueDate,timeEst:'',photo:null,completedAt:'',createdAt:reference(),type:'ops',projectId:''};
          if(!Array.isArray(store.tasks))store.tasks=[];store.tasks.push(task);change={kind:'create',id:task.id,expect:copy(task)};
        }else{
          task=(store.tasks||[]).find(t=>t.id===d.taskId);
          if(!task||task.done){draft=null;return {kind:'reply',text:'That task is no longer open, so nothing was changed.',refused:true,stale:true};}
          if(JSON.stringify(task)!==d.snapshot){const fresh=updateDraft(task),keep={};for(const k of ['text','propId','dueDate','priority'])if(p[k]!==d.current[k])keep[k]=p[k];Object.assign(fresh.proposed,keep);if(same(fresh.proposed,fresh.current)){draft=null;return {kind:'reply',text:'That task was already changed elsewhere to match. Nothing more was needed.',stale:true};}return Object.assign(present(fresh,'That task changed since I read it, so nothing was saved. Here it is with your change on the current version.'),{stale:true});}
          task.text=p.text;task.propId=p.propId;task.dueDate=p.dueDate;task.priority=p.priority;task.urgent=p.priority==='high';change={kind:'update',id:task.id,expect:copy(task)};
        }
        draft=null;focusId=task.id;
        let saved;try{saved=persist(change)||{ok:false};}catch{saved={ok:false};}
        lastCommit={at:now(),id:task.id,uncertain:!saved.ok};
        if(!saved.ok)return {kind:'uncertain',taskId:task.id,text:'I couldn’t verify that the task was stored on this device. It may show in this session, but please check Tasks before asking again. I won’t retry it automatically.'};
        const place=task.propId?' at '+propName(task.propId):'',due=task.dueDate?', due '+dayLabel(task.dueDate):'',sync=saved.cloud==='queued'?' Saved on this device; cloud sync is on its way.':saved.cloud==='disabled'?' Saved on this device.':'';
        return {kind:'saved',taskId:task.id,cloud:saved.cloud,text:(d.type==='create'?'Done. “'+task.text+'”'+place+due+', '+task.priority+' priority, is on your task list.':'Done. “'+task.text+'” is updated'+place+due+', '+task.priority+' priority.')+sync,spoken:d.type==='create'?'Done, that’s on your task list.'+(saved.cloud==='queued'?' Cloud sync is on its way.':''):'Done, the task is updated.'+(saved.cloud==='queued'?' Cloud sync is on its way.':'')};
      }finally{busy=false;}
    }
    function view(){
      if(!draft)return null;const p=draft.proposed,c=draft.current;
      return copy({version:draft.version,type:draft.type,stage:draft.stage,question:draft.question,presented:draft.presented,heard:draft.heard,
        fields:p?[['Task',p.text,c?.text],['Villa',p.propId?propName(p.propId):'None',c?(c.propId?propName(c.propId):'None'):undefined],['Deadline',p.dueDate?dayLabel(p.dueDate):'No deadline',c?(c.dueDate?dayLabel(c.dueDate):'No deadline'):undefined],['Priority',p.priority[0].toUpperCase()+p.priority.slice(1),c?c.priority[0].toUpperCase()+c.priority.slice(1):undefined]].map(([label,value,was])=>({label,value,was:was!==undefined&&was!==value?was:undefined})):[],
        choices:draft.choices?draft.choices.map(id=>(openTasks().find(t=>t.id===id)||{}).text||''):null,notes:draft.notes||[]});
    }
    return {handle,choice,cancel,confirmation,reask,commit,view,
      pending:()=>!!draft&&now()<=draft.expires,
      awaiting:()=>!!draft&&draft.stage==='review'&&now()<=draft.expires,
      presented(version){if(draft&&draft.version===version)draft.presented=true;},
      heard(version){if(draft&&draft.version===version&&draft.presented)draft.heard=true;},
      unheard(){if(draft){draft.heard=false;draft.presented=false;}},
      /* Another answer was given after the approval question: a bare "yes" then needs a short re-check. */
      aside(){if(draft)draft.asked=false;},
      asked:()=>!!draft&&draft.asked,
      /* A save in the last two minutes: a repeated yes is answered as a duplicate. */
      recent:()=>!!lastCommit&&now()-lastCommit.at<120000,
      focus(id){if(id)focusId=String(id);},
      reset(){draft=null;focusId='';lastCommit=null;busy=false;},
      /* For the model: the pending fields and stage only. It has no way to approve. */
      context(){if(!draft||now()>draft.expires)return null;const p=draft.proposed;return {type:draft.type,stage:draft.stage,awaitingApproval:draft.stage==='review',question:draft.question||'',target:draft.current?.text||'',text:p?.text||'',property:p?.propId?propName(p.propId):'',dueDate:p?.dueDate||'',priority:p?.priority||'',choices:draft.choices?draft.choices.map(id=>(openTasks().find(t=>t.id===id)||{}).text||''):null};}};
  }
  const api=Object.freeze({create,approval,spokenDate,spokenPriority,validDate});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.SV_JARVIS_TASKS=api;
})();
