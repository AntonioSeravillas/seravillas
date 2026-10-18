/* Jarvis dashboard atmosphere: quiet star field, dim warm nebula and a low particle globe below the ring, and one fine
   particle flow rising from the crown's midpoint into the ring while Jarvis thinks or speaks.
   One WebGL context, one scene: a full-screen sky quad plus three THREE.Points populations (stars, globe, streams)
   from seeded BufferGeometry. The globe's grains part around the desktop mouse over exposed background and settle back.
   Every particle position is computed in the vertex shaders; per frame JavaScript only
   eases a handful of uniforms from the same phase/motion signals that drive the ring (read-only; no microphone,
   no model, no timers pretending to be speech). The ring renderer itself is untouched.
   Bounded resolution and particle counts (globe detail drops first), paused while hidden, one static frame under
   reduced motion, fully disposed on close. Any failure leaves the CSS fallback and every control usable. */
import * as THREE from './vendor/three-0.186.1/three.module.js';
import {audioLevel} from './jarvis-particle-ring.js?v=20261018-particles1';

const STATE={idle:0,paused:0,error:0,listening:1,waiting:1,connecting:2,thinking:2,speaking:3};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const GLOBE_COUNT=72000,STREAM_COUNT=1400,TRAIL=6;

const SKY_VERTEX=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
/* Pixel-space sky (CSS pixels, origin top-left). The globe body is dark so stars and dust never show through it;
   only a faint warm haze sits above its crown. The globe's light comes from its particles. */
const SKY_FRAGMENT=`precision highp float;
varying vec2 vUv;
uniform vec2 uRes;uniform float uTime;uniform vec3 uPlanet;uniform vec2 uCentre;uniform float uRing;uniform vec2 uPar;uniform float uEnergy;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return v;}
void main(){
  vec2 px=vec2(vUv.x*uRes.x,(1.0-vUv.y)*uRes.y);
  float s=max(uRing,1.0);
  vec2 q=(px-uCentre)/s;
  vec3 col=vec3(0.010,0.0095,0.010);
  vec2 np=(px+uPar*4.0)/s*1.35;
  float n=fbm(np+vec2(0.0,uTime*0.0035));
  float n2=fbm(np*2.4-vec2(uTime*0.0025,0.0)+7.0);
  float band=exp(-pow((q.y+0.15+q.x*0.42)*1.25,2.0))*smoothstep(1.9,0.2,length(q*vec2(0.55,1.0)));
  float dust=smoothstep(0.48,0.95,n)*0.75+smoothstep(0.6,1.0,n2)*0.35;
  col+=vec3(0.30,0.12,0.045)*dust*band*0.22;
  col+=vec3(0.06,0.05,0.055)*smoothstep(0.52,1.0,n)*0.35;
  float streak=pow(max(0.0,1.0-abs(q.y*1.6+q.x*0.9+0.9)*3.2),6.0)*smoothstep(-1.6,-0.2,q.x)*smoothstep(1.8,0.2,q.x);
  col+=vec3(0.55,0.26,0.10)*streak*0.05*(0.6+0.4*n);
  vec2 rel=px-(uPlanet.xy+uPar*1.5);
  float h=length(rel)-uPlanet.z,ang=atan(rel.x,-rel.y);
  float front=exp(-pow(ang*2.6,2.0)),side=exp(-pow(ang*1.3,2.0));
  if(h<0.0)col=mix(col,vec3(0.006,0.0045,0.004),smoothstep(0.0,-6.0,h));
  float hp=max(h,0.0),above=step(0.0,h);
  col+=vec3(1.0,0.45,0.13)*(exp(-hp/26.0)*front*(0.07+0.05*uEnergy)+exp(-hp/110.0)*side*0.025)*above;
  vec2 e=vUv-0.5;col*=1.0-dot(e,e)*0.55;
  gl_FragColor=vec4(col,1.0);
}`;
const STAR_VERTEX=`attribute vec4 seed;uniform vec2 uRes;uniform float uTime;uniform vec3 uPlanet;uniform vec2 uPar;uniform float uPixel;
varying float vAlpha;varying float vWarm;
void main(){
  vec2 px=seed.xy*uRes+uPar*(2.0+seed.z*6.0);
  float twinkle=0.84+0.16*sin(uTime*(0.35+seed.w*1.1)+seed.w*40.0);
  float inside=length(px-uPlanet.xy)<uPlanet.z+4.0?0.0:1.0;
  vAlpha=(0.14+0.72*seed.z*seed.z)*twinkle*inside;
  vWarm=step(0.9,fract(seed.w*7.31));
  gl_PointSize=(0.75+1.15*seed.z*seed.z)*uPixel;
  gl_Position=vec4(px.x/uRes.x*2.0-1.0,1.0-px.y/uRes.y*2.0,0.0,1.0);
}`;
const STAR_FRAGMENT=`precision mediump float;varying float vAlpha;varying float vWarm;
void main(){vec2 c=gl_PointCoord-0.5;float d=dot(c,c);float a=smoothstep(0.25,0.09,d)*vAlpha;if(a<0.004)discard;gl_FragColor=vec4(mix(vec3(0.93,0.94,0.97),vec3(1.0,0.74,0.50),vWarm),a);}`;

/* Globe: grains on the visible front of a sphere (centre uPlanet.xy, radius uPlanet.z, CSS px). Sampling uniform in
   height over the on-screen cap [uCapY0,1] gives uniform area density on the sphere, so foreshortening alone makes
   the limb denser and the face sparser, like a lit body. Azimuth drifts slowly across the front half; grains enter
   and leave at the limb where they are faint, so nothing pops. A few grains float above the surface. */
const GLOBE_VERTEX=`attribute vec4 seedA;attribute vec4 seedB;
uniform vec2 uRes;uniform vec3 uPlanet;uniform vec2 uPar;uniform float uCapY0,uTime,uPixel,uEnergy,uLevel,uSpeak,uGather,uReduced;
uniform vec3 uTrail[${TRAIL}];uniform vec2 uTrailVel[${TRAIL}];
varying float vAlpha;varying vec3 vColor;
const float PI=3.14159265;
void main(){
  float R=uPlanet.z;
  float y=mix(uCapY0,1.0,seedA.x),r=sqrt(max(0.0,1.0-y*y));
  float phi=fract(seedA.y+uTime*0.0016*(0.8+0.4*seedB.y))*PI;
  vec3 p=vec3(r*cos(phi),y,r*sin(phi));
  float front=p.z;
  vec2 nrm=normalize(vec2(p.x,-p.y)+vec2(1e-5));
  float floater=step(0.955,seedB.x);
  float rise=fract(seedB.z+uTime*0.010*(0.4+seedB.w));
  /* Light in screen terms: brightest at the crown and down a soft central spine, darker toward the sides. */
  float depth=(1.0-y)/max(1.0-uCapY0,1e-3);
  float crown=exp(-pow(p.x/0.10,2.0))*exp(-depth*2.2);
  float spine=exp(-pow(p.x/0.022,2.0))*(1.0-0.5*depth);
  /* Calm surface motion; while speaking, a fine ripple follows the measured (or ring-fallback) output level. */
  float ripple=sin(phi*48.0-uTime*1.4+y*120.0)*uLevel*uSpeak*(0.6+1.4*crown)*(1.0-uReduced);
  float lift=floater*(4.0+seedB.z*30.0+rise*46.0*(1.0-uReduced))+ripple+sin(uTime*0.35+seedB.y*40.0)*0.5;
  /* Thinking/feeding: grains near the crown gather slightly toward it. */
  vec2 px=vec2(uPlanet.x+uPar.x*1.5+R*p.x*(1.0-0.06*uGather*crown),uPlanet.y+uPar.y*1.5-R*p.y)+nrm*lift;
  /* Mouse wake: each recent cursor sample pushes nearby grains outward and a little along its motion. */
  vec2 disp=vec2(0.0);
  for(int i=0;i<${TRAIL};i++){vec3 t=uTrail[i];if(t.z<0.002)continue;vec2 d=px-t.xy;float dist=length(d);
    float fall=1.0-smoothstep(0.0,52.0,dist);fall*=fall;disp+=(d/max(dist,1.0)*8.0+uTrailVel[i]*8.0)*fall*t.z;}
  px+=disp*(1.0-uReduced);
  float stir=min(length(disp)/13.0,1.0);
  float side=exp(-pow(p.x/0.36,2.0));
  float face=smoothstep(0.0,0.18,sin(phi));
  float bright=(0.26+0.66*side+1.3*crown+0.6*spine)*(0.78-0.25*depth);
  bright*=1.0+uEnergy*(0.5+1.2*crown);
  float twinkle=0.8+0.2*sin(uTime*(0.5+seedB.w*0.8)+seedB.y*70.0);
  vAlpha=face*bright*twinkle*(0.32+0.68*seedA.w)*mix(1.0,0.5*(1.0-rise)*(1.0-rise),floater)*(1.0+0.35*stir);
  vColor=mix(vec3(0.80,0.33,0.06),vec3(1.0,0.64,0.28),clamp(crown*0.9+spine*0.6+0.15*side,0.0,1.0));
  gl_PointSize=(0.85+1.25*seedA.z*seedA.z)*uPixel*mix(1.0,0.8,floater);
  gl_Position=vec4(px.x/uRes.x*2.0-1.0,1.0-px.y/uRes.y*2.0,0.0,1.0);
}`;
/* Feed: one fine flow from the crown's midpoint toward the ring's centre (vertical on the overview). Each grain climbs
   continuously as the shared travel clock advances; past the ring's lower edge it fans out into the ring's particle
   field, turns from amber toward neutral and has faded completely well before the open centre (no central orb). */
const STREAM_VERTEX=`attribute vec4 seed;
uniform vec2 uRes;uniform vec2 uFrom;uniform vec2 uTo;uniform float uEnter,uRingPx;
uniform float uTravel,uFeed,uTime,uPixel,uLevel;uniform vec2 uPar;
varying float vAlpha;varying vec3 vColor;
const float PI=3.14159265;
void main(){
  float p=fract(seed.y+uTravel*(0.85+0.3*seed.w));
  vec2 a=uFrom+uPar*1.5;
  vec2 pos=mix(a,uTo,p);
  float enter=smoothstep(uEnter,1.0,p);
  float sway=sin(uTime*0.5+p*4.0+seed.y*6.0)*2.6*sin(PI*p)+sin(uTime*0.23+p*9.0)*1.1;
  float core=(seed.z-0.5)*2.0*(1.8+2.2*p);
  float fan=(seed.z-0.5)*2.0;
  /* Offsets across and along the path, so the same flow works vertically (overview) or diagonally (working pages). */
  vec2 dir=normalize(uTo-a+vec2(1e-5)),n=vec2(-dir.y,dir.x);
  pos+=n*(sway+core+fan*enter*uRingPx*0.17*(0.35+0.65*seed.w));
  pos-=dir*(enter*uRingPx*0.06*seed.w*(1.0-abs(fan)));
  vAlpha=uFeed*smoothstep(0.0,0.06,p)*(1.0-smoothstep(0.45,0.95,enter))*(0.30+0.55*seed.w)*(0.8+0.35*uLevel);
  vColor=mix(vec3(1.0,0.56,0.20),vec3(0.94,0.90,0.86),enter*0.85);
  gl_PointSize=(0.85+1.0*seed.w)*uPixel*(1.0-0.3*enter);
  gl_Position=vec4(pos.x/uRes.x*2.0-1.0,1.0-pos.y/uRes.y*2.0,0.0,1.0);
}`;
const GRAIN_FRAGMENT=`precision mediump float;varying float vAlpha;varying vec3 vColor;
void main(){vec2 c=gl_PointCoord-0.5;float a=smoothstep(0.25,0.06,dot(c,c))*vAlpha;if(a<0.003)discard;gl_FragColor=vec4(vColor,min(a,1.0));}`;

function seeded(count,width,fill){let x=0x9e3779b9;const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)%1000003)/1000003;};const out=new Float32Array(count*width);for(let i=0;i<count;i++)fill(out,i*width,rand,i);return out;}
function geometryWith(attrs,count){const g=new THREE.BufferGeometry();for(const [name,data,size] of attrs)g.setAttribute(name,new THREE.BufferAttribute(data,size));g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));return g;}

/* layout(): {cx,cy,ring,avoid:{left,right,top,bottom}} in CSS px from the real ring canvas and ask controls.
   signals(): {phase,motion}, the same read-only values the ring receives. */
export function createAtmosphere(canvas,{layout=()=>null,signals=()=>null,onFeed=()=>{},onError=()=>{}}={}){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:false});}
  catch(error){onError(error);return null;}
  renderer.setClearColor(0x040404,1);
  const reducedQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const trail=Array.from({length:TRAIL},()=>new THREE.Vector3(0,0,0)),trailVel=Array.from({length:TRAIL},()=>new THREE.Vector2());
  const uniforms={uRes:{value:new THREE.Vector2(1,1)},uTime:{value:0},uPlanet:{value:new THREE.Vector3(0,0,1)},uCentre:{value:new THREE.Vector2(0,0)},uRing:{value:400},uPar:{value:new THREE.Vector2(0,0)},uPixel:{value:1},
    uCapY0:{value:.8},uEnergy:{value:0},uLevel:{value:0},uSpeak:{value:0},uGather:{value:0},uReduced:{value:0},uTravel:{value:0},uFeed:{value:0},
    uFrom:{value:new THREE.Vector2()},uTo:{value:new THREE.Vector2()},uEnter:{value:.8},uRingPx:{value:400},uTrail:{value:trail},uTrailVel:{value:trailVel}};
  const owned=[];const add=(geometry,material,kind)=>{const o=kind==='mesh'?new THREE.Mesh(geometry,material):new THREE.Points(geometry,material);o.frustumCulled=false;scene.add(o);owned.push(geometry,material);return o;};
  const shader=(vertexShader,fragmentShader,extra={})=>new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false,...extra});
  add(new THREE.PlaneGeometry(2,2),shader(SKY_VERTEX,SKY_FRAGMENT),'mesh');
  const additive={transparent:true,blending:THREE.AdditiveBlending};
  const stars=add(new THREE.BufferGeometry(),shader(STAR_VERTEX,STAR_FRAGMENT,additive));let starGeometry=null;
  const globeSeedA=seeded(GLOBE_COUNT,4,(o,i,r)=>{o[i]=Math.pow(r(),1.0);o[i+1]=r();o[i+2]=r();o[i+3]=r();});
  const globeSeedB=seeded(GLOBE_COUNT,4,(o,i,r)=>{o[i]=r();o[i+1]=r();o[i+2]=r();o[i+3]=r();});
  const globeGeometry=geometryWith([['seedA',globeSeedA,4],['seedB',globeSeedB,4]],GLOBE_COUNT);
  const globe=add(globeGeometry,shader(GLOBE_VERTEX,GRAIN_FRAGMENT,additive));
  const streamGeometry=geometryWith([['seed',seeded(STREAM_COUNT,4,(o,i,r)=>{o[i]=0;o[i+1]=r();o[i+2]=r();o[i+3]=r();}),4]],STREAM_COUNT);
  const streams=add(streamGeometry,shader(STREAM_VERTEX,GRAIN_FRAGMENT,additive));
  function buildStars(w,h){
    const count=Math.min(1800,Math.round(w*h/1300));
    const seed=seeded(count,4,(o,i,r)=>{o[i]=r();o[i+1]=Math.pow(r(),1.15);o[i+2]=Math.pow(r(),2.2);o[i+3]=r();});
    starGeometry?.dispose();starGeometry=geometryWith([['seed',seed,4]],count);stars.geometry=starGeometry;
  }
  let disposed=false,lost=false,frame=0,last=0,lastLayout=0,size=[0,0],scale=Math.min(window.devicePixelRatio||1,1.25),quality=1,place_=null;
  const parallax={x:0,y:0,tx:0,ty:0};
  /* Desktop mouse over exposed background only: panels, rail, header and every control keep their particles still. */
  const fineQuery=window.matchMedia?.('(hover: hover) and (pointer: fine)');
  const BLOCKERS='.jp-panel,.jarvis-rail,.jarvis-header,.jarvis-ask,.jarvis-shortcuts,.jarvis-menu,.jarvis-insight,.jarvis-greeting,.jarvis-notes,.jarvis-panel-backdrop,button,input,select,textarea,a,[role="dialog"] .jarvis-sheet';
  const cursor={x:0,y:0,vx:0,vy:0,on:false,moved:0,sampled:0};let globeBand=null;
  const live={stirring:false,lastFrame:0,mix:[1,0,0,0],level:0,feed:0,energy:0,travel:0,lastNow:0,intervals:[],adaptAt:0};
  /* Layout is sampled on resize/observer changes and at most once a second, never per particle. */
  function measure(now){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return false;
    if(w!==size[0]||h!==size[1]||renderer.getPixelRatio()!==scale){size=[w,h];renderer.setPixelRatio(scale);renderer.setSize(w,h,false);buildStars(w,h);place_=null;}
    if(place_&&now-lastLayout<1000)return true;lastLayout=now;
    const l=layout()||{cx:w/2,cy:h*.44,ring:Math.min(460,h*.49)};
    /* The globe sits under the ask bar (centred under the ring on the overview; under the panel on working pages). */
    const ring=Math.max(160,l.ring||460),R=ring*2.36,gx=Number.isFinite(l.globeX)?l.globeX:l.cx,gy=l.cy+ring*.848+R;
    uniforms.uRes.value.set(w,h);uniforms.uPixel.value=scale;uniforms.uCentre.value.set(l.cx,l.cy);uniforms.uRing.value=ring;uniforms.uPlanet.value.set(gx,gy,R);
    uniforms.uCapY0.value=clamp((gy-h-24)/R,0,.995);
    /* Feed: crown midpoint (the globe's apex) straight up to the ring centre; dispersal starts at its lower edge. */
    const apex=gy-R,dx=l.cx-gx,dy=l.cy-(apex+1),L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
    uniforms.uFrom.value.set(gx,apex+1);uniforms.uTo.value.set(l.cx-ux*ring*.08,l.cy-uy*ring*.08);uniforms.uRingPx.value=ring;
    uniforms.uEnter.value=clamp((L-ring*.43)/Math.max(1,L-ring*.08),0,.95);
    globeBand={cx:gx,cy:gy,R};
    place_=l;return true;
  }
  /* The same signals, helper and smoothing the ring uses, so both feel driven by one system. */
  function step(now,dt){
    const sig=signals()||{},phase=sig.phase||'idle',m=sig.motion||{},state=STATE[phase]??0,reduced=!!reducedQuery?.matches;
    for(let i=0;i<4;i++)live.mix[i]+=((i===state?1:0)-live.mix[i])*(1-Math.exp(-dt*2.4));
    const target=clamp(audioLevel(phase,m,now)*2.45,0,1.4);live.level+=(target-live.level)*(1-Math.exp(-dt*(target>live.level?14:4.5)));
    /* Feed only while really thinking or speaking; speech energy follows the output level, so pauses thin the streams.
       Any other phase (listening after an interruption, paused, idle) releases it within about half a second. */
    const feedTarget=reduced?0:state===2?.62:state===3?clamp(.12+.88*Math.min(live.level,1),0,1):0;
    live.feed+=(feedTarget-live.feed)*(1-Math.exp(-dt*(feedTarget>live.feed?5:4.5)));
    if(live.feed>.002)live.travel+=dt*(.07+.22*live.feed);
    const energyTarget=live.feed+(state===1?.12*Math.min(live.level,1):0);live.energy+=(energyTarget-live.energy)*(1-Math.exp(-dt*4));
    uniforms.uLevel.value=Math.min(live.level,1);uniforms.uSpeak.value=live.mix[3];uniforms.uGather.value=live.mix[2]+live.feed*.5;
    uniforms.uFeed.value=live.feed;uniforms.uEnergy.value=live.energy;uniforms.uTravel.value=live.travel;uniforms.uReduced.value=reduced?1:0;
    streams.visible=live.feed>.003;return phase;
  }
  /* Frame pacing: if frames run long while the scene is active, thin the globe first, then lower resolution. */
  function adapt(now,interval){
    const s=live.intervals;s.push(interval);if(s.length>90)s.shift();if(s.length<90||now-live.adaptAt<3)return;
    const avg=s.reduce((x,y)=>x+y,0)/s.length;
    if(avg>28){if(quality>.35){quality=Math.max(.35,quality*.75);}else if(scale>.6){scale=Math.max(.6,scale-.2);}live.adaptAt=now;s.length=0;}
  }
  function draw(nowMs){
    if(disposed||lost)return;const now=nowMs/1000;
    if(!measure(nowMs)){try{onFeed({level:0});}catch{}return;}
    const dt=Math.min(live.lastNow?now-live.lastNow:1/60,.1);live.lastNow=now;
    const phase=step(now,dt);
    parallax.x+=(parallax.tx-parallax.x)*.06;parallax.y+=(parallax.ty-parallax.y)*.06;
    uniforms.uPar.value.set(parallax.x,parallax.y);uniforms.uTime.value=now;live.stirring=updateTrail(nowMs,dt);
    globeGeometry.setDrawRange(0,Math.round(GLOBE_COUNT*quality));
    try{renderer.render(scene,camera);try{onFeed({level:streams.visible?live.feed:0,phase});}catch{}}catch(error){api.dispose();onError(error);}
  }
  function loop(now){
    frame=0;if(disposed||lost||document.hidden){live.lastFrame=0;return;}
    /* Pacing is judged on display frames (the ring's cadence), not on the globe's own 30 fps rest rhythm. */
    if(live.lastFrame)adapt(now/1000,now-live.lastFrame);live.lastFrame=now;
    /* 30 fps at rest; every frame while streams move, so they glide with the ring. */
    if(live.feed>.01||live.stirring||cursor.on||now-last>=33){last=now;draw(now);}
    if(!disposed&&!lost&&!document.hidden&&!reducedQuery?.matches)frame=requestAnimationFrame(loop);
  }
  function start(){if(!frame&&!disposed&&!lost){live.lastNow=0;if(reducedQuery?.matches){live.feed=0;draw(performance.now());return;}frame=requestAnimationFrame(loop);}}
  function stop(){try{onFeed({level:0});}catch{}if(frame){cancelAnimationFrame(frame);frame=0;}}
  const onVisibility=()=>{if(document.hidden)stop();else start();};
  const onResize=()=>{place_=null;if(reducedQuery?.matches||!frame)draw(performance.now());};
  const onPointer=e=>{if(e.pointerType&&e.pointerType!=='mouse')return;const w=window.innerWidth||1,h=window.innerHeight||1;parallax.tx=-(e.clientX/w-.5)*10;parallax.ty=-(e.clientY/h-.5)*6;
    const exposed=!!fineQuery?.matches&&!reducedQuery?.matches&&!e.target?.closest?.(BLOCKERS)&&!!globeBand&&Math.hypot(e.clientX-globeBand.cx,e.clientY-globeBand.cy)<globeBand.R+40;
    if(!exposed){cursor.on=false;return;}
    const now=performance.now(),dt=Math.max(8,now-(cursor.moved||now-16));cursor.vx=clamp((e.clientX-cursor.x)/dt*16/12,-1,1);cursor.vy=clamp((e.clientY-cursor.y)/dt*16/12,-1,1);
    if(!cursor.on){cursor.vx=cursor.vy=0;}cursor.x=e.clientX;cursor.y=e.clientY;cursor.on=true;cursor.moved=now;};
  const onLeave=()=>{cursor.on=false;};
  /* Trail: a new sample about every 45 ms while the cursor moves over the globe; older samples fade, so grains settle. */
  function updateTrail(nowMs,dt){
    let any=false;for(const t of trail){t.z*=Math.exp(-dt*2.6);if(t.z<.002)t.z=0;else any=true;}
    const moving=cursor.on&&nowMs-cursor.moved<120;
    if(moving&&nowMs-cursor.sampled>45){cursor.sampled=nowMs;for(let i=TRAIL-1;i>0;i--){trail[i].copy(trail[i-1]);trailVel[i].copy(trailVel[i-1]);}trail[0].set(cursor.x,cursor.y,1);trailVel[0].set(cursor.vx,cursor.vy);any=true;}
    else if(moving){trail[0].set(cursor.x,cursor.y,Math.max(trail[0].z,.9));any=true;}
    return any;
  }
  const onMotion=()=>{stop();start();};
  const onLost=e=>{e.preventDefault();lost=true;stop();onError(new Error('WebGL context lost'));};
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('resize',onResize);window.addEventListener('pointermove',onPointer,{passive:true});document.addEventListener('pointerleave',onLeave);window.addEventListener('blur',onLeave);
  reducedQuery?.addEventListener?.('change',onMotion);canvas.addEventListener('webglcontextlost',onLost,false);
  const observer=window.ResizeObserver?new ResizeObserver(()=>onResize()):null;observer?.observe(canvas);
  const api={
    dispose(){
      if(disposed)return;disposed=true;stop();
      document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',onResize);window.removeEventListener('pointermove',onPointer);document.removeEventListener('pointerleave',onLeave);window.removeEventListener('blur',onLeave);
      reducedQuery?.removeEventListener?.('change',onMotion);canvas.removeEventListener('webglcontextlost',onLost,false);observer?.disconnect();
      for(const o of owned)o.dispose();starGeometry?.dispose();renderer.dispose();
    },
    relayout(){place_=null;},
    stats:()=>({from:[Math.round(uniforms.uFrom.value.x),Math.round(uniforms.uFrom.value.y)],to:[Math.round(uniforms.uTo.value.x),Math.round(uniforms.uTo.value.y)],enter:+uniforms.uEnter.value.toFixed(3),wake:+trail.reduce((m,t)=>Math.max(m,t.z),0).toFixed(3),cursor:cursor.on,centre:[Math.round(uniforms.uCentre.value.x),Math.round(uniforms.uCentre.value.y)],ring:Math.round(uniforms.uRing.value),scale,quality,globe:Math.round(GLOBE_COUNT*quality),streams:STREAM_COUNT,feed:+live.feed.toFixed(3),level:+live.level.toFixed(3),travel:+live.travel.toFixed(3),size:[...size],running:!!frame})
  };
  start();
  return api;
}
