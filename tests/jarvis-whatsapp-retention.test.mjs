import test from 'node:test';
import assert from 'node:assert/strict';
import {createWhatsAppService,createMemoryStore,chatKeyFor,LIMITS} from '../tools/jarvis/whatsapp-service.mjs';

/* Fictional chats only; the connector never sends. */
const DAY=86400_000,DM='34600000201@s.whatsapp.net',DM2='34600000202@s.whatsapp.net',GROUP='34600000299@g.us';
function setup({store=createMemoryStore(),start=1792100000000,limits}={}){
  const clock={t:start};
  const s=createWhatsAppService({store,now:()=>clock.t,...(limits?{limits}:{}),connector:{status:()=>({state:'open'}),sendText:async()=>{throw Error('No sends in tests');}}});
  let n=0;const receive=(text,{jid=DM,fromMe=false,at=clock.t,name='Mara'}={})=>s.receive({providerId:'p'+(++n)+'-'+at,chatJid:jid,text,fromMe,senderName:name,timestamp:at/1000,live:true});
  return {s,store,clock,receive,advance:ms=>{clock.t+=ms;}};
}

test('30-day retention keeps far more than 30 messages per chat with original text and WhatsApp timestamps',()=>{
  const h=setup();
  for(let i=0;i<45;i++)h.receive('Mensaje '+i+': ¿hay chef privado?',{at:h.clock.t-i*60_000});
  const chat=h.s.inbox({chat:chatKeyFor(DM)}).chat;
  assert.equal(chat.messagesStored,45);assert.equal(chat.messagesShown,LIMITS.chatView);assert.equal(chat.messages.length,30);
  assert.equal(chat.messages.at(-1).text,'Mensaje 0: ¿hay chef privado?');assert.equal(chat.messages.at(-1).at,Math.floor(h.clock.t/1000));assert.equal(chat.messages.at(-1).n,44);
  const page=h.s.inbox({chat:chatKeyFor(DM),view:'history',limit:10,offset:40,direction:'both'});assert.equal(page.page.total,45);assert.equal(page.chat.messages[0].text,'Mensaje 44: ¿hay chef privado?');
});

test('messages older than 30 days are dropped by the heartbeat; newer ones stay',()=>{
  const h=setup();h.s.recordConnection('open');
  h.receive('Old question',{at:h.clock.t});h.advance(10*DAY);h.receive('Newer question');
  h.advance(21*DAY);h.s.heartbeat();
  const texts=h.s.inbox({chat:chatKeyFor(DM)}).chat.messages.map(m=>m.text);assert.deepEqual(texts,['Newer question']);
});

test('first run records what the old 30-message limit already removed, without touching stored messages',()=>{
  const key=chatKeyFor(DM),at=1792000000;
  const legacy={format:1,settings:{accountConsent:true,modelConsent:false},chats:{[key]:{key,jid:DM,kind:'direct',name:'Mara',version:40,updatedAt:1,
    messages:Array.from({length:30},(_,i)=>({id:'k'+i,from:'contact',sender:'',text:'kept '+i,media:null,at:at+i,live:true})),
    seen:[...Array.from({length:12},(_,i)=>'gone'+i),...Array.from({length:30},(_,i)=>'k'+i),'echo1'],ownSent:['echo1'],draft:null,review:null,lastSend:null,notice:''}}};
  const store=createMemoryStore(legacy),h=setup({store});
  const cov=h.s.historyCoverage(7);
  assert.equal(cov.legacy.trimmedAtLeast,12);assert.equal(cov.legacy.chats,1);assert.equal(cov.complete,false);
  assert.match(cov.summary,/^Incomplete: Jarvis has messages from 2026-10-14 but gap tracking only began 2026-10-15; at least 12 earlier messages in 1 chats were trimmed by the old 30-message limit/);
  assert.equal(store.load().chats[key].messages.length,30);assert.equal(store.load().chats[key].messages[0].text,'kept 0');
  const again=setup({store}).s.historyCoverage(7);assert.equal(again.legacy.recordedAt,cov.legacy.recordedAt,'migration runs once');
});

test('a server stop and a disconnect are both reported as gaps; reconnecting quickly is not',()=>{
  const store=createMemoryStore(),h=setup({store});h.s.recordConnection('open');
  h.advance(5*60_000);h.s.heartbeat();h.advance(30_000);h.s.recordConnection('connecting');h.advance(20_000);h.s.recordConnection('open');
  assert.equal(h.s.historyCoverage(7).gaps.length,0,'a 20-second reconnect is not a gap');
  h.advance(4*60_000);h.s.heartbeat();const lastAlive=Math.floor(h.clock.t/1000);
  /* Server killed: no close event. A new process 2 hours later closes the session at its last heartbeat. */
  const later=setup({store,start:h.clock.t+2*3600_000});later.s.recordConnection('open');
  const cov=later.s.historyCoverage(1);
  assert.deepEqual(cov.gaps.map(g=>[g.from,g.to]),[[lastAlive,Math.floor(later.clock.t/1000)]]);assert.equal(cov.complete,false);assert.match(cov.summary,/1 connection gap/);
  later.advance(60_000);later.s.recordConnection('logged_out');const now=later.s.historyCoverage(1);
  assert.equal(now.connectedNow,false);assert.equal(now.gaps.at(-1).to,null);
});

test('complete coverage is claimed only after an uninterrupted, untrimmed window since tracking began',()=>{
  const h=setup();h.s.recordConnection('open');
  for(let d=0;d<8;d++){h.advance(DAY);h.s.heartbeat();}
  assert.equal(h.s.historyCoverage(7).complete,true);assert.match(h.s.historyCoverage(7).summary,/no recorded gaps/);
  assert.equal(h.s.historyCoverage(30).complete,false,'tracking is younger than 30 days');
});

test('a safety-cap trim is logged and makes the window incomplete; chat eviction is logged too',()=>{
  const h=setup({limits:{...LIMITS,messagesPerChat:5,chats:2}});h.s.recordConnection('open');
  for(let i=0;i<7;i++)h.receive('m'+i);
  let cov=h.s.historyCoverage(7);assert.equal(cov.trims.length,2);assert.equal(cov.trims[0].reason,'per-chat cap');
  h.receive('group',{jid:GROUP});h.receive('other',{jid:DM2});
  cov=h.s.historyCoverage(7);assert.ok(cov.trims.some(t=>t.reason==='chat limit'));assert.equal(cov.complete,false);
});

test('coverage reaches voice answers; the inbox screen stays well under the 256 KB relay limit',()=>{
  const h=setup();h.s.recordConnection('open');
  for(let i=0;i<400;i++)h.receive('x'.repeat(1990)+i,{at:h.clock.t-i*1000});
  const v=h.s.inbox({view:'recent',limit:1});assert.match(v.coverage.scope,/kept for 30 days/);assert.match(v.coverage.scope,/Incomplete/);assert.equal(v.coverage.history.days,7);
  assert.ok(JSON.stringify(h.s.inbox({chat:chatKeyFor(DM)})).length<120_000);
  assert.ok(JSON.stringify(h.s.inbox({view:'history',chat:chatKeyFor(DM),limit:10})).length<120_000);
});

test('a duplicate delivery of an already stored message is ignored',()=>{
  const h=setup();const first=h.s.receive({providerId:'same',chatJid:DM,text:'Hola',senderName:'Mara',timestamp:1792100000,live:true});
  const again=h.s.receive({providerId:'same',chatJid:DM,text:'Hola',senderName:'Mara',timestamp:1792100000,live:true});
  assert.equal(first.accepted,true);assert.equal(again.reason,'duplicate');assert.equal(h.s.inbox({chat:chatKeyFor(DM)}).chat.messagesStored,1);
});
