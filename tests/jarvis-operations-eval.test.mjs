/* The understanding harness itself, with MOCKED Hermes decisions and a SIMULATED live-agent socket (no provider call).
   Intended routing: the live agent looks records up directly and delegates cleaning requests to Hermes via ask_hermes;
   Hermes receives Antonio's own words. The harness must pass the reference decisions and catch wrong behaviour. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,decisionDriver,liveDriver} from '../tools/jarvis/eval-operations.mjs';
import {CASES} from '../tools/jarvis/eval-operations-cases.mjs';

const steps=new Map(CASES.flatMap(c=>c.turns).map(s=>[s.say,s]));
function mockHermes(seen=[]){return async({text,context,step})=>{seen.push({text,note:context.dialogue.agentNote,recent:context.dialogue.recent});return JSON.stringify(step.mock||{kind:'reply',text:'ok'});};}
/* A fake agent conversation: lookups use its direct tool; everything else is delegated with a SHORTENED paraphrase. */
function fakeAgent({override}={}){
  const sent=[];
  return {sent,openSocket(){
    const listeners={};const emit=(type,data)=>(listeners[type]||[]).forEach(f=>f(data===undefined?{}:{data:JSON.stringify(data)}));
    const ws={addEventListener:(t,f)=>(listeners[t]=listeners[t]||[]).push(f),close(){},send(raw){const m=JSON.parse(raw);sent.push(m);
      if(m.type==='conversation_initiation_client_data')setTimeout(()=>emit('message',{type:'conversation_initiation_metadata'}));
      if(m.type==='user_message'){const o=override&&override(m.text),d=o||steps.get(m.text)?.mock||{kind:'reply'};
        setTimeout(()=>{
          if(d.kind==='records')emit('message',{type:'client_tool_call',client_tool_call:{tool_name:'lookup_records',tool_call_id:'t1',parameters:d.query}});
          else if(d.kind==='say')emit('message',{type:'agent_response',agent_response_event:{agent_response:d.text}});
          else emit('message',{type:'client_tool_call',client_tool_call:{tool_name:'ask_hermes',tool_call_id:'t2',parameters:{request:m.text.split(' ').slice(0,3).join(' ')}}});});}
      if(m.type==='client_tool_result')setTimeout(()=>emit('message',{type:'agent_response',agent_response_event:{agent_response:(override&&override('#after'))?.text||''}}));}};
    setTimeout(()=>emit('open'));return ws;}};
}
const live=(agent,model=mockHermes())=>liveDriver({signedUrl:async()=>'wss://fake',model,openSocket:agent.openSocket,quietMs:20});

test('typed/delegated route: reference Hermes decisions pass every dialogue through the app path',async()=>{
  const report=await evaluate(decisionDriver(mockHermes()));
  assert.deepEqual(report.filter(c=>!c.ok).map(c=>c.id),[]);
  assert.ok(CASES.length>=15&&CASES.reduce((n,c)=>n+c.turns.length,0)>=35);
});
test('live route: direct lookups, cleaning requests delegated to Hermes with Antonio’s exact words, confirmations local',async()=>{
  const agent=fakeAgent(),seen=[];const report=await evaluate(live(agent,mockHermes(seen)));
  assert.deepEqual(report.filter(c=>!c.ok).map(c=>c.id),[]);
  const revise=seen.find(s=>s.text==='at ten... sorry, eleven');
  assert.ok(revise,'Hermes received the recognised words verbatim');assert.equal(revise.note,'at ten... sorry,');
  assert.ok(revise.recent.some(l=>l.role==='owner'&&l.text==='not Marjals, only Mar'),'recent conversation travels with the request');
  const init=agent.sent.find(m=>m.type==='conversation_initiation_client_data');
  assert.equal(init.conversation_config_override.conversation.text_only,true);assert.match(init.dynamic_variables.app_context,/"today":"2026-10-18"/);
  assert.ok(!agent.sent.some(m=>m.type==='user_message'&&/go ahead and create those cleanings|yes schedule those three|cancel that/.test(m.text)),'owner confirmations never reach the agent');
  assert.ok(agent.sent.some(m=>m.type==='contextual_update'));
});
test('grading catches eager planning, undelegated cleaning, lookups through Hermes, false save claims and wrong scope',async()=>{
  const eager={kind:'operation',operation:{action:'plan_checkout_cleanings',scope:'dates',period:'next_week'}};
  const risky=CASES.filter(c=>['hypothetical','negation','quoted','lost-property'].includes(c.id));
  assert.deepEqual((await evaluate(decisionDriver(async()=>JSON.stringify(eager)),risky)).map(c=>c.ok),[false,false,false,false]);
  const owner=CASES.filter(c=>c.id==='owner-example');
  const undelegated=await evaluate(live(fakeAgent({override:t=>t==='ok put cleaning on the leaving days'?{kind:'say',text:'Sure, I will sort that.'}:null})),owner);
  assert.match(undelegated[0].turns[1].fails.join(),/expected a plan/);
  const viaHermes=await evaluate(live(fakeAgent({override:t=>t.startsWith('Next week')?{kind:'delegate'}:null}),async({step})=>JSON.stringify(step.mock)),owner);
  assert.match(viaHermes[0].turns[0].fails.join(),/through Hermes/);
  const boast=await evaluate(live(fakeAgent({override:t=>t==='#after'?{text:'All done, I have scheduled those cleanings.'}:null})),owner);
  assert.match(boast[0].turns[1].fails.join(),/claimed a save/);
  const wrong=async({step})=>JSON.stringify(step.say==='not Marjals, only Mar'?{kind:'operation',operation:{action:'revise',onlyProperties:['Marjals']}}:step.mock);
  assert.match((await evaluate(live(fakeAgent(),wrong),owner))[0].turns[2].fails.join(),/plan creates/);
  const arrivals=await evaluate(live(fakeAgent({override:t=>t.startsWith('show me who')?{kind:'records',query:{entity:'bookings',view:'list',period:'next_week'}}:null})),CASES.filter(c=>c.id==='arrivals'));
  assert.match(arrivals[0].turns[0].fails.join(),/dateBy stay/);
  const confirmer=decisionDriver(async({step})=>JSON.stringify(step.say==='yeah looks good'?{kind:'operation',operation:{action:'confirm'}}:step.mock));
  assert.equal((await evaluate(confirmer,CASES.filter(c=>c.id==='vague-yes')))[0].ok,true,'a model confirm on a vague yes saves nothing');
});
