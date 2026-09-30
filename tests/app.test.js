const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"[^>]*><\/script>/g)].map(match => match[1]);
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
