import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createElevenLabsVoice} from '../tools/jarvis/elevenlabs-voice.mjs';
import {createElevenLabsAgent} from '../tools/jarvis/elevenlabs-agent.mjs';
function harness(){
  const nodes=[],ramps=[],timers=new Map();let clock=0,id=0;
  const parameter=()=>({setValueAtTime(v,t){ramps.push({v,t});},linearRampToValueAtTime(v,t){ramps.push({v,t});},exponentialRampToValueAtTime(v,t){ramps.push({v,t});}});
  const make=osc=>{const n={osc,gain:parameter(),frequency:parameter(),connect(){},disconnect(){n.disconnected=true;},start(t){n.startTime=t;},stop(t){n.stopTime=t;n.stopped=true;}};nodes.push(n);return n;};
  const context={state:'suspended',currentTime:0,destination:{},createGain:()=>make(false),createOscillator:()=>make(true)},sandbox={window:{},setTimeout,clearTimeout};
  vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis-sounds.js',import.meta.url),'utf8'),sandbox);
  const player=sandbox.window.SV_JARVIS_SOUNDS.create(context,{schedule(fn,ms){timers.set(++id,{fn,at:clock+ms});return id;},clear:id=>timers.delete(id)});
  function advance(ms){const target=clock+ms;while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>target)break;clock=entry[1].at;context.currentTime=clock/1000;timers.delete(entry[0]);entry[1].fn();}clock=target;context.currentTime=clock/1000;}
  return {context,nodes,ramps,timers,player,advance};
}

test('distinct, brief electronic cues require unlocked audio, have bounded volume, and release their nodes',()=>{
  const h=harness();assert.equal(h.player.play('startup'),false);assert.equal(h.nodes.length,0);h.context.state='running';
  const signatures=[];
  for(const kind of ['startup','listening','thinking','checking','response','shutdown','message']){
    h.advance(1000);const before=h.nodes.length,ramp=h.ramps.length;
    assert.equal(h.player.play(kind),true,kind);const current=h.nodes.slice(before),values=h.ramps.slice(ramp);
    assert.ok(current.filter(n=>n.osc).every(n=>n.stopTime<=h.context.currentTime+.6),kind+' must be brief');
    assert.ok(values.every(x=>x.v>=0&&x.v<2500));
    signatures.push(JSON.stringify(current.filter(n=>n.osc).map(n=>[n.startTime-h.context.currentTime,n.stopTime-n.startTime])));
    for(const n of current.filter(n=>n.osc))n.onended();assert.ok(current.every(n=>n.disconnected));
  }
  assert.equal(new Set(signatures).size,7);assert.ok(h.ramps.some(x=>x.v>.05&&x.v<.1),'audible midrange envelope');
  h.player.play('startup');const count=h.nodes.length;assert.equal(h.player.play('startup'),false);assert.equal(h.nodes.length,count);
  h.player.dispose();assert.ok(h.nodes.every(n=>n.disconnected));assert.equal(h.player.play('listening'),false);
});

test('processing pulses follow activity, end on a reply or stop, and cannot run indefinitely',()=>{
  const h=harness();h.context.state='running';h.player.activity('thinking');assert.equal(h.nodes.length,0);
  h.advance(350);assert.ok(h.nodes.length);const first=h.nodes.length;h.player.activity('thinking');assert.equal(h.timers.size,1);
  h.advance(2400);assert.equal(h.nodes.length,first*2);h.player.play('response');assert.equal(h.timers.size,0);
  const count=h.nodes.length;h.advance(10000);assert.equal(h.nodes.length,count);
  h.player.activity('checking');assert.ok(h.nodes.length>count);h.advance(31000);assert.equal(h.timers.size,0);
  h.player.activity('thinking');h.player.stop();assert.equal(h.timers.size,0);assert.ok(h.nodes.every(n=>n.disconnected));
});

test('sound preview uses the same six motifs, cancels cleanly, and zero volume silences scheduled audio',()=>{
  const h=harness();h.context.state='running';assert.equal(h.player.preview(),true);assert.equal(h.timers.size,5);
  h.advance(4000);assert.equal(h.timers.size,0);assert.equal(h.nodes.filter(n=>n.osc).length,24);
  h.player.setVolume(0);assert.ok(h.nodes.every(n=>n.disconnected));assert.equal(h.player.play('startup'),false);
  h.player.setVolume(1);h.advance(1000);h.player.preview();h.advance(900);h.player.dispose();assert.equal(h.timers.size,0);assert.ok(h.nodes.every(n=>n.disconnected));
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
