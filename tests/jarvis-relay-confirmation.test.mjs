import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function page(){
  let focused=null;
  const node=tag=>({tag,children:[],events:{},attrs:{},removed:false,textContent:'',
    append(...children){this.children.push(...children);},appendChild(child){this.children.push(child);},
    setAttribute(name,value){this.attrs[name]=value;},remove(){this.removed=true;},
    addEventListener(event,callback){this.events[event]=callback;},focus(){focused=this;}});
  const ctx={window:{},document:{createElement:node,addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/jarvis.js',import.meta.url),'utf8'),ctx);
  const host=node('div');return {host,ask:ctx.window.SV_JARVIS.createRelayConfirmation,focused:()=>focused};
}

test('PC registration waits for an explicit on-screen confirmation, with Cancel as the default focus',()=>{
  const p=page(),decisions=[];p.ask(p.host,value=>decisions.push(value));
  const box=p.host.children[0],[confirm,cancel]=box.children[1].children;
  assert.deepEqual(decisions,[]);assert.equal(p.focused(),cancel);
  assert.match(box.children[0].textContent,/previously registered PC loses access/);
  assert.equal(box.attrs.role,'group');assert.equal(confirm.type,'button');
  confirm.events.click();confirm.events.click();cancel.events.click();
  assert.deepEqual(decisions,[true]);assert.equal(box.removed,true);
});

test('cancelling or closing settings cannot later confirm the discarded registration',()=>{
  for(const close of [false,true]){
    const p=page(),decisions=[],prompt=p.ask(p.host,value=>decisions.push(value));
    const box=p.host.children[0],[confirm,cancel]=box.children[1].children;
    if(close)prompt.cancel();else cancel.events.click();
    confirm.events.click();prompt.cancel();assert.deepEqual(decisions,[false]);assert.equal(box.removed,true);
  }
});
