import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createElevenLabsVoice} from '../tools/jarvis/elevenlabs-voice.mjs';
import {createElevenLabsAgent} from '../tools/jarvis/elevenlabs-agent.mjs';
const designSource=fs.readFileSync(new URL('../src/assistant/jarvis-sound-design.js',import.meta.url),'utf8');
function harness({load}={}){
  const nodes=[],sources=[],ramps=[],timers=new Map();let clock=0,id=0;
  const parameter=()=>({setValueAtTime(v,t){ramps.push({v,t});},linearRampToValueAtTime(v,t){ramps.push({v,t});},setTargetAtTime(v,t){ramps.push({v,t});}});
  const make=()=>{const n={gain:parameter(),connect(){},disconnect(){n.disconnected=true;}};nodes.push(n);return n;};
  const context={state:'suspended',currentTime:0,destination:{},createGain:make,createDynamicsCompressor(){const n=make();for(const k of ['threshold','knee','ratio','attack','release'])n[k]=parameter();return n;},createBuffer:(_,size,rate)=>({duration:size/rate,copyToChannel(){}}),createBufferSource(){const n=make();Object.assign(n,{start(){n.started=true;},stop(){n.stopped=true;}});sources.push(n);return n;}},sandbox={window:{},setTimeout,clearTimeout};
  vm.runInNewContext(designSource,sandbox);vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis-sounds.js',import.meta.url),'utf8'),sandbox);
  const player=sandbox.window.SV_JARVIS_SOUNDS.create(context,{load:load|| (async kind=>({duration:sandbox.window.SV_JARVIS_SOUND_DESIGN.duration(kind)})),schedule(fn,ms){timers.set(++id,{fn,at:clock+ms});return id;},clear:id=>timers.delete(id)});
  async function advance(ms){const target=clock+ms;while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>target)break;clock=entry[1].at;context.currentTime=clock/1000;timers.delete(entry[0]);entry[1].fn();await new Promise(resolve=>setImmediate(resolve));}clock=target;context.currentTime=clock/1000;await new Promise(resolve=>setImmediate(resolve));}
  return {context,nodes,sources,ramps,timers,player,advance,design:sandbox.window.SV_JARVIS_SOUND_DESIGN};
}

test('cinematic PCM is stereo, finite, bounded and distinct across every feature; unknown names cannot allocate sounds',()=>{
  const h=harness(),signatures=new Set();
  for(const kind of Object.keys(h.design.labels)){
    const pcm=h.design.render(kind);assert.ok(pcm.duration<=1.2,kind);let sum=0,dc=0,peak=0,difference=0;
    for(let i=0;i<pcm.left.length;i++){const v=pcm.left[i];assert.ok(Number.isFinite(v));sum+=v*v;dc+=v;peak=Math.max(peak,Math.abs(v),Math.abs(pcm.right[i]));difference+=Math.abs(v-pcm.right[i]);}
    assert.ok(peak<=.821&&peak>.7,kind);assert.ok(Math.sqrt(sum/pcm.left.length)>.06,kind+' must have body rather than an inaudible transient');assert.ok(Math.abs(dc/pcm.left.length)<.025,kind+' DC offset');assert.ok(difference>1,kind+' stereo depth');assert.ok(Math.abs(pcm.left[0])<.001&&Math.abs(pcm.left.at(-1))<.01,kind+' smooth boundaries');
    signatures.add([...pcm.left.slice(700,710)].join(','));assert.equal(h.design.render(kind),pcm);
  }
  assert.equal(signatures.size,Object.keys(h.design.labels).length);assert.equal(h.design.render('untrusted-anything'),null);
});

test('unlocked interface playback is louder, limited, rate bounded, and releases replaced buffers and nodes',async()=>{
  const h=harness();assert.equal(await h.player.play('startup'),false);assert.equal(h.sources.length,0);h.context.state='running';
  assert.equal(await h.player.play('startup'),true);assert.equal(await h.player.play('startup'),false);assert.equal(h.sources.length,1);assert.ok(h.ramps.some(x=>x.v===12),'bus compressor limits layered peaks');
  await h.advance(1000);await h.player.play('bookings');assert.ok(h.sources[0].stopped);h.player.setSpeech(true);assert.ok(h.ramps.some(x=>x.v===.28),'features duck under voice');
  assert.equal(await h.player.play('response'),true);assert.equal(h.sources.length,2,'a reply must not cut off the feature sound');
  h.sources.at(-1).onended();assert.ok(h.sources.at(-1).disconnected);h.player.dispose();assert.ok(h.nodes.every(n=>n.disconnected));assert.equal(await h.player.play('startup'),false);
});

test('work pulses and the particle feed use separate bounded lanes; speech ducks energy and missing frames stop loops',async()=>{
  const h=harness();h.context.state='running';h.player.activity('thinking');await h.advance(280);assert.equal(h.sources.length,1);
  h.player.feed(.7,{phase:'thinking'});await h.advance(0);assert.equal(h.sources.length,3);assert.equal(h.sources.at(-1).loop,true);
  h.player.play('bookings');assert.equal(h.sources[2].stopped,undefined,'navigation must not interrupt energy');
  await h.advance(100);h.player.setSpeech(true);h.player.feed(.9,{phase:'speaking'});assert.ok(h.ramps.some(x=>Math.abs(x.v-.099)<.0001),'speech energy is quieter');assert.ok(h.sources[0].stopped);
  await h.advance(500);assert.ok(h.sources[2].stopped,'missing rendering callbacks terminate the loop');
  h.player.feed(.8,{phase:'thinking'});await h.advance(0);h.player.feed(.8,{phase:'listening'});assert.ok(h.sources.at(-1).stopped,'interruption stops energy despite fading visible grains');
  h.player.activity('checking');await h.advance(0);await h.advance(31000);assert.equal(h.timers.size,0);h.player.stop();assert.ok(h.sources.every(n=>n.stopped||n.disconnected));
});

test('group previews are finite, use the real sound library, and mute or dispose cancels every lane and timer',async()=>{
  const h=harness();h.context.state='running';assert.equal(await h.player.preview('activity'),true);await h.advance(12000);assert.equal(h.sources.length,7);assert.equal(h.timers.size,0);
  await h.player.preview('features');await h.advance(20000);assert.equal(h.sources.length,22);await h.player.preview('globe');await h.advance(4000);assert.equal(h.sources.length,24);assert.equal(h.sources.at(-1).loop,false);
  await h.player.preview('features');h.player.setVolume(0);assert.equal(h.timers.size,0);assert.ok(h.sources.every(n=>n.stopped||n.disconnected));assert.equal(await h.player.play('startup'),false);h.player.dispose();assert.ok(h.nodes.every(n=>n.disconnected));
});
test('late asset decoding cannot restart a cancelled, muted or disposed effect',async()=>{
  let release;const h=harness({load:kind=>kind==='bookings'?new Promise(resolve=>{release=resolve;}):Promise.resolve({duration:.5})});h.context.state='running';
  const pending=h.player.play('bookings');await h.advance(0);h.player.stop();release({duration:.5});assert.equal(await pending,false);assert.equal(h.sources.length,0);
  assert.equal(await h.player.play('tasks'),true);h.player.setVolume(0);assert.ok(h.sources[0].stopped);h.player.dispose();
});

test('every named cinematic effect ships as a stereo PCM asset with the declared duration',()=>{
  const h=harness();for(const kind of [...Object.keys(h.design.labels),'energy']){const bytes=fs.readFileSync(new URL('../assets/audio/jarvis/'+kind+'.wav',import.meta.url));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt16LE(34),16);const duration=bytes.readUInt32LE(40)/bytes.readUInt32LE(28);assert.ok(Math.abs(duration-h.design.duration(kind))<.001,kind);}
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
