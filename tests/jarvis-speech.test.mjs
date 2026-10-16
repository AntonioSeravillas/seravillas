import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createElevenLabsVoice} from '../tools/jarvis/elevenlabs-voice.mjs';

const config={enabled:true,apiKey:'sk_'+'SYNTHETIC_PRIVATE_KEY'.repeat(3),voiceId:'SYNTHETICVOICE123456',monthlyCharacters:100};
const store=()=>{let value=null;return {load:()=>value,save:v=>{value=v;}};};
const mp3=()=>new Response(Buffer.alloc(100,7),{headers:{'Content-Type':'audio/mpeg'}});

test('ElevenLabs sends only speech to one fixed endpoint, caches repeats, reserves a monthly budget and never exposes its key',async()=>{
  const calls=[],usage=store();let date=new Date('2026-10-15T12:00:00Z');
  const voice=createElevenLabsVoice({config,store:usage,now:()=>date,fetchImpl:async(url,init)=>{calls.push({url,init});return mp3();}});
  const result=await voice.generate('At your service.');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.elevenlabs.io/v1/text-to-speech/SYNTHETICVOICE123456?output_format=mp3_22050_32');
  assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers['xi-api-key'],config.apiKey);
  const payload=JSON.parse(calls[0].init.body);assert.deepEqual(Object.keys(payload).sort(),['model_id','text','voice_settings']);assert.equal(payload.text,'At your service.');
  assert.equal(result.contentType,'audio/mpeg');assert.ok(!JSON.stringify(result).includes(config.apiKey));assert.ok(!JSON.stringify(voice.status()).includes(config.apiKey));
  assert.deepEqual(await voice.generate('At your service.'),result);assert.equal(calls.length,1);assert.equal(usage.load().characters,16);
  await assert.rejects(voice.generate('x'.repeat(90)),/monthly voice test limit/);assert.equal(calls.length,1);
  date=new Date('2026-11-01T00:00:00Z');await voice.generate('x'.repeat(90));assert.equal(usage.load().characters,90);
});

test('provider failure, redirect, empty/oversized audio and invalid input never leak provider responses or retry a paid operation',async()=>{
  for(const response of [()=>new Response('ECHOED_PRIVATE_KEY',{status:401}),()=>new Response('ECHOED_PRIVATE_KEY',{status:429}),()=>new Response('ECHOED_PRIVATE_KEY',{status:500}),()=>new Response('not mp3'),()=>new Response('',{headers:{'Content-Type':'audio/mpeg'}}),()=>new Response(Buffer.alloc(180001),{headers:{'Content-Type':'audio/mpeg'}}),()=>{throw Error('ECHOED_PRIVATE_KEY');}]){
    let calls=0;const usage=store(),voice=createElevenLabsVoice({config,store:usage,fetchImpl:async()=>{calls++;return response();}});
    await assert.rejects(voice.generate('Hello.'),e=>!e.message.includes('ECHOED_PRIVATE_KEY'));assert.equal(calls,1);assert.equal(usage.load().characters,6);
  }
  let calls=0;const voice=createElevenLabsVoice({config,store:store(),fetchImpl:async()=>{calls++;return mp3();}});
  for(const input of ['',{},'x'.repeat(601)])await assert.rejects(voice.generate(input),/1–600/);
  assert.equal(calls,0);assert.equal(createElevenLabsVoice({config:null}),null);
});
test('ElevenLabs quota_exceeded on HTTP 401 is a usage limit, not a credential error; raw details are never exposed',async()=>{
  let calls=0;const voice=createElevenLabsVoice({config,store:store(),fetchImpl:async()=>{calls++;return new Response(JSON.stringify({detail:{status:'quota_exceeded',message:'PRIVATE_KEY_OR_INPUT'}}),{status:401});}});
  await assert.rejects(voice.generate('Hello.'),e=>e.status===429&&/credits or the API key usage limit/.test(e.message)&&!e.message.includes('PRIVATE_KEY_OR_INPUT'));
  assert.equal(calls,1);
});

function playerHarness(){
  const timers=new Map(),events=[],requests=[],revoked=[],pending=[];let seq=0,audio;
  const context=vm.createContext({window:{},AbortController,Uint8Array,Map,Promise,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(new URL('../src/assistant/jarvis-audio.js',import.meta.url),'utf8'),context);
  const player=context.window.SV_JARVIS_AUDIO.createPlayer({
    makeAudio:()=>audio={src:'',volume:0,muted:true,setAttribute(){},removeAttribute(){this.src='';},load(){},pause(){events.push('pause');},play(){events.push(this.src.startsWith('data:')?'unlock':'play');return Promise.resolve();}},
    request:(text,signal)=>{requests.push({text,signal});return new Promise(resolve=>pending.push(resolve));},
    onStart:()=>events.push('started'),onDone:()=>events.push('done'),onError:e=>events.push(e),
    urlApi:{createObjectURL:()=>'blob:voice-'+(++seq),revokeObjectURL:url=>revoked.push(url)},decode:()=>new Uint8Array(100),makeBlob:bytes=>bytes,
    schedule:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clear:id=>timers.delete(id)
  });
  return {player,events,requests,revoked,pending,timers,audio:()=>audio,sections:context.window.SV_JARVIS_AUDIO.sections};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const audioResult={contentType:'audio/mpeg',audio:Buffer.alloc(100,7).toString('base64')};

test('browser media unlock precedes a delayed reply; several chunks finish once, reuse the same media element and do not regenerate on replay',async()=>{
  const h=playerHarness();h.player.prepare();await flush();assert.deepEqual(h.events,['unlock','pause']);
  const text=('This is a fairly long reply. ').repeat(30),parts=h.sections(text),play=h.player.play(text);
  assert.ok(parts.length>1);assert.ok(parts.every(s=>s.length<=600));assert.equal(h.requests.length,1);
  for(let i=0;i<parts.length;i++){
    h.pending[i](audioResult);await flush();assert.equal(h.audio().volume,1);assert.equal(h.audio().muted,false);
    h.audio().onplaying();const ended=h.audio().onended;ended();ended();await flush();
  }
  await play;assert.equal(h.events.filter(e=>e==='done').length,1);assert.equal(h.requests.length,parts.length);assert.equal(h.revoked.length,parts.length);
  const replay=h.player.play(text);await flush();for(let i=0;i<parts.length;i++){h.audio().onplaying();h.audio().onended();await flush();}await replay;
  assert.equal(h.requests.length,parts.length);assert.equal(h.events.filter(e=>e==='done').length,2);
});

test('cancel/close aborts generation and drops late audio; playback errors never resume listening or consume more credits',async()=>{
  const h=playerHarness(),first=h.player.play('Old reply');h.player.stop();assert.equal(h.requests[0].signal.aborted,true);
  h.pending[0](audioResult);await first;assert.equal(h.events.includes('play'),false);assert.equal(h.events.includes('done'),false);
  const next=h.player.play('New reply');h.pending[1](audioResult);await flush();const oldEnd=h.audio().onended;h.player.stop();oldEnd();await next;assert.equal(h.events.includes('done'),false);
  const failed=h.player.play('Will not play');h.pending[2](audioResult);await flush();h.audio().onerror();await failed;
  assert.equal(h.requests.length,3);assert.equal(h.events.includes('done'),false);assert.ok(h.events.some(e=>/Tap Play reply/.test(e)));assert.equal(h.timers.size,0);
});
test('exact read-backs start with a short section and prepare only the next section during playback',async()=>{
  const h=playerHarness(),text=('A complete sentence for the owner to review. ').repeat(25),parts=h.sections(text);
  assert.ok(parts[0].length<=220);assert.equal(parts.join(' '),text.trim());
  const play=h.player.play(text);h.pending[0](audioResult);await flush();assert.equal(h.requests.length,1);
  h.audio().onplaying();assert.equal(h.requests.length,2);assert.equal(h.events.includes('done'),false);
  const late=h.pending[1];h.player.stop();assert.equal(h.requests[1].signal.aborted,true);late(audioResult);await play;
  assert.equal(h.events.includes('done'),false);assert.equal(h.requests.length,2);
});
test('a pending media unlock is bounded and stop settles it; a late unlock cannot pause a newer reply',async()=>{
  const h=playerHarness();let release;h.audio();
  // First create the media, then simulate Safari leaving play() pending.
  await h.player.prepare();h.audio().play=()=>new Promise(r=>{release=r;});
  let prepared=false;const pending=h.player.prepare().then(()=>{prepared=true;});await flush();assert.equal(prepared,false);
  const timeout=[...h.timers.values()].find(t=>t.ms===1200);assert.ok(timeout);timeout.fn();await pending;assert.equal(prepared,true);
  h.audio().play=()=>Promise.resolve();const playing=h.player.play('A newer reply');h.pending[0](audioResult);await flush();h.audio().onplaying();const before=h.events.filter(x=>x==='pause').length;
  release();await flush();assert.equal(h.events.filter(x=>x==='pause').length,before);h.audio().onended();await playing;
  h.audio().play=()=>new Promise(()=>{});let settled=false;const closing=h.player.prepare().then(()=>{settled=true;});h.player.stop();await closing;assert.equal(settled,true);
});
