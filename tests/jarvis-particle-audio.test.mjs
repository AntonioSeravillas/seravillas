import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// Exercise the real atmosphere frame/lifecycle with a graphics adapter; no browser, microphone or provider.
function scene({reduced=false}={}){
  let now=0,id=0,phase='thinking',fail=false;const frames=new Map(),events={},feeds=[],renders=[];
  class Vector{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z=0){Object.assign(this,{x,y,z});return this;}copy(v){return this.set(v.x,v.y,v.z);}}
  class Resource{constructor(options){Object.assign(this,options);}dispose(){}setAttribute(){}setDrawRange(){}}
  class Object3D{constructor(geometry){this.geometry=geometry;}add(){}}
  class Renderer{setClearColor(){}setPixelRatio(v){this.ratio=v;}getPixelRatio(){return this.ratio;}setSize(){}render(){if(fail)throw Error('test GPU loss');renders.push(now);}dispose(){}}
  const sandbox={THREE:{WebGLRenderer:Renderer,Vector2:Vector,Vector3:Vector,BufferGeometry:Resource,BufferAttribute:Resource,PlaneGeometry:Resource,ShaderMaterial:Resource,Scene:Object3D,OrthographicCamera:Object3D,Mesh:Object3D,Points:Object3D},audioLevel:()=>.5,performance:{now:()=>now},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},window:{devicePixelRatio:1,matchMedia:q=>({matches:q.includes('reduced')?reduced:true,addEventListener(){},removeEventListener(){}}),addEventListener(){},removeEventListener(){}},document:{hidden:false,addEventListener(k,fn){events[k]=fn;},removeEventListener(){}}};
  const source=fs.readFileSync(new URL('../assets/graphics/jarvis-atmosphere.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createAtmosphere','function createAtmosphere');vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.factory=createAtmosphere;',sandbox);
  const api=sandbox.factory({clientWidth:1440,clientHeight:900,addEventListener(){},removeEventListener(){}},{signals:()=>({phase,motion:{}}),onFeed:value=>feeds.push(value)});
  function tick(count=1){for(let i=0;i<count;i++){now+=17;const next=frames.entries().next().value;if(!next)break;frames.delete(next[0]);next[1](now);}}
  return {api,feeds,renders,tick,setPhase:p=>{phase=p;},lose:()=>{fail=true;},hide(){sandbox.document.hidden=true;events.visibilitychange();}};
}
test('particle audio receives the drawn feed intensity and phase, then silence when hidden or disposed',()=>{
  const s=scene();s.tick(45);assert.ok(s.feeds.at(-1).level>.5);assert.equal(s.feeds.at(-1).phase,'thinking');assert.equal(s.feeds.length,s.renders.length);
  s.setPhase('speaking');s.tick(30);assert.equal(s.feeds.at(-1).phase,'speaking');assert.ok(s.feeds.at(-1).level>.1);
  s.hide();assert.equal(s.feeds.at(-1).level,0);const count=s.feeds.length;s.tick(5);assert.equal(s.feeds.length,count);s.api.dispose();assert.equal(s.feeds.at(-1).level,0);
});
test('reduced motion and a failed renderer cannot leave an audible particle feed',()=>{
  const reduced=scene({reduced:true});assert.equal(reduced.feeds.at(-1).level,0);reduced.api.dispose();
  const lost=scene();lost.tick(20);lost.lose();lost.tick(1);assert.equal(lost.feeds.at(-1).level,0);assert.equal(lost.api.stats().running,false);
});
