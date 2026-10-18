/* Server-side speech only. The key and fixed voice stay in the private PC profile, never the app.
   No retries: a failed request may already have consumed credits. Monthly usage is reserved first. */
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {SPEECH_DELIVERY,ULTRON_DELIVERY,voiceIdentity} from './elevenlabs-agent-config.mjs';

export const defaultVoicePath=(env=process.env)=>env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'hermes','profiles','seravillas','jarvis-elevenlabs.json'):'';
export function loadVoiceConfig(file=defaultVoicePath()){
  if(!file||!existsSync(file))return null;
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{throw Error('The private voice configuration could not be read.');}
}
const problem=(message,status=503)=>Object.assign(Error(message),{status});
async function providerCode(res){
  // Read only a bounded error and extract a code, never echo provider text or input.
  const reader=res.body?.getReader();if(!reader)return '';let size=0;const parts=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return '';}parts.push(Buffer.from(value));}
    const value=JSON.parse(Buffer.concat(parts).toString('utf8'));return typeof value?.detail?.status==='string'?value.detail.status:'';
  }catch{return '';}finally{reader.releaseLock();}
}
export function createElevenLabsVoice({config,store,fetchImpl=fetch,now=()=>new Date()}={}){
  if(!config||config.enabled!==true)return null;
  if(typeof config.apiKey!=='string'||!/^sk_[A-Za-z0-9_-]{20,200}$/.test(config.apiKey)||!/^\w{15,64}$/.test(config.voiceId||''))throw Error('The private ElevenLabs key or voice ID is missing or invalid.');
  const limit=Number.isInteger(config.monthlyCharacters)&&config.monthlyCharacters>0&&config.monthlyCharacters<=20000?config.monthlyCharacters:10000;
  if(!store)throw Error('A private voice usage store is required.');
  const cache=new Map();let pending=false;
  const identity=voiceIdentity(config),delivery=identity.soundTheme==='ultron'?ULTRON_DELIVERY:SPEECH_DELIVERY;
  const status=()=>({available:true,provider:'elevenlabs',...identity,monthlyCharacters:limit});
  async function generate(text){
    if(typeof text!=='string'||!text.trim()||text.length>600)throw problem('A spoken section must contain 1–600 characters.',400);
    const key=createHash('sha256').update(config.voiceId+'\0'+text).digest('hex');
    if(cache.has(key))return cache.get(key);
    if(pending)throw problem('Jarvis is already preparing a voice reply. Try again in a moment.',429);
    pending=true;
    try{
      const month=now().toISOString().slice(0,7),saved=store.load()||{};
      const used=saved.month===month&&Number.isInteger(saved.characters)?saved.characters:0;
      if(used+text.length>limit)throw problem('The monthly voice test limit is reached. Choose Device voice in settings to continue without ElevenLabs.',429);
      store.save({month,characters:used+text.length});
      let res;
      try{res=await fetchImpl('https://api.elevenlabs.io/v1/text-to-speech/'+config.voiceId+'?output_format=mp3_22050_32',{
        method:'POST',redirect:'error',headers:{'Content-Type':'application/json','xi-api-key':config.apiKey,Accept:'audio/mpeg'},
        body:JSON.stringify({text,model_id:'eleven_flash_v2_5',voice_settings:{...delivery,similarity_boost:0.75}}),signal:AbortSignal.timeout(45000)
      });}catch{throw problem('ElevenLabs did not answer. Tap Play reply to try again, or choose Device voice.');}
      if(!res.ok){
        const code=await providerCode(res);
        // ElevenLabs can report quota_exceeded with HTTP 401, not just 402/429.
        if(code==='quota_exceeded'||res.status===402||res.status===429)throw problem('ElevenLabs credits or the API key usage limit are reached. Device voice is available for free.',429);
        if(res.status===401||res.status===403)throw problem('ElevenLabs did not accept the private key or voice access. Check the PC voice configuration.');
        throw problem('ElevenLabs could not generate the voice. Choose Device voice or try again later.');
      }
      if(!String(res.headers.get('content-type')||'').startsWith('audio/mpeg'))throw problem('The voice service returned an unexpected audio format.');
      const reader=res.body.getReader(),parts=[];let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>180000){await reader.cancel();throw problem('The voice reply is too large. Please ask for a shorter answer.');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
      if(bytes<16)throw problem('The voice service returned empty audio.');
      const audio={contentType:'audio/mpeg',audio:Buffer.concat(parts).toString('base64'),provider:'elevenlabs',name:identity.name};
      cache.set(key,audio);if(cache.size>12)cache.delete(cache.keys().next().value);
      return audio;
    }finally{pending=false;}
  }
  return {status,generate};
}
