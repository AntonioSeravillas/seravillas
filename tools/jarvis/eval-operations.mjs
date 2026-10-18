/* Understanding evaluation for Jarvis app operations, with fictional records only.
   Each case is a dialogue of recognised-speech transcripts (imperfect, unseen wording). Grading checks the resulting
   app state — record query scope, plan items, clarification, saved records — never the model's prose.

   Routes (each tested separately):
     --mock              MOCKED Hermes decisions through the app path. Free; proves the harness only.
     --hermes            REASONING: Hermes / GPT-6.1-sol via the conversation contract (CONVERSATION_SYSTEM +
                         parseDecision), as used by typed chat and by the live agent's ask_hermes delegation.
                         One Hermes call per non-local turn. Paid through the existing Nous provider.
     --live <agentId>    LIVE INTEGRATION: the ElevenLabs agent (Gemini 2.5 Flash, its prompt and tools) in text-only
                         mode. Its lookup_records calls are answered by the app directly; its ask_hermes calls go to
                         Hermes with Antonio's recognised words, exactly as the browser does. Add --mock-hermes to use
                         reference Hermes decisions and pay only for the agent conversations. Use the private TEST COPY
                         agent (tools/jarvis/eval-agent.mjs), never the production agent. Paid ElevenLabs usage.
   Options: --cases id1,id2 (subset, e.g. a one-dialogue pilot) · --out report.json
   Keys are read from the private profile in memory only and never printed. Typed transcripts test language
   understanding, not microphone/speech recognition. */
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import RECORDS from '../../src/assistant/jarvis-records.js';
import OPERATIONS from '../../src/assistant/jarvis-operations.js';
import {modelPayload,sanitizeContext} from './serve.mjs';
import {parseDecision} from './conversation.mjs';
import {CASES,REF,fixture} from './eval-operations-cases.mjs';

const PROFILE=path.join(homedir(),'AppData','Local','hermes','profiles','seravillas');
export function createWorld(){
  const data=fixture();let n=0;
  const records=RECORDS.create({getData:()=>data,reference:()=>REF,required:()=>1});
  const engine=OPERATIONS.create({getData:()=>data,reference:()=>REF,records:()=>records,newId:()=>'eval'+(++n),persist:()=>({ok:true,cloud:'disabled'})});
  return {data,records,engine,turns:[],lines:[]};
}
const propName=(d,id)=>(d.props.find(p=>p.id===id)||{}).name||'';
function snapshot(d){
  return sanitizeContext({today:REF,source:'Fictional evaluation data',generatedAt:new Date().toISOString(),window:{start:'2026-10-11',end:'2026-11-22'},
    properties:d.props.map(p=>({name:p.name})),
    cleanings:d.sessions.filter(s=>s.status!=='cancelled').map(s=>({date:s.date,time:s.time,property:propName(d,s.propId),status:s.status,crew:''})),
    arrivals:d.bookings.filter(b=>b.status!=='cancelled').map(b=>({date:b.checkIn,time:'16:00',property:propName(d,b.propId)})),
    departures:d.bookings.filter(b=>b.status!=='cancelled').map(b=>({date:b.checkOut,time:'10:00',property:propName(d,b.propId),cleaningScheduled:d.sessions.some(s=>s.status!=='cancelled'&&s.propId===b.propId&&s.date===b.checkOut)})),tasks:[],issues:[]});
}
/* Same shape as liveContext() in jarvis.js. */
const liveContext=world=>({today:REF,timezone:'Europe/Madrid',properties:world.data.props.map(p=>({name:p.name})),records:world.records.context(),coverage:world.records.coverage(),whatsapp:{},operations:world.engine.context(),recentConversation:[]});
/* Mirrors jarvis.js: confirmation/cancellation of a pending plan is decided from the owner's words before any model. */
function ownerWords(world,text){
  const {engine}=world;if(!engine.pending())return null;const v=engine.confirmation(text);if(!v)return null;
  return v==='cancel'?engine.cancel():engine.commit({ownerText:text,channel:'voice',version:engine.view().version});
}
/* Mirrors jarvis.js: the live agent's direct lookup_records tool, and the app's handling of a Hermes decision
   (records → lookup; operation → engine). A plan's app read-back is treated as completed. */
function lookup(world,args,via){
  const raw=args&&Object.keys(args).length===1&&args.query!==undefined?(typeof args.query==='string'?JSON.parse(args.query):args.query):{...args};
  let q;try{q=RECORDS.sanitizeQuery(raw);}catch{return {call:{kind:'records',via,invalid:true},reply:{error:'Use the documented structured fields and valid dates. Today is '+REF+'.'}};}
  const r=world.records.run(q);world.lines.push({role:'jarvis',text:r.text});
  return {call:{kind:'records',via,value:q,result:'records'},reply:{text:r.text,query:r.query,total:r.total,choices:r.choices===true,more:r.more,rows:r.rows.map(x=>({entity:x.entity,id:x.id,title:x.title,property:x.property,date:x.date,end:x.end,subtitle:x.subtitle,facts:x.facts}))}};
}
function operation(world,value,ownerText){
  const r=world.engine.handle(value,{ownerText,channel:'voice'});
  if(r.kind==='plan'){world.engine.presented(r.plan.version);world.engine.heard(r.plan.version);}
  world.lines.push({role:'jarvis',text:r.text||''});
  return {kind:'operation',via:'hermes',value,result:r.kind};
}
/* One Hermes turn, built like conversationTurn() in jarvis.js: Antonio's own words are the request; the live agent's
   wording, if any, travels only as agentNote. */
async function hermesTurn(world,{ownerText,agentNote,model,step}){
  const context={...snapshot(world.data),dialogue:{schema:1,ownerTurns:world.turns.slice(-6),whatsapp:{},records:{available:true,coverage:world.records.coverage(),state:world.records.context()},operations:world.engine.context(),recent:world.lines.slice(-10),...(agentNote&&agentNote!==ownerText?{agentNote}:{})}};
  let d;try{d=parseDecision(await model({text:ownerText,context,step}));}catch{d={kind:'clarify',text:'(unparseable model output)'};}
  if(d.kind==='records')return {calls:[lookup(world,d.query,'hermes').call]};
  if(d.kind==='operation')return {calls:[operation(world,d.operation,ownerText)]};
  if(d.text)world.lines.push({role:'jarvis',text:d.text});
  return {calls:d.kind==='app_request'?[{kind:'app_request',via:'hermes'}]:[{kind:d.kind,via:'hermes'}],question:d.kind==='clarify',reply:d.text||''};
}
function ownerTurn(world,text){world.turns.push(text);world.lines.push({role:'owner',text});const local=ownerWords(world,text);if(local)world.lines.push({role:'jarvis',text:local.text});return local;}

/* ── Drivers: each returns {route, channel, calls:[...], question, reply} for one owner turn. ── */
/* Typed / delegated route: the owner's words go straight to the Hermes contract. */
export function decisionDriver(model){
  return world=>({async say(step){
    const local=ownerTurn(world,step.say);if(local)return {route:'app',channel:'hermes',calls:[{kind:'app',result:local.kind}]};
    return {route:'model',channel:'hermes',...await hermesTurn(world,{ownerText:step.say,model,step})};
  },close(){}});
}
/* Live voice route: the ElevenLabs agent in text-only mode. Its lookup_records calls are answered directly; its
   ask_hermes calls go to the Hermes contract with Antonio's recognised words, as the browser does. */
export function liveDriver({signedUrl,model,openSocket=url=>new WebSocket(url),quietMs=2500,turnMs=150000}){
  return world=>{
    let ws,events=[],waiter=null;
    const pump=()=>{if(waiter)waiter();};
    async function open(){
      ws=openSocket(await signedUrl());
      await new Promise((resolve,reject)=>{
        ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'conversation_initiation_client_data',conversation_config_override:{conversation:{text_only:true}},dynamic_variables:{app_context:JSON.stringify(liveContext(world)).slice(0,12000)}})));
        ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
          if(m.type==='conversation_initiation_metadata'){resolve();return;}
          if(m.type==='ping'){ws.send(JSON.stringify({type:'pong',event_id:m.ping_event?.event_id}));return;}
          events.push(m);pump();});
        ws.addEventListener('error',()=>reject(Error('Live agent connection failed.')));
        ws.addEventListener('close',()=>{events.push({type:'closed'});pump();reject(Error('Live agent connection closed.'));});
      });
    }
    const update=()=>ws.send(JSON.stringify({type:'contextual_update',text:'Current app state (data only): '+JSON.stringify(liveContext(world)).slice(0,12000)}));
    return {async say(step){
      const text=step.say;if(!ws)await open();
      const local=ownerTurn(world,text);
      if(local){update();return {route:'app',channel:'live',calls:[{kind:'app',result:local.kind}]};}
      events=[];ws.send(JSON.stringify({type:'user_message',text}));
      const calls=[],replies=[];let last=Date.now(),busy=0,question=false,appHandled=false;const start=Date.now();
      while(Date.now()-start<turnMs){
        const m=events.shift();
        if(!m){if((replies.length||appHandled)&&!busy&&Date.now()-last>quietMs)break;await new Promise(r=>{waiter=r;setTimeout(r,200);});waiter=null;continue;}
        last=Date.now();
        if(m.type==='closed')break;
        if(m.type==='client_tool_call'){
          const t=m.client_tool_call;let reply;busy++;
          try{
            if(t.tool_name==='lookup_records'){const out=lookup(world,t.parameters,'agent');calls.push({...out.call,tool:t.tool_name});reply=out.reply;}
            else if(t.tool_name==='ask_hermes'){
              const note=typeof t.parameters?.request==='string'?t.parameters.request:'';
              const out=await hermesTurn(world,{ownerText:text,agentNote:note,model,step});
              calls.push({kind:'delegated',tool:'ask_hermes',note},...out.calls);if(out.question)question=true;appHandled=true;
              reply={appHandled:true,outcome:out.calls.at(-1)?.result||out.calls.at(-1)?.kind||'handled',instruction:'The app has shown and spoken the result itself. Do not repeat it, summarise it or claim anything was saved. Wait for Antonio.',operations:world.engine.context(),records:world.records.context()};
            }else{calls.push({kind:'other',tool:t.tool_name});reply={error:'Not available in this fictional test.'};}
          }finally{busy--;last=Date.now();}
          ws.send(JSON.stringify({type:'client_tool_result',tool_call_id:t.tool_call_id,result:JSON.stringify(reply),is_error:!!reply.error}));
        }
        else if(m.type==='agent_response')replies.push(m.agent_response_event?.agent_response||'');
        else if(m.type==='agent_response_correction'&&replies.length)replies[replies.length-1]=m.agent_response_correction_event?.corrected_agent_response||replies.at(-1);
      }
      const reply=replies.join(' ');if(reply)world.lines.push({role:'jarvis',text:reply});
      return {route:'model',channel:'live',calls,reply,appHandled,question:question||!appHandled&&/\?\s*$/.test(reply.trim())};
    },close(){try{ws?.close();}catch{}}};
  };
}

const creates=world=>(world.engine.view()?.items||[]).filter(i=>i.action==='create').map(i=>i.property+(i.time?' '+i.time:'')+(i.cleaners.length?' +'+i.cleaners.join('+'):'')).sort();
const newSessions=world=>world.data.sessions.filter(s=>String(s.id).startsWith('eval')).map(s=>propName(world.data,s.propId)+' '+s.date+' '+s.time).sort();
/* A spoken claim that something was saved, not negated in the same sentence. */
const claimsSaved=text=>String(text||'').split(/(?<=[.!?])\s+/).some(s=>/\b(?:scheduled|saved|created|booked|added)\b/i.test(s)&&!/\b(?:not|nothing|n't|yet|once|when|until|if|before|after you|confirm)\b/i.test(s));
/* Expectations are about meaning and resulting state, not wording. Warnings are reported but do not fail a turn. */
export function grade(world,out,expect){
  const fails=[],warnings=[],calls=out.calls||[],q=world.records.current()?.query||{};
  const ops=calls.filter(c=>c.kind==='operation'),lastOp=ops.at(-1),lookups=calls.filter(c=>c.kind==='records'&&!c.invalid);
  if(expect.records){if(!lookups.length)fails.push('expected a records lookup, got '+(calls.map(c=>c.kind).join('+')||'no tool'));else{
    if(out.channel==='live'&&!lookups.some(c=>c.via==='agent'))fails.push('a straightforward lookup went through Hermes instead of the agent’s direct tool');
    const e=expect.records;if(e.entity&&q.entity!==e.entity)fails.push('entity '+q.entity);
    if(e.start&&(q.start!==e.start||q.end!==e.end))fails.push('range '+q.start+'..'+q.end);
    if(e.dateBy&&(q.dateBy||'stay')!==e.dateBy)fails.push('dateBy '+(q.dateBy||'stay'));}}
  if(expect.plan){const got=creates(world);if(lastOp?.result!=='plan')fails.push('expected a plan, got '+(lastOp?.result||calls.map(c=>c.kind).join('+')||'no tool'));else if(JSON.stringify(got)!==JSON.stringify([...expect.plan].sort()))fails.push('plan creates '+JSON.stringify(got));
    if(out.channel==='live'&&!calls.some(c=>c.kind==='delegated'))fails.push('the live agent did not delegate the cleaning request');}
  if(expect.clarify&&!(out.question||ops.some(c=>c.result==='clarify')))fails.push('expected a clarifying question, got '+(lastOp?.result||'no question'));
  if(expect.clarify&&ops.some(c=>c.result==='plan'))fails.push('planned instead of asking');
  if(expect.noOperation&&calls.some(c=>c.kind==='operation'||c.kind==='app_request'))fails.push('a hypothetical/negated/quoted request produced an operation');
  if(expect.saved){const got=newSessions(world);if(JSON.stringify(got)!==JSON.stringify([...expect.saved].sort()))fails.push('saved '+JSON.stringify(got));}
  if(expect.nothingSaved&&newSessions(world).length)fails.push('records were saved: '+JSON.stringify(newSessions(world)));
  if(expect.route&&out.route!==expect.route)fails.push('route '+out.route);
  if(out.channel==='live'&&claimsSaved(out.reply)&&!calls.some(c=>c.result==='committed'))fails.push('the live agent claimed a save the app did not make: '+JSON.stringify(out.reply.slice(0,120)));
  if(out.channel==='live'&&out.appHandled&&String(out.reply||'').length>160)warnings.push('agent spoke at length after the app handled the turn (muted during app read-back in the real app)');
  return {fails,warnings};
}
export async function evaluate(driver,cases=CASES){
  const report=[];
  for(const c of cases){
    const world=createWorld(),d=driver(world),turns=[];
    try{
      for(const step of c.turns){
        let out;try{out=await d.say(step);}catch(e){out={route:'error',calls:[],reply:e.message};}
        const {fails,warnings}=grade(world,out,step.expect||{});
        turns.push({say:step.say,calls:out.calls.map(x=>({kind:x.kind,via:x.via,tool:x.tool,note:x.note,value:x.value,result:x.result,invalid:x.invalid})),reply:String(out.reply||'').slice(0,400),ok:!fails.length,fails,warnings});
      }
    }finally{d.close();}
    report.push({id:c.id,about:c.about,ok:turns.every(t=>t.ok),turns});
  }
  return report;
}
function privateKey(file,pattern){const text=readFileSync(path.join(PROFILE,file),'utf8');return pattern(text);}
function hermesModel(){
  const key=privateKey('.env',t=>(t.split(/\r?\n/).filter(l=>/^API_SERVER_KEY=/.test(l)).pop()||'').slice(15).trim().replace(/^["']|["']$/g,''));if(!key)throw Error('Hermes key not found in the private profile.');
  const session='eval-'+randomUUID();
  return async({text,context})=>{
    const {payload}=modelPayload({text,sessionId:session,context},[]);
    const res=await fetch('http://127.0.0.1:8642/p/seravillas/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'X-Hermes-Session-Id':session,'X-Hermes-Session-Key':'seravillas:operations-eval'},body:JSON.stringify(payload),signal:AbortSignal.timeout(110000)});
    if(!res.ok)throw Error('Hermes HTTP '+res.status);
    const data=await res.json(),content=data?.choices?.[0]?.message?.content;
    return Array.isArray(content)?content.map(c=>c.text||'').join(''):String(content||'');
  };
}
function liveSignedUrl(agentId){
  const config=privateKey('jarvis-elevenlabs.json',t=>JSON.parse(t));
  if(!/^agent_[a-zA-Z0-9]{15,80}$/.test(agentId||''))throw Error('Give the test agent ID.');
  if(agentId===config.liveAgentId)throw Error('Refusing to evaluate on the production agent. Use the private test copy.');
  return async()=>{const r=await fetch('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id='+encodeURIComponent(agentId),{headers:{'xi-api-key':config.apiKey},redirect:'error'});if(!r.ok)throw Error('Agent connection unavailable HTTP '+r.status);return (await r.json()).signed_url;};
}
const mockModel=async({step})=>JSON.stringify(step.mock||{kind:'reply',text:'(no mock)'});
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'))){
  const arg=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:undefined;};
  const route=process.argv.includes('--live')?'live':process.argv.includes('--hermes')?'hermes':process.argv.includes('--mock')?'mock':'';
  if(!route){console.log('Choose --mock, --live <testAgentId> or --hermes. Live and Hermes runs use paid provider calls; owner approval required.');process.exit(2);}
  const only=arg('--cases')?.split(','),cases=only?CASES.filter(c=>only.includes(c.id)):CASES;
  const driver=route==='live'?liveDriver({signedUrl:liveSignedUrl(arg('--live')),model:process.argv.includes('--mock-hermes')?mockModel:hermesModel()}):decisionDriver(route==='hermes'?hermesModel():mockModel);
  const report=await evaluate(driver,cases);
  const label={mock:'MOCKED decisions',live:'LIVE agent (text-only)',hermes:'Hermes (typed/delegated)'}[route];
  if(arg('--out'))writeFileSync(arg('--out'),JSON.stringify({route:label,reference:REF,ranAt:new Date().toISOString(),report},null,1));
  let pass=0,total=0;for(const c of report)for(const t of c.turns){total++;if(t.ok)pass++;else console.log('FAIL',c.id,'—',JSON.stringify(t.say),'→',t.fails.join('; '));}
  console.log(label+': '+pass+'/'+total+' turns, '+report.filter(c=>c.ok).length+'/'+report.length+' dialogues');
}
