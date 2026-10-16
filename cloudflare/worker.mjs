/* SeraVillas manager sync + restricted cleaning portal.
   DB = existing KV. STAFF_DB = D1. Migration is explicit and manager-only.
   No credentials or booking data belong in this source file. */
const ROOT = 'seravillas';
const MAX_BYTES = 1800000;
const ALLOWED = new Set(['https://antonioseravillas.github.io']);
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const clone = value => JSON.parse(JSON.stringify(value));
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export async function digest(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), n => n.toString(16).padStart(2, '0')).join(''); }
function db(env) { if (!env.STAFF_DB) fail(503, 'Cleaner access is not activated yet'); return env.STAFF_DB.withSession('first-primary'); }
function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !['props','cleaners','bookings','sessions'].every(k => Array.isArray(data[k]))) fail(400, 'Invalid app backup');
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_BYTES) fail(413, 'App data is too large. Export a backup and move photos to separate storage before syncing.');
  return data;
}
async function body(request, limit = MAX_BYTES) {
  if (Number(request.headers.get('Content-Length')) > limit) fail(413, 'Request too large');
  const reader = request.body?.getReader(); if (!reader) fail(400, 'Missing request body');
  let size = 0; const parts = [];
  while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); fail(413, 'Request too large'); } parts.push(value); }
  const bytes = new Uint8Array(size); let pos = 0; for (const part of parts) { bytes.set(part, pos); pos += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Invalid JSON'); }
}
async function snapshot(sql) { const row = await sql.prepare('SELECT json, revision FROM app_state WHERE id=1').first(); return row ? {data: JSON.parse(row.json), revision: row.revision} : null; }
function requireState(state) { if (!state) fail(503, 'Cleaner access is not activated yet'); return state; }
const etag = revision => '"sv-' + revision + '"';
function crew(session, data) {
  if (session.crew) return {main: (session.crew.main || []).map(clone), alinaSpots: Number(session.crew.alinaSpots) || 0, alinaStatus: session.crew.alinaStatus || 'offered', alinaCompletedAt: session.crew.alinaCompletedAt || ''};
  return {main: [...new Set(session.cleanerIds || [])].map(id => ({cleanerId:id, name:data.cleaners.find(c=>c.id===id)?.name || 'Former cleaner', status:'confirmed'})), alinaSpots:0, alinaStatus:'offered', alinaCompletedAt:''};
}
function assignment(session, data, cleanerId, kind) {
  const current = crew(session, data);
  if (kind === 'main') { const item = current.main.find(m=>m.cleanerId===cleanerId); if (!item) fail(403, 'This assignment belongs to another cleaner'); return {current, item}; }
  if (kind === 'alina') {
    const owner = data.cleaners.find(c=>String(c.name||'').toLowerCase().trim()==='alina');
    if (!owner || owner.id!==cleanerId || current.alinaSpots<1) fail(403, 'This team assignment belongs to another cleaner');
    return {current, item:{status:current.alinaStatus, completedAt:current.alinaCompletedAt}};
  }
  fail(400, 'Invalid assignment type');
}
export async function assignmentVersion(session, data, cleanerId, kind) {
  const {current, item} = assignment(session, data, cleanerId, kind);
  return digest(JSON.stringify([session.id,session.propId,session.date,session.time||'',session.status,cleanerId,kind,item.status,item.completedAt||'',kind==='alina'?current.alinaSpots:0]));
}
function required(name) { return ({'villa mar':4,'mar':4,'villa marjals':4,'can marjals':4,'marjals':4,'villa diagonal':3,'diagonal':3,'la forca':3,'forca':3,'can vallori':1,'vallori':1})[String(name).trim().toLowerCase()] || 1; }
export async function projectSchedule(data, cleanerId, start, end, revision) {
  const result = {user:{id:cleanerId,name:data.cleaners.find(c=>c.id===cleanerId)?.name || 'Cleaner'}, revision, start, end, properties:data.props.map(p=>({id:p.id,name:p.name})), stays:[], sessions:[]};
  const active = data.bookings.filter(b=>b.status!=='cancelled');
  result.stays = active.filter(b=>b.checkIn<=end && b.checkOut>=start).map(b=>({propId:b.propId,arrival:b.checkIn,departure:b.checkOut,arrivalTime:b.checkInTime||'16:00',departureTime:b.checkOutTime||'10:00'}));
  for (const session of data.sessions.filter(s=>s.status!=='cancelled' && s.date>=start && s.date<=end)) {
    const current = crew(session,data), prop = data.props.find(p=>p.id===session.propId);
    const depart = active.find(b=>b.propId===session.propId && b.checkOut===session.date);
    const arrive = active.filter(b=>b.propId===session.propId && b.checkIn>=session.date).sort((a,b)=>a.checkIn.localeCompare(b.checkIn))[0];
    const own = [];
    if (current.main.some(m=>m.cleanerId===cleanerId)) own.push({kind:'main',version:await assignmentVersion(session,data,cleanerId,'main')});
    const alina = data.cleaners.find(c=>String(c.name||'').trim().toLowerCase()==='alina');
    if (alina?.id===cleanerId && current.alinaSpots>0) own.push({kind:'alina',version:await assignmentVersion(session,data,cleanerId,'alina')});
    result.sessions.push({id:session.id,propId:session.propId,date:session.date,time:session.time||'',status:session.status,required:required(prop?.name||''),departure:depart?{date:depart.checkOut,time:depart.checkOutTime||'10:00'}:null,arrival:arrive?{date:arrive.checkIn,time:arrive.checkInTime||'16:00'}:null,crew:{main:current.main.map(m=>({cleanerId:m.cleanerId,name:data.cleaners.find(c=>c.id===m.cleanerId)?.name||m.name||'Former cleaner',status:m.status,completedAt:m.completedAt||''})),alinaSpots:current.alinaSpots,alinaStatus:current.alinaStatus,alinaCompletedAt:current.alinaCompletedAt},own});
  }
  return result;
}
function range(url) {
  const start=url.searchParams.get('start'), end=url.searchParams.get('end');
  const valid = x => /^\d{4}-\d{2}-\d{2}$/.test(x||'') && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x;
  if (!valid(start)||!valid(end)||end<start||(Date.parse(end)-Date.parse(start))/86400000>62) fail(400,'Choose a schedule range of up to 63 days');
  return {start,end};
}
function assertKeys(value,keys) { if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) fail(400,'Unexpected fields'); }
async function cleanerAuth(request,sql,data) {
  const access = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(access)) fail(401,'Please sign in with your personal access code');
  const account = await sql.prepare('SELECT cleaner_id FROM cleaner_accounts WHERE token_hash=? AND revoked=0').bind(await digest(access.slice(7))).first();
  if (!account || !data.cleaners.some(c=>c.id===account.cleaner_id)) fail(401,'This access code is no longer valid');
  return account.cleaner_id;
}
function manager(request,env) { const access=request.headers.get('X-Secret'); return !!env.SECRET && !!access && access===env.SECRET; }
function today(env) { return new Intl.DateTimeFormat('en-CA',{timeZone:env.SITE_TIME_ZONE||'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function applyAssignment(data,cleanerId,input,nowDate,nowISO) {
  const next=clone(data), session=next.sessions.find(s=>s.id===input.sessionId);
  if (!session) fail(404,'This cleaning no longer exists');
  if (session.status==='cancelled'||session.status==='done') fail(409,'The manager has closed this cleaning');
  const {current,item}=assignment(session,next,cleanerId,input.kind);
  if (item.status==='cancelled') fail(409,'The manager must offer this assignment again');
  if (input.action==='confirm') {
    if (item.status!=='offered') fail(409,'This assignment is already confirmed');
    if (input.kind==='main' && next.sessions.some(s=>s.id!==session.id&&s.date===session.date&&s.status!=='cancelled'&&crew(s,next).main.some(m=>m.cleanerId===cleanerId&&m.status!=='cancelled'))) fail(409,'You are assigned to another villa that day. Ask the manager to review.');
    item.status='confirmed';
  } else if (input.action==='decline') { if (item.completedAt) fail(409,'Completed work cannot be declined'); item.status='cancelled'; }
  else if (input.action==='complete') { if (item.status!=='confirmed') fail(409,'Confirm this assignment first'); if (session.date>nowDate) fail(409,'Future work cannot be marked done'); if(item.completedAt)fail(409,'Your work is already marked done'); item.completedAt=nowISO; }
  else fail(400,'Invalid action');
  if(input.kind==='alina'){ current.alinaStatus=item.status; current.alinaCompletedAt=item.completedAt||''; }
  session.crew=current;
  session.cleanerIds=[...new Set(current.main.filter(m=>m.status!=='cancelled').map(m=>m.cleanerId))];
  const alina=next.cleaners.find(c=>String(c.name||'').trim().toLowerCase()==='alina');
  if (alina&&current.alinaSpots>0&&current.alinaStatus!=='cancelled') session.cleanerIds.push(alina.id);
  next._savedAt=Date.now();
  return next;
}
/* ── Jarvis live relay ──────────────────────────────────────────────────────────────────────────────
   Lets the signed-in manager app reach the Jarvis PC (which has no public port). The PC polls outbound with
   its own device token. Isolated relay_* tables (created lazily, never app_state); jobs are short-lived,
   bounded, claimed atomically once and never requeued. The device token cannot read app data or manager APIs. */
/* A WhatsApp send must start within 30 s (well inside the app's 60 s wait) or it expires unsent; other requests 5 min. */
const RELAY = {requestTtl:300000, sendTtl:30000, resultTtl:120000, onlineMs:45000, maxQueued:20, maxPayload:100000, maxResult:262144};
let relayNow = () => Date.now();
/* Tests only: lets the fake clock drive TTLs. Production never calls this. */
export function setRelayClockForTests(fn) { relayNow = typeof fn === 'function' ? fn : () => Date.now(); }
const RELAY_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS relay_devices (id INTEGER PRIMARY KEY CHECK(id=1), token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS relay_jobs (id TEXT PRIMARY KEY, op TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, device_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, claimed_at INTEGER, result TEXT, result_expires_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS relay_jobs_queue ON relay_jobs (status, created_at)'
];
const relayReady = new WeakSet();
/* Creates the relay tables. Called only after manager authentication; device requests never create schema. */
async function relaySql(env) {
  const sql = db(env);
  if (!relayReady.has(env.STAFF_DB)) { for (const statement of RELAY_SCHEMA) await sql.prepare(statement).run(); relayReady.add(env.STAFF_DB); }
  return sql;
}
async function relayPurge(sql, now) {
  await sql.prepare("DELETE FROM relay_jobs WHERE (status='done' AND result_expires_at<?1) OR (status IN ('queued','processing','expired') AND expires_at<?2)").bind(now, now - RELAY.resultTtl).run();
  await sql.prepare("UPDATE relay_jobs SET status='expired', payload='' WHERE status='queued' AND expires_at<?1").bind(now).run();
}
const expireQueued = sql => sql.prepare("UPDATE relay_jobs SET status='expired', payload='' WHERE status='queued'");
/* The broker strips the PC's local session token and the WhatsApp pairing QR even if an agent forgot to. */
function relayClean(body) {
  const clean = JSON.parse(JSON.stringify(body));
  delete clean.requestToken;
  if (clean.connection && typeof clean.connection === 'object') delete clean.connection.qr;
  return clean;
}
const HEX20 = /^[a-f0-9]{20}$/, HEX64 = /^[a-f0-9]{64}$/;
const relayText = (value, max) => { if (typeof value !== 'string' || value.length > max) fail(400, 'Invalid relay request'); return value; };
/* Exactly the operations the PC agent will run. AI drafting, model consent and WhatsApp connect/pairing are not here. */
const RELAY_OPS = {
  'live-session': p => { assertKeys(p, []); return {}; },
  'health': p => { assertKeys(p, []); return {}; },
  'speech': p => { assertKeys(p, ['text']); if(!relayText(p.text,600).trim())fail(400,'Invalid speech request'); return {text:p.text}; },
  'wa-status': p => { assertKeys(p, []); return {}; },
  'chat': p => {
    assertKeys(p, ['text','sessionId','context']);
    if (!relayText(p.text, 2000).trim() || !/^[a-zA-Z0-9_-]{8,100}$/.test(p.sessionId || '') || !p.context || typeof p.context !== 'object' || Array.isArray(p.context)) fail(400, 'Invalid relay request');
    return {text:p.text, sessionId:p.sessionId, context:p.context};
  },
  'wa-inbox': p => { assertKeys(p, ['chat','view','limit','offset','direction','query']); if (p.chat !== undefined && !HEX20.test(p.chat)) fail(400, 'Invalid relay request'); if(p.view!==undefined&&!['voice','recent','unread','history','awaiting'].includes(p.view))fail(400,'Invalid message view');for(const k of ['limit','offset'])if(p[k]!==undefined&&(!Number.isInteger(p[k])||p[k]<(k==='limit'?1:0)||p[k]>(k==='limit'?10:100)))fail(400,'Invalid message window');if(p.direction!==undefined&&!['incoming','outgoing','both'].includes(p.direction))fail(400,'Invalid message direction');if(p.query!==undefined&&(typeof p.query!=='string'||p.query.length>120))fail(400,'Invalid message search');return {...p}; },
  'wa-read': p => { assertKeys(p, ['messages']); if(!Array.isArray(p.messages)||p.messages.length<1||p.messages.length>10||p.messages.some(id=>typeof id!=='string'||!HEX20.test(id)))fail(400,'Invalid relay request'); return {messages:p.messages}; },
  'wa-review': p => {
    assertKeys(p, ['chat','version','text','checkedPhone']);
    if (!HEX20.test(p.chat || '') || !Number.isInteger(p.version) || p.version < 0 || (p.checkedPhone !== undefined && typeof p.checkedPhone !== 'boolean')) fail(400, 'Invalid relay request');
    return {chat:p.chat, version:p.version, text:relayText(p.text, 2000), checkedPhone:p.checkedPhone === true};
  },
  'wa-send': p => {
    assertKeys(p, ['chat','reviewToken','text']);
    if (!HEX20.test(p.chat || '') || !/^[A-Za-z0-9_-]{16,64}$/.test(p.reviewToken || '') || !relayText(p.text, 2000).trim()) fail(400, 'Invalid relay request');
    return {chat:p.chat, reviewToken:p.reviewToken, text:p.text};
  },
  'wa-discard': p => { assertKeys(p, ['chat']); if (!HEX20.test(p.chat || '')) fail(400, 'Invalid relay request'); return {chat:p.chat}; }
};
const deviceHeader = request => { const access = request.headers.get('Authorization') || ''; if (!/^Bearer [a-f0-9]{64}$/.test(access)) fail(401, 'Unauthorized'); return access; };
/* Device authentication against the existing table only (fails closed if the relay was never set up). Returns the
   device generation: the hash of the currently registered token. */
async function relayDevice(request, sql) {
  const access = deviceHeader(request), hash = await digest(access.slice(7));
  let row = null;
  try { row = await sql.prepare('SELECT token_hash FROM relay_devices WHERE id=1 AND revoked=0').first(); } catch { fail(401, 'This PC is not registered'); }
  if (!row || row.token_hash !== hash) fail(401, 'This PC is no longer registered');
  return hash;
}
async function relayRoutes(request, env, path, isManager) {
  if (!path.startsWith('/api/relay/')) return null;
  const now = relayNow(), method = request.method;
  if (path === '/api/relay/device' && (method === 'GET' || method === 'POST')) {
    if (!isManager) fail(401, 'Unauthorized');
    const sql = await relaySql(env);
    if (method === 'GET') {
      const row = await sql.prepare('SELECT last_seen, revoked FROM relay_devices WHERE id=1').first(), active = !!row && !row.revoked;
      return Response.json({registered:active, online:active && row.last_seen > 0 && now - row.last_seen < RELAY.onlineMs, lastSeen:active && row.last_seen ? new Date(row.last_seen).toISOString() : ''});
    }
    const input = await body(request, 512); assertKeys(input, ['action']);
    /* One transaction: the new (or no) generation and the expiry of every waiting job happen together. */
    if (input.action === 'register') {
      const deviceToken = token();
      await sql.batch([
        sql.prepare('INSERT INTO relay_devices (id, token_hash, created_at, last_seen, revoked) VALUES (1, ?, ?, 0, 0) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at, last_seen=0, revoked=0').bind(await digest(deviceToken), now),
        expireQueued(sql)
      ]);
      return Response.json({registered:true, deviceToken});
    }
    if (input.action === 'revoke') {
      await sql.batch([sql.prepare('UPDATE relay_devices SET revoked=1, last_seen=0 WHERE id=1'), expireQueued(sql)]);
      return Response.json({revoked:true});
    }
    fail(400, 'Invalid device action');
  }
  if (path === '/api/relay/jobs' && method === 'POST') {
    if (!isManager) fail(401, 'Unauthorized');
    const input = await body(request, RELAY.maxPayload + 1024); assertKeys(input, ['op','params']);
    const check = Object.prototype.hasOwnProperty.call(RELAY_OPS, input.op) ? RELAY_OPS[input.op] : null;
    if (!check) fail(400, 'This request is not available from other devices');
    const params = check(input.params === undefined ? {} : input.params), payload = JSON.stringify(params);
    if (payload.length > RELAY.maxPayload) fail(413, 'Request too large');
    const sql = await relaySql(env); await relayPurge(sql, now);
    /* One conditional insert: only for the active, online device generation and only below the queue cap. */
    const jobId = token(), ttl = input.op === 'wa-send' ? RELAY.sendTtl : RELAY.requestTtl;
    const added = await sql.prepare("INSERT INTO relay_jobs (id, op, payload, status, device_hash, created_at, expires_at) SELECT ?1, ?2, ?3, 'queued', d.token_hash, ?4, ?5 FROM relay_devices d WHERE d.id=1 AND d.revoked=0 AND d.last_seen>?6 AND (SELECT COUNT(*) FROM relay_jobs WHERE status='queued')<?7")
      .bind(jobId, input.op, payload, now, now + ttl, now - RELAY.onlineMs, RELAY.maxQueued).run();
    if (!added.meta.changes) {
      const device = await sql.prepare('SELECT last_seen FROM relay_devices WHERE id=1 AND revoked=0').first();
      if (!device || !device.last_seen || now - device.last_seen >= RELAY.onlineMs) fail(503, 'The Jarvis PC is offline. It must be switched on with Jarvis and the live relay running.');
      fail(429, 'Jarvis is busy. Wait a moment and try again.');
    }
    return Response.json({jobId, expiresAt:new Date(now + ttl).toISOString()}, {status:202});
  }
  const job = path.match(/^\/api\/relay\/jobs\/([a-f0-9]{64})$/);
  if (job && method === 'GET') {
    if (!isManager) fail(401, 'Unauthorized');
    const sql = await relaySql(env); await relayPurge(sql, now);
    const row = await sql.prepare('SELECT status, result FROM relay_jobs WHERE id=?').bind(job[1]).first();
    if (!row) return Response.json({status:'gone'}, {status:404});
    return Response.json(row.status === 'done' ? {status:'done', result:JSON.parse(row.result)} : {status:row.status});
  }
  if (path.startsWith('/api/relay/device/') && method === 'POST') {
    deviceHeader(request);
    const sql = db(env), generation = await relayDevice(request, sql);
    await sql.prepare('UPDATE relay_devices SET last_seen=? WHERE id=1 AND revoked=0 AND token_hash=?').bind(now, generation).run();
    if (path === '/api/relay/device/heartbeat') return Response.json({ok:true});
    if (path === '/api/relay/device/claim') {
      await relayPurge(sql, now);
      /* The active-generation check is inside the same statement, so a registration or revoke that lands between
         authentication and this claim cannot hand work to a stale code. */
      const claimed = await sql.prepare("UPDATE relay_jobs SET status='processing', claimed_at=?1 WHERE id=(SELECT id FROM relay_jobs WHERE status='queued' AND expires_at>?1 AND device_hash=?2 ORDER BY created_at, id LIMIT 1) AND status='queued' AND device_hash=?2 AND EXISTS (SELECT 1 FROM relay_devices WHERE id=1 AND revoked=0 AND token_hash=?2) RETURNING id, op, payload").bind(now, generation).first();
      return Response.json({job:claimed ? {jobId:claimed.id, op:claimed.op, params:JSON.parse(claimed.payload)} : null});
    }
    if (path === '/api/relay/device/complete') {
      const input = await body(request, RELAY.maxResult + 2048); assertKeys(input, ['jobId','result']);
      const result = input.result;
      if (!HEX64.test(input.jobId || '') || !result || typeof result !== 'object' || Array.isArray(result) || !Number.isInteger(result.status) || result.status < 100 || result.status > 599 || !result.body || typeof result.body !== 'object' || Array.isArray(result.body)) fail(400, 'Invalid result');
      const stored = JSON.stringify({status:result.status, body:relayClean(result.body)});
      if (stored.length > RELAY.maxResult) fail(413, 'Result too large');
      const done = await sql.prepare("UPDATE relay_jobs SET status='done', result=?1, payload='', result_expires_at=?2 WHERE id=?3 AND status='processing' AND device_hash=?4 AND EXISTS (SELECT 1 FROM relay_devices WHERE id=1 AND revoked=0 AND token_hash=?4)").bind(stored, now + RELAY.resultTtl, input.jobId, generation).run();
      if (!done.meta.changes) fail(409, 'This request is no longer waiting for a result');
      return Response.json({ok:true});
    }
  }
  fail(404, 'Not found');
}

async function routes(request,env) {
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,'') || '/';
  const isManager=manager(request,env);
  if (path==='/' && !isManager) fail(401,'Unauthorized');
  const relay=await relayRoutes(request,env,path,isManager); if(relay) return relay;
  if (path==='/api/admin/capabilities') { if(!isManager) fail(401,'Unauthorized'); return Response.json({cleanerAccess:!!env.STAFF_DB && !!await snapshot(db(env)),versionedSync:!!env.STAFF_DB && !!await snapshot(db(env))}); }
  if (path==='/api/admin/migrate' && request.method==='POST') {
    if(!isManager) fail(401,'Unauthorized');
    const sql=db(env), input=await body(request,2048); assertKeys(input,['sourceHash']);
    const existing=await snapshot(sql); if(existing) fail(409,'Database already activated');
    const original=await env.DB.get(ROOT); if(!original) fail(409,'Cloud data is empty');
    if(await digest(original)!==input.sourceHash) fail(409,'Cloud data changed; make a fresh backup before activation');
    const data=validateData(JSON.parse(original));
    const result=await sql.prepare('INSERT OR IGNORE INTO app_state(id,json,revision,last_op) VALUES(1,?,1,?)').bind(JSON.stringify(data),'migration').run();
    if(!result.meta.changes) fail(409,'Database was activated by another request');
    return Response.json({activated:true,revision:1,sourceHash:input.sourceHash});
  }
  if (path==='/') {
    const sql=env.STAFF_DB?db(env):null, current=sql?await snapshot(sql):null;
    if(!current) {
      if(request.method==='GET') return new Response(await env.DB.get(ROOT)||'null',{headers:{'Content-Type':'application/json'}});
      if(request.method==='POST') { const data=validateData(await body(request)); await env.DB.put(ROOT,JSON.stringify(data)); return new Response('ok'); }
    } else {
      if(request.method==='GET') return Response.json(current.data,{headers:{ETag:etag(current.revision)}});
      if(request.method==='POST') {
        const match=request.headers.get('If-Match'); if(!match) fail(428,'Refresh the app before saving');
        // Cloudflare compression can weaken the response ETag without changing the app revision.
        if(match.replace(/^W\//,'')!==etag(current.revision)) fail(409,'New cloud changes are available');
        const data=validateData(await body(request)); data._savedAt=Date.now();
        const result=await sql.prepare('UPDATE app_state SET json=?,revision=revision+1,last_op=? WHERE id=1 AND revision=?').bind(JSON.stringify(data),token(),current.revision).run();
        if(!result.meta.changes) fail(409,'New cloud changes are available');
        return Response.json({saved:true,savedAt:data._savedAt},{headers:{ETag:etag(current.revision+1)}});
      }
    }
    fail(405,'Method not allowed');
  }
  const sql=db(env), current=requireState(await snapshot(sql));
  if(path==='/api/admin/accounts') {
    if(!isManager) fail(401,'Unauthorized');
    if(request.method==='GET') return Response.json({accounts:(await sql.prepare('SELECT cleaner_id,created_at,revoked FROM cleaner_accounts').all()).results});
    if(request.method==='POST') {
      const input=await body(request,2048); assertKeys(input,['cleanerId','action']);
      if(!current.data.cleaners.some(c=>c.id===input.cleanerId)) fail(400,'Choose an existing cleaner');
      if(input.action==='revoke') { await sql.prepare('UPDATE cleaner_accounts SET revoked=1 WHERE cleaner_id=?').bind(input.cleanerId).run(); return Response.json({revoked:true}); }
      if(input.action!=='issue') fail(400,'Invalid account action');
      const accessCode=token();
      await sql.prepare('INSERT INTO cleaner_accounts(cleaner_id,token_hash,created_at,revoked) VALUES(?,?,?,0) ON CONFLICT(cleaner_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,revoked=0').bind(input.cleanerId,await digest(accessCode),new Date().toISOString()).run();
      return Response.json({cleanerId:input.cleanerId,accessCode});
    }
    fail(405,'Method not allowed');
  }
  const cleanerId=await cleanerAuth(request,sql,current.data);
  if(path==='/api/cleaner/schedule' && request.method==='GET') { const {start,end}=range(url); return Response.json(await projectSchedule(current.data,cleanerId,start,end,current.revision)); }
  if(path==='/api/cleaner/assignment' && request.method==='POST') {
    const input=await body(request,4096); assertKeys(input,['operationId','sessionId','kind','version','action']);
    if(!/^[a-f0-9-]{36}$/.test(input.operationId||'')||typeof input.sessionId!=='string'||!['main','alina'].includes(input.kind)||!['confirm','decline','complete'].includes(input.action)||!/^[a-f0-9]{64}$/.test(input.version||'')) fail(400,'Invalid assignment update');
    const payloadHash=await digest(JSON.stringify([input.sessionId,input.kind,input.version,input.action]));
    for(let attempt=0;attempt<3;attempt++) {
      const prior=await sql.prepare('SELECT cleaner_id,payload_hash,result FROM cleaner_operations WHERE operation_id=?').bind(input.operationId).first();
      if(prior) { if(prior.cleaner_id!==cleanerId||prior.payload_hash!==payloadHash) fail(409,'This update ID was already used'); return Response.json(JSON.parse(prior.result)); }
      const state=requireState(await snapshot(sql)); await cleanerAuth(request,sql,state.data);
      const session=state.data.sessions.find(s=>s.id===input.sessionId); if(!session) fail(404,'This cleaning no longer exists');
      if(await assignmentVersion(session,state.data,cleanerId,input.kind)!==input.version) fail(409,'The assignment changed. Refresh and review it.');
      const next=applyAssignment(state.data,cleanerId,input,today(env),new Date().toISOString()); validateData(next);
      const newVersion=await assignmentVersion(next.sessions.find(s=>s.id===input.sessionId),next,cleanerId,input.kind);
      const result={saved:true,operationId:input.operationId,revision:state.revision+1,version:newVersion};
      try {
        const batch=await sql.batch([
          sql.prepare('UPDATE app_state SET json=?,revision=revision+1,last_op=? WHERE id=1 AND revision=?').bind(JSON.stringify(next),input.operationId,state.revision),
          sql.prepare('INSERT INTO cleaner_operations(operation_id,cleaner_id,payload_hash,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE id=1 AND last_op=?)').bind(input.operationId,cleanerId,payloadHash,JSON.stringify(result),new Date().toISOString(),input.operationId)
        ]);
        if(batch[0].meta.changes) return Response.json(result);
      } catch(error) { if(attempt===2) throw error; }
    }
    fail(409,'The schedule is changing. Refresh and try again.');
  }
  fail(404,'Not found');
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Secret, Authorization, If-Match','Access-Control-Expose-Headers':'ETag','Vary':'Origin'};
    if(origin && ALLOWED.has(origin)) headers['Access-Control-Allow-Origin']=origin;
    if(origin && !ALLOWED.has(origin)) return new Response('Origin not allowed',{status:403,headers});
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    try { const response=await routes(request,env); for(const [name,value] of Object.entries(headers))response.headers.set(name,value); return response; }
    catch(error) { return Response.json({error:error instanceof ApiError?error.message:'The service is temporarily unavailable. Please try again.'},{status:error instanceof ApiError?error.status:503,headers}); }
  }
};
