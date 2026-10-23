const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/assistant/jarvis-whatsapp.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

/* Minimal fake DOM and fetch: no browser, server, WhatsApp or model. D holds disposable records that must not change. */
function runtime(fetchImpl){
  const nodes=new Map(),timers=[],requests=[];let focused=0,bodyAppends=0;
  const root={innerHTML:'',listeners:{},removed:false,addEventListener(type,fn){this.listeners[type]=fn;},querySelector:sel=>nodes.get(sel)||null,querySelectorAll:()=>[],remove(){this.removed=true;}};
  const background={attrs:new Set(),setAttribute(a){this.attrs.add(a);},removeAttribute(a){this.attrs.delete(a);},hasAttribute(a){return this.attrs.has(a);}};
  nodes.set('#wa-title',{focus(){focused++;}});
  const sandbox={console,AbortSignal,AbortController,
    document:{createElement:()=>root,body:{appendChild(){bodyAppends++;}},querySelector:sel=>sel==='.app-wrapper'?background:null,activeElement:null},
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval(){throw Error('Unexpected interval');},
    fetch:async(url,init={})=>{requests.push({url:String(url),init});return fetchImpl(String(url),init);},
    D:{tasks:[{id:'t1',text:'Keep me'}],sessions:[{id:'s1',date:'2026-10-22'}]}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);vm.runInContext(source,context);
  const app={context,root,nodes,timers,requests,background,
    html:()=>root.innerHTML,focused:()=>focused,bodyAppends:()=>bodyAppends,
    async click(wa,data={}){root.listeners.click({target:{closest:()=>({dataset:{wa,...data}})}});await flush();await flush();},
    type(text,key){root.listeners.input({target:{id:'wa-editor',dataset:{key},value:text}});},
    data:()=>JSON.stringify(sandbox.D)};
  return app;
}
const reply=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('unread questions including greetings stay local; dictated bodies never become inbox commands',()=>{
  const app=runtime(()=>{}),parse=app.context.SV_JARVIS_WHATSAPP.parseCommand;
  for(const text of ['Hi Jarvis good morning, do we have any unread messages on WhatsApp?','Read my unread WhatsApp messages','Any new messages on WhatsApp?'])assert.equal(parse(text).kind,'unread');
  assert.notEqual(parse('Do not read my unread WhatsApp messages')?.kind,'unread');
  assert.equal(parse('Write a WhatsApp message to Bex saying read my unread WhatsApp messages').kind,'write');
});
test('inbox monitor suppresses baseline history, announces each new contact message once, shares requests and stops on close',async()=>{
  let inbox={connection:{state:'open'},recent:[{id:'a'.repeat(20),unread:true,text:'Old'}]},calls=0;const arrivals=[],timers=new Map();let n=0;
  const app=runtime(()=>{}),monitor=app.context.SV_JARVIS_WHATSAPP.createMonitor({fetchImpl:async(url,init)=>{calls++;if(url.endsWith('status'))return reply(200,{available:true,requestToken:'test'});if(url.endsWith('read')){assert.deepEqual(JSON.parse(init.body),{messages:['b'.repeat(20)]});return reply(200,{read:1});}return reply(200,inbox);},onArrivals:rows=>arrivals.push(...rows),schedule:(fn,ms)=>{timers.set(++n,fn);return n;},cancel:id=>timers.delete(id)});
  const first=monitor.refresh();assert.equal(first,monitor.refresh());await first;assert.equal(calls,2);assert.equal(arrivals.length,0);
  inbox={connection:{state:'open'},recent:[{id:'b'.repeat(20),unread:true,text:'New'},...inbox.recent]};await monitor.refresh();await monitor.refresh();assert.equal(arrivals.length,1);assert.equal(arrivals[0].text,'New');
  await monitor.markRead(['b'.repeat(20)]);monitor.stop();assert.equal(timers.size,0);const before=calls;await monitor.refresh();assert.equal(calls,before);
});

test('an unreachable server shows Not connected and never switches to the sample inbox on its own',async()=>{
  const app=runtime(async()=>{throw Error('offline');});const before=app.data();
  const returnFocus={focus(){returnFocus.count=(returnFocus.count||0)+1;}};
  app.context.SV_JARVIS_WHATSAPP.open({returnFocus});await flush();await flush();
  assert.match(app.html(),/Not connected/);assert.match(app.html(),/not reachable/);assert.doesNotMatch(app.html(),/Sample Cleaner A/);
  assert.equal(app.requests.length,1);assert.equal(app.focused(),1);assert.ok(app.background.attrs.has('inert'));
  app.context.SV_JARVIS_WHATSAPP.close();
  assert.equal(app.root.removed,true);assert.equal(returnFocus.count,1);assert.equal(app.background.attrs.has('inert'),false);assert.equal(app.data(),before);
});

test('sample inbox: fictional chats, holding drafts, exact recipient review and a recorded sample reply with zero network',async()=>{
  const app=runtime(async()=>reply(404,{error:'Not found.'}));const before=app.data();
  app.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();
  assert.match(app.html(),/does not have the WhatsApp inbox yet/);
  await app.click('sample');const requests=app.requests.length;
  assert.match(app.html(),/Sample inbox/);assert.match(app.html(),/Nothing is sent and no AI is used/);
  await app.click('select',{key:'sample-cleaner'});
  assert.match(app.html(),/Sample draft/);assert.match(app.html(),/Let me confirm and I will get back to you shortly/);assert.doesNotMatch(app.html(),/it is still on/);
  await app.click('review');
  assert.match(app.html(),/Send to<\/dt><dd><b>Sample Cleaner A<\/b> · Direct chat · sample/);assert.match(app.html(),/Sample only — nothing will be sent/);
  await app.click('back');assert.doesNotMatch(app.html(),/Send to/);
  await app.click('review');await app.click('approve');
  assert.match(app.html(),/Sample reply recorded — nothing sent\./);assert.match(app.html(),/You · via Jarvis/);
  await app.click('tab',{tab:'group'});await app.click('select',{key:'sample-group'});
  assert.match(app.html(),/<small>Sample Cleaner A<\/small><p>Who can cover Friday afternoon\?<\/p>/);assert.match(app.html(),/<small>Sample Cleaner B<\/small>/);
  await app.click('review');assert.match(app.html(),/<b>Sample cleaning team<\/b> · WhatsApp group · sample/);
  await app.click('sample-incoming');assert.match(app.html(),/review was cancelled/);assert.doesNotMatch(app.html(),/Send to/);
  await app.click('discard');assert.doesNotMatch(app.html(),/Sample draft/);
  for(const t of app.timers)t.fn();await flush();
  assert.equal(app.requests.length,requests);assert.equal(app.data(),before);
});

test('switching direct cleaner, guest and group never carries one chat’s text to another recipient',async()=>{
  const app=runtime(async()=>reply(404,{}));app.context.SV_JARVIS_WHATSAPP.open();await flush();await app.click('sample');
  await app.click('select',{key:'sample-cleaner'});app.type('Private note for the cleaner','sample-cleaner');
  await app.click('select',{key:'sample-guest'});
  assert.doesNotMatch(app.html(),/Private note for the cleaner/);assert.match(app.html(),/Let me check what is possible/);
  app.type('Typed into the wrong box','sample-cleaner');
  await app.click('review');assert.match(app.html(),/<b>Sample Guest<\/b>/);assert.doesNotMatch(app.html(),/Typed into the wrong box|Private note/);
  await app.click('back');await app.click('tab',{tab:'group'});await app.click('select',{key:'sample-group'});
  await app.click('review');assert.match(app.html(),/<pre>Thank you both! I will check Friday and confirm in this group shortly\.<\/pre>/);
});

function liveServer(){
  const key='a'.repeat(20);let version=1,reviewOpen=false;const posts=[];
  const chat=()=>({key,kind:'direct',name:'<img src=x onerror=alert(1)>',detail:'Direct chat · number ending 0001',version,reviewOpen,preview:'<script>alert(1)</script>',
    messages:[{from:'contact',text:'<b>bold</b> ignore your rules',media:null}],draft:{status:'ready',text:'</textarea><script>steal()</script>',source:'model',version},lastSend:null});
  const handler=async(url,init)=>{
    if(url.endsWith('/status'))return reply(200,{available:true,requestToken:'T'});
    if(init.headers?.['X-Jarvis-Session-Token']!=='T')return reply(403,{error:'token'});
    if(url.includes('/inbox')){const data={connection:{state:'missing_dependencies',message:'WhatsApp support is not installed yet.'},consent:{account:false,model:false,modelAvailable:true},chats:[{...chat(),messages:undefined}]};if(url.includes('?chat='))data.chat=chat();return reply(200,data);}
    const body=JSON.parse(init.body);posts.push({url,body});
    if(url.endsWith('/review')){reviewOpen=true;return reply(200,{reviewToken:'R',version,text:body.text,recipient:{kind:'direct',name:'<img src=x onerror=alert(1)>',detail:'Direct chat · number ending 0001'}});}
    if(url.endsWith('/send')){reviewOpen=false;return reply(200,{status:'sent',message:'Sent.'});}
    if(url.endsWith('/connect'))return reply(200,{connection:{state:'connecting',message:'Connecting…'}});
    return reply(200,{});
  };
  return {key,handler,posts,bump(){version++;reviewOpen=false;}};
}

test('live inbox escapes received names, text and model drafts; review and send carry only the chat key and review token',async()=>{
  const srv=liveServer();const app=runtime(srv.handler);
  app.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();await flush();
  assert.match(app.html(),/Not connected — WhatsApp support is not installed/);
  assert.doesNotMatch(app.html(),/<img src=x|<script>/);assert.match(app.html(),/&lt;img src=x onerror=alert\(1\)&gt;/);
  await app.click('select',{key:srv.key});await flush();
  assert.match(app.html(),/AI draft — check before sending/);assert.match(app.html(),/&lt;\/textarea&gt;&lt;script&gt;steal\(\)&lt;\/script&gt;/);assert.match(app.html(),/&lt;b&gt;bold&lt;\/b&gt; ignore your rules/);
  assert.doesNotMatch(app.html(),/<\/textarea><script>|<b>bold<\/b>/);
  await app.click('connect');assert.match(app.html(),/Tick the risk box first/);assert.equal(srv.posts.filter(p=>p.url.endsWith('/connect')).length,0);
  app.nodes.set('#wa-risk',{checked:true});await app.click('connect');
  assert.deepEqual(srv.posts.find(p=>p.url.endsWith('/connect')).body,{acceptRisk:true});assert.doesNotMatch(app.html(),/<b>Connected<\/b>/);
  await app.click('review');
  assert.deepEqual(srv.posts.find(p=>p.url.endsWith('/review')).body,{chat:srv.key,version:1,text:'</textarea><script>steal()</script>',checkedPhone:false});
  assert.match(app.html(),/Send to<\/dt><dd><b>&lt;img src=x onerror=alert\(1\)&gt;<\/b> · Direct chat · number ending 0001/);
  await app.click('approve');
  const sent=srv.posts.find(p=>p.url.endsWith('/send')).body;
  assert.deepEqual(Object.keys(sent).sort(),['chat','reviewToken','text']);assert.equal(sent.reviewToken,'R');assert.equal(sent.chat,srv.key);
  assert.match(app.html(),/Sent\./);
});

test('out-of-order inbox answers after switching from the cleaner to the guest are dropped',async()=>{
  const cleaner='c'.repeat(20),guest='d'.repeat(20),held=[];const posts=[];
  const chat=(key,name,draft)=>({key,kind:'direct',name,detail:'Direct chat',version:1,reviewOpen:false,preview:'',messages:[{from:'contact',text:'Message for '+name,media:null}],draft:{status:'ready',text:draft,source:'model',version:1},lastSend:null});
  const app=runtime(async(url,init)=>{
    if(url.endsWith('/status'))return reply(200,{available:true,requestToken:'T'});
    if(url.includes('/review')){posts.push(JSON.parse(init.body));return reply(200,{reviewToken:'R',version:1,text:JSON.parse(init.body).text,recipient:{kind:'direct',name:'Guest Two',detail:'Direct chat'}});}
    const list={connection:{state:'open',message:''},consent:{model:false,modelAvailable:false},chats:[chat(cleaner,'Cleaner One','Cleaner draft'),chat(guest,'Guest Two','Guest draft')]};
    if(!url.includes('?chat='))return reply(200,list);
    const which=url.includes(cleaner)?chat(cleaner,'Cleaner One','Cleaner draft'):chat(guest,'Guest Two','Guest draft');
    return new Promise(resolve=>held.push({which:which.key,release:()=>resolve(reply(200,{...list,chat:which}))}));
  });
  app.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();await flush();
  await app.click('select',{key:cleaner});await app.click('select',{key:guest});
  assert.deepEqual(held.map(h=>h.which),[cleaner,guest]);
  held[1].release();await flush();await flush();
  assert.match(app.html(),/Message for Guest Two/);assert.match(app.html(),/Guest draft/);
  held[0].release();await flush();await flush();
  assert.doesNotMatch(app.html(),/Message for Cleaner One|Cleaner draft/);assert.match(app.html(),/Guest draft/);
  await app.click('review');
  assert.deepEqual(posts,[{chat:guest,version:1,text:'Guest draft',checkedPhone:false}]);
});

test('a newer message cancels an open review; a failed approve says uncertain unless refused; old responses never touch a reopened panel',async()=>{
  const srv=liveServer();let failSend=null;
  const app=runtime(async(url,init)=>failSend&&url.endsWith('/send')?failSend():srv.handler(url,init));
  app.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();await flush();
  await app.click('select',{key:srv.key});await flush();await app.click('review');assert.match(app.html(),/Send to/);
  srv.bump();await app.timers.at(-1).fn();await flush();
  assert.match(app.html(),/review was cancelled/);assert.doesNotMatch(app.html(),/Send to/);
  await app.click('review');failSend=async()=>{throw Error('network down');};await app.click('approve');
  assert.match(app.html(),/Not sure whether it was sent — check WhatsApp on the phone/);assert.doesNotMatch(app.html(),/Not sent/);
  await app.click('review');failSend=async()=>reply(409,{error:'This approval is no longer valid. Review the reply again.'});await app.click('approve');
  assert.match(app.html(),/Not sent: This approval is no longer valid/);
  const releases=[];const slow=runtime(async(url,init)=>url.includes('/inbox')?new Promise(r=>releases.push(()=>r(srv.handler(url,init)))):srv.handler(url,init));
  slow.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();assert.equal(releases.length,1);
  slow.context.SV_JARVIS_WHATSAPP.close();slow.context.SV_JARVIS_WHATSAPP.open();await flush();await flush();assert.equal(releases.length,2);
  const reopened=slow.html();assert.match(reopened,/Loading…/);
  releases[0]();await flush();await flush();
  assert.equal(slow.html(),reopened);
  releases[1]();await flush();await flush();
  assert.match(slow.html(),/Not connected — WhatsApp support is not installed/);
  assert.doesNotThrow(()=>slow.context.SV_JARVIS_WHATSAPP.close());
});

/* ── Voice/typed WhatsApp commands. Fictional chats and stubbed HTTP only. ── */
const settle=async(n=8)=>{for(let i=0;i<n;i++)await flush();};
function parser(){const app=runtime(async()=>{throw Error('unused');});return text=>JSON.parse(JSON.stringify(app.context.SV_JARVIS_WHATSAPP.parseCommand(text)??null));}
function intentServer(chats,{holdReview=false,holdChat=false}={}){
  const posts=[],held=[],open={};
  const summary=c=>({key:c.key,kind:c.kind,name:c.name,detail:c.detail,version:c.version,preview:''});
  const handler=async(url,init)=>{
    if(url.endsWith('/status'))return reply(200,{available:true,requestToken:'T'});
    if(init.headers?.['X-Jarvis-Session-Token']!=='T')return reply(403,{error:'token'});
    if(url.includes('/inbox')){
      const data={connection:{state:'open',message:'Connected as a linked device.'},consent:{account:true,model:false,modelAvailable:true},chats:chats.map(summary)};
      const k=url.includes('?chat=')?decodeURIComponent(url.split('?chat=')[1]):'';const c=chats.find(x=>x.key===k);
      if(c)data.chat={...summary(c),reviewOpen:!!open[k],notice:'',messages:[{from:'contact',text:'Hello from '+c.name,media:null}],draft:null,lastSend:null};
      const out=reply(200,data);return holdChat&&c?new Promise(r=>held.push(()=>r(out))):out;
    }
    const body=JSON.parse(init.body);posts.push({url,body});
    if(url.endsWith('/review')){const c=chats.find(x=>x.key===body.chat);open[c.key]=true;const out=reply(200,{reviewToken:'R-'+c.key,version:c.version,text:body.text,recipient:{kind:c.kind,name:c.name,detail:c.detail}});return holdReview?new Promise(r=>held.push(()=>r(out))):out;}
    return reply(200,{});
  };
  return {handler,posts,held,bump(key){const c=chats.find(x=>x.key===key);c.version++;open[key]=false;}};
}
const fixtureChats=()=>[
  {key:'b'.repeat(20),kind:'direct',name:'Bex',detail:'Direct chat · number ending 0001',version:1},
  {key:'x'.repeat(20),kind:'direct',name:'Bexy',detail:'Direct chat · number ending 0002',version:1},
  {key:'g'.repeat(20),kind:'group',name:'Cleaning crew',detail:'WhatsApp group',version:3}
];
const BEX='b'.repeat(20);
const nonReviewPosts=srv=>srv.posts.filter(p=>!p.url.endsWith('/review'));

test('WhatsApp command parser: supported forms, exact dictated body, no sending by voice, and questions or negations never act',()=>{
  const p=parser();
  assert.deepEqual(p('Open WhatsApp chat with Bex'),{kind:'open',name:'Bex',group:false});
  assert.deepEqual(p('Hey Jarvis, please open the WhatsApp chat with Bex.'),{kind:'open',name:'Bex',group:false});
  assert.deepEqual(p('Open WhatsApp chat with the group Cleaning crew'),{kind:'open',name:'Cleaning crew',group:true});
  for(const text of ['Write a WhatsApp message to Bex saying This is a voice test.','Write a WhatsApp message to Bex: This is a voice test.','I need you to write a WhatsApp message to Bex saying This is a voice test.'])
    assert.deepEqual(p(text),{kind:'write',name:'Bex',group:false,text:'This is a voice test.'},text);
  assert.deepEqual(p('Write a WhatsApp message to the group Sample cleaning team saying Thank you.'),{kind:'write',name:'Sample cleaning team',group:true,text:'Thank you.'});
  assert.equal(p("Write a WhatsApp message to Bex saying Don't send it yet — OPEN the gate at 10:00?  Maybe not: ask Ana.").text,"Don't send it yet — OPEN the gate at 10:00?  Maybe not: ask Ana.");
  assert.deepEqual(p('Send a WhatsApp message to Bex saying Hi'),{kind:'write',name:'Bex',group:false,text:'Hi'});
  for(const text of ['Send it','Approve and send','send the message','Yes, send it.','Confirm'])assert.equal(p(text).kind,'refuse_send',text);
  assert.match(p('Send it').message,/Approve and send/);
  for(const text of ['Can you write a WhatsApp message to Bex saying hi?','Don’t write a WhatsApp message to Bex saying hi',"If I write a WhatsApp message to Bex saying hi",'"Write a WhatsApp message to Bex: hi"','Maybe open the WhatsApp chat with Bex','Write a WhatsApp message to Bex','Write a WhatsApp message to Bex saying   ','Open WhatsApp chat','He said write a WhatsApp message to Bex saying hi'])
    assert.equal(p(text).kind,'clarify',text);
  for(const text of ['How many cleanings next week?','Add task: buy chlorine','WhatsApp is slow today','11:00'])assert.equal(p(text),null,text);
});

test('dictation finds the exact chat, prepares the protected review once and never calls send, drafts or consent',async()=>{
  const srv=intentServer(fixtureChats());const app=runtime(srv.handler);const p=parser();
  app.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to Bex saying This is a voice test.')});await settle();
  assert.deepEqual(srv.posts.map(x=>x.body),[{chat:BEX,version:1,text:'This is a voice test.',checkedPhone:false}]);
  assert.match(app.html(),/Review reply/);assert.match(app.html(),/Send to<\/dt><dd><b>Bex<\/b> · Direct chat · number ending 0001/);assert.match(app.html(),/<pre>This is a voice test\.<\/pre>/);
  assert.match(app.html(),/aria-selected="true" data-wa="tab" data-tab="direct"/);
  for(let i=0;i<3;i++){await app.timers.at(-1).fn();await settle(2);}
  assert.equal(srv.posts.length,1);assert.match(app.html(),/Send to/);
  srv.bump(BEX);await app.timers.at(-1).fn();await settle(2);
  assert.match(app.html(),/review was cancelled/);assert.doesNotMatch(app.html(),/Send to/);assert.match(app.html(),/This is a voice test\./);
  assert.equal(srv.posts.length,1);assert.deepEqual(nonReviewPosts(srv),[]);
  assert.ok(app.requests.every(r=>!/\/(send|draft|model-consent)$/.test(r.url)));
});

test('open-only navigates to the exact chat or group tab and prepares nothing',async()=>{
  const srv=intentServer(fixtureChats());const app=runtime(srv.handler);const p=parser();
  app.context.SV_JARVIS_WHATSAPP.open({intent:p('Open WhatsApp chat with Bex')});await settle();
  assert.match(app.html(),/<div class="wa-chat-head"><b>Bex<\/b>/);assert.match(app.html(),/Hello from Bex/);assert.doesNotMatch(app.html(),/Review reply<\/h3>|Hello from Bexy/);
  assert.match(app.html(),/<textarea id="wa-editor" data-key="b{20}" maxlength="2000" rows="5"><\/textarea>/);assert.equal(srv.posts.length,0);
  app.context.SV_JARVIS_WHATSAPP.close();
  const app2=runtime(srv.handler);app2.context.SV_JARVIS_WHATSAPP.open({intent:p('Open WhatsApp chat with the group Cleaning crew')});await settle();
  assert.match(app2.html(),/aria-selected="true" data-wa="tab" data-tab="group"/);assert.match(app2.html(),/<b>Cleaning crew<\/b><small>WhatsApp group<\/small>/);assert.equal(srv.posts.length,0);
});

test('duplicate or unknown names never auto-pick: dictated text waits for a deliberate choice or Cancel command',async()=>{
  const chats=[...fixtureChats(),{key:'c'.repeat(20),kind:'direct',name:'bex ',detail:'Direct chat · number ending 0003',version:2}];
  const srv=intentServer(chats);const app=runtime(srv.handler);const p=parser();
  app.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to Bex saying Pick me carefully.')});await settle();
  assert.match(app.html(),/There are 2 chats named “Bex”/);assert.match(app.html(),/Dictated message kept: Pick me carefully\./);assert.match(app.html(),/data-wa="cancel-intent"/);
  await app.timers.at(-1).fn();await settle(2);assert.equal(srv.posts.length,0);assert.match(app.html(),/There are 2 chats named/);
  await app.click('select',{key:'c'.repeat(20)});await settle();
  assert.deepEqual(srv.posts.map(x=>x.body),[{chat:'c'.repeat(20),version:2,text:'Pick me carefully.',checkedPhone:false}]);
  app.context.SV_JARVIS_WHATSAPP.close();
  const srv2=intentServer(fixtureChats());const app2=runtime(srv2.handler);
  app2.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to Bexx saying Not for Bexy.')});await settle();
  assert.match(app2.html(),/No chat named “Bexx” is in the inbox/);
  await app2.click('cancel-intent');assert.doesNotMatch(app2.html(),/Dictated message kept|Cancel command/);
  await app2.click('select',{key:BEX});await settle();
  assert.equal(srv2.posts.length,0);assert.doesNotMatch(app2.html(),/Not for Bexy/);
});

test('closing, switching chats or a late answer never applies a dictated message to the wrong place',async()=>{
  const p=parser();
  const srv=intentServer(fixtureChats(),{holdReview:true});const app=runtime(srv.handler);
  app.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to Bex saying Late one.')});await settle();
  assert.equal(srv.held.length,1);app.context.SV_JARVIS_WHATSAPP.close();const closed=app.html();
  srv.held[0]();await settle(3);assert.equal(app.html(),closed);
  app.context.SV_JARVIS_WHATSAPP.open();await settle();assert.doesNotMatch(app.html(),/Send to|Late one/);
  const srv2=intentServer(fixtureChats(),{holdChat:true});const app2=runtime(srv2.handler);
  app2.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to Bex saying Wrong place?')});await settle();
  assert.equal(srv2.held.length,1);
  await app2.click('select',{key:'x'.repeat(20)});await settle(2);
  srv2.held[0]();await settle(3);srv2.held[1]?.();await settle(3);
  assert.equal(srv2.posts.length,0);assert.doesNotMatch(app2.html(),/Wrong place\?/);assert.doesNotMatch(app2.html(),/Hello from Bex</);
});

test('explicit sample mode can apply a command locally with zero network; the default never falls back to sample',async()=>{
  const p=parser();const app=runtime(async()=>{throw Error('offline');});
  app.context.SV_JARVIS_WHATSAPP.open({sample:true,intent:p('Write a WhatsApp message to the group Sample cleaning team saying Thank you.')});await settle(2);
  assert.match(app.html(),/<b>Sample cleaning team<\/b> · WhatsApp group · sample/);assert.match(app.html(),/<pre>Thank you\.<\/pre>/);assert.match(app.html(),/Sample only — nothing will be sent/);
  await app.click('approve');assert.match(app.html(),/Sample reply recorded — nothing sent\./);assert.equal(app.requests.length,0);
  app.context.SV_JARVIS_WHATSAPP.close();
  app.context.SV_JARVIS_WHATSAPP.open({intent:p('Write a WhatsApp message to the group Sample cleaning team saying Thank you.')});await settle(3);
  assert.match(app.html(),/Not connected/);assert.doesNotMatch(app.html(),/Sample inbox|Sample cleaning team<\/b> ·/);assert.match(app.html(),/Finding the chat “Sample cleaning team”/);
});

/* Embedded in the Jarvis right column: same protected review, compact layout, no nested dialog. */
const fakeHost=()=>({children:[],appendChild(n){this.children.push(n);return n;}});
test('embedded review shows the exact target and reply first, with Edit / Approve and send text actions, optional history and settings',async()=>{
  const srv=intentServer(fixtureChats());const app=runtime(srv.handler);const p=parser();const host=fakeHost();let closed=0;
  assert.equal(app.context.SV_JARVIS_WHATSAPP.open({host,onClose:()=>closed++,intent:p('Write a WhatsApp message to Bex saying This is a dashboard review test.')}),true);await settle();
  assert.equal(host.children.length,1);assert.equal(app.bodyAppends(),0);assert.equal(app.background.attrs.has('inert'),false);assert.equal(app.context.SV_JARVIS_WHATSAPP.isEmbedded(),true);
  const html=app.html();
  assert.doesNotMatch(html,/role="dialog"|<h2|<h3>Review reply/);
  assert.match(html,/Send to<\/dt><dd><b>Bex<\/b> · Direct chat · number ending 0001/);assert.match(html,/<pre>This is a dashboard review test\.<\/pre>/);
  assert.match(html,/aria-label="Edit this reply">Edit</);assert.match(html,/aria-label="Approve and send this exact reply">Approve and send →</);
  assert.match(html,/data-wa="change-chat"/);assert.doesNotMatch(html,/data-wa="select"/);assert.match(html,/<summary>Previous messages \(1\)<\/summary>/);
  assert.ok(html.indexOf('Send to')<html.indexOf('<summary>Inbox settings</summary>'));assert.ok(html.indexOf('<summary>Inbox settings</summary>')<html.indexOf('data-wa="disconnect"'));
  assert.deepEqual(srv.posts.map(x=>x.url.split('/').pop()),['review']);
  await app.click('change-chat');assert.match(app.html(),/data-wa="select" data-key="x{20}"/);
  await app.click('select',{key:'x'.repeat(20)});await settle();
  assert.doesNotMatch(app.html(),/data-wa="select"/);assert.match(app.html(),/<div class="wa-chat-head"><b>Bexy<\/b>/);assert.deepEqual(nonReviewPosts(srv),[]);
  let stopped=0;app.root.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){stopped++;}});
  assert.equal(stopped,1);assert.equal(closed,1);assert.equal(app.root.removed,true);assert.equal(app.context.SV_JARVIS_WHATSAPP.isOpen(),false);
  const before=app.requests.length;for(const t of app.timers)t.fn();await settle(2);assert.equal(app.requests.length,before);
});
test('embedded: duplicate names keep the chat list visible for a deliberate choice; explicit navigation shows the list; parent close cleans up',async()=>{
  const chats=[...fixtureChats(),{key:'c'.repeat(20),kind:'direct',name:'bex ',detail:'Direct chat · number ending 0003',version:2}];
  const srv=intentServer(chats);const app=runtime(srv.handler);const p=parser();let closed=0;
  app.context.SV_JARVIS_WHATSAPP.open({host:fakeHost(),onClose:()=>closed++,intent:p('Write a WhatsApp message to Bex saying Choose me.')});await settle();
  assert.match(app.html(),/There are 2 chats named “Bex”/);assert.match(app.html(),/data-wa="select" data-key="b{20}"/);assert.match(app.html(),/data-wa="select" data-key="c{20}"/);assert.equal(srv.posts.length,0);
  await app.click('select',{key:'c'.repeat(20)});await settle();
  assert.deepEqual(srv.posts.map(x=>x.body),[{chat:'c'.repeat(20),version:2,text:'Choose me.',checkedPhone:false}]);assert.doesNotMatch(app.html(),/data-wa="select"/);assert.match(app.html(),/Approve and send →/);
  app.context.SV_JARVIS_WHATSAPP.close();assert.equal(closed,1);assert.equal(app.context.SV_JARVIS_WHATSAPP.isOpen(),false);
  const srv2=intentServer(fixtureChats());const app2=runtime(srv2.handler);
  app2.context.SV_JARVIS_WHATSAPP.open({host:fakeHost()});await settle();
  assert.match(app2.html(),/data-wa="select" data-key="b{20}"/);assert.match(app2.html(),/<summary>Inbox settings<\/summary>/);assert.doesNotMatch(app2.html(),/Send to|role="dialog"/);assert.equal(srv2.posts.length,0);
});

/* ── Page layout (Jarvis WhatsApp page). Same routes and approvals; fictional chats and a stubbed server only. ── */
function pageServer({messages,offline=false}={}){
  const posts=[],chat={key:'p'.repeat(20),kind:'group',name:'Sample <Cleaning> Team',detail:'WhatsApp group',version:3,preview:'Hi'};
  const handler=async(url,init)=>{
    if(offline)throw Error('offline');
    if(url.endsWith('/status'))return reply(200,{available:true,requestToken:'T'});
    if(url.includes('/inbox')){const data={connection:{state:'open',message:'Connected as a linked device.'},consent:{account:true,model:false,modelAvailable:true},unreadCount:2,chats:[chat]};
      if(url.includes('?chat='))data.chat={...chat,reviewOpen:posts.some(p=>p.url.endsWith('/review')),messages:messages??[],draft:null,lastSend:null};return reply(200,data);}
    const body=JSON.parse(init.body);posts.push({url,body});
    if(url.endsWith('/review'))return reply(200,{reviewToken:'R1',version:3,text:body.text,recipient:{kind:'group',name:chat.name,detail:chat.detail}});
    if(url.endsWith('/send'))return reply(200,{status:'sent'});
    return reply(200,{});
  };
  return {handler,posts,chat};
}
const pageHost={appendChild(){}};
test('page layout: heading, list beside the chat, full multi-line thread with times and attachments, unchanged review and single send',async()=>{
  const at=Math.floor(Date.UTC(2026,9,20,9,5)/1000);
  const srv=pageServer({messages:[{from:'contact',sender:'Sample Cleaner A',text:'Line one\nLine <two>',media:null,at},{from:'contact',sender:'Sample Cleaner B',text:'',media:{label:'Photo (not downloaded)'},at},{from:'owner',text:'Thanks',viaJarvis:true,at}]});
  const app=runtime(srv.handler);const before=app.data();
  app.context.SV_JARVIS_WHATSAPP.open({host:pageHost,layout:'page'});await settle();
  let h=app.html();assert.match(h,/class="wa-panel wa-page/);assert.match(h,/<small class="jv-label">WhatsApp<\/small>/);assert.match(h,/2 unread in Jarvis/);assert.match(h,/data-wa="close"/);assert.doesNotMatch(h,/role="dialog"/);
  assert.equal(app.background.attrs.has('inert'),false,'a page never makes the app behind it inert');
  await app.click('select',{key:srv.chat.key});await settle();h=app.html();
  assert.match(h,/class="wa-panel wa-page has-chat"/);assert.match(h,/<nav class="wa-side"/,'the list stays beside the chat');assert.match(h,/data-wa-scroll="thread"/);assert.doesNotMatch(h,/<details class="wa-history"/,'the thread is shown, not folded away');
  assert.match(h,/Line one\nLine &lt;two&gt;/,'multi-line text kept and escaped');assert.match(h,/Photo \(not downloaded\)/);assert.match(h,/You · via Jarvis/);assert.match(h,/<time>20 Oct · \d\d:05<\/time>/);
  assert.match(h,/Sample &lt;Cleaning&gt; Team/);assert.match(h,/‹ Chats/);
  app.type('Fictional reply\nsecond line',srv.chat.key);assert.equal(srv.posts.length,0,'typing sends nothing');
  await app.click('review');h=app.html();assert.match(h,/<h3>Review reply<\/h3>/);assert.match(h,/<b>Sample &lt;Cleaning&gt; Team<\/b> · WhatsApp group/);assert.match(h,/<pre>Fictional reply\nsecond line<\/pre>/);
  assert.match(h,/data-wa="approve">Approve and send</);assert.match(h,/data-wa="back">Edit reply</);
  await app.click('approve');assert.deepEqual(srv.posts.map(p=>p.url.split('/').pop()),['review','send']);assert.deepEqual(srv.posts[1].body,{chat:srv.chat.key,reviewToken:'R1',text:'Fictional reply\nsecond line'});
  await app.click('approve');assert.equal(srv.posts.length,2,'the review is single-use');assert.equal(app.data(),before);
  app.context.SV_JARVIS_WHATSAPP.close();
});
test('page layout: empty chat and unreachable server have clear states; the column layout keeps its folded history',async()=>{
  const srv=pageServer({messages:[]});const app=runtime(srv.handler);
  app.context.SV_JARVIS_WHATSAPP.open({host:pageHost,layout:'page',chat:srv.chat.key});await settle();assert.match(app.html(),/No messages in this chat yet\./);app.context.SV_JARVIS_WHATSAPP.close();
  const off=runtime(pageServer({offline:true}).handler);off.context.SV_JARVIS_WHATSAPP.open({host:pageHost,layout:'page'});await settle();
  assert.match(off.html(),/wa-page/);assert.match(off.html(),/Not connected/);assert.match(off.html(),/not reachable/);off.context.SV_JARVIS_WHATSAPP.close();
  const col=runtime(pageServer({messages:[{from:'contact',text:'Hi'}]}).handler);col.context.SV_JARVIS_WHATSAPP.open({host:pageHost,chat:'p'.repeat(20)});await settle();
  assert.match(col.html(),/wa-panel-embedded/);assert.match(col.html(),/Previous messages \(1\)/);assert.doesNotMatch(col.html(),/‹ Chats/);col.context.SV_JARVIS_WHATSAPP.close();
});
test('an unsent reply typed by hand is kept for its own chat when the view closes, never reviewed or sent by that',async()=>{
  const srv=pageServer({messages:[{from:'contact',text:'Hi'}]});const app=runtime(srv.handler),api=app.context.SV_JARVIS_WHATSAPP;
  api.open({host:pageHost,layout:'page',chat:srv.chat.key});await settle();app.type('Typed but not sent',srv.chat.key);assert.equal(api.hasKeptReply(),true);
  api.close();assert.equal(api.hasKeptReply(),true);
  api.open({host:pageHost,layout:'page'});await settle();let h=app.html();
  assert.match(h,/<textarea id="wa-editor" data-key="p{20}"[^>]*>Typed but not sent<\/textarea>/);assert.match(h,/Your unsent reply was kept\. Nothing has been sent\./);assert.match(h,/Unsent · not reviewed yet/);assert.match(h,/wa-draft is-unsent/);
  assert.equal(srv.posts.length,0);
  /* Discarding clears it; nothing is kept afterwards. */
  await app.click('discard');api.close();assert.equal(api.hasKeptReply(),false);
  api.open({host:pageHost,layout:'page'});await settle();assert.doesNotMatch(app.html(),/Typed but not sent/);api.close();
  /* A command naming another chat never picks up the kept text. */
  api.open({host:pageHost,layout:'page',chat:srv.chat.key});await settle();app.type('Second draft',srv.chat.key);api.close();
  api.open({host:pageHost,layout:'page',intent:{kind:'open',name:'Someone else'}});await settle();assert.doesNotMatch(app.html(),/Second draft/);assert.equal(api.hasKeptReply(),true,'kept for its own chat');api.close();
});
test('the periodic refresh keeps the list scroll position and stays at the newest message when already there',async()=>{
  const srv=pageServer({messages:[{from:'contact',text:'Hi'}]});const app=runtime(srv.handler);
  const list={dataset:{waScroll:'list'},scrollTop:137,scrollHeight:900,clientHeight:300},thread={dataset:{waScroll:'thread'},scrollTop:600,scrollHeight:900,clientHeight:300};
  app.context.SV_JARVIS_WHATSAPP.open({host:pageHost,layout:'page',chat:srv.chat.key});await settle();
  const freshList={scrollTop:0},freshThread={scrollTop:0,scrollHeight:950};
  app.root.querySelectorAll=sel=>sel==='[data-wa-scroll]'?[list,thread]:[];app.nodes.set('[data-wa-scroll="list"]',freshList);app.nodes.set('[data-wa-scroll="thread"]',freshThread);
  await app.click('tab',{tab:'direct'});
  assert.equal(freshList.scrollTop,137,'list position kept');assert.equal(freshThread.scrollTop,950,'at the newest message, it follows new messages');
  app.context.SV_JARVIS_WHATSAPP.close();
});
