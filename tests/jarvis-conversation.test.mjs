import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationContext,parseDecision} from '../tools/jarvis/conversation.mjs';
import {modelPayload,createJarvisServer} from '../tools/jarvis/serve.mjs';
const key='a'.repeat(20),contacts=[{key,name:'Bex',kind:'direct',detail:'Direct chat',messages:['PRIVATE_INCOMING'],reviewToken:'PRIVATE_TOKEN'}];
const context={today:'2026-10-15',cleanings:[],dialogue:{schema:1,ownerTurns:['Could you ask Bex how she is?'],whatsapp:{stage:'review',recipient:{key},lastRecipient:{key},draft:'Hello',reviewToken:'TOKEN_SENTINEL',messages:['MESSAGE_SENTINEL']},contacts:[{name:'INJECTED_CONTACT'}]}};

test('conversation revalidates contacts and strips incoming content, tokens and client-supplied contact lists',()=>{
  const out=conversationContext(context.dialogue,contacts),text=JSON.stringify(out);
  assert.equal(out.whatsapp.recipient.name,'Bex');assert.equal(out.whatsapp.draft,'Hello');
  for(const s of ['PRIVATE_INCOMING','PRIVATE_TOKEN','TOKEN_SENTINEL','MESSAGE_SENTINEL','INJECTED_CONTACT'])assert.ok(!text.includes(s),s);
  assert.equal(conversationContext({...context.dialogue,whatsapp:{recipient:{key:'b'.repeat(20)}}},contacts).whatsapp.recipient,null);
  const payload=modelPayload({text:'Hi, can you send message to bex saying hi how are you?',sessionId:'test_session_123',context},contacts);
  assert.equal(payload.payload.messages.length,2);assert.match(payload.payload.messages[0].content,/NO send\/approve action/);assert.match(payload.payload.messages[1].content,/Bex/);
  assert.deepEqual(payload.payload.model_options,{reasoning:{effort:'low'}});
  assert.throws(()=>conversationContext({schema:9}),/interpret/);
});

test('AI proposals cannot grant send approval or introduce unsupported tools',()=>{
  for(const kind of ['send','approve','terminal','execute','ambiguousApproval'])assert.throws(()=>parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind,chat:key,text:'Hello'}})),/interpret/);
  assert.throws(()=>parseDecision('{"kind":"execute","text":"run code"}'),/interpret/);
  assert.throws(()=>parseDecision('I sent it.'),/interpret/);
  assert.throws(()=>parseDecision('{"kind":"whatsapp","intent":{"kind":"write","chat":"invalid","text":"Hi"}}'),/interpret/);
  assert.throws(()=>parseDecision('{"kind":"whatsapp","intent":{"kind":"choose","option":6}}'),/interpret/);
  assert.deepEqual(parseDecision('```json\n{"kind":"whatsapp","intent":{"kind":"write","name":"Bex","text":"Hi","approve":true,"reviewToken":"secret"}}\n```'),{kind:'whatsapp',intent:{kind:'write',name:'Bex',group:false,text:'Hi'}});
});
test('record decisions share the read-only query contract and discard raw financial or secret context',()=>{
  assert.deepEqual(parseDecision(JSON.stringify({kind:'records',query:{entity:'bookings',guest:'Example Guest',view:'payment',send:true,code:'RUN'}})),{kind:'records',query:{entity:'bookings',view:'payment',guest:'Example Guest'}});
  assert.throws(()=>parseDecision('{"kind":"navigate","destination":"terminal"}'),/interpret/);assert.throws(()=>parseDecision('{"kind":"records","query":{"entity":"bookings","view":"delete"}}'),/interpret/);
  const records={available:true,coverage:{bookings:300,paymentReceiptsTracked:true,apiKey:'PRIVATE_KEY'},state:{query:{entity:'bookings',guest:'Example Guest'},selected:{entity:'bookings',id:'b',label:'Example Guest',totalPrice:'FINANCIAL_SENTINEL',notes:'PRIVATE_NOTES'},bookings:['FULL_CATALOG']}};
  const c=conversationContext({...context.dialogue,records},contacts);assert.equal(c.records.available,true);assert.equal(c.records.coverage.bookings,300);assert.equal(c.records.coverage.paymentReceiptsTracked,false);
  for(const value of ['PRIVATE_KEY','FINANCIAL_SENTINEL','PRIVATE_NOTES','FULL_CATALOG'])assert.ok(!JSON.stringify(c).includes(value));
});

test('structured understanding travels through the existing authenticated n8n route; execution is still separate',async t=>{
  const calls=[];let modelAnswer=JSON.stringify({kind:'whatsapp',intent:{kind:'write',chat:key,text:'Hi, how are you?'}});
  const server=createJarvisServer({apiKey:'HERMES_SENTINEL',route:'n8n',n8nKey:'N8N_SENTINEL',whatsapp:()=>({inbox:()=>({chats:contacts})}),fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});return new Response(JSON.stringify(String(url).endsWith('/toolsets')?[{enabled:true,tools:['memory','session_search']}]:{reply:modelAnswer}));
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
  const health=await(await fetch(base+'/api/jarvis/health')).json();assert.equal(health.conversation,1);
  const ask=()=>fetch(base+'/api/jarvis/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Session-Token':health.requestToken},body:JSON.stringify({text:'Hi, can you send message to bex saying hi how are you?',sessionId:'test_session_123',context})});
  let response=await ask();assert.equal(response.status,200);assert.equal((await response.json()).decision.intent.chat,key);
  const call=calls.find(c=>c.url.includes('/webhook/'));assert.equal(call.init.headers['X-Jarvis-Key'],'N8N_SENTINEL');assert.match(call.init.body,/Bex/);
  for(const s of ['PRIVATE_INCOMING','TOKEN_SENTINEL','INJECTED_CONTACT','N8N_SENTINEL','HERMES_SENTINEL'])assert.ok(!call.init.body.includes(s),s);
  modelAnswer=JSON.stringify({kind:'whatsapp',intent:{kind:'approve'}});response=await ask();assert.equal(response.status,200);assert.equal((await response.json()).decision.kind,'clarify');
  assert.ok(calls.every(c=>!c.url.includes('/whatsapp/send')));
});
