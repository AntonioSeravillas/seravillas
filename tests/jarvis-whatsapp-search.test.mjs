import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWhatsAppService,createMemoryStore,parseSearch,matchTerms} from '../tools/jarvis/whatsapp-service.mjs';
import {parseDecision,conversationContext} from '../tools/jarvis/conversation.mjs';

/* Fictional guests and chats only; the connector cannot send. */
const H=3600_000,D=24*H,LUCIA='34600000301@s.whatsapp.net',TOM='34600000302@s.whatsapp.net',OLD='34600000303@s.whatsapp.net',KIM='34600000304@s.whatsapp.net',TEAM='34600000399@g.us';
function setup(){
  const clock={t:1792100000000},calls=[],sends=[];
  const s=createWhatsAppService({store:createMemoryStore(),now:()=>clock.t,connector:{status:()=>({state:'open'}),sendText:async(...a)=>{sends.push(a);throw Error('No sends in tests');}}});
  s.recordConnection('open');let n=0;
  const rx=(text,jid,name,{fromMe=false,ago=0,media}={})=>s.receive({providerId:'x'+(++n),chatJid:jid,text,fromMe,senderName:name,timestamp:(clock.t-ago)/1000,live:true,...(media?{media}:{})});
  rx('¿Tenéis piscina climatizada?',LUCIA,'Lucía',{ago:2*D+H});
  rx('Hola, ¿conocéis algún chef privado para el sábado?',LUCIA,'Lucía',{ago:2*D});
  rx('Sí, te paso el contacto.',LUCIA,'',{fromMe:true,ago:2*D-H});
  rx('Could we book a private chef for Friday dinner?',TOM,'Tom',{ago:5*H});
  rx('Necesitamos una cocinera para la cena del jueves',TEAM,'Ana',{ago:3*D});
  rx('The chef was amazing last month',OLD,'Old guest',{ago:9*D});
  rx('Pool is lovely, thanks',KIM,'Kim',{ago:H});
  rx('',KIM,'Kim',{ago:H/2,media:{type:'image'}});
  const context=vm.createContext({window:{},AbortController,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(new URL('../src/assistant/jarvis-whatsapp-voice.js',import.meta.url),'utf8'),context);
  const workflow=context.window.SV_JARVIS_WHATSAPP_VOICE.create({now:()=>clock.t,getToken:()=>'TEST',fetchImpl:async(url,init={})=>{
    const u=new URL(url,'http://local.invalid'),op=u.pathname.split('/').at(-1);calls.push(op);
    if(op!=='inbox')throw Error('Search must only read the inbox: '+op);
    const p=Object.fromEntries(u.searchParams);for(const k of ['limit','offset'])if(p[k]!==undefined)p[k]=Number(p[k]);
    return {ok:true,json:async()=>({connection:s.connectionStatus(),...s.inbox(p)})};
  }});
  return {s,rx,clock,calls,sends,workflow,parse:context.window.SV_JARVIS_WHATSAPP_VOICE.parse};
}

test('natural English and Spanish search wording resolves to a bounded search; other requests keep their routes',()=>{
  const {parse}=setup(),plain=x=>x&&JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(parse('Did anyone ask about a private chef in the last seven days?')),{kind:'search',query:'private chef',days:7});
  assert.deepEqual(plain(parse('¿Alguien preguntó por un chef privado en los últimos siete días?')),{kind:'search',query:'chef privado',days:7});
  assert.deepEqual(plain(parse('Any messages about the pool heating in the past 3 days?')),{kind:'search',query:'pool heating',days:3});
  assert.deepEqual(plain(parse('Has anyone asked about late checkout this week?')),{kind:'search',query:'late checkout',days:7});
  assert.equal(parse('Who asked about a transfer yesterday?').days,2);assert.equal(parse('Search WhatsApp for babysitter').query,'babysitter');
  for(const t of ['Who is cleaning Villa Rosa tomorrow?','Show me bookings for next week','Did anyone ask about a chef in the last fifty days?'])assert.equal(parse(t),null,t);
  assert.equal(parse('Write a message to Bex saying did anyone ask about the chef?').kind,'write');
});

test('topic expansion covers English and Spanish wording, ignores accents/case and allows plurals',()=>{
  const q=parseSearch('days:7|private chef');
  for(const w of ['chef privado','cocinero','cocinera','catering'])assert.ok(q.expanded.includes(w),w);
  assert.deepEqual(matchTerms('¿Conocéis algún CHEF PRIVADO?',q.patterns).includes('chef privado'),true);
  assert.ok(matchTerms('Two cocineras for the party',q.patterns).includes('cocinera'));
  assert.deepEqual(matchTerms('Chefchaouen is lovely',q.patterns),[]);
  assert.deepEqual(parseSearch('days:3|pool heating').expanded,['pool heating']);
  assert.throws(()=>parseSearch('days:31|chef'),/between 1 and 30/);assert.throws(()=>parseSearch('days:7|'),/what to search/);
});

test('search finds matches across direct chats and groups inside the window, with context, replies and incomplete coverage',()=>{
  const {s}=setup(),unreadBefore=s.inbox().unreadCount;
  const r=s.inbox({view:'history',query:'days:7|private chef',limit:10,direction:'incoming'});
  assert.deepEqual(r.results.map(x=>[x.name,x.kind,x.answered]),[['Tom','direct',false],['Lucía','direct',true],['Unnamed group','group',false]]);
  assert.equal(r.results[2].sender,'Ana');assert.match(r.results[1].text,/chef privado/);
  assert.deepEqual(r.results[1].context.map(c=>[c.position,c.from]),[['before','contact'],['after','owner']]);
  assert.equal(r.page.total,3);assert.equal(r.search.days,7);assert.equal(r.search.chatsSearched,5);assert.match(r.search.note,/attachments/);
  assert.equal(r.coverage.history.days,7);assert.equal(r.coverage.history.complete,false);
  assert.equal(s.inbox().unreadCount,unreadBefore,'searching marks nothing read');
  assert.equal(s.inbox({view:'history',query:'days:14|private chef',limit:10}).page.total,4,'a longer window reaches older messages');
});

test('the app answer gives originals, dates, who/where, reply status, context and the coverage note — and never sends or marks read',async()=>{
  const h=setup(),r=await h.workflow.handle('',{intent:h.parse('Did anyone ask about a private chef in the last seven days?')});
  const lines=r.text.split('\n');
  assert.equal(lines[0],'I found 3 messages about “private chef” in the last 7 days. I also searched for personal chef, chef, cook, cooking.');
  assert.match(lines[1],/^1\. Tom, \w{3} \d{1,2} \w{3}, \d\d:\d\d \(5 hours ago\): “Could we book a private chef for Friday dinner\?”$/);
  assert.match(r.text,/2\. Lucía, .*\(2 days ago\): “Hola, ¿conocéis algún chef privado para el sábado\?” You replied afterwards\.\n   Before — Lucía: “¿Tenéis piscina climatizada\?”\n   After — You: “Sí, te paso el contacto\.”/);
  assert.match(r.text,/3\. Ana in Unnamed group, .*“Necesitamos una cocinera para la cena del jueves”/);
  assert.match(lines.at(-1),/^Note: Incomplete: .* Attachments and voice notes are not searched\.$/);
  assert.equal(r.reading.kind,'search');assert.equal(r.reading.results.length,3);assert.ok(r.reading.results.every(x=>x.date&&x.ago));assert.equal(r.reading.coverage.history.complete,false);
  assert.equal(r.afterSpoken,null);assert.deepEqual(h.calls,['inbox']);assert.equal(h.sends.length,0);
});

test('no match says "none in the stored messages" with the coverage note; paging reports what remains',async()=>{
  const h=setup();let r=await h.workflow.handle('',{intent:h.parse('Did anyone ask about a babysitter this week?')});
  assert.match(r.text,/^I found no messages about “babysitter” in the stored WhatsApp messages from the last 7 days\. I also searched for babysitting, nanny, canguro, niñera\.\nNote: Incomplete/);
  for(let i=0;i<9;i++)h.rx('Is the chef available on day '+i+'?',TOM,'Tom',{ago:i*H});
  r=await h.workflow.handle('',{intent:{kind:'search',query:'chef',days:7}});assert.equal(r.reading.total,12);assert.match(r.text,/\nThere are 7 more\.\n/);
  r=await h.workflow.handle('',{intent:{kind:'search',query:'chef',days:7,offset:10}});assert.match(r.text,/continuing from result 11/);assert.equal(r.reading.results.length,2);
});

test('Hermes may request a search and receives the results with coverage for an English presentation',()=>{
  const d=parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind:'search',query:'private chef',days:7,terms:['chef privado','cocinero']}}));
  assert.deepEqual(d,{kind:'whatsapp',intent:{kind:'search',query:'private chef',days:7,terms:['chef privado','cocinero']}});
  assert.throws(()=>parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind:'search',query:'chef',days:40}})),/interpret/);
  assert.throws(()=>parseDecision(JSON.stringify({kind:'whatsapp',intent:{kind:'search'}})),/interpret/);
  const ctx=conversationContext({schema:1,ownerTurns:['Did anyone ask about a private chef?'],whatsappReading:{kind:'search',topic:'private chef',days:7,terms:['private chef','chef privado'],
    results:[{name:'Lucía',kind:'direct',from:'contact',text:'¿Conocéis algún chef privado?',at:1792000000,date:'Tue 14 Oct, 18:05',ago:'2 days ago',answered:true,context:[{position:'after',name:'Lucía',from:'owner',text:'Sí.',at:1792003600}]}],
    coverage:{history:{complete:false,summary:'Incomplete: history only since 2026-10-14.'}}}});
  assert.equal(ctx.whatsappReading.kind,'search');assert.equal(ctx.whatsappReading.results[0].answered,true);assert.equal(ctx.whatsappReading.results[0].context[0].position,'after');
  assert.equal(ctx.whatsappReading.complete,false);assert.match(ctx.whatsappReading.coverageSummary,/Incomplete/);
});

test('regression: speech that drops the opening words is still a search; a time period is required for the loose forms',()=>{
  const {parse}=setup(),plain=x=>x&&JSON.parse(JSON.stringify(x)),want={kind:'search',query:'private chef',days:7};
  for(const t of ['Ask about the private chef in the last seven days.','Anyone ask about a private chef?','about the private chef in the last seven days','So, did anyone ask about a private chef in the last seven days?','Um, has anyone asked about a private chef this week?'])assert.deepEqual(plain(parse(t)),want,t);
  for(const t of ['Ask Bex about the keys','Ask about the keys','Ask Bex if ten works tomorrow'])assert.equal(parse(t),null,t);
  assert.equal(parse('Write a message to Bex saying ask about the chef this week').kind,'write');
});

test('regression: live tool requests become a cross-chat search instead of a contact lookup, and only then',()=>{
  const sandbox={window:{},AbortController,setTimeout,clearTimeout,JSON,Promise,Map,Set};
  for(const file of ['jarvis-records.js','jarvis-whatsapp-voice.js','jarvis-live.js'])vm.runInNewContext(fs.readFileSync(new URL('../src/assistant/'+file,import.meta.url),'utf8'),sandbox);
  const validate=(args,ownerText)=>JSON.parse(JSON.stringify(sandbox.window.SV_JARVIS_LIVE.validateTool('whatsapp_request',args,{today:'2026-10-16',ownerText})));
  /* 22:32 transcript: opening words lost, agent asked for a chat named "private chef". */
  assert.deepEqual(validate({limit:10,kind:'history',name:'private chef',offset:0},'Ask about the private chef in the last seven days.'),{kind:'search',query:'private chef',days:7});
  /* 22:31 transcript: agent asked for history with search words and no chat; also when the transcript is garbled. */
  assert.deepEqual(validate({kind:'history',limit:10,offset:0,query:'private chef'},'Did anyone ask about a private chef in the last seven days?'),{kind:'search',query:'private chef',days:7});
  assert.deepEqual(validate({kind:'history',limit:10,offset:0,query:'private chef'},'What is this? Did anyone ask about a private chef … social diversity'),{kind:'search',query:'private chef',days:7});
  assert.deepEqual(validate({kind:'search',query:'boat trip',days:3,terms:['barco']},'search'),{kind:'search',query:'boat trip',days:3,terms:['barco']});
  /* Ordinary chat requests are unchanged. */
  assert.deepEqual(validate({kind:'history',name:'Bex',limit:10,offset:0,query:'door'},'What did Bex say about the door?'),{kind:'history',name:'Bex',limit:10,offset:0,query:'door'});
  assert.equal(validate({kind:'write',name:'Bex',text:'Hello'},'Write to Bex saying hello').kind,'write');
  assert.throws(()=>validate({kind:'history',limit:10},'anything'),/known chat/);
  assert.throws(()=>validate({kind:'search',query:'chef',days:45},'x'),/between 1 and 30/);
  assert.throws(()=>validate({kind:'search',query:'chef',send:true},'x'),/Unexpected/);
});
