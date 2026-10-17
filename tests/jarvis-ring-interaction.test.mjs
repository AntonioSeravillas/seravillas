import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/assistant/jarvis-ring.js',import.meta.url),'utf8');

function runtime({desktop=true,fine=true,reduced=false,preview=true}={}){
  const queries=new Map(),events=new Map(),windowEvents=new Map(),frames=new Map(),trace=[];let next=0;
  const ctx=new Proxy({createRadialGradient:(...v)=>{trace.push(['gradient',...v]);return {addColorStop(){}};}},{get(o,k){return k in o?o[k]:(...v)=>{if(k==='lineTo'||k==='arc')trace.push([k,...v]);};}});
  const canvas={clientWidth:500,width:0,height:0,dataset:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:500,height:500}),addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
  const sandbox={window:null,document:{hidden:false},Math,performance:{now:()=>100},devicePixelRatio:1,
    requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id)};
  sandbox.window=sandbox;sandbox.SV_CONFIG={isDev:preview};
  sandbox.addEventListener=(n,f)=>windowEvents.set(n,f);sandbox.removeEventListener=n=>windowEvents.delete(n);
  sandbox.matchMedia=q=>{const v={matches:q.includes('reduced')?reduced:q.includes('hover')?desktop&&fine:desktop,listeners:new Set(),addEventListener:(n,f)=>v.listeners.add(f),removeEventListener:(n,f)=>v.listeners.delete(f)};queries.set(q,v);return v;};
  vm.runInNewContext(source,sandbox);
  const start=()=>sandbox.createJarvisRing(canvas,()=>'idle',()=>({input:0,output:0,inputPulse:-1e9,outputPulse:-1e9,speech:false}));
  const step=now=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn(now);};
  return {sandbox,canvas,queries,events,windowEvents,frames,trace,start,step};
}

test('mouse displacement is local and bounded, leaves a short wake, and settles back after leaving',()=>{
  const r=runtime(),p=r.sandbox.SV_JARVIS_RING.createInteraction(),out=[0,0];
  p.move(.33,.02,100);for(let i=0;i<20;i++)p.update(1/60,100+i*16);
  p.warp(175,0,500,420,out);assert.ok(Math.hypot(out[0]-175,out[1])>1);
  assert.ok(Math.hypot(out[0]-175,out[1])<30);
  p.update(.06,2400);p.warp(-175,0,500,2400,out);assert.ok(Math.hypot(out[0]+175,out[1])<.00001,'opposite side is undisturbed after the wake');
  assert.equal(p.state.waves.length,0);p.leave();for(let i=0;i<120;i++)p.update(1/60,2500+i*16);
  p.warp(175,0,500,4500,out);assert.ok(Math.hypot(out[0]-175,out[1])<.01,'returns to the original membrane');
  for(let i=0;i<100;i++)p.move(i%2?.49:-.49,.1,4600+i*16);
  assert.ok(p.state.waves.length<=3&&Math.abs(p.state.vx)<=1);
});

test('mouse response is desktop-only; touch, coarse pointers and reduced motion never activate it',()=>{
  for(const options of [{desktop:false},{fine:false},{reduced:true}]){
    const r=runtime(options),stop=r.start();assert.equal(r.events.has('pointermove'),false);assert.equal(r.canvas.dataset.ringInteractive,undefined);stop();
  }
  const r=runtime({preview:false}),stop=r.start();assert.equal(r.canvas.dataset.ringInteractive,'desktop','available on the hosted app as well as the preview');
  r.events.get('pointermove')({pointerType:'touch',clientX:420,clientY:250});r.step(100);assert.equal(r.canvas.dataset.ringHover,'idle');
  r.events.get('pointermove')({pointerType:'mouse',clientX:420,clientY:250});r.step(132);assert.equal(r.canvas.dataset.ringHover,'active');
  const reduced=r.queries.get('(prefers-reduced-motion: reduce)');reduced.matches=true;for(const f of reduced.listeners)f();assert.equal(r.events.has('pointermove'),false);assert.equal(r.canvas.dataset.ringHover,undefined);stop();
});

test('the desktop ring is modestly larger; the mobile rendering stays identical across environments',()=>{
  const baseline=runtime({desktop:false}),study=runtime({preview:false});baseline.start();study.start();baseline.step(100);study.step(100);
  const radius=r=>r.trace.find(x=>x[0]==='gradient')[6]/1.38;
  assert.ok(radius(study)/radius(baseline)>1.09&&radius(study)/radius(baseline)<1.13);
  const mobile=runtime({desktop:false}),original=runtime({desktop:false,preview:false});mobile.start();original.start();mobile.step(100);original.step(100);
  assert.deepEqual(mobile.trace,original.trace);
});

test('closing the ring cancels animation and removes pointer and media-query listeners',()=>{
  const r=runtime(),stop=r.start();assert.ok(r.events.size>0);r.step(100);assert.equal(r.frames.size,1);
  stop();assert.equal(r.frames.size,0);assert.equal(r.events.size,0);assert.equal(r.windowEvents.size,0);
  for(const q of r.queries.values())assert.equal(q.listeners.size,0);assert.equal(r.canvas.dataset.ringInteractive,undefined);
});
