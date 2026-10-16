import test from 'node:test';
import assert from 'node:assert/strict';
import {createJarvisServer,sanitizeContext,modelPayload,checkToolsets,localUrl} from '../tools/jarvis/serve.mjs';
const context={today:'2026-10-13',source:'Fictional development preview',window:{start:'2026-10-06',end:'2026-11-17'},cleanings:[]};
const tools=[{enabled:true,configured:true,tools:['memory','session_search']}];
/* Shape returned by the live shared gateway at /p/seravillas/v1/toolsets. */
const liveTools={object:'list',platform:'api_server',data:[{name:'memory',enabled:true,tools:['memory']},{name:'session_search',enabled:true,tools:['session_search']},{name:'terminal',enabled:false,tools:['terminal']}]};
test('bridge re-whitelists app summaries and rejects external pilot services',()=>{
  const output=JSON.stringify(sanitizeContext({...context,sv_secret:'KEY_SENTINEL',bookings:[{guestName:'GUEST_SENTINEL'}],photos:['PHOTO_SENTINEL']}));for(const value of ['KEY_SENTINEL','GUEST_SENTINEL','PHOTO_SENTINEL'])assert.ok(!output.includes(value));
  assert.throws(()=>localUrl('https://example.com'),/loopback/);assert.throws(()=>localUrl('http://user:pass@localhost:8642'),/loopback/);assert.throws(()=>modelPayload({text:'hello',context,sessionId:'bad\r\nheader'}),/identifier/);
  assert.throws(()=>checkToolsets([{enabled:true,tools:['memory','terminal']}]),/only memory/);assert.equal(checkToolsets(tools),true);
});
test('tool discovery accepts the live data envelope and legacy formats, and stays fail-closed',()=>{
  assert.equal(checkToolsets(liveTools),true);assert.equal(checkToolsets(tools),true);assert.equal(checkToolsets({toolsets:tools}),true);
  assert.throws(()=>checkToolsets({...liveTools,data:liveTools.data.map(r=>r.name==='terminal'?{...r,enabled:true}:r)}),/only memory/);
  assert.throws(()=>checkToolsets({...liveTools,data:liveTools.data.filter(r=>r.name!=='memory')}),/memory tool is not enabled/);
  assert.throws(()=>checkToolsets({...liveTools,data:liveTools.data.map(r=>({...r,enabled:false}))}),/No enabled/);
  for(const bad of [{object:'list',data:'memory'},{object:'list',data:{memory:true}},{object:'list',data:null,toolsets:tools},{object:'list'},null,'list'])assert.throws(()=>checkToolsets(bad),/unsupported format/);
});
async function fixture(t,options={}){
  const requests=[];
  const fetchImpl=async(url,init)=>{requests.push({url:String(url),init});return new Response(JSON.stringify(String(url).endsWith('/v1/toolsets')?liveTools:{choices:[{message:{content:'At your service.'}}]}),{status:200,headers:{'Content-Type':'application/json'}});};
  const server=createJarvisServer({port:5500,apiKey:'HERMES_SECRET_SENTINEL',fetchImpl,...options});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const request=(pathname,init={})=>fetch(base+pathname,init);return {request,requests,origin:base};
}
test('local Fish streaming requires the session and JSON, exposes audio only and completes with a verified frame count',async t=>{
  let calls=0;const f=await fixture(t,{speechProvider:{status:()=>({available:true,provider:'fish'}),stream:async(text,push)=>{calls++;assert.equal(text,'Fictional sample');await push({type:'audio',sampleRate:24000,audio:'AAAA'});return {frames:1};}}});
  const health=await(await f.request('/api/jarvis/health')).json(),url='/api/jarvis/speech-stream',body=JSON.stringify({text:'Fictional sample'}),headers={'X-Jarvis-Session-Token':health.requestToken,'Content-Type':'application/json'};
  assert.equal((await f.request(url,{method:'POST',body})).status,403);
  assert.equal((await f.request(url,{method:'POST',headers:{'X-Jarvis-Session-Token':health.requestToken},body})).status,415);
  assert.equal((await f.request(url,{method:'POST',headers,body:JSON.stringify({text:'Fictional sample',voiceId:'other'})})).status,400);
  assert.equal(calls,0);const response=await f.request(url,{method:'POST',headers,body});assert.match(response.headers.get('content-type'),/ndjson/);
  assert.deepEqual((await response.text()).trim().split('\n').map(JSON.parse),[{type:'audio',sampleRate:24000,audio:'AAAA',seq:0},{type:'end',frames:1}]);assert.equal(calls,1);
});
test('local auth, origin checks and private-file denial protect the agent route',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/jarvis/health',{headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await f.request('/api/jarvis/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  for(const name of ['/.git/config','/tools/jarvis/hermes-config.example.yaml','/README.md'])assert.equal((await f.request(name)).status,404);
  assert.equal((await f.request('/index.html')).status,200);
});
test('direct Hermes requests preserve session continuity and never return service credentials',async t=>{
  const f=await fixture(t);const health=await(await f.request('/api/jarvis/health')).json();assert.equal(health.ready,true);assert.ok(!JSON.stringify(health).includes('HERMES_SECRET_SENTINEL'));
  const response=await f.request('/api/jarvis/chat',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json','X-Jarvis-Session-Token':health.requestToken},body:JSON.stringify({text:'Hello',sessionId:'conversation_123',context})});assert.equal(response.status,200);assert.equal((await response.json()).reply,'At your service.');
  const call=f.requests.find(r=>r.url.endsWith('/v1/chat/completions'));assert.equal(call.init.headers['X-Hermes-Session-Id'],'conversation_123');assert.equal(call.init.headers.Authorization,'Bearer HERMES_SECRET_SENTINEL');assert.ok(!call.init.body.includes('HERMES_SECRET_SENTINEL'));
});
async function healthThenChat(f){
  const health=await(await f.request('/api/jarvis/health')).json();assert.equal(health.ready,true);assert.ok(!JSON.stringify(health).includes('HERMES_SECRET_SENTINEL'));
  const response=await f.request('/api/jarvis/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Session-Token':health.requestToken},body:JSON.stringify({text:'Hello',sessionId:'conversation_123',context})});assert.equal(response.status,200);
  return f.requests.map(r=>r.url);
}
test('Hermes discovery and chat keep the seravillas profile prefix by default and for a slashless custom base',async t=>{
  for(const [options,base] of [[{},'http://127.0.0.1:8642/p/seravillas/'],[{hermesUrl:'http://localhost:8642/p/seravillas'},'http://localhost:8642/p/seravillas/']]){
    const f=await fixture(t,options);assert.deepEqual(await healthThenChat(f),[base+'v1/toolsets',base+'v1/toolsets',base+'v1/chat/completions']);
  }
});
test('an explicitly unprefixed loopback Hermes base still works',async t=>{
  const f=await fixture(t,{hermesUrl:'http://127.0.0.1:8642'});
  assert.deepEqual(await healthThenChat(f),['http://127.0.0.1:8642/v1/toolsets','http://127.0.0.1:8642/v1/toolsets','http://127.0.0.1:8642/v1/chat/completions']);
  assert.throws(()=>createJarvisServer({hermesUrl:'http://example.com/p/seravillas/'}),/loopback/);
});
test('n8n route forwards prepared requests with a separate webhook credential',async t=>{
  const f=await fixture(t,{route:'n8n',n8nKey:'N8N_SECRET_SENTINEL'});const health=await(await f.request('/api/jarvis/health')).json();
  const response=await f.request('/api/jarvis/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Session-Token':health.requestToken},body:JSON.stringify({text:'Hello',sessionId:'conversation_123',context})});assert.equal(response.status,200);const call=f.requests.find(r=>r.url.includes('/webhook/'));assert.equal(call.init.headers['X-Jarvis-Key'],'N8N_SECRET_SENTINEL');assert.ok(!call.init.body.includes('HERMES_SECRET_SENTINEL'));assert.ok(!call.init.body.includes('N8N_SECRET_SENTINEL'));
});
