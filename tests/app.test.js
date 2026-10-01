const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"[^>]*><\/script>/g)].map(match => match[1].split('?')[0]);
const plain = value => JSON.parse(JSON.stringify(value));
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

// No browser or real network is used. UI rendering is checked separately in the browser.
function runtime({host = '127.0.0.1', protocol = 'http:', records = new Map(), boot = true} = {}) {
  const reads = [], writes = [], requests = [], timers = [];
  const element = {style: {}, classList: {add() {}, remove() {}, toggle() {}}, setAttribute() {}, getAttribute() {return 'dark';}, appendChild() {}, value: ''};
  const sandbox = {
    console, location: {hostname: host, protocol, reload() {throw new Error('Unexpected reload');}},
    document: {addEventListener() {}, createElement() {return {...element, style: {}};}, body: element, documentElement: element, getElementById() {return element;}, querySelector() {return element;}, querySelectorAll() {return [];}},
    localStorage: {
      getItem(key) {reads.push(key); return records.has(key) ? records.get(key) : null;},
      setItem(key, value) {writes.push(key); records.set(key, String(value));},
      removeItem(key) {writes.push(key); records.delete(key);}
    },
    fetch(url, options) {requests.push({url, options}); return Promise.resolve({ok: true, status: 200, text: async () => 'null'});},
    setTimeout(fn, delay) {timers.push({fn, delay}); return timers.length;}, clearTimeout() {},
    setInterval() {throw new Error('Unexpected interval');}, requestAnimationFrame() {},
    alert() {}, confirm() {return true;}, navigator: {}
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const run = text => vm.runInContext(text, context);
  for (const file of scripts) {
    if (file === 'src/app.js') {
      run('render=function(){};updateHeader=function(){};toast=function(){};');
      if (!boot) continue;
    }
    vm.runInContext(source(file), context, {filename: file});
  }
  return {run, context, records, reads, writes, requests, timers};
}

for (const [host, protocol] of [['localhost', 'http:'], ['127.0.0.1', 'http:'], ['[::1]', 'http:'], ['::1', 'http:'], ['', 'file:']]) {
  test(`preview isolation and persistence on ${host || 'file://'}: no cloud or migrations`, async () => {
    const records = new Map([
      ['seravillas_v1', 'PRODUCTION_DATA_SENTINEL'], ['cleanly_v1', 'PRODUCTION_LEGACY_SENTINEL'],
      ['sv_secret', 'SYNTHETIC_TEST_KEY'], ['sv_theme', 'light'],
      ['seravillas_v1_backup', 'PRODUCTION_BACKUP_SENTINEL'], ['seravillas_v1_lastSync', '123']
    ]);
    const before = [...records];
    const app = runtime({host, protocol, records});
    assert.equal(app.context.SV_CONFIG.isDev, true);
    assert.equal(app.run('D.props.length'), 3);
    assert.equal(app.run('D.bookings.length'), 6);
    assert.equal(app.run('SYNC_SECRET'), '');
    assert.equal(app.run('SYNC_URL'), '');
    await app.run("(async()=>{D.scratch='Persisted preview note';save();await refreshApp();await syncNow();await pushToCloud();await pullFromCloud();schedulePush();showSetup();await setupSubmit();resetAccess();})()");
    const data = app.run('JSON.stringify(D)');
    app.run('runBookingMigration();runBookingMigration2027();');
    assert.equal(app.run('JSON.stringify(D)'), data);
    await assert.rejects(app.run("cloudFetch('https://example.invalid',{})"));
    assert.equal(app.requests.length, 0);
    assert.equal(app.timers.length, 0);
    assert.ok(app.reads.every(key => key.startsWith('seravillas_dev:')));
    assert.ok(app.writes.every(key => key.startsWith('seravillas_dev:')));
    for (const [key, value] of before) assert.equal(records.get(key), value);
    const reloaded = runtime({host, protocol, records});
    assert.equal(reloaded.run('D.scratch'), 'Persisted preview note');
    assert.equal(reloaded.run('D.bookings.length'), 6);
  });
}

test('hosted app keeps its original keys and cloud configuration', () => {
  const records = new Map([['sv_secret', 'SYNTHETIC_TEST_KEY'], ['seravillas_dev:sv_secret', 'UNUSED_DEV_KEY']]);
  const app = runtime({host: 'antonioseravillas.github.io', protocol: 'https:', records, boot: false});
  assert.equal(app.context.SV_CONFIG.isDev, false);
  assert.equal(app.context.SV_STORAGE.key('seravillas_v1'), 'seravillas_v1');
  assert.equal(app.run('SYNC_SECRET'), 'SYNTHETIC_TEST_KEY');
  assert.ok(app.run('SYNC_URL').startsWith('https://'));
  assert.ok(!app.reads.some(key => key.startsWith('seravillas_dev:')));
  assert.equal(app.requests.length, 0);
});

test('date rules preserve local dates across leap days and month/year boundaries', () => {
  const app = runtime({boot: false});
  for (const [date, days, result] of [['2024-02-28', 1, '2024-02-29'], ['2024-02-29', 1, '2024-03-01'], ['2026-12-31', 1, '2027-01-01'], ['2026-03-01', -1, '2026-02-28']]) {
    assert.equal(app.run(`addDays('${date}',${days})`), result);
  }
  assert.equal(app.run("startOfWeek('2026-10-04')"), '2026-09-28');
  assert.equal(app.run("endOfWeek('2026-09-30')"), '2026-10-04');
  assert.equal(app.run("nightsBetween('2026-03-28','2026-03-30')"), 2);
});

test('voice commands distinguish Villa Mar from Villa Marjals', () => {
  const app = runtime({boot: false});
  app.run("D.props=[{id:'mar',name:'Villa Mar'},{id:'marjals',name:'Villa Marjals'}]");
  assert.equal(app.run("voiceFindProperty('create task for Villa Marjals').id"), 'marjals');
  assert.equal(app.run("voiceFindProperty('create task for Villa Mar').id"), 'mar');
  assert.equal(app.run("voiceFindProperty('create task for villamarjals').id"), 'marjals');
});

test('crew coverage counts confirmed staff and excludes offered/cancelled staff', () => {
  const app = runtime({boot: false});
  app.run("D.props=[{id:'p',name:'Villa Diagonal'}]");
  assert.equal(app.run("getRequiredCleanersForProperty('p')"), 3);
  assert.equal(app.run("getConfirmedCrewCount({crew:{main:[{status:'confirmed'},{status:'offered'},{status:'cancelled'}],alinaSpots:2,alinaStatus:'confirmed'}})"), 3);
  assert.equal(app.run("getConfirmedCrewCount({crew:{main:[],alinaSpots:2,alinaStatus:'offered'}})"), 0);
  assert.equal(app.run("getMissingCrewCount({propId:'p'})"), 3);
  assert.equal(app.run("getCleaningCrewStatus({propId:'p',status:'cancelled'})"), 'cancelled');
});

test('reload preserves saved version and completed import markers', () => {
  const markers = ['bk_excel_v6_strict_property_cleanup', 'bk_excel_2027_v1'];
  const saved = {props: [{id: 'p', name: 'Villa Mar'}], cleaners: [], sessions: [], bookings: [{id: 'keep-booking', propId: 'p', checkIn: '2027-05-01', checkOut: '2027-05-08', guestName: 'Synthetic Guest', status: 'confirmed', notes: 'Keep operational note', linkedCleaningId: 'keep-cleaning'}], _savedAt: 123456789, _migrations: markers};
  const records = new Map([['seravillas_v1', JSON.stringify(saved)]]);
  const app = runtime({host: 'antonioseravillas.github.io', protocol: 'https:', records, boot: false});
  app.run('load()');
  assert.equal(app.run('D._savedAt'), saved._savedAt);
  assert.deepEqual(plain(app.run('D._migrations')), markers);
  const before = app.run('JSON.stringify(D)');
  app.run('runBookingMigration();runBookingMigration2027();');
  assert.equal(app.run('JSON.stringify(D)'), before);
  assert.equal(app.requests.length, 0);
  assert.equal(app.writes.length, 0);
  assert.equal(app.run('D.bookings[0].linkedCleaningId'), 'keep-cleaning');
});

test('old backups without sync metadata still load', () => {
  const app = runtime({boot: false, records: new Map([['seravillas_dev:seravillas_v1', JSON.stringify({props: [], cleaners: [], sessions: [], _savedAt: 'invalid', _migrations: null})]])});
  app.run('load()');
  assert.equal(app.run('D._savedAt'), 0);
  assert.deepEqual(plain(app.run('D._migrations')), []);
});

test('Excel UI saves an isolated rollback backup and persists import history after reload', () => {
  const app = runtime();
  const before = app.run('JSON.stringify(D)');
  app.run(`openExcelImport();
    excelImportState.parsed={errors:[],sheets:[{name:'DEMO',property:D.props[0].name,count:1}],rows:[{key:'DEMO:4',sheet:'DEMO',row:4,property:D.props[0].name,sourceChannel:'PRIVATE',platform:'direct',agencyName:'',guestName:'Synthetic Import Guest',reference:'demo-123',guestCount:null,guestCountRaw:'',totalPrice:0,checkIn:'2026-11-01',checkOut:'2026-11-08',originalCheckIn:'2026-11-01',originalCheckOut:'2026-11-08'}]};
    excelImportState.fileName='fictional.xlsx';renderExcelImport();applyExcelBookingImport();`);
  assert.equal(app.run('D.bookings.length'),7);
  assert.equal(app.run('D.importHistory.length'),1);
  assert.equal(app.run('D.importHistory[0].counts.add'),1);
  assert.equal(app.records.get('seravillas_dev:seravillas_v1_beforeExcelImport'),before);
  assert.equal(app.requests.length,0);
  assert.ok(app.writes.every(key=>key.startsWith('seravillas_dev:')));
  const reloaded = runtime({records:app.records});
  assert.equal(reloaded.run('D.importHistory.length'),1);
  assert.equal(reloaded.run('D.bookings.at(-1).totalPrice'),0);
  assert.equal(reloaded.run('D.bookings.at(-1).guestCount'),null);
  assert.equal(reloaded.run('D.bookings.at(-1)._excel.reference'),'demo-123');
  reloaded.run('restoreBeforeExcelImport()');
  assert.equal(reloaded.run('D.bookings.length'),6);
  assert.ok(reloaded.run('D._migrations.includes(BOOKING_MIGRATION_KEY)'));
  assert.equal(reloaded.requests.length,0);
});

test('failed import storage leaves the in-memory and stored current bookings untouched', () => {
  const app = runtime();
  const before = app.run('JSON.stringify(D)');
  const stored = app.records.get('seravillas_dev:seravillas_v1');
  app.records.set('seravillas_dev:seravillas_v1_beforeExcelImport','PREVIOUS_BACKUP_SENTINEL');
  app.run(`openExcelImport();
    excelImportState.parsed={errors:[],sheets:[{name:'DEMO',property:D.props[0].name,count:1}],rows:[{key:'DEMO:4',sheet:'DEMO',row:4,property:D.props[0].name,sourceChannel:'PRIVATE',platform:'direct',agencyName:'',guestName:'Synthetic Import Guest',reference:'demo-123',guestCount:2,guestCountRaw:'2',totalPrice:100,checkIn:'2026-11-01',checkOut:'2026-11-08',originalCheckIn:'2026-11-01',originalCheckOut:'2026-11-08'}]};
    renderExcelImport();`);
  const setItem = app.context.localStorage.setItem;
  app.context.localStorage.setItem = (key,value) => {
    if(key==='seravillas_dev:seravillas_v1')throw new Error('Simulated storage full');
    setItem(key,value);
  };
  app.run('applyExcelBookingImport()');
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.records.get('seravillas_dev:seravillas_v1'),stored);
  assert.equal(app.records.get('seravillas_dev:seravillas_v1_beforeExcelImport'),'PREVIOUS_BACKUP_SENTINEL');
  assert.equal(app.run('excelImportState.error'),'Simulated storage full');
  assert.equal(app.requests.length,0);
});

test('unknown imported prices remain unknown on reload and reports label incomplete totals', () => {
  const saved = {props:[{id:'p',name:'Villa Mar'}],sessions:[],cleaners:[],bookings:[{id:'unknown',propId:'p',guestName:'Synthetic Guest',checkIn:'2026-11-01',checkOut:'2026-11-08',guestCount:null,totalPrice:null,platform:'direct',_excel:{priceUnknown:true}}],importHistory:[{id:'batch-test',source:'excel'}]};
  const app = runtime({records:new Map([['seravillas_dev:seravillas_v1',JSON.stringify(saved)]])});
  assert.equal(app.run('D.bookings[0].totalPrice'),null);
  assert.equal(app.run('D.bookings[0].guestCount'),null);
  assert.equal(app.run('D.importHistory[0].id'),'batch-test');
  assert.match(app.run('renderBookingReport()'),/Revenue totals are incomplete/);
  assert.match(app.run('renderBookingReport()'),/>Direct</);
});

test('cancellation confirmation keeps history and does not save until the manager confirms', () => {
  const app = runtime();
  app.run(`D.bookings=[{id:'cancel-me',propId:D.props[0].id,guestName:'Synthetic Missing Guest',checkIn:'2026-11-10',checkOut:'2026-11-15',status:'confirmed',notes:'Keep this note',linkedCleaningId:D.sessions[0].id}];
    showModal=function(html){window.lastModal=html;};
    openExcelImport();
    excelImportState.parsed={errors:[],sheets:[{name:'DEMO',property:D.props[0].name,count:1}],rows:[{key:'DEMO:4',sheet:'DEMO',row:4,property:D.props[0].name,sourceChannel:'PRIVATE',platform:'direct',agencyName:'',guestName:'Synthetic New Guest',reference:'demo-123',guestCount:2,guestCountRaw:'2',totalPrice:100,checkIn:'2026-11-01',checkOut:'2026-11-08',originalCheckIn:'2026-11-01',originalCheckOut:'2026-11-08'}]};
    excelImportState.completeSnapshot=true;renderExcelImport();
    document.querySelectorAll=function(){return [{dataset:{excelCancel:'cancel-me'}}];};
    confirm=function(){throw new Error('Native confirmation must not be used');};`);
  const before = app.run('JSON.stringify(D)'), sessions = app.run('JSON.stringify(D.sessions)'), writes = app.writes.length;
  app.run('applyExcelBookingImport()');
  assert.match(app.context.lastModal,/Confirm booking cancellations/);
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.writes.length,writes);
  app.run('renderExcelImport()');
  assert.match(app.context.lastModal,/data-excel-cancel="cancel-me" checked/);
  app.run('applyExcelBookingImport(true)');
  assert.equal(app.run('JSON.stringify(D)'),before);
  app.run('applyExcelBookingImport();applyExcelBookingImport(true)');
  assert.equal(app.run('D.bookings[0].status'),'cancelled');
  assert.equal(app.run('D.bookings[0].notes'),'Keep this note');
  assert.equal(app.run('D.bookings[0]._excel.cleaningNeedsReview'),true);
  assert.equal(app.run('JSON.stringify(D.sessions)'),sessions);
  assert.equal(app.run('D.bookings.length'),2);
  assert.equal(app.run('D.importHistory[0].counts.cancel'),1);
  assert.equal(app.requests.length,0);
});

test('retained full and partial cancellations contribute to the correct revenue buckets only', () => {
  const app=runtime();
  app.run(`D.bookings=[
    {id:'stay',propId:'p',platform:'airbnb',checkIn:'2026-09-01',checkOut:'2026-09-08',totalPrice:1000.10,status:'confirmed'},
    {id:'paid',propId:'p',platform:'airbnb',checkIn:'2026-09-21',checkOut:'2026-09-26',totalPrice:2500.23,cancellationRevenue:2500.23,status:'cancelled'},
    {id:'partial',propId:'q',platform:'agency',agencyName:'Example Agency',checkIn:'2026-10-01',checkOut:'2026-10-08',totalPrice:900,cancellationRevenue:300.45,status:'cancelled'},
    {id:'unpaid',propId:'p',platform:'airbnb',checkIn:'2026-09-10',checkOut:'2026-09-15',totalPrice:800,status:'cancelled'},
    {id:'refunded',propId:'p',platform:'airbnb',checkIn:'2026-09-10',checkOut:'2026-09-15',totalPrice:800,cancellationRevenue:0,status:'cancelled'},
    {id:'future',propId:'p',platform:'airbnb',checkIn:'2027-09-21',checkOut:'2027-09-26',totalPrice:777,cancellationRevenue:777,status:'cancelled'}];`);
  const summary=app.run('bookingRevenueSummary(D.bookings,2026)');
  assert.equal(summary.totalRev,3800.78);
  assert.equal(summary.activeRev,1000.10);
  assert.equal(summary.cancellationRev,2800.68);
  assert.equal(summary.active.length,1);
  assert.deepEqual(plain(summary.monthly[8]),{revenueCents:350033,count:1});
  assert.deepEqual(plain(summary.monthly[9]),{revenueCents:30045,count:0});
  assert.deepEqual(plain(summary.properties.get('p')),{count:1,revenueCents:350033,activeRevenueCents:100010});
  assert.deepEqual(plain(summary.properties.get('q')),{count:0,revenueCents:30045,activeRevenueCents:0});
  assert.equal(summary.platforms.find(p=>p.name==='airbnb').revenueCents,350033);
  assert.equal(summary.platforms.find(p=>p.name==='Example Agency').count,0);
  assert.equal(app.run('bookingRevenueSummary(D.bookings,2027).totalRev'),777);
  app.run("D.bookings[1].status='confirmed'");
  assert.equal(app.run('bookingRevenueSummary(D.bookings,2026).totalRev'),3800.78);
  assert.equal(app.run('bookingRevenueSummary(D.bookings,2026).active.length'),2);
  for(const invalid of [-1,NaN,Infinity,1e308,'2500'])assert.equal(app.context.bookingRevenueCents({status:'cancelled',cancellationRevenue:invalid}),0);
});

test('paid cancellations stay outside report stay metrics, occupancy and checkout cleaning', () => {
  const app=runtime();
  app.run(`reportYear=2026;D.props=[{id:'p',name:'Example Villa'},{id:'q',name:'Cancelled Only Villa'}];
    D.bookings=[{id:'stay',propId:'p',platform:'direct',checkIn:'2026-09-01',checkOut:'2026-09-08',totalPrice:1000,status:'confirmed'},
    {id:'paid',propId:'q',guestName:'Cancelled Example',guestCount:2,platform:'airbnb',checkIn:'2026-09-21',checkOut:'2026-09-26',totalPrice:2500.23,cancellationRevenue:2500.23,status:'cancelled',notes:''}];
    showModal=function(html){window.lastModal=html;};`);
  const report=app.run('renderBookingReport()');
  assert.match(report,/Includes €2,500\.23 retained from cancelled bookings/);
  assert.match(report,/>1<\/div><div class="wr-stat-l">Bookings/);
  assert.match(report,/>7n<\/div>/);
  assert.match(report,/>€1,000<\/div><div class="wr-stat-l">Avg booking/);
  assert.match(report,/>2%<\/div><div class="wr-stat-l">Avg/);
  assert.match(report,/Cancelled Only Villa/);
  assert.match(report,/>0 nights<\/span><span>0 bookings<\/span>/);
  assert.match(report,/onclick="openBookingDetail\('paid'\)"/);
  assert.equal(app.run("propOccupancyStatus('q','2026-09-22').type"),'empty');
  const sessions=app.run('JSON.stringify(D.sessions)');
  app.run("openBookingDetail('paid');scheduleCleanFromBooking('paid')");
  assert.match(app.context.lastModal,/Cancelled · Money retained: €2,500\.23/);
  assert.doesNotMatch(app.context.lastModal,/Schedule cleaning/);
  assert.equal(app.run('JSON.stringify(D.sessions)'),sessions);
});

test('cancellation editor validates before mutation and saves full, partial and refunded amounts', () => {
  const app=runtime();
  app.run(`D.bookings=[{id:'paid',propId:D.props[0].id,guestName:'Cancelled Example',guestCount:2,platform:'airbnb',checkIn:'2026-09-21',checkOut:'2026-09-26',totalPrice:2500.23,status:'cancelled',notes:'Keep note'}];
    showModal=function(html){window.lastModal=html;};openEditBooking('paid');`);
  assert.match(app.context.lastModal,/id="bk-cancellation-revenue" min="0" step="0\.01" value="0"/);
  const fields={'bk-checkin':{value:'2026-09-21'},'bk-checkout':{value:'2026-09-26'},'bk-rate':{value:'2500.23'},'bk-guest':{value:'Cancelled Example'},'bk-gcount':{value:'2'},'bk-notes':{value:'Keep note'},'bk-cancellation-revenue':{value:''}};
  app.context.document.getElementById=id=>fields[id]||{value:''};
  const before=app.run('JSON.stringify(D)'),writes=app.writes.length;
  for(const invalid of ['', '-1', 'NaN', 'Infinity', '1e308']){
    fields['bk-cancellation-revenue'].value=invalid;app.run("saveEditBooking('paid')");
    assert.equal(app.run('JSON.stringify(D)'),before);
    assert.equal(app.writes.length,writes);
  }
  for(const amount of ['2500.23','300.45','0']){
    fields['bk-cancellation-revenue'].value=amount;app.run("saveEditBooking('paid')");
    assert.equal(app.run('D.bookings[0].cancellationRevenue'),Number(amount));
    assert.equal(app.run('D.bookings[0].status'),'cancelled');
    assert.equal(app.run('D.bookings[0].totalPrice'),2500.23);
    const reload=runtime({records:app.records});
    assert.equal(reload.run('D.bookings[0].cancellationRevenue'),Number(amount));
    assert.equal(reload.run('bookingRevenueSummary(D.bookings,2026).totalRev'),Number(amount));
  }
});

test('cloud pulls preserve retained cancellation payments', async () => {
  const app=runtime({host:'antonioseravillas.github.io',protocol:'https:',records:new Map([['sv_secret','SYNTHETIC_TEST_KEY']]),boot:false});
  const remote={props:[],sessions:[],tasks:[],issues:[],bookings:[{id:'paid',propId:'p',platform:'airbnb',checkIn:'2026-09-21',checkOut:'2026-09-26',totalPrice:2500.23,cancellationRevenue:2500.23,status:'cancelled'}],_savedAt:99999};
  app.context.fetch=async()=>({ok:true,text:async()=>JSON.stringify(remote)});
  await app.run('pullFromCloud()');
  assert.equal(app.run('D.bookings[0].cancellationRevenue'),2500.23);
  assert.equal(app.run('bookingRevenueSummary(D.bookings,2026).totalRev'),2500.23);
  assert.equal(JSON.parse(app.records.get('seravillas_v1')).bookings[0].status,'cancelled');
});
