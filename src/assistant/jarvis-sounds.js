/* Short, quiet local interface sounds. No recordings, network requests or continuous background audio. */
(function(){
  function create(context){
    const playing=new Set();let last=-Infinity;
    function stop(){for(const voice of playing){for(const node of voice.nodes){try{node.stop?.();}catch{}try{node.disconnect();}catch{}}}playing.clear();}
    function play(kind){
      if(!context||context.state!=='running'||context.currentTime-last<0.14)return false;
      last=context.currentTime;
      stop();
      const start=context.currentTime,duration=kind==='startup'?0.32:kind==='response'?0.10:0.15;
      const master=context.createGain(),voice={nodes:[master]};playing.add(voice);
      master.gain.setValueAtTime(0,start);master.gain.linearRampToValueAtTime(kind==='response'?0.008:0.018,start+0.012);master.gain.exponentialRampToValueAtTime(0.0001,start+duration);
      master.connect(context.destination);
      const base=kind==='startup'?78:kind==='response'?156:kind==='message'?220:130;
      for(const [ratio,level] of [[1,0.7],[2.013,0.20],[3.91,0.10]]){
        const osc=context.createOscillator(),gain=context.createGain();voice.nodes.push(osc,gain);
        osc.type='sine';osc.frequency.setValueAtTime(base*ratio,start);osc.frequency.exponentialRampToValueAtTime(base*ratio*(kind==='startup'?1.8:kind==='message'?1.3:0.78),start+duration);
        gain.gain.setValueAtTime(level,start);osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+duration+0.01);
        if(ratio===1)osc.onended=()=>{for(const node of voice.nodes)try{node.disconnect();}catch{}playing.delete(voice);};
      }
      return true;
    }
    return {play,stop,dispose:stop,context};
  }
  window.SV_JARVIS_SOUNDS=Object.freeze({create});
})();
