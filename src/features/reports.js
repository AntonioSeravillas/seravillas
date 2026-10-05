/* ── WEEKLY REVIEW ── */
function renderReview(){
  const t=today();
  const days=[];for(let i=6;i>=0;i--)days.push(addDays(t,-i));
  const w0=days[0];

  const tasksDone7=D.tasks.filter(tk=>tk.done&&tk.completedAt>=w0&&tk.completedAt<=t).length;
  const cleansDone7=D.sessions.filter(s=>s.date>=w0&&s.date<=t&&s.status==='done').length;
  const cleansTotal7=D.sessions.filter(s=>s.date>=w0&&s.date<=t&&s.status!=='cancelled').length;
  const issuesOpen=D.issues.filter(i=>i.status==='open').length;
  const issuesResolved=D.issues.filter(i=>i.status==='resolved').length;
  const gTasks=D.tasks.filter(tk=>tk.type==='growth');
  const gDone=gTasks.filter(tk=>tk.done).length;
  const gTotal=gTasks.length;
  const gPct=gTotal>0?Math.round(gDone/gTotal*100):0;

  const dailyCleans=days.map(d=>D.sessions.filter(s=>s.date===d&&s.status==='done').length);
  const dailyTasks=days.map(d=>D.tasks.filter(tk=>tk.done&&tk.completedAt===d).length);
  const maxC=Math.max(1,...dailyCleans);
  const maxT=Math.max(1,...dailyTasks);

  const dayLabels=days.map(d=>{
    const parts=d.split('-');
    return new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2])).toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2);
  });

  const rangeLabel=fmtDateRange(w0,t);

  function barChart(values,max,color){
    return'<div class="wr-chart-wrap">'+values.map((v,i)=>{
      const pct=max>0?Math.round(v/max*100):0;
      const isT=days[i]===t;
      const barStyle='background:'+color+';height:'+Math.max(pct,v>0?6:2)+'%;opacity:'+(v===0?'0.18':'1');
      return'<div class="wr-chart-col">'
        +'<div class="wr-chart-val'+(v===0?' zero':'')+'">'+(v===0?'·':v)+'</div>'
        +'<div class="wr-chart-bar-area"><div class="wr-chart-bar" style="'+barStyle+'"></div></div>'
        +'<div class="wr-chart-day'+(isT?' is-today':'')+'">'+(isT?'●':dayLabels[i])+'</div>'
        +'</div>';
    }).join('')+'</div>';
  }

  const projects=D.projects||[];
  let projHTML='';
  if(projects.length===0&&gTotal===0){
    projHTML='<div class="wr-empty">No growth projects yet — add some in Tasks → Growth</div>';
  } else if(projects.length>0){
    projHTML=projects.map(proj=>{
      const ptasks=D.tasks.filter(tk=>tk.projectId===proj.id);
      const pdone=ptasks.filter(tk=>tk.done).length;
      const ptotal=ptasks.length;
      const ppct=ptotal>0?Math.round(pdone/ptotal*100):0;
      const clr=proj.color||'var(--accent)';
      return'<div class="wr-proj-row">'
        +'<div class="wr-proj-top">'
        +'<div class="wr-proj-name"><div class="wr-proj-dot" style="background:'+clr+'"></div>'+esc(proj.name)+'</div>'
        +'<div class="wr-proj-ct">'+pdone+'/'+ptotal+'</div>'
        +'</div>'
        +'<div class="wr-proj-bar"><div class="wr-proj-fill" style="width:'+ppct+'%;background:'+clr+'"></div></div>'
        +'</div>';
    }).join('');
  } else {
    projHTML='<div class="wr-proj-row">'
      +'<div class="wr-proj-top">'
      +'<div class="wr-proj-name"><div class="wr-proj-dot" style="background:var(--accent)"></div>Growth tasks</div>'
      +'<div class="wr-proj-ct">'+gDone+'/'+gTotal+'</div>'
      +'</div>'
      +'<div class="wr-proj-bar"><div class="wr-proj-fill" style="width:'+gPct+'%;background:var(--accent)"></div></div>'
      +'</div>';
  }

  let h='';
  h+='<button class="back-btn" onclick="workspaceNavigate(\'manage\',\'overview\')">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
    +'Back to Overview</button>';
  h+='<div style="margin-bottom:16px">'
    +'<div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;margin-bottom:2px">Weekly Review</div>'
    +'<div style="font-size:12px;color:var(--text3);font-weight:500;font-family:\'DM Mono\',monospace">'+rangeLabel+'</div>'
    +'</div>';

  h+='<div class="wr-hero">';
  h+='<div class="wr-stat"><div class="wr-stat-n" style="color:var(--text)">'+tasksDone7+'</div><div class="wr-stat-l">Tasks<br>completed</div></div>';
  h+='<div class="wr-stat"><div class="wr-stat-n" style="color:var(--accent)">'+cleansDone7+'</div><div class="wr-stat-l">Cleanings<br>done'+(cleansTotal7>cleansDone7?' of '+cleansTotal7:'')+'</div></div>';
  h+='<div class="wr-stat"><div class="wr-stat-n" style="color:var(--amber)">'+issuesOpen+'</div><div class="wr-stat-l">Issues<br>open</div></div>';
  h+='<div class="wr-stat"><div class="wr-stat-n" style="color:var(--text)">'+gPct+'<span style="font-size:16px;font-weight:700">%</span></div><div class="wr-stat-l">Growth<br>progress</div></div>';
  h+='</div>';

  h+='<div class="wr-card"><div class="wr-card-title wr-ct-teal">Cleanings done — last 7 days</div>'+barChart(dailyCleans,maxC,'var(--accent)')+'</div>';
  h+='<div class="wr-card"><div class="wr-card-title wr-ct-dark">Tasks completed — last 7 days</div>'+barChart(dailyTasks,maxT,'var(--text)')+'</div>';

  h+='<div class="wr-card"><div class="wr-card-title wr-ct-amber">Issues tracker</div>'
    +'<div style="display:flex;gap:10px">'
    +'<div style="flex:1;background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--radius-sm);padding:12px;text-align:center;cursor:pointer" onclick="issueStatusFilter=\'open\';workspaceNavigate(\'manage\',\'issues\')">'
    +'<div style="font-size:26px;font-weight:800;color:var(--amber);font-family:\'DM Mono\',monospace;line-height:1">'+issuesOpen+'</div>'
    +'<div style="font-size:10px;color:var(--amber-text);font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Open</div>'
    +'</div>'
    +'<div style="flex:1;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:var(--radius-sm);padding:12px;text-align:center;cursor:pointer" onclick="issueStatusFilter=\'resolved\';workspaceNavigate(\'manage\',\'issues\')">'
    +'<div style="font-size:26px;font-weight:800;color:var(--accent);font-family:\'DM Mono\',monospace;line-height:1">'+issuesResolved+'</div>'
    +'<div style="font-size:10px;color:var(--accent-text);font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Resolved</div>'
    +'</div>'
    +'</div>'
    +'</div>';

  h+='<div class="wr-card" style="margin-bottom:24px"><div class="wr-card-title wr-ct-dark">Growth project progress</div>'+projHTML+'</div>';

  return h;
}

/* ── BOOKING REPORT ── */
function fmtThousands(n){return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function fmtEur(n){if(n>=10000)return'€'+Math.round(n/1000)+'k';if(n>=1000)return'€'+(n/1000).toFixed(1).replace(/\.0$/,'')+'k';return'€'+Math.round(n);}
function statChipBR(val,lbl,clr){return'<div class="wr-stat"><div class="wr-stat-n" style="color:'+clr+';font-size:22px">'+val+'</div><div class="wr-stat-l">'+lbl+'</div></div>';}
function platColor(platform,key){
  if(platform==='airbnb')return{border:'#FF5A5F',bg:'#fff0f0',text:'#c0392b'};
  if(platform==='booking')return{border:'#003580',bg:'#eef4ff',text:'#003580'};
  const cols=[
    {border:'var(--accent)',bg:'var(--accent-bg)',text:'var(--accent-text)'},
    {border:'var(--amber)',bg:'var(--amber-bg)',text:'var(--amber-text)'},
    {border:'#7a5a9a',bg:'#f5f0ff',text:'#4a2a7a'},
    {border:'#5a7a9a',bg:'#eef2ff',text:'#2a4a6a'},
    {border:'#8a6a3a',bg:'#fdf5ea',text:'#5a3a0a'},
  ];
  let h=0;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))%cols.length;
  return cols[h];
}

// Retained cancellation money is explicit; the original cancelled price is never income.
function bookingRevenueCents(b){
  const amount=b.status==='cancelled'?b.cancellationRevenue:b.totalPrice;
  const cents=typeof amount==='number'&&Number.isFinite(amount)&&amount>0?Math.round(amount*100):0;
  return Number.isSafeInteger(cents)?cents:0;
}
function fmtRevenueAmount(amount){return '€'+amount.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
function bookingRevenueSummary(bookings,year){
  const start=year+'-01-01',end=year+'-12-31';
  const yearBookings=bookings.filter(b=>b.checkIn>=start&&b.checkIn<=end);
  const active=yearBookings.filter(b=>b.status!=='cancelled');
  const cancelled=yearBookings.filter(b=>b.status==='cancelled');
  const monthly=Array.from({length:12},()=>({revenueCents:0,count:0}));
  const platforms=new Map(),properties=new Map();
  let revenueCents=0,activeRevenueCents=0,cancellationRevenueCents=0;
  yearBookings.forEach(b=>{
    const cents=bookingRevenueCents(b),isActive=b.status!=='cancelled';
    revenueCents+=cents;
    if(isActive)activeRevenueCents+=cents;else cancellationRevenueCents+=cents;
    if(!isActive&&!cents)return;
    const month=monthly[Number(b.checkIn.slice(5,7))-1];
    if(month){month.revenueCents+=cents;if(isActive)month.count++;}
    const key=b.platform==='agency'?(b.agencyName||'Agency'):b.platform;
    if(!platforms.has(key))platforms.set(key,{count:0,revenueCents:0,platform:b.platform,name:key});
    const channel=platforms.get(key);channel.revenueCents+=cents;if(isActive)channel.count++;
    if(!properties.has(b.propId))properties.set(b.propId,{count:0,revenueCents:0,activeRevenueCents:0});
    const property=properties.get(b.propId);property.revenueCents+=cents;
    if(isActive){property.count++;property.activeRevenueCents+=cents;}
  });
  return {active,cancelled,totalRev:revenueCents/100,activeRev:activeRevenueCents/100,
    cancellationRev:cancellationRevenueCents/100,monthly,platforms:[...platforms.values()],properties};
}

function renderBookingReport(){return renderDetailedBookingReport();}

/* ── QUICK ADD MENU ── */
function openQuickTaskModal(){
  window._qtType='ops';
  showModal('<div class="modal-handle"></div><div class="modal-title">Quick add task</div>'
    +'<div class="field"><label>Task</label><input type="text" id="qt-text" placeholder="What needs doing?" autofocus></div>'
    +'<div class="field"><label>Type</label><div class="chips" style="margin-top:6px">'
    +'<button type="button" class="chip on" onclick="setQTType(\'ops\')">Ops</button>'
    +'<button type="button" class="chip" onclick="setQTType(\'growth\')">Growth</button>'
    +'</div></div>'
    +'<div class="field"><label>Priority</label><select id="qt-prio"><option value="high">🔴 High</option><option value="medium" selected>🟡 Medium</option><option value="low">🟣 Low</option></select></div>'
    +'<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-primary" style="flex:1" onclick="saveQuickTask()">Add task</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button></div>');
  setTimeout(()=>document.getElementById('qt-text')?.focus(),120);
}
function setQTType(type){
  window._qtType=type;
  document.querySelectorAll('#modal-root .chips .chip').forEach(c=>{
    if(c.textContent==='Ops'||c.textContent==='Growth')
      c.classList.toggle('on',c.textContent===(type==='ops'?'Ops':'Growth'));
  });
}
function saveQuickTask(){
  const text=(document.getElementById('qt-text')||{}).value||'';
  if(!text.trim()){alert('Please enter a task.');return;}
  const priority=(document.getElementById('qt-prio')||{}).value||'medium';
  const type=window._qtType||'ops';
  D.tasks.push({id:uid(),text:text.trim(),propId:'',priority,urgent:priority==='high',done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:today(),type,projectId:''});
  save();closeModal();toast('Task added!');render();
}

function showQuickAddMenu(){
  showModal('<div class="modal-handle"></div><div class="modal-title">Quick add</div>'
    +'<div class="qa-option" data-nav="add">'
    +'<div class="qa-icon" style="background:var(--accent-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg></div>'
    +'<div><div class="qa-label">Schedule a cleaning</div><div class="qa-sub">Add a new session to the calendar</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openQuickTaskModal()">'
    +'<div class="qa-icon" style="background:var(--purple-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>'
    +'<div><div class="qa-label">Add a task</div><div class="qa-sub">Create a to-do for any property</div></div></div>'
    +'<div class="qa-option" onclick="closeModal();openAddIssue()">'
    +'<div class="qa-icon" style="background:var(--amber-bg)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>'
    +'<div><div class="qa-label">Log an issue</div><div class="qa-sub">Report a problem at a property</div></div></div>'
    +'<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>');
}

