/* Jarvis dashboard projections with FICTIONAL records: counts, windows and crew states come from the app data
   only; the inbox panel reflects only Jarvis's own inbox; nothing is written. */
const test=require('node:test');
const assert=require('node:assert/strict');
const DASH=require('../src/assistant/jarvis-dashboard.js');
const REF='2026-10-14'; // a Wednesday
const data=()=>({props:[{id:'mar',name:'Villa Mar',photos:['data:image/png;base64,AAAA']},{id:'casa',name:'Casa Ejemplo',photos:['javascript:alert(1)']},{id:'old',name:'Finca Prueba',archived:true}],
  cleaners:[{id:'a',name:'Ana'},{id:'b',name:'Bea'}],
  sessions:[{id:'s1',propId:'mar',date:REF,time:'9:00',crew:{main:[{cleanerId:'a',status:'offered'}],alinaSpots:0,alinaStatus:'offered'},status:'scheduled'},
    {id:'s2',propId:'casa',date:'2026-10-15',time:'11:00',cleanerIds:[],status:'scheduled'},
    {id:'s3',propId:'casa',date:'2026-10-16',time:'',crew:{main:[{cleanerId:'a',status:'confirmed'},{cleanerId:'b',status:'offered'}]},status:'scheduled'},
    {id:'s4',propId:'mar',date:'2026-10-17',cleanerIds:['b'],status:'scheduled'},
    {id:'s5',propId:'mar',date:REF,status:'cancelled'}],
  bookings:[{id:'b1',propId:'mar',checkIn:REF,checkOut:'2026-10-20',guestName:'GUEST_SENTINEL',status:'confirmed'},{id:'b2',propId:'casa',checkIn:'2026-10-10',checkOut:REF,checkOutTime:'10:00',status:'confirmed'},{id:'b3',propId:'casa',checkIn:'2026-10-15',checkOut:'2026-10-18',status:'cancelled'}],
  tasks:[{id:'t1',text:'Overdue',dueDate:'2026-10-12'},{id:'t2',text:'Today',dueDate:REF,propId:'mar'},{id:'t3',text:'Marked today',status:'today'},{id:'t4',text:'Friday',dueDate:'2026-10-16'},{id:'t5',text:'Sunday',dueDate:'2026-10-18'},{id:'t6',text:'Next week',dueDate:'2026-10-19'},{id:'t7',text:'Undated'},{id:'t8',text:'Done',dueDate:REF,done:true}],
  issues:[{id:'i1',title:'Low',priority:'low',status:'open',createdAt:'2026-10-10',propId:'mar'},{id:'i2',title:'High',priority:'high',status:'waiting',waitingFor:'Plumber',createdAt:REF},{id:'i3',title:'Fixed',status:'resolved'}]});
test('calendar: the day’s departures, cleanings, arrivals and due tasks by time, read-only, without guest identity',()=>{
  const d=data(),before=JSON.stringify(d),rows=DASH.calendar(d,REF);
  assert.deepEqual(rows.map(r=>[r.time,r.kind,r.title]),[['09:00','cleaning','Villa Mar'],['10:00','departure','Casa Ejemplo'],['16:00','arrival','Villa Mar'],['','task','Today']]);
  assert.match(rows[0].meta,/Offered/);assert.equal(rows[0].ref.id,'s1');
  assert.ok(!JSON.stringify(rows).includes('GUEST_SENTINEL'));assert.equal(JSON.stringify(d),before);
});
test('tasks: Today includes overdue and today-marked, This week runs to Sunday, Later holds the rest',()=>{
  const t=DASH.tasks(data(),REF);
  assert.deepEqual(t.counts,{today:3,week:2,later:2});
  assert.deepEqual(t.lists.today.map(x=>[x.text,x.dueLabel]),[['Overdue','Overdue'],['Today','Today'],['Marked today','Today']]);
  assert.deepEqual(t.lists.week.map(x=>x.text),['Friday','Sunday']);assert.equal(t.lists.today[1].property,'Villa Mar');
});
test('cleanings: crew states are truthful, cancelled are excluded and unsafe photo sources fall back',()=>{
  const c=DASH.cleanings(data(),REF,{required:id=>id==='casa'?2:1});
  assert.deepEqual(c.rows.map(r=>[r.id,r.state,r.status]),[['s1','offered','Offered'],['s2','needed','Team needed'],['s3','partial','Partly confirmed'],['s4','confirmed','Assigned']]);
  assert.equal(c.rows[0].photo,'data:image/png;base64,AAAA');assert.equal(c.rows[1].photo,'');
  assert.deepEqual(c.idle,[]);
});
test('issues and insights: open/waiting only, urgent first; counts state their window; inbox counts only when connected',()=>{
  const d=data();
  assert.deepEqual(DASH.issues(d,REF).map(i=>[i.title,i.status,i.ago]),[['High','Waiting · Plumber','Today'],['Low','Open','4 days ago']]);
  const i=DASH.insights(d,REF,{inbox:null,required:id=>id==='casa'?2:1});
  assert.deepEqual(i,{properties:2,arrivals:1,dueToday:3,needTeams:3,cleaningsWeek:4,unread:null});
  assert.equal(DASH.insights(d,REF,{inbox:{connection:{state:'open'},unreadCount:4}}).unread,4);
  assert.equal(DASH.insights(d,REF,{inbox:{connection:{state:'unreachable'},unreadCount:null}}).unread,null);
});
test('WhatsApp panel: Jarvis inbox summaries by stable key with real filter counts; nothing invented when unavailable',()=>{
  const inbox={chats:[{key:'a1',kind:'group',name:'Sample Team',preview:'Hi',unreadCount:2,draftStatus:'ready',updatedAt:5},{key:'b2',kind:'direct',name:'Sample Guest',preview:'Hello',unreadCount:0,awaitingReply:true}]};
  const all=DASH.whatsapp(inbox,'all');assert.deepEqual(all.counts,{all:2,unread:1,group:1,direct:1});
  assert.deepEqual(all.rows.map(r=>[r.key,r.kind,r.unread,r.draft,r.awaiting]),[['a1','group',2,'Draft ready',false],['b2','direct',0,'',true]]);
  assert.deepEqual(DASH.whatsapp(inbox,'unread').rows.map(r=>r.key),['a1']);
  assert.deepEqual(DASH.whatsapp(null,'all'),{counts:{all:0,unread:0,group:0,direct:0},rows:[]});
});
