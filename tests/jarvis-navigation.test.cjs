const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/assistant/jarvis.js'),'utf8');
// Run the actual shell transitions against disposable view elements; no microphone, provider or storage.
function app(){
  const elements=Object.fromEntries(['jarvis-bookings-page','jarvis-cleanings-page','jarvis-tasks-page'].map(id=>[id,{hidden:true}]));
  const events=[];const modal={open:false};
  const ctx=vm.createContext({elements,events,modal,console});
  vm.runInContext(`let root={dataset:{},classList:{toggle(k,on){on?classes.add(k):classes.delete(k)},contains(k){return classes.has(k)}}};
    let panel=null,recordsView=null,expanded=null,live={updateContext(){events.push('context')}};
    const classes=new Set();const window={};
    const document={querySelector:s=>s==='#modal-root .modal'&&modal.open?{}:null};const closeModal=()=>{modal.open=false;events.push('modal closed')};
    const el=id=>elements[id];const add=(role,text)=>events.push(text);const speak=()=>{};
    const closeContext=()=>classes.delete('has-context');const closeRecords=()=>{recordsView=null};
    const closePanel=()=>{panel=null};const clearFocus=()=>{};const liveContext=()=>({});const focusPanel=p=>events.push('focus:'+p);
    const expandPanel=p=>{expanded=expanded===p?null:p};const setNav=()=>{};const syncLastReply=()=>{};
    const stop=()=>events.push('stop');const closeJarvis=()=>events.push('closed jarvis');const pauseVoice=t=>events.push('paused: '+t);
    const showRecords=q=>{recordsView=q;events.push('records:'+q.entity)};const goWorkspace=d=>events.push('workspace:'+d);
    const renderDashboard=()=>events.push('dashboard');const renderWorkPage=()=>events.push('render:'+page);
    const atmosphereRelayout=null;`,ctx);
  vm.runInContext(source.slice(source.indexOf("  let page='overview'"),source.indexOf('  function renderWorkPage(){')),ctx);
  return {run:s=>vm.runInContext(s,ctx),elements,events,modal};
}
test('natural navigation: ordinary and imperfect wording opens the real internal views; close returns to dashboard without ending voice',()=>{
  const a=app();
  for(const words of ['open the booking tab','Can you open bookings for me?','show the calendar please','take me to the bookings calendar','Jarvis, pull up the reservations','um open the bookins tab','bookings tab','Could you bring up the booking tap?']){
    assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);
    assert.equal(a.run('page'),'bookings',words);assert.equal(a.elements['jarvis-bookings-page'].hidden,false);
    assert.ok(a.events.includes('render:bookings'));
    assert.equal(a.run('navigationWords("close it")'),true);assert.equal(a.run('page'),'overview');assert.equal(a.elements['jarvis-bookings-page'].hidden,true);
  }
  for(const [words,page] of [['go to the cleaning schedule','cleanings'],['show me the cleanins','cleanings'],['go back to the dashboard','overview'],['home screen please','overview']]){a.run('navigationTurn("bookings")');assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);assert.equal(a.run('page'),page,words);}
  for(const words of ['show me my tasks','open the to do list','open tasks']){a.run('navigationTurn("overview")');assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);assert.equal(a.run('page'),'tasks',words);assert.equal(a.elements['jarvis-tasks-page'].hidden,false);assert.ok(a.events.includes('render:tasks'));}
  assert.ok(!a.events.some(e=>/stop|closed jarvis|paused/.test(e)),'navigation never ends the conversation');
  for(const words of ['don’t open the booking tab','open that booking','show me the bookings for next week','what bookings do we have?','should I open bookings?','open the pool','open Bex'])assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),false,words);
});
test('close dismisses the foreground dialog, panel or record before the underlying page',()=>{
  const a=app();a.run('navigationTurn("bookings");panel="settings";navigationTurn("close")');
  assert.equal(a.run('panel'),null);assert.equal(a.run('page'),'bookings');
  a.modal.open=true;a.run('navigationWords("close that")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'bookings','a dialog closes before the page');
  a.run('recordsView={id:"fictional"};navigationTurn("close")');assert.equal(a.run('recordsView'),null);assert.equal(a.run('page'),'bookings');
  a.run('navigationTurn("close");navigationTurn("close")');assert.equal(a.run('page'),'overview');assert.match(a.events.at(-2),/already on the dashboard/);
  a.run('navigationTurn("tasks")');assert.equal(a.run('page'),'tasks');a.modal.open=true;a.run('navigationWords("close it")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'tasks','a task dialog closes before the Tasks page');a.run('navigationWords("close tasks")');assert.equal(a.run('page'),'overview');assert.equal(a.elements['jarvis-tasks-page'].hidden,true);
});
test('ending the conversation is distinct from closing a view; other screens keep their existing routes',()=>{
  const a=app();
  a.run('navigationTurn("bookings")');a.run('navigationWords("end the conversation")');assert.ok(a.events.some(e=>/^paused: /.test(e)));assert.ok(!a.events.includes('closed jarvis'));
  a.run('navigationWords("close Jarvis")');assert.ok(a.events.includes('closed jarvis'));
  a.run('navigationTurn("issues")');assert.ok(a.events.includes('records:issues'));
  a.run('navigationTurn("reports")');assert.ok(a.events.includes('workspace:booking-report'),'Reports keeps its existing full-page route');
});
