/* One reusable media element: a user tap unlocks iPhone playback before an asynchronous reply.
   Every request and event belongs to one turn. Interrupt/close revokes audio and cancels pending work. */
(function(){
  const SILENCE='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
  function sections(text){
    const out=[];let rest=String(text||'').trim();
    while(rest){const limit=out.length?600:220;if(rest.length<=limit){out.push(rest);break;}let cut=rest.lastIndexOf('. ',limit);if(cut<(out.length?180:70))cut=rest.lastIndexOf(' ',limit);if(cut<1)cut=limit;else cut++;out.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}
    return out;
  }
  function createPlayer({request,onStart=()=>{},onDone=()=>{},onError=()=>{},makeAudio=()=>new Audio(),urlApi=URL,makeBlob=(bytes)=>new Blob([bytes],{type:'audio/mpeg'}),decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0)),schedule=setTimeout,clear=clearTimeout}={}){
    let audio=null,turn=0,controller=null,objectUrl='',timer=null,playing=false,preparation=null;const cache=new Map();
    function media(){if(!audio){audio=makeAudio();audio.preload='auto';audio.setAttribute?.('playsinline','');}return audio;}
    function clearTimer(){if(timer!==null){clear(timer);timer=null;}}
    function stop(){turn++;preparation?.finish();controller?.abort();controller=null;clearTimer();playing=false;
      if(audio){audio.onplaying=audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load?.();}
      if(objectUrl){urlApi.revokeObjectURL(objectUrl);objectUrl='';}
    }
    function prepare(){
      if(playing)return Promise.resolve();
      if(preparation)return preparation.promise;
      try{const a=media();if(a.src&&!a.src.startsWith('data:'))return Promise.resolve();const id=turn;
        let resolve;const p={promise:new Promise(r=>{resolve=r;}),timer:null,done:false};
        p.finish=()=>{if(p.done)return;p.done=true;clear(p.timer);if(preparation===p)preparation=null;if(id===turn&&!playing&&a.src===SILENCE)a.pause();resolve();};
        preparation=p;a.src=SILENCE;a.volume=1;p.timer=schedule(p.finish,1200);
        try{Promise.resolve(a.play()).then(p.finish,p.finish);}catch{p.finish();}return p.promise;
      }catch{return Promise.resolve();}
    }
    async function play(text){
      stop();const id=turn,a=media();controller=new AbortController();const signal=controller.signal;playing=true;
      const current=()=>id===turn;
      const fail=message=>{if(!current())return;stop();onError(message);};
      try{
        const parts=sections(text);let ahead=null;
        const load=async section=>{
          let payload=cache.get(section);
          if(!payload){payload=await request(section,signal);if(!current())return;
            if(payload?.contentType!=='audio/mpeg'||typeof payload.audio!=='string'||payload.audio.length<24||payload.audio.length>240000||!/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio))throw Error('The voice service returned invalid audio.');
            cache.set(section,payload);if(cache.size>12)cache.delete(cache.keys().next().value);
          }
          return payload;
        };
        // Generate at most one section ahead while the current one is actually playing.
        // Catch immediately so a cancelled/failed prefetch never becomes an unhandled error.
        const prefetch=section=>load(section).then(payload=>({payload}),error=>({error}));
        for(let index=0;index<parts.length;index++){
          const loaded=await (ahead||prefetch(parts[index]));ahead=null;if(loaded.error)throw loaded.error;const payload=loaded.payload;
          if(!current())return;
          if(objectUrl)urlApi.revokeObjectURL(objectUrl);
          objectUrl=urlApi.createObjectURL(makeBlob(decode(payload.audio)));a.src=objectUrl;a.volume=1;a.muted=false;
          await new Promise((resolve,reject)=>{
            let ended=false;const valid=()=>current()&&!ended;
            const finish=()=>{if(!valid())return;ended=true;clearTimer();resolve();};
            const failed=()=>{if(!valid())return;ended=true;clearTimer();reject(Error('Audio could not play. Tap Play reply to enable it on this device.'));};
            a.onplaying=()=>{if(!valid())return;clearTimer();onStart();if(!ahead&&index+1<parts.length)ahead=prefetch(parts[index+1]);timer=schedule(failed,90000);};
            a.onended=finish;a.onerror=failed;
            timer=schedule(failed,10000);try{a.play()?.catch(failed);}catch{failed();}
            /* Settle the promise on cancellation too; late events cannot affect another turn. */
            signal.addEventListener('abort',()=>{if(ended)return;ended=true;clearTimer();resolve();},{once:true});
          });
        }
        if(!current())return;stop();onDone();
      }catch(e){if(current())fail(e?.name==='AbortError'?'Voice playback was interrupted.':e.message||'The custom voice could not play. Choose Device voice in settings.');}
    }
    return {prepare,play,stop,get active(){return playing;},dispose(){stop();cache.clear();audio=null;}};
  }
  window.SV_JARVIS_AUDIO=Object.freeze({createPlayer,sections});
})();
