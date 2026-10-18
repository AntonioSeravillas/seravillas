import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {DEFAULTS,MAX_PARTICLES,audioLevel} from '../assets/graphics/jarvis-particle-ring.js';

const source=fs.readFileSync(new URL('../src/assistant/jarvis-ring.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function host({desktop=true,webgl=true}={}){
  const queries=new Map(),frames=new Map(),warnings=[],created=[];let next=0;
  const ctx=new Proxy({},{get:()=>()=>{}});
  const makeCanvas=()=>{
    const events=new Map();
    const canvas={dataset:{},clientWidth:500,clientHeight:500,events,
      getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:500,height:500}),
      addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n),
      cloneNode:()=>makeCanvas(),replaceWith:node=>{result.current=node;}};
    created.push(canvas);return canvas;
  };
  const result={queries,frames,warnings,created,current:null};result.current=makeCanvas();
  const sandbox={URL,Promise,console:{warn:(...args)=>warnings.push(args)},document:{hidden:false,baseURI:'https://antonioseravillas.github.io/seravillas/'},
    performance:{now:()=>100},devicePixelRatio:1,addEventListener(){},removeEventListener(){},
    requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id),
    matchMedia:q=>{
      if(queries.has(q))return queries.get(q);
      const v={matches:q.includes('reduced')?false:desktop,listeners:new Set(),
        addEventListener:(n,f)=>v.listeners.add(f),removeEventListener:(n,f)=>v.listeners.delete(f)};
      queries.set(q,v);return v;
    }};
  sandbox.window=sandbox;if(webgl)sandbox.WebGL2RenderingContext=function(){};
  vm.runInNewContext(source,sandbox);result.api=sandbox;
  result.resize=wide=>{for(const [q,v] of queries){if(q.includes('min-width')){v.matches=wide;for(const f of [...v.listeners])f();}}};
  result.start=load=>sandbox.SV_JARVIS_RING.createDesktopRing(result.current,()=>'idle',()=>({input:0,output:0}),load);
  return result;
}

test('the approved desktop preset is fixed, with the pinned Three.js files intact',()=>{
  assert.deepEqual(DEFAULTS,{count:80000,size:1.2,diameter:.76,thickness:.045,speed:.9,noise:2.45,glow:1.05,sensitivity:2.45});
  assert.ok(Object.isFrozen(DEFAULTS));assert.equal(MAX_PARTICLES,80000);
  for(const [file,hash] of [
    ['three.module.js','9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea'],
    ['three.core.js','9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6']]){
    const bytes=fs.readFileSync(new URL('../assets/graphics/vendor/three-0.186.1/'+file,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  }
});

test('measured silence and speech levels are respected; sparse signals remain finite',()=>{
  assert.equal(audioLevel('speaking',{measuredOutput:true,output:0,outputPulse:1000},1),0);
  assert.equal(audioLevel('speaking',{measuredOutput:true,output:.4},1),.4);
  assert.equal(audioLevel('listening',{input:.6,inputPulse:-Infinity},1),.6);
  assert.equal(audioLevel('paused',{output:1},1),.025);
  assert.equal(audioLevel('thinking',{},1),.16);
  assert.ok(audioLevel('speaking',{outputPulse:1000},1)>.8);
  assert.equal(audioLevel('listening',{inputPulse:NaN},1),0);
  for(const phase of ['idle','speaking','listening','error','connecting'])assert.ok(Number.isFinite(audioLevel(phase,{},1)));
});

test('phones and browsers without WebGL stay on the existing membrane',()=>{
  for(const options of [{desktop:false},{webgl:false}]){
    const r=host(options),close=r.api.createJarvisRing(r.current,()=>'idle',()=>({}));
    assert.equal(r.created.length,1);assert.equal(r.current.dataset.ringRenderer,options.webgl===false?undefined:'original');
    assert.equal(r.frames.size,1);close();assert.equal(r.frames.size,0);
  }
});

test('an initially narrow window loads no graphics module until it grows to desktop width',async()=>{
  const r=host({desktop:false});let built=0;
  const close=r.start(async()=>({createParticleRing(){built++;return {dispose(){},reset(){}};}}));
  await flush();assert.equal(built,0);assert.equal(r.frames.size,1);
  r.resize(true);await flush();assert.equal(built,1);assert.equal(r.current.dataset.ringRenderer,'particles');close();
});

test('desktop loads the new default and failed imports retain a working original ring',async()=>{
  const r=host(),close=r.api.createJarvisRing(r.current,()=>'idle',()=>({}));
  assert.equal(r.current.dataset.ringRenderer,'particles-loading');assert.equal(r.frames.size,1);
  await flush();assert.equal(r.current.dataset.ringRenderer,'original-fallback');
  assert.equal(r.frames.size,1);assert.equal(r.warnings.length,1);close();assert.equal(r.frames.size,0);
});

test('closing during loading never constructs a late renderer',async()=>{
  let resolve,built=0;const module=new Promise(r=>resolve=r),r=host(),close=r.start(()=>module);
  await flush();close();resolve({createParticleRing(){built++;}});await flush();
  assert.equal(built,0);assert.equal(r.frames.size,0);
  for(const q of r.queries.values())assert.equal(q.listeners.size,0);
});

test('desktop graphics resize back to the original membrane, dispose once and can reopen',async()=>{
  let built=0,disposed=0,resets=0;
  const mod={createParticleRing(){built++;return {dispose(){disposed++;},reset(){resets++;}};}};
  const r=host(),close=r.start(async()=>mod);await flush();
  assert.equal(r.current.dataset.ringRenderer,'particles');assert.equal(r.frames.size,0);
  close.reset();assert.equal(resets,1);
  r.resize(false);assert.equal(r.current.dataset.ringRenderer,'original');assert.equal(disposed,1);assert.equal(r.frames.size,1);
  r.resize(true);await flush();assert.equal(r.current.dataset.ringRenderer,'particles');assert.equal(built,2);
  close();close();assert.equal(disposed,2);assert.equal(r.frames.size,0);
  for(const q of r.queries.values())assert.equal(q.listeners.size,0);
});

test('graphics startup and runtime failures replace the WebGL canvas with the 2D fallback',async()=>{
  for(const duringStartup of [true,false]){
    let fail,disposed=0;
    const r=host(),close=r.start(async()=>({createParticleRing(canvas,p,m,options){
      fail=options.onError;if(duringStartup)throw Error('no context');
      return {dispose(){disposed++;},reset(){}};
    }}));
    await flush();if(!duringStartup)fail(Error('lost context'));
    assert.equal(r.current.dataset.ringRenderer,'original-fallback');assert.equal(r.frames.size,1);
    assert.ok(r.created.length>=3,'a fresh canvas supports 2D after a WebGL attempt');
    assert.equal(disposed,duringStartup?0:1);close();assert.equal(r.frames.size,0);
  }
});
