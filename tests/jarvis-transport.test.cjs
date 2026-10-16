const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

/* Fake clock, timers and fetch: no real Worker, Jarvis PC or network. */
const JOB='a'.repeat(64);
function runtime({dev=false,results=[],postStatus=202,extra={}}={}){
  let clock=1000;const calls=[],queue=[...results];
  const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
  const sandbox={console,URL,AbortSignal,DEV_MODE:dev,SYNC_URL:'https://sync.example.invalid',SYNC_SECRET:'MANAGER_SECRET_SENTINEL',
    /* Short relay polling waits run at once on the fake clock; longer timers (inbox refresh) are not auto-run. */
    Date:{now:()=>clock},setTimeout(fn,ms){if(ms<5000){clock+=ms;Promise.resolve().then(fn);}return 1;},clearTimeout(){},
    localStorage:{getItem(){return null;},setItem(){throw Error('Nothing may be stored in the browser');}},
    fetch:async(url,init={})=>{calls.push({url:String(url),init});
      if(dev)return reply(200,{local:true});
      if(String(url).endsWith('/api/relay/jobs'))return reply(postStatus,postStatus===202?{jobId:JOB}:{error:'The Jarvis PC is offline. It must be switched on with Jarvis and the live relay running.'});
      if(String(url).endsWith('/api/relay/device'))return reply(200,init.method==='POST'?{registered:true,deviceToken:'f'.repeat(64)}:{registered:true,online:false,lastSeen:''});
      const next=queue.length>1?queue.shift():queue[0];return reply(next.http||200,next.body);
    },...extra};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);vm.runInContext(read('src/assistant/jarvis-transport.js'),context);
  return {t:sandbox.SV_JARVIS_TRANSPORT,calls,context,sandbox,advance:ms=>{clock+=ms;},jobPosts:()=>calls.filter(c=>c.url.endsWith('/api/relay/jobs'))};
}
const done=body=>({body:{status:'done',result:{status:200,body}}});
test('Fish streams directly after one job; cancellation is scoped to audio and no PC token reaches the relay',async()=>{
  const app=runtime({results:[{body:{stream:true}}]});const controller=new AbortController();
  const response=await app.t.speechStream('A fictional voice test.',{signal:controller.signal,token:'PC_TOKEN_SENTINEL'});
  assert.deepEqual(JSON.parse(app.jobPosts()[0].init.body),{op:'speech-stream',params:{text:'A fictional voice test.'}});
  assert.equal(app.calls[1].url,'https://sync.example.invalid/api/relay/jobs/'+JOB+'/audio');
  assert.equal(app.calls[1].init.headers['X-Secret'],'MANAGER_SECRET_SENTINEL');
  assert.ok(!JSON.stringify(app.calls).includes('PC_TOKEN_SENTINEL'));
  controller.abort();await Promise.resolve();assert.equal(app.calls[2].url,'https://sync.example.invalid/api/relay/jobs/'+JOB+'/audio/cancel');
  assert.equal(app.calls[2].init.keepalive,true);response.releaseSpeech();
  const local=runtime({dev:true});await local.t.speechStream('Hello',{token:'LOCAL'});
  assert.equal(local.calls[0].url,'/api/jarvis/speech-stream');assert.equal(local.calls[0].init.headers['X-Jarvis-Session-Token'],'LOCAL');
  await assert.rejects(local.t.speechStream('x'.repeat(601)),/Invalid/);assert.equal(local.calls.length,1);
});
test('scoped WhatsApp reads retain bounded paging and literal search through the existing authenticated operation',async()=>{
  const app=runtime({results:[done({messages:[]})]});await app.t.fetch('/api/jarvis/whatsapp/inbox?view=history&chat='+ 'a'.repeat(20)+'&limit=3&offset=2&direction=both&query=door%20%26%20window');
  assert.deepEqual(JSON.parse(app.jobPosts()[0].init.body),{op:'wa-inbox',params:{chat:'a'.repeat(20),view:'history',direction:'both',query:'door & window',limit:3,offset:2}});
});
test('live voice obtains a short-lived credential through one authenticated relay job, without a key or agent override',async()=>{
  const app=runtime({results:[done({conversationToken:'EPHEMERAL_ONLY',maxDurationSeconds:600})]});const r=await app.t.fetch('/api/jarvis/live-session',{method:'POST',body:'{}'});assert.equal((await r.json()).conversationToken,'EPHEMERAL_ONLY');assert.deepEqual(JSON.parse(app.jobPosts()[0].init.body),{op:'live-session',params:{}});
  const rejected=runtime();assert.equal((await rejected.t.fetch('/api/jarvis/live-session',{method:'POST',body:'{"agentId":"OTHER"}'})).status,404);assert.equal(rejected.calls.length,0);
});

test('health travels as one manager-authenticated relay job; the PC token is replaced by a placeholder',async()=>{
  const app=runtime({results:[{body:{status:'queued'}},done({ready:true,route:'hermes',message:'Hermes is reachable.',requestToken:'LEAKED_LOCAL_TOKEN'})]});
  const res=await app.t.fetch('/api/jarvis/health',{cache:'no-store'});const body=await res.json();
  assert.equal(res.status,200);assert.equal(body.requestToken,'relay');assert.equal(body.ready,true);assert.ok(!JSON.stringify(body).includes('LEAKED'));
  assert.equal(app.jobPosts().length,1);const post=app.jobPosts()[0];
  assert.equal(post.init.headers['X-Secret'],'MANAGER_SECRET_SENTINEL');assert.deepEqual(JSON.parse(post.init.body),{op:'health',params:{}});
  assert.ok(app.calls.slice(1).every(c=>c.url==='https://sync.example.invalid/api/relay/jobs/'+JOB&&c.init.headers['X-Secret']));
});

test('WhatsApp review and send map to exact fields; a send is posted once and becomes uncertain when no result arrives',async()=>{
  const review=runtime({results:[done({reviewToken:'R'.repeat(24),version:3,text:'Hi Bex',recipient:{kind:'direct',name:'Bex',detail:'Direct chat'}})]});
  await review.t.fetch('/api/jarvis/whatsapp/review',{method:'POST',headers:{'X-Jarvis-Session-Token':'relay'},body:JSON.stringify({chat:'b'.repeat(20),version:3,text:'Hi Bex',checkedPhone:false})});
  assert.deepEqual(JSON.parse(review.jobPosts()[0].init.body),{op:'wa-review',params:{chat:'b'.repeat(20),version:3,text:'Hi Bex',checkedPhone:false}});
  const send=runtime({results:[{body:{status:'processing'}}]});
  const res=await send.t.fetch('/api/jarvis/whatsapp/send',{method:'POST',body:JSON.stringify({chat:'b'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex',to:'someone else'})});
  const body=await res.json();
  assert.equal(body.status,'uncertain');assert.match(body.message,/Check WhatsApp on the phone/);
  assert.equal(send.jobPosts().length,1);assert.deepEqual(JSON.parse(send.jobPosts()[0].init.body),{op:'wa-send',params:{chat:'b'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'}});
});

test('waiting surfaces sign-in and service errors at once; unclaimed work says nothing was sent; an offline PC is reported honestly',async()=>{
  const auth=runtime({results:[{http:401,body:{error:'Unauthorized'}}]});
  const r=await auth.t.fetch('/api/jarvis/chat',{method:'POST',body:JSON.stringify({text:'Hello',sessionId:'conversation_1',context:{}})});
  assert.equal(r.status,401);assert.match((await r.json()).error,/Sign in again/);assert.equal(auth.calls.length,2);
  const sendAuth=runtime({results:[{http:503,body:{error:'down'}}]});
  assert.equal((await (await sendAuth.t.fetch('/api/jarvis/whatsapp/send',{method:'POST',body:JSON.stringify({chat:'b'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi'})})).json()).status,'uncertain');
  const expired=runtime({results:[{body:{status:'expired'}}]});
  const e=await (await expired.t.fetch('/api/jarvis/whatsapp/send',{method:'POST',body:JSON.stringify({chat:'b'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi'})})).json();
  assert.match(e.error,/nothing was sent/);
  const offline=runtime({postStatus:503});
  const o=await offline.t.fetch('/api/jarvis/whatsapp/status',{});assert.equal(o.status,503);assert.match((await o.json()).error,/offline/);assert.equal(offline.calls.length,1);
});

test('AI drafting, model consent, WhatsApp linking and unknown endpoints are refused locally without any request',async()=>{
  const app=runtime();
  for(const [url,init] of [['/api/jarvis/whatsapp/draft',{method:'POST',body:JSON.stringify({chat:'b'.repeat(20),action:'generate'})}],['/api/jarvis/whatsapp/model-consent',{method:'POST',body:'{"enabled":true,"acknowledged":true}'}],['/api/jarvis/whatsapp/connect',{method:'POST',body:'{"acceptRisk":true}'}],['/api/jarvis/whatsapp/disconnect',{method:'POST',body:'{}'}],['/api/admin/accounts',{}],['/',{}]]){
    const res=await app.t.fetch(url,init);assert.ok(res.status===403||res.status===404,url);
  }
  assert.equal(app.calls.length,0);
  const discard=runtime({results:[done({ok:true})]});
  await discard.t.fetch('/api/jarvis/whatsapp/draft',{method:'POST',body:JSON.stringify({chat:'b'.repeat(20),action:'discard'})});
  assert.deepEqual(JSON.parse(discard.jobPosts()[0].init.body),{op:'wa-discard',params:{chat:'b'.repeat(20)}});
});

test('development preview keeps the original same-origin call; PC registration shows a code once and stores nothing',async()=>{
  const dev=runtime({dev:true});const init={cache:'no-store'};
  await dev.t.fetch('/api/jarvis/health',init);assert.deepEqual(dev.calls.map(c=>c.url),['/api/jarvis/health']);assert.equal(dev.calls[0].init,init);
  const live=runtime();
  const {deviceToken}=await live.t.registerDevice();assert.match(deviceToken,/^[a-f0-9]{64}$/);
  const post=live.calls.find(c=>c.init.method==='POST');assert.deepEqual(JSON.parse(post.init.body),{action:'register'});assert.equal(post.init.headers['X-Secret'],'MANAGER_SECRET_SENTINEL');
  assert.deepEqual(await live.t.deviceStatus(),{registered:true,online:false,lastSeen:''});
  const signedOut=runtime({extra:{SYNC_SECRET:''}});
  assert.equal((await signedOut.t.fetch('/api/jarvis/health',{})).status,401);assert.equal(signedOut.calls.length,0);
});

test('the PC-registration disclosure states retention honestly: expiry times and removal on next relay use, not a hard limit',()=>{
  const source=read('src/assistant/jarvis.js'),text=source.slice(source.indexOf('id="jarvis-relay"'),source.indexOf('</details>',source.indexOf('id="jarvis-relay"')));
  assert.match(text,/after 30 seconds for a WhatsApp send, 5 minutes otherwise/);assert.match(text,/a reply after 2 minutes/);assert.match(text,/removed the next time the relay is used/);
  assert.doesNotMatch(text,/at most/);assert.match(text,/AI WhatsApp drafts stay off/);assert.match(text,/must stay on and awake/);
});

test('the remote WhatsApp inbox offers manual replies only: no AI consent, Draft again, Connect or Disconnect controls',async()=>{
  const status=done({available:true,requestToken:'LOCAL'}),inbox=done({connection:{state:'disconnected',message:'Not connected.'},consent:{account:true,model:true,modelAvailable:true},chats:[]});
  const app=runtime({results:[status,inbox]});
  const rootEl={innerHTML:'',listeners:{},addEventListener(t,f){this.listeners[t]=f;},querySelector:()=>null,querySelectorAll:()=>[],remove(){}};
  Object.assign(app.sandbox,{document:{createElement:()=>rootEl,body:{appendChild(){}},querySelector:()=>null,activeElement:null}});
  vm.runInContext(read('src/assistant/jarvis-whatsapp.js'),app.context);
  app.sandbox.SV_JARVIS_WHATSAPP.open();
  for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  const html=rootEl.innerHTML;
  assert.match(html,/AI drafts are off when you use Jarvis from another device/);assert.match(html,/Connect WhatsApp on the Jarvis PC itself/);
  assert.doesNotMatch(html,/data-wa="consent-on"|data-wa="consent-off"|data-wa="connect"|data-wa="disconnect"|data-wa="generate"|wa-risk/);
  assert.ok(app.jobPosts().every(p=>['wa-status','wa-inbox'].includes(JSON.parse(p.init.body).op)));
  app.sandbox.SV_JARVIS_WHATSAPP.close();
});
