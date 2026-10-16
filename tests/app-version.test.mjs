import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../src/app-version.js',import.meta.url),'utf8');

test('index.html has one version label and every app script and stylesheet carries a ?v= cache tag',()=>{
  assert.equal([...html.matchAll(/<meta name="sv-app-version" content="([^"]+)">/g)].length,1);
  const files=[...html.matchAll(/(?:src|href)="\.\/([^"]+\.(?:js|css))([^"]*)"/g)];
  assert.ok(files.length>40);
  for(const [,file,query] of files)assert.match(query,/^\?v=[\w.-]+$/,file+' needs a ?v= tag so a reload fetches it fresh');
  const order=[...html.matchAll(/<script src="\.\/([^"?]+)/g)].map(m=>m[1]);
  assert.ok(order.indexOf('src/app-version.js')>order.indexOf('src/config.js'));assert.ok(order.indexOf('src/app-version.js')<order.indexOf('src/app.js'));
});

function page({loaded='2026-10-16.7',remote='2026-10-16.8',dev=false,href='https://antonioseravillas.github.io/seravillas/',fail=false}={}){
  const requests=[],replaced=[],history=[],listeners={};let body=[];
  const node=()=>{const n={className:'',textContent:'',attrs:{},children:[],listeners:{},removed:false,setAttribute(k,v){n.attrs[k]=v;},addEventListener(t,f){n.listeners[t]=f;},append(...c){n.children.push(...c);},remove(){n.removed=true;body=body.filter(x=>x!==n);},querySelector(sel){return n.children.find(c=>'.'+c.className===sel)||null;}};return n;};
  const sandbox={URL,Date,Promise,
    location:{href,replace:u=>replaced.push(u)},history:{state:null,replaceState:(s,t,u)=>history.push(u)},
    document:{hidden:false,readyState:'complete',body:{appendChild:c=>{body.push(c);return c;}},createElement:node,addEventListener:(t,f)=>{listeners[t]=f;},
      querySelector:sel=>sel==='meta[name="sv-app-version"]'?{getAttribute:()=>loaded}:null},
    fetch:async(url,options)=>{requests.push({url,options});if(fail)throw Error('offline');return {ok:true,status:200,text:async()=>'<html><head><meta name="sv-app-version" content="'+remote+'"></head></html>'};},
    window:{SV_CONFIG:{isDev:dev}}};
  sandbox.window.window=sandbox.window;
  vm.runInNewContext(source,sandbox);
  return {api:sandbox.window.SV_APP_VERSION,requests,replaced,history,listeners,banners:()=>body};
}
const flush=()=>new Promise(r=>setImmediate(r));

test('opening the app checks a fresh copy of the page; a newer version shows the notice and Reload opens a fresh address',async()=>{
  const p=page();await flush();await flush();
  assert.equal(p.requests.length,1);const u=new URL(p.requests[0].url);
  assert.equal(u.pathname,'/seravillas/index.html');assert.ok(u.searchParams.get('version-check'));assert.equal(p.requests[0].options.cache,'no-store');
  const s=p.api.state();assert.equal(s.loaded,'2026-10-16.7');assert.equal(s.latest,'2026-10-16.8');assert.equal(s.updateAvailable,true);
  const [banner]=p.banners();assert.equal(banner.children[0].textContent,'Version 2026-10-16.8 is available (this device has 2026-10-16.7).');
  banner.children[1].listeners.click();assert.equal(p.replaced.length,1);
  const r=new URL(p.replaced[0]);assert.equal(r.pathname,'/seravillas/');assert.match(r.searchParams.get('app-reload'),/^2026-10-16\.8-\d+$/);
  await p.api.check();assert.equal(p.requests.length,1,'no repeat check within two minutes');
  await p.api.check({force:true});assert.equal(p.requests.length,2,'Check for updates always asks again');
});

test('same version: no notice and "up to date"; offline: a clear error; preview: no automatic request',async()=>{
  const same=page({remote:'2026-10-16.7'});await flush();await flush();assert.equal(same.api.state().updateAvailable,false);assert.equal(same.banners().length,0);assert.equal(same.api.state().error,'');
  const offline=page({fail:true});await flush();await flush();assert.match(offline.api.state().error,/Could not check for updates/);assert.equal(offline.banners().length,0);
  const dev=page({dev:true,href:'http://127.0.0.1:5510/'});await flush();assert.equal(dev.requests.length,0);
  await dev.api.check({force:true});assert.equal(dev.requests.length,1,'the owner can still check in a preview');
});

test('after a reload the marker is removed from the address bar',()=>{
  const p=page({href:'https://antonioseravillas.github.io/seravillas/?app-reload=2026-10-16.8-123#cleaning'});
  assert.deepEqual(p.history,['/seravillas/#cleaning']);
});

test('Settings shows the running version with Check for updates and Reload',()=>{
  const sandbox={window:{SV_APP_VERSION:{state:()=>({loaded:'2026-10-16.7',latest:'2026-10-16.8',updateAvailable:true,checkedAt:Date.now(),error:''}),reload(){},check:async()=>{}}},document:{documentElement:{getAttribute:()=>'light'}},
    esc:s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),render(){},Date};
  sandbox.window.window=sandbox.window;
  vm.runInNewContext(fs.readFileSync(new URL('../src/features/settings.js',import.meta.url),'utf8')+';this.out=renderSettingsVersion();',sandbox);
  assert.match(sandbox.out,/running version <strong>2026-10-16\.7<\/strong>/);assert.match(sandbox.out,/Version 2026-10-16\.8 is available/);
  assert.match(sandbox.out,/onclick="checkAppVersion\(\)"[^>]*>Check for updates</);assert.match(sandbox.out,/SV_APP_VERSION\.reload\(\)">Reload now</);
});
