import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import PERSONAL from '../src/assistant/jarvis-personal.js';
import {createPersonalMemory} from '../tools/jarvis/personal-memory.mjs';
import {createJarvisServer} from '../tools/jarvis/serve.mjs';
const props=[{id:'mar',name:'Villa Mar'},{id:'marjals',name:'Villa Marjals'}];
const address={action:'set_address',value:'Sir'},alias={action:'set_alias',alias:'Villa Lumina',property:'Villa Mar'};
function fixture(){let value=PERSONAL.empty();const store={load:()=>structuredClone(value),save:v=>{value=structuredClone(v);}};return createPersonalMemory({store});}
const change=(memory,text,operation,more={})=>memory.execute({text,operation,properties:props,...more});

test('explicit owner wording recognizes natural variations while quotations and hypotheticals do not create preferences',()=>{
  for(const text of ['From now on call me Sir, not Antonio','Please call me Sir from now on','Could you address me as Sir instead'])assert.deepEqual(PERSONAL.direct(text),address);
  assert.deepEqual(PERSONAL.direct('When I say Villa Lumina, I mean Villa Mar'),alias);
  for(const text of ['For example, call me Sir','If I say call me Sir, what happens?','A guest said call me Sir','“Call me Sir”','Don’t remember this: call me Sir','Call me tomorrow'])assert.equal(PERSONAL.direct(text),null);
  for(const text of ['Do not call me Sir','Don’t call me Sir','Stop calling me Sir'])assert.equal(PERSONAL.authorized(text,address),false);
  assert.equal(PERSONAL.authorized('Don’t call me Antonio, call me Sir',address),true);
});
test('preferences survive actual disk reload, a fresh service instance and an independent client; no business fields are changed',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'jarvis-memory-test-')),file=path.join(dir,'profile.json');
  t.after(()=>{for(const name of readdirSync(dir))unlinkSync(path.join(dir,name));rmdirSync(dir);});
  const first=createPersonalMemory({file});change(first,'Call me Sir',address);change(first,'When I say Villa Lumina, I mean Villa Mar',alias);
  const reopened=createPersonalMemory({file}),client=PERSONAL.profile(reopened.get());
  assert.equal(client.preferredAddress,'Sir');assert.equal(client.aliases[0].propertyId,'mar');assert.equal(client.version,2);
  assert.equal(props[0].name,'Villa Mar');assert.equal(JSON.parse(readFileSync(file)).schema,1);
});
test('updates, forgetting and stale-client protection keep one authoritative profile without resurrecting old values',()=>{
  const memory=fixture();change(memory,'Call me Sir',address,{version:0});
  const same=change(memory,'Call me Sir',address,{version:0});assert.equal(same.personalMemory.version,1);
  const stale=change(memory,'Call me Captain',{action:'set_address',value:'Captain'},{version:0});assert.equal(stale.kind,'clarify');assert.equal(memory.get().preferredAddress,'Sir');
  change(memory,'When I say Villa Lumina, I mean Villa Mar',alias);
  change(memory,'Forget the nickname Villa Lumina',{action:'forget_alias',alias:'Villa Lumina'});
  assert.equal(memory.get().aliases.length,0);assert.equal(memory.get().preferredAddress,'Sir');
  change(memory,'Clear my preferred name',{action:'clear_address'});assert.equal(memory.get().preferredAddress,'');
});
test('alias resolution follows stable IDs through a rename, preserves Mar/Marjals boundaries and refuses missing/colliding targets',()=>{
  const memory=fixture();change(memory,'When I say Villa Lumina, I mean Villa Mar',alias);
  const saved=memory.get();
  assert.equal(PERSONAL.resolve('VILLA LÚMINA',props,{saved}).match.id,'mar');
  assert.equal(PERSONAL.resolve('Villa Marjals',props,{saved}),null);
  assert.equal(PERSONAL.resolve('Villa Lumina',[{id:'mar',name:'Renamed Villa'}],{saved}).match.name,'Renamed Villa');
  assert.equal(PERSONAL.resolve('Villa Lumina',[],{saved}).unknown,true);
  assert.equal(PERSONAL.resolve('Villa Lumina',[...props,{id:'other',name:'Villa Lumina'}],{saved}).ambiguous,true);
  assert.equal(PERSONAL.resolve('cleanings for Villa Lumina tomorrow',props,{saved,phrase:true}).match.id,'mar');
});
test('unknown and duplicate targets clarify without writing; a canonical-name collision does not redirect another property',()=>{
  const memory=fixture();let result=change(memory,'When I say Sunshine, I mean Missing Villa',{action:'set_alias',alias:'Sunshine',property:'Missing Villa'});
  assert.equal(result.kind,'clarify');assert.equal(result.pending.alias,'Sunshine');assert.equal(memory.get().version,0);
  result=memory.execute({text:'When I say Lumina, I mean Villa Mar',operation:{...alias,alias:'Lumina'},properties:[...props,{id:'duplicate',name:'Villa Mar'}]});
  assert.equal(result.kind,'clarify');
  result=change(memory,'When I say Villa Marjals, I mean Villa Mar',{...alias,alias:'Villa Marjals'});assert.equal(result.kind,'clarify');assert.equal(memory.get().version,0);
});
test('source text, unrelated requests and failed or corrupt storage can never produce a successful saved preference',()=>{
  const memory=fixture();assert.equal(change(memory,'What bookings are next week?',address).kind,'clarify');
  assert.equal(change(memory,'For example, call me Sir',address).kind,'clarify');assert.equal(memory.get().version,0);
  const broken=createPersonalMemory({store:{load:()=>PERSONAL.empty(),save:()=>{throw Error('Disk unavailable');}}});assert.throws(()=>change(broken,'Call me Sir',address),/Disk/);
  const lying=createPersonalMemory({store:{load:()=>PERSONAL.empty(),save(){}}});assert.throws(()=>change(lying,'Call me Sir',address),/verified/);
  const corrupt=createPersonalMemory({store:{load:()=>({schema:9}),save:()=>assert.fail('must not overwrite corrupt memory')}});assert.throws(()=>change(corrupt,'Call me Sir',address));
});
test('saved aliases feed real read-only records, voice/focus and a reviewable cleaning plan without saving records',()=>{
  const memory=fixture();change(memory,'When I say Villa Lumina, I mean Villa Mar',alias);change(memory,'Call me Sir',address);
  const data={props:structuredClone(props),bookings:[{id:'b1',propId:'mar',checkIn:'2026-10-19',checkOut:'2026-10-21',status:'confirmed'},{id:'b2',propId:'marjals',checkIn:'2026-10-19',checkOut:'2026-10-22',status:'confirmed'}],sessions:[],tasks:[],issues:[],cleaners:[]};
  const sandbox={window:null,D:data,console,DEV_MODE:true,document:{addEventListener(){}},getRequiredCleanersForProperty:()=>1};sandbox.window=sandbox;
  const ctx=vm.createContext(sandbox),root=path.dirname(fileURLToPath(new URL('../index.html',import.meta.url)));
  for(const name of ['src/utils/dates.js','src/assistant/jarvis-personal.js','src/ui/voice.js','src/assistant/jarvis-data.js','src/assistant/jarvis-records.js','src/assistant/jarvis-operations.js'])vm.runInContext(readFileSync(path.join(root,name),'utf8'),ctx);
  sandbox.SV_JARVIS_PERSONAL.set(memory.get());const before=JSON.stringify(data);
  const records=sandbox.SV_JARVIS_RECORDS.create({getData:()=>data,reference:()=> '2026-10-18'});
  const result=records.run({entity:'bookings',property:'Villa Lumina',view:'list'});assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,'b1');
  assert.equal(vm.runInContext('resolveVoiceProperty("cleanings at Villa Lumina tomorrow").id',ctx),'mar');
  assert.equal(sandbox.SV_JARVIS_DATA.cleaningFocus('cleanings at Villa Lumina tomorrow','2026-10-18').unknownProperty,false);
  assert.match(sandbox.SV_JARVIS_DATA.localAnswer('hello','2026-10-18'),/Sir/);
  const engine=sandbox.SV_JARVIS_OPERATIONS.create({getData:()=>data,reference:()=> '2026-10-18',records:()=>records,persist:()=>assert.fail('planning cannot save')});
  const plan=engine.handle({action:'plan_checkout_cleanings',start:'2026-10-19',end:'2026-10-25',property:'Villa Lumina'});assert.equal(plan.kind,'plan');assert.equal(plan.plan.items.length,1);assert.equal(plan.plan.items[0].property,'Villa Mar');
  assert.equal(JSON.stringify(data),before);
});

async function serverFixture(t,{memory=fixture(),model=null}={}){
  const server=createJarvisServer({port:0,personalMemory:memory,apiKey:model?'FICTIONAL_TEST_KEY':'',fetchImpl:async(url,init)=>String(url).endsWith('toolsets')?new Response(JSON.stringify([{enabled:true,tools:['memory','session_search']}])):new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(await model(JSON.parse(init.body)))}}]}))});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port,health=await (await fetch(base+'/api/jarvis/health')).json();
  const request=(text,more={},token=health.requestToken)=>fetch(base+'/api/jarvis/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Jarvis-Session-Token':token},body:JSON.stringify({text,sessionId:'fictional-session-one',context:{today:'2026-10-18',properties:props,memoryProperties:props,...more}})});
  return {base,request,memory};
}
test('the protected existing chat route saves and reloads memory without a model call; unauthenticated writes fail',async t=>{
  const s=await serverFixture(t);let r=await s.request('Call me Sir',{},'wrong');assert.equal(r.status,403);assert.equal(s.memory.get().version,0);
  r=await s.request('Call me Sir');const value=await r.json();assert.equal(r.status,200);assert.equal(value.route,'memory');assert.equal(value.personalMemory.preferredAddress,'Sir');assert.equal(value.decision.retainTask,true);
  const fresh=await (await fetch(s.base+'/api/jarvis/health')).json();assert.equal(fresh.personalMemory.preferredAddress,'Sir');assert.equal(fresh.personalMemory.version,1);
  r=await s.request('When I say Villa Lumina, I mean Villa Mar');assert.equal((await r.json()).personalMemory.aliases[0].propertyId,'mar');
});
test('imperfect wording takes the existing reasoning route and its memory proposal is validated and persisted by the app',async t=>{
  let calls=0;const s=await serverFixture(t,{model:async payload=>{calls++;assert.match(payload.messages[0].content,/plain, natural English/);return {kind:'memory',operation:address};}});
  const r=await s.request('Would you mind using Sir as my title from now on?',{dialogue:{schema:1}}),body=await r.json();
  assert.equal(r.status,200);assert.equal(body.route,'memory');assert.equal(body.personalMemory.preferredAddress,'Sir');assert.equal(calls,1);
});
test('a hallucinated memory proposal cannot save a preference from an unrelated request',async t=>{
  const s=await serverFixture(t,{model:async()=>({kind:'memory',operation:address})});
  const body=await (await s.request('How many bookings next week?',{dialogue:{schema:1}})).json();assert.equal(body.decision.kind,'clarify');assert.equal(s.memory.get().version,0);
});
