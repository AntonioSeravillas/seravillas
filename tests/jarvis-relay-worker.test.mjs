import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import * as worker from '../cloudflare/worker.mjs';

/* Fake D1 over in-memory SQLite (same shape as the cleaner backend tests). No Cloudflare, no real data. */
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
class SQL{
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(fs.readFileSync(path.join(root,'cloudflare/schema.sql'),'utf8'));}
  withSession(mode){assert.equal(mode,'first-primary');return this;}
  /* hook(sqlText) runs just before a statement executes, to simulate a request landing in between (races). */
  prepare(sql){const database=this,before=()=>{const hook=database.hook;if(hook&&hook(sql)!==false)database.hook=null;};return {values:[],bind(...values){this.values=values;return this;},async first(){before();return database.sqlite.prepare(sql).get(...this.values)||null;},async all(){return {results:database.sqlite.prepare(sql).all(...this.values)};},async run(){before();const r=database.sqlite.prepare(sql).run(...this.values);return {meta:{changes:Number(r.changes)}};},sync(){const r=database.sqlite.prepare(sql).run(...this.values);return {meta:{changes:Number(r.changes)}};}};}
  async batch(statements){this.sqlite.exec('BEGIN');try{const results=statements.map(s=>s.sync());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function setup(){
  let now=1_000_000_000;worker.setRelayClockForTests(()=>now);
  const sql=new SQL(),env={SECRET:'SYNTHETIC_MANAGER_KEY',STAFF_DB:sql,DB:{async get(){return 'KV_SENTINEL';},async put(){throw Error('The relay must never write KV');}}};
  const call=(route,method='GET',payload,headers={})=>worker.default.fetch(new Request('https://service.invalid'+route,{method,headers:{'Content-Type':'application/json',...headers},...(payload===undefined?{}:{body:typeof payload==='string'?payload:JSON.stringify(payload)})}),env);
  const manager=(route,method='GET',payload,headers={})=>call(route,method,payload,{'X-Secret':env.SECRET,...headers});
  const device=(route,code,payload={})=>call(route,'POST',payload,{Authorization:'Bearer '+code});
  const tables=()=>sql.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'relay_%' ORDER BY name").all().map(r=>r.name);
  const register=async()=>{const res=await manager('/api/relay/device','POST',{action:'register'});assert.equal(res.status,200);return (await res.json()).deviceToken;};
  const job=async(op,params)=>manager('/api/relay/jobs','POST',params===undefined?{op}:{op,params});
  return {env,sql,call,manager,device,tables,register,job,tick:ms=>{now+=ms;}};
}
test.after(()=>worker.setRelayClockForTests(null));
test('new inbox views are read-only, authenticated and bounded on the cloud relay',async()=>{
  const h=setup(),code=await h.register();await h.device('/api/relay/device/heartbeat',code);
  const params={view:'history',chat:'a'.repeat(20),limit:5,offset:10,direction:'both',query:'door'};
  assert.equal((await h.call('/api/relay/jobs','POST',{op:'wa-inbox',params})).status,401);
  for(const p of [{view:'send'},{view:'recent',limit:0},{view:'recent',limit:11},{view:'history',offset:101},{view:'history',query:'x'.repeat(121)},{view:'awaiting',url:'https://other.invalid'}])assert.equal((await h.job('wa-inbox',p)).status,400);
  assert.equal((await h.job('wa-inbox',params)).status,202);const {job}=await(await h.device('/api/relay/device/claim',code)).json();assert.deepEqual(job.params,params);assert.equal(h.sql.sqlite.prepare('SELECT COUNT(*) AS n FROM app_state').get().n,0);
});
test('live voice connection requires the signed-in manager and accepts no client key, URL or agent ID',async()=>{
  const h=setup(),code=await h.register();await h.device('/api/relay/device/heartbeat',code);
  assert.equal((await h.call('/api/relay/jobs','POST',{op:'live-session',params:{}})).status,401);
  for(const params of [{agentId:'OTHER'},{apiKey:'SECRET'},{url:'https://evil.invalid'}])assert.equal((await h.job('live-session',params)).status,400);
  assert.equal((await h.job('live-session',{})).status,202);const {job}=await(await h.device('/api/relay/device/claim',code)).json();assert.equal(job.op,'live-session');assert.deepEqual(job.params,{});
  assert.equal(h.sql.sqlite.prepare('SELECT COUNT(*) AS n FROM app_state').get().n,0);
});
test('read acknowledgements require manager authentication and accept only up to ten message keys',async()=>{
  const h=setup(),code=await h.register();await h.device('/api/relay/device/heartbeat',code);
  assert.equal((await h.call('/api/relay/jobs','POST',{op:'wa-read',params:{messages:['a'.repeat(20)]}})).status,401);
  assert.equal((await h.job('wa-read',{messages:['a'.repeat(20)]})).status,202);
  for(const messages of [[],['bad'],Array(11).fill('a'.repeat(20))])assert.equal((await h.job('wa-read',{messages})).status,400);
  assert.equal((await h.job('wa-read',{messages:['a'.repeat(20)],send:true})).status,400);
});
const SEND={chat:'a'.repeat(20),reviewToken:'R'.repeat(24),text:'Hi Bex'};

test('speech relay accepts bounded text only; no client voice ID, key, URL or hidden commands reach the PC',async()=>{
  const app=setup(),code=await app.register();await app.device('/api/relay/device/heartbeat',code);
  for(const params of [{text:''},{text:'x'.repeat(601)},{text:'hello',apiKey:'secret'},{text:'hello',voiceId:'other'},{text:'hello',url:'https://evil.invalid'}])assert.equal((await app.job('speech',params)).status,400);
  assert.equal((await app.job('speech',{text:'At your service.'})).status,202);
  const {job}=await (await app.device('/api/relay/device/claim',code)).json();assert.equal(job.op,'speech');assert.deepEqual(job.params,{text:'At your service.'});
  await app.device('/api/relay/device/complete',code,{jobId:job.jobId,result:{status:200,body:{contentType:'audio/mpeg',audio:'SYNTHETIC_AUDIO'}}});
  const done=await (await app.manager('/api/relay/jobs/'+job.jobId)).json();assert.equal(done.result.body.audio,'SYNTHETIC_AUDIO');assert.equal(app.sql.sqlite.prepare('SELECT COUNT(*) AS n FROM app_state').get().n,0);
});

test('relay auth: device codes never create schema or reach manager routes; the manager cannot act as the PC; foreign origins are refused',async()=>{
  const app=setup();
  assert.equal((await app.device('/api/relay/device/claim','a'.repeat(64))).status,401);
  assert.equal((await app.device('/api/relay/device/heartbeat','not-a-code')).status,401);
  assert.equal((await app.call('/api/relay/device')).status,401);
  assert.deepEqual(app.tables(),[]);
  assert.equal((await app.call('/api/relay/jobs','POST',{op:'health'},{Origin:'https://untrusted.invalid','X-Secret':app.env.SECRET})).status,403);
  const status=await app.manager('/api/relay/device');assert.equal(status.status,200);assert.deepEqual(await status.json(),{registered:false,online:false,lastSeen:''});
  assert.deepEqual(app.tables(),['relay_devices','relay_jobs']);
  const code=await app.register();assert.match(code,/^[a-f0-9]{64}$/);
  const row=app.sql.sqlite.prepare('SELECT token_hash FROM relay_devices').get();assert.notEqual(row.token_hash,code);assert.equal(row.token_hash,await worker.digest(code));
  const asDevice={Authorization:'Bearer '+code};
  assert.equal((await app.call('/','GET',undefined,asDevice)).status,401);
  assert.equal((await app.call('/api/relay/device','GET',undefined,asDevice)).status,401);
  assert.equal((await app.call('/api/relay/jobs','POST',{op:'health'},asDevice)).status,401);
  assert.equal((await app.call('/api/relay/device/claim','POST',{},{'X-Secret':app.env.SECRET})).status,401);
  assert.equal(app.sql.sqlite.prepare('SELECT COUNT(*) AS n FROM app_state').get().n,0);
});

test('one PC at a time: registering again rotates the generation, revoking stops it, and waiting jobs expire with it',async()=>{
  const app=setup(),first=await app.register();
  assert.equal((await app.device('/api/relay/device/heartbeat',first)).status,200);
  assert.equal((await (await app.manager('/api/relay/device')).json()).online,true);
  const queued=(await (await app.job('health')).json()).jobId;
  const second=await app.register();assert.notEqual(second,first);
  assert.equal((await app.device('/api/relay/device/claim',first)).status,401);
  assert.deepEqual(await (await app.device('/api/relay/device/claim',second)).json(),{job:null});
  assert.equal((await (await app.manager('/api/relay/jobs/'+queued)).json()).status,'expired');
  const next=(await (await app.job('health')).json()).jobId;
  assert.equal((await app.manager('/api/relay/device','POST',{action:'revoke'})).status,200);
  assert.equal((await app.device('/api/relay/device/claim',second)).status,401);
  assert.equal((await (await app.manager('/api/relay/jobs/'+next)).json()).status,'expired');
  const offline=await app.job('health');assert.equal(offline.status,503);assert.match((await offline.json()).error,/offline/);
  assert.equal((await (await app.manager('/api/relay/device')).json()).registered,false);
});

test('jobs need an online PC, only allowlisted operations with exact fields, bounded size and a bounded queue',async()=>{
  const app=setup(),code=await app.register();
  assert.equal((await app.job('health')).status,503);
  await app.device('/api/relay/device/heartbeat',code);app.tick(46000);
  assert.equal((await app.job('health')).status,503);
  await app.device('/api/relay/device/heartbeat',code);
  for(const [op,params] of [['wa-model-consent',{enabled:true}],['wa-generate',{chat:'a'.repeat(20)}],['wa-connect',{}],['__proto__',{}],['chat',{text:'x',sessionId:'short',context:{}}],['wa-send',{...SEND,reviewToken:'bad token'}],['wa-send',{...SEND,to:'34999999999@s.whatsapp.net'}],['wa-inbox',{chat:'NOT-HEX'}],['health',{extra:true}]])
    assert.equal((await app.job(op,params)).status,400,op+' '+JSON.stringify(params));
  assert.equal((await app.manager('/api/relay/jobs','POST',{op:'health',params:{},extra:1})).status,400);
  assert.equal((await app.job('chat',{text:'Hello',sessionId:'conversation_1',context:{big:'x'.repeat(200000)}})).status,413);
  for(let i=0;i<20;i++)assert.equal((await app.job('health')).status,202);
  const busy=await app.job('health');assert.equal(busy.status,429);assert.match((await busy.json()).error,/busy/);
});

test('a job is claimed by exactly one request, never requeued, bound to its PC generation, and its result is short-lived and sanitised',async()=>{
  const app=setup(),code=await app.register();await app.device('/api/relay/device/heartbeat',code);
  const accepted=await app.job('wa-send',SEND);assert.equal(accepted.status,202);const {jobId}=await accepted.json();assert.match(jobId,/^[a-f0-9]{64}$/);
  const claims=await Promise.all([app.device('/api/relay/device/claim',code),app.device('/api/relay/device/claim',code)]);
  const jobs=(await Promise.all(claims.map(r=>r.json()))).map(r=>r.job).filter(Boolean);
  assert.equal(jobs.length,1);assert.deepEqual(jobs[0],{jobId,op:'wa-send',params:SEND});
  app.tick(30001);assert.deepEqual(await (await app.device('/api/relay/device/claim',code)).json(),{job:null});
  assert.equal((await (await app.manager('/api/relay/jobs/'+jobId)).json()).status,'processing');
  const result={status:200,body:{status:'sent',message:'Sent.',requestToken:'LOCAL_TOKEN_SENTINEL',connection:{state:'open',qr:'data:image/png;base64,QR_SENTINEL'}}};
  assert.equal((await app.device('/api/relay/device/complete',code,{jobId,result})).status,200);
  assert.equal((await app.device('/api/relay/device/complete',code,{jobId,result})).status,409);
  const done=await (await app.manager('/api/relay/jobs/'+jobId)).json();
  assert.deepEqual(done,{status:'done',result:{status:200,body:{status:'sent',message:'Sent.',connection:{state:'open'}}}});
  assert.equal(app.sql.sqlite.prepare('SELECT payload FROM relay_jobs WHERE id=?').get(jobId).payload,'');
  app.tick(120001);assert.equal((await app.manager('/api/relay/jobs/'+jobId)).status,404);
  assert.equal((await app.manager('/api/relay/jobs/'+'0'.repeat(64))).status,404);
  assert.equal((await app.device('/api/relay/device/complete',code,{jobId,result:{status:200,body:{big:'x'.repeat(300000)}}})).status,413);
});

test('after re-registration an old PC cannot complete, and the new PC cannot complete or claim the old generation’s work',async()=>{
  const app=setup(),old=await app.register();await app.device('/api/relay/device/heartbeat',old);
  const {jobId}=await (await app.job('wa-send',SEND)).json();
  assert.equal((await (await app.device('/api/relay/device/claim',old)).json()).job.jobId,jobId);
  const fresh=await app.register();await app.device('/api/relay/device/heartbeat',fresh);
  assert.equal((await app.device('/api/relay/device/complete',old,{jobId,result:{status:200,body:{status:'sent'}}})).status,401);
  assert.equal((await app.device('/api/relay/device/complete',fresh,{jobId,result:{status:200,body:{status:'sent'}}})).status,409);
  assert.equal((await (await app.manager('/api/relay/jobs/'+jobId)).json()).status,'processing');
  assert.deepEqual(await (await app.device('/api/relay/device/claim',fresh)).json(),{job:null});
  app.tick(300001+120001);assert.equal((await app.manager('/api/relay/jobs/'+jobId)).status,404);
});

test('a revoke or re-registration landing between authentication and claim/complete cannot hand work to, or accept results from, the stale code',async()=>{
  const app=setup(),code=await app.register();await app.device('/api/relay/device/heartbeat',code);
  await app.job('health');
  app.sql.hook=text=>{if(!/SET status='processing'/.test(text))return false;app.sql.sqlite.prepare('UPDATE relay_devices SET revoked=1').run();};
  assert.deepEqual(await (await app.device('/api/relay/device/claim',code)).json(),{job:null});
  assert.equal(app.sql.sqlite.prepare("SELECT COUNT(*) AS n FROM relay_jobs WHERE status='processing'").get().n,0);
  const again=await app.register();await app.device('/api/relay/device/heartbeat',again);
  const {jobId}=await (await app.job('wa-send',SEND)).json();
  assert.equal((await (await app.device('/api/relay/device/claim',again)).json()).job.jobId,jobId);
  app.sql.hook=text=>{if(!/SET status='done'/.test(text))return false;app.sql.sqlite.prepare("UPDATE relay_devices SET token_hash='rotated-elsewhere'").run();};
  assert.equal((await app.device('/api/relay/device/complete',again,{jobId,result:{status:200,body:{status:'sent'}}})).status,409);
  assert.equal(app.sql.sqlite.prepare('SELECT status FROM relay_jobs WHERE id=?').get(jobId).status,'processing');
});

test('a WhatsApp send that is not picked up within 30 seconds expires unsent; other requests wait up to 5 minutes',async()=>{
  const app=setup(),code=await app.register();await app.device('/api/relay/device/heartbeat',code);
  const send=(await (await app.job('wa-send',SEND)).json()).jobId,health=(await (await app.job('health')).json()).jobId;
  app.tick(30001);await app.device('/api/relay/device/heartbeat',code);
  assert.equal((await (await app.manager('/api/relay/jobs/'+send)).json()).status,'expired');
  assert.equal(app.sql.sqlite.prepare('SELECT payload FROM relay_jobs WHERE id=?').get(send).payload,'');
  const claimed=(await (await app.device('/api/relay/device/claim',code)).json()).job;
  assert.equal(claimed.jobId,health);assert.equal(claimed.op,'health');
  assert.deepEqual(await (await app.device('/api/relay/device/claim',code)).json(),{job:null});
});

test('queued work that is never picked up expires (payload removed) and is never handed out late',async()=>{
  const app=setup(),code=await app.register();await app.device('/api/relay/device/heartbeat',code);
  const {jobId}=await (await app.job('chat',{text:'How many cleanings today?',sessionId:'conversation_1',context:{today:'2026-10-18'}})).json();
  app.tick(300001);
  assert.equal((await (await app.manager('/api/relay/jobs/'+jobId)).json()).status,'expired');
  assert.equal(app.sql.sqlite.prepare('SELECT payload FROM relay_jobs WHERE id=?').get(jobId).payload,'');
  assert.deepEqual(await (await app.device('/api/relay/device/claim',code)).json(),{job:null});
});
