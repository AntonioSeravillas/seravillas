/* Jarvis-themed Bookings timeline with FICTIONAL records: stay spans follow the existing checkout-exclusive
   half-day rule, filters and lanes are honoured, text is escaped and rendering writes nothing. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function runtime(){
  const sandbox={console,Date,Math,JSON,window:null,innerWidth:1690,document:{activeElement:null},D:{props:[{id:'a',name:'Villa <Alpha>'},{id:'b',name:'Casa Beta'}],sessions:[],bookings:[]}};
  sandbox.window=sandbox;const context=vm.createContext(sandbox);const run=s=>vm.runInContext(s,context);
  run(fs.readFileSync(path.join(root,'src/utils/dates.js'),'utf8'));
  run(`var calView='timeline',calTimelineDate='2026-10-18',calFilter='all',calSelectedBk=null,calY=2026,calM=9;const TL_BEFORE=30,TL_AFTER=150;
    function daysBetween(a,b){const pa=a.split('-'),pb=b.split('-');return Math.round((new Date(+pb[0],+pb[1]-1,+pb[2])-new Date(+pa[0],+pa[1]-1,+pa[2]))/864e5);}
    function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function renderWorkspaceMonth(){return '<div class="wm-calendar">MONTH</div>';}
    function today(){return '2026-10-18';}`);
  run(fs.readFileSync(path.join(root,'src/features/booking-timeline.js'),'utf8'));
  const host={innerHTML:'',dataset:{},querySelector:()=>null};
  return {run,host,html:()=>{context.SV_BOOKINGS_VIEW.render(host);return host.innerHTML;}};
}
const bars=html=>[...html.matchAll(/data-bk-open="([^"]+)" style="left:(\d+)px;width:(\d+)px;top:([\d.]+)%"/g)].map(m=>({id:m[1],left:+m[2],width:+m[3],top:+m[4]}));
test('stays span from mid check-in day to mid checkout day; cancelled and other-property stays are excluded',()=>{
  const app=runtime();
  app.run(`D.bookings=[{id:'s1',propId:'a',checkIn:'2026-10-18',checkOut:'2026-10-22',guestName:'Guest <One>',platform:'airbnb'},{id:'s2',propId:'a',checkIn:'2026-10-20',checkOut:'2026-10-21',status:'cancelled'},{id:'s3',propId:'b',checkIn:'2026-10-25',checkOut:'2026-10-26',platform:'booking'}]`);
  const before=app.run('JSON.stringify(D)'),html=app.html(),b=bars(html);
  assert.deepEqual(b.map(x=>x.id),['s1','s3']);
  assert.equal(b[0].left,30*66+33);assert.equal(b[0].width,4*66-3);assert.equal(b[0].top,50);
  assert.ok(html.includes('Guest &lt;One&gt;')&&html.includes('Villa &lt;Alpha&gt;')&&!html.includes('<One>'));
  assert.match(html,/data-jb-title>October 2026</);assert.equal(app.run('JSON.stringify(D)'),before);
});
test('property filter, overlapping stays in separate lanes, Month view and empty filter state',()=>{
  const app=runtime();
  app.run(`D.bookings=[{id:'x',propId:'a',checkIn:'2026-10-19',checkOut:'2026-10-24'},{id:'y',propId:'a',checkIn:'2026-10-22',checkOut:'2026-10-25'},{id:'z',propId:'b',checkIn:'2026-10-19',checkOut:'2026-10-20'}]`);
  let b=bars(app.html());assert.deepEqual(b.map(x=>[x.id,x.top]),[['x',25],['y',75],['z',50]]);
  app.run(`calFilter='prop-b'`);b=bars(app.html());assert.deepEqual(b.map(x=>x.id),['z']);
  app.run(`calFilter='cleanings'`);assert.deepEqual(bars(app.html()),[]);
  app.run(`calFilter='all';calView='month'`);const month=app.html();assert.match(month,/jb-month"><div class="wm-calendar">MONTH/);assert.match(month,/value="month" selected/);
  app.run(`calView='timeline';D.props=[]`);assert.match(app.html(),/No properties yet/);
});
test('the themed booking dialog shows the stay and offers only the existing actions',()=>{
  const app=runtime();
  app.run(`function fmtRevenueAmount(v){return '€'+v;}function bookingRevenueCents(){return 0;}D.bookings=[{id:"q'1",propId:'b',checkIn:'2026-10-18',checkOut:'2026-10-21',guestName:'Guest',guestCount:3,totalPrice:900,platform:'direct',notes:'<b>gate</b>'}]`);
  const h=app.run(`SV_BOOKINGS_VIEW.detail(D.bookings[0])`);
  assert.match(h,/Casa Beta/);assert.match(h,/Direct · <span class="jv-status is-confirmed">Confirmed/);assert.match(h,/<dt>Nights<\/dt><dd>3<\/dd>/);
  for(const fn of ['scheduleCleanFromBooking','openEditBooking','cancelBooking','deleteBooking','closeModal'])assert.ok(h.includes(fn+'('),fn);
  assert.ok(h.includes('&lt;b&gt;gate&lt;/b&gt;'));assert.ok(h.includes('openEditBooking(&quot;q\'1&quot;)')||h.includes("openEditBooking(&quot;q'1&quot;)"));
});
