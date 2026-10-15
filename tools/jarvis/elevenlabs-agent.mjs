/* Private agent authentication. Only a short-lived WebRTC credential leaves the PC. */
export function createElevenLabsAgent({config,fetchImpl=fetch,now=()=>Date.now()}={}){
  if(config?.enabled!==true||!/^agent_[a-zA-Z0-9]{15,80}$/.test(config.liveAgentId||''))return null;
  if(!/^sk_[A-Za-z0-9_-]{20,200}$/.test(config.apiKey||''))throw Error('The private ElevenLabs key is invalid.');
  let busy=false,last=-Infinity;
  return {status:()=>({available:true,provider:'elevenlabs-agents',name:'Jarvis Seravillas',maxDurationSeconds:600}),async session(){
    if(busy||now()-last<10000)throw Object.assign(Error('A voice connection is already starting. Wait a moment, then tap the microphone.'),{status:429});
    busy=true;last=now();
    try{
      const res=await fetchImpl('https://api.elevenlabs.io/v1/convai/conversation/token?agent_id='+encodeURIComponent(config.liveAgentId),{headers:{'xi-api-key':config.apiKey},redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error(res.status===401||res.status===403?'ElevenLabs Agents access is not enabled for the private PC key.':'ElevenLabs could not start a live conversation. Check its usage allowance and agent configuration.');
      const data=await res.json();if(typeof data.token!=='string'||data.token.length<50||data.token.length>16000||/[\s<>]/.test(data.token))throw Error('ElevenLabs returned an invalid voice connection.');
      return {conversationToken:data.token,maxDurationSeconds:600};
    }catch(e){if(e.name==='TimeoutError'||e.name==='TypeError')throw Error('The live voice service could not be reached. Please try again.');throw e;}
    finally{busy=false;}
  }};
}
