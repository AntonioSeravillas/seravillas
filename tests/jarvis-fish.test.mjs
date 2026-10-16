import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createFishVoice,FISH_MODEL,FISH_FREE_END} from '../tools/jarvis/fish-voice.mjs';
const config={enabled:true,consent:true,model:FISH_MODEL,apiKey:'FISH_PRIVATE_SENTINEL_123456789',voiceId:'PUBLIC_VOICE_123456'};
const now=()=>Date.parse('2026-10-16T09:00:00Z');
test('Fish is fixed to the free model and PC voice; PCM is emitted before the provider finishes',async()=>{
  let end,calls=0,aborted;const source=new ReadableStream({start(c){c.enqueue(Buffer.alloc(4800,4));end=()=>{c.enqueue(Buffer.alloc(14400,5));c.close();};}});
  const voice=createFishVoice({config,now,fetchImpl:async(url,init)=>{calls++;assert.equal(url,'https://api.fish.audio/v1/tts');assert.equal(init.redirect,'error');assert.equal(init.headers.model,'s2.1-pro-free');assert.equal(init.headers.Authorization,'Bearer '+config.apiKey);assert.equal(JSON.parse(init.body).latency,'balanced');aborted=init.signal;return new Response(source,{headers:{'Content-Type':'audio/pcm'}});}});
  const frames=[];const run=voice.stream('A fictional reply.',async frame=>{frames.push(frame);if(frames.length===1)end();});const result=await run;
  assert.equal(calls,1);assert.equal(frames.length,2);assert.equal(result.frames,2);assert.equal(result.streamed,true);assert.equal(aborted.aborted,true);assert.ok(!JSON.stringify([voice.status(),frames,result]).includes(config.apiKey));
});
test('Fish free-only cutoff, rejected credentials, invalid payload and interrupted transport never retry',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return new Response('{}',{status:401,headers:{'Content-Type':'application/json'}});};
  const expired=createFishVoice({config,now:()=>FISH_FREE_END,fetchImpl});assert.equal(expired.status().available,false);await assert.rejects(expired.stream('Hello',()=>{}),/trial has ended/);assert.equal(calls,0);
  const voice=createFishVoice({config,now,fetchImpl});await assert.rejects(voice.stream('x'.repeat(601),()=>{}),/1–600/);assert.equal(calls,0);await assert.rejects(voice.stream('Hello',()=>{}),/rejected or expired/);assert.equal(calls,1);
  assert.throws(()=>createFishVoice({config:{...config,model:'s2.1-pro'}}),/incomplete/);
  let signal;const interrupted=createFishVoice({config,now,fetchImpl:async(_,init)=>{signal=init.signal;return new Response(Buffer.alloc(4800,4),{headers:{'Content-Type':'audio/pcm'}});}});
  await assert.rejects(interrupted.stream('Hello',()=>{throw Error('Cloud cancelled');}),/did not finish/);assert.equal(signal.aborted,true);
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function playerHarness(request){
  const events=[],sources=[],timers=new Map();let n=0;
  const context={state:'running',currentTime:0,destination:{},resume:async()=>{},close:async()=>{},createBuffer:(_,length,rate)=>({duration:length/rate,copyToChannel(samples){assert.equal(samples.length,length);}}),createBufferSource:()=>{const source={connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(source);return source;}};
  const sandbox=vm.createContext({window:{},AbortController,Uint8Array,TextDecoder,DataView,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(new URL('../src/assistant/jarvis-audio.js',import.meta.url),'utf8'),sandbox);
  const player=sandbox.window.SV_JARVIS_AUDIO.createStreamingPlayer({request,makeContext:()=>context,decode:value=>Uint8Array.from(Buffer.from(value,'base64')),onStart:()=>events.push('start'),onDone:()=>events.push('done'),onError:e=>events.push(e),schedule:(fn,ms)=>{timers.set(++n,{fn,ms});return n;},clear:id=>timers.delete(id)});
  return{player,events,sources,timers,context};
}
const frame=(seq=0)=>({type:'audio',seq,sampleRate:24000,audio:Buffer.alloc(4800,3).toString('base64')});
const streamResponse=packets=>new Response(packets.map(x=>JSON.stringify(x)+'\n').join(''),{headers:{'Content-Type':'application/x-ndjson'}});
test('stream playback completes once only after the verified final frame has actually played',async()=>{
  const h=playerHarness(async()=>streamResponse([frame(0),frame(1),{type:'end',frames:2}]));await h.player.prepare();const playing=h.player.play('A fictional reply.');await flush();await playing;
  assert.equal(h.events.includes('done'),false);const audio=h.sources.slice(1);assert.equal(audio.length,2);assert.ok(audio[1].at>audio[0].at);
  const last=audio[1].onended;audio[0].onended();assert.equal(h.events.includes('done'),false);last();last();assert.equal(h.events.filter(x=>x==='done').length,1);assert.equal(h.timers.size,0);
});
test('interruption, missing completion, stale frames and playback failure cannot arm approval',async()=>{
  const h=playerHarness(async()=>streamResponse([frame(),{type:'end',frames:1}]));await h.player.prepare();await h.player.play('Draft for review.');const late=h.sources[1].onended;h.player.stop();late();assert.equal(h.events.includes('done'),false);
  const truncated=playerHarness(async()=>streamResponse([frame()]));await truncated.player.prepare();await truncated.player.play('Draft for review.');assert.equal(truncated.events.includes('done'),false);assert.ok(truncated.events.some(x=>/before the reply finished/.test(x)));assert.equal(truncated.sources[1].stopped,true);
  let resolve;const stale=playerHarness(()=>new Promise(r=>resolve=r));await stale.player.prepare();const old=stale.player.play('Old reply');stale.player.stop();resolve(streamResponse([frame(),{type:'end',frames:1}]));await old;assert.equal(stale.sources.length,1);assert.equal(stale.events.length,0);
});
test('a transport error after some audio cancels all queued sound and reports failure instead of completion',async()=>{
  const h=playerHarness(async()=>streamResponse([frame(),{type:'error',message:'Provider stopped.'}]));await h.player.prepare();await h.player.play('Draft for review.');assert.deepEqual(h.events,['Provider stopped.']);assert.equal(h.sources[1].stopped,true);
});
