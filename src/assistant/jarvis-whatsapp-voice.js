/* Conversational WhatsApp tools. The AI may resolve an owner's request into a bounded intent.
   Only explicit owner words can approve sending. Incoming-message AI drafting remains off. */
(function(){
  const API='/api/jarvis/whatsapp/',KEY=/^[a-f0-9]{20}$/;
  const normal=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
  const tidy=s=>String(s||'').trim().replace(/[.!?]+$/,'').replace(/^["“'‘]|["”'’]$/g,'').trim();
  function parse(input){
    let t=String(input||'').trim();if(!t||t.length>2200)return null;
    t=t.replace(/^(?:okay|ok)[,.!\s]+/i,'').replace(/^(?:(?:hi|hey|hello)[,\s]+)?jarvis[,!.\s]+/i,'').replace(/^(?:good morning[,\s]+)?(?:please\s+)?(?:(?:can|could|would|will) you\s+|i (?:want|need) you to\s+|i(?:['’]d| would) like (?:you )?to\s+)?(?:please\s+)?/i,'');
    if(/^(?:yes[,\s]+)?(?:please\s+)?approve and send(?: (?:it|the message|the reply))?[.!]?$/i.test(t))return {kind:'approve'};
    if(/^(?:cancel|discard)(?: (?:it|that|the (?:draft|message|reply)))?[.!]?$/i.test(t))return {kind:'cancel'};
    if(/^(?:read (?:the |my )?draft(?: again)?|repeat (?:the |my )?draft|review (?:it|the draft|the message)(?: again)?)[.!]?$/i.test(t))return {kind:'review'};
    if(/^(?:yes[,\s]*)?(?:send (?:it|that|now|the message)|confirm|approved?|yes)[.!]?$/i.test(t))return {kind:'ambiguousApproval'};
    /* Split before interpreting intent: even "approve and send" inside a dictated message is just text. */
    const split=t.match(/^(.*?)(?:\s+saying\s*:?\s*|\s+that says\s*:?\s*|\s*:\s*)([\s\S]*)$/i),head=(split?split[1]:t).replace(/\s+(?:on|in) whats\s?app[.!?]?$/i,'');
    if(/^(?:don['’]?t|do not|never|if|maybe|perhaps|he said|she said)\b/i.test(head)||/^["“'‘]/.test(t))return null;
    let m=head.match(/^(?:write|draft|prepare|send)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:whats\s?app\s+)?(?:message|reply|text)\s+(?:to|for)\s+(?:the\s+)?(group\s+)?(.+?)[.!?]?$/i);
    if(m)return {kind:'write',name:tidy(m[2]),group:!!m[1],text:split?split[2].trim():''};
    const readText=head.replace(/\s+(?:out loud|aloud|for me)[.!?]?$/i,'');
    if(!split&&/\b(?:unanswered|awaiting|waiting for (?:my|our|a) (?:reply|response)|(?:havent|haven['’]t|have not|didnt|didn['’]t|did not) (?:answered|answer|replied|reply))\b/i.test(t)&&/\b(?:whats\s?app|messages|requests|chats)\b/i.test(t))return {kind:'awaiting'};
    if(!split&&/^(?:read|check|show)(?: me)? (?:my |the )?(?:last|latest|most recent) (?:received |incoming |whats\s?app )?message(?: (?:on|in|from) whats\s?app)?[.!?]?$/i.test(readText))return {kind:'recent',limit:1};
    if(!split&&/\b(?:unread|new messages)\b/i.test(t)&&/\b(?:whats\s?app|messages)\b/i.test(t))return {kind:'unread'};
    if(!split&&/^(?:(?:do (?:we|i) have|are there) (?:any )?(?:whats\s?app )?messages|(?:read|read out|read aloud|read out loud|check|show)(?: me)? (?:my |the )?(?:latest |recent |last )?(?:whats\s?app )?messages|read (?:my )?whats\s?app)(?: (?:on|in|from) whats\s?app)?[.!?]?$/i.test(readText))return {kind:'recent'};
    m=readText.match(/^(?:read|read out|read out loud|read aloud|show|check|what (?:are|were))\s+(?:me\s+)?(?:the\s+|my\s+)?(?:last\s+|latest\s+|recent\s+)?(?:whats\s?app\s+)?messages?\s+(?:from|with|in|for)\s+(?:the\s+)?(group\s+)?(.+?)[.!?]?$/i);
    if(!m)m=readText.match(/^(?:read|read out|read out loud|read aloud|show|check)\s+(?:me\s+)?(?:the\s+)?(group\s+)?(.+?)(?:['’]s)?\s+(?:whats\s?app\s+)?messages?[.!?]?$/i);
    if(!m)m=readText.match(/^what did\s+(group\s+)?(.+?)\s+(?:say|write)[.!?]?$/i);
    if(m)return {kind:'read',name:tidy(m[2]),group:!!m[1],...(/\b(?:last|latest)\s+(?:whats\s?app\s+)?message\b/i.test(readText)?{limit:1}:{})};
    return null;
  }
  const words=m=>(m.kind==='group'?'In '+m.name+(m.sender?', '+m.sender:''):'From '+m.name)+': '+(m.text||m.media?.label||m.media||'Attachment, not downloaded.');
  function create({fetchImpl,getToken=()=>'',now=()=>Date.now(),onChange=()=>{}}={}){
    let token='',pending=null,lastRecipient=null,lastRead=null,epoch=0,request=null,busy=false;
    const snapshot=()=>pending?.stage==='review'?{stage:'review',name:pending.review.recipient.name,detail:pending.review.recipient.detail,text:pending.review.text,english:pending.english||'',language:pending.language||'',heard:pending.heard===true,understanding:pending.understanding===true}:pending?{stage:pending.stage,name:pending.name||''}:null;
    const changed=()=>onChange(snapshot());
    const reset=()=>{pending=null;changed();};
    async function api(action,{body,...params}={},signal){
      // The health and inbox endpoints share the same owner session token. Reuse the
      // authenticated connection rather than paying for another relay status round trip.
      if(!token)token=String(getToken()||'');
      if(!token){const r=await fetchImpl(API+'status',{cache:'no-store',signal});const s=await r.json();if(!r.ok||!s.available||!s.requestToken)throw Error(s.error||'The WhatsApp inbox is not connected.');token=s.requestToken;}
      const query=Object.entries(params).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
      const res=await fetchImpl(API+action+(query?'?'+query:''),{method:body?'POST':'GET',headers:{'X-Jarvis-Session-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal});
      const data=await res.json();if(signal?.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});if(!res.ok){if(res.status===403)token='';throw Object.assign(Error(data.error||'WhatsApp could not complete that.'),{status:res.status});}return data;
    }
    const reply=(text,afterSpoken=null)=>({handled:true,text,afterSpoken});
    function describe(){
      if(!pending||pending.stage!=='review')return reply('There is no message ready to approve. Say “Write a message to Bex.”');
      const p=pending;p.heard=false;p.understanding=false;changed();
      return reply('Message to '+p.review.recipient.name+', '+p.review.recipient.detail+'. '+p.review.text.replace(/[.!?]+$/,'')+'. '+(p.english?'In English: '+p.english.replace(/[.!?]+$/,'')+'. ':'')+'Say “Approve and send” to send this exact message, or “Cancel.”',()=>{if(pending===p&&now()<p.review.expiresAt){p.heard=true;changed();}});
    }
    async function review(chat,text,signal,translation={}){
      const r=await api('review',{body:{chat:chat.key,version:chat.version,text,checkedPhone:false}},signal);
      pending={stage:'review',name:chat.name,key:chat.key,version:chat.version,review:r,heard:false,english:String(translation.english||'').slice(0,2000),language:String(translation.language||'').slice(0,12)};changed();return describe();
    }
    async function find(intent,data){
      if(intent.chat){const chat=(data.chats||[]).find(c=>c.key===intent.chat&&(!intent.group||c.kind==='group'));return chat||reply('That chat is no longer available. Who should I contact?');}
      const list=(data.chats||[]).filter(c=>normal(c.name)===normal(intent.name)&&(!intent.group||c.kind==='group'));
      if(list.length===1)return list[0];
      const spokenKey=s=>normal(s).replace(/cks/g,'x').replace(/[^\p{L}\p{N}]/gu,'');
      const choices=(list.length?list:(data.chats||[]).filter(c=>spokenKey(c.name)===spokenKey(intent.name)&&(!intent.group||c.kind==='group'))).slice(0,5);
      if(!choices.length){reset();return reply('I cannot find a chat named '+intent.name+' in the received WhatsApp inbox. Say its name as shown in WhatsApp.');}
      pending={stage:'choose',intent,choices};changed();return reply((list.length?'There is more than one chat named '+intent.name+'. ':'I could not find that exact name. Did you mean one of these? ')+choices.map((c,i)=>'Option '+(i+1)+': '+c.name+', '+c.detail).join('. ')+'. Say the option number.');
    }
    async function selected(intent,chat,signal){
      lastRecipient={key:chat.key,name:chat.name,kind:chat.kind,detail:chat.detail};
      if(intent.kind==='write'){
        if(!intent.text){pending={stage:'body',name:chat.name,key:chat.key,language:intent.language||''};changed();return reply('What should I say to '+chat.name+'?');}
        return review(chat,intent.text,signal,intent);
      }
      const history=intent.kind==='history',limit=Math.min(10,Math.max(1,intent.limit|| (history?10:1))),offset=intent.offset||0;
      const data=await api('inbox',{chat:chat.key,view:'history',limit,offset,direction:intent.direction||(history?'both':'incoming'),query:intent.query},signal);
      const all=(data.chat?.messages||[]).filter(m=>(history||intent.direction==='both'||intent.direction==='outgoing'?intent.direction!=='outgoing'||m.from==='owner':m.from==='contact')&&(!intent.query||normal(m.text).includes(normal(intent.query))));
      const messages=data.page?all:offset>=all.length?[]:all.slice(Math.max(0,all.length-offset-limit),all.length-offset);
      if(!messages.length)return reply('There are no matching messages in this stored window for '+chat.name+'. Older WhatsApp history is not imported.');
      reset();lastRead={kind:intent.kind,chat:chat.key,limit,offset,direction:intent.direction|| (history?'both':'incoming')};return readResult(messages.map(m=>({...m,name:chat.name,chat:chat.key,kind:chat.kind})),signal,history?'Here is part of your conversation with '+chat.name+'. ':'Here '+(messages.length===1?'is the latest message':'are the latest '+messages.length+' messages')+' from '+chat.name+'. ',{kind:intent.kind,total:data.page?.total??all.length,offset,nextOffset:data.page?data.page.nextOffset:offset+messages.length<all.length?offset+messages.length:null,coverage:data.coverage});
    }
    function readResult(messages,signal,prefix,metadata={}){
      const ids=messages.filter(m=>m.from!=='owner').map(m=>m.id).filter(id=>KEY.test(id||''));
      return {...reply(prefix+messages.map(m=>m.from==='owner'?'You: '+m.text:words(m)).join('\n'),async()=>{if(ids.length)try{await api('read',{body:{messages:ids.slice(0,10)}},signal);}catch{}}),reading:{kind:'read',...metadata,messages:messages.map(m=>({name:m.name,chat:m.chat,kind:m.kind,from:m.from||'contact',sender:m.sender||'',text:m.text||'',media:typeof m.media==='object'?m.media?.label:m.media||'',at:m.at||0,truncated:m.truncated===true}))}};
    }
    async function handle(text,{screenApproval=false,intent:resolved}={}){
      const literal=parse(text);
      // Approval, vague consent and cancellation always come from the owner's literal utterance.
      const control=['approve','cancel'].includes(literal?.kind)||literal?.kind==='ambiguousApproval'&&pending?.stage==='review';
      const intent=control?literal:resolved||literal;
      if(resolved&&!control&&!['write','read','recent','unread','history','awaiting','body','edit','choose','review','cancel'].includes(resolved.kind))return reply('I could not interpret that action safely. What would you like to do?');
      if(!intent&&!pending)return {handled:false};
      if(busy)return reply('I am still completing the previous WhatsApp request. Please wait.');
      const myEpoch=++epoch;request?.abort();const controller=new AbortController();request=controller;const signal=controller.signal;
      const timer=setTimeout(()=>controller.abort(),65000),current=()=>myEpoch===epoch&&!signal.aborted;
      busy=true;
      try{
        let result;
        if(intent?.kind==='cancel'){reset();result=reply('Cancelled. Nothing was sent.');}
        else if(intent?.kind==='review')result=describe();
        else if(intent?.kind==='approve'){
          const p=pending;
          if(!p||p.stage!=='review')return reply('There is no reviewed message to send. Say “Write a message to Bex.”');
          if(p.understanding)return reply('First let me finish understanding your latest request, then review the message again. Nothing was sent.');
          if(now()>=p.review.expiresAt){reset();return reply('This review expired. Please dictate the message again. Nothing was sent.');}
          if(!screenApproval&&!p.heard)return reply('First let me read the recipient and draft completely. Say “Read the draft again,” or review and approve it on screen.');
          /* Consume before making the single send call. Even an uncertain result can never be replayed. */
          reset();let r;
          try{r=await api('send',{body:{chat:p.key,reviewToken:p.review.reviewToken,text:p.review.text}},signal);}
          catch(err){return myEpoch===epoch?reply([400,403,404,409,415,429].includes(err.status)?'Not sent. '+err.message:'I could not confirm whether it was sent. Check WhatsApp on your phone before sending again.'):null;}
          result=reply(r.status==='sent'?'Sent to '+p.review.recipient.name+'.':r.status==='uncertain'?'I could not confirm whether it was sent. Check WhatsApp on your phone before sending again.':r.message||'The message was not sent.');
        }else if(intent?.kind==='ambiguousApproval')result=reply(pending?.stage==='review'?'To send the reviewed message, say exactly “Approve and send,” or say “Cancel.”':'There is no reviewed message to send.');
        else if(intent?.kind==='body'||intent?.kind==='edit'||!intent&&pending?.stage==='body'){
          if(!pending||!(intent?.kind==='edit'?pending.stage==='review':pending.stage==='body'))return reply('Who should I write to, and what would you like to say?');
          const body=String(intent?.text??text).replace(/^(?:say|saying)\s+/i,'').trim();if(!body||body.length>2000)return reply('Keep the message between one and 2000 characters. What should I say?');
          const data=await api('inbox',{chat:pending.key,view:'voice'},signal);if(!current())return null;
          if(!data.chat){reset();return reply('That chat is no longer available. Nothing was sent.');}result=await review(data.chat,body,signal,{...intent,language:intent?.language||pending.language});
        }else if(intent?.kind==='choose'||!intent&&pending?.stage==='choose'){
          if(pending?.stage!=='choose')return reply('There is no contact choice pending. Who would you like to contact?');
          const option=normal(text).replace(/[.!]/g,'').match(/^(?:option )?(1|2|3|4|5|one|two|three|four|five)$/),n=intent?.kind==='choose'?intent.option:option?(['one','two','three','four','five'].indexOf(option[1])+1||Number(option[1])):0;
          if(!n||!pending.choices[n-1])return reply('Please say a listed option number, or “Cancel.”');
          const p=pending;reset();result=await selected(p.intent,p.choices[n-1],signal);
        }else if(!intent){reset();return {handled:false};}
        else{
          reset();const scoped=['recent','unread','awaiting'].includes(intent.kind),data=await api('inbox',scoped?{view:intent.kind,limit:Math.min(intent.kind==='awaiting'?8:10,intent.limit||(intent.kind==='recent'?1:5)),offset:intent.offset||0,direction:intent.direction||'incoming'}:{view:'voice'},signal);if(!current())return null;
          if(data.connection?.state!=='open')return reply('WhatsApp is not connected right now. '+(data.connection?.message||'Check the Jarvis PC.'));
          if(intent.kind==='write'||intent.kind==='read'||intent.kind==='history'){
            const chat=await find(intent,data);if(!current())return null;result=chat.handled?chat:await selected(intent,chat,signal);
          }else if(intent.kind==='awaiting'){
            if(!Array.isArray(data.candidates)&&!Array.isArray(data.awaiting))return reply('The PC inbox needs the latest update before I can check unanswered chats.');
            const offset=intent.offset||0,limit=Math.min(8,intent.limit||5),candidates=data.candidates||data.awaiting.slice(offset,offset+limit);
            lastRecipient=candidates.length===1?{key:candidates[0].key,name:candidates[0].name,kind:candidates[0].kind}:null;
            result={...reply(candidates.length?'These chats may need a reply: '+candidates.map(c=>c.name).join(', ')+'. A last incoming message is a candidate, not proof of an unanswered request.':'There are no chats awaiting a reply in this stored inbox window.'),reading:{kind:'awaiting',candidates,candidateCount:data.page?.total??data.awaitingCount??0,covered:candidates.length,offset,nextOffset:data.page?data.page.nextOffset:offset+candidates.length<data.awaiting.length?offset+candidates.length:null,coverage:data.coverage}};
          }else{
            const limit=Math.min(10,intent.limit||(intent.kind==='recent'?1:5));
            const latest=intent.direction==='outgoing'?(data.latestOutgoing||data.latestMessages||[]).filter(m=>m.from==='owner'):intent.direction==='both'?(data.latestMessages||[]):(data.latestIncoming||data.recentMessages||data.recent||[]);
            const messages=data.messages||(intent.kind==='unread'?(data.unread||[]).slice(0,limit):latest.slice(0,limit).reverse());
            if(!messages.length){
              /* Existing inbox content remains readable even when it predates unread tracking. */
              if(intent.kind==='recent'&&(data.chats||[]).length){
                const chat=(data.chats||[])[0];result=await selected({kind:'read'},chat,signal);
              }else result=reply('There are no '+(intent.kind==='unread'?'unread':'received')+' messages in the Jarvis inbox. Older WhatsApp history and phone read status are not synced.');
            }else{if(messages.length===1){const m=messages[0];lastRecipient={key:m.chat,name:m.name,kind:m.kind};}result=readResult(messages,signal,intent.kind==='unread'?'You have '+(data.page?.total??data.unreadCount)+' unread messages in Jarvis. ':'Here '+(messages.length===1?'is your latest WhatsApp message. ':'are your recent WhatsApp messages. '),{kind:intent.kind,total:data.page?.total??(intent.kind==='unread'?data.unreadCount:messages.length),nextOffset:data.page?.nextOffset??null,coverage:data.coverage});}
          }
        }
        return current()?result:null;
      }catch(err){if(myEpoch===epoch){reset();return reply(signal.aborted?'The WhatsApp inbox did not answer in time. Please try again.':err.message||'I could not reach the WhatsApp inbox.');}return null;}
      finally{clearTimeout(timer);if(myEpoch===epoch){busy=false;request=null;}}
    }
    const contact=c=>c?{key:c.key,name:c.name,kind:c.kind,detail:c.detail}:null;
    return {handle,describe,snapshot,get busy(){return busy;},hasPending:()=>!!pending,
      context:()=>({stage:pending?.stage||null,recipient:pending?contact(pending.stage==='choose'?null:{...lastRecipient,key:pending.key,name:pending.name}):null,lastRecipient:contact(lastRecipient),draft:pending?.stage==='review'?pending.review.text:'',english:pending?.english||'',language:pending?.language||'',lastRead,requestedName:pending?.intent?.name||'',choices:pending?.stage==='choose'?pending.choices.map(contact):[]}),
      suspendApproval(){if(pending?.stage==='review'){pending.heard=false;pending.understanding=true;changed();}},
      finishUnderstanding(){if(pending?.stage==='review'){pending.understanding=false;changed();}},
      observe(data){if(pending?.stage==='review'){const c=(data.chats||[]).find(c=>c.key===pending.key);if(c&&c.version!==pending.version){reset();return true;}}return false;},
      clearPending(){epoch++;request?.abort();request=null;busy=false;reset();},
      cancel(){lastRecipient=null;epoch++;request?.abort();request=null;busy=false;reset();}};
  }
  window.SV_JARVIS_WHATSAPP_VOICE=Object.freeze({create,parse});
})();
