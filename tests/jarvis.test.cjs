const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function runtime(){
  const timers=new Map();let next=0;const sandbox={console,Date,Math,performance:{now:()=>1},window:null,document:{addEventListener(){}},setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);},DEV_MODE:true,D:{props:[{id:'mar',name:'Villa Mar'},{id:'marjals',name:'Villa Marjals'}],cleaners:[{id:'a',name:'Ana'},{id:'b',name:'Bea'}],sessions:[],bookings:[],tasks:[],issues:[]}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run('function propName(id){return D.props.find(p=>p.id===id)?.name||"General";}');
  for(const file of ['src/utils/dates.js','src/ui/voice.js','src/assistant/jarvis-data.js','src/assistant/jarvis-records.js','src/assistant/jarvis-voice.js','src/assistant/jarvis.js'])run(fs.readFileSync(path.join(root,file),'utf8'));
  return {context,run,timers};
}
test('Jarvis stays closed on startup and does not start microphone, timers or networking',()=>{
  const app=runtime();assert.equal(app.context.SV_JARVIS.getPhase(),'idle');assert.equal(app.timers.size,0);assert.equal(typeof app.context.openJarvis,'function');
});
test('next-week cleanings count sessions, exclude cancellations and preserve property boundaries',()=>{
  const app=runtime();app.run(`D.sessions=[{id:'one',date:'2026-10-19',propId:'mar',cleanerIds:['a','b'],status:'scheduled'},{id:'two',date:'2026-10-25',propId:'marjals',crew:{main:[{cleanerId:'a',status:'offered'}]},status:'scheduled'},{id:'cancel',date:'2026-10-20',propId:'mar',status:'cancelled'},{id:'outside',date:'2026-10-26',propId:'mar',status:'scheduled'}];`);
  const before=app.run('JSON.stringify(D)');const reply=app.run(`SV_JARVIS_DATA.localAnswer('How many cleanings next week?','2026-10-13')`);
  assert.match(reply,/2 scheduled cleanings/);assert.match(reply,/Ana, Bea/);assert.match(reply,/pending/);
  const filtered=app.run(`SV_JARVIS_DATA.localAnswer('Cleanings next week at Villa Mar','2026-10-13')`);assert.match(filtered,/1 scheduled cleaning/);assert.doesNotMatch(filtered,/Villa Marjals/);assert.equal(app.run('JSON.stringify(D)'),before);
});
test('Sunday and year rollover resolve a Monday–Sunday week, and missing checkout cleaning is separate',()=>{
  const app=runtime();const w=JSON.parse(app.run(`JSON.stringify(SV_JARVIS_DATA.dateWindow('next week','2026-12-27'))`));assert.deepEqual(w,{start:'2026-12-28',end:'2027-01-03',label:'next week'});
  app.run(`D.bookings=[{propId:'mar',checkOut:'2026-10-19',status:'confirmed'},{propId:'marjals',checkOut:'2026-10-20',status:'cancelled'}];`);
  const reply=app.run(`SV_JARVIS_DATA.localAnswer('cleanings next week','2026-10-13')`);assert.match(reply,/0 scheduled cleanings/);assert.match(reply,/1 departure has no cleaning recorded/);
});
test('agent context excludes manager keys, guest identity, photos and cloud baselines',()=>{
  const app=runtime();app.run(`D.sv_secret='SECRET_SENTINEL';D.props[0].photos=['PHOTO_SENTINEL'];D.bookings=[{checkIn:'2026-10-13',checkOut:'2026-10-14',propId:'mar',guestName:'GUEST_SENTINEL',guestPhone:'PHONE_SENTINEL',notes:'PRIVATE_SENTINEL'}];`);
  const value=app.run(`JSON.stringify(SV_JARVIS_DATA.context('2026-10-13'))`);for(const sentinel of ['SECRET_SENTINEL','PHOTO_SENTINEL','GUEST_SENTINEL','PHONE_SENTINEL','PRIVATE_SENTINEL'])assert.ok(!value.includes(sentinel));assert.match(value,/Fictional development preview/);
});
test('recognition finishes once even when result, stop and end overlap; cancellation ignores late events',()=>{
  const app=runtime();let rec,done=0,last='';class FakeRecognition{constructor(){rec=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){}}
  const callbacks={ready(){},activity(){},draft(){},done(text){done++;last=text;},error(){throw Error('Unexpected error');}};
  const controller=app.context.SV_JARVIS.createRecognizer(FakeRecognition,'en-GB',callbacks);controller.start();const row=[{transcript:'cleanings next week'}];row.isFinal=true;rec.onresult({results:[row]});const end=rec.onend;controller.finish();end?.();assert.equal(done,1);assert.equal(last,'cleanings next week');assert.equal(app.timers.size,0);
  const another=app.context.SV_JARVIS.createRecognizer(FakeRecognition,'en-GB',callbacks);another.start();const late=rec.onresult;another.cancel();late({results:[row]});assert.equal(done,1);assert.equal(app.timers.size,0);
});

const plain=value=>JSON.parse(JSON.stringify(value));
test('desktop dashboard: today’s operations by time and tasks by urgency, bounded, read-only, without guest identity',()=>{
  const app=runtime();
  app.run(`D.props.push({id:'casa',name:'Casa Ejemplo'});
    D.sessions=[{id:'s1',date:'2026-10-14',time:'14:00',propId:'mar',status:'scheduled'},{id:'s2',date:'2026-10-14',time:'9:00',propId:'casa',status:'done'},{id:'s3',date:'2026-10-14',time:'08:00',propId:'casa',status:'cancelled'},{id:'s4',date:'2026-10-15',time:'08:00',propId:'casa',status:'scheduled'}];
    D.bookings=[{propId:'marjals',checkIn:'2026-10-14',checkOut:'2026-10-20',guestName:'GUEST_SENTINEL',status:'confirmed'},{propId:'casa',checkIn:'2026-10-10',checkOut:'2026-10-14',checkOutTime:'10:00',status:'confirmed'},{propId:'mar',checkIn:'2026-10-14',checkOut:'2026-10-16',status:'cancelled'}];
    D.tasks=[{id:'a',text:'Undated first',done:false},{id:'b',text:'Later',dueDate:'2026-10-30',done:false},{id:'c',text:'Done',dueDate:'2026-10-14',done:true},{id:'d',text:'Tomorrow job',dueDate:'2026-10-15',done:false},{id:'e',text:'Overdue job',dueDate:'2026-10-12',done:false},{id:'f',text:'Today job',dueDate:'2026-10-14',done:false},{id:'g',text:'Undated second',done:false}];`);
  const before=app.run('JSON.stringify(D)');
  const d=plain(app.run(`SV_JARVIS_DATA.dashboard('2026-10-14')`));
  assert.equal(d.dateLabel,'14 October');
  assert.deepEqual(d.today.map(r=>[r.time,r.property,r.label]),[['09:00','Casa Ejemplo','Cleaning · done'],['10:00','Casa Ejemplo','Departure'],['14:00','Villa Mar','Cleaning'],['16:00','Villa Marjals','Arrival']]);
  assert.deepEqual(d.tasks.map(t=>[t.text,t.due]),[['Overdue job','Overdue'],['Today job','Today'],['Tomorrow job','Tomorrow'],['Later',app.run(`fmtDate('2026-10-30')`)],['Undated first','']]);
  assert.equal(d.tasksMore,1);assert.equal(d.todayMore,0);
  assert.ok(!JSON.stringify(d).includes('GUEST_SENTINEL'));assert.equal(app.run('JSON.stringify(D)'),before);
  const small=plain(app.run(`SV_JARVIS_DATA.dashboard('2026-10-14',{today:2,tasks:1})`));assert.equal(small.today.length,2);assert.equal(small.todayMore,2);assert.equal(small.tasks.length,1);assert.equal(small.tasksMore,5);
  const empty=plain(app.run(`SV_JARVIS_DATA.dashboard('2027-01-01')`));assert.deepEqual(empty.today,[]);
});

/* Conversation loop with fake recognizers, fake TTS signals and fake timers. No real microphone is used. */
function conversation(app,options={}){
  const recs=[],transcripts=[],timers=new Map();let n=0;
  const c=app.context.SV_JARVIS_VOICE.createConversation({
    startRecognition:(cb,kind)=>{const r={cb,kind,cancelled:false,finished:false,cancel(){r.cancelled=true;}};recs.push(r);return r;},
    onTranscript:text=>transcripts.push(text),schedule:(fn,ms)=>{timers.set(++n,{fn,ms});return n;},cancel:id=>timers.delete(id),...options});
  const run=()=>{for(const [id,t] of [...timers]){timers.delete(id);t.fn();}};
  const say=(text,r=recs.at(-1))=>{r.finished=true;r.cb.done(text);};
  const fail=(code,r=recs.at(-1))=>{r.finished=true;r.cb.error(code);};
  const listening=()=>recs.filter(r=>!r.cancelled&&!r.finished).length;
  return {c,recs,transcripts,timers,run,say,fail,listening};
}
test('one explicit start gives several turns; the recognizer is off while thinking and speaking and resumes only after the final reply',()=>{
  const app=runtime();const v=conversation(app);
  assert.equal(v.recs.length,0);v.c.start();assert.equal(v.recs[0].kind,'start');assert.equal(v.c.phase,'listening');
  v.say('How many cleanings today?');assert.deepEqual(v.transcripts,['How many cleanings today?']);assert.equal(v.c.phase,'thinking');assert.equal(v.listening(),0);
  v.c.speaking();assert.equal(v.c.phase,'speaking');v.run();assert.equal(v.recs.length,1);assert.equal(v.listening(),0);
  assert.equal(v.c.replyFinished(),true);assert.equal(v.c.phase,'waiting');assert.equal(v.recs.length,1);assert.equal([...v.timers.values()][0].ms,450);
  v.run();assert.equal(v.recs.length,2);assert.equal(v.recs[1].kind,'resume');assert.equal(v.c.phase,'listening');
  v.say('And tomorrow?');v.recs[1].cb.done('And tomorrow?');assert.deepEqual(v.transcripts,['How many cleanings today?','And tomorrow?']);
  v.c.replyFinished();v.run();assert.equal(v.recs.length,3);assert.equal(v.c.active,true);
});
test('duplicate or late recognizer callbacks are consumed once; an empty transcript counts as silence; repeated replyFinished never postpones a resume',()=>{
  const app=runtime();const v=conversation(app);v.c.start();const first=v.recs[0];
  v.say('Hello');first.cb.done('Hello');first.cb.error('network');
  assert.deepEqual(v.transcripts,['Hello']);assert.equal(v.c.phase,'thinking');assert.equal(v.c.active,true);
  v.c.speaking();first.cb.done('Hello again');assert.equal(v.c.phase,'speaking');assert.deepEqual(v.transcripts,['Hello']);
  assert.equal(v.c.replyFinished(),true);const [pendingId]=[...v.timers.keys()];
  assert.equal(v.c.replyFinished(),true);assert.deepEqual([...v.timers.keys()],[pendingId]);
  v.c.speaking();assert.equal(v.c.phase,'waiting');
  v.run();assert.equal(v.recs.length,2);assert.equal(v.c.replyFinished(),true);assert.equal(v.timers.size,0);assert.equal(v.c.phase,'listening');
  v.say('   ');assert.deepEqual(v.transcripts,['Hello']);assert.equal(v.c.phase,'waiting');assert.equal([...v.timers.values()][0].ms,900);
});

/* Desktop overlay with a fake DOM, fake speech recognizer, fake TTS and fake timers. No real microphone or network. */
function desktopRuntime({reply='First sentence. Second sentence.',route=null,desktop=true,reduced=true,geometry=null,speechGate=false,agent=false,customSpeech=false,fishSpeech=false,iosDevice=false,capture=null,unlock=null,whatsappFetch=null,understand=null,speechError='',recognitionStarts=true,liveSdk=null,healthGate=null,voiceChoice=liveSdk?'live':customSpeech?'elevenlabs':null,voiceStorage=null}={}){
  const savedVoice=voiceStorage||new Map(voiceChoice?[['sv_jarvis_voice',voiceChoice]]:[]);
  const timers=new Map(),els=new Map(),recs=[],utterances=[],primes=[],spoken=[],audioEvents=[],audios=[],speechRequests=[],wa={open:[],close:0},winListeners={},docListeners={},rafs=[];let n=0,root=null,waOpen=null,isDesktop=desktop,inGesture=false,speechUnlocked=false;
  /* Fake elements; with `geometry` every element reports that rectangle (tests can override single elements). */
  /* Setting innerHTML registers every element that has an id, with its initial text and hidden state from the real markup. */
  const register=html=>{for(const m of String(html).matchAll(/<(\w+)([^>]*?)\sid="([^"]+)"([^>]*)>([^<]*)/g)){const sel='#'+m[3];if(!els.has(sel))els.set(sel,fakeEl());const node=els.get(sel),tagAttrs=m[2]+' '+m[4];node.textContent=m[5].trim();if(/(?:^|\s)hidden(?:\s|$|=)/.test(tagAttrs)){node.hidden=true;node.attrs.hidden='';}}};
  const fakeEl=()=>{const cls=new Set();let markup='';const e={hidden:false,textContent:'',value:'',dataset:{},attrs:{},listeners:{},children:[],removed:false,
    get innerHTML(){return markup;},set innerHTML(v){markup=String(v);register(markup);},
    classList:{add:(...c)=>c.forEach(x=>cls.add(x)),remove:(...c)=>c.forEach(x=>cls.delete(x)),toggle(c,on){const v=on===undefined?!cls.has(c):!!on;if(v)cls.add(c);else cls.delete(c);return v;},contains:c=>cls.has(c)},
    setAttribute(k,v){e.attrs[k]=String(v);},getAttribute(k){return e.attrs[k];},removeAttribute(k){delete e.attrs[k];},hasAttribute(k){return k in e.attrs;},
    addEventListener(t,f){e.listeners[t]=f;},removeEventListener(t,f){if(e.listeners[t]===f)delete e.listeners[t];},appendChild(c){e.children.push(c);return c;},append(...c){e.children.push(...c);},replaceChildren(){e.children=[];},focus(){},remove(){e.removed=true;},scrollIntoView(){},
    querySelector(sel){if(!els.has(sel))els.set(sel,fakeEl());return els.get(sel);},querySelectorAll(){return [];},getClientRects(){return [];}};
    if(geometry)e.getBoundingClientRect=()=>({...geometry});return e;};
  const background=fakeEl();
  class FakeSR{constructor(){recs.push(this);this.aborted=false;}start(){audioEvents.push('record');if(recognitionStarts)this.onstart?.();}stop(){this.onend?.();}abort(){this.aborted=true;}}
  class FakeUtterance{constructor(text){this.text=text;(text.trim()?utterances:primes).push(this);}}
  class FakeAudio{constructor(){this.src='';audios.push(this);}setAttribute(){}removeAttribute(){this.src='';}play(){return this.src.startsWith('data:')&&unlock?unlock:Promise.resolve();}pause(){}load(){}}
  const sandbox={console,Date,Math,AbortController,Audio:FakeAudio,Blob,atob,Uint8Array,URL:{createObjectURL:()=>'blob:test',revokeObjectURL(){}},performance:{now:()=>1},navigator:{userAgent:iosDevice?'iPhone AppleWebKit Safari':'test',...(capture?{mediaDevices:{getUserMedia:capture}}:{})},DEV_MODE:true,
    document:{addEventListener(t,f){docListeners[t]=f;},createElement:()=>fakeEl(),body:{appendChild(c){if(!root)root=c;}},querySelector:s=>s==='.app-wrapper'?background:null,getElementById:()=>null,activeElement:null,hidden:false},
    setTimeout(fn,ms){timers.set(++n,{fn,ms});return n;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){rafs.push(fn);return rafs.length;},cancelAnimationFrame(){},
    addEventListener(t,f){(winListeners[t]=winListeners[t]||[]).push(f);},removeEventListener(t,f){winListeners[t]=(winListeners[t]||[]).filter(x=>x!==f);},
    matchMedia:q=>({matches:/reduced-motion/.test(q)?reduced:isDesktop}),SpeechRecognition:FakeSR,SpeechSynthesisUtterance:FakeUtterance,speechSynthesis:{speak(u){if(inGesture)speechUnlocked=true;if(speechGate&&!speechUnlocked)return;spoken.push(u);audioEvents.push(u.text.trim()?'reply':'prime');},cancel(){audioEvents.push('cancel');},getVoices:()=>[]},
    SV_STORAGE:{getItem:k=>savedVoice.get(k)||null,setItem:(k,v)=>savedVoice.set(k,String(v))},D:{props:[],cleaners:[],sessions:[],bookings:[],tasks:[],issues:[]},SV_JARVIS_ACTIONS:{route:route||(()=>agent?{kind:'chat'}:{kind:'reply',message:reply})}};
  if(agent){sandbox.AbortSignal=AbortSignal;sandbox.fetch=async(url,init)=>{
    if(String(url).endsWith('/health')&&healthGate)await healthGate;
    await Promise.resolve();if(whatsappFetch&&String(url).includes('/whatsapp/'))return whatsappFetch(String(url),init);
    if(String(url).endsWith('/live-session'))return {ok:true,json:async()=>({conversationToken:'EPHEMERAL_ONLY',maxDurationSeconds:600})};
    if(String(url).endsWith('/speech')){speechRequests.push(JSON.parse(init.body));return {ok:!speechError,json:async()=>speechError?{error:speechError}:{contentType:'audio/mpeg',audio:Buffer.alloc(100,7).toString('base64')}};}
    return {ok:true,json:async()=>String(url).endsWith('/health')?{ready:true,requestToken:'local-test',route:'n8n',...(liveSdk?{liveVoice:{available:true}}:{}),...(understand?{conversation:1}:{}),...(customSpeech?{speech:{available:true,provider:'elevenlabs',name:'Jarvis Seravillas'}}:{})}:understand?{decision:await understand(JSON.parse(init.body))}:{reply}};
  };}
  sandbox.window=sandbox;
  const pcmSources=[];
  if(fishSpeech){
    Object.assign(sandbox,{TextDecoder,DataView,Response,AudioContext:class{constructor(){this.state='running';this.currentTime=0;this.destination={};}resume(){return Promise.resolve();}close(){}createBuffer(_,length,rate){return {duration:length/rate,copyToChannel(){}};}createBufferSource(){const source={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};pcmSources.push(source);return source;}}});
    const originalFetch=sandbox.fetch;sandbox.fetch=async(url,init)=>{const res=await originalFetch(url,init);if(String(url).endsWith('/health')){const data=await res.json();delete data.liveVoice;return {ok:true,json:async()=>({...data,speech:{available:true,provider:'fish',streaming:true}})};}return res;};
    sandbox.SV_JARVIS_TRANSPORT={fetch:(...args)=>sandbox.fetch(...args),remote:()=>false,speechStream:async text=>{speechRequests.push({text});return new Response(JSON.stringify({type:'audio',seq:0,sampleRate:24000,audio:Buffer.alloc(4800,3).toString('base64')})+'\n'+JSON.stringify({type:'end',frames:1})+'\n',{headers:{'Content-Type':'application/x-ndjson'}});}};
  }
  sandbox.SV_JARVIS_WHATSAPP={parseCommand:t=>/whatsapp/i.test(t)?{kind:'open',name:'Bex',group:false}:null,open(o){wa.open.push(o);waOpen=o;return true;},close(){wa.close++;const o=waOpen;waOpen=null;o?.onClose?.();},isOpen:()=>!!waOpen,isEmbedded:()=>!!waOpen};
  const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run('function propName(id){return D.props.find(p=>p.id===id)?.name||"General";}');
  for(const file of ['src/utils/dates.js','src/ui/voice.js','src/assistant/jarvis-data.js','src/assistant/jarvis-records.js','src/assistant/jarvis-operations.js','src/assistant/jarvis-dashboard.js','src/assistant/jarvis-voice.js','src/assistant/jarvis-audio.js','src/assistant/jarvis-live.js',...(whatsappFetch?['src/assistant/jarvis-whatsapp-voice.js']:[]),'src/assistant/jarvis.js']){if(liveSdk&&file==='src/assistant/jarvis.js'){const factory=sandbox.SV_JARVIS_LIVE.create;sandbox.SV_JARVIS_LIVE={...sandbox.SV_JARVIS_LIVE,create:opts=>factory({...opts,load:async()=>liveSdk,capture:async()=>({getTracks:()=>[{stop(){}}]})})};}run(fs.readFileSync(path.join(root_,file),'utf8'));}
  const app={run,context,recs,utterances,primes,spoken,audioEvents,audios,pcmSources,speechRequests,wa,timers,background,winListeners,docListeners,rafs,
    root:()=>root,el:id=>root?root.querySelector('#'+id):els.get('#'+id),phase:()=>run('SV_JARVIS.getPhase()'),
    click(j,extra={}){inGesture=true;try{root.listeners.click({target:{closest:()=>({dataset:{j,...extra}})}});}finally{inGesture=false;}},
    submit(text){app.el('jarvis-input').value=text;inGesture=true;try{app.el('jarvis-form').listeners.submit({preventDefault(){}});}finally{inGesture=false;}},
    runDelay(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}},
    hear(text,rec=recs.at(-1)){const row=[{transcript:text}];row.isFinal=true;rec.onresult({results:[row]});app.runDelay(550);},
    /* Plays every queued reply chunk to its end, as the browser would. */
    setDesktop(v){isDesktop=v;},resize(){for(const f of winListeners.resize||[])f();},
    finishSpeech(){for(let i=0;i<20;i++){const u=utterances.find(x=>!x.done);if(!u)break;u.done=true;u.onstart?.();u.onend?.();}},
    texts(node){return [node.textContent||'',...(node.children||[]).flatMap(c=>app.texts(c))].filter(Boolean);}};
  return app;
}
const root_=root;
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function installSoundProbe(app,{locked=false}={}){
  const events=[],contexts=[];app.context.createJarvisRing=()=>()=>{};let unlock;
  const ready=new Promise(resolve=>{unlock=resolve;});
  app.context.AudioContext=class{constructor(){this.state=locked?'suspended':'running';contexts.push(this);}resume(){return locked?ready:Promise.resolve();}close(){this.state='closed';return Promise.resolve();}};
  app.context.SV_JARVIS_SOUNDS={create:context=>({context,play(kind){events.push(kind);return true;},activity:kind=>events.push(kind),preview(){events.push('preview');return true;},stop:()=>events.push('stop'),dispose:()=>events.push('dispose'),setVolume:v=>events.push(['volume',v])})};
  return {events,contexts,unlock(){for(const c of contexts)c.state='running';unlock();},cues:()=>events.filter(x=>typeof x==='string'&&!['stop','dispose'].includes(x))};
}

test('actual live states drive distinct interface cues without a provider theme; mute and sound-off stop them',async()=>{
  const sessions=[];const app=desktopRuntime({agent:true,liveSdk:{Conversation:{startSession:async options=>{sessions.push(options);return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate(){}};}}}});
  const h=installSoundProbe(app);app.run('openJarvis()');await flush();assert.deepEqual(h.cues(),['startup']);assert.equal(sessions.length,0);assert.equal(app.speechRequests.length,0);
  app.click('mic');for(let i=0;i<4;i++)await flush();assert.ok(h.cues().includes('listening'));
  sessions[0].onMessage({source:'user',message:'What bookings are there?',event_id:'sound-one'});assert.equal(h.cues().at(-1),'thinking');
  await sessions[0].clientTools.lookup_records({entity:'bookings',view:'list'});assert.ok(h.cues().includes('checking'));assert.equal(h.cues().at(-1),'thinking');
  sessions[0].onModeChange({mode:'listening'});assert.equal(app.phase(),'thinking','an idle SDK mode must not cancel work still awaiting a reply');
  sessions[0].onModeChange({mode:'speaking'});assert.equal(h.cues().at(-1),'response');sessions[0].onInterruption();assert.equal(h.cues().at(-1),'listening');
  app.click('mic');assert.equal(h.cues().at(-1),'shutdown');
  app.el('jarvis-sounds').listeners.change({target:{checked:false}});const count=h.cues().length;app.click('test-sounds');await flush();assert.equal(h.cues().length,count);assert.match(app.el('jarvis-sound-note').textContent,/Turn on Interface sounds/);
  app.el('jarvis-sounds').listeners.change({target:{checked:true}});app.el('jarvis-muted').listeners.change({target:{checked:true}});const muted=h.cues().length;app.click('test-sounds');app.click('close');assert.equal(h.cues().length,muted);assert.equal(h.contexts[0].state,'closed');
});

test('audio unlock is awaited, cancelled work stays silent, and the closing cue finishes before its context is released',async()=>{
  const app=desktopRuntime(),h=installSoundProbe(app,{locked:true});app.run('openJarvis()');assert.deepEqual(h.cues(),[]);h.unlock();await flush();assert.deepEqual(h.cues(),['startup']);
  app.click('settings');app.click('test-sounds');await flush();assert.equal(h.cues().at(-1),'preview');
  app.click('close');assert.equal(h.cues().at(-1),'shutdown');assert.equal(h.contexts[0].state,'running');app.runDelay(1300);assert.equal(h.contexts[0].state,'closed');
  const hidden=desktopRuntime(),hh=installSoundProbe(hidden,{locked:true});hidden.run('openJarvis()');hidden.context.document.hidden=true;hidden.docListeners.visibilitychange();hh.unlock();await flush();assert.deepEqual(hh.cues(),[]);hidden.click('close');assert.equal(hh.contexts[0].state,'closed');
});

test('sound volume and switch survive reload; rapid reopen cancels the old tail and hide stops the new sounds',async()=>{
  const saved=new Map(),app=desktopRuntime({voiceStorage:saved}),h=installSoundProbe(app);app.run('openJarvis()');await flush();
  app.el('jarvis-sound-volume').listeners.input({target:{value:'35'}});assert.equal(saved.get('sv_jarvis_sound_volume'),'0.35');app.click('close');app.run('openJarvis()');await flush();assert.equal(h.contexts[0].state,'closed');assert.equal(h.contexts[1].state,'running');app.runDelay(1300);assert.equal(h.contexts[1].state,'running');
  app.click('settings');app.click('test-sounds');const count=h.cues().length;app.context.document.hidden=true;app.docListeners.visibilitychange();assert.equal(h.events.at(-1),'stop');assert.equal(h.cues().length,count);app.context.document.hidden=false;
  app.el('jarvis-sounds').listeners.change({target:{checked:false}});app.click('close');
  const restored=desktopRuntime({voiceStorage:saved}),rh=installSoundProbe(restored);restored.run('openJarvis()');await flush();assert.equal(restored.el('jarvis-sounds').checked,false);assert.equal(restored.el('jarvis-sound-volume').value,35);assert.deepEqual(rh.cues(),[]);restored.click('close');
});

async function personalRuntime(options={}){
  const {createPersonalMemory}=await import('../tools/jarvis/personal-memory.mjs');const api=require('../src/assistant/jarvis-personal.js');
  let saved=api.empty();const memory=createPersonalMemory({store:{load:()=>structuredClone(saved),save:value=>{saved=structuredClone(value);}}});
  const app=desktopRuntime({agent:true,...options});app.run(fs.readFileSync(path.join(root_,'src/assistant/jarvis-personal.js'),'utf8'));
  app.run('D.props=[{id:"mar",name:"Villa Mar"},{id:"marjals",name:"Villa Marjals"}];D.bookings=[{id:"b1",propId:"mar",checkIn:"2026-10-19",checkOut:"2026-10-21",status:"confirmed"}]');
  const previous=app.context.fetch;app.context.fetch=async(url,init)=>{
    if(String(url).endsWith('/health')){const res=await previous(url,init),body=await res.json();return {ok:true,json:async()=>({...body,personalMemory:{available:true,...memory.get()}})};}
    if(String(url).endsWith('/chat')){const input=JSON.parse(init.body),decision=memory.execute({text:input.text,operation:input.context.memoryRequest?.intent,properties:input.context.memoryProperties,version:input.context.memoryRequest?.version});return {ok:true,json:async()=>({decision,personalMemory:{available:true,...memory.get()}})};}
    return previous(url,init);
  };
  return {app,memory};
}
test('owner preferences save through the actual typed overlay, survive close/new conversation, resolve aliases and can be removed in settings',async()=>{
  const {app,memory}=await personalRuntime();app.run('openJarvis()');await flush();
  await app.context.SV_JARVIS.send('From now on call me Sir, not Antonio');assert.equal(memory.get().preferredAddress,'Sir');assert.match(app.el('jarvis-input').placeholder,/Sir/);
  app.finishSpeech();await app.context.SV_JARVIS.send('When I say Villa Lumina, I mean Villa Mar');assert.equal(memory.get().aliases[0].propertyId,'mar');app.finishSpeech();
  app.click('new');assert.equal(app.context.SV_JARVIS_PERSONAL.address(),'Sir');app.click('close');assert.equal(app.context.SV_JARVIS_PERSONAL.address(),'Antonio');
  app.run('openJarvis()');await flush();assert.equal(app.context.SV_JARVIS_PERSONAL.address(),'Sir');
  const result=await app.context.SV_JARVIS.preview.tool('lookup_records',{entity:'bookings',view:'list',property:'Villa Lumina'});assert.equal(result.rows[0].id,'b1');
  app.click('settings');app.click('memory-remove-alias',{alias:'Villa Lumina'});await flush();assert.equal(memory.get().aliases.length,0);
  app.finishSpeech();app.click('memory-clear-address');await flush();assert.equal(memory.get().preferredAddress,'');app.click('close');
});
test('live owner preference turns are app-owned and the next real live-session context loads the saved form of address',async()=>{
  const sessions=[];const {app,memory}=await personalRuntime({liveSdk:{Conversation:{startSession:async options=>{sessions.push(options);return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate(){}};}}}});
  app.run('openJarvis()');await flush();app.click('mic');for(let i=0;i<4;i++)await flush();
  sessions[0].onMessage({source:'user',message:'Call me Sir from now on',event_id:'personal-one'});for(let i=0;i<4;i++)await flush();assert.equal(memory.get().preferredAddress,'Sir',JSON.stringify({phase:app.phase(),error:app.el('jarvis-error').textContent,lines:app.texts(app.el('jarvis-transcript'))}));
  app.click('close');app.run('openJarvis()');await flush();app.click('mic');for(let i=0;i<4;i++)await flush();
  assert.equal(JSON.parse(sessions.at(-1).dynamicVariables.app_context).personalMemory.preferredAddress,'Sir');app.click('close');
});

test('a missing villa clarification keeps the nickname and saves only after the owner identifies a current villa',async()=>{
  const {app,memory}=await personalRuntime();app.run('openJarvis()');await flush();
  await app.context.SV_JARVIS.send('When I say Sunshine, I mean Missing Villa');assert.equal(memory.get().aliases.length,0);app.finishSpeech();
  await app.context.SV_JARVIS.send('Villa Mar');assert.deepEqual(memory.get().aliases,[{alias:'Sunshine',propertyId:'mar',propertyName:'Villa Mar'}]);app.click('close');
});
test('Fish desktop and phone use incremental PCM, replace a saved live-agent choice and wait for actual playback completion',async()=>{
  for(const desktop of [true,false]){
    let starts=0;const app=desktopRuntime({agent:true,desktop,fishSpeech:true,voiceChoice:'live',liveSdk:{Conversation:{startSession:async()=>{starts++;}}},understand:async()=>({kind:'reply',text:'Ready when you are.'})});
    app.run('openJarvis()');await flush();assert.equal(app.el('jarvis-voice-choice').value,'fish');app.submit('Hello');for(let i=0;i<4;i++)await flush();
    assert.equal(starts,0);assert.equal(app.utterances.length,0);assert.equal(app.speechRequests.length,1);assert.equal(app.speechRequests[0].text,'Ready when you are.');
    app.runDelay(50);assert.equal(app.phase(),'speaking');const sources=app.pcmSources.filter(s=>s.buffer?.duration>0.001);assert.equal(sources.length,1);
    sources[0].onended();await flush();assert.notEqual(app.phase(),'speaking');app.click('close');
  }
});
test('restored live voice waits for a microphone tap, migrates a saved Fish choice, and preserves explicit Device voice on both layouts',async()=>{
  for(const desktop of [true,false]){
    const saved=new Map([['sv_jarvis_voice','fish']]);let starts=0;
    const liveSdk={Conversation:{startSession:async()=>{starts++;return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0};}}};
    const app=desktopRuntime({agent:true,desktop,customSpeech:true,liveSdk,voiceStorage:saved});app.run('openJarvis()');await flush();
    assert.equal(app.el('jarvis-voice-choice').value,'live');assert.equal(saved.get('sv_jarvis_voice'),'live');
    assert.equal(app.speechRequests.length,0);assert.equal(starts,0);assert.equal(app.recs.length,0);
    app.click('mic');await flush();assert.equal(starts,1);assert.equal(app.recs.length,0);assert.equal(app.speechRequests.length,0);
    app.el('jarvis-voice-choice').listeners.change({target:{value:'device'}});app.click('close');
    const reopened=desktopRuntime({agent:true,desktop,customSpeech:true,liveSdk,voiceStorage:saved});reopened.run('openJarvis()');await flush();assert.equal(reopened.el('jarvis-voice-choice').value,'device');reopened.click('close');
    const fresh=desktopRuntime({agent:true,desktop,liveSdk,voiceStorage:new Map()});fresh.run('openJarvis()');await flush();assert.equal(fresh.el('jarvis-voice-choice').value,'live');assert.equal(starts,1);fresh.click('close');
  }
});
test('an early microphone tap waits for live health instead of silently entering the slow Hermes speech loop',async()=>{
  for(const desktop of [true,false]){
    let release,options,starts=0;const healthGate=new Promise(r=>{release=r;});
    const liveSdk={Conversation:{startSession:async o=>{starts++;options=o;return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0};}}};
    const app=desktopRuntime({agent:true,desktop,liveSdk,healthGate});app.run('openJarvis()');app.click('mic');
    await flush();assert.equal(app.phase(),'connecting');assert.equal(app.recs.length,0);assert.equal(starts,0);
    release();await flush();assert.equal(options.connectionType,'webrtc');assert.equal(starts,1);assert.equal(app.recs.length,0);app.click('close');
  }
});
test('closing during the initial live health check cannot start late recording or a legacy fallback',async()=>{
  let release,starts=0;const healthGate=new Promise(r=>{release=r;});
  const app=desktopRuntime({agent:true,healthGate,liveSdk:{Conversation:{startSession:async()=>{starts++;}}}});app.run('openJarvis()');app.click('mic');await flush();app.click('close');release();await flush();assert.equal(starts,0);assert.equal(app.recs.length,0);
});
test('live overlay on desktop and phone: direct records, one voice, exact WhatsApp read-back and owner-only approval',async()=>{
  for(const desktop of [true,false]){
    let options,ended=0;const mic=[],vol=[],sends=[],key='a'.repeat(20),chat={key,name:'Bex',kind:'direct',detail:'Direct chat · number ending 0001',version:1};
    const liveSdk={Conversation:{startSession:async opts=>{options=opts;return {endSession:async()=>{ended++;},setMicMuted:v=>mic.push(v),setVolume:v=>vol.push(v.volume),getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate(){},sendUserMessage(){}};}}};
    const app=desktopRuntime({agent:true,desktop,liveSdk,understand:async()=>{throw Error('Direct live tools should not call Hermes');},whatsappFetch:async(url,init={})=>({ok:true,status:200,json:async()=>{
      if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};
      if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],chat,unreadCount:0};
      const body=JSON.parse(init.body);if(url.endsWith('/review'))return {reviewToken:'R'.repeat(24),version:1,text:body.text,recipient:chat,expiresAt:Date.now()+300000};
      if(url.endsWith('/send')){sends.push(body);return {status:'sent'};}throw Error('Unexpected call');
    }})});
    app.run(`D.props=[{id:'p',name:'Villa Test'}];D.sessions=[{id:'s',propId:'p',date:addDays(today(),1)}];openJarvis()`);await flush();app.click('mic');await flush();assert.equal(options.connectionType,'webrtc');assert.equal(app.recs.length,0);
    options.onMessage({source:'user',message:'Who cleans Villa Test tomorrow?',event_id:1});const result=JSON.parse(await options.clientTools.lookup_records({entity:'cleanings',property:'Villa Test',view:'details',field:'crew',start:'tomorrow',end:'tomorrow'}));assert.equal(result.rows[0].title,'Villa Test');assert.match(result.text,/No one is assigned/);assert.equal(app.utterances.length,0);
    options.onMessage({source:'ai',message:'No one is assigned yet. We still need one cleaner.',event_id:2});options.onModeChange({mode:'speaking'});assert.equal(app.phase(),'speaking');assert.equal(app.utterances.length,0);
    options.onMessage({source:'user',message:'Ask Bex if ten works tomorrow',event_id:3});await options.clientTools.whatsapp_request({kind:'write',name:'Bex',text:'Does ten work tomorrow?'});assert.equal(app.el('jarvis-voice-review').hidden,false);assert.notEqual(mic.at(-1),true,'the microphone stays open while the app speaks');assert.equal(vol.at(-1),0,'the agent is silent while the app speaks');assert.equal(sends.length,0);
    options.onModeChange({mode:'listening'});app.finishSpeech();await flush();assert.notEqual(mic.at(-1),true);assert.equal(vol.at(-1),1);assert.equal(app.el('jarvis-review-note').textContent,'Say “Approve and send”, or approve below. Say “Read the message” to hear it in full.');
    options.onMessage({source:'user',message:'Approve and send',event_id:4});await flush();assert.equal(sends.length,1);assert.equal(sends[0].text,'Does ten work tomorrow?');options.onMessage({source:'user',message:'Approve and send',event_id:4});await flush();assert.equal(sends.length,1);
    assert.match(await options.clientTools.whatsapp_request({intent:'{"kind":"approve"}'}),/paused/);app.finishSpeech();await flush();app.click('close');assert.equal(ended,1);assert.equal(app.recs.length,0);
  }
});
const SEARCH_RESULT={connection:{state:'open'},chats:[],page:{total:1,offset:0,nextOffset:null},search:{days:7,terms:['private chef'],expanded:['private chef','chef privado']},coverage:{history:{days:7,complete:false,summary:'Incomplete: fictional coverage.'}},
  results:[{id:'c'.repeat(20),chat:'a'.repeat(20),name:'Julie (fictional)',kind:'direct',from:'contact',sender:'',text:'Hemos reservado nuestro propio chef privado, gracias.',at:Math.floor(Date.now()/1000)-2*86400,answered:false,matched:['chef privado'],context:[]}]};
const texts=n=>[n?.textContent||'',...(n?.children||[]).flatMap(texts)].filter(Boolean);
test('typed search without a live session: one Hermes answer is both displayed and spoken, in full, with nothing sent',async()=>{
  const inboxUrls=[],readings=[];
  const english='Julie (fictional) wrote 2 days ago: “Hemos reservado nuestro propio chef privado, gracias.” — “We have booked our own private chef, thanks.” She arranged it herself. Note: history is incomplete; older messages may only be on your phone.';
  const app=desktopRuntime({agent:true,liveSdk:{Conversation:{startSession:async()=>{throw Error('No live session in this test');}}},
    understand:async body=>{readings.push(body.context?.dialogue?.whatsappReading);return {kind:'reply',text:english};},
    whatsappFetch:async url=>({ok:true,status:200,json:async()=>{if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};if(url.includes('/inbox')){inboxUrls.push(url);return SEARCH_RESULT;}throw Error('Unexpected '+url);}})});
  app.run('openJarvis()');await flush();app.submit('Did anyone ask about a private chef in the last seven days?');
  for(let i=0;i<6;i++)await flush();
  for(let i=0;i<6&&app.spoken.map(u=>u.text).join(' ').replace(/\s+/g,' ').trim().length<english.length;i++){app.finishSpeech();await flush();}
  assert.equal(new URL(inboxUrls[0],'http://x.invalid').searchParams.get('query'),'days:7|private chef');assert.equal(readings[0].kind,'search');
  const spoken=app.spoken.map(u=>u.text).join(' ').replace(/\s+/g,' ').trim(),shown=texts(app.el('jarvis-transcript'));
  assert.equal(spoken,english,'the full answer is spoken once');assert.equal(shown.filter(t=>t===english).length,1,'the same answer is displayed once');
  assert.ok(!shown.some(t=>/cannot find a chat/.test(t)));app.click('close');
});
test('live session search (typed, spoken, or opening words lost): the agent gives the only answer, spoken and displayed; interruption and resume follow its playback',async()=>{
  for(const how of ['typed','spoken','spoken, opening words lost']){
    let options;const agentMessages=[],notes=[],inboxUrls=[];
    const app=desktopRuntime({agent:true,liveSdk:{Conversation:{startSession:async o=>{options=o;return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate:t=>notes.push(t),sendUserMessage:t=>agentMessages.push(t)};}}},
      understand:async()=>{throw Error('Live search must not start a second (Hermes) answer');},
      whatsappFetch:async url=>({ok:true,status:200,json:async()=>{if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};if(url.includes('/inbox')){inboxUrls.push(url);return SEARCH_RESULT;}throw Error('Unexpected '+url);}})});
    app.run('openJarvis()');await flush();app.click('mic');await flush();
    const said=how==='spoken, opening words lost'?'Ask about the private chef in the last seven days.':'Did anyone ask about a private chef in the last seven days?';
    if(how==='typed')app.submit(said);else options.onMessage({source:'user',message:said,event_id:1});
    await flush();
    assert.deepEqual(agentMessages,how==='typed'?[said]:[],how+': the agent receives the turn');assert.equal(inboxUrls.length,0,'no parallel app search');
    const note=notes.find(n=>/topic search/.test(n));assert.ok(note,how+': the agent is told which search to run');assert.match(note,/kind "history" and query "private chef" and no name/);assert.doesNotMatch(note,/Hemos|Julie/,'the note carries no message content');
    /* The agent's tool request, as seen in the real transcripts. */
    const result=JSON.parse(await options.clientTools.whatsapp_request(how==='spoken, opening words lost'?{limit:10,kind:'history',name:'private chef',offset:0}:{kind:'history',limit:10,offset:0,query:'private chef'}));
    assert.equal(result.reading.kind,'search');assert.equal(result.reading.results[0].name,'Julie (fictional)');assert.match(result.instruction,/English translation/);
    assert.equal(new URL(inboxUrls[0],'http://x.invalid').searchParams.get('query'),'days:7|private chef');
    const answer='Julie wrote two days ago, in Spanish, that they have booked their own private chef. Note: history is incomplete; older messages may only be on your phone.';
    options.onMessage({source:'ai',message:answer,event_id:2});options.onModeChange({mode:'speaking'});await flush();
    assert.equal(app.phase(),'speaking','not listening while the answer plays');
    const shown=texts(app.el('jarvis-transcript'));assert.equal(shown.filter(t=>t===answer).length,1,'the spoken answer is the one displayed answer');
    assert.deepEqual(app.spoken.filter(u=>u.text.trim()),[],'no second (app) voice');assert.equal(app.speechRequests.length,0);
    if(how==='spoken'){options.onInterruption();await flush();assert.equal(app.phase(),'listening','an interruption returns to listening at once');assert.deepEqual(app.spoken.filter(u=>u.text.trim()),[]);}
    else{options.onModeChange({mode:'listening'});await flush();assert.ok(['listening','paused'].includes(app.phase()),'after playback finishes: '+app.phase());}
    app.click('close');
  }
});
test('regression: when the agent handles a garbled search turn, its history-without-chat request runs the search, never a contact lookup',async()=>{
  let options;const inboxUrls=[];
  const app=desktopRuntime({agent:true,liveSdk:{Conversation:{startSession:async o=>{options=o;return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate(){},sendUserMessage(){}};}}},
    understand:async()=>{throw Error('The agent presents live tool results itself');},
    whatsappFetch:async url=>({ok:true,status:200,json:async()=>{
      if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};
      if(url.includes('/inbox')){inboxUrls.push(url);return {connection:{state:'open'},chats:[{key:'a'.repeat(20),name:'Bex',kind:'direct'}],page:{total:1,offset:0,nextOffset:null},search:{days:7,terms:['private chef'],expanded:['private chef','chef privado']},coverage:{history:{days:7,complete:false,summary:'Incomplete: fictional coverage.'}},
        results:[{id:'c'.repeat(20),chat:'b'.repeat(20),name:'Julie (fictional)',kind:'direct',from:'contact',text:'We booked our own private chef, thanks!',at:Math.floor(Date.now()/1000)-86400,answered:false,matched:['private chef'],context:[]}]};}
      throw Error('Unexpected call '+url);
    }})});
  app.run('openJarvis()');await flush();app.click('mic');await flush();
  options.onMessage({source:'user',message:'What is this? Did anyone ask about a private chef in the last seven days? ... social diversity, encouraging open dialogue, and',event_id:1});
  const result=JSON.parse(await options.clientTools.whatsapp_request({kind:'history',limit:10,offset:0,query:'private chef'}));
  assert.equal(result.error,undefined);assert.equal(result.reading.kind,'search');assert.equal(result.reading.results[0].name,'Julie (fictional)');assert.equal(result.reading.coverage.history.complete,false);
  assert.match(result.instruction,/English translation/);assert.match(result.instruction,/never that nobody asked/);
  assert.equal(new URL(inboxUrls.at(-1),'http://x.invalid').searchParams.get('query'),'days:7|private chef');
  assert.doesNotMatch(JSON.stringify(result),/cannot find a chat named/);app.click('close');
});
test('live WhatsApp readings use the natural voice directly and only completed, uninterrupted audio marks them read',async()=>{
  for(const outcome of ['complete','interrupt','new-turn']){
    let options;const reads=[],key='a'.repeat(20),chat={key,name:'Bex',kind:'direct',detail:'Direct chat',version:1};
    const app=desktopRuntime({agent:true,liveSdk:{Conversation:{startSession:async o=>{options=o;return {endSession:async()=>{},setMicMuted(){},setVolume(){},getInputVolume:()=>0,getOutputVolume:()=>0};}}},understand:async()=>{throw Error('Live reads must not call Hermes');},whatsappFetch:async(url,init={})=>({ok:true,json:async()=>{
      if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],messages:[{id:'b'.repeat(20),chat:key,name:'Bex',from:'contact',text:'¿Podemos empezar a las diez?'}],page:{total:1,nextOffset:null}};
      if(url.endsWith('/read')){reads.push(JSON.parse(init.body));return {read:1};}throw Error('Unexpected endpoint');
    }})});
    app.run('openJarvis()');await flush();app.click('mic');await flush();options.onMessage({source:'user',message:'Check my last message on WhatsApp',event_id:1});
    const result=JSON.parse(await options.clientTools.whatsapp_request({kind:'recent',limit:1}));assert.match(result.reading.messages[0].text,/diez/);assert.equal(app.utterances.length,0);assert.equal(app.speechRequests.length,0);assert.equal(reads.length,0);
    options.onMessage({source:'ai',message:'Bex asks whether you can start at ten.',event_id:2});options.onModeChange({mode:'speaking'});
    if(outcome==='interrupt')options.onInterruption();if(outcome==='new-turn')options.onMessage({source:'user',message:'Wait a moment',event_id:3});options.onModeChange({mode:'listening'});await flush();assert.equal(reads.length,outcome==='complete'?1:0);app.click('close');
  }
});
test('Jarvis navigation avoids workspace data-nav capture; Tasks (not yet themed) closes Jarvis and navigates on desktop and phone',async()=>{
  for(const desktop of [true,false])for(const [action,destination] of [['nav-tasks','tasks']]){
    const app=desktopRuntime({desktop}),visited=[];app.context.workspaceNavigate=target=>visited.push(target);app.run('openJarvis()');await flush();
    assert.doesNotMatch(app.root().innerHTML,/\sdata-nav=/);assert.match(app.root().innerHTML,/data-jarvis-nav="whatsapp"/);
    app.click(action);assert.deepEqual(visited,[destination]);assert.equal(app.root().removed,true);assert.equal(app.background.hasAttribute('inert'),false);
  }
});
test('WhatsApp announcements wait for audio opt-in, finish before marking read, pause quiet recognition and stop on close',async()=>{
  const app=desktopRuntime({agent:true});let hooks,stopped=0;const read=[],m={id:'a'.repeat(20),name:'Sample cleaner',text:'Hello',unread:true};
  app.context.SV_JARVIS_WHATSAPP.createMonitor=options=>{hooks=options;return {refresh:async()=>null,markRead:async ids=>read.push(...ids),stop(){stopped++;}};};
  app.run('openJarvis()');await flush();hooks.onUpdate({connection:{state:'open'},unreadCount:1,recent:[m]});hooks.onArrivals([m]);assert.equal(app.utterances.length,0);
  app.click('message-audio');assert.equal(app.utterances.length,1);assert.equal(read.length,0);app.finishSpeech();await flush();assert.deepEqual(read,[m.id]);
  app.click('mic');const rec=app.recs.at(-1),next={...m,id:'b'.repeat(20)};hooks.onUpdate({connection:{state:'open'},unreadCount:1,recent:[next]});hooks.onArrivals([next]);assert.equal(rec.aborted,true);assert.equal(read.length,1);
  app.finishSpeech();await flush();app.runDelay(450);assert.equal(app.phase(),'listening');assert.equal(read.length,2);
  const last={...m,id:'c'.repeat(20)};hooks.onUpdate({connection:{state:'open'},unreadCount:1,recent:[last]});hooks.onArrivals([last]);app.click('close');app.finishSpeech();await flush();assert.equal(read.length,2);assert.equal(stopped,1);
});
test('unread WhatsApp question is answered from the inbox and interrupted or muted speech never marks messages read',async()=>{
  for(const outcome of ['complete','interrupt','mute']){
    const app=desktopRuntime({agent:true}),read=[],m={id:'a'.repeat(20),name:'Sample cleaner',text:'Can we start at ten?'};
    app.context.SV_JARVIS_WHATSAPP.parseCommand=()=>({kind:'unread'});
    app.context.SV_JARVIS_WHATSAPP.createMonitor=()=>({refresh:async()=>({connection:{state:'open'},unreadCount:1,unread:[m]}),markRead:async ids=>read.push(...ids),stop(){}});
    app.run('openJarvis()');await flush();if(outcome==='mute'){app.el('jarvis-muted').listeners.change({target:{checked:true}});}
    await app.run(`SV_JARVIS.send('Hi Jarvis, do we have unread WhatsApp messages?')`);
    assert.equal(read.length,0);if(outcome==='interrupt')app.click('close');app.finishSpeech();await flush();assert.equal(read.length,outcome==='complete'?1:0,outcome);
  }
});

test('custom voice: actual overlay uses ElevenLabs audio, waits for playback before listening and offers the device voice without cloud synthesis',async()=>{
  const app=desktopRuntime({agent:true,customSpeech:true,reply:'At your service.'});app.run('openJarvis()');await flush();
  assert.equal(app.el('jarvis-voice-choice').value,'elevenlabs');app.click('mic');app.hear('Hello');await flush();
  assert.deepEqual(app.speechRequests,[{text:'At your service.'}]);assert.equal(app.utterances.length,0);assert.equal(app.recs.length,1);
  app.audios[0].onplaying();assert.equal(app.phase(),'speaking');app.runDelay(450);assert.equal(app.recs.length,1);
  app.audios[0].onended();await flush();app.runDelay(450);assert.equal(app.recs.length,2);
  app.click('settings');app.el('jarvis-voice-choice').listeners.change({target:{value:'device'}});assert.equal(app.el('jarvis-voice-choice').value,'device');
  app.click('test-speaker');assert.equal(app.utterances.length,1);assert.equal(app.speechRequests.length,1);
  app.el('jarvis-voice-choice').listeners.change({target:{value:'elevenlabs'}});app.click('test-speaker');await flush();app.audios[0].onerror();await flush();
  assert.equal(app.el('jarvis-caption-text').textContent,'');assert.match(app.el('jarvis-error').textContent,/Using Device voice/);app.finishSpeech();assert.equal(app.phase(),'idle');app.runDelay(450);assert.equal(app.recs.length,2);
  // Once custom audio has actually started, an error pauses instead of repeating a partly heard reply.
  app.el('jarvis-voice-choice').listeners.change({target:{value:'elevenlabs'}});app.click('test-speaker');await flush();app.audios[0].onplaying();app.audios[0].onerror();await flush();assert.equal(app.phase(),'paused');assert.match(app.el('jarvis-error').textContent,/Play reply/);app.click('close');
});

test('iPhone gesture gate: a microphone tap enables a later spoken reply before recording, including when listening sounds are off',async()=>{
  const app=desktopRuntime({speechGate:true,desktop:false,reply:'Your connection is working.'});app.run('openJarvis()');await flush();
  assert.equal(app.spoken.length,0);assert.equal(app.primes.length,0);
  app.el('jarvis-sounds').listeners.change({target:{checked:false}});
  app.click('mic');assert.equal(app.phase(),'listening');assert.equal(app.primes.length,1);assert.equal(app.primes[0].volume,0);
  const primeAt=app.audioEvents.indexOf('prime'),recordAt=app.audioEvents.indexOf('record');
  assert.ok(primeAt>=0&&primeAt<recordAt);assert.ok(app.audioEvents.slice(primeAt+1,recordAt).includes('cancel'));
  app.hear('Hello');await flush();assert.equal(app.spoken.filter(u=>u.text.trim()).length,1);
  app.finishSpeech();app.runDelay(450);assert.equal(app.recs.length,2);
  app.hear('Hello again');await flush();assert.equal(app.spoken.filter(u=>u.text.trim()).length,2);
  app.click('close');
});

test('iPhone gesture gate: typed submit enables an asynchronous reply and direct Play reply works after audio is blocked',async()=>{
  const app=desktopRuntime({speechGate:true,agent:true,reply:'I can speak.'});app.run('openJarvis()');await flush();
  app.submit('Hello');await flush();assert.equal(app.spoken.filter(u=>u.text.trim()).length,1);assert.equal(app.recs.length,0);
  const blocked=app.utterances.at(-1);blocked.onerror({error:'not-allowed'});
  assert.equal(app.phase(),'paused');assert.match(app.el('jarvis-error').textContent,/Tap Play reply once/);
  app.click('replay');assert.equal(app.spoken.filter(u=>u.text.trim()).length,2);assert.equal(app.utterances.at(-1).text,'I can speak.');app.finishSpeech();
  assert.equal(app.phase(),'idle');assert.equal(app.recs.length,0);app.click('close');
});

test('failed or stalled speech pauses the conversation instead of silently recording the next turn',async()=>{
  for(const failure of ['not-allowed','audio-busy','timeout']){
    const app=desktopRuntime({reply:'Hello.'});app.run('openJarvis()');await flush();app.click('mic');app.hear('Hello');await flush();
    const u=app.utterances.at(-1);
    if(failure==='timeout')app.runDelay(6000);else u.onerror({error:failure});
    assert.equal(app.phase(),'paused',failure);assert.match(app.el('jarvis-error').textContent,/Play reply/);
    u.onend?.();app.runDelay(450);assert.equal(app.recs.length,1,failure);app.click('close');
  }
});
test('desktop: one tap gives a voice turn; the microphone stays off through every reply chunk and returns only after the final one',async()=>{
  const app=desktopRuntime();app.run('openJarvis()');await flush();
  assert.equal(app.recs.length,0);assert.equal(app.phase(),'idle');assert.equal(app.el('jarvis-keep').attrs['aria-pressed'],'true');
  app.click('mic');assert.equal(app.recs.length,1);assert.equal(app.phase(),'listening');
  app.hear('How is today looking?');await flush();
  assert.equal(app.utterances.length,1);assert.equal(app.recs.length,1);
  const [u0]=app.utterances;u0.onstart();assert.equal(app.phase(),'speaking');u0.onend();assert.equal(app.utterances.length,2);
  u0.onend();u0.onerror?.();assert.equal(app.utterances.length,2);assert.equal(app.phase(),'speaking');app.runDelay(450);assert.equal(app.recs.length,1);
  const u1=app.utterances[1];u1.onstart();u1.onend();u1.onend();
  assert.equal(app.recs.length,1);app.runDelay(450);assert.equal(app.recs.length,2);assert.equal(app.phase(),'listening');
  app.click('close');assert.equal(app.recs[1].aborted,true);for(const ms of [450,900,1800,3600])app.runDelay(ms);assert.equal(app.recs.length,2);assert.equal(app.root().removed,true);
});
test('desktop: a typed WhatsApp command with no voice loop opens the review in context and shows Paused, not Thinking',async()=>{
  const app=desktopRuntime();app.run('openJarvis()');await flush();
  await app.run(`SV_JARVIS.send('Write a WhatsApp message to Bex saying This is a dashboard review test.')`);
  assert.equal(app.phase(),'paused');assert.equal(app.el('jarvis-status').textContent,'Paused');assert.equal(app.el('jarvis-mic').attrs['aria-label'],'Start conversation');
  assert.equal(app.wa.open.length,1);assert.equal(app.recs.length,0);assert.equal(app.el('jarvis-context').hidden,false);
  app.click('nav-overview');assert.equal(app.wa.close,1);assert.equal(app.el('jarvis-context').hidden,true);
});
test('desktop: opening WhatsApp pauses, then the mic can resume while the inbox stays visible; close cleans up',async()=>{
  const app=desktopRuntime();app.run('openJarvis()');await flush();
  app.click('mic');assert.equal(app.recs.length,1);
  app.click('nav-whatsapp');
  assert.equal(app.recs[0].aborted,true);assert.equal(app.wa.open.length,1);assert.equal(app.wa.open[0].host,app.el('jarvis-wa-host'));assert.equal(app.el('jarvis-context').hidden,false);
  app.click('mic');assert.equal(app.recs.length,2);assert.equal(app.el('jarvis-error').textContent,'');assert.equal(app.phase(),'listening');
  await app.run(`SV_JARVIS.send('What is next?')`);const u=app.utterances.at(-1);u.onstart();u.onend();app.utterances.at(-1).onstart?.();app.utterances.at(-1).onend?.();
  app.runDelay(450);assert.equal(app.recs.length,2);
  app.click('close');
  assert.equal(app.wa.close,1);assert.equal(app.root().removed,true);assert.equal(app.background.hasAttribute('inert'),false);
  for(const ms of [450,900,1800,3600])app.runDelay(ms);assert.equal(app.recs.length,2);
});
test('iPhone waits for audio unlock and capture before recognition; speech releases capture and the next turn reopens it',async()=>{
  let unlock,requested=0,stopped=0;const ready=new Promise(r=>{unlock=r;});
  const app=desktopRuntime({agent:true,iosDevice:true,unlock:ready,capture:async()=>{requested++;return {getTracks:()=>[{stop(){stopped++;}}]};}});
  app.run('openJarvis()');await flush();app.click('mic');assert.equal(app.phase(),'connecting');assert.equal(requested,0);assert.equal(app.recs[0].onresult!=null,true);
  unlock();await flush();assert.equal(requested,1);assert.equal(app.phase(),'listening');
  app.hear('Hello');await flush();assert.equal(stopped,1);app.finishSpeech();app.runDelay(1000);await flush();assert.equal(requested,2);assert.equal(app.phase(),'listening');
  app.click('close');assert.equal(stopped,2);
});
test('iPhone: closing while the microphone permission is pending stops the late stream and cannot restart recording',async()=>{
  let release,stopped=0;const app=desktopRuntime({agent:true,iosDevice:true,capture:()=>new Promise(r=>{release=r;})});
  app.run('openJarvis()');await flush();app.click('mic');await flush();assert.equal(app.phase(),'connecting');const rec=app.recs[0];
  app.click('close');release({getTracks:()=>[{stop(){stopped++;}}]});await flush();assert.equal(stopped,1);assert.equal(rec.aborted,true);assert.equal(app.root().removed,true);
});
test('iPhone: a stalled silent audio unlock cannot leave Connecting forever',async()=>{
  let capture=0;const app=desktopRuntime({agent:true,iosDevice:true,unlock:new Promise(()=>{}),capture:async()=>{capture++;return {getTracks:()=>[{stop(){}}]};}});
  app.run('openJarvis()');await flush();app.click('mic');assert.equal(app.phase(),'connecting');assert.equal(capture,0);
  app.runDelay(1200);await flush();assert.equal(capture,1);assert.equal(app.phase(),'listening');app.click('close');
});
test('iPhone: microphone setup times out safely, late capture is stopped and a new tap can recover',async()=>{
  let release,stopped=0,attempts=0;const app=desktopRuntime({agent:true,iosDevice:true,capture:()=>++attempts===1?new Promise(r=>{release=r;}):Promise.resolve({getTracks:()=>[{stop(){stopped++;}}]})});
  app.run('openJarvis()');await flush();app.click('mic');await flush();app.runDelay(15000);assert.equal(app.phase(),'error');assert.match(app.el('jarvis-error').textContent,/setup timed out/);assert.equal(app.recs[0].aborted,true);
  app.click('mic');await flush();assert.equal(app.phase(),'listening');release({getTracks:()=>[{stop(){stopped++;}}]});await flush();assert.equal(stopped,1);assert.equal(app.phase(),'listening');app.click('close');assert.equal(stopped,2);
});
test('iPhone: a speech service that never starts releases capture and shows a useful error',async()=>{
  let stopped=0;const app=desktopRuntime({agent:true,iosDevice:true,recognitionStarts:false,capture:async()=>({getTracks:()=>[{stop(){stopped++;}}]})});
  app.run('openJarvis()');await flush();app.click('mic');await flush();app.runDelay(8000);assert.equal(stopped,1);assert.equal(app.phase(),'error');assert.match(app.el('jarvis-error').textContent,/recognition did not start/);assert.equal(app.recs[0].aborted,true);app.click('close');
});
test('custom voice quota failure falls back once to unlocked device speech and resumes only after complete playback',async()=>{
  const app=desktopRuntime({agent:true,customSpeech:true,iosDevice:true,speechGate:true,speechError:'ElevenLabs credits or the API key usage limit are reached.'});
  app.run('openJarvis()');await flush();app.click('mic');await flush();app.hear('Hello Jarvis');await flush();
  assert.equal(app.speechRequests.length,1);assert.match(app.el('jarvis-error').textContent,/Using Device voice/);assert.equal(app.el('jarvis-voice-choice').value,'device');assert.equal(app.spoken.filter(u=>u.text.trim()).length,1);
  app.runDelay(1000);assert.equal(app.recs.length,1);app.finishSpeech();app.runDelay(1000);await flush();assert.equal(app.recs.length,2);
  app.hear('And now?');await flush();assert.equal(app.speechRequests.length,1);assert.equal(app.utterances.filter(u=>u.text.trim()).length,3);app.finishSpeech();app.click('close');
});
test('conversation mode survives long silence with capped retry delays; explicit pause still cancels everything',()=>{
  const app=runtime(),v=conversation(app,{keepAlive:true,recoverCapture:true});v.c.start();
  for(let i=0;i<8;i++){v.fail('no-speech');assert.equal(v.c.active,true);assert.ok([...v.timers.values()][0].ms<=3600);v.run();}
  v.fail('audio-capture');assert.equal(v.c.phase,'waiting');v.run();v.fail('audio-capture');v.run();v.fail('audio-capture');assert.equal(v.c.phase,'error');
  v.c.start();v.fail('no-speech');v.c.pause();v.run();assert.equal(v.c.active,false);assert.equal(v.timers.size,0);
});
test('real overlay: read chat, dictate body, hear recipient and draft, then spoken approval sends once on desktop and narrow screens',async()=>{
  for(const desktop of [true,false]){
    const sends=[],reads=[],key='a'.repeat(20),message={id:'b'.repeat(20),from:'contact',text:'Can we start at ten?'},chat={key,name:'Bex',kind:'direct',detail:'Direct chat · number ending 0001',version:1,messages:[message]};
    const app=desktopRuntime({agent:true,desktop,whatsappFetch:async(url,init={})=>({ok:true,status:200,json:async()=>{
      if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};
      if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],chat,unreadCount:1,unread:[{...message,name:'Bex'}]};
      const body=JSON.parse(init.body);if(url.endsWith('/read')){reads.push(body);return {read:1};}
      if(url.endsWith('/review'))return {reviewToken:'R'.repeat(24),version:1,text:body.text,recipient:chat,expiresAt:Date.now()+300000};
      if(url.endsWith('/send')){sends.push(body);return {status:'sent'};}throw Error('Unexpected WhatsApp call');
    }})});
    app.run('openJarvis()');await flush();app.click('mic');app.hear('Read Bex’s messages');await flush();assert.equal(reads.length,0);app.finishSpeech();await flush();assert.equal(reads.length,1);app.runDelay(450);
    app.hear('Write a message to Bex');await flush();assert.match(app.utterances.at(-1).text,/What should I say/);app.finishSpeech();app.runDelay(450);
    app.hear('Hello, the cleaning starts at ten.');await flush();assert.equal(app.el('jarvis-voice-review').hidden,false);assert.equal(app.el('jarvis-review-text').textContent,'Hello, the cleaning starts at ten.');assert.equal(sends.length,0);
    app.finishSpeech();app.runDelay(450);app.hear('Approve and send');await flush();assert.equal(sends.length,1);assert.equal(sends[0].text,'Hello, the cleaning starts at ten.');assert.match(app.utterances.at(-1).text,/Sent to Bex/);assert.equal(app.el('jarvis-voice-review').hidden,true);app.click('close');
  }
});
test('AI-first overlay handles ordinary wording and follow-ups; literal approval bypasses AI and unrelated conversation clears the draft',async()=>{
  for(const desktop of [true,false]){
    const calls=[],sends=[],key='a'.repeat(20),chat={key,name:'Bex',kind:'direct',detail:'Direct chat',version:1};
    const decisions=[{kind:'clarify',text:'Do you mean Bex?'},{kind:'whatsapp',intent:{kind:'write',chat:key,text:''}},{kind:'whatsapp',intent:{kind:'body',text:'How are you?'}},{kind:'whatsapp',intent:{kind:'edit',text:'Hi Bex, how are you doing?'}},{kind:'reply',text:'Good morning!',retainTask:false}];
    const app=desktopRuntime({agent:true,desktop,understand:async body=>{calls.push(body);return decisions.shift();},whatsappFetch:async(url,init={})=>({ok:true,status:200,json:async()=>{
      if(url.endsWith('/status'))return {available:true,requestToken:'fictional'};
      if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],chat};
      const body=JSON.parse(init.body);if(url.endsWith('/review'))return {reviewToken:'PRIVATE_REVIEW_TOKEN',version:1,text:body.text,recipient:chat,expiresAt:Date.now()+300000};
      if(url.endsWith('/send')){sends.push(body);return {status:'sent'};}throw Error('Unexpected operation');
    }})});
    app.run('openJarvis()');await flush();
    await ask(app,'Hi, could you message Bex for me?');assert.match(app.utterances.at(-1).text,/Do you mean Bex/);
    await ask(app,'Yes');assert.match(app.utterances.at(-1).text,/What should I say/);
    await ask(app,'How are you?');assert.equal(calls[2].context.dialogue.whatsapp.stage,'body');assert.equal(app.el('jarvis-review-text').textContent,'How are you?');
    await ask(app,'Actually make it friendlier');assert.equal(app.el('jarvis-review-text').textContent,'Hi Bex, how are you doing?');
    assert.ok(!JSON.stringify(calls).includes('PRIVATE_REVIEW_TOKEN'));
    await ask(app,'Yes');assert.equal(calls.length,4);assert.equal(sends.length,0);
    await ask(app,'Approve and send');assert.equal(calls.length,4);assert.equal(sends.length,0);
    app.finishSpeech();await ask(app,'Read the draft again');app.finishSpeech();await ask(app,'Approve and send');assert.equal(sends.length,1);assert.equal(calls.length,4);
    await ask(app,'Good morning');assert.match(app.utterances.at(-1).text,/Good morning/);await ask(app,'Approve and send');assert.equal(sends.length,1);app.click('close');
  }
});
test('AI app lookup speaks current booking facts, keeps context without amounts and opens the exact native record',async()=>{
  for(const desktop of [true,false]){
    const calls=[],opened=[],visited=[],decisions=[{kind:'records',query:{entity:'bookings',guest:'Example Guest',view:'payment'}},{kind:'records',query:{entity:'bookings',recordId:'selected',view:'details'}}];
    const app=desktopRuntime({agent:true,desktop,understand:async body=>{calls.push(body);return decisions.shift();}});
    app.context.workspaceNavigate=d=>visited.push(d);app.context.openBookingDetail=id=>opened.push(id);
    app.run(`D.props=[{id:'p',name:'Villa Test'}];D.bookings=[{id:'b',propId:'p',guestName:'Example Guest',checkIn:'2024-01-01',checkOut:'2024-01-08',totalPrice:4433.22,guestPhone:'PRIVATE_PHONE',notes:'PRIVATE_NOTES'}];openJarvis()`);await flush();
    await ask(app,'How much did Example Guest pay?');assert.equal(app.el('jarvis-records').hidden,false);assert.match(app.utterances.at(-1).text,/€4,433.22/);app.finishSpeech();assert.match(app.utterances.map(u=>u.text).join(' '),/cannot confirm/);assert.equal(calls[0].context.dialogue.records.coverage.bookings,1);
    await ask(app,'When do they arrive?');assert.equal(calls[1].context.dialogue.records.state.selected.id,'b');for(const v of ['4433.22','443322','PRIVATE_PHONE','PRIVATE_NOTES'])assert.ok(!JSON.stringify(calls).includes(v),v);
    app.click('records-workspace');assert.deepEqual(opened,['b']);assert.deepEqual(visited,['calendar']);assert.equal(app.root().removed,true);
  }
});
test('Bookings navigation and numbered record choices work locally without a model call or mutation',async()=>{
  const app=desktopRuntime(),visited=[];app.context.workspaceNavigate=d=>visited.push(d);
  app.run(`D.bookings=[{id:'b1',guestName:'First Example',checkIn:addDays(today(),1),checkOut:addDays(today(),3),totalPrice:20},{id:'b2',guestName:'Second Example',checkIn:addDays(today(),5),checkOut:addDays(today(),8),totalPrice:30}];openJarvis()`);await flush();const before=app.run('JSON.stringify(D)');
  await app.context.SV_JARVIS.preview.tool('lookup_records',{entity:'bookings',view:'list',start:app.run('today()')});assert.equal(app.el('jarvis-records').hidden,false);assert.equal(app.el('jarvis-record-list').children.length,2);app.click('records-option',{option:'2'});assert.match(app.utterances.at(-1).text,/Second Example/);assert.equal(app.el('jarvis-record-list').children.length,1);assert.equal(app.run('JSON.stringify(D)'),before);assert.deepEqual(visited,[]);
  app.click('nav-overview');assert.equal(app.el('jarvis-records').hidden,true);app.click('close');
});
test('rail/top Cleanings opens the themed Cleanings page inside Jarvis without navigating, stopping or starting voice',async()=>{
  for(const desktop of [true,false]){
    const app=desktopRuntime({desktop}),visited=[];app.context.workspaceNavigate=d=>visited.push(d);app.run('openJarvis()');await flush();
    app.click('nav-cleaning');assert.equal(app.root().dataset.page,'cleanings');assert.equal(app.el('jarvis-cleanings-page').hidden,false);assert.equal(app.el('jarvis-bookings-page').hidden,true);
    assert.equal(app.root().classList.contains('is-workpage'),true);assert.deepEqual(visited,[]);assert.equal(app.root().removed,false);assert.equal(app.phase(),'idle');assert.equal(app.recs.length,0);
    app.click('nav-bookings');assert.equal(app.root().dataset.page,'bookings');assert.equal(app.el('jarvis-cleanings-page').hidden,true);
    app.click('nav-overview');assert.equal(app.root().classList.contains('is-workpage'),false);app.click('close');
  }
});
test('rail/top Bookings opens the themed Bookings page inside Jarvis: no page change, no microphone, overview returns',async()=>{
  const app=desktopRuntime(),visited=[];app.context.workspaceNavigate=d=>visited.push(d);app.run('openJarvis()');await flush();
  app.click('nav-bookings');assert.equal(app.root().dataset.page,'bookings');assert.equal(app.el('jarvis-bookings-page').hidden,false);assert.equal(app.el('jarvis-records').hidden,true);
  assert.deepEqual(visited,[]);assert.equal(app.root().removed,false);assert.equal(app.phase(),'idle');assert.equal(app.recs.length,0);assert.equal(app.context.SV_JARVIS.preview.page(),'bookings');
  app.click('nav-overview');assert.equal(app.root().dataset.page,'overview');assert.equal(app.el('jarvis-bookings-page').hidden,true);assert.equal(app.context.svAfterRender===null,false);
  app.click('close');assert.equal(app.context.svAfterRender,null);
});
test('explicit AI page navigation opens only a known app destination and stops the microphone',async()=>{
  const app=desktopRuntime({agent:true,understand:async()=>({kind:'navigate',destination:'reports'})}),visited=[];app.context.workspaceNavigate=d=>visited.push(d);app.run('openJarvis()');await flush();app.click('mic');app.hear('Take me to reports please');await flush();assert.deepEqual(visited,['booking-report']);assert.equal(app.root().removed,true);assert.equal(app.recs[0].aborted,true);
});
test('record attention connects to the verified results on the right and closes without stale animation',async()=>{
  const app=desktopRuntime({reduced:false,geometry:{left:60,top:200,width:300,height:40,right:360,bottom:240}});app.run(`D.bookings=[{id:'b',guestName:'Example Guest',checkIn:today(),checkOut:addDays(today(),3),totalPrice:20}];openJarvis()`);await flush();
  app.el('jarvis-ring').getBoundingClientRect=()=>({left:600,top:100,width:400,height:400,right:1000,bottom:500});app.el('jarvis-record-title').getBoundingClientRect=()=>({left:1300,top:300,width:250,height:24,right:1550,bottom:324});
  await app.context.SV_JARVIS.preview.tool('lookup_records',{entity:'bookings',view:'list',start:app.run('today()')});assert.equal(app.el('jarvis-link').hasAttribute('hidden'),false);assert.match(app.el('jarvis-link-path').attrs.d,/ 1286\.0 312\.0$/);assert.equal(app.el('jarvis-records').classList.contains('is-attention'),true);
  app.click('records-close');assert.equal(app.el('jarvis-link').hasAttribute('hidden'),true);assert.equal(app.el('jarvis-records').classList.contains('is-attention'),false);assert.deepEqual(app.winListeners.resize,[]);app.click('close');
});
test('single-reply mode, the spoken stop phrase and every explicit pause cancel the loop and any queued resume',()=>{
  const app=runtime();
  const single=conversation(app);single.c.setContinuous(false);single.c.start();single.say('Hello');
  assert.equal(single.c.replyFinished(),false);assert.equal(single.c.phase,'idle');assert.equal(single.timers.size,0);
  const phrase=conversation(app);phrase.c.start();phrase.say('Jarvis, stop listening.');
  assert.deepEqual(phrase.transcripts,[]);assert.equal(phrase.c.phase,'paused');assert.equal(phrase.c.active,false);assert.equal(phrase.timers.size,0);
  assert.equal(app.run(`SV_JARVIS_VOICE.isStopPhrase('pause listening')`),true);assert.equal(app.run(`SV_JARVIS_VOICE.isStopPhrase('stop listening to the radio')`),false);
  const paused=conversation(app);paused.c.start();const first=paused.recs[0];paused.say('Hi');paused.c.replyFinished();assert.equal(paused.timers.size,1);
  assert.equal(paused.c.pause(),true);assert.equal(paused.timers.size,0);paused.run();assert.equal(paused.recs.length,1);
  first.cb.done('late result');assert.deepEqual(paused.transcripts,['Hi']);
  paused.c.start();const live=paused.recs.at(-1);paused.c.stop();assert.equal(live.cancelled,true);live.cb.error('no-speech');live.cb.done('late');
  assert.equal(paused.timers.size,0);assert.equal(paused.recs.length,2);assert.deepEqual(paused.transcripts,['Hi']);assert.equal(paused.c.phase,'idle');
  assert.equal(paused.c.replyFinished(),false);assert.equal(paused.timers.size,0);
});
test('silence retries with growing gaps then pauses; permission and device errors pause at once; interrupt keeps the opt-in',()=>{
  const app=runtime();const v=conversation(app);v.c.start();
  for(const ms of [900,1800,3600]){v.fail('no-speech');assert.equal(v.c.phase,'waiting');assert.equal([...v.timers.values()][0].ms,ms);v.run();assert.equal(v.recs.at(-1).kind,'retry');}
  v.fail('no-speech');assert.equal(v.c.phase,'paused');assert.equal(v.timers.size,0);assert.equal(v.recs.length,4);assert.match(v.c.note,/No speech heard/);
  for(const code of ['not-allowed','audio-capture','network']){const e=conversation(app);e.c.start();e.fail(code);assert.equal(e.c.phase,'error',code);assert.equal(e.c.active,false);assert.equal(e.timers.size,0);assert.equal(e.recs.length,1);}
  const blocked=conversation(app);blocked.c.start();blocked.fail('not-allowed');assert.match(blocked.c.note,/blocked/);blocked.c.start();assert.equal(blocked.recs.length,2);
  const talk=conversation(app);talk.c.start();talk.say('Tell me about today');talk.c.speaking();
  assert.equal(talk.c.interrupt(),true);assert.equal(talk.recs.at(-1).kind,'interrupt');assert.equal(talk.c.phase,'listening');assert.equal(talk.c.active,true);
  const idle=conversation(app);assert.equal(idle.c.interrupt(),false);assert.equal(idle.c.pause(),false);assert.equal(idle.recs.length,0);
});
test('a typed stop phrase is handled locally and opening nothing starts the microphone',async()=>{
  const app=runtime();
  await app.run(`SV_JARVIS.send('Stop listening')`);
  assert.equal(app.context.SV_JARVIS.getPhase(),'paused');assert.equal(app.timers.size,0);
});

test('cleaning focus: only the requested day or week, exact app-data property, cancelled excluded, unknown or duplicate never broadened, read-only',()=>{
  const app=runtime();
  app.run(`D.props.push({id:'casa',name:'Casa Ejemplo'});D.sessions=[
    {id:'t1',date:'2026-10-14',time:'9:00',propId:'casa',status:'scheduled'},{id:'t2',date:'2026-10-14',time:'14:00',propId:'mar',status:'done'},
    {id:'t3',date:'2026-10-14',time:'15:00',propId:'marjals',status:'scheduled'},{id:'tc',date:'2026-10-14',time:'08:00',propId:'mar',status:'cancelled'},
    {id:'tm',date:'2026-10-15',time:'10:00',propId:'marjals',status:'scheduled'},{id:'n1',date:'2026-10-19',time:'11:00',propId:'mar',status:'scheduled',cleanerIds:['a']},
    {id:'n2',date:'2026-10-21',time:'',propId:'marjals',status:'scheduled'}];
    D.bookings=[{propId:'mar',checkIn:'2026-10-14',checkOut:'2026-10-19',guestName:'GUEST_SENTINEL',guestPhone:'PHONE_SENTINEL',status:'confirmed'}];`);
  const before=app.run('JSON.stringify(D)');
  const f=q=>plain(app.run('SV_JARVIS_DATA.cleaningFocus('+JSON.stringify(q)+",'2026-10-14')"));
  const rows=r=>r.rows.map(x=>[x.date,x.time,x.property,x.status]);
  const today=f('What cleanings are scheduled today?');
  assert.equal(today.label,'14 October');assert.equal(today.multiDay,false);
  assert.deepEqual(rows(today),[['2026-10-14','09:00','Casa Ejemplo','Scheduled'],['2026-10-14','14:00','Villa Mar','Done'],['2026-10-14','15:00','Villa Marjals','Scheduled']]);
  assert.deepEqual(Object.keys(today.rows[0]).sort(),['date','dateLabel','property','status','time']);
  const casa=f('Any cleanings today at Casa Ejemplo?');assert.deepEqual(rows(casa),[['2026-10-14','09:00','Casa Ejemplo','Scheduled']]);assert.equal(casa.label,'14 October · Casa Ejemplo');
  const tomorrow=f('Cleanings tomorrow');assert.equal(tomorrow.label,'Tomorrow · 15 October');assert.deepEqual(rows(tomorrow),[['2026-10-15','10:00','Villa Marjals','Scheduled']]);
  const next=f('How many cleanings next week?');assert.equal(next.multiDay,true);assert.match(next.label,/19 Oct/);
  assert.deepEqual(rows(next),[['2026-10-19','11:00','Villa Mar','Scheduled'],['2026-10-21','','Villa Marjals','Scheduled']]);assert.equal(next.rows[0].dateLabel,app.run(`fmtDate('2026-10-19')`));
  assert.deepEqual(rows(f('Cleanings next week at Villa Mar')),[['2026-10-19','11:00','Villa Mar','Scheduled']]);
  assert.deepEqual(rows(f('cleanings for next week at Villa Mar')),[['2026-10-19','11:00','Villa Mar','Scheduled']]);
  assert.equal(f('cleanings at 10:00 today').rows.length,3);
  for(const q of ['Cleanings today at Villa Unknown','Cleanings today at Casa','cleanings at Diagonal today','Cleanings today at Casa Ejemplo Beach']){const r=f(q);assert.deepEqual(r.rows,[],q);assert.equal(r.unknownProperty,true,q);assert.match(r.empty,/isn’t a property/,q);}
  const empty=f('Cleanings tomorrow at Villa Mar');assert.deepEqual(empty.rows,[]);assert.match(empty.empty,/No cleanings scheduled tomorrow at Villa Mar/);
  const casaNext=f('cleanings for next week at Casa Ejemplo');assert.deepEqual(casaNext.rows,[]);assert.equal(casaNext.unknownProperty,false);assert.match(casaNext.empty,/for next week at Casa Ejemplo/);
  assert.deepEqual(rows(f('Cleanings today at Casa Ejemplo, please')),[['2026-10-14','09:00','Casa Ejemplo','Scheduled']]);
  for(const q of ['Cleanings today at Villa Mar and Villa Marjals','Cleanings today at Villa Mar, Villa Marjals','Cleanings today at Villa Mar or Casa Ejemplo']){const r=f(q);assert.deepEqual(r.rows,[],q);assert.equal(r.ambiguousProperty,true,q);}
  assert.equal(f('Cleanings today at all villas').rows.length,3);
  const dateOnly=f('cleanings for today and tomorrow');assert.equal(dateOnly.unknownProperty,false);assert.ok(!dateOnly.ambiguousProperty);assert.ok(dateOnly.rows.length>0);
  const answer=q=>app.run('SV_JARVIS_DATA.localAnswer('+JSON.stringify(q)+",'2026-10-14')");
  assert.match(answer('Cleanings today at Casa Ejemplo'),/1 scheduled cleaning today at Casa Ejemplo/);
  for(const q of ['Cleanings today at Villa Unknown','Cleanings today at Villa Mar and Villa Marjals']){assert.doesNotMatch(answer(q),/scheduled cleaning/,q);}
  assert.match(answer('Cleanings today at Villa Unknown'),/could not find “Villa Unknown”/);
  assert.equal(f('How is the weather?'),null);assert.deepEqual(plain(app.run(`SV_JARVIS_DATA.focusFor('What tasks are due today?')`)),{kind:'tasks',label:'Tasks'});
  const shown=JSON.stringify([today,next,casa]);for(const s of ['GUEST_SENTINEL','PHONE_SENTINEL','cleanerIds','propId'])assert.ok(!shown.includes(s),s);
  assert.equal(app.run('JSON.stringify(D)'),before);
  app.run(`D.props.push({id:'copy',name:'Casa Ejemplo'})`);
  for(const q of ['Cleanings today at Casa Ejemplo','Casa Ejemplo cleanings today']){const r=f(q);assert.deepEqual(r.rows,[],q);assert.equal(r.ambiguousProperty,true,q);}
});

/* Attention flow in the real overlay with a fake DOM and fake timers. Data is fictional and local. */
function focusApp(options={}){
  const app=desktopRuntime({route:()=>({kind:'chat'}),...options});
  app.run(`D.props=[{id:'casa',name:'Casa Ejemplo'},{id:'mar',name:'Villa Mar'}];D.sessions=[{id:'a',date:today(),time:'09:00',propId:'casa',status:'scheduled'},{id:'b',date:addDays(startOfWeek(today()),8),time:'11:00',propId:'mar',status:'scheduled'},{id:'c',date:today(),time:'12:00',propId:'mar',status:'cancelled'}];D.tasks=[{id:'t',text:'Restock towels',dueDate:today(),done:false}];`);
  app.run('openJarvis()');return app;
}
const focusRows=app=>app.el('jarvis-today-list').children.filter(li=>/\bis-focus\b/.test(li.className)).map(li=>app.texts(li).join(' '));
const ask=(app,text)=>app.run('SV_JARVIS.send('+JSON.stringify(text)+')');
test('attention: a cleanings question focuses only the requested rows, holds after the reply, then restores Today',async()=>{
  const app=focusApp();await flush();
  assert.equal(app.el('jarvis-today-title').textContent,'Calendar');assert.deepEqual(focusRows(app),[]);
  await ask(app,'What cleanings are scheduled today?');
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');assert.ok(app.el('jarvis-today-section').classList.contains('is-attention'));assert.ok(app.root().classList.contains('has-focus'));
  const rows=focusRows(app);assert.equal(rows.length,1);assert.match(rows[0],/09:00/);assert.match(rows[0],/Casa Ejemplo/);assert.doesNotMatch(rows.join(' '),/Villa Mar/);
  app.finishSpeech();
  assert.ok(app.root().classList.contains('focus-hold'));assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.runDelay(6000);
  assert.equal(app.el('jarvis-today-title').textContent,'Calendar');assert.equal(app.el('jarvis-today-section').classList.contains('is-attention'),false);
  assert.equal(app.root().classList.contains('has-focus'),false);assert.deepEqual(focusRows(app),[]);
  await ask(app,'How many cleanings next week?');
  const week=focusRows(app);assert.equal(week.length,1);assert.match(week[0],/Villa Mar/);assert.ok(week[0].includes(app.run(`fmtDate(addDays(startOfWeek(today()),8))`)));assert.doesNotMatch(week.join(' '),/Casa Ejemplo/);
  assert.equal(app.el('jarvis-today-date').textContent,app.run(`fmtDateRange(addDays(startOfWeek(today()),7),addDays(startOfWeek(today()),13))`));
});
test('attention: only the latest turn owns focus; unrelated turns, tasks, settings, Overview, voice errors and close all clean up',async()=>{
  const app=focusApp();await flush();
  await ask(app,'What cleanings are scheduled today?');app.finishSpeech();
  await ask(app,'Hello there');assert.equal(app.el('jarvis-today-title').textContent,'Calendar');assert.equal(app.root().classList.contains('has-focus'),false);
  await ask(app,'What tasks are due today?');
  assert.ok(app.root().classList.contains('has-focus'));assert.ok(app.el('jarvis-tasks-section').classList.contains('is-attention'));assert.equal(app.el('jarvis-today-section').classList.contains('is-attention'),false);assert.equal(app.el('jarvis-today-title').textContent,'Calendar');
  app.finishSpeech();
  await ask(app,'Cleanings tomorrow');assert.equal(app.el('jarvis-tasks-section').classList.contains('is-attention'),false);
  app.utterances.find(u=>!u.done)?.onstart();app.runDelay(6000);
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');assert.match(app.el('jarvis-today-date').textContent,/^Tomorrow · /);
  app.click('settings');assert.equal(app.el('jarvis-today-title').textContent,'Calendar');
  await ask(app,'Cleanings today');app.click('nav-overview');
  assert.equal(app.el('jarvis-today-title').textContent,'Calendar');assert.deepEqual(focusRows(app),[]);
  await ask(app,'Write a WhatsApp message to Bex saying hi');assert.equal(app.root().classList.contains('has-focus'),false);app.click('nav-overview');
  app.click('mic');app.hear('What cleanings are scheduled today?');await flush();
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.finishSpeech();app.runDelay(450);assert.equal(app.phase(),'listening');assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.recs.at(-1).onerror({error:'not-allowed'});
  assert.equal(app.el('jarvis-today-title').textContent,'Calendar');assert.equal(app.el('jarvis-keep').attrs['aria-pressed'],'true');
  await ask(app,'Cleanings today');app.finishSpeech();app.click('close');
  assert.equal([...app.timers.values()].filter(t=>t.ms===6000).length,0);assert.equal(app.el('jarvis-link').hasAttribute('hidden'),true);assert.deepEqual(app.winListeners.resize,[]);
});
test('connector: drawn from the ring membrane to the focused row on desktop, redrawn on resize, hidden when narrow, holding or closed',async()=>{
  const app=focusApp({geometry:{left:60,top:200,width:300,height:40,right:360,bottom:240},reduced:false});await flush();
  app.el('jarvis-ring').getBoundingClientRect=()=>({left:600,top:100,width:400,height:400,right:1000,bottom:500});
  await ask(app,'What cleanings are scheduled today?');
  const d=app.el('jarvis-link-path').attrs.d;assert.match(d,/^M\d/);assert.match(d,/ 374\.0 220\.0$/);
  const sx=Number(d.slice(1).split(' ')[0]);assert.ok(sx>600&&sx<800,String(sx));assert.equal(app.el('jarvis-link').hasAttribute('hidden'),false);
  assert.equal(app.winListeners.resize.length,1);
  const path=app.el('jarvis-link-path');path.getTotalLength=()=>100;path.getPointAtLength=l=>({x:400+l,y:220});
  assert.ok(app.rafs.length>0);app.rafs.at(-1)(1200);
  const dot=app.el('jarvis-link-dot-0');assert.ok(Number(dot.attrs.opacity)>0.5,dot.attrs.opacity);assert.ok(Number(dot.attrs.cx)>400);
  app.el('jarvis-ring').getBoundingClientRect=()=>({left:700,top:100,width:400,height:400,right:1100,bottom:500});app.resize();
  assert.notEqual(app.el('jarvis-link-path').attrs.d,d);
  app.setDesktop(false);app.resize();assert.equal(app.el('jarvis-link').hasAttribute('hidden'),true);assert.equal(focusRows(app).length,1);
  app.setDesktop(true);app.resize();assert.equal(app.el('jarvis-link').hasAttribute('hidden'),false);
  app.finishSpeech();app.resize();assert.equal(app.el('jarvis-link').hasAttribute('hidden'),true);assert.equal(app.el('jarvis-link-dot-0').attrs.opacity,'0');
  app.click('close');assert.deepEqual(app.winListeners.resize,[]);assert.equal(app.el('jarvis-link-path').attrs.d,'');
  const narrow=focusApp({desktop:false,geometry:{left:60,top:200,width:300,height:40,right:360,bottom:240}});await flush();
  await ask(narrow,'What cleanings are scheduled today?');
  assert.equal(narrow.el('jarvis-link').hasAttribute('hidden'),true);assert.ok(!narrow.el('jarvis-link-path').attrs.d);assert.equal(focusRows(narrow).length,1);
});
/* Live interruption with fictional chats and records. The live SDK, WhatsApp API and Hermes decisions are fakes; nothing is sent. */
function liveInterruptRuntime({desktop,decisions=[]}){
  let options;const mic=[],vol=[],sends=[],reviews=[],key='a'.repeat(20),chat={key,name:'Bex',kind:'direct',detail:'Direct chat · number ending 0001',version:1};
  const liveSdk={Conversation:{startSession:async o=>{options=o;return {endSession:async()=>{},setMicMuted:v=>mic.push(v),setVolume:v=>vol.push(v.volume),getInputVolume:()=>0,getOutputVolume:()=>0,sendContextualUpdate(){},sendUserMessage(){}};}}};
  const app=desktopRuntime({agent:true,desktop,liveSdk,understand:async()=>decisions.shift()||{kind:'reply',text:'Okay.'},whatsappFetch:async(url,init={})=>({ok:true,status:200,json:async()=>{
    if(url.endsWith('/status'))return {available:true,requestToken:'FICTIONAL_SESSION'};
    if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],chat,unreadCount:0};
    const body=JSON.parse(init.body);if(url.endsWith('/review')){reviews.push(body.text);return {reviewToken:'R'.repeat(24),version:1,text:body.text,recipient:chat,expiresAt:Date.now()+300000};}
    if(url.endsWith('/send')){sends.push(body);return {status:'sent'};}throw Error('Unexpected call');}})});
  let id=100;const user=async text=>{options.onMessage({source:'user',message:text,event_id:++id});await flush();};
  const said=()=>app.spoken.filter(u=>u.text.trim()).map(u=>u.text);
  /* Everything spoken after a mark, joined (the device voice speaks sentence by sentence). */
  const since=mark=>said().slice(mark).join(' ');
  /* The device voice plays one sentence at a time, so the whole spoken text is checked in the conversation panel. */
  const lastLine=()=>texts(app.el('jarvis-transcript')).at(-1);
  return {app,mic,vol,sends,reviews,user,said,spokenSince:since,lastLine,options:()=>options};
}
test('interrupting app-spoken WhatsApp reviews: barge-in, stale completions, echo, stop, Spanish revision and cancellation',async()=>{
  for(const desktop of [true,false]){
    const h=liveInterruptRuntime({desktop});h.app.run('openJarvis()');await flush();h.app.click('mic');await flush();const o=h.options();
    const note=()=>h.app.el('jarvis-review-note').textContent,heardNote='Say “Approve and send”, or approve below. Say “Read the message” to hear it in full.';
    let m=h.said().length;await h.user('Ask Bex if ten works tomorrow');await o.clientTools.whatsapp_request({kind:'write',name:'Bex',text:'Does ten work tomorrow?'});await flush();
    assert.equal(h.spokenSince(m),'Draft ready for Bex.','a short spoken result, not the whole message');
    assert.equal(h.app.el('jarvis-review-text').textContent,'Does ten work tomorrow?','the exact message is on screen');assert.equal(h.vol.at(-1),0);assert.notEqual(h.mic.at(-1),true);
    // Its own voice heard back is not a request.
    await h.user('Draft ready for Bex');assert.ok(!texts(h.app.el('jarvis-transcript')).includes('Draft ready for Bex'));
    // Antonio starts talking: playback stops at once; the cancelled utterance finishing later cannot arm approval.
    o.onVadScore({vadScore:.9});o.onVadScore({vadScore:.9});assert.equal(h.vol.at(-1),1);h.app.finishSpeech();await flush();assert.notEqual(note(),heardNote);
    m=h.said().length;await h.user('Approve and send');assert.equal(h.sends.length,0);assert.match(h.spokenSince(m),/^Ready to send to Bex\./);assert.equal(h.lastLine(),'Ready to send to Bex. Say it again to send.');
    // "Stop": playback stops, the draft stays.
    await h.user('Stop');h.app.finishSpeech();await flush();assert.equal(h.app.el('jarvis-voice-review').hidden,false);assert.notEqual(note(),heardNote);assert.equal(h.sends.length,0);
    // "No, make it Spanish": goes to the agent, revises the same draft, needs a fresh review.
    m=h.said().length;await h.user('No, make it Spanish');await o.clientTools.whatsapp_request({kind:'edit',text:'¿Te va bien a las diez mañana?',language:'es',english:'Does ten work tomorrow?'});await flush();
    assert.match(h.spokenSince(m),/^Translated to Spanish for Bex\./);assert.equal(h.lastLine(),'Translated to Spanish for Bex. Ready for review.');assert.equal(h.app.el('jarvis-review-text').textContent,'¿Te va bien a las diez mañana?');
    assert.match(h.app.el('jarvis-review-english').textContent,/Does ten work tomorrow/);
    m=h.said().length;await h.user('What does it say?');assert.match(h.spokenSince(m),/^Message to Bex,/,'full reading on request');assert.match(h.lastLine(),/^Message to Bex, .*¿Te va bien a las diez mañana\?.*In English: Does ten work tomorrow/);
    h.app.finishSpeech();await flush();assert.equal(note(),heardNote);
    await h.user('Approve and send');assert.equal(h.sends.length,1);assert.equal(h.sends[0].text,'¿Te va bien a las diez mañana?');
    await h.user('Approve and send');assert.equal(h.sends.length,1,'never sent twice');
    // A new draft, then "Cancel the message" discards it.
    await h.user('Tell Bex thanks');await o.clientTools.whatsapp_request({kind:'write',name:'Bex',text:'Thanks!'});await flush();
    await h.user('Cancel the message');assert.equal(h.app.el('jarvis-voice-review').hidden,true);h.app.finishSpeech();await flush();
    await h.user('Approve and send');assert.equal(h.sends.length,1);
    /* With the microphone open, Jarvis must never say an approval or confirmation phrase aloud. */
    assert.ok(!h.said().some(t=>/approve and send|confirm these cleanings|\bconfirm\b/i.test(t)),JSON.stringify(h.said()));h.app.click('close');
  }
});
test('interrupting a spoken cleaning plan: the plan stays, an interrupted read-back cannot be confirmed, nothing saves until heard',async()=>{
  const decisions=[{kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'results'}},{kind:'operation',operation:{action:'repeat'}}];
  const h=liveInterruptRuntime({desktop:true,decisions});
  /* The app's own save path, stubbed in memory: save() writes D where the operation reads its saved copy back. */
  h.app.run("var __store={};var DB='seravillas_v1';SV_STORAGE={getItem:k=>__store[k]||null,setItem:(k,v)=>{__store[k]=String(v);},removeItem:k=>{delete __store[k];}};save=function(){SV_STORAGE.setItem(DB,JSON.stringify(D));};uid=function(){return 'u'+Math.random().toString(36).slice(2);};render=function(){};D.props=[{id:'p',name:'Villa Test'}];D.cleaners=[];D.sessions=[];D.bookings=[{id:'b',propId:'p',guestName:'Fictional Guest',checkIn:addDays(today(),-3),checkOut:addDays(today(),1),status:'confirmed',linkedCleaningId:''}];openJarvis()");await flush();h.app.click('mic');await flush();const o=h.options();
  await h.user('Who leaves tomorrow?');await o.clientTools.lookup_records({entity:'bookings',view:'list',period:'tomorrow',dateBy:'departure'});
  let m=h.said().length;await h.user('Put cleaning when they leave');await o.clientTools.ask_hermes({request:'plan cleaning'});await flush();
  assert.match(h.spokenSince(m),/^Plan ready: Villa Test \w+ at 10:00\.$/,'a brief spoken plan');assert.match(h.lastLine(),/^For tomorrow’s departures .*Nothing is saved yet/,'the full plan is on screen');assert.equal(h.vol.at(-1),0);
  o.onVadScore({vadScore:.95});o.onVadScore({vadScore:.95});h.app.finishSpeech();await flush();
  await h.user('Go ahead and schedule it');assert.equal(h.app.run('D.sessions.length'),0,'an interrupted read-back cannot be confirmed by voice');
  assert.equal(h.app.el('jarvis-plan').hidden,false,'the plan stays after interruption');
  m=h.said().length;await h.user('Read the plan again');await o.clientTools.ask_hermes({request:'repeat'});await flush();assert.match(h.spokenSince(m),/^For tomorrow’s departures/,'read again: the full plan');
  h.app.finishSpeech();await flush();
  assert.ok(!h.said().some(t=>/approve and send|confirm these cleanings|\bgo ahead\b|\bconfirm\b/i.test(t)),'no spoken control phrases: '+JSON.stringify(h.said()));
  m=h.said().length;await h.user('Go ahead and schedule it');assert.equal(h.app.run('D.sessions.length'),1);assert.match(h.spokenSince(m),/^Scheduled one checkout cleaning\./);
  h.app.click('close');
});
