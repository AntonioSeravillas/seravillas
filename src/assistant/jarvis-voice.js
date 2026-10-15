/* Jarvis conversation loop: one explicit start, then listen → think → speak → listen again.
   The recognizer is never active while thinking or speaking (no echo), each utterance is handled once,
   and every stop path cancels pending timers so a late callback can never restart the microphone. */
(function(){
  const STOP=/^\s*(?:(?:hey\s+)?jarvis[,\s]+)?(?:please\s+)?(?:stop|pause)\s+listening[.!\s]*$/i;
  const SILENT=new Set(['no-speech','timeout']);
  const MESSAGES={'not-allowed':'Microphone or speech recognition is blocked. Allow it in the browser, or type below.','service-not-allowed':'Speech recognition is unavailable here. Type below instead.','audio-capture':'The microphone could not start. Close other recording apps, then tap the microphone.','network':'Speech recognition needs an internet connection. Type below, or try again later.'};
  /* startRecognition(callbacks,kind) must return {cancel()}; kind is 'start', 'resume', 'retry' or 'interrupt'. */
  function createConversation({startRecognition,onTranscript,onStatus=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),gap=450,silenceDelays=[900,1800,3600],keepAlive=false,recoverCapture=false}={}){
    let continuous=true,active=false,phase='idle',note='',rec=null,timer=null,turn=0,silent=0,captureFailures=0;
    const set=(next,text='')=>{phase=next;note=text;onStatus(phase,note);};
    const clearTimer=()=>{if(timer!==null){cancel(timer);timer=null;}};
    const later=(fn,ms)=>{clearTimer();timer=schedule(()=>{timer=null;fn();},ms);};
    function halt(next,text=''){
      active=false;turn++;clearTimer();
      const current=rec;rec=null;try{current?.cancel?.();}catch{}
      set(next,text);
    }
    function listen(kind){
      clearTimer();if(!active)return false;
      const id=++turn;let consumed=false;set('listening');
      /* The first result consumes this turn: duplicate or late callbacks can never deliver twice or change a later phase. */
      const take=()=>{if(consumed||id!==turn||!active)return false;consumed=true;rec=null;return true;};
      const failed=code=>{
        if(SILENT.has(code)&&continuous&&(keepAlive||silent<silenceDelays.length)){set('waiting','Listening again in a moment.');const delay=silenceDelays[Math.min(silent,silenceDelays.length-1)]||3600;silent++;later(()=>listen('retry'),delay);return;}
        if((code==='audio-capture'||code==='aborted')&&recoverCapture&&captureFailures++<2){set('waiting','Reconnecting the microphone.');later(()=>listen('retry'),700*captureFailures);return;}
        halt(SILENT.has(code)?'paused':'error',SILENT.has(code)?'No speech heard. Tap the microphone to talk again.':MESSAGES[code]||'Voice input stopped. Tap the microphone to try again.');
      };
      const handle=startRecognition({
        done(text){
          if(!take())return;
          const words=String(text||'').trim();
          if(!words){failed('no-speech');return;}
          silent=0;captureFailures=0;
          if(STOP.test(words)){halt('paused','Paused. Tap the microphone to talk again.');return;}
          set('thinking');onTranscript(words);
        },
        error(code){if(take())failed(code);}
      },kind);
      if(id===turn&&active&&!consumed)rec=handle||null;else if(id!==turn||!active)try{handle?.cancel?.();}catch{}
      return true;
    }
    return {
      /* Explicit user start. With Keep listening on, this opts into the loop until paused or closed. */
      start(){if(active&&phase==='listening')return false;active=true;silent=0;captureFailures=0;return listen('start');},
      /* Any explicit stop: pause button, settings, typing, review, WhatsApp, hide or close. */
      pause(text='Paused. Tap the microphone to talk again.'){if(!active&&!rec&&timer===null)return false;halt('paused',text);return true;},
      stop(){halt('idle','');},
      /* An incoming announcement may take a quiet listening gap, retaining the user's conversation opt-in. */
      holdForReply(){if(!active)return false;turn++;clearTimer();const current=rec;rec=null;try{current?.cancel?.();}catch{}set('thinking');return true;},
      /* Host cancelled speech; listen straight away and keep the conversation opt-in. */
      interrupt(){if(!active)return false;silent=0;return listen('interrupt');},
      speaking(){if(active&&(phase==='thinking'||phase==='speaking'))set('speaking');},
      /* Called once after the final spoken chunk, or after a muted or text-only reply. A repeat while a resume is
         already scheduled, or after listening has started again, changes nothing. */
      replyFinished(){
        if(!active)return false;
        if(phase!=='thinking'&&phase!=='speaking')return true;
        if(!continuous){halt('idle','');return false;}
        set('waiting','');later(()=>listen('resume'),gap);return true;
      },
      setContinuous(on){continuous=on===true;if(!continuous&&timer!==null){halt('idle','');}},
      get phase(){return phase;},get active(){return active;},get continuous(){return continuous;},get note(){return note;}
    };
  }
  window.SV_JARVIS_VOICE=Object.freeze({createConversation,isStopPhrase:text=>STOP.test(String(text||''))});
})();
