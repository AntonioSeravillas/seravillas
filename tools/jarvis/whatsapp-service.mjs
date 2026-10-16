/* Local WhatsApp inbox for the Jarvis pilot: receive -> optional AI draft -> owner review -> approved send.
   Nothing here sends on its own. Received text and model output are stored and shown as data, never run as commands.
   The connector, draft generator, clock and store are injected so every rule is testable without WhatsApp. */
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';

export const LIMITS=Object.freeze({chats:100,messagesPerChat:30,seenIdsPerChat:300,ownSentPerChat:50,text:2000,draft:2000,name:80,queue:25,historyForDraft:12});

/* Only one-to-one chats and groups. Status updates, broadcasts, newsletters and anything else are refused. */
export function chatKind(jid){
  const j=String(jid||'');
  if(/^\d{5,20}@s\.whatsapp\.net$/.test(j)||/^\d{5,25}@lid$/.test(j))return 'direct';
  if(/^\d{5,30}(?:-\d{5,20})?@g\.us$/.test(j))return 'group';
  return null;
}
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
export const chatKeyFor=jid=>sha('chat:'+jid).slice(0,20);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clip=(value,max)=>String(value??'').replace(CONTROL,'').slice(0,max);
const fail=(status,message)=>Object.assign(new Error(message),{status,safe:true});
const sameHex=(a,b)=>{const x=Buffer.from(String(a),'hex'),y=Buffer.from(String(b),'hex');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
const MEDIA_TYPES=new Set(['image','video','audio','document','sticker']);
function cleanMedia(media){
  if(!media||typeof media!=='object'||!MEDIA_TYPES.has(media.type))return null;
  return {type:media.type,mimetype:clip(media.mimetype,80),sizeBytes:Math.max(0,Math.min(Number(media.sizeBytes)||0,4e9)),seconds:Math.max(0,Math.min(Number(media.seconds)||0,86400)),fileName:clip(media.fileName,80)};
}
const mediaLabel=m=>m?({image:'Photo',video:'Video',audio:'Voice or audio message',document:'Document',sticker:'Sticker'})[m.type]+' (not downloaded)':'';
/* Waiting-for-reply heuristics. Thanks/OK/emoji-only incoming text is an acknowledgement, not a request.
   Conservative: a question mark, any other word or a non-sticker attachment keeps the chat as a candidate. */
const ACK_WORDS=new Set('thanks thank you thx ty ta cheers ok okay okey k kk great perfect perfecto perfecta genial vale gracias muchas mil merci cool nice lovely brilliant awesome super noted received recibido got it sounds good all sorted fine bien todo muy de nada np sure'.split(' '));
export function isAcknowledgement(m){
  if(m?.media&&m.media.type!=='sticker')return false;
  const t=String(m?.text||'').normalize('NFC').toLowerCase();if(/[?¿]/.test(t))return false;
  const words=t.replace(/\bno (?:problem|problema|worries)\b/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
  return words.length<=6&&words.every(w=>ACK_WORDS.has(w));
}
const ASKS=/[?¿]|^(?:can|could|would|will) you\b|\b(?:please|por favor|puedes|podr[ií]as|need you to|let me know)\b/i;

/* In-memory store for tests and the sample flow. */
export function createMemoryStore(initial=null){
  let data=initial?JSON.parse(JSON.stringify(initial)):null,writes=0;
  return {load:()=>data?JSON.parse(JSON.stringify(data)):null,save(state){data=JSON.parse(JSON.stringify(state));writes++;},writes:()=>writes};
}
/* Private durable store: one JSON file written atomically (temp file, fsync, rename). Folder and file are created only on the first write. */
export function createFileStore(dir){
  const file=path.join(dir,'inbox.json');
  return {
    load(){if(!existsSync(file))return null;try{return JSON.parse(readFileSync(file,'utf8'));}catch{throw fail(503,'The local WhatsApp inbox file could not be read. Nothing was changed.');}},
    save(state){
      mkdirSync(dir,{recursive:true,mode:0o700});
      const temp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp',fd=openSync(temp,'w',0o600);
      try{writeFileSync(fd,JSON.stringify(state));fsyncSync(fd);}finally{closeSync(fd);}
      renameSync(temp,file);
    }
  };
}

export function createWhatsAppService({store,connector=null,generator=null,now=()=>Date.now(),reviewTtlMs=5*60_000,sendTimeoutMs=45_000,limits=LIMITS,newToken=()=>randomBytes(18).toString('base64url')}={}){
  if(!store)throw Error('A store is required.');
  const blank=()=>({format:1,settings:{accountConsent:false,modelConsent:false},chats:{}});
  let state=store.load();
  if(!state||typeof state!=='object'||!state.chats||!state.settings)state=blank();
  const persist=()=>store.save(state);
  /* Restart rules: an unfinished send becomes uncertain (never retried); approvals and unfinished drafts do not survive. */
  let repaired=false;
  for(const chat of Object.values(state.chats)){
    if(chat.lastSend?.status==='sending'){chat.lastSend={...chat.lastSend,status:'uncertain',acknowledged:false,error:'Jarvis restarted while sending. Check WhatsApp on the phone before replying again.'};repaired=true;}
    if(chat.review){chat.review=null;repaired=true;}
    if(chat.draft?.status==='generating'){chat.draft={...chat.draft,status:'failed',error:'Drafting stopped when Jarvis restarted.'};repaired=true;}
  }
  if(repaired)persist();

  const need=key=>{const chat=typeof key==='string'&&/^[a-f0-9]{20}$/.test(key)?state.chats[key]:null;if(!chat)throw fail(404,'That chat is no longer in the inbox.');return chat;};
  function invalidate(chat,reason){
    if(chat.draft&&!['discarded','stale'].includes(chat.draft.status))chat.draft={...chat.draft,status:'stale',reason};
    chat.review=null;chat.notice=reason;
  }
  function evict(){
    const chats=Object.values(state.chats);if(chats.length<=limits.chats)return;
    chats.filter(c=>c.lastSend?.status!=='sending').sort((a,b)=>a.updatedAt-b.updatedAt).slice(0,chats.length-limits.chats).forEach(c=>{delete state.chats[c.key];});
  }

  /* Normalised event from the connector. Our own echoes are recognised; the owner's own phone replies invalidate drafts. */
  function receive(event){
    const kind=chatKind(event?.chatJid);if(!kind)return {accepted:false,reason:'unsupported_chat'};
    const providerId=clip(event.providerId,128);if(!providerId)return {accepted:false,reason:'missing_id'};
    const text=clip(event.text,limits.text).trim(),media=cleanMedia(event.media);
    if(!text&&!media)return {accepted:false,reason:'empty'};
    const key=chatKeyFor(event.chatJid);
    let chat=state.chats[key];
    if(!chat)chat=state.chats[key]={key,jid:event.chatJid,kind,name:'',version:0,updatedAt:0,messages:[],seen:[],ownSent:[],draft:null,review:null,lastSend:null,notice:''};
    if(chat.seen.includes(providerId))return {accepted:false,reason:'duplicate'};
    chat.seen=[...chat.seen,providerId].slice(-limits.seenIdsPerChat);
    const fromMe=event.fromMe===true;
    /* An approved send may echo before its own result arrives; same text while sending counts as the echo. */
    const echo=fromMe&&(chat.ownSent.includes(providerId)||(chat.lastSend?.status==='sending'&&chat.lastSend.text===text));
    if(echo){chat.ownSent=[...chat.ownSent,providerId].slice(-limits.ownSentPerChat);persist();return {accepted:false,reason:'own_send_echo'};}
    if(kind==='group'&&event.groupName)chat.name=clip(event.groupName,limits.name);
    if(kind==='direct'&&!fromMe&&event.senderName)chat.name=clip(event.senderName,limits.name);
    const at=Number(event.timestamp);
    chat.messages=[...chat.messages,{id:providerId,live:event.live!==false,unread:!fromMe&&event.live!==false,receivedAt:now(),from:fromMe?'owner':'contact',sender:kind==='group'&&!fromMe?clip(event.senderName,limits.name)||'Group member':'',participantKey:kind==='group'&&!fromMe&&event.participant?sha('member:'+event.participant).slice(0,12):'',text,media,at:Number.isFinite(at)&&at>0?Math.floor(at):Math.floor(now()/1000),viaJarvis:false}].sort((a,b)=>a.at-b.at||(a.receivedAt||0)-(b.receivedAt||0)).slice(-limits.messagesPerChat);
    chat.version+=1;chat.updatedAt=now();
    invalidate(chat,fromMe?'owner_reply':'new_message');
    evict();persist();
    if(!fromMe&&text)enqueue(key,false);
    return {accepted:true,chat:key,version:chat.version};
  }

  /* One generation at a time. A result for an older version is dropped, never written over newer state. */
  const queue=[];let running=null;
  function enqueue(key,manual){
    if(!generator||!state.settings.modelConsent)return false;
    if(!queue.some(item=>item.key===key)){if(queue.length>=limits.queue)queue.shift();queue.push({key,manual});}
    if(!running)running=(async()=>{while(queue.length){const item=queue.shift();try{await generate(item);}catch{}}})().finally(()=>{running=null;});
    return true;
  }
  async function generate({key,manual}){
    const chat=state.chats[key];if(!chat||!generator||!state.settings.modelConsent)return;
    const last=chat.messages.at(-1);
    if(!manual&&(!last||last.from!=='contact'||!last.text))return;
    if(chat.review||(!manual&&['ready','reviewed'].includes(chat.draft?.status)&&chat.draft.version===chat.version))return;
    const id=newToken(),version=chat.version;
    chat.draft={id,version,status:'generating',text:'',source:'model',error:'',at:now()};persist();
    let text='',error='';
    try{
      text=clip(await generator({chatKey:key,kind:chat.kind,messages:chat.messages.slice(-limits.historyForDraft).map(m=>({from:m.from,sender:m.sender,text:m.text,media:m.media?m.media.type:''}))}),limits.draft).trim();
      if(!text)error='The model returned an empty draft.';
    }catch(e){error=e?.safe?e.message:'No draft — the model could not be reached.';}
    const current=state.chats[key];
    if(!current||current.draft?.id!==id||current.draft.status==='discarded')return;
    /* Consent turned off while the model was working: the late result is discarded, never shown as ready. */
    if(!state.settings.modelConsent){current.draft={...current.draft,status:'discarded',text:'',error:'AI drafts were turned off.'};persist();return;}
    if(current.version!==version)return;
    current.draft={id,version,status:error?'failed':'ready',text,source:'model',error,at:now()};persist();
  }
  const idle=()=>running||Promise.resolve();

  function outgoing(text){
    const body=String(text??'').replace(/\r\n?/g,'\n').replace(CONTROL,'').trim();
    if(!body)throw fail(400,'Write a reply first.');
    if(body.length>limits.draft)throw fail(400,'The reply is too long. Keep it under '+limits.draft+' characters.');
    return body;
  }
  function recipient(chat){
    const ending=chat.kind==='direct'&&chat.jid.endsWith('@s.whatsapp.net')?chat.jid.split('@')[0].slice(-4):'';
    return {kind:chat.kind,name:chat.name||(chat.kind==='group'?'Unnamed group':'Unknown contact'),detail:chat.kind==='group'?'WhatsApp group':ending?'Direct chat · number ending '+ending:'Direct chat'};
  }
  /* Step 1: bind an approval to this chat, its current version and the exact text. Only a hash of the token is stored. */
  function review(key,{version,text,checkedPhone=false}={}){
    const chat=need(key);
    if(Number(version)!==chat.version)throw fail(409,'A newer message arrived. Read it, then review again.');
    if(chat.lastSend?.status==='sending')throw fail(409,'A reply for this chat is still being sent.');
    if(chat.lastSend?.status==='uncertain'&&!chat.lastSend.acknowledged){
      if(checkedPhone!==true)throw fail(409,'The last reply may or may not have been sent. Check WhatsApp on the phone and tick that you checked.');
      chat.lastSend={...chat.lastSend,acknowledged:true};
    }
    const body=outgoing(text),raw=newToken();
    chat.review={tokenHash:sha('review:'+raw),version:chat.version,textHash:sha(body),expiresAt:now()+reviewTtlMs};
    chat.draft={id:chat.draft?.id||newToken(),version:chat.version,status:'reviewed',text:body,source:chat.draft?.text===body?chat.draft.source:'owner',error:'',at:now()};
    chat.notice='';persist();
    return {reviewToken:raw,expiresAt:chat.review.expiresAt,version:chat.version,text:body,recipient:recipient(chat)};
  }
  /* Step 2: only the reviewed text goes to the stored chat. The token is consumed and "sending" is saved before any network call. */
  let sendBusy=false;
  async function send(key,{reviewToken,text}={}){
    /* One send at a time across all chats, refused before the approval is used, so no approved reply ever waits in a queue
       while newer messages arrive. */
    if(sendBusy)throw fail(429,'Another reply is still being sent. Wait for it to finish, then press Approve and send again.');
    const chat=need(key),approval=chat.review;
    if(!approval||typeof reviewToken!=='string'||!sameHex(sha('review:'+reviewToken),approval.tokenHash))throw fail(409,'This approval is no longer valid. Review the reply again.');
    chat.review=null;
    const refuse=message=>{persist();throw fail(409,message);};
    if(approval.expiresAt<now())refuse('This approval expired. Review the reply again.');
    if(approval.version!==chat.version)refuse('A newer message arrived. Review again.');
    let body;try{body=outgoing(text);}catch{refuse('The reply changed after review. Review it again.');}
    if(sha(body)!==approval.textHash)refuse('The reply changed after review. Review it again.');
    if(!connector){persist();throw fail(503,'WhatsApp is not connected, so nothing was sent.');}
    const sendId=newToken();
    chat.lastSend={id:sendId,version:approval.version,text:body,status:'sending',error:'',acknowledged:false,at:now()};
    persist();
    let outcome,timer;sendBusy=true;
    try{
      const result=await Promise.race([connector.sendText(chat.jid,body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('timeout'),{code:'TIMEOUT'})),sendTimeoutMs);})]);
      const providerId=clip(result?.id,128).trim();
      /* Without WhatsApp's message id there is no acknowledgement, so the outcome is uncertain, never "sent". */
      outcome=providerId?{status:'sent',providerId,error:''}:{status:'uncertain',error:'WhatsApp gave no confirmation. Check the phone before sending again.'};
    }catch(e){
      outcome=e?.code==='NOT_CONNECTED'||e?.code==='INVALID_SEND'?{status:'failed',error:'WhatsApp is not connected, so nothing was sent.'}
        :{status:'uncertain',error:e?.code==='TIMEOUT'?'WhatsApp did not confirm in time. Check the phone before sending again.':'The send may not have completed. Check the phone before sending again.'};
    }finally{clearTimeout(timer);sendBusy=false;}
    const current=state.chats[key];
    if(current&&current.lastSend?.id===sendId){
      current.lastSend={...current.lastSend,status:outcome.status,error:outcome.error,at:now()};
      if(outcome.status==='sent'){
        current.ownSent=[...current.ownSent,outcome.providerId].slice(-limits.ownSentPerChat);current.seen=[...current.seen,outcome.providerId].slice(-limits.seenIdsPerChat);
        current.messages=[...current.messages,{id:outcome.providerId,from:'owner',sender:'',participantKey:'',text:body,media:null,at:Math.floor(now()/1000),viaJarvis:true}].slice(-limits.messagesPerChat);
        /* Only the approved version's draft is finished; a newer draft (message arrived meanwhile) stays. */
        if(current.draft&&current.draft.version===approval.version)current.draft=null;
        current.updatedAt=now();
      }else if(outcome.status==='failed'&&current.draft&&current.draft.version===approval.version)current.draft={...current.draft,status:'ready'};
      persist();
    }
    return {status:outcome.status,message:outcome.status==='sent'?'Sent.':outcome.error};
  }
  function discardDraft(key){const chat=need(key);if(chat.draft)chat.draft={...chat.draft,status:'discarded'};chat.review=null;persist();return {ok:true};}
  function requestDraft(key){
    need(key);
    if(!generator)throw fail(503,'AI drafts are not available on this server.');
    if(!state.settings.modelConsent)throw fail(409,'Turn on AI drafts first.');
    enqueue(key,true);return {queued:true};
  }
  function setModelConsent({enabled,acknowledged}={}){
    if(enabled===true&&acknowledged!==true)throw fail(400,'Read and accept how AI drafting uses messages first.');
    if(enabled===true&&!generator)throw fail(503,'AI drafts are not available on this server.');
    state.settings={...state.settings,modelConsent:enabled===true};
    if(enabled!==true){
      queue.length=0;
      for(const chat of Object.values(state.chats))if(chat.draft?.status==='generating')chat.draft={...chat.draft,status:'discarded',text:'',error:'AI drafts were turned off.'};
    }
    persist();return {modelConsent:state.settings.modelConsent};
  }
  function connectionStatus(){
    const s=connector?connector.status():{state:'not_configured',message:'WhatsApp is not set up on this server.'};
    return {state:String(s.state||'disconnected'),message:clip(s.message,300),...(s.state==='qr'&&typeof s.qr==='string'&&s.qr.startsWith('data:image/')?{qr:s.qr}:{})};
  }
  async function connect({acceptRisk}={}){
    if(acceptRisk!==true)throw fail(400,'Confirm that you accept the linked-device risk first.');
    if(!connector)throw fail(503,'WhatsApp is not set up on this server.');
    state.settings={...state.settings,accountConsent:true,reconnect:true};persist();
    await connector.connect();return connectionStatus();
  }
  async function disconnect(){state.settings.reconnect=false;persist();if(connector)await connector.disconnect();return connectionStatus();}
  /* Resume only a previously authorised link. Explicit Disconnect survives a server restart. */
  async function resume(){if(connector&&state.settings.accountConsent===true&&state.settings.reconnect!==false)await connector.connect();}
  const readKey=(chat,m)=>sha('read:'+chat.key+':'+m.id).slice(0,20);
  function markRead({messages}={}){
    if(!Array.isArray(messages)||messages.length<1||messages.length>10||messages.some(id=>typeof id!=='string'||!/^[a-f0-9]{20}$/.test(id)))throw fail(400,'Choose up to ten received messages to mark read.');
    const ids=new Set(messages);let count=0;
    for(const chat of Object.values(state.chats))for(const m of chat.messages)if(m.unread===true&&ids.has(readKey(chat,m))){m.unread=false;count++;}
    if(count)persist();return {read:count};
  }
  function summary(chat){
    const last=chat.messages.at(-1);
    return {key:chat.key,...recipient(chat),version:chat.version,updatedAt:chat.updatedAt,unreadCount:chat.messages.filter(m=>m.unread===true).length,preview:last?(last.text||mediaLabel(last.media)).slice(0,140):'',lastFrom:last?.from||'',awaitingReply:last?.from==='contact',draftStatus:chat.draft?.status||'',sendStatus:chat.lastSend?.status||''};
  }
  function voiceInbox({chat:key='',view,limit=5,offset=0,direction='incoming',query=''}={}){
    if(!['voice','recent','unread','history','awaiting'].includes(view)||!Number.isInteger(limit)||limit<1||limit>10||!Number.isInteger(offset)||offset<0||offset>100||!['incoming','outgoing','both'].includes(direction)||typeof query!=='string'||query.length>120)throw fail(400,'Invalid message window.');
    const coverage={chats:Object.keys(state.chats).length,messagesPerChat:limits.messagesPerChat,scope:'Stored linked-device text only, up to '+limits.messagesPerChat+' messages per chat. Older phone history is not imported. Attachments are listed but not downloaded or transcribed. Waiting means a contact wrote after the last observed owner reply, not a guaranteed unanswered request. Chats ending only in thanks/OK/emoji are counted separately as acknowledgements.'};
    const project=(c,m,max=limits.text)=>({id:readKey(c,m),chat:c.key,name:recipient(c).name,kind:c.kind,from:m.from,sender:m.sender,text:clip(m.text,max),truncated:(m.text||'').length>max,media:mediaLabel(m.media),at:m.at,receivedAt:m.receivedAt||m.at*1000,unread:m.unread===true});
    const chats=Object.values(state.chats).sort((a,b)=>b.updatedAt-a.updatedAt),out={chats:chats.map(summary),coverage};
    if(view==='voice'){if(key)out.chat=summary(need(key));return out;}
    const page=all=>({total:all.length,offset,nextOffset:offset+limit<all.length?offset+limit:null});
    if(view==='awaiting'){
      const waiting=[],acknowledged=[];
      for(const c of chats){
        if(c.messages.at(-1)?.from!=='contact')continue;
        const owner=c.messages.findLastIndex(m=>m.from==='owner'),unanswered=c.messages.slice(owner+1).filter(m=>m.from==='contact');
        (unanswered.every(isAcknowledgement)?acknowledged:waiting).push({c,owner,unanswered,asks:unanswered.some(m=>ASKS.test(m.text||''))});
      }
      /* Questions/requests first, then direct chats before groups; newest first within each (stable sort). */
      waiting.sort((a,b)=>b.asks-a.asks||(a.c.kind==='group')-(b.c.kind==='group'));
      out.page=page(waiting);out.acknowledged={total:acknowledged.length,names:acknowledged.slice(0,5).map(x=>recipient(x.c).name)};
      out.candidates=waiting.slice(offset,offset+limit).map(({c,owner,unanswered,asks})=>({key:c.key,name:recipient(c).name,kind:c.kind,reason:asks?'asked':'last-message',waitingSince:unanswered[0]?.at??null,highlight:project(c,unanswered.findLast(m=>ASKS.test(m.text||''))||unanswered.findLast(m=>!isAcknowledgement(m))||unanswered.at(-1),700),lastOwner:owner>=0?project(c,c.messages[owner],300):null,messages:unanswered.slice(-3).map(m=>project(c,m,700))}));return out;
    }
    if(view==='history'){
      const c=need(key),all=c.messages.filter(m=>(direction==='both'||m.from===(direction==='outgoing'?'owner':'contact'))&&(!query||normalSearch(m.text).includes(normalSearch(query))));
      out.page=page(all);out.chat={...summary(c),messages:offset>=all.length?[]:all.slice(Math.max(0,all.length-offset-limit),all.length-offset).map(m=>project(c,m))};return out;
    }
    const all=chats.flatMap(c=>c.messages.filter(m=>view==='unread'?m.unread===true:direction==='both'||m.from===(direction==='outgoing'?'owner':'contact')).map(m=>project(c,m))).sort((a,b)=>b.at-a.at||b.receivedAt-a.receivedAt);
    out.page=page(all);out.messages=all.slice(offset,offset+limit).reverse();return out;
  }
  const normalSearch=s=>String(s||'').normalize('NFC').toLowerCase();
  function inbox({chat:key='',...options}={}){
    if(options.view)return voiceInbox({chat:key,...options});
    const unread=Object.values(state.chats).flatMap(c=>c.messages.filter(m=>m.unread===true).map(m=>({id:readKey(c,m),chat:c.key,name:recipient(c).name,kind:c.kind,sender:m.sender,text:m.text,media:mediaLabel(m.media),receivedAt:m.receivedAt||0}))).sort((a,b)=>a.receivedAt-b.receivedAt);
    const recent=Object.values(state.chats).flatMap(c=>c.messages.filter(m=>m.from==='contact'&&m.live===true).map(m=>({id:readKey(c,m),chat:c.key,name:recipient(c).name,kind:c.kind,sender:m.sender,text:m.text,media:mediaLabel(m.media),receivedAt:m.receivedAt||0,unread:m.unread}))).sort((a,b)=>b.receivedAt-a.receivedAt).slice(0,10);
    const recentMessages=Object.values(state.chats).flatMap(c=>c.messages.filter(m=>m.from==='contact').map(m=>({id:readKey(c,m),chat:c.key,name:recipient(c).name,kind:c.kind,sender:m.sender,text:m.text,media:mediaLabel(m.media),receivedAt:m.receivedAt||m.at*1000}))).sort((a,b)=>b.receivedAt-a.receivedAt).slice(0,5);
    const out={unreadCount:unread.length,unread:unread.slice(0,10),recent,recentMessages,unreadScope:'Messages received by Jarvis since unread tracking was enabled. Reading on the phone is not synchronised. Older WhatsApp history is not imported.',consent:{account:state.settings.accountConsent===true,model:state.settings.modelConsent===true,modelAvailable:!!generator},chats:Object.values(state.chats).sort((a,b)=>b.updatedAt-a.updatedAt).map(summary)};
    const chat=key&&/^[a-f0-9]{20}$/.test(key)?state.chats[key]:null;
    if(chat)out.chat={...summary(chat),notice:chat.notice||'',reviewOpen:!!chat.review,
      messages:chat.messages.map((m,i)=>({n:i,id:readKey(chat,m),from:m.from,sender:m.sender,member:m.participantKey,text:m.text,media:m.media?{type:m.media.type,label:mediaLabel(m.media),mimetype:m.media.mimetype,sizeBytes:m.media.sizeBytes,seconds:m.media.seconds}:null,at:m.at,viaJarvis:m.viaJarvis===true})),
      draft:chat.draft&&!['discarded'].includes(chat.draft.status)?{status:chat.draft.status,text:chat.draft.text,source:chat.draft.source,error:chat.draft.error,version:chat.draft.version}:null,
      lastSend:chat.lastSend?{status:chat.lastSend.status,error:chat.lastSend.error,acknowledged:chat.lastSend.acknowledged===true,at:chat.lastSend.at}:null};
    return out;
  }
  return {receive,review,send,discardDraft,requestDraft,setModelConsent,connect,disconnect,resume,markRead,connectionStatus,inbox,idle};
}
