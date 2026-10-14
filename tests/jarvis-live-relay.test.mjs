import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateConfig,mapJob,sanitize,createRelayAgent,createFileStore,PRODUCTION_RELAY} from '../tools/jarvis/live-relay.mjs';

/* Mock cloud + mock loopback server only. No real Worker, Jarvis server, WhatsApp or network. */
const CODE='d'.repeat(64),LOCAL_TOKEN='LOCAL_SESSION_TOKEN_SENTINEL',config={cloudUrl:PRODUCTION_RELAY,localUrl:'http://127.0.0.1:5500',deviceToken:CODE};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const job=(op,params={})=>({jobId:(op.length.toString(16)+'f'.repeat(64)).slice(0,64),op,params});
function memoryStore(initial={...config}){let data=JSON.parse(JSON.stringify(initial));return {load:()=>JSON.parse(JSON.stringify(data)),save(v){data=JSON.parse(JSON.stringify(v));},peek:()=>data};}
function harness({jobs=[],local=async()=>json(200,{}),cloud=null,store=memoryStore(),every}={}){
  const queue=[...jobs],completed=[],localCalls=[],cloudCalls=[];let agent;
  const fetchImpl=async(url,init)=>{
    assert.equal(init.redirect,'error');
    if(url.startsWith(PRODUCTION_RELAY)){
      cloudCalls.push({url,init});assert.equal(init.headers.Authorization,'Bearer '+CODE);assert.ok(!String(init.body).includes(LOCAL_TOKEN),'local token sent to the cloud');
      if(cloud){const r=await cloud(url,init);if(r)return r;}
      const p=new URL(url).pathname;
      if(p==='/api/relay/device/claim')return json(200,{job:queue.shift()||null});
      if(p==='/api/relay/device/complete'){completed.push(JSON.parse(init.body));return json(200,{ok:true});}
      if(p==='/api/relay/device/heartbeat')return json(200,{ok:true});
      return json(404,{});
    }
    assert.ok(url.startsWith('http://127.0.0.1:5500/'),url);assert.equal(init.headers.Authorization,undefined);
    localCalls.push({url,init});
    if(url.endsWith('/api/jarvis/whatsapp/status'))return json(200,{available:true,requestToken:LOCAL_TOKEN});
    return local(url,init);
  };
  const sleeps=[];
  agent=createRelayAgent({config:store.load(),store,fetchImpl,sleep:async ms=>{sleeps.push(ms);if(!queue.length&&ms===2500)agent.stop();},...(every?{every}:{})});
  return {agent,completed,localCalls,cloudCalls,sleeps,store};
}

test('configuration: only the production Worker over https and an exact loopback Jarvis server are accepted',()=>{
  assert.deepEqual(validateConfig(config),{cloudUrl:PRODUCTION_RELAY,localUrl:'http://127.0.0.1:5500',deviceToken:CODE});
  for(const cloudUrl of ['http://seravillas-sync.antonio-01e.workers.dev','https://evil.workers.dev','https://seravillas-sync.antonio-01e.workers.dev/other','https://user:pass@seravillas-sync.antonio-01e.workers.dev'])assert.throws(()=>validateConfig({...config,cloudUrl}),/cloudUrl/);
  for(const localUrl of ['http://192.168.1.20:5500','https://127.0.0.1:5500','http://127.0.0.1:5500/api','http://user:p@127.0.0.1:5500','http://127.0.0.2:5500'])assert.throws(()=>validateConfig({...config,localUrl}),/localUrl/);
  assert.throws(()=>validateConfig({...config,deviceToken:'SECRET_LIKE_VALUE'}),e=>/deviceToken/.test(e.message)&&!e.message.includes('SECRET_LIKE_VALUE'));
});

test('jobs map to exactly one existing local endpoint; AI drafting, consent and WhatsApp linking are refused',()=>{
  assert.deepEqual(mapJob(job('wa-send',{chat:'a'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'})),{method:'POST',path:'/api/jarvis/whatsapp/send',needsToken:true,body:{chat:'a'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'}});
  assert.deepEqual(mapJob(job('wa-discard',{chat:'b'.repeat(20)})).body,{chat:'b'.repeat(20),action:'discard'});
  assert.equal(mapJob(job('wa-inbox',{chat:'c'.repeat(20)})).path,'/api/jarvis/whatsapp/inbox?chat='+'c'.repeat(20));
  for(const op of ['wa-model-consent','model-consent','wa-generate','generate','wa-connect','connect','disconnect','file','shell','__proto__'])assert.throws(()=>mapJob(job(op)),/not allowed/,op);
  assert.throws(()=>mapJob(job('wa-inbox',{chat:'../../etc'})),/not allowed/);
  assert.deepEqual(sanitize({status:200,body:{available:true,requestToken:LOCAL_TOKEN,connection:{state:'qr',qr:'data:image/png;base64,QR'}}}),{status:200,body:{available:true,connection:{state:'qr'}}});
});

test('the local session token is used only on loopback and never appears in results sent to the cloud',async()=>{
  const chatBody={text:'How many cleanings today?',sessionId:'conversation_1',context:{today:'2026-10-18'}};
  const h=harness({jobs:[job('health'),job('chat',chatBody)],local:async(url,init)=>{
    if(url.endsWith('/api/jarvis/health'))return json(200,{ready:true,route:'hermes',message:'ok',requestToken:LOCAL_TOKEN});
    if(url.endsWith('/api/jarvis/chat')){assert.equal(init.headers['X-Jarvis-Session-Token'],LOCAL_TOKEN);assert.deepEqual(JSON.parse(init.body),chatBody);return json(200,{reply:'One cleaning today.',route:'hermes'});}
    return json(404,{});
  }});
  await h.agent.run();
  assert.equal(h.completed.length,2);
  assert.deepEqual(h.completed[0].result,{status:200,body:{ready:true,route:'hermes',message:'ok'}});
  assert.deepEqual(h.completed[1].result,{status:200,body:{reply:'One cleaning today.',route:'hermes'}});
});

test('a send is written to the ledger before it runs, posted once, and a timeout is reported as uncertain without retrying',async()=>{
  const store=memoryStore();let sends=0;
  const h=harness({store,jobs:[job('wa-send',{chat:'a'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'})],local:async(url)=>{
    if(url.endsWith('/send')){sends++;const entry=Object.values(store.peek().ledger)[0];assert.equal(entry.state,'started');assert.equal(entry.op,'wa-send');throw Object.assign(Error('timeout'),{name:'TimeoutError'});}
    return json(404,{});
  }});
  await h.agent.run();
  assert.equal(sends,1);
  assert.equal(h.completed[0].result.body.status,'uncertain');assert.match(h.completed[0].result.body.message,/Check WhatsApp on the phone/);
  assert.equal(Object.values(store.peek().ledger)[0].state,'reported');
});

test('after a restart an interrupted send is reported as uncertain and never executed again; a repeated job is never re-run',async()=>{
  const jobId='e'.repeat(64),store=memoryStore({...config,ledger:{[jobId]:{op:'wa-send',state:'started',at:1}}});
  const h=harness({store,jobs:[{jobId,op:'wa-send',params:{chat:'a'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'}}]});
  await h.agent.run();
  assert.equal(h.localCalls.filter(c=>c.url.endsWith('/send')).length,0);
  assert.equal(h.completed.length,1);assert.equal(h.completed[0].jobId,jobId);assert.equal(h.completed[0].result.body.status,'uncertain');
  assert.equal(store.peek().ledger[jobId].state,'reported');
  const dir=mkdtempSync(path.join(tmpdir(),'jarvis-relay-'));
  try{const file=path.join(dir,'jarvis-live-relay.json'),disk=createFileStore(file);disk.save({...config,ledger:{}});const reread=JSON.parse(readFileSync(file,'utf8'));assert.equal(reread.deviceToken,CODE);assert.deepEqual(reread.ledger,{});}
  finally{rmSync(dir,{recursive:true,force:true});}
});

test('a revoked or wrong PC code stops the agent with a clear message; network failures back off without running anything',async()=>{
  const revoked=harness({cloud:async()=>json(401,{error:'This PC is no longer registered'})});
  const result=await revoked.agent.run();
  assert.equal(result.stopped,'auth');assert.match(result.message,/Register it again/);assert.equal(revoked.localCalls.length,0);
  let attempts=0;
  const flaky=harness({cloud:async()=>{attempts++;if(attempts<=2)throw Error('network down');return json(403,{});}});
  const r=await flaky.agent.run();
  assert.equal(r.stopped,'auth');assert.deepEqual(flaky.sleeps,[2000,4000]);assert.equal(flaky.localCalls.length,0);assert.equal(attempts,3);
});

test('long jobs keep the PC online with authenticated heartbeats, which stop when the job ends',async()=>{
  let beat=null,stopped=0,release;
  const every=(fn,ms)=>{assert.equal(ms,20000);beat=fn;return ()=>{stopped++;};};
  const h=harness({every,jobs:[job('chat',{text:'Tell me about next week',sessionId:'conversation_1',context:{}})],local:async url=>{
    if(url.endsWith('/api/jarvis/chat')){await new Promise(r=>{release=r;});return json(200,{reply:'Done.'});}
    return json(404,{});
  }});
  const running=h.agent.run();
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(typeof beat,'function');beat();await new Promise(r=>setImmediate(r));
  assert.equal(h.cloudCalls.filter(c=>c.url.endsWith('/heartbeat')).length,1);
  release();await running;
  assert.equal(stopped,1);assert.equal(h.completed[0].result.body.reply,'Done.');
});
