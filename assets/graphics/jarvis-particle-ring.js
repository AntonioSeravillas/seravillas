/* Jarvis desktop particle ring, using the owner's approved 18 October lab preset.
   One THREE.Points draw call; circulation, breathing, twists, state motion and the mouse wake are computed in the
   vertex shader from per-particle seeds, so the CPU only eases a handful of uniforms each frame.
   Signature mirrors createJarvisRing(canvas,getPhase,getMotion): phase strings and the same motion object. */
import * as THREE from './vendor/three-0.186.1/three.module.js';

export const MAX_PARTICLES=80000;
export const DEFAULTS=Object.freeze({count:80000,size:1.2,diameter:.76,thickness:.045,speed:.9,noise:2.45,glow:1.05,sensitivity:2.45});
const TRAIL=12,TRAIL_LIFE=2.2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const LIMITS={count:[2000,MAX_PARTICLES],size:[.5,4],diameter:[.35,.95],thickness:[.02,.2],speed:[0,3],noise:[0,2.5],glow:[0,1.5],sensitivity:[.2,3]};
/* Phases from jarvis.js collapse onto the four visual states. */
const applySettings=(settings,values)=>{for(const k of Object.keys(DEFAULTS))if(Number.isFinite(values?.[k]))settings[k]=clamp(values[k],...LIMITS[k]);};
const STATE={idle:0,paused:0,error:0,listening:1,waiting:1,connecting:2,thinking:2,speaking:3};

/* Read the existing audio signals only; this renderer never opens a microphone or voice session. */
export function audioLevel(phase,m={},now){
  const ms=now*1000;
  const pulse=(value,decay)=>Number.isFinite(value)?Math.exp(-Math.max(0,ms-value)/decay):0;
  const inputEvent=pulse(m.inputPulse,430),outputEvent=pulse(m.outputPulse,240);
  const envelope=.25+.4*Math.pow(Math.sin(ms*.007)*Math.sin(ms*.011+1.7),2);
  const input=Math.max(Number.isFinite(m.input)?m.input:0,m.speech?.27+.12*Math.sin(ms*.009):0,inputEvent*.7);
  const spoken=m.measuredOutput?(Number.isFinite(m.output)?m.output:0):Math.max(outputEvent*.9,envelope);
  const s=STATE[phase]??0;return clamp(s===3?spoken:s===1?input:s===2?.16:.025,0,1.4);
}

/* Seeds are generated in shuffled order so any prefix (the draw range) is an even sample of the whole ring. */
function buildSeeds(count){
  const seedA=new Float32Array(count*4),seedB=new Float32Array(count*4);
  let s=0x9e3779b9;const rand=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
  const gauss=()=>{let u=0;while(!u)u=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rand());};
  for(let i=0;i<count;i++){
    // Density varies around the ring: a slow lobe pattern, sampled by rejection.
    let a=0;do{a=rand()*Math.PI*2;}while(rand()>.62+.38*Math.pow(.5+.5*Math.sin(a*3+.7)*Math.sin(a*2-1.3),2));
    const kind=rand(),layer=kind<.62?0:kind<.9?1:2; // 0 filament threads, 1 soft body, 2 sparse dust
    const band=layer===0?Math.floor(rand()*9)/8:rand();
    const radial=layer===0?(band-.5)*1.3+gauss()*.018:layer===1?gauss()*.55:gauss()*1.25;
    const depth=layer===0?(band-.5)*.5+gauss()*.05:gauss()*(layer===2?.9:.45);
    seedA.set([a,radial,depth,band],i*4);
    seedB.set([rand(),rand(),layer,rand()],i*4); // size/brightness, phase, layer, accent/emission pick
  }
  return {seedA,seedB};
}

const VERTEX=`
uniform float uTime,uNow,uRadius,uThickness,uSize,uNoise,uGlow,uPixelRatio,uScale,uReduced;
uniform vec4 uMix; // idle, listening, thinking, speaking
uniform float uLevel,uBreath,uHover;
uniform vec2 uCursor,uCursorVel;
uniform vec4 uTwist[2];
uniform vec4 uTrail[${TRAIL}];   // xy position, zw velocity
uniform float uTrailBorn[${TRAIL}];
attribute vec4 aSeedA,aSeedB;
varying float vAlpha,vAccent,vSoft;
const float TAU=6.28318530718;
float spring(float age){ // ease in, then a lightly under-damped return to rest
  return (1.0-exp(-age/0.06))*exp(-age*2.6)*(cos(age*4.2)+0.25)/1.25;
}
void main(){
  float base=aSeedA.x,radial=aSeedA.y,depth=aSeedA.z,band=aSeedA.w;
  float pick=aSeedB.x,ph=aSeedB.y*TAU,layer=aSeedB.z,accent=aSeedB.w;
  float t=uTime,listen=uMix.y,think=uMix.z,speak=uMix.w;
  // Circulation with gentle shear: inner threads travel a little faster than the outside.
  float flow=t*(0.11+0.05*think+0.035*speak)*(1.0-radial*0.12)+t*0.012*(pick-0.5);
  float a=base+flow;
  // Thinking gathers particles into three slowly orbiting denser arcs.
  a+=think*0.22*sin(3.0*a-t*1.25);
  float turb=sin(a*3.0+t*0.30+band*2.2)*0.52+sin(a*5.0-t*0.80+band*3.5)*0.25+sin(a*9.0+t*1.3+band*5.0)*0.14;
  float plume=pow(0.5+0.5*sin(a*3.0-t*0.42),3.0);
  float r=uRadius*(1.0+uBreath*0.012-listen*0.025);
  float thick=uThickness*(1.0+plume*0.9-listen*0.25+think*0.15);
  float dr=radial*thick,dz=depth*thick*0.55;
  // Travelling twists: rotate the flattened cross-section, then let it settle back.
  for(int k=0;k<2;k++){
    vec4 tw=uTwist[k];float age=t-tw.y;
    if(age>0.0&&age<4.5&&tw.z>0.0){
      float centre=tw.x+age*0.55,d=atan(sin(a-centre),cos(a-centre));
      float env=pow(sin(3.14159*age/4.5),2.0)*exp(-d*d/0.09)*tw.z*(1.0-uReduced);
      float ang=env*3.14159,c=cos(ang),s=sin(ang);
      vec2 q=vec2(dr,dz/0.55);dr=c*q.x-s*q.y;dz=(s*q.x+c*q.y)*0.55;
    }
  }
  float rr=r+dr+uNoise*uThickness*0.42*turb*(0.6+0.4*sin(band*TAU));
  rr+=uThickness*uNoise*0.15*sin(a*13.0-t*1.4+band*6.0)*sin(a*4.0+t*0.8);
  // Listening: a fine inward ripple that follows the (simulated or measured) input level.
  rr-=listen*uLevel*uThickness*0.9*(0.5+0.5*sin(a*6.0+t*4.0));
  // Speaking: broad outward swells, plus a sparse set of particles released outward that fade.
  rr+=speak*uLevel*uThickness*(0.45*sin(a*4.0-t*3.0+band*2.0)+0.2*sin(a*11.0-t*5.0)+1.0);
  float release=0.0;
  if(layer>1.5&&accent<0.5){release=fract(pick+t*0.22)*speak*(1.0-uReduced);rr+=release*release*uRadius*0.32;}
  float wob=sin(a*3.0+t+band)*(0.017+uLevel*0.02);
  vec3 p=vec3(cos(a+wob)*rr,sin(a+wob)*rr,dz);
  // A slight, slowly drifting tilt gives depth without leaving the face-on silhouette.
  float tilt=0.16+0.04*sin(t*0.13),yaw=0.08*sin(t*0.09);
  p=vec3(p.x*cos(yaw)+p.z*sin(yaw),p.y,-p.x*sin(yaw)+p.z*cos(yaw));
  p=vec3(p.x,p.y*cos(tilt)-p.z*sin(tilt),p.y*sin(tilt)+p.z*cos(tilt));
  // Mouse: live hollow under the cursor plus a decaying spring wake along the recent path.
  vec2 xy=p.xy,disp=vec2(0.0);
  if(uHover>0.001){
    vec2 d=xy-uCursor;float f=exp(-dot(d,d)/0.026);
    disp+=normalize(d+1e-4)*f*0.055*uHover+uCursorVel*f*0.035*uHover;
  }
  for(int k=0;k<${TRAIL};k++){
    float age=uNow-uTrailBorn[k];
    if(age>0.0&&age<${TRAIL_LIFE.toFixed(1)}){
      vec2 d=xy-uTrail[k].xy;float f=exp(-dot(d,d)/0.018);
      if(f>0.002){float e=spring(age);disp+=(normalize(d+1e-4)*0.03+uTrail[k].zw*0.04)*f*e;}
    }
  }
  xy+=disp*(1.0-uReduced*0.8);
  vec4 mv=modelViewMatrix*vec4(xy,p.z,1.0);
  gl_Position=projectionMatrix*mv;
  float near=clamp(0.5+p.z/(uThickness*2.4),0.0,1.0); // 0 = far side, 1 = near side
  float layerSize=layer<0.5?0.85:layer<1.5?1.0:0.7;
  gl_PointSize=uSize*uPixelRatio*layerSize*(0.55+pick*0.9)*(0.7+0.6*near)*(1.0+speak*uLevel*0.25)*uScale;
  float centreBand=1.0-clamp(abs(radial)/1.6,0.0,1.0);
  float lift=0.08+0.10*listen+0.06*think+0.18*speak*(0.4+uLevel);
  vAlpha=(0.30+0.55*pick*pick)*(0.40+0.60*near)*(0.50+0.50*centreBand)*(layer<0.5?1.35:layer>1.5?0.45:0.6)+lift*pick;
  vAlpha*=1.0-release*release;
  vAccent=step(0.985,accent)*speak;
  vSoft=uGlow;
}`;

const FRAGMENT=`
varying float vAlpha,vAccent,vSoft;
void main(){
  vec2 c=gl_PointCoord-0.5;float d=length(c)*2.0;
  if(d>1.0)discard;
  float core=1.0-smoothstep(0.0,0.55,d),halo=pow(1.0-d,3.0)*vSoft;
  vec3 silver=vec3(0.86,0.86,0.88),accent=vec3(0.878,0.529,0.302);
  float a=vAlpha*(core+halo);
  gl_FragColor=vec4(mix(silver,accent,vAccent)*a,a);
}`;

export function createParticleRing(canvas,getPhase,getMotion,options={}){
  const reducedQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)'),mouseQuery=window.matchMedia?.('(min-width: 1100px) and (hover: hover) and (pointer: fine)');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance'});}
  catch(error){throw Object.assign(new Error('WebGL is not available.'),{cause:error,code:'no-webgl'});}
  renderer.setClearColor(0x000000,0);
  const settings={...DEFAULTS};applySettings(settings,options.settings);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,-10,10);
  const {seedA,seedB}=buildSeeds(MAX_PARTICLES),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES*3),3));
  geometry.setAttribute('aSeedA',new THREE.BufferAttribute(seedA,4));geometry.setAttribute('aSeedB',new THREE.BufferAttribute(seedB,4));
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),4);
  const trail=Array.from({length:TRAIL},()=>new THREE.Vector4(9,9,0,0)),born=new Array(TRAIL).fill(-99);
  const uniforms={uTime:{value:0},uNow:{value:0},uRadius:{value:settings.diameter},uThickness:{value:settings.thickness},uSize:{value:settings.size},
    uNoise:{value:settings.noise},uGlow:{value:settings.glow},uPixelRatio:{value:1},uScale:{value:1},uReduced:{value:0},uMix:{value:new THREE.Vector4(1,0,0,0)},
    uLevel:{value:0},uBreath:{value:0},uHover:{value:0},uCursor:{value:new THREE.Vector2(9,9)},uCursorVel:{value:new THREE.Vector2()},
    uTwist:{value:[new THREE.Vector4(),new THREE.Vector4()]},uTrail:{value:trail},uTrailBorn:{value:born}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,transparent:true,depthWrite:false,depthTest:false,blending:THREE.CustomBlending,
    blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcColorFactor}); // screen-like add: particles accumulate without clipping to neon
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);

  let frame=0,last=0,disposed=false,lost=false,paused=false,simTime=0,level=0,breath=0,nextTwist=4,twistSlot=0,warmup=6;
  let reduced=!!reducedQuery?.matches,forceReduced=false,interactive=false,bound=false,size=[0,0],dprCap=2,quality=1;
  const mix=[1,0,0,0],perf={samples:[],fps:0,ms:0,lastAdapt:0,note:''};
  const hover={level:0,active:false,x:9,y:9,vx:0,vy:0,lastMove:-1e9,lastTrail:-1e9,next:0};

  function toRing(e){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;const m=Math.min(r.width,r.height)/2;
    return [(e.clientX-r.left-r.width/2)/m,-(e.clientY-r.top-r.height/2)/m];}
  function pointerMove(e){if(!interactive||(e.pointerType&&e.pointerType!=='mouse'))return;const p=toRing(e);if(!p)return;const now=performance.now()/1000;
    const dt=Math.max(.016,now-hover.lastMove),dx=p[0]-hover.x,dy=p[1]-hover.y,fresh=!hover.active||now-hover.lastMove>.25;
    hover.vx=fresh?0:clamp(dx/dt*.25,-1,1);hover.vy=fresh?0:clamp(dy/dt*.25,-1,1);hover.x=p[0];hover.y=p[1];hover.active=true;hover.lastMove=now;
    if(now-hover.lastTrail>.045&&(fresh||Math.hypot(dx,dy)>.01)){trail[hover.next].set(p[0],p[1],hover.vx,hover.vy);born[hover.next]=now;hover.next=(hover.next+1)%TRAIL;hover.lastTrail=now;}}
  function pointerLeave(){hover.active=false;}
  function resetPointer(){hover.active=false;hover.level=0;hover.vx=hover.vy=0;born.fill(-99);}
  function syncFeatures(){reduced=forceReduced||!!reducedQuery?.matches;uniforms.uReduced.value=reduced?1:0;interactive=!!mouseQuery?.matches&&!reduced;
    if(interactive&&!bound){canvas.addEventListener('pointermove',pointerMove,{passive:true});canvas.addEventListener('pointerleave',pointerLeave,{passive:true});window.addEventListener('blur',resetPointer);bound=true;}
    if(!interactive&&bound){canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);window.removeEventListener('blur',resetPointer);bound=false;resetPointer();}
    canvas.dataset.ringInteractive=interactive?'desktop':'';if(!interactive)delete canvas.dataset.ringHover;}
  reducedQuery?.addEventListener?.('change',syncFeatures);mouseQuery?.addEventListener?.('change',syncFeatures);syncFeatures();

  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return false;const dpr=Math.min(window.devicePixelRatio||1,dprCap);
    if(w!==size[0]||h!==size[1]||renderer.getPixelRatio()!==dpr){size=[w,h];renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
      const aspect=w/h;camera.left=-Math.max(1,aspect);camera.right=Math.max(1,aspect);camera.top=Math.max(1,1/aspect);camera.bottom=-Math.max(1,1/aspect);camera.updateProjectionMatrix();
      uniforms.uPixelRatio.value=dpr;uniforms.uScale.value=clamp(Math.min(w,h)/560,.6,1.4);}
    return true;}
  const observer=window.ResizeObserver?new ResizeObserver(()=>{if(!disposed&&!lost){resize();if(paused)renderer.render(scene,camera);}}):null;observer?.observe(canvas);

  function adapt(dtMs,now){
    const p=perf;p.samples.push(dtMs);if(p.samples.length>90)p.samples.shift();
    const avg=p.samples.reduce((a,b)=>a+b,0)/p.samples.length;p.ms=avg;p.fps=1000/avg;
    if(options.adaptive===false||p.samples.length<60||now-p.lastAdapt<2)return;
    if(avg>21&&(quality>.2||dprCap>1)){if(dprCap>1)dprCap=Math.max(1,dprCap-.5);else quality=Math.max(.2,quality*.8);p.lastAdapt=now;p.samples.length=0;p.note='reduced detail ('+avg.toFixed(1)+' ms/frame)';resize();}
    else if(avg<12.5&&(quality<1||dprCap<2)){if(quality<1)quality=Math.min(1,quality/.85);else dprCap=Math.min(2,dprCap+.5);p.lastAdapt=now;p.samples.length=0;p.note='restoring detail';resize();}}

  function tick(nowMs){
    if(disposed)return;frame=requestAnimationFrame(tick);
    if(lost||document.hidden){last=0;warmup=6;perf.samples.length=0;return;}
    const now=nowMs/1000,dt=Math.min(last?now-last:1/60,.1);
    if(warmup>0)warmup--;else if(last)adapt((now-last)*1000,now);
    last=now;if(!resize())return;
    const phase=getPhase(),m=getMotion(),state=STATE[phase]??0;
    if(!paused){
      const timeScale=reduced?.12:1;simTime+=dt*settings.speed*timeScale*(1+level*.6);
      for(let i=0;i<4;i++){const target=i===state?1:0;mix[i]+=(target-mix[i])*(1-Math.exp(-dt*2.4));}
      const target=clamp(audioLevel(phase,m,now)*settings.sensitivity,0,1.4);level+=(target-level)*(1-Math.exp(-dt*(target>level?14:4.5)));
      breath=Math.sin(simTime*.55)*(reduced?.3:1);
      if(!reduced&&simTime>nextTwist){uniforms.uTwist.value[twistSlot].set(Math.random()*Math.PI*2,simTime,.55+Math.random()*.4,0);twistSlot=1-twistSlot;nextTwist=simTime+6+Math.random()*6;}
    }
    const target=hover.active?(now-hover.lastMove<.17?1:.35):0;hover.level+=(target-hover.level)*(1-Math.exp(-dt*(target>hover.level?10:4)));
    if(interactive){const state=hover.level>.02?'active':'idle';if(canvas.dataset.ringHover!==state)canvas.dataset.ringHover=state;}
    hover.vx*=Math.exp(-dt*6);hover.vy*=Math.exp(-dt*6);
    const count=Math.max(500,Math.round(Math.min(MAX_PARTICLES,settings.count)*quality));geometry.setDrawRange(0,count);
    uniforms.uTime.value=simTime;uniforms.uNow.value=now;uniforms.uRadius.value=settings.diameter;uniforms.uThickness.value=settings.thickness;
    uniforms.uSize.value=settings.size;uniforms.uNoise.value=settings.noise;uniforms.uGlow.value=settings.glow;uniforms.uMix.value.fromArray(mix);
    uniforms.uLevel.value=level;uniforms.uBreath.value=breath;uniforms.uHover.value=hover.level;uniforms.uCursor.value.set(hover.x,hover.y);uniforms.uCursorVel.value.set(hover.vx,hover.vy);
    try{renderer.render(scene,camera);stats.drawn=count;}catch(error){api.dispose();options.onError?.(error);}
  }
  function contextLost(e){e.preventDefault();lost=true;options.onError?.(new Error('WebGL context lost.'));}
  function contextRestored(){lost=false;last=0;warmup=6;size=[0,0];}
  canvas.addEventListener('webglcontextlost',contextLost,false);canvas.addEventListener('webglcontextrestored',contextRestored,false);
  const stats={drawn:0};frame=requestAnimationFrame(tick);

  const api={
    set(values){applySettings(settings,values);},
    get settings(){return {...settings};},
    setPaused(v){paused=!!v;},get paused(){return paused;},
    setReducedMotion(v){forceReduced=!!v;syncFeatures();},get reduced(){return reduced;},get interactive(){return interactive;},
    reset(){simTime=0;level=0;mix.splice(0,4,1,0,0,0);nextTwist=4;uniforms.uTwist.value.forEach(v=>v.set(0,0,0,0));resetPointer();quality=1;dprCap=2;perf.samples.length=0;perf.note='';},
    stats(){const info=renderer.info;return {fps:perf.fps,ms:perf.ms,drawn:stats.drawn,quality,dpr:renderer.getPixelRatio(),note:perf.note,lost,hover:hover.level,level,mix:[...mix],
      geometries:info.memory.geometries,programs:info.programs?.length??0};},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();
      canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
      if(bound){canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);window.removeEventListener('blur',resetPointer);}
      reducedQuery?.removeEventListener?.('change',syncFeatures);mouseQuery?.removeEventListener?.('change',syncFeatures);
      scene.remove(points);geometry.dispose();material.dispose();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();
      delete canvas.dataset.ringInteractive;delete canvas.dataset.ringHover;}
  };
  return api;
}
