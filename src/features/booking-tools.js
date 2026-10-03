/* Calendar tools retain existing availability, agenda and event features. */
function openBookingAvailability(){
  availabilityYear=calView==='month'?calY:Number((calTimelineDate||today()).slice(0,4));
  workspaceNavigate('booking-availability');
}
function bookingGapSummary(year){
  const td=today();
  // Gaps analysis — free nights per property within [today..yr-12-31]
  const yrEndStr=year+'-12-31';
  const gapWinStart=td>year+'-01-01'?td:year+'-01-01';
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

  return {allGaps,upcoming,totalGapNights,avgGap};
}
function renderBookingAvailability(){
  const year=availabilityYear;
  const {allGaps,upcoming,totalGapNights,avgGap}=bookingGapSummary(year);
  let h=`<div class="sv-page"><button class="back-btn" onclick="workspaceNavigate('calendar')">← Back to Bookings</button>
    <div class="sv-page-header"><div class="sv-page-heading"><div class="sv-title">Availability &amp; gaps</div><div class="sv-subtitle">Free nights by villa, from today to the end of the selected year.</div></div>
    <div class="category-year"><button class="cal-nav" aria-label="Previous availability year" onclick="availabilityYear--;render()">‹</button><span>${year}</span><button class="cal-nav" aria-label="Next availability year" onclick="availabilityYear++;render()">›</button></div></div>`;
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
  h+='<div style="font-size:12px;font-weight:600;color:var(--text2)">Total free nights in this window</div>';
  h+='<div style="font-size:16px;font-weight:800;font-family:\'DM Mono\',monospace;color:var(--amber)">'+totalGapNights+' nights</div>';
  h+='</div>';

  return h+'</div>';
}
function renderBookingCalendarTool(view){
  const events=view==='events';
  const title=events?'Calendar events':'Upcoming agenda';
  const subtitle=events?'Visits, maintenance, deliveries and other calendar entries.':'Bookings and cleaning sessions over the next 90 days.';
  let h=`<div class="sv-page"><button class="back-btn" onclick="workspaceNavigate('calendar')">← Back to Bookings</button>
    <div class="sv-page-header"><div class="sv-page-heading"><div class="sv-title">${title}</div><div class="sv-subtitle">${subtitle}</div></div>
    ${events?'':`<button class="sv-btn sv-btn-secondary sv-btn-sm" onclick="openCalendarFilters()">${workspaceIcon('filter')}${esc(calendarFilterLabel())}</button>`}</div>`;
  return h+(events?renderCalendarEvents():renderCalendarList())+'</div>';
}
