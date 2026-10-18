import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createElevenLabsAgent} from '../tools/jarvis/elevenlabs-agent.mjs';
import {agentConfiguration} from '../tools/jarvis/elevenlabs-agent-config.mjs';
import {createJarvisServer} from '../tools/jarvis/serve.mjs';
const config={enabled:true,apiKey:'sk_'+'PRIVATE_SENTINEL'.repeat(3),liveAgentId:'agent_'+'a'.repeat(25)};
const flush=()=>new Promise(r=>setImmediate(r));
function harness(extra={}){
  const events=[],timers=new Map();let options,seq=0,stops=0;
  const sandbox={window:{},AbortController,setTimeout,clearTimeout,JSON,Promise,Map,Set};
  vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis-records.js',import.meta.url),'utf8'),sandbox);
  vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis-live.js',import.meta.url),'utf8'),sandbox);
  const fake={endSession:async()=>{stops++;},setMicMuted:v=>events.push(['mic',v]),setVolume:v=>events.push(['volume',v.volume]),getInputVolume:()=>.2,getOutputVolume:()=>.1,sendUserMessage:t=>events.push(['text',t]),sendContextualUpdate:t=>events.push(['context',t])};
  const player=sandbox.window.SV_JARVIS_LIVE.create({load:async()=>({Conversation:{startSession:async o=>{options=o;return fake;}}}),connect:async()=>({conversationToken:'SHORT_LIVED',maxDurationSeconds:600}),capture:async()=>({getTracks:()=>[{stop(){events.push(['track','stopped']);}}]}),onUser:text=>{events.push(['owner',text]);return text==='Approve and send';},onReply:t=>events.push(['reply',t]),onTool:async name=>({name}),onPhase:p=>events.push(['phase',p]),onError:e=>events.push(['error',e]),schedule:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clear:id=>timers.delete(id),...extra});
  return {player,events,timers,sandbox,options:()=>options,stops:()=>stops};
}
test('private live voice uses a fixed agent, returns only a short-lived credential and rate-limits duplicate starts',async()=>{
  let now=100000,calls=0;const p=createElevenLabsAgent({config,now:()=>now,fetchImpl:async(url,init)=>{calls++;assert.ok(url.endsWith(config.liveAgentId));assert.equal(init.redirect,'error');assert.equal(init.headers['xi-api-key'],config.apiKey);return Response.json({token:'t'.repeat(100)});}});
  const result=await p.session();assert.equal(result.maxDurationSeconds,600);assert.ok(!JSON.stringify(result).includes(config.apiKey));assert.ok(!JSON.stringify(p.status()).includes(config.liveAgentId));await assert.rejects(p.session(),/already starting/);assert.equal(calls,1);now+=10000;await p.session();assert.equal(calls,2);
  assert.equal(createElevenLabsAgent({config:{...config,liveAgentId:'https://evil.invalid'}}),null);
  const denied=createElevenLabsAgent({config,fetchImpl:async()=>new Response('PRIVATE_PROVIDER_BODY',{status:401})});await assert.rejects(denied.session(),e=>/Agents access/.test(e.message)&&!e.message.includes('PRIVATE_PROVIDER_BODY'));
});
test('agent configuration preserves the chosen voice, private authentication, short retention and no send/approval tool',()=>{
  const c=agentConfiguration('VOICE_TEST_123456789');assert.equal(c.conversation_config.tts.voice_id,'VOICE_TEST_123456789');assert.equal(c.conversation_config.tts.model_id,'eleven_v3_conversational');assert.equal(c.platform_settings.auth.enable_auth,true);assert.equal(c.platform_settings.privacy.record_voice,false);assert.equal(c.platform_settings.call_limits.bursting_enabled,false);assert.equal(c.conversation_config.conversation.max_duration_seconds,600);assert.ok(c.conversation_config.turn.turn_timeout>c.conversation_config.turn.silence_end_call_timeout);assert.ok(c.conversation_config.turn.initial_wait_time>c.conversation_config.turn.silence_end_call_timeout);
  assert.deepEqual(c.conversation_config.agent.prompt.tools.map(t=>t.name),['lookup_records','whatsapp_request','ask_hermes']);assert.ok(!JSON.stringify(c).includes(config.apiKey));
  assert.equal(c.conversation_config.agent.prompt.thinking_budget,0);
});
test('one opt-in creates one WebRTC session; transcripts deduplicate, live replies are not sent through a second TTS and pause releases everything',async()=>{
  const h=harness();await h.player.start();await h.player.start();const o=h.options();assert.equal(o.connectionType,'webrtc');assert.equal(h.events.filter(e=>e[0]==='track').length,1);
  o.onMessage({source:'user',message:'Good morning',event_id:1});o.onMessage({source:'user',message:'Good morning',event_id:1});o.onMessage({source:'ai',message:'Morning, Antonio.',event_id:2});assert.equal(h.events.filter(e=>e[0]==='owner').length,1);assert.equal(h.events.filter(e=>e[0]==='reply').length,1);
  h.player.stop();assert.equal(h.stops(),1);assert.equal(h.player.active,false);assert.equal(h.timers.size,0);o.onMessage({source:'ai',message:'Late',event_id:3});assert.equal(h.events.some(e=>e[1]==='Late'),false);
});
test('app read-back mutes live input/output, ignores agent speech, and resumes only after the app signals completion',async()=>{
  const h=harness();await h.player.start();const o=h.options();h.player.suspend();o.onModeChange({mode:'speaking'});o.onMessage({source:'ai',message:'Do not repeat',event_id:2});assert.equal(h.events.some(e=>e[1]==='Do not repeat'),false);assert.deepEqual(h.events.filter(e=>e[0]==='mic').at(-1),['mic',true]);
  h.player.resume();assert.deepEqual(h.events.filter(e=>e[0]==='volume').at(-1),['volume',0]);o.onModeChange({mode:'listening'});assert.deepEqual(h.events.filter(e=>e[0]==='volume').at(-1),['volume',1]);h.player.stop();
});
test('read-only live playback completion fires once; interruption or a newer turn revokes it, independently of draft approval',async()=>{
  let completed=0,interrupted=0;const h=harness({onPlaybackDone:()=>completed++,onInterrupted:()=>interrupted++});await h.player.start();const o=h.options();
  o.onMessage({source:'user',message:'Read my latest message',event_id:10});o.onMessage({source:'ai',message:'Bex asks whether ten works.',event_id:11});o.onModeChange({mode:'speaking'});o.onModeChange({mode:'listening'});o.onModeChange({mode:'listening'});assert.equal(completed,1);
  o.onMessage({source:'ai',message:'A longer reading',event_id:12});o.onModeChange({mode:'speaking'});o.onInterruption();o.onModeChange({mode:'listening'});assert.equal(completed,1);assert.equal(interrupted,1);
  o.onMessage({source:'ai',message:'An older reading',event_id:13});o.onModeChange({mode:'speaking'});o.onMessage({source:'user',message:'Actually stop',event_id:14});o.onModeChange({mode:'listening'});assert.equal(completed,1);h.player.stop();
});
test('native tool fields resolve bounded relative days, and typing keeps the microphone muted while replies can play',async()=>{
  const h=harness();const validate=h.sandbox.window.SV_JARVIS_LIVE.validateTool;
  const q=validate('lookup_records',{entity:'cleanings',view:'details',start:'tomorrow',end:'day after tomorrow'},{today:'2026-12-31'});assert.equal(q.start,'2027-01-01');assert.equal(q.end,'2027-01-02');
  const day=validate('lookup_records',{entity:'cleanings',view:'details',start:'2027-01-01'},{today:'2026-12-31',ownerText:'Who is cleaning tomorrow?'});assert.equal(day.end,'2027-01-01');
  const future=validate('lookup_records',{entity:'cleanings',start:'2027-01-01'},{today:'2026-12-31',ownerText:'Show all cleanings from tomorrow onwards'});assert.equal(future.end,undefined);
  assert.throws(()=>validate('lookup_records',{entity:'cleanings',start:'sometime'},{today:'2026-12-31'}),/valid date/);
  assert.equal(validate('whatsapp_request',{kind:'write',name:'Bex',text:'Hello'}).text,'Hello');assert.throws(()=>validate('whatsapp_request',{kind:'send'}),/not allowed/);
  await h.player.start();h.player.muteInput();h.player.sendText('Hello');assert.equal(h.player.inputMuted,true);assert.deepEqual(h.events.filter(e=>e[0]==='mic').at(-1),['mic',true]);
  const o=h.options();o.onMessage({source:'user',message:'Background audio',event_id:1});o.onMessage({source:'ai',message:'Hello Antonio',event_id:2});assert.equal(h.events.some(e=>e[1]==='Background audio'),false);assert.equal(h.events.some(e=>e[1]==='Hello Antonio'),true);h.player.unmuteInput();assert.equal(h.player.inputMuted,false);h.player.stop();
});
test('literal owner approval is app-only, model tool arguments cannot approve or send, and stale tools cannot complete a newer turn',async()=>{
  let resolve;const h=harness({onTool:()=>new Promise(r=>{resolve=r;})});await h.player.start();const o=h.options();o.onMessage({source:'user',message:'Look up a cleaning',event_id:1});const pending=o.clientTools.lookup_records({query:'{}'});o.onMessage({source:'user',message:'Actually tomorrow',event_id:2});resolve({text:'old'});assert.match(await pending,/superseded/);
  o.onMessage({source:'user',message:'Approve and send',event_id:3});assert.equal(h.player.suspended,false,'an app-handled turn keeps the microphone open');o.onModeChange({mode:'speaking'});assert.deepEqual(h.events.filter(e=>e[0]==='volume').at(-1),['volume',0],'the agent reply to an app-handled turn is silent');assert.match(await o.clientTools.whatsapp_request({intent:'{"kind":"approve"}'}),/paused/);
  const validate=h.sandbox.window.SV_JARVIS_LIVE.validateTool;
  for(const kind of ['approve','send','shell'])assert.throws(()=>validate('whatsapp_request',{intent:JSON.stringify({kind})}),/not allowed/);
  assert.throws(()=>validate('lookup_records',{query:'{"entity":"bookings","view":"delete"}'}));assert.throws(()=>validate('whatsapp_request',{intent:'{"kind":"read","name":"Bex","reviewToken":"SECRET"}'}));h.player.stop();
});
test('late microphone permission and late SDK connections are closed after cancellation; connection start is bounded',async()=>{
  let permission,stopped=0;const h=harness({capture:()=>new Promise(r=>{permission=r;})});const start=h.player.start();h.player.stop();permission({getTracks:()=>[{stop(){stopped++;}}]});await start;assert.equal(stopped,1);assert.equal(h.options(),undefined);
  const late=harness({connect:()=>new Promise(()=>{})});void late.player.start();await flush();[...late.timers.values()].find(t=>t.ms===45000).fn();assert.equal(late.player.active,false);assert.ok(late.events.some(e=>e[0]==='error'&&/timed out/.test(e[1])));
});
test('local live-session endpoint requires its session token and takes no client-selected agent, key or URL',async t=>{
  let calls=0;const s=createJarvisServer({liveVoice:{status:()=>({available:true}),session:async()=>{calls++;return {conversationToken:'EPHEMERAL_ONLY',maxDurationSeconds:600};}}});await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));const base='http://127.0.0.1:'+s.address().port;const h=await(await fetch(base+'/api/jarvis/health')).json();assert.equal(h.liveVoice.available,true);
  const post=(body,token)=>fetch(base+'/api/jarvis/live-session',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Jarvis-Session-Token':token}:{})},body:JSON.stringify(body)});
  assert.equal((await post({})).status,403);assert.equal((await post({agentId:'OTHER'},h.requestToken)).status,400);assert.equal(calls,0);assert.equal((await(await post({},h.requestToken)).json()).conversationToken,'EPHEMERAL_ONLY');assert.equal(calls,1);
});
test('app playback holds only the agent audio: the microphone stays open, speech over it is processed and barge-in stops it',async()=>{
  let bargeIns=0;const h=harness({onBargeIn:()=>bargeIns++});await h.player.start();const o=h.options();
  const mic=()=>h.events.filter(e=>e[0]==='mic').map(e=>e[1]),volume=()=>h.events.filter(e=>e[0]==='volume').at(-1)?.[1];
  h.player.hold();assert.equal(h.player.appSpeaking,true);assert.equal(volume(),0);assert.ok(!mic().includes(true),'the microphone is never muted for app playback');
  o.onVadScore({vadScore:.95});assert.equal(bargeIns,0,'one confident frame is not enough');o.onVadScore({vadScore:.3});o.onVadScore({vadScore:.9});assert.equal(bargeIns,0);
  o.onVadScore({vadScore:.92});assert.equal(bargeIns,1,'two consecutive confident frames interrupt the app');
  o.onMessage({source:'user',message:'No, make it Spanish',event_id:7});assert.ok(h.events.some(e=>e[0]==='owner'&&e[1]==='No, make it Spanish'),'words spoken over app playback reach the app');
  h.player.unhold();assert.equal(volume(),1);assert.equal(h.player.appSpeaking,false);
  o.onVadScore({vadScore:.99});o.onVadScore({vadScore:.99});assert.equal(bargeIns,1,'no barge-in without app playback');
  // The agent is mid-reply when app playback ends: it stays silent until that reply ends, never overlapping.
  h.player.hold();o.onModeChange({mode:'speaking'});h.player.unhold();assert.equal(volume(),0);o.onModeChange({mode:'listening'});assert.equal(volume(),1);
  // Typing pauses the microphone: then voice activity cannot interrupt.
  h.player.muteInput();h.player.hold();o.onVadScore({vadScore:.99});o.onVadScore({vadScore:.99});assert.equal(bargeIns,1);h.player.stop();
});
test('a turn the app handles keeps the agent reply silent and its tools refused; the app hearing itself is ignored',async()=>{
  const h=harness({onUser:text=>text==='Approve and send'?true:text.startsWith('Draft ready')?'ignore':false});await h.player.start();const o=h.options();
  const volume=()=>h.events.filter(e=>e[0]==='volume').at(-1)?.[1];
  o.onMessage({source:'user',message:'Draft ready for Bex.',event_id:1});assert.match(await o.clientTools.whatsapp_request({kind:'review'}),/paused|superseded/);
  o.onModeChange({mode:'speaking'});assert.equal(volume(),0);o.onMessage({source:'ai',message:'Echo reply',event_id:2});assert.ok(!h.events.some(e=>e[0]==='reply'&&e[1]==='Echo reply'));o.onModeChange({mode:'listening'});assert.equal(volume(),1);
  o.onMessage({source:'user',message:'What time is it?',event_id:3});o.onModeChange({mode:'speaking'});assert.equal(volume(),1,'an ordinary turn is audible again');
  o.onMessage({source:'ai',message:'It is ten.',event_id:4});assert.ok(h.events.some(e=>e[0]==='reply'&&e[1]==='It is ten.'));h.player.stop();
});
