/* Jarvis transport. Development preview (DEV_MODE): the existing same-origin calls to the local Jarvis server,
   unchanged. Live app: the same calls travel through the manager-authenticated Worker relay to the Jarvis PC.
   - Only allowlisted requests are mapped; AI drafting, model consent and WhatsApp connect/pairing stay on the PC.
   - Each request is submitted exactly once and its result polled; nothing is retried after it may have acted.
   - The PC's local session token never reaches the browser: a "relay" placeholder keeps the existing UI gating.
   Only Jarvis's own calls use this; nothing global is patched. */
(function(){
  const TIMEOUT={health:20000,chat:110000,speech:60000,'wa-status':20000,'wa-inbox':25000,'wa-read':25000,'wa-review':40000,'wa-send':60000,'wa-discard':25000};
  const SENTINEL='relay';
  const remote=()=>typeof DEV_MODE!=='undefined'&&!DEV_MODE;
  const relayUrl=()=>typeof SYNC_URL==='string'?SYNC_URL:'';
  const secret=()=>typeof SYNC_SECRET==='string'?SYNC_SECRET:'';
  const reply=(status,body)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>body});
  const UNCERTAIN=()=>reply(200,{status:'uncertain',message:'No confirmation from the Jarvis PC in time. Check WhatsApp on the phone before sending again.'});
  /* Strict mapping from Jarvis's existing local endpoints to relay operations. */
  function operation(url,init){
    const u=new URL(String(url),'https://jarvis.invalid'),method=String(init.method||'GET').toUpperCase();
    let body={};if(init.body){try{body=JSON.parse(init.body);}catch{return {refuse:400,error:'Invalid request.'};}}
    if(u.pathname==='/api/jarvis/health'&&method==='GET')return {op:'health',params:{}};
    if(u.pathname==='/api/jarvis/speech'&&method==='POST')return {op:'speech',params:{text:body.text}};
    if(u.pathname==='/api/jarvis/chat'&&method==='POST')return {op:'chat',params:{text:body.text,sessionId:body.sessionId,context:body.context}};
    const wa=u.pathname.match(/^\/api\/jarvis\/whatsapp\/([a-z-]+)$/);
    if(wa){
      const action=wa[1];
      if(action==='status'&&method==='GET')return {op:'wa-status',params:{}};
      if(action==='inbox'&&method==='GET'){const chat=u.searchParams.get('chat')||'';return {op:'wa-inbox',params:chat?{chat}:{}};}
      if(action==='read'&&method==='POST')return {op:'wa-read',params:{messages:body.messages}};
      if(action==='review'&&method==='POST')return {op:'wa-review',params:{chat:body.chat,version:body.version,text:body.text,checkedPhone:body.checkedPhone===true}};
      if(action==='send'&&method==='POST')return {op:'wa-send',params:{chat:body.chat,reviewToken:body.reviewToken,text:body.text}};
      if(action==='draft'&&method==='POST'&&body.action==='discard')return {op:'wa-discard',params:{chat:body.chat}};
      if(action==='draft'||action==='model-consent')return {refuse:403,error:'AI drafts are off when Jarvis is used from another device. Write or dictate the reply yourself.'};
      if(action==='connect'||action==='disconnect')return {refuse:403,error:'Connect or disconnect WhatsApp on the Jarvis PC itself.'};
    }
    return {refuse:404,error:'This is not available from other devices.'};
  }
  const wait=(ms,signal)=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason||Object.assign(Error('Aborted'),{name:'AbortError'}));return;}
    const timer=setTimeout(resolve,ms);signal?.addEventListener?.('abort',()=>{clearTimeout(timer);reject(signal.reason||Object.assign(Error('Aborted'),{name:'AbortError'}));},{once:true});
  });
  async function relayFetch(url,init={}){
    const job=operation(url,init);
    if(job.refuse)return reply(job.refuse,{error:job.error});
    if(!relayUrl()||!secret())return reply(401,{error:'Sign in to the live app before using Jarvis remotely.'});
    const signal=init.signal,deadline=Date.now()+TIMEOUT[job.op];
    /* Submitted once. A network failure here is reported to the caller, never retried. */
    const posted=await fetch(relayUrl()+'/api/relay/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Secret':secret()},body:JSON.stringify({op:job.op,params:job.params}),cache:'no-store',signal});
    let accepted={};try{accepted=await posted.json();}catch{}
    if(!posted.ok)return reply(posted.status,{error:typeof accepted.error==='string'?accepted.error:'The relay could not take this request.'});
    if(!/^[a-f0-9]{64}$/.test(String(accepted.jobId||'')))return reply(502,{error:'The relay returned an unexpected reply.'});
    let pause=500;
    while(Date.now()<deadline){
      await wait(pause,signal);pause=Math.min(1500,pause+250);
      let res;
      try{res=await fetch(relayUrl()+'/api/relay/jobs/'+accepted.jobId,{headers:{'X-Secret':secret()},cache:'no-store',signal});}
      catch(e){if(e?.name==='AbortError'||signal?.aborted)throw e;continue;}
      let state={};try{state=await res.json();}catch{}
      /* Sign-in or service problems while waiting are shown at once. A send was already submitted, so it is uncertain. */
      if(res.status===401||res.status===403||res.status>=500){
        if(job.op==='wa-send')return UNCERTAIN();
        return reply(res.status,{error:res.status===401||res.status===403?'Your sign-in for the live app was not accepted. Sign in again.':typeof state.error==='string'?state.error:'The relay is not available right now.'});
      }
      if(state.status==='expired')return reply(503,{error:'The Jarvis PC did not pick this up in time'+(job.op==='wa-send'?', so nothing was sent':'')+'. Check that it is on and the live relay is running.'});
      if(res.status===404)return job.op==='wa-send'?UNCERTAIN():reply(504,{error:'The Jarvis PC result is no longer available. Please try again.'});
      if(state.status==='done'&&state.result&&typeof state.result==='object'){
        const body=state.result.body&&typeof state.result.body==='object'?{...state.result.body}:{};
        delete body.requestToken;
        if((job.op==='health'&&body.ready===true)||(job.op==='wa-status'&&body.available===true))body.requestToken=SENTINEL;
        return reply(Number.isInteger(state.result.status)?state.result.status:502,body);
      }
    }
    return job.op==='wa-send'?UNCERTAIN():reply(504,{error:'The Jarvis PC did not answer in time. Check that it is on and the live relay is running.'});
  }
  function jarvisFetch(url,init={}){return remote()?relayFetch(url,init):fetch(url,init);}
  /* Owner-only PC registration. The one-time code is returned to the caller for display and is never stored. */
  async function device(method,payload){
    if(!remote()||!relayUrl()||!secret())throw Error('Use this from the signed-in live app.');
    const res=await fetch(relayUrl()+'/api/relay/device',{method,headers:{'X-Secret':secret(),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw Error(typeof data.error==='string'?data.error:'The relay is not available right now.');
    return data;
  }
  window.SV_JARVIS_TRANSPORT=Object.freeze({
    fetch:jarvisFetch,remote,
    timeoutFor:(local,remoteMs)=>remote()?remoteMs:local,
    deviceStatus:()=>device('GET'),
    registerDevice:async()=>{const data=await device('POST',{action:'register'});return {deviceToken:String(data.deviceToken||'')};},
    revokeDevice:()=>device('POST',{action:'revoke'})
  });
})();
