const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function runtime(){
  const context=vm.createContext({pad:n=>String(n).padStart(2,'0')});
  for(const file of ['reports.js','revenue-reports.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/features',file),'utf8'),context);
  return context;
}
const booking=extra=>({id:'stay',propId:'p',guestName:'Example Guest',platform:'direct',status:'confirmed',checkIn:'2027-01-01',checkOut:'2027-01-08',totalPrice:700,guestCount:4,...extra});
const data=bookings=>({props:[{id:'p',name:'Villa One'},{id:'q',name:'Villa Two'}],bookings});

test('monthly prices stay in arrival month while nights and allocated value cross month boundaries exactly',()=>{
  const api=runtime(),d=data([booking({checkIn:'2027-01-31',checkOut:'2027-02-02',totalPrice:100.01})]);
  const jan=api.bookingReportData(d,2027,0,'p'),feb=api.bookingReportData(d,2027,1,'p');
  assert.equal(jan.revenueCents,10001);assert.equal(feb.revenueCents,0);
  assert.equal(jan.bookedNights,1);assert.equal(feb.bookedNights,1);
  assert.equal(jan.stayRevenueCents,5001);assert.equal(feb.stayRevenueCents,5000);
  assert.equal(jan.stayRevenueCents+feb.stayRevenueCents,10001);
  assert.equal(feb.arrivals.length,0);assert.equal(feb.rows.length,1);assert.equal(feb.rows[0].arrival,false);
  assert.equal(feb.averageNightCents,5000);
});

test('year-end nights include December 31 and prior-year arrivals appear in January stay value',()=>{
  const api=runtime(),d=data([booking({checkIn:'2026-12-30',checkOut:'2027-01-03',totalPrice:100.01}),booking({id:'dec31',checkIn:'2027-12-31',checkOut:'2028-01-01',totalPrice:80})]);
  const y26=api.bookingReportData(d,2026,null,'p'),y27=api.bookingReportData(d,2027,null,'p');
  assert.equal(y26.bookedNights,2);assert.equal(y27.bookedNights,3);
  assert.equal(y26.stayRevenueCents,5001);assert.equal(y27.stayRevenueCents,13000);
  assert.equal(y27.revenueCents,8000);assert.equal(y27.arrivals.length,1);
  assert.equal(api.bookingReportData(d,2027,11,'p').bookedNights,1);
  assert.equal(api.bookingReportData(d,2027,0,'p').rows.length,1);
});

test('checkout is exclusive, overlapping nights count once and empty villas remain in capacity',()=>{
  const api=runtime(),d=data([booking({checkIn:'2027-06-01',checkOut:'2027-06-04'}),booking({id:'overlap',checkIn:'2027-06-03',checkOut:'2027-06-05'}),booking({id:'next-month',checkIn:'2027-07-01',checkOut:'2027-07-02'})]);
  const s=api.bookingReportData(d,2027,5);
  assert.equal(s.bookedNights,4);assert.equal(s.overlapNights,1);assert.equal(s.capacity,60);assert.equal(s.availableNights,56);
  assert.equal(s.occupancy,4/60*100);assert.equal(s.arrivals.length,2);
  assert.equal(api.bookingReportData(d,2027,5,'q').occupancy,0);
  assert.equal(api.bookingReportData(d,2027,5,'p').capacity,30);
});

test('Gregorian leap dates and century rules define the correct available nights',()=>{
  const api=runtime();
  assert.equal(api.bookingReportData(data([]),2028,1,'p').capacity,29);
  assert.equal(api.bookingReportData(data([]),2100,1,'p').capacity,28);
  assert.equal(api.bookingReportData(data([]),2000,null,'p').capacity,366);
  assert.equal(api.reportDay('2027-02-29'),null);assert.equal(api.reportDay('2028-02-29')!==null,true);
});

test('retained cancellations contribute only their explicit money and zero-priced stays remain known',()=>{
  const api=runtime(),d=data([
    booking({id:'free',totalPrice:0,checkIn:'2027-01-01',checkOut:'2027-01-02'}),
    booking({id:'paid',totalPrice:100,checkIn:'2027-01-02',checkOut:'2027-01-04'}),
    booking({id:'unknown',totalPrice:null,checkIn:'2027-01-04',checkOut:'2027-01-06'}),
    booking({id:'cancel',propId:'q',totalPrice:9999,status:'cancelled',cancellationRevenue:25.23}),
    booking({id:'refunded',propId:'q',totalPrice:9999,status:'cancelled'})
  ]);
  const s=api.bookingReportData(d,2027,0);
  assert.equal(s.revenueCents,12523);assert.equal(s.cancellationRevenueCents,2523);
  assert.equal(s.activeRevenueCents,10000);assert.equal(s.stayRevenueCents,10000);
  assert.equal(s.bookedNights,5);assert.equal(s.knownPriceCount,2);assert.equal(s.averageBookingCents,5000);
  assert.equal(s.averageNightCents,3333);assert.equal(s.unknownPrices,1);assert.equal(s.unknownStayPrices,1);
  assert.equal(s.cancelled.length,2);assert.equal(s.arrivals.length,3);
  assert.equal(api.bookingReportData(d,2027,0,'q').bookedNights,0);
});

test('villa and month drilldowns reconcile channel money and never mutate booking records',()=>{
  const api=runtime(),d=data([booking({id:'one',platform:'airbnb',totalPrice:100.10}),booking({id:'two',propId:'q',platform:'agency',agencyName:'Agency A',totalPrice:200.20,checkIn:'2027-02-01',checkOut:'2027-02-05'})]);
  const original=JSON.stringify(d);
  const all=api.bookingReportData(d,2027),p=api.bookingReportData(d,2027,null,'p'),q=api.bookingReportData(d,2027,null,'q');
  assert.equal(all.revenueCents,p.revenueCents+q.revenueCents);
  assert.equal(all.channels.reduce((n,c)=>n+c.revenueCents,0),all.revenueCents);
  assert.equal(api.bookingReportData(d,2027,0,'q').rows.length,0);
  assert.equal(api.bookingReportData(d,2027,1,'q').arrivals[0].id,'two');
  assert.equal(JSON.stringify(d),original);
});

test('invalid prices and stay dates remain explicit instead of pretending to be zero income or occupancy',()=>{
  const api=runtime(),d=data([booking({totalPrice:-10,checkOut:'2027-01-01'}),booking({id:'missing-villa',propId:'gone',totalPrice:200})]);
  const s=api.bookingReportData(d,2027,0);
  assert.equal(s.unknownPrices,1);assert.equal(s.invalidDates,1);assert.equal(s.unassignedStays,1);
  assert.equal(s.revenueCents,20000);assert.equal(s.bookedNights,0);assert.equal(s.availableNights,62);
  assert.equal(api.reportKnownPrice(booking({totalPrice:0})),true);
  assert.equal(api.reportKnownPrice(booking({totalPrice:'100'})),false);
});

test('Can Vallori is excluded by stable ID from every report measure without changing its records',()=>{
  const api=runtime(),excluded='mo4hhdwukkja',d=data([
    booking({id:'tracked',totalPrice:700}),
    booking({id:'excluded',propId:excluded,totalPrice:10000}),
    booking({id:'excluded-cancelled',propId:excluded,status:'cancelled',cancellationRevenue:500})
  ]);
  d.props.push({id:excluded,name:'Renamed untracked villa'});
  const original=JSON.stringify(d),summary=api.bookingReportData(d,2027,0);
  assert.equal(summary.properties.length,2);assert.equal(summary.capacity,62);
  assert.equal(summary.revenueCents,70000);assert.equal(summary.cancellationRevenueCents,0);
  assert.equal(summary.bookedNights,7);assert.equal(summary.arrivals.length,1);
  assert.equal(summary.rows.length,1);assert.equal(summary.channels[0].count,1);
  assert.equal(api.bookingReportData(d,2027,0,excluded).rows.length,0);
  assert.equal(api.bookingReportData(d,2027,0,excluded).capacity,0);
  assert.equal(JSON.stringify(d),original);
});
