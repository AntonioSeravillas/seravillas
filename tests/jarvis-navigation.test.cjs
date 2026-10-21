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
  /* On a working page, close means the page: back to Overview, clearing a side result with it. */
  a.run('recordsView={id:"fictional"};navigationTurn("close")');assert.equal(a.run('recordsView'),null);assert.equal(a.run('page'),'overview');
  /* On Overview a records result is the foreground item and closes first. */
  a.run('recordsView={id:"fictional"};navigationTurn("close")');assert.equal(a.run('recordsView'),null);assert.match(a.events.at(-2),/Closed the records/);a.run('navigationTurn("bookings")');
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
test('real recognised owner speech (provider history, 19 Oct) reaches the internal views; filters and questions do not',()=>{
  const a=app();
  for(const [words,page] of [['Hi, Jarvis. Can you open my Tasks tab?','tasks'],['No, open tasks.','tasks'],['No, open tasks dashboard.','tasks'],['Can you open me Bookings tab?','bookings'],['Open bookings panel.','bookings'],
    ['Open bookings','bookings'],['Open the booking tab.','bookings'],['Okay, open cleanings.','cleanings'],['Could you please open the tasks tab?','tasks'],['Open the booking calendar.','bookings'],['Yeah, go to the dashboard.','overview']]){
    a.run('navigationTurn("overview")');if(page==='overview')a.run('navigationTurn("tasks")');
    assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);assert.equal(a.run('page'),page,words);
  }
  /* A view plus another question: the view opens and only the other words are left for the conversation. */
  a.run('navigationTurn("overview")');assert.equal(a.run('JSON.stringify(navigationWords("Open tasks. Mm. So how much usage do I have?"))'),JSON.stringify({rest:'So how much usage do I have?'}));assert.equal(a.run('page'),'tasks');
  a.run('navigationTurn("overview")');
  for(const words of ['What tasks are due tomorrow?','Show me the tasks due tomorrow','Show me the bookings for next week','Open that booking','Open Villa Mar','Don’t open bookings','Mm.','No.'])assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),false,words);
  assert.equal(a.run('page'),'overview');
  a.run('navigationWords("Close the conversation")');assert.ok(a.events.some(e=>/^paused: /.test(e)),'closing the conversation ends it, distinct from closing a view');
});
test('Properties: natural wording opens the full internal page; property questions and named villas stay with the record tools',()=>{
  const a=app();a.elements['jarvis-properties-page']={hidden:true};
  for(const words of ['open properties','Show me my villas.','Hi, Jarvis. Can you open the properties tab?','go to the villas page','Open property.','um open the propertis','Could you bring up my villas please?']){
    a.run('navigationTurn("overview")');assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);
    assert.equal(a.run('page'),'properties',words);assert.equal(a.elements['jarvis-properties-page'].hidden,false,words);assert.equal(a.elements['jarvis-tasks-page'].hidden,true,words);
  }
  assert.match(a.events.filter(e=>typeof e==='string').at(-2)||'',/Here are your properties/);assert.ok(!a.events.some(e=>/^records:properties|^workspace:properties/.test(e)),'not a record list or the workspace screen');
  a.run('navigationTurn("overview")');
  for(const words of ['Which villas are free tomorrow?','Show me Villa Mar','Show me the villas with open issues','How many properties do I have?','Open the villa notes for Casa Ejemplo','Don’t open properties'])assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),false,words);
  assert.equal(a.run('page'),'overview');
  /* Close: a dialog first, then the page back to Overview. */
  a.run('navigationTurn("properties")');a.modal.open=true;a.run('navigationWords("close it")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'properties','the dialog closed, the page stayed');
  a.run('navigationWords("close it")');assert.equal(a.run('page'),'overview');assert.equal(a.elements['jarvis-properties-page'].hidden,true);
  a.run('navigationTurn("properties")');a.run('navigationWords("close properties")');assert.equal(a.run('page'),'overview');
});
test('a dialog with typed, unsaved text is not discarded by a spoken close or page change',()=>{
  const a=app();a.elements['jarvis-properties-page']={hidden:true};
  const field={value:'Entry code changed',defaultValue:'Entry code: fictional'};
  a.run('document.querySelector=s=>s==="#modal-root .modal"&&modal.open?{querySelectorAll:()=>modal.fields||[]}:null');
  a.run('navigationTurn("properties")');a.modal.open=true;a.modal.fields=[field];
  a.run('navigationWords("close it")');assert.equal(a.modal.open,true);assert.equal(a.run('page'),'properties');assert.match(a.events.filter(e=>typeof e==='string').at(-2),/unsaved changes/);
  a.run('navigationWords("open bookings")');assert.equal(a.modal.open,true);assert.equal(a.run('page'),'properties','no page change behind an unsaved form');
  field.value=field.defaultValue;a.run('navigationWords("close it")');assert.equal(a.modal.open,false,'unchanged text closes normally');
  a.modal.open=true;a.modal.fields=[];a.run('navigationWords("open bookings")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'bookings','dialogs without typed text keep the existing behaviour');
});
