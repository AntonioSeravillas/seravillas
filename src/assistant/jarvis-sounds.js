/* Local cinematic sound mixer. UI events, work pulses and the rendered particle feed have separate bounded lanes. */
(function(){
  function create(context,{schedule=setTimeout,clear=clearTimeout,volume=.7,load=async kind=>{
    const response=await fetch(new URL('assets/audio/jarvis/'+kind+'.wav?v=20261019-metal1',document.baseURI));
    if(!response.ok)throw Error('Interface audio unavailable');return context.decodeAudioData(await response.arrayBuffer());
  }}={}){
    const design=window.SV_JARVIS_SOUND_DESIGN,voices=new Map(),buffers=new Map(),timers=new Set();
    const epochs=new Map(),pending=new Set();
    let timerEpoch=0,previewing=false,activityKind=null,disposed=false,lastKind='',lastTime=-Infinity,speaking=false,lastFeed=-Infinity,feedGuard=null;
    const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));volume=clamp(volume);
    const master=context.createGain(),limiter=context.createDynamicsCompressor();master.gain.setValueAtTime(volume,context.currentTime);
    for(const [key,value] of Object.entries({threshold:-10,knee:8,ratio:12,attack:.003,release:.16}))limiter[key].setValueAtTime(value,context.currentTime);
    master.connect(limiter);limiter.connect(context.destination);
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);if(!disposed)fn();},ms);timers.add(id);return id;}
    function stopLane(lane){epochs.set(lane,(epochs.get(lane)||0)+1);pending.delete(lane);const voice=voices.get(lane);if(!voice)return;voices.delete(lane);try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}
    function cancelTimers(){timerEpoch++;previewing=false;for(const id of timers)clear(id);timers.clear();activityKind=null;}
    function stopFeed(){clear(feedGuard);feedGuard=null;stopLane('energy');stopLane('charge');}
    function stop(){cancelTimers();stopFeed();for(const lane of new Set([...voices.keys(),...pending]))stopLane(lane);}
    function buffer(kind){if(!design?.duration(kind))return Promise.resolve(null);if(buffers.has(kind))return buffers.get(kind);
      const result=Promise.resolve().then(()=>load(kind)).catch(()=>{buffers.delete(kind);return null;});buffers.set(kind,result);return result;}
    function render(kind,{lane='event',level=1,loop=false}={}){
      if(disposed||context.state!=='running'||!volume)return false;
      if(lane==='event'&&kind===lastKind&&context.currentTime-lastTime<.35)return false;
      if(!design?.duration(kind))return false;
      if(lane==='event'){lastKind=kind;lastTime=context.currentTime;}
      stopLane(lane);const epoch=epochs.get(lane);pending.add(lane);
      return buffer(kind).then(data=>{
      if(!data||disposed||epochs.get(lane)!==epoch||context.state!=='running'||!volume){if(epochs.get(lane)===epoch)pending.delete(lane);return false;}
      pending.delete(lane);const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime;
      source.buffer=data;source.loop=loop;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level*(speaking&&lane==='event'?.28:1),now+.018);
      source.connect(gain);gain.connect(master);const voice={source,gain,kind};voices.set(lane,voice);source.onended=()=>{if(voices.get(lane)===voice){voices.delete(lane);source.disconnect();gain.disconnect();}};source.start();return true;
      });
    }
    function play(kind){kind=kind==='ready'?'listening':kind;if(previewing)cancelTimers();
      if(['startup','listening','response','shutdown','error'].includes(kind)){cancelTimers();stopLane('work');if(kind!=='response')stopFeed();}
      if(kind==='response'&&(voices.has('event')||pending.has('event'))&&!['startup','listening','response'].includes(lastKind))return true;
      return render(kind);
    }
    function activity(kind){if(activityKind===kind)return;cancelTimers();if(!['thinking','checking'].includes(kind))return;activityKind=kind;const started=context.currentTime;
      const pulse=()=>{if(activityKind!==kind||context.state!=='running'||context.currentTime-started>=30){cancelTimers();return;}render(kind,{lane:'work',level:.48});const remaining=30000-(context.currentTime-started)*1000;later(remaining<=2600?cancelTimers:pulse,Math.min(2600,remaining));};
      if(kind==='checking')pulse();else later(pulse,280);
    }
    function feed(level,{phase='thinking'}={}){
      if(disposed)return;level=clamp(level);
      if(!['thinking','speaking','connecting'].includes(phase)||level<.035||!volume||context.state!=='running'){stopFeed();return;}
      const now=context.currentTime;if(now-lastFeed<.08)return;lastFeed=now;
      if(!voices.has('energy')&&!pending.has('energy')){void render('transfer',{lane:'charge',level:phase==='speaking'?.18:.55});void render('energy',{lane:'energy',level:0,loop:true});}
      const gain=voices.get('energy')?.gain.gain;
      gain?.setTargetAtTime(level*(phase==='speaking'?.11:.32),now,.12);
      // No animation callbacks means no visible stream: never leave a looping sound behind a failed/hidden renderer.
      clear(feedGuard);feedGuard=schedule(()=>{feedGuard=null;stopFeed();},500);
    }
    function setSpeech(value){speaking=!!value;const voice=voices.get('event');if(voice&&speaking)voice.gain.gain.setTargetAtTime(.28,context.currentTime,.04);if(speaking){cancelTimers();stopLane('work');}}
    function preview(group='activity'){stop();const kinds=design?.groups[group]||design?.groups.activity;if(!kinds)return false;let offset=0,first;previewing=true;const epoch=timerEpoch;
      for(let i=0;i<kinds.length;i++){const kind=kinds[i];if(!i)first=render(kind);else later(()=>void render(kind),offset);offset+=(design.duration(kind)+.35)*1000;}return Promise.resolve(first).then(ok=>{if(!ok&&timerEpoch===epoch)cancelTimers();return ok;});
    }
    // Decode shipped clips off the animation thread; no runtime synthesis or provider requests.
    for(const kind of ['startup','shutdown','listening','thinking','checking','response','transfer','energy'])void buffer(kind);
    return {context,play,activity,feed,setSpeech,preview,stop,setVolume(value){volume=clamp(value);master.gain.setTargetAtTime(volume,context.currentTime,.035);if(!volume)stop();},dispose(){stop();disposed=true;buffers.clear();master.disconnect();limiter.disconnect();}};
  }
  window.SV_JARVIS_SOUNDS=Object.freeze({create});
})();
