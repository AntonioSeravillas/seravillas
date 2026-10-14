/* Lazy Baileys linked-device adapter for the Jarvis WhatsApp inbox.
   Nothing is imported, created, opened or contacted until connect() is called deliberately.
   It uses its own session folder, never Hermes's paired WhatsApp session. It sends no read
   receipts or presence, downloads no media, and only the inbox service calls sendText(). */
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chatKind} from './whatsapp-service.mjs';

export const RUNTIME_DIR=path.join(path.dirname(fileURLToPath(import.meta.url)),'whatsapp-runtime');
export const PACKAGES=Object.freeze(['@whiskeysockets/baileys','pino','qrcode']);
export const MISSING_DEPENDENCIES='WhatsApp support is not installed yet. Install the packages in tools/jarvis/whatsapp-runtime, then restart the Jarvis server.';
/* Private folder beside the seravillas profile; the session lives in "session" and the inbox in "inbox". */
export function defaultDataDir(env=process.env){return env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'hermes','profiles','seravillas','jarvis-whatsapp'):'';}

/* Finds a package entry file under the runtime folder without importing anything. */
export function resolveEntry(runtimeDir,name){
  const dir=path.join(runtimeDir,'node_modules',...name.split('/')),manifest=path.join(dir,'package.json');
  if(!existsSync(manifest))return '';
  let pkg;try{pkg=JSON.parse(readFileSync(manifest,'utf8'));}catch{return '';}
  const pick=value=>typeof value==='string'?value:value&&typeof value==='object'?pick(value.import??value.default??value.node??value.require):'';
  const exp=pkg.exports,root=exp&&typeof exp==='object'&&'.' in exp?exp['.']:exp;
  const rel=pick(root)||pkg.module||pkg.main||'index.js',full=path.resolve(dir,rel);
  return full.startsWith(dir+path.sep)&&existsSync(full)?full:'';
}
export const dependenciesReady=(runtimeDir=RUNTIME_DIR)=>PACKAGES.every(name=>!!resolveEntry(runtimeDir,name));
async function loadRuntime(runtimeDir){
  const mods={};
  for(const name of PACKAGES){
    const entry=resolveEntry(runtimeDir,name);
    if(!entry)throw Object.assign(Error(MISSING_DEPENDENCIES),{code:'MISSING_DEPENDENCIES'});
    mods[name]=await import(pathToFileURL(entry).href);
  }
  const pino=mods.pino.default||mods.pino,qrcode=mods.qrcode.default||mods.qrcode;
  return {baileys:mods['@whiskeysockets/baileys'],pino,qrcode};
}

const clip=(value,max)=>String(value??'').slice(0,max);
const num=value=>{const n=Number(value?.toNumber?.()??value);return Number.isFinite(n)?n:0;};
const MEDIA={imageMessage:'image',videoMessage:'video',audioMessage:'audio',documentMessage:'document',stickerMessage:'sticker'};
const REFUSED=['protocolMessage','reactionMessage','editedMessage','pollCreationMessage','pollCreationMessageV2','pollCreationMessageV3','pollUpdateMessage','keepInChatMessage','pinInChatMessage','callLogMesssage','groupInviteMessage'];
/* Turns a raw Baileys message into the service's plain event, or null for anything outside the supported scope. */
export function normalizeMessage(msg){
  const key=msg?.key;if(!key||typeof key.remoteJid!=='string'||!key.id)return null;
  if(!chatKind(key.remoteJid))return null;
  let content=msg.message;
  for(let i=0;i<4&&content;i++){const inner=content.ephemeralMessage?.message??content.documentWithCaptionMessage?.message;if(!inner)break;content=inner;}
  if(!content||typeof content!=='object')return null;
  if(content.viewOnceMessage||content.viewOnceMessageV2||content.viewOnceMessageV2Extension)return null;
  if(REFUSED.some(name=>content[name]))return null;
  const text=typeof content.conversation==='string'?content.conversation:typeof content.extendedTextMessage?.text==='string'?content.extendedTextMessage.text:'';
  let media=null,caption='';
  for(const [field,type] of Object.entries(MEDIA)){
    const item=content[field];if(!item)continue;
    if(item.viewOnce)return null;
    media={type,mimetype:clip(item.mimetype,80),sizeBytes:num(item.fileLength),seconds:num(item.seconds),fileName:type==='document'?clip(item.fileName,80):''};
    caption=typeof item.caption==='string'?item.caption:'';break;
  }
  const body=(text||caption).trim();
  if(!body&&!media)return null;
  return {chatJid:key.remoteJid,providerId:clip(key.id,128),fromMe:key.fromMe===true,participant:typeof key.participant==='string'?key.participant:'',senderName:clip(msg.pushName,80),text:body,media,timestamp:num(msg.messageTimestamp)};
}

export function createBaileysConnector({sessionDir='',runtimeDir=RUNTIME_DIR,loadModules=null,onMessage=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=timer=>clearTimeout(timer),reconnectDelays=[2000,5000,15000,30000,60000],sendTimeoutMs=40000}={}){
  let sock=null,phase='disconnected',message='Not connected.',qr='',optIn=false,attempt=0,timer=null,generation=0,mods=null;
  const groupNames=new Map();
  const load=loadModules||(()=>loadRuntime(runtimeDir));
  const set=(next,text)=>{phase=next;message=text;if(next!=='qr')qr='';};
  function status(){
    if(phase==='disconnected'&&!loadModules&&!dependenciesReady(runtimeDir))return {state:'missing_dependencies',message:MISSING_DEPENDENCIES};
    return {state:phase,message,...(phase==='qr'?{qr}:{})};
  }
  function retry(id,first){
    if(!optIn||id!==generation)return;
    if(attempt>=reconnectDelays.length){optIn=false;set('disconnected','The connection was lost. Press Connect to try again.');return;}
    const delay=first&&attempt===0?first:reconnectDelays[attempt];attempt++;
    set('connecting','Reconnecting…');
    timer=schedule(()=>{timer=null;if(optIn&&id===generation)void open();},delay);
  }
  async function open(){
    const id=++generation;cancel(timer);timer=null;stuck=false;set('connecting','Connecting…');
    try{mods=mods||await load();}catch{optIn=false;set('missing_dependencies',MISSING_DEPENDENCIES);return;}
    if(id!==generation||!optIn)return;
    try{
      const B=mods.baileys,makeWASocket=B.makeWASocket||B.default;
      mkdirSync(sessionDir,{recursive:true,mode:0o700});
      const {state:auth,saveCreds}=await B.useMultiFileAuthState(sessionDir);
      let version;try{version=(await B.fetchLatestBaileysVersion?.())?.version;}catch{}
      if(id!==generation||!optIn)return;
      const s=makeWASocket({...(version?{version}:{}),auth,logger:mods.pino({level:'silent'}),printQRInTerminal:false,browser:['Seravillas Jarvis','Chrome','120.0'],syncFullHistory:false,markOnlineOnConnect:false,shouldSyncHistoryMessage:()=>false,getMessage:async()=>({conversation:''})});
      sock=s;
      /* A failed credential save stops this connection with a clear message instead of an unhandled rejection. */
      s.ev.on('creds.update',()=>{Promise.resolve().then(()=>saveCreds()).catch(()=>{if(s!==sock)return;optIn=false;generation++;cancel(timer);timer=null;sock=null;try{s.end?.(undefined);}catch{}set('error','Jarvis could not save the WhatsApp link on this computer, so it disconnected. Nothing was sent.');});});
      s.ev.on('connection.update',update=>void onUpdate(s,id,update));
      s.ev.on('messages.upsert',event=>void onUpsert(s,id,event));
    }catch{sock=null;set('error','WhatsApp could not start. Check the setup, then press Connect again.');retry(id);}
  }
  async function onUpdate(s,id,update={}){
    if(id!==generation||s!==sock)return;
    if(update.qr){
      try{const image=await mods.qrcode.toDataURL(update.qr,{margin:1,width:256});if(id===generation&&s===sock&&phase!=='open'){phase='qr';qr=image;message='On the business phone open WhatsApp → Linked devices → Link a device, then scan this code.';}}
      catch{set('error','The pairing code could not be shown.');}
    }
    if(update.connection==='open'){attempt=0;set('open','Connected as a linked device.');}
    if(update.connection==='close'){
      sock=null;const code=update.lastDisconnect?.error?.output?.statusCode;
      if(code!==undefined&&code===mods.baileys.DisconnectReason?.loggedOut){optIn=false;set('logged_out','WhatsApp ended this linked device. Link it again from the phone to reconnect.');return;}
      if(!optIn){set('disconnected','Not connected.');return;}
      retry(id,code===515?1000:undefined);
    }
  }
  async function onUpsert(s,id,{messages,type}={}){
    const live=()=>optIn&&id===generation&&s===sock;
    if(!live()||(type!=='notify'&&type!=='append'))return;
    for(const raw of (Array.isArray(messages)?messages:[]).slice(0,50)){
      const event=normalizeMessage(raw);if(!event)continue;
      if(chatKind(event.chatJid)==='group')event.groupName=await groupName(s,event.chatJid);
      /* Disconnect may happen while the group name was being fetched: nothing from a stale socket is ingested. */
      if(!live())return;
      try{onMessage(event);}catch{}
    }
  }
  async function groupName(s,jid){
    if(groupNames.has(jid))return groupNames.get(jid);
    let name='';try{name=clip((await s.groupMetadata(jid))?.subject,80);}catch{}
    if(groupNames.size>=200)groupNames.delete(groupNames.keys().next().value);
    groupNames.set(jid,name);return name;
  }
  async function connect(){
    if(!sessionDir){set('error','The private WhatsApp folder could not be found on this computer.');return status();}
    optIn=true;attempt=0;
    if(!sock&&phase!=='connecting')await open();
    return status();
  }
  /* Closes this socket only. The device stays linked on the phone until removed there; saved credentials are kept. */
  async function disconnect(){
    optIn=false;generation++;cancel(timer);timer=null;stuck=false;
    const s=sock;sock=null;try{s?.end?.(undefined);}catch{}
    set('disconnected','Disconnected. The linked device stays listed on the phone until you remove it there.');
    return status();
  }
  /* All sends share one queue across every chat: overlapping sendMessage calls on one socket can mix up payloads.
     If WhatsApp never answers, that send times out (uncertain) and every later send is refused until
     Disconnect/Connect, so a hung call can never overlap a new one. */
  let sendChain=Promise.resolve(),stuck=false;
  function sendText(jid,text){
    if(!chatKind(jid)||typeof text!=='string'||!text.trim())return Promise.reject(Object.assign(Error('Invalid send'),{code:'INVALID_SEND'}));
    const queuedFor=generation;
    const run=sendChain.then(async()=>{
      /* Disconnected or reconnected while this send waited: refuse rather than send on a different connection. */
      if(queuedFor!==generation||stuck||!sock||phase!=='open')throw Object.assign(Error('Not connected'),{code:'NOT_CONNECTED'});
      const s=sock;let timeout;
      try{
        const result=await Promise.race([s.sendMessage(jid,{text}),new Promise((_,reject)=>{timeout=setTimeout(()=>{stuck=true;reject(Object.assign(Error('timeout'),{code:'TIMEOUT'}));},sendTimeoutMs);})]);
        return {id:clip(result?.key?.id,128)};
      }finally{clearTimeout(timeout);}
    });
    sendChain=run.catch(()=>{});
    return run;
  }
  return {status,connect,disconnect,sendText};
}
