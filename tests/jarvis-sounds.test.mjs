import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createElevenLabsVoice} from '../tools/jarvis/elevenlabs-voice.mjs';
import {createElevenLabsAgent} from '../tools/jarvis/elevenlabs-agent.mjs';
function harness(){
  const nodes=[],ramps=[];const parameter=()=>({setValueAtTime(v,t){ramps.push({v,t});},linearRampToValueAtTime(v,t){ramps.push({v,t});},exponentialRampToValueAtTime(v,t){ramps.push({v,t});}});
  const make=osc=>{const n={gain:parameter(),frequency:parameter(),connect(){},disconnect(){n.disconnected=true;},start(t){n.startTime=t;},stop(t){n.stopTime=t;}};nodes.push(n);return n;};
  const context={state:'suspended',currentTime:1,destination:{},createGain:()=>make(false),createOscillator:()=>make(true)},sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis-sounds.js',import.meta.url),'utf8'),sandbox);
  return {context,nodes,ramps,player:sandbox.window.SV_JARVIS_SOUNDS.create(context)};
}
test('interface cues require an unlocked audio context, remain brief and quiet, and never accumulate on fast state changes',()=>{
  const h=harness();assert.equal(h.player.play('startup'),false);assert.equal(h.nodes.length,0);
  h.context.state='running';assert.equal(h.player.play('startup'),true);const startup=h.nodes.slice();
  assert.equal(h.player.play('response'),false);assert.equal(h.nodes.length,startup.length);
  assert.ok(h.ramps.every(x=>x.t<=1.32));assert.ok(startup.filter(n=>n.stopTime).every(n=>n.stopTime<=1.34));
  assert.ok(h.ramps.some(x=>x.v===0.018));h.context.currentTime=1.4;assert.equal(h.player.play('response'),true);assert.ok(startup.every(n=>n.disconnected));
  assert.ok(h.ramps.some(x=>x.v===0.008));h.player.dispose();assert.ok(h.nodes.every(n=>n.disconnected));
});
test('the selected Ultron identity is supplied by private configuration, uses the fixed voice and preserves usage limits',async()=>{
  const config={enabled:true,apiKey:'sk_'+'FICTIONAL_KEY'.repeat(4),voiceId:'FICTIONAL_VOICE_2222',liveAgentId:'agent_'+'x'.repeat(25),voiceName:'Ultron · SeraVillas',soundTheme:'ultron',monthlyCharacters:12};let used=null,payload,url;
  const voice=createElevenLabsVoice({config,store:{load:()=>used,save:v=>{used=v;}},fetchImpl:async(endpoint,init)=>{url=endpoint;payload=JSON.parse(init.body);return new Response(Buffer.alloc(30,1),{headers:{'Content-Type':'audio/mpeg'}});}});
  const audio=await voice.generate('Ready.');assert.match(url,/FICTIONAL_VOICE_2222/);assert.equal(audio.name,config.voiceName);assert.equal(payload.text,'Ready.');assert.equal(payload.model_id,'eleven_flash_v2_5');assert.ok(payload.voice_settings.speed>1&&payload.voice_settings.speed<=1.1);
  await assert.rejects(voice.generate('Over the limit.'),/monthly voice test limit/);assert.equal(voice.status().soundTheme,'ultron');
  const agent=createElevenLabsAgent({config,fetchImpl:async()=>assert.fail('status must not start a session')});assert.equal(agent.status().name,config.voiceName);assert.equal(agent.status().soundTheme,'ultron');assert.equal(agent.status().maxDurationSeconds,600);assert.ok(!JSON.stringify(agent.status()).includes(config.liveAgentId));
});

test('the owner-approved 20,000-character allowance resumes confirmations without resetting usage or removing the cap',async()=>{
  const config={enabled:true,apiKey:'sk_'+'FICTIONAL_KEY'.repeat(4),voiceId:'FICTIONAL_VOICE_2222',monthlyCharacters:20000};let used={month:'2026-10',characters:9992},calls=0;
  const voice=createElevenLabsVoice({config,store:{load:()=>used,save:v=>{used=v;}},now:()=>new Date('2026-10-18T12:00:00Z'),fetchImpl:async()=>{calls++;return new Response(Buffer.alloc(30,1),{headers:{'Content-Type':'audio/mpeg'}});}});
  await voice.generate('Your preference is saved.');assert.equal(used.characters,9992+25);assert.equal(calls,1);assert.equal(voice.status().monthlyCharacters,20000);
  used={month:'2026-10',characters:19995};await assert.rejects(voice.generate('This exceeds the cap.'),/monthly voice test limit/);assert.equal(calls,1);
});
