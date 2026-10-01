/* ══════════════════════════════════════════════════════════════════
   VOICE COMMAND MVP  (local-first, no backend / no API keys)
   ------------------------------------------------------------------
   Flow: openVoiceCommandModal -> (speak or type) ->
         handleVoiceCommandTranscript -> parseVoiceCommandLocal ->
         showVoiceActionPreview -> (confirm) -> executeVoiceAction.
   The local parser (parseVoiceCommandLocal) is intentionally isolated
   so it can later be swapped for a Claude backend parser without
   touching the UI or the executors. Nothing executes without an
   explicit Confirm tap.
   ══════════════════════════════════════════════════════════════════ */

/* Strict property alias map — exact word-boundary matching ONLY.
   Villa Mar must never match Villa Marjals. */
const VOICE_PROP_ALIASES = [
  ['Villa Marjals',  ['villa marjals','villamarjals','can marjals','canmarjals','marjals']],
  ['Villa Diagonal', ['villa diagonal','villadiagonal','diagonal']],
  ['Villa Mar',      ['villa mar','villamar','mar']],
  ['La Forca',       ['la forca','laforca','forca']],
  ['Can Vallori',    ['can vallori','canvallori','vallori']]
];

function normalizePropName(name){return String(name||'').toLowerCase().trim();}

function _voiceEscRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

/* Normalize free text for property matching:
   lowercase, strip punctuation, collapse whitespace. */
function normalizeVoiceText(s){
  return String(s||'')
    .toLowerCase()
    .replace(/[^\w\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

/* True if `seq` (array of tokens) appears as a consecutive run inside `tokens`. */
function _voiceTokenSeq(tokens,seq){
  for(let i=0;i+seq.length<=tokens.length;i++){
    let ok=true;
    for(let j=0;j<seq.length;j++){if(tokens[i+j]!==seq[j]){ok=false;break;}}
    if(ok)return true;
  }
  return false;
}

/* Build a flat alias list sorted longest/most-specific first.
   So "villa marjals" is tested before "villa mar", and multi-word
   aliases before single tokens like "mar". */
const _VOICE_ALIAS_PAIRS=(function(){
  const pairs=[];
  for(const [canon,aliases] of VOICE_PROP_ALIASES){
    for(const a of aliases){
      const an=normalizeVoiceText(a);
      pairs.push({canon:canon,alias:an,words:an.split(' ')});
    }
  }
  pairs.sort(function(x,y){return (y.words.length-x.words.length)||(y.alias.length-x.alias.length);});
  return pairs;
})();

/* STRICT property resolver — explicit aliases only, no loose substring.
   Multi-word aliases match as a consecutive token run; single-word aliases
   ("mar") match ONLY as a standalone normalized token, never inside another
   word ("marjals" / "villamar"). Returns {id,name,found,alias} or null. */
function resolveVoiceProperty(text){
  const tokens=normalizeVoiceText(text).split(' ').filter(Boolean);
  if(!tokens.length)return null;
  for(const p of _VOICE_ALIAS_PAIRS){
    const hit=p.words.length>1?_voiceTokenSeq(tokens,p.words):tokens.indexOf(p.alias)>=0;
    if(hit){
      const prop=D.props.find(pr=>normalizeVoiceText(pr.name)===normalizeVoiceText(p.canon));
      return prop?{id:prop.id,name:prop.name,found:true,alias:p.alias}
                 :{id:'',name:p.canon,found:false,alias:p.alias};
    }
  }
  return null;
}

/* Back-compat wrapper: all voice parsers go through the strict resolver. */
function voiceFindProperty(text){return resolveVoiceProperty(text);}

/* Remove any matched property alias phrases from a string, preserving the
   rest of the original casing. Handles spaced and compact forms. */
function voiceStripPropAliases(text){
  let out=text;
  for(const [,aliases] of VOICE_PROP_ALIASES){
    for(const a of aliases){
      out=out.replace(new RegExp('\\b'+_voiceEscRe(a)+'\\b','ig'),' ');
    }
  }
  return out.replace(/\s{2,}/g,' ').trim();
}

function voiceStripLead(s){
  return String(s||'').replace(/^\s*(please\s+)?(add|create|new|log|make)\s+/i,'').trim();
}

/* Month names -> number. "mar" deliberately excluded to protect Villa Mar. */
const VOICE_MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,
  august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};

/* Find date phrases ("July 10" or "12 August"); returns ISO dates in order.
   The month part must be a known month name, so a non-month word (e.g. a
   property name) can never swallow the adjacent day number. */
function voiceParseDates(text){
  const monAlt=Object.keys(VOICE_MONTHS).join('|');
  const re=new RegExp('\\b(?:(\\d{1,2})\\s+('+monAlt+')|('+monAlt+')\\s+(\\d{1,2}))\\b','gi');
  const yr=parseInt(today().slice(0,4));
  const out=[];let m;
  while((m=re.exec(text))){
    let day,mon;
    if(m[1]){day=parseInt(m[1]);mon=m[2].toLowerCase();}
    else{day=parseInt(m[4]);mon=m[3].toLowerCase();}
    const mn=VOICE_MONTHS[mon];
    if(mn&&day>=1&&day<=31){
      out.push(yr+'-'+pad(mn)+'-'+pad(day));
    }
  }
  return out;
}

/* Detect "today" / "tomorrow" for tasks. */
function voiceParseDueDate(text){
  const l=text.toLowerCase();
  if(/\btomorrow\b/.test(l))return{date:addDays(today(),1),label:'tomorrow'};
  if(/\btoday\b/.test(l))return{date:today(),label:'today'};
  return{date:'',label:''};
}

/* Text after the first colon, else the whole string. */
function voiceAfterColon(text){
  const i=text.indexOf(':');
  return i>=0?text.slice(i+1).trim():'';
}

/* ── LOCAL PARSER ──
   Replaceable later by a Claude backend call returning the same shape. */
function parseVoiceCommandLocal(text){
  const raw=String(text||'').trim();
  const blank=()=>({type:'unsupported',confidence:0,
    summary:'I could not understand that command.',missingFields:[],
    payload:{originalText:raw},confirmationRequired:true});
  if(!raw)return blank();

  const lower=raw.toLowerCase();
  // Intent = earliest matching keyword (booking before contact/issue/note/task).
  const intents=[
    ['create_booking',['booking']],
    ['create_contact',['contact']],
    ['create_issue',['issue']],
    ['create_note',['note']],
    ['create_task',['task']]
  ];
  let type=null,bestIdx=Infinity;
  for(const [t,kws] of intents){
    for(const kw of kws){
      const idx=lower.search(new RegExp('\\b'+kw+'\\b'));
      if(idx>=0&&idx<bestIdx){bestIdx=idx;type=t;}
    }
  }
  if(!type)return blank();

  const prop=voiceFindProperty(raw);
  const colonBody=voiceAfterColon(raw);

  if(type==='create_task'){
    const due=voiceParseDueDate(raw);
    let body=colonBody;
    if(!body){
      body=voiceStripLead(raw).replace(/^task\b/i,'').trim();
      body=body.replace(/\bfor\s+(today|tomorrow)\b/ig,' ').replace(/\b(today|tomorrow)\b/ig,' ');
      body=voiceStripPropAliases(body);
      body=body.replace(/^\s*(for|the)\s+/i,'').replace(/\s{2,}/g,' ').trim();
    }
    const missing=body?[]:['task text'];
    return {
      type:missing.length?'needs_clarification':'create_task',
      confidence:body?(due.date||prop?0.8:0.7):0.3,
      summary:body?('Create task: "'+body+'"'+(due.label?' (due '+due.label+')':'')+(prop?' · '+prop.name:'')):'Task text is missing.',
      missingFields:missing,
      payload:{text:body,dueDate:due.date,propId:prop&&prop.found?prop.id:'',propName:prop?prop.name:''},
      confirmationRequired:true
    };
  }

  if(type==='create_issue'){
    let title=colonBody;
    if(!title){
      title=voiceStripLead(raw).replace(/^issue\b/i,'').trim();
      title=voiceStripPropAliases(title);
      title=title.replace(/^\s*(for|at|the)\s+/i,'').replace(/\s{2,}/g,' ').trim();
    }
    const missing=title?[]:['issue description'];
    return {
      type:missing.length?'needs_clarification':'create_issue',
      confidence:title?(prop?0.8:0.65):0.3,
      summary:title?('Log issue: "'+title+'"'+(prop?' · '+prop.name:'')):'Issue description is missing.',
      missingFields:missing,
      payload:{title:title,propId:prop&&prop.found?prop.id:'',propName:prop?prop.name:''},
      confirmationRequired:true
    };
  }

  if(type==='create_note'){
    let note=colonBody;
    if(!note){
      note=voiceStripLead(raw).replace(/^note\b/i,'').trim();
      note=voiceStripPropAliases(note);
      note=note.replace(/^\s*(for|on|about|the)\s+/i,'').replace(/\s{2,}/g,' ').trim();
    }
    const missing=note?[]:['note text'];
    const dest=prop&&prop.found?('property notes · '+prop.name):'general Notes';
    return {
      type:missing.length?'needs_clarification':'create_note',
      confidence:note?0.8:0.3,
      summary:note?('Add note to '+dest+': "'+note+'"'):'Note text is missing.',
      missingFields:missing,
      payload:{note:note,propId:prop&&prop.found?prop.id:'',propName:prop?prop.name:''},
      confirmationRequired:true
    };
  }

  if(type==='create_contact'){
    let rest=voiceStripLead(raw).replace(/^contact\b/i,'').trim();
    // Category mapping (first match wins).
    const catMap=[
      [['private chef','chef'],'private_chefs','Private Chefs'],
      [['transport','taxi','driver'],'private_transport','Private Transport'],
      [['cleaner','cleaning'],'cleaners','Cleaners'],
      [['electrician','plumber','worker','maintenance'],'workers','Workers / Maintenance'],
      [['boat','tour'],'boat_tours','Boat Tours']
    ];
    let category='other',catLabel='Other',catWord='';
    for(const [words,cat,label] of catMap){
      for(const w of words){
        if(new RegExp('\\b'+_voiceEscRe(w)+'\\b','i').test(rest)){category=cat;catLabel=label;catWord=w;break;}
      }
      if(category!=='other')break;
    }
    // Phone.
    let phone='';
    const pm=rest.match(/\bphone\s*([+\d][\d\s().\-]{3,})/i);
    if(pm)phone=pm[1].trim().replace(/[.\s]+$/,'');
    // Price.
    let priceInfo='';
    const prm=rest.match(/\bprice\s+(.+)$/i);
    if(prm)priceInfo=prm[1].trim();
    else{const pem=rest.match(/(\d[\d.,]*\s*(?:euros?|eur|€)[\w\s]*)$/i);if(pem)priceInfo=pem[1].trim();}
    // Name = what remains after removing the above pieces.
    let name=rest;
    if(pm)name=name.replace(pm[0],' ');
    if(prm)name=name.replace(prm[0],' ');
    else if(priceInfo)name=name.replace(priceInfo,' ');
    if(catWord)name=name.replace(new RegExp('\\b'+_voiceEscRe(catWord)+'\\b','ig'),' ');
    name=name.replace(/\b(phone|price)\b/ig,' ').replace(/[,;]/g,' ').replace(/\s{2,}/g,' ').trim();
    const missing=name?[]:['contact name'];
    return {
      type:missing.length?'needs_clarification':'create_contact',
      confidence:name?(phone?0.85:0.7):0.3,
      summary:name?('Add contact: '+name+' · '+catLabel+(phone?' · '+phone:'')+(priceInfo?' · '+priceInfo:'')):'Contact name is missing.',
      missingFields:missing,
      payload:{name:name,category:category,categoryLabel:catLabel,phone:phone,priceInfo:priceInfo},
      confirmationRequired:true
    };
  }

  if(type==='create_booking'){
    // Platform.
    let platform='airbnb',platformLabel='Airbnb';
    if(/\bbooking\.com\b/i.test(raw)){platform='booking';platformLabel='Booking.com';}
    else if(/\bairbnb\b/i.test(raw)){platform='airbnb';platformLabel='Airbnb';}
    else if(/\bagency\b/i.test(raw)){platform='agency';platformLabel='Agency';}
    // Dates.
    const dates=voiceParseDates(raw);
    const checkIn=dates[0]||'';
    const checkOut=dates[1]||'';
    // Guest name — strip property + date words first to avoid false hits.
    let work=voiceStripPropAliases(raw);
    let guestName='';
    const gm=work.match(/\bguest\s+([A-Za-z][\w'.\-]*(?:\s+[A-Za-z][\w'.\-]*)?)/);
    if(gm)guestName=gm[1].trim();
    else{
      const gm2=work.match(/\bfor\s+([A-Z][a-zA-Z'.\-]+(?:\s+[A-Z][a-zA-Z'.\-]+)?)/);
      if(gm2)guestName=gm2[1].trim();
    }
    // Drop any trailing keyword the capture may have grabbed (e.g. "Mark price").
    guestName=guestName.replace(/\s+(price|prices|euros?|eur|airbnb|booking|agency|from|to)\b.*$/i,'').trim();
    // Price.
    let totalPrice=0;
    const prm=raw.match(/(\d[\d.,]*)\s*(?:euros?|eur|€)/i)||raw.match(/\bprice\s+(\d[\d.,]*)/i);
    if(prm)totalPrice=parseFloat(String(prm[1]).replace(/[.,](?=\d{3}\b)/g,'').replace(/,/g,'.'))||0;

    const missing=[];
    if(!(prop&&prop.found))missing.push('property');
    if(!checkIn)missing.push('check-in');
    if(!checkOut)missing.push('check-out');
    if(!guestName)missing.push('guest name');

    const parts=[];
    parts.push(prop?prop.name:'(no property)');
    if(checkIn||checkOut)parts.push((checkIn?fmtDate(checkIn):'?')+' → '+(checkOut?fmtDate(checkOut):'?'));
    if(guestName)parts.push('guest '+guestName);
    parts.push(platformLabel);
    if(totalPrice)parts.push('€'+totalPrice);

    return {
      type:'create_booking',
      confidence:missing.length?0.4:0.8,
      summary:'Create booking: '+parts.join(' · '),
      missingFields:missing,
      payload:{
        propId:prop&&prop.found?prop.id:'',propName:prop?prop.name:'',
        platform:platform,platformLabel:platformLabel,agencyName:platform==='agency'?'':'',
        checkIn:checkIn,checkOut:checkOut,guestName:guestName,totalPrice:totalPrice
      },
      confirmationRequired:true
    };
  }

  return blank();
}

/* ── SPEECH RECOGNITION ── */
let _voiceRec=null,_voiceListening=false;
function voiceSpeechSupported(){
  return !!(window.SpeechRecognition||window.webkitSpeechRecognition);
}
function startVoiceCommandListening(){
  if(!voiceSpeechSupported()){voiceSetStatus('Speech recognition not supported here — please type your command.');return;}
  try{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    _voiceRec=new SR();
    _voiceRec.lang='en-GB';
    _voiceRec.interimResults=true;
    _voiceRec.continuous=false;
    _voiceRec.maxAlternatives=1;
    let finalText='';
    _voiceRec.onresult=function(e){
      let interim='';
      for(let i=e.resultIndex;i<e.results.length;i++){
        const r=e.results[i];
        if(r.isFinal)finalText+=r[0].transcript;
        else interim+=r[0].transcript;
      }
      const ta=document.getElementById('vc-transcript');
      if(ta)ta.value=(finalText+' '+interim).trim();
    };
    _voiceRec.onerror=function(e){
      voiceSetStatus('Microphone error: '+(e.error||'unknown')+'. You can type instead.');
      _voiceListening=false;voiceUpdateButtons();
    };
    _voiceRec.onend=function(){
      _voiceListening=false;voiceUpdateButtons();
      const ta=document.getElementById('vc-transcript');
      if(ta&&ta.value.trim())voiceSetStatus('Got it — review the text, then tap "Parse command".');
      else voiceSetStatus('Stopped listening.');
    };
    _voiceRec.start();
    _voiceListening=true;voiceUpdateButtons();
    voiceSetStatus('🎙 Listening… speak your command now.');
  }catch(err){
    voiceSetStatus('Could not start microphone. Please type instead.');
    _voiceListening=false;voiceUpdateButtons();
  }
}
function stopVoiceCommandListening(){
  if(_voiceRec){try{_voiceRec.stop();}catch(e){}}
  _voiceListening=false;voiceUpdateButtons();
}
function voiceSetStatus(msg){const el=document.getElementById('vc-status');if(el)el.textContent=msg;}
function voiceUpdateButtons(){
  const startBtn=document.getElementById('vc-start');
  const stopBtn=document.getElementById('vc-stop');
  if(startBtn)startBtn.style.display=_voiceListening?'none':'';
  if(stopBtn)stopBtn.style.display=_voiceListening?'':'none';
  const dot=document.getElementById('vc-dot');
  if(dot)dot.style.opacity=_voiceListening?'1':'0.25';
}

/* Called when the user finishes a transcript (used by Parse button). */
function handleVoiceCommandTranscript(text){
  const action=parseVoiceCommandLocal(text);
  showVoiceActionPreview(action);
}

/* ── MODAL ── */
function openVoiceCommandModal(){
  const supported=voiceSpeechSupported();
  _voiceListening=false;_voiceRec=null;
  const micBlock=supported
    ? '<div style="display:flex;gap:8px;margin-bottom:10px">'
      +'<button id="vc-start" class="sv-btn sv-btn-primary" style="flex:1" onclick="startVoiceCommandListening()">🎙 Start listening</button>'
      +'<button id="vc-stop" class="sv-btn sv-btn-danger" style="flex:1;display:none" onclick="stopVoiceCommandListening()">■ Stop</button>'
      +'</div>'
    : '<div class="sv-card" style="margin-bottom:10px;font-size:13px;color:var(--text2);background:var(--amber-bg);border-color:var(--amber-border)">Voice input isn’t supported in this browser. You can still type your command below.</div>';
  const examples='“Add task for today: buy pool chlorine” · “Add issue for Villa Mar: AC not cooling” · “Add note for Villa Diagonal: baby cot” · “Add contact Ivan electrician phone 091 123 456” · “Add booking for Villa Mar from July 10 to July 15 for John Smith, Airbnb, 2500 euros”';
  showModal('<div class="modal-handle"></div>'
    +'<div class="modal-title">🎙 Voice Command</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    +'<span id="vc-dot" style="width:10px;height:10px;border-radius:50%;background:var(--accent);opacity:0.25;flex-shrink:0"></span>'
    +'<span id="vc-status" style="font-size:13px;color:var(--text2)">'+(supported?'Tap “Start listening” or just type your command.':'Type your command below.')+'</span>'
    +'</div>'
    +micBlock
    +'<div class="field"><label>Command</label><textarea id="vc-transcript" placeholder="e.g. Add task for today: buy pool chlorine" style="height:80px"></textarea></div>'
    +'<div style="font-size:11px;color:var(--text3);line-height:1.5;margin-bottom:12px">'+esc(examples)+'</div>'
    +'<button class="sv-btn sv-btn-primary" style="width:100%;margin-bottom:8px" onclick="handleVoiceCommandTranscript((document.getElementById(\'vc-transcript\')||{}).value||\'\')">Parse command</button>'
    +'<div id="vc-preview"></div>'
    +'<button class="sv-btn sv-btn-secondary" style="width:100%;margin-top:8px" onclick="stopVoiceCommandListening();closeModal()">Close</button>');
  voiceUpdateButtons();
}

/* ── PREVIEW ── */
function showVoiceActionPreview(action){
  window._voiceAction=action;
  const host=document.getElementById('vc-preview');
  if(!host)return;
  const typeLabels={create_task:'Task',create_issue:'Issue',create_note:'Note',
    create_contact:'Contact',create_booking:'Booking',
    needs_clarification:'Needs more info',unsupported:'Not understood'};
  const canExecute=action.confirmationRequired
    && action.type.indexOf('create_')===0
    && (!action.missingFields||action.missingFields.length===0);
  const pct=Math.round((action.confidence||0)*100);
  let html='<div class="sv-card" style="margin-top:12px">';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    +'<span class="sv-chip active">'+esc(typeLabels[action.type]||action.type)+'</span>'
    +'<span class="sv-badge sv-badge-low">'+pct+'% match</span></div>';
  if(action.type==='create_issue'){
    const p=action.payload||{};
    const propLine=p.propId?esc(p.propName||''):'General / Not attached';
    html+='<div style="font-size:13px;line-height:1.7">'
      +'<div><span style="color:var(--text3);font-weight:700">Property:</span> '+propLine+'</div>'
      +'<div><span style="color:var(--text3);font-weight:700">Title:</span> '+esc(p.title||'')+'</div>'
      +'</div>';
  }else{
    html+='<div style="font-size:14px;font-weight:600;line-height:1.5;margin-bottom:6px">'+esc(action.summary||'')+'</div>';
  }
  if(action.missingFields&&action.missingFields.length){
    html+='<div style="font-size:12px;color:var(--amber-text,#b8860b);background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:10px;padding:8px 10px;margin-top:6px">⚠ Missing: '+esc(action.missingFields.join(', '))+'. Add these to the text and parse again.</div>';
  }
  html+='</div>';
  if(canExecute){
    html+='<div style="display:flex;gap:8px;margin-top:10px">'
      +'<button class="sv-btn sv-btn-primary" style="flex:1" onclick="executeVoiceAction(window._voiceAction)">✓ Confirm &amp; create</button>'
      +'<button class="sv-btn sv-btn-secondary" style="flex:1" onclick="(document.getElementById(\'vc-preview\')||{}).innerHTML=\'\'">Cancel</button>'
      +'</div>';
  }
  host.innerHTML=html;
}

/* ── EXECUTORS ── */
function executeVoiceAction(action){
  if(!action||action.type.indexOf('create_')!==0){toast('Nothing to create.');return;}
  if(action.missingFields&&action.missingFields.length){toast('Missing: '+action.missingFields.join(', '));return;}
  switch(action.type){
    case 'create_task':    return executeVoiceCreateTask(action.payload);
    case 'create_issue':   return executeVoiceCreateIssue(action.payload);
    case 'create_note':    return executeVoiceCreateNote(action.payload);
    case 'create_contact': return executeVoiceCreateContact(action.payload);
    case 'create_booking': return executeVoiceCreateBooking(action.payload);
    default: toast('Unsupported action.');
  }
}

function _voiceFinish(msg){
  save();                         // save() also calls schedulePush()
  closeModal();
  if(typeof render==='function')render();
  toast(msg);
}

function executeVoiceCreateTask(p){
  const dueDate=p.dueDate||'';
  D.tasks.push({id:uid(),text:p.text.trim(),propId:p.propId||'',priority:'medium',
    urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:dueDate,
    timeEst:'',photo:null,completedAt:'',createdAt:today(),
    status:dueDate===today()?'today':'inbox',type:'ops',projectId:'',waitingFor:''});
  _voiceFinish('Task created'+(dueDate?' (due '+fmtDate(dueDate)+')':'')+'!');
}

function executeVoiceCreateIssue(p){
  D.issues.push({id:uid(),title:p.title.trim(),propId:p.propId||'',note:'',
    status:'open',createdAt:today(),resolvedAt:'',photos:[],resolveBy:'',
    priority:'medium',category:'other',waitingFor:''});
  _voiceFinish('Issue logged!');
}

function executeVoiceCreateNote(p){
  const text=String(p.note||'').trim();
  if(p.propId){
    const prop=D.props.find(x=>x.id===p.propId);
    if(prop){
      prop.notes=(prop.notes&&prop.notes.trim()?prop.notes.trim()+'\n':'')+text;
      _voiceFinish('Note added to '+prop.name+'!');
      return;
    }
  }
  D.scratch=(D.scratch&&D.scratch.trim()?D.scratch.trim()+'\n':'')+text;
  _voiceFinish('Note added to general Notes!');
}

function executeVoiceCreateContact(p){
  const now=new Date().toISOString().slice(0,10);
  D.contacts=D.contacts||[];
  D.contacts.push({id:uid(),name:String(p.name||'').trim(),
    category:p.category||'other',phone:p.phone||'',whatsapp:'',company:'',
    area:'',priceInfo:p.priceInfo||'',availability:'',status:'new',notes:'',
    lastContacted:'',createdAt:now,updatedAt:now});
  _voiceFinish('Contact added!');
}

function executeVoiceCreateBooking(p){
  // Conservative: refuse if any required field missing.
  if(!p.propId||!p.checkIn||!p.checkOut||!p.guestName){
    toast('Booking needs property, dates and guest name.');return;
  }
  if(p.checkOut<=p.checkIn){toast('Check-out must be after check-in.');return;}
  D.bookings.push({id:uid(),propId:p.propId,platform:p.platform||'airbnb',
    agencyName:p.platform==='agency'?(p.agencyName||''):'',
    checkIn:p.checkIn,checkOut:p.checkOut,guestName:p.guestName,guestCount:0,
    totalPrice:p.totalPrice||0,notes:'',status:'confirmed',linkedCleaningId:''});
  _voiceFinish('Booking created for '+p.propName+'!');
}

