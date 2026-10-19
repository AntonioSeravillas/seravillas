import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {restoreVoiceSelection} from '../tools/jarvis/restore-voice-selection.mjs';
import {createElevenLabsVoice} from '../tools/jarvis/elevenlabs-voice.mjs';
import {createElevenLabsAgent} from '../tools/jarvis/elevenlabs-agent.mjs';

test('the original voice is restored without replacing current credentials, limits or unrelated private settings',async()=>{
  const original={voiceId:'ORIGINAL_VOICE_12345',liveAgentId:'agent_'+'o'.repeat(25),voiceName:'Jarvis Seravillas',apiKey:'obsolete',monthlyCharacters:10000};
  const current={enabled:true,voiceId:'ULTRON_VOICE_12345',liveAgentId:'agent_'+'u'.repeat(25),voiceName:'Ultron',soundTheme:'ultron',apiKey:'sk_'+'FICTIONAL_KEY'.repeat(4),monthlyCharacters:20000,otherSetting:'keep'};
  const restored=restoreVoiceSelection(current,original);assert.equal(restored.voiceId,original.voiceId);assert.equal(restored.liveAgentId,original.liveAgentId);assert.equal(restored.voiceName,'Jarvis Seravillas');assert.equal(restored.soundTheme,'jarvis');assert.equal(restored.apiKey,current.apiKey);assert.equal(restored.monthlyCharacters,20000);assert.equal(restored.otherSetting,'keep');assert.equal(current.soundTheme,'ultron');
  let voiceEndpoint,payload,agentEndpoint,usage={month:'2026-10',characters:9992};
  const voice=createElevenLabsVoice({config:restored,now:()=>new Date('2026-10-19T06:00:00Z'),store:{load:()=>usage,save:v=>{usage=v;}},fetchImpl:async(url,init)=>{voiceEndpoint=url;payload=JSON.parse(init.body);return new Response(Buffer.alloc(30,1),{headers:{'Content-Type':'audio/mpeg'}});}});
  await voice.generate('Ready.');assert.ok(voiceEndpoint.includes(original.voiceId));assert.equal(payload.voice_settings.speed,1.04);assert.equal(payload.voice_settings.stability,.35);assert.equal(usage.characters,9998);
  const agent=createElevenLabsAgent({config:restored,fetchImpl:async url=>{agentEndpoint=url;return new Response(JSON.stringify({token:'FICTIONAL_TOKEN_'.repeat(6)}),{headers:{'Content-Type':'application/json'}});}});await agent.session();assert.ok(agentEndpoint.includes(original.liveAgentId));assert.equal(agent.status().name,'Jarvis Seravillas');
  assert.throws(()=>restoreVoiceSelection(current,{voiceId:'invalid'}),/invalid/);
});

test('the published app has no interface sound engine, generated effects, globe audio callbacks or sound controls',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),overlay=fs.readFileSync(new URL('../src/assistant/jarvis.js',import.meta.url),'utf8');
  assert.doesNotMatch(html,/jarvis-sounds\.js|jarvis-sound-design\.js/);assert.doesNotMatch(overlay,/SV_JARVIS_SOUNDS|createOscillator|function cue\(|cue\(|soundPlayer|Test interface sounds|Sound preview|Interface sounds|onFeed:/);
  assert.equal(fs.existsSync(new URL('../assets/audio/jarvis',import.meta.url)),false);
});

test('the approved 20,000-character allowance and accumulated usage stay capped after restoring Jarvis',async()=>{
  const config={enabled:true,apiKey:'sk_'+'FICTIONAL_KEY'.repeat(4),voiceId:'ORIGINAL_VOICE_12345',monthlyCharacters:20000};let used={month:'2026-10',characters:9992},calls=0;
  const voice=createElevenLabsVoice({config,store:{load:()=>used,save:v=>{used=v;}},now:()=>new Date('2026-10-19T06:00:00Z'),fetchImpl:async()=>{calls++;return new Response(Buffer.alloc(30,1),{headers:{'Content-Type':'audio/mpeg'}});}});
  await voice.generate('Your preference is saved.');assert.equal(used.characters,9992+25);assert.equal(calls,1);assert.equal(voice.status().monthlyCharacters,20000);
  used={month:'2026-10',characters:19995};await assert.rejects(voice.generate('This exceeds the cap.'),/monthly voice test limit/);assert.equal(calls,1);
});
