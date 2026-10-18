/* WhatsApp recipient resolution and grounded schedule drafts with FICTIONAL chats. The connector is a stub: nothing is
   sent to WhatsApp. Model decisions are given as resolved intents (mocked), exactly as the live agent or Hermes pass them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createWhatsAppService,createMemoryStore} from '../tools/jarvis/whatsapp-service.mjs';
const require=createRequire(import.meta.url);
const RECORDS=require('../src/assistant/jarvis-records.js');
const source=fs.readFileSync(new URL('../src/assistant/jarvis-whatsapp-voice.js',import.meta.url),'utf8');
const liveSource=fs.readFileSync(new URL('../src/assistant/jarvis-live.js',import.meta.url),'utf8');

const SCHEDULE={props:[{id:'p1',name:'Villa Mar'},{id:'p2',name:'Casa Ejemplo'}],cleaners:[{id:'c1',name:'Maribel'},{id:'c2',name:'Tanja'}],
  sessions:[{id:'s1',propId:'p1',date:'2026-10-19',time:'11:00',status:'scheduled',crew:{main:[{cleanerId:'c1',status:'confirmed'},{cleanerId:'c2',status:'offered'}],alinaSpots:0,alinaStatus:'offered'}},
    {id:'s2',propId:'p2',date:'2026-10-19',time:'',status:'scheduled',cleanerIds:[]},{id:'s3',propId:'p2',date:'2026-10-19',time:'09:00',status:'cancelled',cleanerIds:[]}]};
function harness({compose=(day,lang)=>RECORDS.scheduleText(SCHEDULE,day,lang)}={}){
  let clock=10000;const sent=[],views=[],context=vm.createContext({window:{},AbortController,setTimeout,clearTimeout});vm.runInContext(source,context);
  const service=createWhatsAppService({store:createMemoryStore(),now:()=>clock,connector:{status:()=>({state:'open'}),sendText:async(jid,text)=>{sent.push({jid,text});return {id:'out-'+sent.length};}}});
  const say=(id,jid,text,extra={})=>service.receive({chatJid:jid,providerId:id,text,timestamp:100,live:true,...extra});
  say('g1','120363000000000001@g.us','Who is on tomorrow?',{senderName:'Maribel',groupName:'Sera Villas Cleaning Team'});
  say('g2','120363000000000002@g.us','Owner update',{senderName:'Owner',groupName:'Sera Villas Owners'});
  say('g3','120363000000000003@g.us','Pool heater?',{senderName:'Guest',groupName:'Villa Mar Guests'});
  say('d1','34600000001@s.whatsapp.net','Hi Antonio',{senderName:'Bex'});
  say('d2','34600000077@s.whatsapp.net','Hello',{senderName:'Cleaning Team'});
  const chats=service.inbox({view:'voice'}).chats,key=name=>chats.find(c=>c.name===name).key;
  const fetchImpl=async(url,init={})=>{
    const u=new URL(url,'https://fictional.invalid'),action=u.pathname.split('/').at(-1),body=init.body?JSON.parse(init.body):{};
    const reply=(data,status=200)=>({ok:status<400,status,json:async()=>data});
    if(action==='status')return reply({available:true,requestToken:'FICTIONAL'});
    try{if(action==='inbox'){const p=Object.fromEntries(u.searchParams);return reply({connection:service.connectionStatus(),...service.inbox({chat:p.chat||'',...(p.view?{view:p.view}:{})})});}
      if(action==='review')return reply(service.review(body.chat,body));if(action==='send')return reply(await service.send(body.chat,body));if(action==='read')return reply(service.markRead(body));throw Error('Unexpected endpoint');
    }catch(e){return reply({error:e.message},e.status||500);}
  };
  const workflow=context.window.SV_JARVIS_WHATSAPP_VOICE.create({fetchImpl,now:()=>clock,onChange:v=>views.push(v),compose});
  return {workflow,service,sent,views,key,match:context.window.SV_JARVIS_WHATSAPP_VOICE.match,chats};
}
const write=(name,extra={})=>({intent:{kind:'write',name,text:'',...extra}});

test('spoken and transcribed variants resolve against the full chat directory, with confirmation whenever approximate',()=>{
  const h=harness(),m=(s,o)=>{const r=h.match(s,h.chats,o);return r.exact.length?'exact:'+r.exact.map(c=>c.name):(r.clear?'confirm:':'choose:')+r.candidates.map(c=>c.name).sort().join('|')+(r.groupMissing?' (no group)':'');};
  assert.equal(m('Sera Villas Cleaning Team'),'exact:Sera Villas Cleaning Team');
  assert.equal(m('sera villas, cleaning-team'),'exact:Sera Villas Cleaning Team','punctuation and spacing');
  assert.equal(m('Seravillas Cleaning Team'),'exact:Sera Villas Cleaning Team','words run together');
  assert.equal(m('Séra Víllas Cleaning Team'),'exact:Sera Villas Cleaning Team','accents');
  for(const said of ['Sera Villa Cleaning Team','Serravilas Cleaning Team','Seravillas team','the sera villas cleaning group','Sera Villas cleaning teams','Sarah Villas Cleaning Team'])
    assert.equal(m(said),'confirm:Sera Villas Cleaning Team',said);
  assert.equal(m('Sera Villas'),'choose:Sera Villas Cleaning Team|Sera Villas Owners','similar groups offer a choice');
  assert.equal(m('cleaning team'),'choose:Cleaning Team|Sera Villas Cleaning Team','group/direct collision is never settled silently');
  assert.equal(m('cleaning team',{group:true}),'confirm:Sera Villas Cleaning Team','“the group” narrows to groups');
  assert.equal(m('Bex',{group:true}),'confirm:Bex (no group)','a direct chat is only offered, never chosen, when a group was asked for');
  assert.equal(m('Bexx'),'confirm:Bex');assert.equal(m('Sunset Lodge'),'choose:');assert.equal(m('Bex'),'exact:Bex');
});

test('the voice lookup sees every stored chat, not only the most recent page shown to models',()=>{
  const service=createWhatsAppService({store:createMemoryStore(),now:()=>1,connector:{status:()=>({state:'open'})}});
  for(let i=0;i<170;i++)service.receive({chatJid:'3460000'+String(i).padStart(4,'0')+'@s.whatsapp.net',providerId:'m'+i,text:'hi',senderName:'Contact '+i,timestamp:100+i,live:true});
  const voice=service.inbox({view:'voice'}).chats,screen=service.inbox().chats;
  assert.equal(voice.length,screen.length);assert.ok(voice.some(c=>c.name==='Contact 0'),'the oldest chat is still found');
});

test('tomorrow’s schedule for a misheard group: confirm the group, keep the request, draft from records, nothing sent or created',async()=>{
  const h=harness(),group=h.key('Sera Villas Cleaning Team'),before=JSON.stringify(SCHEDULE);
  let r=await h.workflow.handle('Write tomorrow’s schedule in the Serravilas Cleaning Team group',write('Serravilas Cleaning Team',{group:true,schedule:'2026-10-19'}));
  assert.equal(r.text,'Do you mean Sera Villas Cleaning Team, the WhatsApp group?');
  assert.equal(h.workflow.answers('yes'),true);assert.equal(h.workflow.answers('Approve and send'),false);
  assert.equal(h.workflow.context().heldRequest.schedule,'2026-10-19');
  r=await h.workflow.handle('Yes, that one');
  assert.match(r.text,/^Message to Sera Villas Cleaning Team, WhatsApp group\. Cleaning schedule for Monday 19 October:\n• 11:00 – Villa Mar: Maribel, Tanja \(to be confirmed\)\n• time to be confirmed – Casa Ejemplo: team not assigned yet\. Say “Approve and send”/);
  assert.doesNotMatch(r.text,/09:00/,'cancelled cleanings are left out');
  assert.equal(h.workflow.context().recipient.key,group);assert.equal(h.sent.length,0);assert.equal(JSON.stringify(SCHEDULE),before,'no cleaning records changed');
  await h.workflow.handle('Approve and send');assert.equal(h.sent.length,0,'approval before the read-back finished does nothing');
  r.afterSpoken();
  r=await h.workflow.handle('Make it start with Hola equipo',{intent:{kind:'edit',text:'Hola equipo. '+h.workflow.context().draft}});
  assert.equal(h.workflow.context().recipient.key,group,'edits keep the confirmed chat');assert.equal(h.workflow.snapshot().heard,false);
  await h.workflow.handle('Approve and send');assert.equal(h.sent.length,0,'an edit needs a fresh read-back');
  r.afterSpoken();r=await h.workflow.handle('Approve and send');
  assert.match(r.text,/Sent to Sera Villas Cleaning Team/);assert.equal(h.sent.length,1);assert.equal(h.sent[0].jid,'120363000000000001@g.us');assert.match(h.sent[0].text,/^Hola equipo\. Cleaning schedule/);
  await h.workflow.handle('Approve and send');assert.equal(h.sent.length,1,'never sent twice');
});

test('an unknown or rejected name keeps the original request; naming the group again continues without repeating it',async()=>{
  const h=harness();
  let r=await h.workflow.handle('Send tomorrow’s schedule to the cleaners chat',write('Sunset Lodge Crew',{schedule:'2026-10-19',language:'es'}));
  assert.match(r.text,/can’t find a chat called Sunset Lodge Crew/);assert.equal(h.workflow.context().stage,'name');
  // The model passes only the newly said name, as instructed; the schedule and language survive.
  r=await h.workflow.handle('It’s the group Sera Villa cleaning team',write('Sera Villa cleaning team',{group:true}));
  assert.equal(r.text,'Do you mean Sera Villas Cleaning Team, the WhatsApp group?');
  r=await h.workflow.handle('no');assert.match(r.text,/Which chat should I use/);
  r=await h.workflow.handle('Sera Villas Cleaning Team');
  assert.match(r.text,/^Message to Sera Villas Cleaning Team, WhatsApp group\. Limpiezas del lunes 19 de octubre:/);
  assert.match(r.text,/In English: Cleaning schedule for Monday 19 October/);assert.equal(h.sent.length,0);
});

test('choices: option numbers, “the group”, “the direct one”, a distinguishing word, and a dictated body that survives',async()=>{
  let h=harness(),r=await h.workflow.handle('Message the cleaning team: see you at nine',write('cleaning team',{text:'See you at nine'}));
  assert.match(r.text,/^Do you mean option 1, Cleaning Team, a direct chat .*; or option 2, Sera Villas Cleaning Team, the WhatsApp group\?/);
  r=await h.workflow.handle('the group');assert.match(r.text,/^Message to Sera Villas Cleaning Team, WhatsApp group\. See you at nine\./);
  h=harness();await h.workflow.handle('x',write('cleaning team',{text:'See you at nine'}));r=await h.workflow.handle('the direct one');
  assert.match(r.text,/^Message to Cleaning Team, Direct chat/);
  h=harness();await h.workflow.handle('x',write('Sera Villas',{text:'Meeting moved'}));r=await h.workflow.handle('the owners one');
  assert.match(r.text,/^Message to Sera Villas Owners/);
  h=harness();await h.workflow.handle('x',write('Sera Villas',{text:'Meeting moved'}));r=await h.workflow.handle('option two');
  assert.match(r.text,/^Message to Sera Villas (?:Owners|Cleaning Team)/);
  h=harness();await h.workflow.handle('x',write('Sera Villas',{text:'Meeting moved'}));r=await h.workflow.handle('yes');
  assert.match(r.text,/option number or the chat name/,'a bare yes cannot pick between two chats');assert.equal(h.sent.length,0);
  r=await h.workflow.handle('Cancel');assert.match(r.text,/Cancelled/);assert.equal(h.workflow.context().stage,null);
});

test('reading a misheard group works the same way; a model “choose” is accepted only for a listed option',async()=>{
  const h=harness();let r=await h.workflow.handle('Read the last message from the seravillas cleaning group',{intent:{kind:'read',name:'seravillas cleaning',group:true,limit:1}});
  assert.equal(r.text,'Do you mean Sera Villas Cleaning Team, the WhatsApp group?');
  r=await h.workflow.handle('yes',{intent:{kind:'choose',option:1}});assert.match(r.text,/Who is on tomorrow/);
  await h.workflow.handle('x',write('Sera Villas',{text:'x'}));r=await h.workflow.handle('three',{intent:{kind:'choose',option:3}});assert.match(r.text,/option number or the chat name/);
});

test('live and Hermes contracts carry a schedule date, never free-form schedule text, and reject unknown fields',async()=>{
  const ctx=vm.createContext({window:{SV_JARVIS_WHATSAPP_VOICE:{parse:()=>null}}});vm.runInContext(liveSource,ctx);const v=ctx.window.SV_JARVIS_LIVE.validateTool;
  assert.deepEqual(JSON.parse(JSON.stringify(v('whatsapp_request',{kind:'write',name:'Seravillas team',group:true,schedule:'tomorrow'},{today:'2026-10-18'}))),{kind:'write',name:'Seravillas team',group:true,schedule:'2026-10-19',text:''});
  assert.throws(()=>v('whatsapp_request',{kind:'read',name:'x',schedule:'tomorrow'},{today:'2026-10-18'}));
  assert.throws(()=>v('whatsapp_request',{kind:'write',name:'x',schedule:'someday'},{today:'2026-10-18'}));
  assert.throws(()=>v('whatsapp_request',{kind:'write',name:'x',text:'',sendNow:true},{today:'2026-10-18'}));
  const {parseDecision,conversationContext}=await import('../tools/jarvis/conversation.mjs');
  assert.deepEqual(parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind:'write',name:'Sera villa cleaning team',group:true,text:'',schedule:'tomorrow'}})).intent,{kind:'write',name:'Sera villa cleaning team',group:true,text:'',schedule:'tomorrow'});
  assert.throws(()=>parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind:'write',name:'x',text:'',schedule:'next year sometime'}})));
  const c=conversationContext({schema:1,whatsapp:{stage:'confirm',heldRequest:{kind:'write',hasText:false,schedule:'2026-10-19',language:'es',secret:'x'}}});
  assert.deepEqual(c.whatsapp.heldRequest,{kind:'write',hasText:false,schedule:'2026-10-19',language:'es'});assert.equal(c.whatsapp.stage,'confirm');
});
