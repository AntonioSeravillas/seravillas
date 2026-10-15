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
  for(const file of ['src/utils/dates.js','src/ui/voice.js','src/assistant/jarvis-data.js','src/assistant/jarvis-voice.js','src/assistant/jarvis.js'])run(fs.readFileSync(path.join(root,file),'utf8'));
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
function desktopRuntime({reply='First sentence. Second sentence.',route=null,desktop=true,reduced=true,geometry=null,speechGate=false,agent=false,customSpeech=false,iosDevice=false,capture=null,unlock=null,whatsappFetch=null,understand=null}={}){
  const timers=new Map(),els=new Map(),recs=[],utterances=[],primes=[],spoken=[],audioEvents=[],audios=[],speechRequests=[],wa={open:[],close:0},winListeners={},rafs=[];let n=0,root=null,waOpen=null,isDesktop=desktop,inGesture=false,speechUnlocked=false;
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
  class FakeSR{constructor(){recs.push(this);this.aborted=false;}start(){audioEvents.push('record');this.onstart?.();}stop(){this.onend?.();}abort(){this.aborted=true;}}
  class FakeUtterance{constructor(text){this.text=text;(text.trim()?utterances:primes).push(this);}}
  class FakeAudio{constructor(){this.src='';audios.push(this);}setAttribute(){}removeAttribute(){this.src='';}play(){return this.src.startsWith('data:')&&unlock?unlock:Promise.resolve();}pause(){}load(){}}
  const sandbox={console,Date,Math,AbortController,Audio:FakeAudio,Blob,atob,Uint8Array,URL:{createObjectURL:()=>'blob:test',revokeObjectURL(){}},performance:{now:()=>1},navigator:{userAgent:iosDevice?'iPhone AppleWebKit Safari':'test',...(capture?{mediaDevices:{getUserMedia:capture}}:{})},DEV_MODE:true,
    document:{addEventListener(){},createElement:()=>fakeEl(),body:{appendChild(c){if(!root)root=c;}},querySelector:s=>s==='.app-wrapper'?background:null,getElementById:()=>null,activeElement:null,hidden:false},
    setTimeout(fn,ms){timers.set(++n,{fn,ms});return n;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){rafs.push(fn);return rafs.length;},cancelAnimationFrame(){},
    addEventListener(t,f){(winListeners[t]=winListeners[t]||[]).push(f);},removeEventListener(t,f){winListeners[t]=(winListeners[t]||[]).filter(x=>x!==f);},
    matchMedia:q=>({matches:/reduced-motion/.test(q)?reduced:isDesktop}),SpeechRecognition:FakeSR,SpeechSynthesisUtterance:FakeUtterance,speechSynthesis:{speak(u){if(inGesture)speechUnlocked=true;if(speechGate&&!speechUnlocked)return;spoken.push(u);audioEvents.push(u.text.trim()?'reply':'prime');},cancel(){audioEvents.push('cancel');},getVoices:()=>[]},
    D:{props:[],cleaners:[],sessions:[],bookings:[],tasks:[],issues:[]},SV_JARVIS_ACTIONS:{route:route||(()=>agent?{kind:'chat'}:{kind:'reply',message:reply})}};
  if(agent){sandbox.AbortSignal=AbortSignal;sandbox.fetch=async(url,init)=>{await Promise.resolve();if(whatsappFetch&&String(url).includes('/whatsapp/'))return whatsappFetch(String(url),init);if(String(url).endsWith('/speech')){speechRequests.push(JSON.parse(init.body));return {ok:true,json:async()=>({contentType:'audio/mpeg',audio:Buffer.alloc(100,7).toString('base64')})};}return {ok:true,json:async()=>String(url).endsWith('/health')?{ready:true,requestToken:'local-test',route:'n8n',...(understand?{conversation:1}:{}),...(customSpeech?{speech:{available:true,provider:'elevenlabs',name:'Jarvis Seravillas'}}:{})}:understand?{decision:await understand(JSON.parse(init.body))}:{reply}};};}
  sandbox.window=sandbox;
  sandbox.SV_JARVIS_WHATSAPP={parseCommand:t=>/whatsapp/i.test(t)?{kind:'open',name:'Bex',group:false}:null,open(o){wa.open.push(o);waOpen=o;return true;},close(){wa.close++;const o=waOpen;waOpen=null;o?.onClose?.();},isOpen:()=>!!waOpen,isEmbedded:()=>!!waOpen};
  const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run('function propName(id){return D.props.find(p=>p.id===id)?.name||"General";}');
  for(const file of ['src/utils/dates.js','src/ui/voice.js','src/assistant/jarvis-data.js','src/assistant/jarvis-voice.js','src/assistant/jarvis-audio.js',...(whatsappFetch?['src/assistant/jarvis-whatsapp-voice.js']:[]),'src/assistant/jarvis.js'])run(fs.readFileSync(path.join(root_,file),'utf8'));
  const app={run,context,recs,utterances,primes,spoken,audioEvents,audios,speechRequests,wa,timers,background,winListeners,rafs,
    root:()=>root,el:id=>root?root.querySelector('#'+id):els.get('#'+id),phase:()=>run('SV_JARVIS.getPhase()'),
    click(j){inGesture=true;try{root.listeners.click({target:{closest:()=>({dataset:{j}})}});}finally{inGesture=false;}},
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
test('Jarvis footer avoids workspace data-nav capture; Tasks and Cleanings close Jarvis and navigate on desktop and phone',async()=>{
  for(const desktop of [true,false])for(const [action,destination] of [['nav-tasks','tasks'],['nav-cleaning','cleaning']]){
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
  assert.equal(app.phase(),'paused');assert.equal(app.el('jarvis-caption-text').textContent,'');assert.match(app.el('jarvis-error').textContent,/Play reply/);app.runDelay(450);assert.equal(app.recs.length,2);app.click('close');
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
    const decisions=[{kind:'whatsapp',intent:{kind:'write',chat:key,text:''}},{kind:'whatsapp',intent:{kind:'body',text:'How are you?'}},{kind:'whatsapp',intent:{kind:'edit',text:'Hi Bex, how are you doing?'}},{kind:'reply',text:'Good morning!',retainTask:false}];
    const app=desktopRuntime({agent:true,desktop,understand:async body=>{calls.push(body);return decisions.shift();},whatsappFetch:async(url,init={})=>({ok:true,status:200,json:async()=>{
      if(url.endsWith('/status'))return {available:true,requestToken:'fictional'};
      if(url.includes('/inbox'))return {connection:{state:'open'},chats:[chat],chat};
      const body=JSON.parse(init.body);if(url.endsWith('/review'))return {reviewToken:'PRIVATE_REVIEW_TOKEN',version:1,text:body.text,recipient:chat,expiresAt:Date.now()+300000};
      if(url.endsWith('/send')){sends.push(body);return {status:'sent'};}throw Error('Unexpected operation');
    }})});
    app.run('openJarvis()');await flush();
    await ask(app,'Hi, could you message Bex for me?');assert.match(app.utterances.at(-1).text,/What should I say/);
    await ask(app,'How are you?');assert.equal(calls[1].context.dialogue.whatsapp.stage,'body');assert.equal(app.el('jarvis-review-text').textContent,'How are you?');
    await ask(app,'Actually make it friendlier');assert.equal(app.el('jarvis-review-text').textContent,'Hi Bex, how are you doing?');
    assert.ok(!JSON.stringify(calls).includes('PRIVATE_REVIEW_TOKEN'));
    await ask(app,'Approve and send');assert.equal(calls.length,3);assert.equal(sends.length,0);
    app.finishSpeech();await ask(app,'Read the draft again');app.finishSpeech();await ask(app,'Approve and send');assert.equal(sends.length,1);assert.equal(calls.length,3);
    await ask(app,'Good morning');assert.match(app.utterances.at(-1).text,/Good morning/);await ask(app,'Approve and send');assert.equal(sends.length,1);app.click('close');
  }
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
  assert.equal(app.el('jarvis-today-title').textContent,'Today');assert.deepEqual(focusRows(app),[]);
  await ask(app,'What cleanings are scheduled today?');
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');assert.ok(app.el('jarvis-today-section').classList.contains('is-attention'));assert.ok(app.root().classList.contains('has-focus'));
  const rows=focusRows(app);assert.equal(rows.length,1);assert.match(rows[0],/09:00/);assert.match(rows[0],/Casa Ejemplo/);assert.doesNotMatch(rows.join(' '),/Villa Mar/);
  app.finishSpeech();
  assert.ok(app.root().classList.contains('focus-hold'));assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.runDelay(6000);
  assert.equal(app.el('jarvis-today-title').textContent,'Today');assert.equal(app.el('jarvis-today-section').classList.contains('is-attention'),false);
  assert.equal(app.root().classList.contains('has-focus'),false);assert.deepEqual(focusRows(app),[]);
  await ask(app,'How many cleanings next week?');
  const week=focusRows(app);assert.equal(week.length,1);assert.match(week[0],/Villa Mar/);assert.ok(week[0].includes(app.run(`fmtDate(addDays(startOfWeek(today()),8))`)));assert.doesNotMatch(week.join(' '),/Casa Ejemplo/);
  assert.equal(app.el('jarvis-today-date').textContent,app.run(`fmtDateRange(addDays(startOfWeek(today()),7),addDays(startOfWeek(today()),13))`));
});
test('attention: only the latest turn owns focus; unrelated turns, tasks, settings, Overview, voice errors and close all clean up',async()=>{
  const app=focusApp();await flush();
  await ask(app,'What cleanings are scheduled today?');app.finishSpeech();
  await ask(app,'Hello there');assert.equal(app.el('jarvis-today-title').textContent,'Today');assert.equal(app.root().classList.contains('has-focus'),false);
  await ask(app,'What tasks are due today?');
  assert.ok(app.root().classList.contains('has-focus'));assert.ok(app.el('jarvis-tasks-section').classList.contains('is-attention'));assert.equal(app.el('jarvis-today-section').classList.contains('is-attention'),false);assert.equal(app.el('jarvis-today-title').textContent,'Today');
  app.finishSpeech();
  await ask(app,'Cleanings tomorrow');assert.equal(app.el('jarvis-tasks-section').classList.contains('is-attention'),false);
  app.utterances.find(u=>!u.done)?.onstart();app.runDelay(6000);
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');assert.match(app.el('jarvis-today-date').textContent,/^Tomorrow · /);
  app.click('settings');assert.equal(app.el('jarvis-today-title').textContent,'Today');
  await ask(app,'Cleanings today');app.click('nav-overview');
  assert.equal(app.el('jarvis-today-title').textContent,'Today');assert.deepEqual(focusRows(app),[]);
  await ask(app,'Write a WhatsApp message to Bex saying hi');assert.equal(app.root().classList.contains('has-focus'),false);app.click('nav-overview');
  app.click('mic');app.hear('What cleanings are scheduled today?');await flush();
  assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.finishSpeech();app.runDelay(450);assert.equal(app.phase(),'listening');assert.equal(app.el('jarvis-today-title').textContent,'Cleanings');
  app.recs.at(-1).onerror({error:'not-allowed'});
  assert.equal(app.el('jarvis-today-title').textContent,'Today');assert.equal(app.el('jarvis-keep').attrs['aria-pressed'],'true');
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
