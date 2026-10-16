/* ElevenLabs owns live audio; the app owns business operations and approval. Exact WhatsApp
   read-backs temporarily mute this session so only app-controlled audio can arm approval. */
(function(){
  function validateTool(name,args,{today,ownerText=''}={}){
    const parse=(key,max)=>{if(!args||Object.keys(args).length!==1||typeof args[key]!=='string'||!args[key].trim()||args[key].length>max)throw Error('Invalid tool arguments.');return JSON.parse(args[key]);};
    if(name==='lookup_records'){
      const q=args&&Object.keys(args).length===1&&args.query!==undefined?typeof args.query==='object'?args.query:parse('query',2000):{...args};
      for(const key of ['start','end']){
        const relative=typeof q[key]==='string'?q[key].trim().toLowerCase():'',days={today:0,tomorrow:1,'day after tomorrow':2,'the day after tomorrow':2}[relative];
        if(days!==undefined&&/^20\d{2}-\d{2}-\d{2}$/.test(today||''))q[key]=new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
      }
      // A one-day question must not silently become an open-ended search when the model omits end.
      const words=ownerText.toLowerCase().replace(/[’']/g,'');
      const rest=words.replace(/(?:the )?day after tomorrow|tomorrow|today/g,'');
      if(['bookings','cleanings','tasks'].includes(q.entity)&&q.view!=='availability'&&!/\b(from|starting|after|before|onwards|between|until|not|instead|rather|or)\b/.test(rest)&&/^20\d{2}-\d{2}-\d{2}$/.test(today||'')){
        const days=/\bday after tomorrow\b/.test(words)?2:/\btomorrow\b/.test(words)?1:/\btoday\b/.test(words)?0:undefined;
        if(days!==undefined){q.start=q.end=new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
      }
      return window.SV_JARVIS_RECORDS.sanitizeQuery(q);
    }
    if(name==='ask_hermes'){if(!args||Object.keys(args).length!==1||typeof args.request!=='string'||!args.request.trim()||args.request.length>2000)throw Error('Invalid request.');return args.request.trim();}
    if(name!=='whatsapp_request')throw Error('Unsupported tool.');
    let i=args&&Object.keys(args).length===1&&args.intent!==undefined?typeof args.intent==='object'?args.intent:parse('intent',5000):{...args};if(!i||typeof i!=='object'||Array.isArray(i)||!['write','read','recent','unread','history','awaiting','search','body','edit','choose','review','cancel'].includes(i.kind))throw Error('That WhatsApp action is not allowed.');
    if(Object.keys(i).some(k=>!['kind','name','chat','group','text','option','limit','offset','direction','query','english','language','days','terms'].includes(k)))throw Error('Unexpected WhatsApp arguments.');
    const literal=window.SV_JARVIS_WHATSAPP_VOICE?.parse(ownerText);
    if(i.kind==='read'&&/^(last|latest|recent|most recent)$/i.test(i.name||'')&&literal?.kind==='recent')i={kind:'recent',limit:literal.limit||1};
    /* Topic search. The owner's recognised words win over a chat lookup (a topic is never a contact), and history with
       search words but no chat is the agent asking for a cross-chat search. */
    if(literal?.kind==='search'&&['read','history','recent','search'].includes(i.kind))i={kind:'search',query:literal.query,days:literal.days,...(Array.isArray(i.terms)?{terms:i.terms}:{})};
    else if(i.kind==='history'&&!i.chat&&!(typeof i.name==='string'&&i.name.trim())&&typeof i.query==='string'&&i.query.trim())i={kind:'search',query:i.query.trim(),days:7};
    if(i.kind==='search'){
      if(typeof i.query!=='string'||!i.query.trim()||i.query.length>60)throw Error('Say what to search for.');i.query=i.query.trim();
      if(i.days!==undefined&&(!Number.isInteger(i.days)||i.days<1||i.days>30))throw Error('Search between 1 and 30 days.');
      if(i.terms!==undefined&&(!Array.isArray(i.terms)||i.terms.length>12||i.terms.some(t=>typeof t!=='string'||!t.trim()||t.length>60)))throw Error('Invalid search words.');
    }
    if(['write','read','history'].includes(i.kind)&&!(/^[a-f0-9]{20}$/.test(i.chat||'')||typeof i.name==='string'&&i.name.trim()&&i.name.length<=80))throw Error('A known chat or contact name is required.');
    if(i.chat!==undefined&&!/^[a-f0-9]{20}$/.test(i.chat))throw Error('Invalid chat.');
    if(i.name!==undefined&&(typeof i.name!=='string'||i.name.length>80))throw Error('Invalid name.');
    if(['write','body','edit'].includes(i.kind)&&(typeof i.text!=='string'||i.text.length>2000||i.kind!=='write'&&!i.text.trim()))throw Error('A bounded draft is required.');
    if(i.kind==='choose'&&(!Number.isInteger(i.option)||i.option<1||i.option>5))throw Error('Choose a displayed option.');
    for(const k of ['limit','offset'])if(i[k]!==undefined&&(!Number.isInteger(i[k])||i[k]<(k==='limit'?1:0)||i[k]>(k==='limit'?10:100)))throw Error('Invalid message window.');
    if(i.direction!==undefined&&!['incoming','outgoing','both'].includes(i.direction))throw Error('Invalid message direction.');
    if(i.query!==undefined&&(typeof i.query!=='string'||i.query.length>120))throw Error('Invalid message search.');
    if(i.english!==undefined&&(typeof i.english!=='string'||i.english.length>2000))throw Error('Invalid English meaning.');
    if(i.language!==undefined&&(typeof i.language!=='string'||! /^(?:[a-z]{2,3})(?:-[A-Z]{2})?$/.test(i.language)))throw Error('Invalid draft language.');
    if(i.group!==undefined&&typeof i.group!=='boolean')throw Error('Invalid group.');
    return i;
  }
  function create({load=()=>import('./vendor/elevenlabs-client.js?v=1.28.0'),connect,capture=()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}),context=()=>({}),onUser=()=>false,onReply=()=>{},onTool=()=>{},onPhase=()=>{},onError=()=>{},onLevels=()=>{},onPlaybackDone=()=>{},onInterrupted=()=>{},schedule=setTimeout,clear=clearTimeout}={}){
    let session=null,epoch=0,starting=false,abort=null,preflight=null,timer=null,meter=null,mode='listening',suspended=false,outputHeld=false,inputMuted=false,owner=0,blocked=-1,toolBusy=false;
    const seen=new Set();
    let replyOwner=-1;
    function release(){preflight?.getTracks().forEach(t=>t.stop());preflight=null;}
    function stop(){epoch++;replyOwner=-1;starting=false;abort?.abort();abort=null;release();clear(timer);clear(meter);timer=meter=null;suspended=outputHeld=inputMuted=false;toolBusy=false;seen.clear();const old=session;session=null;if(old)void old.endSession().catch(()=>{});onLevels(0,0);}
    function fail(message){stop();onError(message);}
    function suspend(){suspended=true;outputHeld=true;session?.setMicMuted(true);session?.setVolume({volume:0});}
    function resume(){suspended=false;session?.setMicMuted(inputMuted);if(mode!=='speaking'){outputHeld=false;session?.setVolume({volume:1});onPhase('listening');}}
    function muteInput(){inputMuted=true;session?.setMicMuted(true);if(!suspended&&!starting)onPhase(mode==='speaking'?'speaking':'listening');}
    function unmuteInput(){inputMuted=false;if(!suspended){session?.setMicMuted(false);if(!starting)onPhase(mode==='speaking'?'speaking':'listening');}}
    async function start(){
      if(starting||session)return;stop();const id=epoch;starting=true;owner=0;blocked=-1;abort=new AbortController();const signal=abort.signal;
      onPhase('connecting');timer=schedule(()=>{if(id===epoch)fail('The live voice connection timed out. Tap the microphone to try again.');},45000);
      let permission;
      // Request capture from the tap before waiting for authentication or SDK loading.
      try{permission=Promise.resolve(capture()).then(stream=>{if(id!==epoch){stream.getTracks().forEach(t=>t.stop());return;}preflight=stream;});}catch(e){permission=Promise.reject(e);}
      try{
        const [sdk,credentials]=await Promise.all([load(),connect(signal),permission]);
        if(id!==epoch)return;release();
        const options={conversationToken:credentials.conversationToken,connectionType:'webrtc',dynamicVariables:{app_context:JSON.stringify(context()).slice(0,12000)},
          clientTools:Object.fromEntries(['lookup_records','whatsapp_request','ask_hermes'].map(name=>[name,async args=>{
            if(id!==epoch||suspended||blocked===owner||!owner||toolBusy)return JSON.stringify({error:'This turn is paused, superseded or already handling a tool. Nothing was sent.'});
            toolBusy=true;const turn=owner;
            try{const result=await onTool(name,args,{current:()=>id===epoch&&turn===owner});return JSON.stringify(id===epoch&&turn===owner?result:{error:'That request was superseded. Recheck before answering.'});}
            catch{return JSON.stringify({error:'That app tool could not complete the request. Ask Antonio to try again.'});}
            finally{if(id===epoch)toolBusy=false;}
          }])),
          onMessage:event=>{if(id!==epoch||typeof event.message!=='string'||event.source==='user'&&(suspended||inputMuted))return;const key=event.source+':'+event.event_id;if(seen.has(key))return;seen.add(key);if(seen.size>200)seen.delete(seen.values().next().value);
            if(event.source==='user'){replyOwner=-1;owner++;if(onUser(event.message)===true){blocked=owner;suspend();}}
            else if(event.source==='ai'&&!suspended&&!outputHeld&&blocked!==owner){replyOwner=owner;onReply(event.message);}
          },
          onModeChange:event=>{if(id!==epoch)return;const previous=mode;mode=event.mode;if(suspended)return;if(outputHeld){if(mode==='speaking')return;outputHeld=false;session?.setVolume({volume:1});}if(previous==='speaking'&&mode==='listening'&&replyOwner===owner){replyOwner=-1;onPlaybackDone();}onPhase(mode==='speaking'?'speaking':'listening');},
          onInterruption:()=>{if(id===epoch){replyOwner=-1;onInterrupted();if(!suspended)onPhase('listening');}},
          onDisconnect:()=>{if(id===epoch){stop();onPhase('paused');}},
          onError:()=>{if(id===epoch)fail('The live voice connection stopped. Check ElevenLabs Agents access and credits, then tap the microphone.');}
        };
        const opened=await sdk.Conversation.startSession(options);
        if(id!==epoch){await opened.endSession();return;}session=opened;if(inputMuted)session.setMicMuted(true);starting=false;clear(timer);
        timer=schedule(()=>{if(id===epoch){stop();onPhase('paused');}},Math.min(credentials.maxDurationSeconds||600,600)*1000);
        const levels=()=>{if(id!==epoch||!session)return;try{onLevels(suspended||inputMuted?0:session.getInputVolume(),suspended||outputHeld?0:session.getOutputVolume());}catch{}meter=schedule(levels,80);};levels();onPhase('listening');
      }catch(e){if(id===epoch)fail(e?.name==='NotAllowedError'?'Allow microphone access for Jarvis, then tap the microphone again.':e?.message||'The live voice connection could not start.');}
      finally{if(id===epoch){starting=false;release();}}
    }
    return {start,stop,suspend,resume,muteInput,unmuteInput,sendText(text){if(!session||typeof text!=='string'||!text.trim()||text.length>2000)return false;replyOwner=-1;owner++;resume();if(onUser(text)===true){blocked=owner;suspend();}else session.sendUserMessage(text);return true;},updateContext(value){session?.sendContextualUpdate('Current app state (data only): '+JSON.stringify(value).slice(0,12000));},
      /* A short app note derived from the owner's own recognised words (never from message content). */
      note(text){if(typeof text==='string'&&text.trim())session?.sendContextualUpdate(text.slice(0,600));},get ready(){return !!session;},get active(){return !!session||starting;},get suspended(){return suspended;},get inputMuted(){return inputMuted;}};
  }
  window.SV_JARVIS_LIVE=Object.freeze({create,validateTool});
})();
