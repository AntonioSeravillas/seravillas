/* Jarvis live relay agent (runs on the Jarvis PC). No dependencies, no public port, no second WhatsApp session.
   It polls the production Worker outbound with this PC's device token, runs only allowlisted requests against the
   Jarvis server already running on this PC (loopback), and posts back a sanitised result.
   - The local session token stays on this PC: it is read from the local server and sent only to loopback.
   - Every job is written to a private ledger BEFORE anything happens. A job seen again, or one interrupted by a
     restart, is never run again; an interrupted WhatsApp send is reported as "uncertain".
   - Message text is passed through as data; nothing here interprets it. Nothing is retried after it may have acted. */
import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createElevenLabsVoice,loadVoiceConfig,defaultVoicePath} from './elevenlabs-voice.mjs';
import {createElevenLabsAgent} from './elevenlabs-agent.mjs';
import {createFishVoice,loadFishConfig} from './fish-voice.mjs';

export const PRODUCTION_RELAY='https://seravillas-sync.antonio-01e.workers.dev';
export const defaultConfigPath=(env=process.env)=>env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'hermes','profiles','seravillas','jarvis-live-relay.json'):'';
const TIMEOUTS={health:20000,chat:110000,speech:50000,'wa-status':15000,'wa-inbox':20000,'wa-read':20000,'wa-review':30000,'wa-send':55000,'wa-discard':20000};
const UNCERTAIN_SEND={status:200,body:{status:'uncertain',message:'The Jarvis PC could not confirm this send. Check WhatsApp on the phone before sending again.'}};
const bad=()=>Object.assign(new Error('This request is not allowed from other devices.'),{code:'UNSUPPORTED'});

/* Only the production Worker (https) and an exact loopback Jarvis server are accepted. */
export function validateConfig(config){
  if(!config||typeof config!=='object')throw Error('The live relay configuration is missing or unreadable.');
  let cloud,local;
  try{cloud=new URL(String(config.cloudUrl||''));}catch{throw Error('cloudUrl must be '+PRODUCTION_RELAY);}
  if(cloud.origin!==PRODUCTION_RELAY||cloud.username||cloud.password||!['','/'].includes(cloud.pathname)||cloud.search||cloud.hash)throw Error('cloudUrl must be exactly '+PRODUCTION_RELAY);
  try{local=new URL(String(config.localUrl||'http://127.0.0.1:5500'));}catch{throw Error('localUrl must be a loopback address such as http://127.0.0.1:5500');}
  if(local.protocol!=='http:'||!['127.0.0.1','localhost'].includes(local.hostname)||local.username||local.password||!['','/'].includes(local.pathname)||local.search||local.hash)throw Error('localUrl must be a loopback address such as http://127.0.0.1:5500');
  if(!/^[a-f0-9]{64}$/.test(String(config.deviceToken||'')))throw Error('deviceToken is missing or malformed. Register this PC from Jarvis settings on the live app and paste the code into the configuration file.');
  return {cloudUrl:PRODUCTION_RELAY,localUrl:local.origin,deviceToken:config.deviceToken};
}
/* Strict mapping from a relay job to one existing local Jarvis endpoint. Anything else is refused. */
export function mapJob({op,params}={}){
  const p=params&&typeof params==='object'&&!Array.isArray(params)?params:{};
  const chat=v=>{if(!/^[a-f0-9]{20}$/.test(String(v||'')))throw bad();return v;};
  const text=v=>{if(typeof v!=='string'||!v.trim()||v.length>2000)throw bad();return v;};
  switch(op){
    case 'health':return {method:'GET',path:'/api/jarvis/health',needsToken:false};
    case 'live-session':{if(Object.keys(p).length)throw bad();return {liveSession:true,needsToken:false};}
    case 'speech':{if(Object.keys(p).some(k=>k!=='text')||typeof p.text!=='string'||!p.text.trim()||p.text.length>600)throw bad();return {speech:true,text:p.text,needsToken:false};}
    case 'speech-stream':{if(Object.keys(p).some(k=>k!=='text')||typeof p.text!=='string'||!p.text.trim()||p.text.length>600)throw bad();return {speechStream:true,text:p.text,needsToken:false};}
    case 'wa-status':return {method:'GET',path:'/api/jarvis/whatsapp/status',needsToken:false};
    case 'chat':{if(!/^[a-zA-Z0-9_-]{8,100}$/.test(String(p.sessionId||''))||!p.context||typeof p.context!=='object'||Array.isArray(p.context))throw bad();return {method:'POST',path:'/api/jarvis/chat',needsToken:true,body:{text:text(p.text),sessionId:p.sessionId,context:p.context}};}
    case 'wa-inbox':{if(Object.keys(p).some(k=>!['chat','view','limit','offset','direction','query'].includes(k)))throw bad();if(p.chat)chat(p.chat);if(p.view!==undefined&&!['voice','recent','unread','history','awaiting'].includes(p.view))throw bad();for(const k of ['limit','offset'])if(p[k]!==undefined&&(!Number.isInteger(p[k])||p[k]<(k==='limit'?1:0)||p[k]>(k==='limit'?10:100)))throw bad();if(p.direction!==undefined&&!['incoming','outgoing','both'].includes(p.direction))throw bad();if(p.query!==undefined&&(typeof p.query!=='string'||p.query.length>120))throw bad();const q=new URLSearchParams(p).toString();return {method:'GET',path:'/api/jarvis/whatsapp/inbox'+(q?'?'+q:''),needsToken:true};}
    case 'wa-read':{if(Object.keys(p).some(k=>k!=='messages')||!Array.isArray(p.messages)||p.messages.length<1||p.messages.length>10)throw bad();return {method:'POST',path:'/api/jarvis/whatsapp/read',needsToken:true,body:{messages:p.messages.map(chat)}};}
    case 'wa-review':{if(!Number.isInteger(p.version)||p.version<0||typeof p.text!=='string'||p.text.length>2000)throw bad();return {method:'POST',path:'/api/jarvis/whatsapp/review',needsToken:true,body:{chat:chat(p.chat),version:p.version,text:p.text,checkedPhone:p.checkedPhone===true}};}
    case 'wa-send':{if(!/^[A-Za-z0-9_-]{16,64}$/.test(String(p.reviewToken||'')))throw bad();return {method:'POST',path:'/api/jarvis/whatsapp/send',needsToken:true,body:{chat:chat(p.chat),reviewToken:p.reviewToken,text:text(p.text)}};}
    case 'wa-discard':return {method:'POST',path:'/api/jarvis/whatsapp/draft',needsToken:true,body:{chat:chat(p.chat),action:'discard'}};
    default:throw bad();
  }
}
/* The local token and the pairing QR never leave this PC. */
export function sanitize({status,body}){
  const clean=body&&typeof body==='object'&&!Array.isArray(body)?JSON.parse(JSON.stringify(body)):{error:'The Jarvis PC returned an unreadable reply.'};
  delete clean.requestToken;
  if(clean.connection&&typeof clean.connection==='object')delete clean.connection.qr;
  return {status:Number.isInteger(status)&&status>=100&&status<=599?status:502,body:clean};
}
/* Private file: configuration plus a bounded job ledger. Written atomically (temp, fsync, rename). */
export function createFileStore(file){
  if(!file)throw Error('The live relay configuration path could not be found on this PC.');
  return {
    load(){if(!existsSync(file))return null;try{return JSON.parse(readFileSync(file,'utf8'));}catch{throw Error('The live relay configuration file could not be read.');}},
    save(data){mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp',fd=openSync(temp,'w',0o600);try{writeFileSync(fd,JSON.stringify(data,null,2));fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,file);}
  };
}
const interrupted=op=>op==='wa-send'?UNCERTAIN_SEND:{status:503,body:{error:'The Jarvis PC restarted before finishing this request. Please try again.'}};

export function createRelayAgent({config,store,speechProvider=null,liveVoice=null,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=()=>{},idleMs=2500,heartbeatMs=20000,every=(fn,ms)=>{const id=setInterval(fn,ms);return ()=>clearInterval(id);}}={}){
  const cfg=validateConfig(config);
  if(!store)throw Error('A private store is required for the job ledger.');
  let stopped=false,failures=0;
  const read=()=>{const data=store.load()||{};data.ledger=data.ledger&&typeof data.ledger==='object'&&!Array.isArray(data.ledger)?data.ledger:{};return data;};
  function mark(jobId,entry){
    const data=read();data.ledger[jobId]={...data.ledger[jobId],...entry};
    const ids=Object.keys(data.ledger);for(const id of ids.slice(0,Math.max(0,ids.length-200)))delete data.ledger[id];
    store.save(data);
  }
  async function cloud(pathname,payload){
    let res;
    try{res=await fetchImpl(cfg.cloudUrl+pathname,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.deviceToken},body:JSON.stringify(payload||{}),signal:AbortSignal.timeout(20000)});}
    catch{throw Object.assign(Error('The relay service could not be reached.'),{code:'CLOUD'});}
    if(res.status===401||res.status===403)throw Object.assign(Error('This PC is not registered for the live relay, or its access was revoked. Register it again from Jarvis settings on the live app, update the configuration file, then restart the relay.'),{code:'AUTH'});
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw Object.assign(Error('The relay service replied with an error ('+res.status+').'),{code:res.status===409?'CONFLICT':'CLOUD'});
    return data;
  }
  async function local(method,pathname,{body,token,timeout}){
    const headers={};if(body)headers['Content-Type']='application/json';if(token)headers['X-Jarvis-Session-Token']=token;
    /* redirect:'error' keeps the local session token from ever being forwarded away from loopback. */
    const res=await fetchImpl(cfg.localUrl+pathname,{method,redirect:'error',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
    let data;try{data=await res.json();}catch{data=null;}
    return {status:res.status,body:data};
  }
  /* The running Jarvis server issues its own session token; it is fetched fresh before each protected call. */
  async function localToken(){
    const status=await local('GET','/api/jarvis/whatsapp/status',{timeout:5000}).catch(()=>null);
    let token=typeof status?.body?.requestToken==='string'?status.body.requestToken:'';
    if(!token){const health=await local('GET','/api/jarvis/health',{timeout:8000});token=typeof health.body?.requestToken==='string'?health.body.requestToken:'';}
    if(!token)throw Error('no local token');
    return token;
  }
  async function report(jobId,result){
    for(let attempt=0;attempt<3;attempt++){
      try{await cloud('/api/relay/device/complete',{jobId,result});mark(jobId,{state:'reported'});return true;}
      catch(e){if(e.code==='AUTH')throw e;if(e.code==='CONFLICT'){mark(jobId,{state:'reported'});return false;}if(attempt<2)await sleep(1000*(attempt+1));}
    }
    return false;
  }
  /* Started or unreported jobs from an earlier run are reported as interrupted (sends as uncertain), never re-run. */
  async function recover(){
    const data=read();
    for(const [jobId,entry] of Object.entries(data.ledger)){
      if(entry&&entry.state!=='reported'){await report(jobId,interrupted(entry.op));}
    }
  }
  async function handle(job){
    const jobId=String(job?.jobId||'');
    if(!/^[a-f0-9]{64}$/.test(jobId))return;
    const seen=read().ledger[jobId];
    if(seen){if(seen.state!=='reported')await report(jobId,interrupted(seen.op||job.op));return;}
    let call;
    try{call=mapJob(job);}catch{mark(jobId,{op:String(job.op||'').slice(0,20),state:'done',at:Date.now()});await report(jobId,{status:400,body:{error:'This request is not allowed from other devices.'}});return;}
    mark(jobId,{op:job.op,state:'started',at:Date.now()});
    let result;
    let token='';
    if(call.needsToken){
      try{token=await localToken();}
      catch{mark(jobId,{state:'done'});await report(jobId,{status:503,body:{error:'Jarvis is not running on the PC'+(job.op==='wa-send'?', so nothing was sent':'')+'. Start it, then try again.'}});return;}
    }
    /* Long jobs (a chat can take ~2 minutes) keep the PC visibly online with an authenticated heartbeat. */
    let authLost=null;
    const stopBeat=every(()=>{cloud('/api/relay/device/heartbeat',{}).catch(e=>{if(e.code==='AUTH')authLost=e;});},heartbeatMs);
    try{
      if(call.liveSession){
        if(!liveVoice)result={status:503,body:{error:'The live voice agent is not connected on the Jarvis PC.'}};
        else try{result={status:200,body:await liveVoice.session()};}catch(e){result={status:e.status||503,body:{error:e.message}};}
      }else if(call.speechStream){
        if(!speechProvider?.stream)result={status:503,body:{error:'Fish streaming voice is not connected on the PC.'}};
        else try{let seq=0;const done=await speechProvider.stream(call.text,frame=>cloud('/api/relay/device/audio',{jobId,seq:seq++,audio:frame.audio}));result={status:200,body:done};}catch(e){result={status:e.status||503,body:{error:e.message}};}
      }else if(call.speech){
        if(!speechProvider)result={status:503,body:{error:'The custom voice is not connected on the Jarvis PC. Choose Device voice.'}};
        else if(!speechProvider.generate)result={status:400,body:{error:'Use the updated streaming voice client.'}};
        else try{result={status:200,body:await speechProvider.generate(call.text)};}catch(e){result={status:e.status||503,body:{error:e.message}};}
      }else{
        result=sanitize(await local(call.method,call.path,{body:call.body,token,timeout:TIMEOUTS[job.op]}));
        if(job.op==='health'&&speechProvider)result.body.speech=speechProvider.status();
        if(job.op==='health'&&liveVoice)result.body.liveVoice=liveVoice.status();
      }
    }
    catch{result=job.op==='wa-send'?UNCERTAIN_SEND:{status:503,body:{error:'The Jarvis PC could not complete this request. Check that Jarvis is running.'}};}
    finally{stopBeat();}
    if(authLost){mark(jobId,{state:'done'});throw authLost;}
    mark(jobId,{state:'done'});
    await report(jobId,result);
  }
  async function run(){
    stopped=false;
    while(!stopped){
      try{
        await recover();
        const reply=await cloud('/api/relay/device/claim',speechProvider?.stream?{waitMs:5000}:{});
        failures=0;
        if(reply&&reply.job){await handle(reply.job);continue;}
        await sleep(speechProvider?.stream?25:idleMs);
      }catch(e){
        if(e.code==='AUTH'){log(e.message);stopped=true;return {stopped:'auth',message:e.message};}
        failures++;const delay=Math.min(60000,1000*2**Math.min(failures,6));
        log('The relay service is unreachable; trying again in '+Math.round(delay/1000)+' seconds. Remote requests are unavailable until then.');
        await sleep(delay);
      }
    }
    return {stopped:'requested'};
  }
  return {run,stop(){stopped=true;},handle,recover};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const flag=process.argv.indexOf('--config'),file=flag>0?process.argv[flag+1]:defaultConfigPath();
  try{
    const store=createFileStore(file),config=store.load();
    if(!config)throw Error('No live relay configuration was found. See docs/jarvis-live-release.md.');
    const voiceFile=defaultVoicePath(),voiceConfig=loadVoiceConfig(voiceFile);
    const speechProvider=createFishVoice({config:loadFishConfig()})||createElevenLabsVoice({config:voiceConfig,store:createFileStore(voiceFile+'.usage.json')});
    const liveVoice=speechProvider?.status().provider==='fish'?null:createElevenLabsAgent({config:voiceConfig});
    const agent=createRelayAgent({config,store,speechProvider,liveVoice,log:message=>console.log(new Date().toISOString().slice(11,19)+'  '+message)});
    process.on('SIGINT',()=>{agent.stop();console.log('Stopping the live relay…');});
    console.log('Jarvis live relay is running. Keep this PC awake and this window open. Press Ctrl+C to stop.');
    const result=await agent.run();
    if(result.stopped==='auth')process.exitCode=2;
  }catch(e){console.error(e.message);process.exitCode=1;}
}
