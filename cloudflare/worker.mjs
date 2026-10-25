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
  try { await sql.prepare('DELETE FROM relay_audio WHERE expires_at<?').bind(now).run(); } catch {}
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
  'speech-stream': p => { assertKeys(p,['text']);if(!relayText(p.text,600).trim())fail(400,'Invalid speech request');return {text:p.text}; },
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
    if(input.op==='speech-stream')await sql.prepare('CREATE TABLE IF NOT EXISTS relay_audio (job_id TEXT NOT NULL, seq INTEGER NOT NULL, audio TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(job_id,seq))').run();
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
  const audioJob=path.match(/^\/api\/relay\/jobs\/([a-f0-9]{64})\/audio(\/cancel)?$/);
  if(audioJob){
    if(!isManager)fail(401,'Unauthorized');
    const sql=await relaySql(env);await relayPurge(sql,now);
    const find=()=>sql.prepare("SELECT j.status,j.op,j.result,j.expires_at FROM relay_jobs j JOIN relay_devices d ON d.token_hash=j.device_hash WHERE j.id=? AND d.id=1 AND d.revoked=0").bind(audioJob[1]).first();
    const initial=await find();if(!initial||initial.op!=='speech-stream')fail(404,'Speech request is no longer available');
    if(audioJob[2]&&method==='POST'){
      await sql.prepare("UPDATE relay_jobs SET status='expired',payload='' WHERE id=? AND op='speech-stream' AND status IN ('queued','processing')").bind(audioJob[1]).run();
      await sql.prepare('DELETE FROM relay_audio WHERE job_id=?').bind(audioJob[1]).run();return Response.json({cancelled:true});
    }
    if(audioJob[2]||method!=='GET')fail(405,'Method not allowed');
    const audioParams=new URL(request.url).searchParams,segmented=audioParams.get('segmented')==='1',from=Number(audioParams.get('from')||0);if(!Number.isInteger(from)||from<0||from>200||(!segmented&&from))fail(400,'Invalid audio cursor');
    let cursor=from,cancelled=false,checks=0;const encoder=new TextEncoder(),start=Date.now();
    const stream=new ReadableStream({
      async pull(controller){
        try{while(!cancelled){
          // Leave room for authentication/purge queries under the free D1 per-invocation limit.
          if(segmented&&checks>=28){controller.enqueue(encoder.encode(JSON.stringify({type:'continue',next:cursor})+'\n'));controller.close();return;}
          checks++;
          const rows=(await sql.prepare("SELECT j.status,j.result,j.expires_at,a.seq,a.audio FROM relay_jobs j JOIN relay_devices d ON d.token_hash=j.device_hash LEFT JOIN relay_audio a ON a.job_id=j.id AND a.seq>=?2 WHERE j.id=?1 AND d.id=1 AND d.revoked=0 ORDER BY a.seq LIMIT 8").bind(audioJob[1],cursor).all()).results;
          const row=rows[0];if(!row||row.status==='expired'||row.expires_at<relayNow()||Date.now()-start>65000||request.signal.aborted){controller.enqueue(encoder.encode(JSON.stringify({type:'error',message:'The speech connection ended. Nothing was approved.'})+'\n'));controller.close();return;}
          const frames=rows.filter(r=>r.seq!==null);
          if(frames.length){for(const frame of frames){if(frame.seq!==cursor)throw Error('Missing speech frame');controller.enqueue(encoder.encode(JSON.stringify({type:'audio',seq:cursor++,sampleRate:24000,audio:frame.audio})+'\n'));}return;}
          if(row.status==='done'){
            const result=JSON.parse(row.result||'{}');
            if(result.status!==200||!result.body?.streamed||result.body.frames!==cursor||!cursor)controller.enqueue(encoder.encode(JSON.stringify({type:'error',message:result.body?.error||'The speech reply did not finish.'})+'\n'));
            else controller.enqueue(encoder.encode(JSON.stringify({type:'end',frames:cursor})+'\n'));
            controller.close();return;
          }
          await new Promise(resolve=>setTimeout(resolve,150));
        }}catch{if(!cancelled){try{controller.enqueue(encoder.encode(JSON.stringify({type:'error',message:'The speech stream was interrupted.'})+'\n'));controller.close();}catch{}}}
      },cancel(){cancelled=true;}
    });
    return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
  }
  const job = path.match(/^\/api\/relay\/jobs\/([a-f0-9]{64})$/);
  if (job && method === 'GET') {
    if (!isManager) fail(401, 'Unauthorized');
    const waitValue=new URL(request.url).searchParams.get('waitMs');const waitMs=waitValue===null?0:Number(waitValue);if(!Number.isInteger(waitMs)||waitMs<0||waitMs>5000)fail(400,'Invalid wait');
    const sql = await relaySql(env); await relayPurge(sql, now);
    const until=Date.now()+waitMs;let row;
    do{
      row=await sql.prepare('SELECT status, result FROM relay_jobs WHERE id=?').bind(job[1]).first();
      if(!row||!['queued','processing'].includes(row.status)||!waitMs||Date.now()>=until||request.signal.aborted)break;
      await new Promise(resolve=>setTimeout(resolve,150));
    }while(Date.now()<until);
    if (!row) return Response.json({status:'gone'}, {status:404});
    return Response.json(row.status === 'done' ? {status:'done', result:JSON.parse(row.result)} : {status:row.status});
  }
  if (path.startsWith('/api/relay/device/') && method === 'POST') {
    deviceHeader(request);
    const sql = db(env), generation = await relayDevice(request, sql);
    await sql.prepare('UPDATE relay_devices SET last_seen=? WHERE id=1 AND revoked=0 AND token_hash=?').bind(now, generation).run();
    if (path === '/api/relay/device/heartbeat') return Response.json({ok:true});
    if (path === '/api/relay/device/claim') {
      const input=await body(request,128);assertKeys(input,['waitMs']);const waitMs=input.waitMs===undefined?0:input.waitMs;if(!Number.isInteger(waitMs)||waitMs<0||waitMs>15000)fail(400,'Invalid wait');const until=Date.now()+waitMs;
      await relayPurge(sql, now);
      /* The active-generation check is inside the same statement, so a registration or revoke that lands between
         authentication and this claim cannot hand work to a stale code. */
      do{
        const claimed = await sql.prepare("UPDATE relay_jobs SET status='processing', claimed_at=?1 WHERE id=(SELECT id FROM relay_jobs WHERE status='queued' AND expires_at>?1 AND device_hash=?2 ORDER BY CASE WHEN op IN ('speech-stream','wa-send','wa-review','wa-discard') THEN 0 WHEN op='chat' THEN 1 ELSE 2 END, created_at, id LIMIT 1) AND status='queued' AND device_hash=?2 AND EXISTS (SELECT 1 FROM relay_devices WHERE id=1 AND revoked=0 AND token_hash=?2) RETURNING id, op, payload").bind(relayNow(), generation).first();
        if(claimed)return Response.json({job:{jobId:claimed.id,op:claimed.op,params:JSON.parse(claimed.payload)}});
        if(!waitMs||Date.now()>=until||request.signal.aborted)break;
        await new Promise(resolve=>setTimeout(resolve,250));
      }while(Date.now()<until);
      return Response.json({job:null});
    }
    if(path==='/api/relay/device/audio'){
      const input=await body(request,34000);assertKeys(input,['jobId','seq','audio']);
      if(!HEX64.test(input.jobId||'')||!Number.isInteger(input.seq)||input.seq<0||input.seq>=200||typeof input.audio!=='string'||input.audio.length<4||input.audio.length>32768||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio))fail(400,'Invalid speech frame');
      let decoded;try{decoded=atob(input.audio);}catch{fail(400,'Invalid audio');}if(!decoded.length||decoded.length%2)fail(400,'Invalid PCM');
      const added=await sql.prepare("INSERT OR IGNORE INTO relay_audio(job_id,seq,audio,expires_at) SELECT ?1,?2,?3,?4 WHERE EXISTS(SELECT 1 FROM relay_jobs j JOIN relay_devices d ON d.token_hash=j.device_hash WHERE j.id=?1 AND j.op='speech-stream' AND j.status='processing' AND j.expires_at>?5 AND j.device_hash=?6 AND d.id=1 AND d.revoked=0 AND d.token_hash=?6) AND (SELECT COUNT(*) FROM relay_audio WHERE job_id=?1)=?2 AND (SELECT COALESCE(SUM(length(audio)),0) FROM relay_audio WHERE job_id=?1)+length(?3)<=3840000").bind(input.jobId,input.seq,input.audio,now+RELAY.resultTtl,now,generation).run();
      if(!added.meta.changes)fail(409,'Speech request cancelled or frame out of order');return Response.json({ok:true});
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

/* ── Uplisting: manager-only, read-only 2027 preview ───────────────────────────────────────────────────
   The account API key (Worker secret UPLISTING_API_KEY) is not scoped by Uplisting, so read-only is enforced here:
   only GET, only the three documented legacy read paths below. Nothing is written to Uplisting or to app data.
   Only small status metadata (times, outcome, counts; never guest data) is kept, in KV key 'uplisting_status'.
   Documented limits: 5 requests/s and 100/min per IP, 15/min per property; bookings 50 per page (page is 0-based). */
const UPLISTING = {base:'https://connect.uplisting.io', perPage:50, maxPages:20, maxRequests:40, gapMs:250, timeoutMs:15000, retries:2, maxWaitMs:8000, cooldownMs:20000, statusKey:'uplisting_status'};
const UP_READ_PATHS = [/^\/users\/me$/, /^\/properties$/, /^\/bookings\/\d{1,12}$/];
let upFetch = (...args) => fetch(...args), upSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/* Tests only: mocked Uplisting responses and an instant clock. Production never calls this. */
export function setUplistingForTests(options = {}) { upFetch = options.fetch || ((...args) => fetch(...args)); upSleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))); }
class UpError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }
/* Stays overlapping the year (checkout exclusive). Uplisting does not document whether from/to match arrival, departure or
   the whole stay, so the windows reach three months before and after the year, and each retrieval records evidence of
   the filter's behaviour (see coverage in retrieveUplisting). Coverage is only called established on that evidence. */
export function uplistingScope(year) {
  return {year, overlapStart:year + '-01-01', overlapEnd:year + '-12-31', windows:[{from:(year - 1) + '-10-01', to:year + '-07-01'}, {from:year + '-07-01', to:(year + 1) + '-04-01'}]};
}
async function upGet(env, path, query, budget) {
  if (!UP_READ_PATHS.some(rule => rule.test(path))) throw new UpError('blocked', 'Only documented read requests are allowed.');
  const url = new URL(UPLISTING.base + path);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
  for (let attempt = 0; ; attempt++) {
    if (budget.count >= UPLISTING.maxRequests) throw new UpError('budget', 'The request limit for one retrieval was reached.');
    if (budget.count) await upSleep(UPLISTING.gapMs);
    budget.count++;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), UPLISTING.timeoutMs);
    let response = null, retry = '', wait = 1000 * (attempt + 1) * (attempt + 1);
    try { response = await upFetch(url.toString(), {method:'GET', headers:{Authorization:'Basic ' + btoa(String(env.UPLISTING_API_KEY).trim()), 'Content-Type':'application/json', Accept:'application/json'}, signal:controller.signal}); }
    catch { retry = 'timeout'; }
    finally { clearTimeout(timer); }
    if (response) {
      if (response.status === 200) { try { return await response.json(); } catch { throw new UpError('invalid', 'Uplisting returned an unreadable response.'); } }
      if (response.status === 401) throw new UpError('auth', 'Uplisting did not accept the API key.');
      if (response.status === 403) throw new UpError('forbidden', 'Uplisting refused access to this data.');
      if (response.status === 404) throw new UpError('not_found', 'Uplisting could not find this property.');
      if (response.status === 429) { retry = 'rate_limited'; const after = Number(response.headers.get('Retry-After')); if (Number.isFinite(after) && after > 0) wait = after * 1000; }
      else if (response.status >= 500) retry = 'unavailable';
      else throw new UpError('http', 'Uplisting returned an unexpected response (' + response.status + ').');
    }
    if (attempt >= UPLISTING.retries || wait > UPLISTING.maxWaitMs) throw new UpError(retry, retry === 'rate_limited' ? 'Uplisting asked us to slow down. Try again in a minute.' : retry === 'timeout' ? 'Uplisting did not answer in time.' : 'Uplisting is temporarily unavailable.');
    await upSleep(wait);
  }
}
const upText = value => typeof value === 'string' ? value : value == null ? null : String(value);
/* Only the fields the preview needs. Guest email, phone and lock codes are never returned. A field absent from the
   response is left out (missing); null stays null (unknown); 0 stays 0. */
export function normaliseReservation(raw) {
  const out = {id:upText(raw?.id), propertyId:upText(raw?.property_id), propertyName:upText(raw?.property_name), checkIn:upText(raw?.check_in), checkOut:upText(raw?.check_out), status:upText(raw?.status), channel:upText(raw?.channel), guestName:upText(raw?.guest_name)};
  const optional = {arrivalTime:'arrival_time', departureTime:'departure_time', externalReservationId:'external_reservation_id', currency:'currency', bookedAt:'booked_at', multiUnitName:'multi_unit_name'};
  for (const [key, source] of Object.entries(optional)) if (raw && Object.prototype.hasOwnProperty.call(raw, source)) out[key] = upText(raw[source]);
  const numbers = {nights:['number_of_nights'], guests:['number_of_guests'], accommodationTotal:['accomodation_total', 'accommodation_total'], cleaningFee:['cleaning_fee'], totalPayout:['total_payout']};
  for (const [key, sources] of Object.entries(numbers)) {
    const source = sources.find(name => raw && Object.prototype.hasOwnProperty.call(raw, name)); if (!source) continue;
    const value = raw[source]; out[key] = value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (value !== null && !(typeof value === 'number' && Number.isFinite(value))) (out.invalid = out.invalid || []).push(key);
  }
  return out;
}
export async function retrieveUplisting(env, year) {
  const scope = uplistingScope(year), budget = {count:0}, problems = [], byId = new Map(), evidence = {arrivedBeforeWindow:0, departedAfterWindow:0, outsideWindow:0};
  const result = {service:'uplisting', readOnly:true, ok:false, complete:false, retrievedAt:new Date().toISOString(), scope:{year, overlapStart:scope.overlapStart, overlapEnd:scope.overlapEnd, fetchFrom:scope.windows[0].from, fetchTo:scope.windows.at(-1).to}, account:null, properties:[], reservations:[], outsideScope:0, duplicatesMerged:0, problems, requests:0};
  try {
    const me = await upGet(env, '/users/me', null, budget);
    result.account = {name:upText(me?.name) || ''};
    const listing = await upGet(env, '/properties', null, budget);
    if (!Array.isArray(listing?.data)) throw new UpError('invalid', 'Uplisting returned no property list.');
    if (listing.links?.next) problems.push({kind:'incomplete', message:'Uplisting reported more property pages than this preview reads.'});
    result.properties = listing.data.map(p => ({id:upText(p?.id), name:upText(p?.attributes?.name) || '', nickname:upText(p?.attributes?.nickname) || ''})).filter(p => /^\d{1,12}$/.test(p.id || ''));
    for (const property of result.properties) {
      let failed = false;
      for (const window of scope.windows) {
        if (failed) break;
        let received = 0, total = null, pages = null;
        for (let page = 0; pages === null || page < pages; page++) {
          if (page >= UPLISTING.maxPages) { problems.push({kind:'incomplete', propertyId:property.id, message:'Too many booking pages for one retrieval.'}); failed = true; break; }
          let body;
          try { body = await upGet(env, '/bookings/' + property.id, {from:window.from, to:window.to, page, per_page:UPLISTING.perPage}, budget); }
          catch (error) { if (error.kind === 'auth' || error.kind === 'budget') throw error; problems.push({kind:error.kind || 'error', propertyId:property.id, message:error.message}); failed = true; break; }
          const rows = body?.bookings, meta = body?.meta;
          if (!Array.isArray(rows) || !meta || !Number.isInteger(meta.total_pages) || meta.total_pages < 0) { problems.push({kind:'incomplete', propertyId:property.id, message:'Uplisting did not report how many booking pages there are.'}); failed = true; break; }
          pages = meta.total_pages; if (Number.isInteger(meta.total)) total = meta.total;
          if (!rows.length && page < pages - 1) { problems.push({kind:'incomplete', propertyId:property.id, message:'A booking page came back empty before the last page.'}); failed = true; break; }
          received += rows.length;
          for (const raw of rows) { const ci = upText(raw?.check_in), co = upText(raw?.check_out); if (!ci || !co) continue; if (ci < window.from && co > window.from) evidence.arrivedBeforeWindow++; if (co > window.to && ci < window.to) evidence.departedAfterWindow++; if (co <= window.from || ci >= window.to) evidence.outsideWindow++; }
          for (const raw of rows) {
            const item = normaliseReservation(raw), key = item.id || 'missing:' + property.id + ':' + byId.size;
            if (!item.propertyId) item.propertyId = property.id;
            const prior = byId.get(key);
            if (prior) { if (JSON.stringify(prior) === JSON.stringify(item)) result.duplicatesMerged++; else (prior.conflicts = prior.conflicts || []).push('Uplisting returned this reservation twice with different details.'); }
            else byId.set(key, item);
          }
        }
        if (!failed && total !== null && received !== total) { problems.push({kind:'incomplete', propertyId:property.id, message:'Uplisting reported ' + total + ' bookings but returned ' + received + '.'}); failed = true; }
      }
      if (failed) property.incomplete = true;
    }
    const overlaps = r => /^\d{4}-\d{2}-\d{2}$/.test(r.checkIn || '') && /^\d{4}-\d{2}-\d{2}$/.test(r.checkOut || '') && r.checkIn <= scope.overlapEnd && r.checkOut > scope.overlapStart;
    for (const item of byId.values()) {
      const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(item.checkIn || '') && /^\d{4}-\d{2}-\d{2}$/.test(item.checkOut || '');
      if (!datesValid || overlaps(item)) result.reservations.push(item); else result.outsideScope++;
    }
    /* A returned stay that began before a window's start proves the filter is not arrival-only, so a 2027 stay that began
       before the earliest fetch date is still returned. Without that evidence, coverage is not claimed. */
    result.coverage = {evidence, earliestFetch:scope.windows[0].from, filter:evidence.outsideWindow ? 'unexpected' : evidence.arrivedBeforeWindow ? 'includes-earlier-arrivals' : 'unconfirmed'};
    result.ok = true; result.complete = !problems.length;
  } catch (error) {
    result.ok = false; result.error = {kind:error instanceof UpError ? error.kind : 'error', message:error instanceof UpError ? error.message : 'The Uplisting retrieval failed.'};
    result.reservations = []; result.properties = result.properties.map(({id, name, nickname}) => ({id, name, nickname}));
  }
  result.requests = budget.count;
  return result;
}
async function upStatus(env) { try { return JSON.parse(await env.DB.get(UPLISTING.statusKey) || 'null') || {}; } catch { return {}; } }
async function uplistingRoutes(request, env, path, isManager) {
  if (!path.startsWith('/api/uplisting/')) return null;
  if (!isManager) fail(401, 'Unauthorized');
  const configured = !!String(env.UPLISTING_API_KEY || '').trim();
  if (path === '/api/uplisting/status' && request.method === 'GET') return Response.json({service:'uplisting', readOnly:true, configured, sync:'off', ...(await upStatus(env))});
  if (path === '/api/uplisting/preview' && request.method === 'GET') {
    const year = Number(new URL(request.url).searchParams.get('year'));
    if (year !== 2027) fail(400, 'This preview covers 2027 only');
    if (!configured) return Response.json({service:'uplisting', readOnly:true, configured:false, ok:false, complete:false, error:{kind:'not_configured', message:'The Uplisting API key has not been added to the cloud service yet.'}});
    const status = await upStatus(env), now = Date.now();
    if (status.lastAttemptAt && now - Date.parse(status.lastAttemptAt) < UPLISTING.cooldownMs) fail(429, 'A retrieval ran moments ago. Wait a few seconds and try again.');
    await env.DB.put(UPLISTING.statusKey, JSON.stringify({...status, lastAttemptAt:new Date(now).toISOString()}));
    const result = await retrieveUplisting(env, year);
    const outcome = !result.ok ? (result.error?.kind === 'auth' ? 'auth_failed' : 'failed') : result.complete ? 'complete' : 'incomplete';
    const next = {...status, lastAttemptAt:new Date(now).toISOString(), lastOutcome:outcome, lastMessage:result.ok ? (result.complete ? '' : 'Retrieval was incomplete.') : result.error.message, lastReservations:result.reservations.length, lastRequests:result.requests};
    if (outcome === 'complete') next.lastSuccessAt = result.retrievedAt;
    await env.DB.put(UPLISTING.statusKey, JSON.stringify(next));
    /* Upstream failures are reported in the body (ok:false) so they cannot be mistaken for a Seravillas sign-in problem. */
    return Response.json({...result, configured:true, lastSuccessAt:next.lastSuccessAt || ''});
  }
  fail(405, 'Method not allowed');
}

async function routes(request,env) {
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,'') || '/';
  const isManager=manager(request,env);
  if (path==='/' && !isManager) fail(401,'Unauthorized');
  const relay=await relayRoutes(request,env,path,isManager); if(relay) return relay;
  const uplisting=await uplistingRoutes(request,env,path,isManager); if(uplisting) return uplisting;
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
