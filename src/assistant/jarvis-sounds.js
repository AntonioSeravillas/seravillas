/* Local, enveloped electronic cues. No voice generation, recordings or network requests. */
(function(){
  // [offset, duration, start Hz, end Hz, level]. Midrange harmonics remain audible on small speakers.
  const motifs={
    startup:[[0,.26,180,360,1],[.12,.32,360,540,.65],[.26,.28,720,900,.28]],
    listening:[[0,.12,540,810,.8],[.09,.13,810,1080,.45]],
    thinking:[[0,.12,300,330,.42],[.16,.13,400,440,.32]],
    checking:[[0,.085,680,600,.65],[.12,.10,920,760,.5]],
    response:[[0,.12,600,900,.36]],
    shutdown:[[0,.22,540,360,.7],[.12,.30,300,150,.8]],
    message:[[0,.16,660,880,.7],[.18,.20,880,1100,.45]]
  };
  function create(context,{schedule=setTimeout,clear=clearTimeout,volume=.7}={}){
    const voices=new Set(),timers=new Set();let activityKind=null,disposed=false,lastKind='',lastTime=-Infinity;
    const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));volume=clamp(volume);
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);if(!disposed)fn();},ms);timers.add(id);return id;}
    function cancelTimers(){for(const id of timers)clear(id);timers.clear();activityKind=null;}
    function release(voice){for(const node of voice.nodes){try{node.disconnect();}catch{}}voices.delete(voice);}
    function stop(){cancelTimers();for(const voice of [...voices]){for(const node of voice.nodes)try{node.stop?.();}catch{}release(voice);}}
    function render(kind){
      if(disposed||context?.state!=='running'||!volume||!motifs[kind])return false;
      const start=context.currentTime;
      if(kind===lastKind&&start-lastTime<.4)return false;
      lastKind=kind;lastTime=start;
      for(const voice of [...voices]){for(const node of voice.nodes)try{node.stop?.();}catch{}release(voice);}
      const voice={nodes:[],remaining:motifs[kind].length*2};voices.add(voice);
      for(const [offset,duration,from,to,level] of motifs[kind]){
        const time=start+offset;
        for(const [ratio,strength] of [[1,1],[2.01,.16]]){
          const oscillator=context.createOscillator(),gain=context.createGain();voice.nodes.push(oscillator,gain);
          oscillator.type='sine';oscillator.frequency.setValueAtTime(from*ratio,time);oscillator.frequency.exponentialRampToValueAtTime(to*ratio,time+duration);
          gain.gain.setValueAtTime(.0001,time);gain.gain.linearRampToValueAtTime(.11*volume*level*strength,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
          oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+duration+.015);
          oscillator.onended=()=>{if(--voice.remaining===0)release(voice);};
        }
      }
      return true;
    }
    function play(kind){cancelTimers();return render(kind==='ready'?'listening':kind);}
    function activity(kind){
      if(activityKind===kind)return;
      cancelTimers();if(!['thinking','checking'].includes(kind))return;
      activityKind=kind;const started=context.currentTime;
      const pulse=()=>{if(activityKind!==kind||context.state!=='running'||context.currentTime-started>=30){cancelTimers();return;}render(kind);const remaining=30000-(context.currentTime-started)*1000;later(remaining<=2400?cancelTimers:pulse,Math.min(2400,remaining));};
      // Actual tool checks get a short acknowledgement; thinking waits briefly to avoid chatter on instant replies.
      if(kind==='checking')pulse();else later(pulse,350);
    }
    function preview(){stop();if(!render('startup'))return false;for(const [ms,kind] of [[850,'listening'],[1500,'thinking'],[2250,'checking'],[3000,'response'],[3550,'shutdown']])later(()=>render(kind),ms);return true;}
    return {context,play,activity,preview,stop,setVolume(value){volume=clamp(value);if(!volume)stop();},dispose(){stop();disposed=true;}};
  }
  window.SV_JARVIS_SOUNDS=Object.freeze({create});
})();
