const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const XLSX = require(path.join(root, 'assets/vendor/sheetjs/xlsx-0.20.3.min.js'));
const context = vm.createContext({XLSX, window: {}});
vm.runInContext(fs.readFileSync(path.join(root, 'src/imports/excel-bookings.js'), 'utf8'), context);
const api = context.window.SV_EXCEL;
const plain = value => JSON.parse(JSON.stringify(value));
const booking = (extra = {}) => ({id:'b1',propId:'mar',platform:'agency',agencyName:'Agency Example',checkIn:'2026-07-01',checkOut:'2026-07-08',guestName:'Example Guest',guestCount:8,totalPrice:1200,notes:'Keep operational note',status:'confirmed',linkedCleaningId:'c1',...extra});
const data = (bookings = []) => ({props:[{id:'mar',name:'Villa Mar'},{id:'vallori',name:'Can Vallori'}],bookings,sessions:[{id:'c1',propId:'mar',date:'2026-07-08',cleanerIds:['cleaner1']}],tasks:[{id:'t1',title:'Keep task'}],_migrations:[]});
const row = (extra = {}) => ({key:'VILLA MAR:4',sheet:'VILLA MAR',row:4,property:'Villa Mar',sourceChannel:'Agency Example',platform:'agency',agencyName:'Agency Example',checkIn:'2026-07-01',checkOut:'2026-07-08',originalCheckIn:'2026-07-01',originalCheckOut:'2026-07-08',guestName:'Example Guest',reference:'001-234',guestCount:8,guestCountRaw:'8',totalPrice:1200,amountHeader:'$ a cobrar',...extra});
const parsed = (...rows) => ({sheets:[{name:'VILLA MAR',property:'Villa Mar',count:rows.length}],rows,errors:[]});
let nextId = 0;
const apply = (original, plan, options = {}) => api.applyPlan(original, plan, {at:'2026-09-30T12:00:00Z',makeId:()=>`synthetic-${++nextId}`,...options});

test('Spanish headers, serial dates, summed guests, direct bookings, and totals', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['VILLA MAR'], [], ['AGENCIA','Fecha entrada','Fecha salida','Noches','Nombre cliente','Reserva','Nº personas','$ a cobrar'],
    ['PRIVATE',46204,46211,7,'Example Guest','001-234','12 + 6 + 1',0],
    [null,null,null,7,null,null,null,0]
  ]);
  const result = api.parseWorkbook({SheetNames:['VILLA MAR'],Sheets:{'VILLA MAR':sheet}});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].checkIn,'2026-07-01');
  assert.equal(result.rows[0].checkOut,'2026-07-08');
  assert.equal(result.rows[0].platform,'direct');
  assert.equal(result.rows[0].guestCount,19);
  assert.equal(result.rows[0].guestCountRaw,'12 + 6 + 1');
  assert.equal(result.rows[0].totalPrice,0);
  assert.equal(result.rows[0].reference,'001-234');
  assert.equal(api.guests('').value,null);
  assert.equal(api.validDate('2026-02-29'),false);
});

test('1904 workbook dates do not shift to another year', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['AGENCIA','Fecha entrada','Fecha salida','Nombre cliente','$ a pagar'],['AIRBNB',0,1,'Example Guest',100]]);
  const result = api.parseWorkbook({Workbook:{WBProps:{date1904:true}},SheetNames:['LA FORCA'],Sheets:{'LA FORCA':sheet}});
  assert.equal(result.rows[0].checkIn,'1904-01-01');
  assert.equal(result.rows[0].checkOut,'1904-01-02');
});

test('reference updates preserve IDs, notes, cleaning links, and other years', () => {
  const original = data([booking({notes:'Ref: 001-234; Keep operational note'}),booking({id:'next-year',checkIn:'2027-07-01',checkOut:'2027-07-08'}),booking({id:'other-villa',propId:'vallori'})]);
  const before = JSON.stringify(original);
  const incoming = parsed(row({checkOut:'2026-07-09',guestName:'Updated Guest',totalPrice:1300}));
  const plan = api.planImport(incoming,original);
  assert.equal(plan.counts.update,1);
  const result = apply(original,plan,{supersededMigrationId:'legacy-2026'});
  assert.equal(JSON.stringify(original),before);
  assert.equal(result.bookings[0].id,'b1');
  assert.equal(result.bookings[0].notes,original.bookings[0].notes);
  assert.equal(result.bookings[0].linkedCleaningId,'c1');
  assert.equal(result.bookings[0].totalPrice,1300);
  assert.equal(result.bookings[0]._excel.cleaningNeedsReview,true);
  assert.deepEqual(plain(result.sessions),original.sessions);
  assert.deepEqual(plain(result.bookings.slice(1)),original.bookings.slice(1));
  assert.equal(result.importHistory[0].changes[0].id,'b1');
  assert.ok(result._migrations.includes('legacy-2026'));
  assert.equal(api.planImport(incoming,result).counts.unchanged,1);
});

test('generic agency references do not collapse distinct bookings', () => {
  const incoming = parsed(row({sourceChannel:'CA TEVA',agencyName:'CA TEVA',reference:'CA TEVA'}),row({key:'VILLA MAR:5',row:5,sourceChannel:'CA TEVA',agencyName:'CA TEVA',reference:'CA TEVA',guestName:'Second Example',checkIn:'2026-07-08',checkOut:'2026-07-15'}));
  const original = data();
  const plan = api.planImport(incoming,original);
  assert.equal(plan.counts.add,2);
  const result = apply(original,plan);
  assert.equal(result.bookings.length,2);
  assert.notEqual(result.bookings[0]._excel.sourceKey,result.bookings[1]._excel.sourceKey);
});

test('uncertain matches block apply until explicitly resolved', () => {
  const original = data([booking({guestName:'Different Guest',notes:''})]);
  const incoming = parsed(row({reference:''}));
  const plan = api.planImport(incoming,original);
  assert.equal(plan.counts.review,1);
  assert.throws(()=>apply(original,plan),/Resolve/);
  const resolved = api.planImport(incoming,original,{decisions:{'VILLA MAR:4':'match:b1'}});
  assert.equal(resolved.counts.update,1);
  assert.equal(apply(original,resolved).bookings.length,1);
  const separate = api.planImport(incoming,original,{decisions:{'VILLA MAR:4':'new'}});
  assert.equal(apply(original,separate).bookings.length,2);
});

test('duplicate workbook rows and two rows selecting one booking block apply', () => {
  const original = data([booking()]);
  const duplicate = api.planImport(parsed(row(),row({key:'VILLA MAR:5',row:5})),original);
  assert.equal(duplicate.counts.review,2);
  assert.throws(()=>apply(original,duplicate),/Resolve/);
  const twoMatches = api.planImport(parsed(row(),row({key:'VILLA MAR:5',row:5,reference:'999',guestName:'Other Guest',checkIn:'2026-08-01',checkOut:'2026-08-08'})),original,{decisions:{'VILLA MAR:5':'match:b1'}});
  assert.ok(twoMatches.counts.review>0);
  assert.throws(()=>apply(original,twoMatches),/Resolve/);
});

test('missing bookings require a full snapshot and individual cancellation selection', () => {
  const original = data([booking({id:'missing'}),booking({id:'2027',checkIn:'2027-07-01'}),booking({id:'vallori',propId:'vallori'}),booking({id:'cancelled',status:'cancelled'})]);
  const incoming = parsed(row({guestName:'New Guest',checkIn:'2026-08-01',checkOut:'2026-08-08'}));
  const partial = api.planImport(incoming,original);
  assert.deepEqual(plain(partial.cancellations.map(b=>b.id)),['missing']);
  assert.throws(()=>apply(original,partial,{cancelIds:['missing']}),/complete/);
  const complete = api.planImport(incoming,original,{completeSnapshot:true});
  const untouched = apply(original,complete);
  assert.equal(untouched.bookings[0].status,'confirmed');
  const result = apply(original,complete,{cancelIds:['missing']});
  assert.equal(result.bookings[0].status,'cancelled');
  assert.equal(result.bookings[0].linkedCleaningId,'c1');
  assert.deepEqual(plain(result.sessions),original.sessions);
  assert.equal(result.bookings[1].status,'confirmed');
  assert.equal(result.bookings[2].status,'confirmed');
  assert.throws(()=>apply(original,complete,{cancelIds:['vallori']}),/scope/);
});

test('excluded rows disable cancellation and stay outside the import', () => {
  const original = data([booking()]);
  const plan = api.planImport(parsed(row(),row({key:'VILLA MAR:5'})),original,{completeSnapshot:true,decisions:{'VILLA MAR:5':'skip'}});
  assert.equal(plan.counts.skip,1);
  assert.equal(plan.canCancel,false);
});

test('missing price blocks a new booking; explicit zero and unknown remain distinct', () => {
  const original = data();
  const incoming = parsed(row({totalPrice:null}));
  const blocked = api.planImport(incoming,original);
  assert.equal(blocked.counts.review,1);
  const zero = api.planImport(incoming,original,{overrides:{'VILLA MAR:4':{totalPrice:0}}});
  const zeroResult = apply(original,zero);
  assert.equal(zeroResult.bookings[0].totalPrice,0);
  assert.equal(zeroResult.bookings[0]._excel.priceUnknown,false);
  const unknown = api.planImport(incoming,original,{overrides:{'VILLA MAR:4':{priceUnknown:true}}});
  const unknownResult = apply(original,unknown);
  assert.equal(unknownResult.bookings[0].totalPrice,null);
  assert.equal(unknownResult.bookings[0]._excel.priceUnknown,true);
});

test('blank guest count and price preserve known values when updating', () => {
  const original = data([booking()]);
  const incoming = parsed(row({totalPrice:null,guestCount:null,guestCountRaw:''}));
  const plan = api.planImport(incoming,original);
  assert.equal(plan.counts.review,0);
  const result = apply(original,plan);
  assert.equal(result.bookings[0].totalPrice,1200);
  assert.equal(result.bookings[0].guestCount,8);
  const newUnknown = apply(data(),api.planImport(parsed(row({guestCount:null})),data()));
  assert.equal(newUnknown.bookings[0].guestCount,null);
});

test('stale previews reject later booking or cleaning edits', () => {
  const original = data();
  const plan = api.planImport(parsed(row()),original);
  original.sessions[0].date='2026-07-09';
  assert.throws(()=>apply(original,plan),/changed after/);
  const original2 = data([booking()]);
  const plan2 = api.planImport(parsed(row()),original2);
  original2.bookings[0].notes='A later note';
  assert.throws(()=>apply(original2,plan2),/changed after/);
});

test('approved year correction records the original workbook dates', () => {
  const original = data();
  const incoming = parsed(row({checkIn:'2025-07-01',checkOut:'2025-07-08',originalCheckIn:'2025-07-01',originalCheckOut:'2025-07-08'}));
  assert.equal(api.planImport(incoming,original).counts.skip,1);
  const plan = api.planImport(incoming,original,{overrides:{'VILLA MAR:4':{checkIn:'2026-07-01',checkOut:'2026-07-08'}}});
  const result = apply(original,plan);
  assert.equal(result.bookings[0].checkIn,'2026-07-01');
  assert.equal(result.bookings[0]._excel.originalCheckIn,'2025-07-01');
});

test('reviewed year corrections repair the exact existing source record without duplicating it', () => {
  const original = data([booking({checkIn:'2025-07-01',checkOut:'2025-07-08',notes:'Year correction note'}),booking({id:'unrelated-2025',checkIn:'2025-08-01',checkOut:'2025-08-08',guestName:'Different Guest'}),booking({id:'keep-2027',checkIn:'2027-07-01',checkOut:'2027-07-08'})]);
  const incoming = parsed(row({reference:'',checkIn:'2025-07-01',checkOut:'2025-07-08',originalCheckIn:'2025-07-01',originalCheckOut:'2025-07-08'}));
  const plan = api.planImport(incoming,original,{overrides:{'VILLA MAR:4':{checkIn:'2026-07-01',checkOut:'2026-07-08'}}});
  assert.equal(plan.counts.add,0);
  assert.equal(plan.counts.update,1);
  assert.equal(plan.rows[0].bookingId,'b1');
  const result = apply(original,plan);
  assert.equal(result.bookings.length,3);
  assert.equal(result.bookings[0].id,'b1');
  assert.equal(result.bookings[0].notes,'Year correction note');
  assert.equal(result.bookings[0].linkedCleaningId,'c1');
  assert.equal(result.bookings[0].checkIn,'2026-07-01');
  assert.equal(result.bookings[0]._excel.cleaningNeedsReview,true);
  assert.deepEqual(plain(result.bookings.slice(1)),original.bookings.slice(1));
  assert.deepEqual(plain(result.sessions),original.sessions);
});

test('a corrected current-year booking takes precedence over its cancelled wrong-year history', () => {
  const original = data([booking({notes:'Ref: 001-234'}),booking({id:'cancelled-history',checkIn:'2025-07-01',checkOut:'2025-07-08',status:'cancelled',notes:'Ref: 001-234'})]);
  const incoming = parsed(row({checkIn:'2025-07-01',checkOut:'2025-07-08',originalCheckIn:'2025-07-01',originalCheckOut:'2025-07-08'}));
  const plan = api.planImport(incoming,original,{overrides:{'VILLA MAR:4':{checkIn:'2026-07-01',checkOut:'2026-07-08'}}});
  assert.equal(plan.counts.review,0);
  assert.equal(plan.counts.add,0);
  assert.equal(plan.rows[0].bookingId,'b1');
  const result = apply(original,plan);
  assert.equal(result.bookings.length,2);
  assert.deepEqual(plain(result.bookings[1]),original.bookings[1]);
});

test('cancelled bookings require explicit reactivation', () => {
  const original = data([booking({status:'cancelled'})]);
  const incoming = parsed(row());
  assert.equal(api.planImport(incoming,original).counts.review,1);
  const plan = api.planImport(incoming,original,{decisions:{'VILLA MAR:4':'match:b1'}});
  const result = apply(original,plan);
  assert.equal(result.bookings[0].status,'confirmed');
  assert.equal(result.bookings[0]._excel.cleaningNeedsReview,true);
});

test('property creation uses stable real IDs and does not repeat on the next import', () => {
  const original = {...data(),props:[]};
  const incoming = parsed(row());
  assert.equal(api.planImport(incoming,original).counts.review,1);
  const plan = api.planImport(incoming,original,{mappings:{'VILLA MAR':'@create'}});
  const result = apply(original,plan);
  assert.equal(result.props.length,1);
  assert.equal(result.bookings[0].propId,result.props[0].id);
  const repeat = api.planImport(incoming,result);
  assert.equal(repeat.newProperties.length,0);
  assert.equal(repeat.counts.unchanged,1);
  assert.equal(api.planImport(incoming,result,{mappings:{'VILLA MAR':'@create'}}).canApply,false);
});

test('workbook cancellation markers require review and preserve cancelled history', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['AGENCIA','Fecha entrada','Fecha salida','Nombre cliente','Reserva','$ a cobrar'],['AIRBNB',46204,46211,'Example Guest','CANCELED',100]]);
  const source = api.parseWorkbook({SheetNames:['VILLA MAR'],Sheets:{'VILLA MAR':sheet}});
  assert.equal(source.rows[0].cancelledInSource,true);
  const original = data([booking({platform:'airbnb',agencyName:'',totalPrice:100})]);
  assert.equal(api.planImport(source,original).counts.review,1);
  const resolved = api.planImport(source,original,{statusDecisions:{'VILLA MAR:2':'cancelled'}});
  const result = apply(original,resolved);
  assert.equal(result.bookings.length,1);
  assert.equal(result.bookings[0].status,'cancelled');
  assert.equal(result.bookings[0].linkedCleaningId,'c1');
  assert.equal(result.bookings[0]._excel.cleaningNeedsReview,true);
  assert.equal(api.planImport(source,result,{statusDecisions:{'VILLA MAR:2':'cancelled'}}).counts.unchanged,1);
  const newResult = apply(data(),api.planImport(source,data(),{statusDecisions:{'VILLA MAR:2':'cancelled'}}));
  assert.equal(newResult.bookings[0].status,'cancelled');
  const explicitActive = api.planImport(source,original,{statusDecisions:{'VILLA MAR:2':'active'}});
  assert.equal(apply(original,explicitActive).bookings[0].status,'confirmed');
  const excluded = api.planImport(source,original,{completeSnapshot:true,decisions:{'VILLA MAR:2':'skip'}});
  assert.equal(excluded.counts.skip,1);
  assert.equal(excluded.canCancel,true);
  assert.deepEqual(plain(excluded.cancellations.map(b=>b.id)),['b1']);
});
