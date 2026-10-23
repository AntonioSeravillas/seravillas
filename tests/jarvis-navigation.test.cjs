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
test('ending the conversation is distinct from closing a view; Issues and Reports open their internal pages',()=>{
  const a=app();
  a.run('navigationTurn("bookings")');a.run('navigationWords("end the conversation")');assert.ok(a.events.some(e=>/^paused: /.test(e)));assert.ok(!a.events.includes('closed jarvis'));
  a.run('navigationWords("close Jarvis")');assert.ok(a.events.includes('closed jarvis'));
  a.elements['jarvis-issues-page']={hidden:true};a.elements['jarvis-reports-page']={hidden:true};
  a.run('navigationTurn("issues")');assert.equal(a.run('page'),'issues');assert.equal(a.elements['jarvis-issues-page'].hidden,false);assert.ok(!a.events.includes('records:issues'));
  a.run('navigationTurn("reports")');assert.equal(a.run('page'),'reports');assert.equal(a.elements['jarvis-issues-page'].hidden,true);assert.ok(!a.events.some(e=>/^workspace:/.test(e)),'Reports no longer closes Jarvis');
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
test('Team, Reports and Issues: ordinary wording opens each full page; questions and filtered requests stay with the record tools',()=>{
  const a=app();for(const id of ['jarvis-team-page','jarvis-reports-page','jarvis-issues-page'])a.elements[id]={hidden:true};
  for(const [words,page] of [['open Team','team'],['Show me my cleaning team.','team'],['Can you open the team tab?','team'],['go to staff','team'],
    ['show me the reports','reports'],['Open reports.','reports'],['Hi Jarvis, could you open the revenue page?','reports'],['um open the reprts','reports'],
    ['open Issues','issues'],['Show me the issues.','issues'],['Okay, go to the problems tab.','issues'],['Open issue.','issues']]){
    a.run('navigationTurn("overview")');assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);
    assert.equal(a.run('page'),page,words);assert.equal(a.elements['jarvis-'+page+'-page'].hidden,false,words);
    for(const other of ['team','reports','issues'].filter(p=>p!==page))assert.equal(a.elements['jarvis-'+other+'-page'].hidden,true,words+' / '+other);
  }
  assert.ok(!a.events.some(e=>/^(?:records|workspace):/.test(e)),'pages, not record lists or the workspace');
  a.run('navigationTurn("overview")');
  for(const words of ['How much revenue did we make in October?','Show me the revenue for Villa Mar','Which issues are urgent?','Show me the open issues at Casa Ejemplo','Who is on the team tomorrow?','Show me the reports for last month','Don’t open issues','Open the issue about the boiler'])
    assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),false,words);
  assert.equal(a.run('page'),'overview');
  /* "Cleaners" keeps its existing meaning (Cleanings). */
  a.run('navigationWords("open cleaners")');assert.equal(a.run('page'),'cleanings');
  /* Close: a dialog first, then back to Overview; switching between pages keeps the shell. */
  a.run('navigationTurn("issues")');a.modal.open=true;a.run('navigationWords("close it")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'issues');
  a.run('navigationWords("open reports")');assert.equal(a.run('page'),'reports');a.run('navigationWords("close the reports")');assert.equal(a.run('page'),'overview');
  a.run('navigationTurn("team")');a.run('navigationWords("close it")');assert.equal(a.run('page'),'overview');
});
test('WhatsApp and Settings: "open WhatsApp" / "open Settings" use their openers; reading, writing and memory requests are not navigation',()=>{
  const a=app();for(const id of ['jarvis-whatsapp-page','jarvis-settings-page'])a.elements[id]={hidden:true};
  /* The real openers live elsewhere in jarvis.js; here they record the call and show the page as they do. */
  a.run('function openWhatsApp(intent){events.push("open whatsapp:"+JSON.stringify(intent));showPage("whatsapp");}function openPanel(kind){events.push("open settings");panel=kind;showPage("settings");}');
  for(const [words,page] of [['Open WhatsApp.','whatsapp'],['Can you open my WhatsApp inbox?','whatsapp'],['show me whats app','whatsapp'],['Open the inbox','whatsapp'],['Open settings.','settings'],['Jarvis, go to the settings page','settings']]){
    a.run('panel=null;navigationTurn("overview")');assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),true,words);assert.equal(a.run('page'),page,words);assert.equal(a.elements['jarvis-'+page+'-page'].hidden,false,words);
  }
  assert.ok(a.events.includes('open whatsapp:null'),'opening the inbox carries no message or chat');
  a.run('panel=null;navigationTurn("overview")');const before=a.events.length;
  for(const words of ['Read my unread WhatsApp messages','Write a WhatsApp message to Sample Guest saying hello','Any new messages on WhatsApp?','Open the WhatsApp chat with Sample Guest','Show my saved preferences','Don’t open settings'])
    assert.equal(a.run('navigationWords('+JSON.stringify(words)+')'),false,words);
  assert.equal(a.run('page'),'overview');assert.equal(a.events.length,before,'nothing opened');
});
test('closing WhatsApp or Settings returns to the page they were opened from; a dialog closes first',()=>{
  const a=app();for(const id of ['jarvis-whatsapp-page','jarvis-settings-page'])a.elements[id]={hidden:true};
  a.run('let __wa=false;var SV_JARVIS_WHATSAPP={isEmbedded:()=>__wa,close(){__wa=false;events.push("wa closed");}};window.SV_JARVIS_WHATSAPP=SV_JARVIS_WHATSAPP;');
  a.run('function openWhatsApp(){if(page!=="whatsapp")waReturn=returnPage(page);showPage("whatsapp");__wa=true;}function openPanel(kind){if(page!=="settings")settingsReturn=returnPage(page);panel=kind;showPage("settings");}');
  a.run('navigationTurn("tasks")');a.run('navigationWords("open whatsapp")');assert.equal(a.run('page'),'whatsapp');
  a.modal.open=true;a.run('navigationWords("close it")');assert.equal(a.modal.open,false);assert.equal(a.run('page'),'whatsapp','a dialog closes first');
  a.run('navigationWords("close it")');assert.equal(a.run('page'),'tasks','back to the page WhatsApp was opened from');assert.ok(a.events.includes('wa closed'));
  a.run('navigationTurn("reports")');a.run('navigationWords("open settings")');assert.equal(a.run('page'),'settings');assert.equal(a.run('settingsReturn'),'reports','Settings remembers where it was opened from');a.run('navigationWords("close it")');assert.equal(a.run('panel'),null,'close dismisses Settings first');assert.match(a.events.filter(e=>typeof e==="string").at(-2),/Closed Settings/);a.run('showPage("reports")');
  /* Switching straight from WhatsApp to another page closes the inbox (its typed reply is kept by the inbox itself). */
  a.run('navigationWords("open whatsapp")');a.run('navigationWords("open bookings")');assert.equal(a.run('page'),'bookings');assert.equal(a.run('__wa'),false);
});
