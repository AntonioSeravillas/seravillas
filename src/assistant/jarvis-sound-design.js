/* Original cinematic machine textures: friction, inharmonic metal, servo movement and electrical air.
   Shared deterministic PCM renderer for browser playback and offline listening previews. No third-party recordings. */
(function(scope){
  // duration, motor start/end Hz, metal brightness, friction, mechanical strikes, seed
  const recipes={
    startup:[1.12,58,154,1.0,.62,5,11],shutdown:[.88,162,42,.65,.58,3,12],
    listening:[.38,115,176,.78,.42,2,13],thinking:[.72,73,96,.58,.74,6,14],
    checking:[.56,135,87,1.18,.68,7,15],response:[.37,90,143,.76,.45,2,16],
    transfer:[1.08,45,248,1.05,.94,4,17],energy:[1.8,76,76,.48,.86,0,18],
    bookings:[.46,132,184,1.12,.48,3,21],cleanings:[.51,89,151,.64,.88,4,22],
    tasks:[.36,173,126,1.34,.38,3,23],whatsapp:[.49,112,205,.94,.56,2,24],
    properties:[.58,66,109,.72,.66,2,25],team:[.47,105,142,1.14,.48,4,26],
    reports:[.62,81,157,1.28,.62,6,27],issues:[.48,124,68,1.02,.84,3,28],
    settings:[.40,153,102,.88,.54,4,29],overview:[.57,65,132,.82,.66,3,30],
    conversation:[.42,96,174,.68,.50,2,31],memory:[.65,142,91,1.22,.58,8,32],
    review:[.61,170,102,.92,.70,3,33],saved:[.65,86,63,1.32,.42,2,34],
    cancelled:[.42,143,52,.63,.76,2,35],error:[.68,115,47,.78,.94,4,36],
    sent:[.58,69,217,1.04,.78,3,37],message:[.53,161,123,1.12,.56,3,38],
    taskDone:[.44,120,78,1.42,.46,2,39],filter:[.24,138,106,.98,.57,2,40]
  };
  const labels={startup:'Power on',listening:'Listening',thinking:'Thinking',checking:'Checking',transfer:'Globe to ring',response:'Reply',shutdown:'Power off',bookings:'Bookings',cleanings:'Cleanings',tasks:'Tasks',whatsapp:'WhatsApp',properties:'Properties',team:'Team',reports:'Reports',issues:'Issues',settings:'Settings',overview:'Dashboard',conversation:'Conversation',memory:'Memory',review:'Review ready',saved:'Saved',cancelled:'Cancelled',error:'Attention',sent:'Message sent',message:'New message',taskDone:'Task completed',filter:'Filter'};
  const groups={activity:['startup','listening','thinking','checking','transfer','response','shutdown'],features:['bookings','cleanings','tasks','whatsapp','properties','team','reports','issues','settings','memory','review','saved','cancelled','sent','error'],globe:['transfer','energy']};
  const cache=new Map(),TAU=Math.PI*2;
  function render(kind,rate=32000){
    if(!recipes[kind])return null;
    const key=kind+':'+rate;if(cache.has(key))return cache.get(key);
    const [duration,from,to,bright,friction,strikes,seed]=recipes[kind],size=Math.ceil(duration*rate);
    const left=new Float32Array(size),right=new Float32Array(size),dry=new Float32Array(size);
    let random=seed,low=0,air=0,phase=0,metalPhase=0,dc=0,peak=0;
    const noise=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)/2147483648-1;};
    const loop=kind==='energy';
    for(let i=0;i<size;i++){
      const t=i/rate,x=t/duration,sweep=x*x*(3-2*x);
      const freq=from*Math.pow(to/from,sweep)*(1+.035*Math.sin(TAU*t*7.3));
      phase+=TAU*freq/rate;metalPhase+=TAU*(183+seed*7+bright*210*(1-sweep))/rate;
      const white=noise();low+=.065*(white-low);air+=.28*(white-air);
      const motor=Math.sin(phase+2.8*Math.sin(phase*.493))*.29+Math.sin(phase*1.497+1.4*Math.sin(phase*.317))*.17;
      const metal=(Math.sin(metalPhase+3.7*Math.sin(metalPhase*.711))+.45*Math.sin(metalPhase*2.313+1.2*Math.sin(phase*.19)))*.17;
      const ratchet=.56+.44*Math.pow(.5+.5*Math.sin(TAU*t*(14+seed%13)+2*Math.sin(TAU*t*2.1)),5);
      const airSweep=(white-air)*.16+air*.19+low*.74;
      const body=(motor+metal*bright+airSweep*friction)*ratchet;
      let impacts=0;
      for(let hit=0;hit<strikes;hit++){
        const at=(hit+.34)/(strikes+.7)*duration,age=t-at;if(age<0||age>.24)continue;
        const attack=Math.min(1,age/.0025),decay=Math.exp(-age*(25+hit*3));
        impacts+=attack*decay*(Math.sin(TAU*age*(237+seed*9+hit*119))*Math.sin(TAU*age*91)*.38+white*.23);
      }
      const attack=Math.min(1,t/(loop?.08:.022));
      const tail=loop?1:Math.pow(Math.max(0,1-x),.64),swell=kind==='transfer'?(.3+1.0*Math.pow(Math.sin(Math.PI*x),1.3)):1;
      let value=(body*swell+impacts)*attack*tail;
      value=Math.tanh(value*1.6);dc+=.0015*(value-dc);dry[i]=value-dc;
    }
    // A moving short comb plus diffuse stereo reflections gives metal a physical, hollow enclosure.
    for(let i=0;i<size;i++){
      const t=i/rate,x=i/size,comb=Math.floor(rate*(.005+.0025*Math.sin(TAU*x*.73))),a=Math.floor(rate*.071),b=Math.floor(rate*.119);
      const sample=(offset)=>i>=offset?dry[i-offset]:loop?dry[(i-offset+size)%size]:0;
      const end=loop?1:Math.min(1,(size-i)/(rate*.035));
      left[i]=(dry[i]+sample(comb)*.24+sample(a)*.17+sample(b)*.09)*end;
      right[i]=(dry[i]+sample(comb+Math.floor(rate*.0031))*.22+sample(b)*.19+sample(a)*.10)*end;
      peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    }
    const scale=.82/Math.max(.001,peak);for(let i=0;i<size;i++){left[i]*=scale;right[i]*=scale;}
    if(loop){const fade=Math.floor(rate*.12);for(let i=0;i<fade;i++){const mix=i/fade;for(const channel of [left,right])channel[size-fade+i]=channel[size-fade+i]*(1-mix)+channel[i]*mix;}}
    const result={left,right,rate,duration};cache.set(key,result);return result;
  }
  const api=Object.freeze({render,duration:kind=>recipes[kind]?.[0]||0,labels:Object.freeze(labels),groups:Object.freeze(groups)});
  if(typeof module==='object'&&module.exports)module.exports=api;else scope.SV_JARVIS_SOUND_DESIGN=api;
})(typeof window==='object'?window:globalThis);
