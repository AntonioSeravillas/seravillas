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
  h+='<button class="back-btn" data-nav="home">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
    +'Back to Home</button>';
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
    +'<div style="flex:1;background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--radius-sm);padding:12px;text-align:center;cursor:pointer" data-nav="manage">'
    +'<div style="font-size:26px;font-weight:800;color:var(--amber);font-family:\'DM Mono\',monospace;line-height:1">'+issuesOpen+'</div>'
    +'<div style="font-size:10px;color:var(--amber-text);font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Open</div>'
    +'</div>'
    +'<div style="flex:1;background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:var(--radius-sm);padding:12px;text-align:center;cursor:pointer" data-nav="manage">'
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

function renderBookingReport(){
  const yr=reportYear;
  const yrS=yr+'-01-01',yrE=yr+'-12-31';
  const isLeap=yr%4===0;
  const daysInYear=isLeap?366:365;
  const td=today();

  // Bookings with checkIn in this year (for revenue)
  const yrBks=D.bookings.filter(b=>b.status!=='cancelled'&&b.checkIn>=yrS&&b.checkIn<=yrE);
  const totalRev=yrBks.reduce((s,b)=>s+(b.totalPrice||0),0);
  const totalBks=yrBks.length;
  const avgBk=totalBks?Math.round(totalRev/totalBks):0;

  // Monthly revenue
  const MNAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monRev=Array(12).fill(0),monCnt=Array(12).fill(0);
  yrBks.forEach(b=>{const m=parseInt(b.checkIn.split('-')[1])-1;monRev[m]+=(b.totalPrice||0);monCnt[m]++;});
  const maxMon=Math.max(...monRev,1);
  const peakMon=monRev.indexOf(maxMon);

  // Platform breakdown
  const platMap={};
  yrBks.forEach(b=>{
    const key=b.platform==='agency'?(b.agencyName||'Agency'):b.platform;
    if(!platMap[key])platMap[key]={count:0,revenue:0,platform:b.platform,name:key};
    platMap[key].count++;platMap[key].revenue+=(b.totalPrice||0);
  });
  const platList=Object.values(platMap).sort((a,b)=>b.revenue-a.revenue);

  // Property performance (occupancy uses bookings overlapping the year)
  const propPerf=D.props.map(p=>{
    const pBks=D.bookings.filter(b=>b.propId===p.id&&b.status!=='cancelled'&&b.checkIn<=yrE&&b.checkOut>yrS);
    let booked=0;
    pBks.forEach(b=>{
      const s=b.checkIn<yrS?yrS:b.checkIn;
      const e=b.checkOut>yrE?yrE:b.checkOut;
      booked+=daysBetween(s,e);
    });
    const occ=Math.min(100,Math.round(booked/daysInYear*100));
    const pRev=yrBks.filter(b=>b.propId===p.id).reduce((s,b)=>s+(b.totalPrice||0),0);
    const pCnt=yrBks.filter(b=>b.propId===p.id).length;
    return{prop:p,booked,occ,revenue:pRev,count:pCnt};
  }).filter(x=>x.count>0||x.booked>0).sort((a,b)=>b.revenue-a.revenue);

  const totalBooked=propPerf.reduce((s,p)=>s+p.booked,0);
  const avgOcc=propPerf.length?Math.round(propPerf.reduce((s,p)=>s+p.occ,0)/propPerf.length):0;

  // Gaps analysis — free nights per property within [today..yr-12-31]
  const yrEndStr=yr+'-12-31';
  const gapWinStart=td>yr+'-01-01'?td:yr+'-01-01';
  const allGaps=[];
  D.props.forEach(p=>{
    // Only bookings that overlap our window
    const pBks=D.bookings.filter(b=>
      b.propId===p.id&&b.status!=='cancelled'&&
      b.checkOut>gapWinStart&&b.checkIn<=yrEndStr
    ).sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
    if(pBks.length===0){
      // Property has no bookings in window — entire window is free
      const g=daysBetween(gapWinStart,yrEndStr);
      if(g>0)allGaps.push({propId:p.id,propName:p.name,from:gapWinStart,to:yrEndStr,days:g});
      return;
    }
    // Leading gap: window start → first booking checkIn
    if(pBks[0].checkIn>gapWinStart){
      const g=daysBetween(gapWinStart,pBks[0].checkIn);
      if(g>0)allGaps.push({propId:p.id,propName:p.name,from:gapWinStart,to:pBks[0].checkIn,days:g});
    }
    // Gaps between consecutive bookings
    for(let i=1;i<pBks.length;i++){
      const gf=pBks[i-1].checkOut,gt=pBks[i].checkIn;
      const g=daysBetween(gf,gt);
      if(g>0)allGaps.push({propId:p.id,propName:p.name,from:gf,to:gt,days:g});
    }
    // Trailing gap: last booking checkOut → year end
    const lastOut=pBks[pBks.length-1].checkOut;
    if(lastOut<yrEndStr){
      const g=daysBetween(lastOut,yrEndStr);
      if(g>0)allGaps.push({propId:p.id,propName:p.name,from:lastOut,to:yrEndStr,days:g});
    }
  });
  const upcoming=allGaps.filter(g=>g.days>=2).sort((a,b)=>a.from.localeCompare(b.from));
  const totalGapNights=allGaps.reduce((s,g)=>s+g.days,0);
  const avgGap=allGaps.length?Math.round(totalGapNights/allGaps.length):0;

  // ── HTML ──
  let h='';
  h+='<button class="back-btn" data-nav="home">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>'
    +'Back</button>';

  // Title + year selector
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
    +'<div style="font-size:20px;font-weight:800;letter-spacing:-0.5px">Booking Report</div>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button class="week-nav-btn" onclick="reportYear--;render()" style="width:30px;height:30px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button>'
    +'<span style="font-size:14px;font-weight:700;font-family:\'DM Mono\',monospace;min-width:36px;text-align:center">'+yr+'</span>'
    +'<button class="week-nav-btn" onclick="reportYear++;render()" style="width:30px;height:30px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></button>'
    +'</div></div>';
  h+='<div style="font-size:11px;color:var(--text3);font-weight:500;margin-bottom:14px">'+totalBks+' bookings · '+totalGapNights+' gap nights across all properties</div>';

  // Hero stats
  h+='<div class="wr-hero" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:8px">';
  h+=statChipBR('€'+fmtThousands(totalRev),'Total<br>revenue','var(--accent)');
  h+=statChipBR(totalBks+'','Bookings<br>this year','var(--text)');
  h+=statChipBR(avgOcc+'%','Avg<br>occupancy','var(--amber)');
  h+='</div>';
  h+='<div class="wr-hero" style="grid-template-columns:1fr 1fr;margin-bottom:14px">';
  h+=statChipBR('€'+fmtThousands(avgBk),'Avg booking<br>value','var(--text)');
  h+=statChipBR(totalBooked+'n','Total booked<br>nights','var(--accent)');
  h+='</div>';

  // Monthly revenue chart
  h+='<div class="wr-card">';
  h+='<div class="wr-card-title wr-ct-teal">Monthly revenue — '+yr+'</div>';
  h+='<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;padding-bottom:2px">';
  h+='<div style="display:flex;align-items:flex-end;gap:4px;height:100px;min-width:440px;padding:0 4px">';
  monRev.forEach((rev,mi)=>{
    const pct=Math.round(rev/maxMon*100);
    const isP=mi===peakMon&&rev>0;
    const hasCnt=monCnt[mi]>0;
    h+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0;height:100%">';
    h+='<div style="font-size:8px;font-weight:700;color:'+(hasCnt?'var(--text2)':'transparent')+';font-family:\'DM Mono\',monospace;line-height:1.2;text-align:center;margin-bottom:2px">'+fmtEur(rev)+'</div>';
    h+='<div style="flex:1;display:flex;align-items:flex-end;width:100%">';
    h+='<div style="width:100%;border-radius:4px 4px 1px 1px;min-height:3px;height:'+Math.max(pct,hasCnt?4:1)+'%;background:'+(hasCnt?(isP?'var(--accent)':'rgba(26,122,94,0.45)'):'var(--surface2)')+'"></div>';
    h+='</div>';
    h+='<div style="font-size:8px;font-weight:700;color:'+(isP?'var(--accent)':'var(--text3)')+';line-height:1.2;margin-top:3px">'+MNAMES[mi]+'</div>';
    h+='<div style="font-size:8px;color:var(--text3);font-family:\'DM Mono\',monospace;line-height:1">'+(hasCnt?monCnt[mi]+'bk':'')+'</div>';
    h+='</div>';
  });
  h+='</div></div>';
  h+='<div style="font-size:10px;color:var(--text3);margin-top:8px;font-weight:600">Peak: <span style="color:var(--accent)">'+MNAMES[peakMon]+' — '+fmtEur(maxMon)+'</span></div>';
  h+='</div>';

  // Platform & agency breakdown
  h+='<div class="wr-card">';
  h+='<div class="wr-card-title wr-ct-dark">By platform &amp; agency</div>';
  if(!platList.length){h+='<div class="wr-empty">No bookings this year</div>';}
  platList.forEach(pl=>{
    const pct=totalRev>0?Math.round(pl.revenue/totalRev*100):0;
    const clr=platColor(pl.platform,pl.name);
    const label=pl.platform==='airbnb'?'Airbnb':pl.platform==='booking'?'Booking.com':pl.name;
    h+='<div style="margin-bottom:13px">';
    h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
    h+='<div style="display:flex;align-items:center;gap:8px">';
    h+='<div style="width:11px;height:11px;border-radius:3px;background:'+clr.border+'"></div>';
    h+='<span style="font-size:13px;font-weight:700">'+esc(label)+'</span>';
    h+='<span style="font-size:10px;color:var(--text3);font-weight:600;font-family:\'DM Mono\',monospace">'+pl.count+' bk</span>';
    h+='</div>';
    h+='<div style="display:flex;align-items:center;gap:8px">';
    h+='<span style="font-size:13px;font-weight:700;font-family:\'DM Mono\',monospace;color:var(--text)">€'+fmtThousands(Math.round(pl.revenue))+'</span>';
    h+='<span style="font-size:10px;font-weight:700;color:'+clr.border+';min-width:28px;text-align:right">'+pct+'%</span>';
    h+='</div></div>';
    h+='<div style="height:7px;background:var(--surface2);border-radius:99px;overflow:hidden">';
    h+='<div style="height:100%;width:'+pct+'%;background:'+clr.border+';border-radius:99px;transition:width 0.5s cubic-bezier(0.34,1.56,0.64,1)"></div>';
    h+='</div></div>';
  });
  h+='</div>';

  // Property performance
  h+='<div class="wr-card">';
  h+='<div class="wr-card-title wr-ct-teal">Property performance</div>';
  if(!propPerf.length){h+='<div class="wr-empty">No bookings this year</div>';}
  propPerf.forEach(({prop,booked,occ,revenue,count})=>{
    const clr=propBarColor(prop.id);
    const avgBkProp=count?Math.round(revenue/count):0;
    h+='<div class="wr-proj-row">';
    h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
    h+='<div style="display:flex;align-items:center;gap:7px">';
    h+='<div style="width:10px;height:10px;border-radius:3px;background:'+clr.border+'"></div>';
    h+='<span style="font-size:13px;font-weight:700">'+esc(prop.name)+'</span>';
    h+='</div>';
    h+='<div style="font-size:13px;font-weight:800;font-family:\'DM Mono\',monospace;color:var(--text)">€'+fmtThousands(Math.round(revenue))+'</div>';
    h+='</div>';
    h+='<div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden;margin-bottom:5px">';
    h+='<div style="height:100%;width:'+occ+'%;background:'+clr.border+';border-radius:99px"></div>';
    h+='</div>';
    h+='<div style="display:flex;gap:12px;font-size:10px;color:var(--text3);font-weight:600">';
    h+='<span style="color:'+clr.border+';font-weight:700">'+occ+'% occupancy</span>';
    h+='<span>'+booked+' nights</span>';
    h+='<span>'+count+' bookings</span>';
    h+='<span>avg €'+fmtThousands(avgBkProp)+'</span>';
    h+='</div>';
    h+='</div>';
  });
  h+='</div>';

  // Gaps analysis
  h+='<div class="wr-card">';
  h+='<div class="wr-card-title wr-ct-amber">Upcoming gaps — free nights</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';
  h+='<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px;text-align:center">';
  h+='<div style="font-size:22px;font-weight:800;font-family:\'DM Mono\',monospace;color:var(--amber)">'+allGaps.length+'</div>';
  h+='<div style="font-size:10px;color:var(--text3);font-weight:700;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">Total gaps</div>';
  h+='</div>';
  h+='<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:10px 12px;text-align:center">';
  h+='<div style="font-size:22px;font-weight:800;font-family:\'DM Mono\',monospace;color:var(--text)">'+avgGap+'</div>';
  h+='<div style="font-size:10px;color:var(--text3);font-weight:700;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">Avg nights</div>';
  h+='</div></div>';
  if(!upcoming.length){
    h+='<div class="wr-empty">No upcoming gaps found</div>';
  } else {
    upcoming.forEach(g=>{
      const clr=propBarColor(g.propId);
      const isShort=g.days<=3,isMed=g.days<=7;
      const urgClr=isShort?'var(--red)':isMed?'var(--amber)':'var(--accent)';
      const urgBg=isShort?'var(--red-bg)':isMed?'var(--amber-bg)':'var(--accent-bg)';
      h+='<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">';
      h+='<div style="min-width:40px;height:40px;border-radius:10px;background:'+urgBg+';display:flex;flex-direction:column;align-items:center;justify-content:center">';
      h+='<div style="font-size:16px;font-weight:800;color:'+urgClr+';font-family:\'DM Mono\',monospace;line-height:1">'+g.days+'</div>';
      h+='<div style="font-size:8px;font-weight:700;color:'+urgClr+';opacity:0.7;line-height:1">nts</div>';
      h+='</div>';
      h+='<div style="flex:1;min-width:0">';
      h+='<div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:5px">';
      h+='<div style="width:6px;height:6px;border-radius:2px;background:'+clr.border+';flex-shrink:0"></div>';
      h+=esc(g.propName);
      h+='</div>';
      h+='<div style="font-size:10px;color:var(--text3);font-family:\'DM Mono\',monospace;margin-top:2px">'+fmtDate(g.from)+' → '+fmtDate(g.to)+'</div>';
      h+='</div>';
      h+='<div style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px;background:'+urgBg+';color:'+urgClr+'">'+(isShort?'Tight':isMed?'Short':'Open')+'</div>';
      h+='</div>';
    });
  }
  h+='</div>';

  // Total gap nights summary
  h+='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between">';
  h+='<div style="font-size:12px;font-weight:600;color:var(--text2)">Total gap nights (all time)</div>';
  h+='<div style="font-size:16px;font-weight:800;font-family:\'DM Mono\',monospace;color:var(--amber)">'+totalGapNights+' nights</div>';
  h+='</div>';

  return h;
}

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

