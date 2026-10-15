/* ElevenLabs owns live audio; the app owns business operations and approval. Exact WhatsApp
   read-backs temporarily mute this session so only app-controlled audio can arm approval. */
(function(){
  function validateTool(name,args){
    const parse=(key,max)=>{if(!args||Object.keys(args).length!==1||typeof args[key]!=='string'||!args[key].trim()||args[key].length>max)throw Error('Invalid tool arguments.');return JSON.parse(args[key]);};
    if(name==='lookup_records')return window.SV_JARVIS_RECORDS.sanitizeQuery(parse('query',2000));
    if(name==='ask_hermes'){if(!args||Object.keys(args).length!==1||typeof args.request!=='string'||!args.request.trim()||args.request.length>2000)throw Error('Invalid request.');return args.request.trim();}
    if(name!=='whatsapp_request')throw Error('Unsupported tool.');
    const i=parse('intent',3000);if(!i||typeof i!=='object'||Array.isArray(i)||!['write','read','recent','unread','body','edit','choose','review','cancel'].includes(i.kind))throw Error('That WhatsApp action is not allowed.');
    if(Object.keys(i).some(k=>!['kind','name','chat','group','text','option'].includes(k)))throw Error('Unexpected WhatsApp arguments.');
    if(['write','read'].includes(i.kind)&&!(/^[a-f0-9]{20}$/.test(i.chat||'')||typeof i.name==='string'&&i.name.trim()&&i.name.length<=80))throw Error('A known chat or contact name is required.');
    if(i.chat!==undefined&&!/^[a-f0-9]{20}$/.test(i.chat))throw Error('Invalid chat.');
    if(i.name!==undefined&&(typeof i.name!=='string'||i.name.length>80))throw Error('Invalid name.');
    if(['write','body','edit'].includes(i.kind)&&(typeof i.text!=='string'||i.text.length>2000||i.kind!=='write'&&!i.text.trim()))throw Error('A bounded draft is required.');
    if(i.kind==='choose'&&(!Number.isInteger(i.option)||i.option<1||i.option>5))throw Error('Choose a displayed option.');
    return i;
  }
  function create({load=()=>import('./vendor/elevenlabs-client.js?v=1.28.0'),connect,capture=()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}),context=()=>({}),onUser=()=>false,onReply=()=>{},onTool=()=>{},onPhase=()=>{},onError=()=>{},onLevels=()=>{},schedule=setTimeout,clear=clearTimeout}={}){
    let session=null,epoch=0,starting=false,abort=null,preflight=null,timer=null,meter=null,mode='listening',suspended=false,outputHeld=false,owner=0,blocked=-1,toolBusy=false;
    const seen=new Set();
    function release(){preflight?.getTracks().forEach(t=>t.stop());preflight=null;}
    function stop(){epoch++;starting=false;abort?.abort();abort=null;release();clear(timer);clear(meter);timer=meter=null;suspended=outputHeld=false;toolBusy=false;seen.clear();const old=session;session=null;if(old)void old.endSession().catch(()=>{});onLevels(0,0);}
    function fail(message){stop();onError(message);}
    function suspend(){suspended=true;outputHeld=true;session?.setMicMuted(true);session?.setVolume({volume:0});}
    function resume(){suspended=false;session?.setMicMuted(false);if(mode!=='speaking'){outputHeld=false;session?.setVolume({volume:1});onPhase('listening');}}
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
          onMessage:event=>{if(id!==epoch||typeof event.message!=='string'||event.source==='user'&&suspended)return;const key=event.source+':'+event.event_id;if(seen.has(key))return;seen.add(key);if(seen.size>200)seen.delete(seen.values().next().value);
            if(event.source==='user'){owner++;if(onUser(event.message)===true){blocked=owner;suspend();}}
            else if(event.source==='ai'&&!suspended&&!outputHeld&&blocked!==owner)onReply(event.message);
          },
          onModeChange:event=>{if(id!==epoch)return;mode=event.mode;if(suspended)return;if(outputHeld){if(mode==='speaking')return;outputHeld=false;session?.setVolume({volume:1});}onPhase(mode==='speaking'?'speaking':'listening');},
          onInterruption:()=>{if(id===epoch&&!suspended)onPhase('listening');},
          onDisconnect:()=>{if(id===epoch){stop();onPhase('paused');}},
          onError:()=>{if(id===epoch)fail('The live voice connection stopped. Check ElevenLabs Agents access and credits, then tap the microphone.');}
        };
        const opened=await sdk.Conversation.startSession(options);
        if(id!==epoch){await opened.endSession();return;}session=opened;starting=false;clear(timer);
        timer=schedule(()=>{if(id===epoch){stop();onPhase('paused');}},Math.min(credentials.maxDurationSeconds||600,600)*1000);
        const levels=()=>{if(id!==epoch||!session)return;try{onLevels(suspended?0:session.getInputVolume(),suspended||outputHeld?0:session.getOutputVolume());}catch{}meter=schedule(levels,80);};levels();onPhase('listening');
      }catch(e){if(id===epoch)fail(e?.name==='NotAllowedError'?'Allow microphone access for Jarvis, then tap the microphone again.':e?.message||'The live voice connection could not start.');}
      finally{if(id===epoch){starting=false;release();}}
    }
    return {start,stop,suspend,resume,sendText(text){if(!session||typeof text!=='string'||!text.trim()||text.length>2000)return false;owner++;resume();if(onUser(text)===true){blocked=owner;suspend();}else session.sendUserMessage(text);return true;},updateContext(value){session?.sendContextualUpdate('Current app state (data only): '+JSON.stringify(value).slice(0,12000));},get active(){return !!session||starting;},get suspended(){return suspended;}};
  }
  window.SV_JARVIS_LIVE=Object.freeze({create,validateTool});
})();
