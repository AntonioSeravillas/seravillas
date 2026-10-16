/* Fixed free-only speech endpoint. Credentials remain in the private PC profile. */
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
export const FISH_MODEL='s2.1-pro-free';
export const FISH_FREE_END=Date.parse('2026-12-01T00:00:00Z');
export const defaultFishPath=(env=process.env)=>env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'hermes','profiles','seravillas','jarvis-fish.json'):'';
export function loadFishConfig(file=defaultFishPath()){
  if(!file||!existsSync(file))return null;
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{throw Error('The private Fish voice configuration could not be read.');}
}
const problem=(message,status=503)=>Object.assign(Error(message),{status});
export function createFishVoice({config,fetchImpl=fetch,now=Date.now}={}){
  if(!config||config.enabled!==true)return null;
  if(config.model!==FISH_MODEL||config.consent!==true||!/^[A-Za-z0-9_-]{20,200}$/.test(config.apiKey||'')||!/^[A-Za-z0-9_-]{12,100}$/.test(config.voiceId||''))throw Error('The private Fish voice configuration is incomplete.');
  let pending=false;
  const status=()=>({available:now()<FISH_FREE_END,provider:'fish',name:'Fish · Adrian',streaming:true,freeUntil:'2026-11-30',model:FISH_MODEL});
  async function stream(text,onChunk,{signal}={}){
    if(typeof text!=='string'||!text.trim()||text.length>600)throw problem('A spoken section must contain 1–600 characters.',400);
    if(now()>=FISH_FREE_END)throw problem('The Fish free trial has ended. Choose Device voice; no paid model was selected.',429);
    if(pending)throw problem('Jarvis is already preparing speech. Try again in a moment.',429);
    if(signal?.aborted)throw signal.reason||problem('Speech was cancelled.');
    pending=true;const controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,50000);let reader;
    try{
      const response=await fetchImpl('https://api.fish.audio/v1/tts',{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json',model:FISH_MODEL,Accept:'audio/pcm'},body:JSON.stringify({text,reference_id:config.voiceId,format:'pcm',sample_rate:24000,latency:'balanced',chunk_length:100,min_chunk_length:25,temperature:0.7,top_p:0.7,prosody:{speed:1,volume:0,normalize_loudness:true}})});
      if(!response.ok){await response.body?.cancel();throw problem(response.status===401||response.status===403?'The Fish trial key was rejected or expired. Reconnect Fish on the PC.':'Fish free voice is unavailable. No paid model was selected.',response.status===429||response.status===402?429:503);}
      if(!/^(audio\/pcm|application\/octet-stream)(;|$)/i.test(response.headers.get('content-type')||''))throw problem('Fish returned an unexpected audio format.');
      if(!response.body)throw problem('Fish returned no audio.');
      reader=response.body.getReader();let bytes=0,buffer=Buffer.alloc(0),first=true,frames=0;
      const emit=async size=>{const frame=buffer.subarray(0,size);buffer=buffer.subarray(size);if(signal?.aborted||controller.signal.aborted)throw problem('Speech was cancelled.');await onChunk({type:'audio',sampleRate:24000,audio:frame.toString('base64')});frames++;first=false;};
      while(true){const {done,value}=await reader.read();if(done)break;if(!value?.length)continue;bytes+=value.byteLength;if(bytes>2880000)throw problem('The spoken section exceeded its duration limit. Ask for a shorter answer.');buffer=Buffer.concat([buffer,Buffer.from(value)]);let target=first?4800:14400;while(buffer.length>=target){await emit(target);target=14400;}}
      if(buffer.length%2||bytes<4800)throw problem('Fish returned incomplete audio.');
      if(buffer.length)await emit(buffer.length);
      return {streamed:true,frames,sampleRate:24000,provider:'fish'};
    }catch(error){if(error.status)throw error;throw problem(signal?.aborted?'Speech was cancelled.':'Fish free voice did not finish. Choose Device voice or try again.');}
    finally{controller.abort();try{await reader?.cancel();}catch{}reader?.releaseLock();clearTimeout(timer);signal?.removeEventListener('abort',abort);pending=false;}
  }
  return {status,stream};
}
