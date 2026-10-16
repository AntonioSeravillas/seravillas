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
  /* PCM over authenticated NDJSON works without MediaSource/MP3 streaming support on iPhone.
     End-of-network is not end-of-playback: completion waits for every source's actual ended event. */
  function createStreamingPlayer({request,onStart=()=>{},onDone=()=>{},onError=()=>{},makeContext=()=>new (window.AudioContext||window.webkitAudioContext)(),decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0)),schedule=setTimeout,clear=clearTimeout}={}){
    let context=null,turn=0,controller=null,active=false;const sources=new Set(),timers=new Set();
    const later=(fn,ms)=>{const timer=schedule(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;};
    function stop(){turn++;controller?.abort();controller=null;active=false;for(const t of timers)clear(t);timers.clear();for(const s of sources){s.onended=null;try{s.stop();s.disconnect();}catch{}}sources.clear();}
    function prepare(){try{if(!context||context.state==='closed')context=makeContext();const ready=context.resume();const source=context.createBufferSource();source.buffer=context.createBuffer(1,1,24000);source.connect(context.destination);source.onended=()=>source.disconnect();source.start();return Promise.resolve(ready);}catch{return Promise.resolve();}}
    async function play(text){
      stop();const id=turn;controller=new AbortController();const signal=controller.signal;active=true;
      let networkDone=false,started=false,nextAt=0,frameCount=0;
      const current=()=>id===turn;
      const finish=()=>{if(current()&&networkDone&&frameCount>0&&!sources.size){stop();onDone();}};
      const fail=message=>{if(current()){stop();onError(message);}};
      try{
        if(!context||context.state==='closed')throw Error('Tap Play reply to enable the speaker on this device.');
        if(context.state!=='running')await Promise.race([context.resume(),new Promise((_,reject)=>later(()=>reject(Error('Tap Play reply to enable audio.')),5000))]);
        if(!current())return;
        later(()=>fail('The voice reply did not finish. Tap Play reply to try again.'),180000);
        const parts=sections(text);if(!parts.length||parts.length>20)throw Error('The spoken reply is too long.');
        for(const part of parts){
          let response=await request(part,signal);if(!current())return;
          let seq=0,ended=false,total=0,segments=0;
          do{
          if(++segments>60)throw Error('The voice stream did not finish.');
          if(!response.ok){let data={};try{data=await response.json();}catch{}response.releaseSpeech?.();throw Error(data.error||'Fish free voice could not start.');}
          if(!response.body?.getReader||!String(response.headers.get('content-type')||'').startsWith('application/x-ndjson')){response.releaseSpeech?.();throw Error('The voice stream returned an unexpected format.');}
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',continued=false;
          function packet(item){
            if(!current())throw Object.assign(Error('Cancelled'),{name:'AbortError'});
            if(ended||continued)throw Error('Unexpected audio after completion.');
            if(item.type==='error')throw Error(typeof item.message==='string'?item.message:'The voice stream was interrupted.');
            if(item.type==='continue'){if(item.next!==seq||!response.resumeSpeech)throw Error('The voice stream cursor was invalid.');continued=true;return;}
            if(item.type==='end'){if(!seq||item.frames!==seq)throw Error('The voice reply was incomplete.');ended=true;return;}
            if(item.type!=='audio'||item.seq!==seq++||item.sampleRate!==24000||typeof item.audio!=='string'||item.audio.length>32768||!/^[A-Za-z0-9+/]+={0,2}$/.test(item.audio))throw Error('The voice stream contained an invalid frame.');
            const bytes=decode(item.audio);total+=bytes.length;if(!bytes.length||bytes.length%2||total>2880000)throw Error('The voice reply exceeded its audio limit.');
            const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),samples=new Float32Array(bytes.length/2);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
            const audio=context.createBuffer(1,samples.length,24000);audio.copyToChannel(samples,0);
            const source=context.createBufferSource();source.buffer=audio;source.connect(context.destination);sources.add(source);frameCount++;
            const at=Math.max(context.currentTime+.05,nextAt);nextAt=at+audio.duration;
            source.onended=()=>{sources.delete(source);source.disconnect();finish();};source.start(at);
            if(!started){started=true;later(()=>{if(current())onStart();},Math.max(0,(at-context.currentTime)*1000));}
          }
          try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.length>45000)throw Error('The voice stream frame was too large.');if(line)packet(JSON.parse(line));}if(buffer.length>45000)throw Error('The voice stream frame was too large.');}buffer+=decoder.decode();if(buffer.trim())packet(JSON.parse(buffer));if(!ended&&!continued)throw Error('The voice connection ended before the reply finished.');}
          finally{try{await reader.cancel();}catch{}reader.releaseLock();response.releaseSpeech?.();}
          if(continued){if(!current())return;response=await response.resumeSpeech(seq);}
          }while(!ended);
        }
        networkDone=true;finish();
      }catch(error){if(current())fail(error.message||'Fish free voice was interrupted.');}
    }
    return {prepare,play,stop,get active(){return active;},dispose(){stop();void context?.close?.();context=null;}};
  }
  window.SV_JARVIS_AUDIO=Object.freeze({createPlayer,createStreamingPlayer,sections});
})();
