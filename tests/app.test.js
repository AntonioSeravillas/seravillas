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
  const element = {style: {}, classList: {add() {}, remove() {}, toggle() {}}, setAttribute() {}, getAttribute() {return 'dark';}, appendChild() {}, insertBefore() {}, value: ''};
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

test('workspace opens with the villa timeline and changes views without losing the selected month', () => {
  const app=runtime({boot:false});
  assert.equal(app.run('tab'),'calendar');assert.equal(app.run('calView'),'timeline');
  const before=app.run('JSON.stringify(D)');
  app.run("calTimelineDate='2027-08-01';switchCalendarView('month')");
  assert.equal(app.run('calY'),2027);assert.equal(app.run('calM'),7);
  app.run("changeBookingMonth(1);switchCalendarView('timeline')");
  assert.equal(app.run('calTimelineDate'),'2027-09-01');
  app.run("workspaceNavigate('cleaning')");assert.equal(app.run('tab'),'cleaning');
  assert.equal(app.run('JSON.stringify(D)'),before);assert.equal(app.requests.length,0);
});

test('desktop navigation preference survives reload without changing records or calendar context', () => {
  const records=new Map([['sv_sidebar_collapsed','0']]);
  const app=runtime({records});
  assert.equal(app.run('workspaceSidebarCollapsed'),false);
  const before=app.run('JSON.stringify(D)');
  app.run("calView='month';calY=2027;calM=7;setWorkspaceSidebar(true)");
  assert.equal(records.get('seravillas_dev:sv_sidebar_collapsed'),'1');
  assert.equal(records.get('sv_sidebar_collapsed'),'0');
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.run('calView'),'month');assert.equal(app.run('calY'),2027);assert.equal(app.run('calM'),7);
  assert.equal(app.requests.length,0);
  const reloaded=runtime({records});
  assert.equal(reloaded.run('workspaceSidebarCollapsed'),true);
  reloaded.run('setWorkspaceSidebar(false)');
  assert.equal(records.get('seravillas_dev:sv_sidebar_collapsed'),'0');
  reloaded.run("workspaceNavigate('manage','supplies')");
  assert.equal(reloaded.run('workspaceCurrentCategory()'),'stock');
  reloaded.run("tab='properties';propsView='report';propHubId=null");
  assert.equal(reloaded.run('workspaceCurrentCategory()'),'reports');
});

test('monthly stay lanes handle overlaps, checkout exclusivity and year boundaries without editing bookings', () => {
  const app=runtime({boot:false});
  app.run(`D.props=[{id:'p',name:'Villa Test'}];D.bookings=[
    {id:'a',propId:'p',checkIn:'2026-12-28',checkOut:'2027-01-01',status:'confirmed'},
    {id:'b',propId:'p',checkIn:'2027-01-01',checkOut:'2027-01-05',status:'confirmed'},
    {id:'overlap',propId:'p',checkIn:'2026-12-30',checkOut:'2027-01-02',status:'pending'},
    {id:'paid-cancel',propId:'p',checkIn:'2026-12-29',checkOut:'2027-01-02',status:'cancelled',cancellationRetainedCents:10000},
    {id:'old',propId:'p',checkIn:'2026-12-20',checkOut:'2026-12-28',status:'confirmed'}]`);
  const before=app.run('JSON.stringify(D)');
  const stays=plain(app.run("calendarWeekStays('2026-12-28')"));
  assert.deepEqual(stays.map(s=>s.booking.id),['a','overlap','b']);
  assert.deepEqual(stays.map(s=>[s.left,s.right,s.lane]),[[0,4,0],[2,5,1],[4,7,0]]);
  assert.equal(app.run('JSON.stringify(D)'),before);
});

test('day pop-ups include arrivals, stays, departures and cleaning; filters exclude cancelled bookings', () => {
  const app=runtime({boot:false});
  app.run(`D.props=[{id:'p',name:'Villa Test'},{id:'q',name:'Other Villa'}];D.bookings=[
    {id:'out',propId:'p',checkIn:'2027-01-01',checkOut:'2027-01-03',status:'confirmed'},
    {id:'in',propId:'p',checkIn:'2027-01-03',checkOut:'2027-01-08',status:'confirmed'},
    {id:'cancel',propId:'p',checkIn:'2027-01-01',checkOut:'2027-01-08',status:'cancelled'},
    {id:'other',propId:'q',checkIn:'2027-01-01',checkOut:'2027-01-08',status:'confirmed'}];
    D.sessions=[{id:'s',propId:'p',date:'2027-01-03',status:'scheduled'}];D.tasks=[];D.events=[];calFilter='prop-p'`);
  const items=plain(app.run("calendarDayItems('2027-01-03')"));
  assert.deepEqual(items.bookings.map(b=>b.id),['out','in']);assert.equal(items.cleanings.length,1);
  app.run("setCalendarFilter('cleanings')");
  assert.equal(app.run("calendarDayItems('2027-01-03').bookings.length"),0);
  assert.equal(app.run("calendarDayItems('2027-01-03').cleanings.length"),1);
  assert.equal(app.run("calendarWeekStays('2027-01-03').length"),0);
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

test('2027 workbook selection suggests the right year and saves its migration marker without touching 2026', async () => {
  const app=runtime();
  const before2026=app.run('JSON.stringify(D.bookings)');
  app.run(`showModal=function(html){window.lastModal=html;};openExcelImport();
    window.syntheticBook={SheetNames:['VILLA MAR'],Sheets:{'VILLA MAR':XLSX.utils.aoa_to_sheet([['AGENCIA','Fecha entrada','Fecha salida','Noches','Nombre cliente','$ a cobrar'],['AIRBNB','01/07/2027','08/07/2027',7,'Next Year Example Guest',1200]])}};`);
  await app.run(`readExcelBookingFile({target:{files:[{name:'fictional-2027.xlsx',arrayBuffer:async()=>XLSX.write(window.syntheticBook,{type:'array',bookType:'xlsx'})}]}})`);
  assert.equal(app.run('excelImportState.year'),2027);
  assert.match(app.context.lastModal,/Import year: <strong>2027<\/strong>/);
  assert.match(app.context.lastModal,/all 2027 bookings/);
  app.run("setExcelMapping('VILLA MAR',D.props[0].id);applyExcelBookingImport()");
  assert.equal(app.run('D.importHistory.at(-1).year'),2027);
  assert.equal(app.run('D._migrations.includes(BOOKING_2027_KEY)'),true);
  assert.equal(app.run('D._migrations.includes(BOOKING_MIGRATION_KEY)'),false);
  assert.equal(app.run('JSON.stringify(D.bookings.slice(0,-1))'),before2026);
  assert.equal(app.run('D.bookings.at(-1).checkIn'),'2027-07-01');
  assert.match(app.context.lastModal,/2027 · 1 added/);
  assert.equal(app.requests.length,0);
  const reloaded=runtime({records:app.records});
  assert.equal(reloaded.run('D._migrations.includes(BOOKING_2027_KEY)'),true);
  assert.equal(reloaded.run('D.importHistory.at(-1).year'),2027);
});

test('changing import year discards old review decisions and scopes the rebuilt preview', () => {
  const app=runtime();
  app.run(`showModal=function(html){window.lastModal=html;};openExcelImport();
    excelImportState.parsed={errors:[],sheets:[{name:'DEMO',property:D.props[0].name,count:1}],rows:[{key:'DEMO:4',sheet:'DEMO',row:4,property:D.props[0].name,sourceChannel:'PRIVATE',platform:'direct',agencyName:'',guestName:'Next Year Example',reference:'test',guestCount:2,totalPrice:100,checkIn:'2027-11-01',checkOut:'2027-11-08',originalCheckIn:'2027-11-01',originalCheckOut:'2027-11-08'}]};
    excelImportState.overrides={'DEMO:4':{checkIn:'2026-11-01'}};excelImportState.decisions={'DEMO:4':'skip'};excelImportState.cancelIds=['keep'];excelImportState.completeSnapshot=true;
    setExcelImportYear('2027');`);
  assert.equal(app.run('excelImportState.year'),2027);
  assert.deepEqual(plain(app.run('excelImportState.overrides')),{});
  assert.deepEqual(plain(app.run('excelImportState.decisions')),{});
  assert.deepEqual(plain(app.run('excelImportState.cancelIds')),[]);
  assert.equal(app.run('excelImportState.completeSnapshot'),false);
  assert.equal(app.run('excelImportState.plan.counts.add'),1);
  app.run("setExcelImportYear('2028')");
  assert.equal(app.run('excelImportState.year'),2027);
  assert.equal(app.requests.length,0);
});

test('date review corrects a 2027 row, rejects invalid edits, and preserves source dates', () => {
  const app=runtime();
  app.run(`showModal=function(html){window.lastModal=html;};openExcelImport();setExcelImportYear('2027');
    excelImportState.parsed={errors:[],sheets:[{name:'DEMO',property:D.props[0].name,count:1}],rows:[{key:'DEMO:4',sheet:'DEMO',row:4,property:D.props[0].name,sourceChannel:'PRIVATE',platform:'direct',agencyName:'',guestName:'Next Year Example',reference:'test',guestCount:2,totalPrice:100,sourceNights:6,checkIn:'2027-09-06',checkOut:'2027-12-09',originalCheckIn:'2027-09-06',originalCheckOut:'2027-12-09'}]};renderExcelImport();`);
  assert.equal(app.run('excelImportState.plan.counts.review'),1);
  assert.match(app.context.lastModal,/Use these dates/);
  assert.match(app.context.lastModal,/keep 94 nights instead of the workbook’s 6/);
  app.run("setExcelDates('DEMO:4','2027-09-06','2027-09-06')");
  assert.equal(app.run('excelImportState.plan.counts.review'),1);
  assert.match(app.context.lastModal,/Check-out must be after/);
  app.run("setExcelDates('DEMO:4','2027-09-06','2027-09-12');applyExcelBookingImport()");
  assert.equal(app.run('D.bookings.at(-1).checkOut'),'2027-09-12');
  assert.equal(app.run('D.bookings.at(-1)._excel.originalCheckOut'),'2027-12-09');
  assert.equal(app.run('D.bookings.at(-1)._excel.sourceNights'),6);
  assert.equal(app.requests.length,0);
});

test('timeline month navigation reaches next year and preserves cancelled history and data', () => {
  const app=runtime();
  app.run(`today=function(){return '2026-10-01';};window.innerWidth=1024;
    D.props=[{id:'p',name:'Example Villa'}];D.sessions=[];
    D.bookings=[{id:'next-summer',propId:'p',guestName:'Future Example',platform:'airbnb',checkIn:'2027-06-11',checkOut:'2027-06-17',status:'confirmed',totalPrice:100},
    {id:'next-cancelled',propId:'p',guestName:'Cancelled Example',checkIn:'2027-06-21',checkOut:'2027-06-26',status:'cancelled',cancellationRevenue:100}];`);
  const before=app.run('JSON.stringify(D)'),writes=app.writes.length;
  assert.doesNotMatch(app.run('renderCalendarTimeline()'),/data-bk="next-summer"/);
  app.run("setTimelineMonth('2027-06')");
  const future=app.run('renderCalendarTimeline()');
  assert.match(future,/value="2027-06"/);
  assert.match(future,/data-date="2027-06-01" id="tl-focus-hdr"/);
  assert.match(future,/data-bk="next-summer"/);
  assert.doesNotMatch(future,/data-bk="next-cancelled"/);
  app.run("setTimelineMonth('2027-13')");
  assert.equal(app.run('calTimelineDate'),'2027-06-01');
  const outer={scrollLeft:0};
  app.context.document.getElementById=id=>id==='tl-outer'?outer:id==='tl-focus-hdr'?{offsetLeft:2000}:null;
  app.run('tlScrollFocus()');
  assert.equal(outer.scrollLeft,1800);
  app.run('tlScrollToday()');
  assert.equal(app.run('calTimelineDate'),'');
  assert.match(app.run('renderCalendarTimeline()'),/data-date="2026-10-01" id="tl-focus-hdr"/);
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.writes.length,writes);
  assert.equal(app.requests.length,0);
});

test('legacy cleaning assignments are confirmed and reading their coverage does not migrate data', () => {
  const app=runtime();
  app.run("D.cleaners=[{id:'a',name:'Maribel'},{id:'b',name:'Another Cleaner'}];D.sessions=[{id:'s',propId:D.props[0].id,date:today(),cleanerIds:['a','a','b'],status:'scheduled'}]");
  const before=app.run('JSON.stringify(D)'),writes=app.writes.length;
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),2);
  assert.deepEqual(plain(app.run('getCleaningAssignedCleanerIds(D.sessions[0])')),['a','b']);
  assert.equal(app.run("getCleanerDailyConflict('a',today(),'other')"),true);
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.writes.length,writes);
});

test('crew changes keep the cleaner grid and confirmation counts consistent', () => {
  const app=runtime();
  app.run("showModal=function(){};D.cleaners=[{id:'a',name:'Maribel'},{id:'b',name:'Another Cleaner'}];D.sessions=[{id:'s',propId:D.props[0].id,date:today(),cleanerIds:['a'],status:'scheduled'}];crewAddMain('s','another cleaner')");
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),['a','b']);
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),1);
  app.run("crewSetMainStatus('s','another cleaner','confirmed')");
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),2);
  app.run("crewSetMainStatus('s','maribel','cancelled')");
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),['b']);
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),1);
  app.run("crewRemoveMain('s','another cleaner')");
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),[]);
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),0);
  assert.equal(app.requests.length,0);
});

test('cancelled staff and Alina spots cannot be reactivated past daily capacity', () => {
  const app=runtime();
  app.run(`showModal=function(){};D.cleaners=[{id:'a',name:'Maribel'}];D.sessions=[
    {id:'s1',propId:'p',date:today(),cleanerIds:[],status:'scheduled',crew:{main:[{cleanerId:'a',name:'Maribel',status:'cancelled'}],alinaSpots:3,alinaStatus:'cancelled'}},
    {id:'s2',propId:'q',date:today(),cleanerIds:['a'],status:'scheduled',crew:{main:[{cleanerId:'a',name:'Maribel',status:'confirmed'}],alinaSpots:2,alinaStatus:'confirmed'}}]`);
  const before=app.run('JSON.stringify(D)'),writes=app.writes.length;
  app.run("crewSetMainStatus('s1','maribel','confirmed');crewSetAlina('s1',null,'confirmed');crewSetAlina('s1',-1,null)");
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.writes.length,writes);
  app.run("crewSetAlina('s1',2,'offered')");
  assert.equal(app.run('getAlinaUsedSpotsForDate(today())'),4);
});

test('checkout planning scopes dates and villas, excludes cancelled stays, and flags wrong links', () => {
  const app=runtime();
  app.run(`D.sessions=[{id:'correct',propId:'p',date:'2027-06-08',status:'scheduled'},{id:'wrong',propId:'p',date:'2027-06-09',status:'scheduled'},{id:'unlinked',propId:'q',date:'2027-06-08',status:'scheduled'}];
    D.bookings=[{id:'linked',propId:'p',checkOut:'2027-06-08',status:'confirmed',linkedCleaningId:'correct'},
    {id:'review',propId:'p',checkOut:'2027-06-08',status:'confirmed',linkedCleaningId:'wrong'},
    {id:'link',propId:'q',checkOut:'2027-06-08',status:'confirmed'},
    {id:'missing',propId:'r',checkOut:'2027-06-08',status:'confirmed'},
    {id:'cancelled',propId:'r',checkOut:'2027-06-08',status:'cancelled'},
    {id:'outside',propId:'r',checkOut:'2027-07-08',status:'confirmed'}]`);
  const items=plain(app.run("SV_CLEANING.checkouts(D,'2027-06-01','2027-06-10','')"));
  assert.deepEqual(items.map(i=>[i.bookingId,i.kind]),[['review','review'],['link','link'],['missing','missing']]);
  assert.equal(app.run("SV_CLEANING.checkouts(D,'2027-06-01','2027-06-10','q').length"),1);
});

test('planning creates one linked checkout cleaning and reuses existing sessions without duplicates', () => {
  const app=runtime();
  app.run(`showModal=function(){};D.bookings=[{id:'missing',propId:D.props[0].id,checkIn:'2027-06-01',checkOut:'2027-06-08',checkOutTime:'11:00',status:'confirmed',notes:'Keep',totalPrice:2000},
    {id:'existing',propId:D.props[1].id,checkIn:'2027-06-01',checkOut:'2027-06-08',status:'confirmed'},
    {id:'cancelled',propId:D.props[0].id,checkOut:'2027-06-09',status:'cancelled'}];D.sessions=[{id:'keep',propId:D.props[1].id,date:'2027-06-08',status:'scheduled',cleanerIds:[]}];
    scheduleMissingCheckout('missing');scheduleMissingCheckout('missing');linkExistingCheckout('existing');scheduleMissingCheckout('cancelled')`);
  assert.equal(app.run('D.sessions.length'),2);
  assert.equal(app.run('D.sessions[1].time'),'11:00');
  assert.deepEqual(plain(app.run('D.sessions[1].cleanerIds')),[]);
  assert.equal(app.run('D.bookings[0].linkedCleaningId'),app.run('D.sessions[1].id'));
  assert.equal(app.run('D.bookings[0].notes'),'Keep');
  assert.equal(app.run('D.bookings[0].totalPrice'),2000);
  assert.equal(app.run('D.bookings[1].linkedCleaningId'),'keep');
  assert.equal(app.run('D.bookings[2].linkedCleaningId'),undefined);
  assert.equal(app.requests.length,0);
  const reloaded=runtime({records:app.records});
  assert.equal(reloaded.run('D.sessions.length'),2);
  assert.equal(reloaded.run('D.bookings[1].linkedCleaningId'),'keep');
});

test('cleaning context uses arrival/departure dates only and future week navigation does not edit records', () => {
  const app=runtime();
  app.run(`D.props=[{id:'p',name:'Example Villa'}];D.sessions=[{id:'s',propId:'p',date:'2027-06-08',time:'10:30',cleanerIds:[],status:'scheduled'}];
    D.bookings=[{id:'out',propId:'p',checkIn:'2027-06-01',checkOut:'2027-06-08',guestName:'PRIVATE_NAME_SENTINEL',totalPrice:98765,status:'confirmed',notes:'PRIVATE_NOTE_SENTINEL',linkedCleaningId:'s'},
    {id:'in',propId:'p',checkIn:'2027-06-08',checkInTime:'15:00',checkOut:'2027-06-15',status:'confirmed'}]`);
  const before=app.run('JSON.stringify(D)'),writes=app.writes.length;
  app.run("setScheduleDate('2027-06-08')");
  assert.equal(app.run('addDays(startOfWeek(),schedWeekOffset*7)'),'2027-06-07');
  const board=app.run('renderCleanerSchedule()');
  assert.match(board,/Next arrival today · 15:00/);
  assert.match(board,/Check-out 10:00/);
  assert.doesNotMatch(board,/PRIVATE_NAME_SENTINEL|98765|PRIVATE_NOTE_SENTINEL/);
  assert.deepEqual(plain(app.run('SV_CLEANING.context(D.sessions[0],D.bookings)')),{departure:{date:'2027-06-08',time:'10:00'},arrival:{date:'2027-06-08',time:'15:00'},sameDayArrival:true});
  assert.equal(app.run('JSON.stringify(D)'),before);
  assert.equal(app.writes.length,writes);
});

test('session editing preserves offered confirmations, synchronizes IDs, and allows planned unassigned work', () => {
  const app=runtime();
  app.run("showModal=function(){};D.cleaners=[{id:'a',name:'Maribel'},{id:'b',name:'Another Cleaner'}];D.sessions=[{id:'s',propId:'p',date:'2027-06-08',time:'10:00',note:'Keep',cleanerIds:['a'],status:'scheduled',crew:{main:[{cleanerId:'a',name:'Maribel',status:'offered'}],alinaSpots:0,alinaStatus:'offered'}}];window._ec=['a','b']");
  const fields={'e-date':{value:'2027-06-08'},'e-time':{value:'10:00'},'e-note':{value:'Keep'}};
  app.context.document.getElementById=id=>fields[id]||{};
  app.run("saveSessEdit('s')");
  assert.equal(app.run('D.sessions[0].crew.main[0].status'),'offered');
  assert.equal(app.run('D.sessions[0].crew.main[1].status'),'confirmed');
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),['a','b']);
  app.run("window._ec=[];saveSessEdit('s')");
  assert.equal(app.run('getCleaningCrewStatus(D.sessions[0])'),'unassigned');
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),[]);
});

test('Alina team allocations appear in the cleaner grid without becoming named main assignments', () => {
  const app=runtime();
  app.run("D.cleaners=[{id:'team',name:'Alina'}];D.sessions=[{id:'s',propId:D.props[0].id,date:today(),status:'scheduled',cleanerIds:[],crew:{main:[],alinaSpots:3,alinaStatus:'confirmed'}}];syncCleaningCleanerIds(D.sessions[0]);schedView='cleaners'");
  assert.deepEqual(plain(app.run('D.sessions[0].cleanerIds')),['team']);
  assert.equal(app.run('getConfirmedCrewCount(D.sessions[0])'),3);
  assert.match(app.run('renderCleanerSchedule()'),/openSess\('s'\)/);
  assert.equal(app.run('getCleaningCrew(D.sessions[0]).main.length'),0);
});

test('staff names containing apostrophes use data attributes in assignment buttons', () => {
  const app=runtime();
  app.run("showModal=function(html){window.lastModal=html};D.cleaners=[{id:'a',name:\"O'Neil\"}];D.sessions=[{id:'s',propId:D.props[0].id,date:today(),status:'scheduled',cleanerIds:[]}];openCrewModal('s')");
  assert.match(app.context.lastModal,/data-cleaner-name="o'neil"/);
  assert.match(app.context.lastModal,/onclick="crewAddMain\(this.dataset.session,this.dataset.cleanerName\)"/);
});

function versionedReply(data,tag,status=200){return {ok:status>=200&&status<300,status,headers:{get(name){return name.toLowerCase()==='etag'?tag:null;}},text:async()=>JSON.stringify(data),json:async()=>data};}
test('versioned manager sync combines offline edits with cleaner changes after a rejected stale save',async()=>{
  const app=runtime({host:'antonioseravillas.github.io',protocol:'https:',records:new Map([['sv_secret','SYNTHETIC_TEST_KEY']]),boot:false});
  app.run("showModal=function(){};D.props=[];D.cleaners=[];D.bookings=[{id:'b',totalPrice:100}];D.sessions=[{id:'s',note:'old',crew:{main:[{cleanerId:'a',status:'offered'}]}}];D._savedAt=1;");
  let remote=plain(app.run('D')),revision=1,accepted=0;
  app.context.fetch=async(url,options)=>{if(options.method==='GET')return versionedReply(plain(remote),'"sv-'+revision+'"');if(options.headers['If-Match']!=='"sv-'+revision+'"')return versionedReply({error:'stale'},null,409);remote=JSON.parse(options.body);remote._savedAt=1000;revision++;accepted++;return versionedReply({savedAt:1000},'"sv-'+revision+'"');};
  await app.run('pullFromCloud()');app.run("D.bookings[0].totalPrice=200;D.sessions[0].note='manager edit';save()");
  remote.sessions[0].crew.main[0].status='confirmed';remote._savedAt=5;revision++;
  await app.run('pushToCloud()');assert.equal(accepted,0);assert.equal(app.run('D.sessions[0].crew.main[0].status'),'confirmed');assert.equal(app.run('D.sessions[0].note'),'manager edit');
  await app.run('pushToCloud()');assert.equal(accepted,1);assert.equal(remote.bookings[0].totalPrice,200);assert.equal(remote.sessions[0].crew.main[0].status,'confirmed');
});
test('same-field sync conflicts preserve local edits and resolve only the conflicting fields',async()=>{
  const app=runtime({host:'antonioseravillas.github.io',protocol:'https:',records:new Map([['sv_secret','SYNTHETIC_TEST_KEY']]),boot:false});
  app.run("showModal=function(){};closeModal=function(){};D.sessions=[{id:'s',date:'2026-10-01',time:'10:00'}];D._savedAt=1");let remote=plain(app.run('D')),tag='"sv-1"';
  app.context.fetch=async()=>versionedReply(plain(remote),tag);await app.run('pullFromCloud()');
  app.run("D.sessions[0].date='2026-10-02';save()");remote.sessions[0].date='2026-10-03';remote.sessions[0].time='11:00';tag='"sv-2"';
  assert.equal(await app.run('pullFromCloud()'),false);assert.equal(app.run('D.sessions[0].date'),'2026-10-02');assert.ok(app.run('cloudConflict'));
  app.run("resolveCloudConflict('local')");assert.equal(app.run('D.sessions[0].date'),'2026-10-02');assert.equal(app.run('D.sessions[0].time'),'11:00');assert.equal(app.run('cloudState().etag'),tag);assert.equal(app.run('cloudConflict'),null);
});
test('offline manager edits and their merge baseline survive reload',async()=>{
  const records=new Map([['sv_secret','SYNTHETIC_TEST_KEY']]);const app=runtime({host:'antonioseravillas.github.io',protocol:'https:',records,boot:false});app.run("D.bookings=[{id:'b',totalPrice:100}];D._savedAt=1");const remote=plain(app.run('D'));
  app.context.fetch=async()=>versionedReply(remote,'"sv-1"');await app.run('pullFromCloud()');app.run('D.bookings[0].totalPrice=250;save()');app.context.fetch=async()=>{throw new Error('offline');};await app.run('pushToCloud()');
  const reloaded=runtime({host:'antonioseravillas.github.io',protocol:'https:',records,boot:false});reloaded.run('load()');assert.equal(reloaded.run('D.bookings[0].totalPrice'),250);assert.equal(reloaded.run('cloudState().base.bookings[0].totalPrice'),100);assert.equal(reloaded.run('cloudState().etag'),'"sv-1"');
});
test('edits made while a save is in flight remain local and are not marked as already synced',async()=>{
  const app=runtime({host:'antonioseravillas.github.io',protocol:'https:',records:new Map([['sv_secret','SYNTHETIC_TEST_KEY']]),boot:false});app.run("D.scratch='base';D._savedAt=1");const remote=plain(app.run('D'));app.context.fetch=async()=>versionedReply(remote,'"sv-1"');await app.run('pullFromCloud()');app.run("D.scratch='first edit';save()");
  let release,started;const reached=new Promise(resolve=>started=resolve);app.context.fetch=async()=>{started();await new Promise(resolve=>release=resolve);return versionedReply({savedAt:100},'"sv-2"');};
  const pushing=app.run('pushToCloud()');await reached;app.run("D.scratch='second edit';save()");release();await pushing;assert.equal(app.run('D.scratch'),'second edit');assert.equal(app.run('cloudState().base.scratch'),'first edit');
});
test('moving a cleaning asks the assigned team to confirm again and clears old completion stamps',()=>{
  const app=runtime({boot:false});app.run("showModal=function(){};D.cleaners=[{id:'a',name:'Maribel'},{id:'team',name:'Alina'}];D.sessions=[{id:'s',propId:'p',date:'2027-06-08',time:'10:00',status:'scheduled',cleanerIds:['a'],crew:{main:[{cleanerId:'a',name:'Maribel',status:'confirmed',completedAt:'old'}],alinaSpots:2,alinaStatus:'confirmed',alinaCompletedAt:'old'}}];window._ec=['a'];");
  app.context.document.getElementById=id=>({value:({'e-date':'2027-06-09','e-time':'11:00','e-note':'Keep'})[id]||'',style:{},classList:{}});app.run("saveSessEdit('s')");assert.equal(app.run('D.sessions[0].crew.main[0].status'),'offered');assert.equal(app.run('D.sessions[0].crew.main[0].completedAt'),undefined);assert.equal(app.run('D.sessions[0].crew.alinaStatus'),'offered');assert.equal(app.run('D.sessions[0].crew.alinaCompletedAt'),undefined);
});
