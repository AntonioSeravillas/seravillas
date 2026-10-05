/* Read-only report calculations and drilldowns. Filters never change app records. */
let reportMonth=null,reportVilla='',reportBookingSearch='',reportBookingStatus='all',reportBookingSort='arrival',reportChart='revenue';
const REPORT_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
// Manager-confirmed report scope: Can Vallori remains in app records but is not tracked in Reports.
const REPORT_EXCLUDED_VILLA_IDS=Object.freeze(['mo4hhdwukkja']);
function reportProperties(data){return (data.props||[]).filter(p=>!REPORT_EXCLUDED_VILLA_IDS.includes(p.id));}

function reportDay(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const ms=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===date?ms/86400000:null;
}
function reportPeriod(year,month){
  const start=year+'-'+pad(month===null?1:month+1)+'-01';
  const end=month===null||month===11?(year+1)+'-01-01':year+'-'+pad(month+2)+'-01';
  return {start,end,startDay:reportDay(start),endDay:reportDay(end),days:reportDay(end)-reportDay(start)};
}
function reportKnownPrice(booking){
  return typeof booking.totalPrice==='number'&&Number.isFinite(booking.totalPrice)&&booking.totalPrice>=0&&Number.isSafeInteger(Math.round(booking.totalPrice*100));
}
function reportChannelKey(b){return JSON.stringify([b.platform||'agency',b.platform==='agency'?(b.agencyName||'Agency'):'']);}
function reportChannelName(b){return b.platform==='airbnb'?'Airbnb':b.platform==='booking'?'Booking.com':b.platform==='direct'?'Direct':b.agencyName||'Agency';}
function reportMoney(cents){return fmtRevenueAmount(cents/100);}
function reportPercent(n){return Math.round(n)+'%';}
function reportDateRange(b){
  return [b.checkIn,b.checkOut].map(s=>reportDay(s)===null?s||'Date missing':new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})).join(' – ');
}

function bookingReportData(data,year,month=null,villaId=''){
  const period=reportPeriod(year,month),properties=reportProperties(data).filter(p=>!villaId||p.id===villaId);
  const propertyIds=new Set(properties.map(p=>p.id));
  const bookings=(data.bookings||[]).filter(b=>!REPORT_EXCLUDED_VILLA_IDS.includes(b.propId)&&(!villaId||b.propId===villaId));
  const result={...period,year,month,properties,arrivals:[],cancelled:[],rows:[],revenueCents:0,activeRevenueCents:0,cancellationRevenueCents:0,stayRevenueCents:0,knownPriceCount:0,unknownPrices:0,unknownStayPrices:0,pricedStayNights:0,fullArrivalNights:0,validArrivalDates:0,guestCount:0,unknownGuests:0,invalidDates:0,unassignedStays:0,overlapNights:0,channels:[]};
  const occupied=new Map(),channels=new Map();
  for(const b of bookings){
    const start=reportDay(b.checkIn),end=reportDay(b.checkOut);
    const arrival=start!==null&&start>=period.startDay&&start<period.endDay;
    const valid=start!==null&&end!==null&&end>start;
    const cancelled=b.status==='cancelled';
    const overlap=!cancelled&&valid&&start<period.endDay&&end>period.startDay;
    if(!arrival&&!overlap)continue;
    const fullNights=valid?end-start:0;
    const nights=overlap?Math.min(end,period.endDay)-Math.max(start,period.startDay):0;
    const known=reportKnownPrice(b),priceCents=known?Math.round(b.totalPrice*100):0;
    // Cumulative cent rounding makes the pieces of a cross-month stay sum to its price.
    const stayCents=overlap&&known?Math.round(priceCents*(Math.min(end,period.endDay)-start)/fullNights)-Math.round(priceCents*(Math.max(start,period.startDay)-start)/fullNights):0;
    const revenueCents=arrival?bookingRevenueCents(b):0;
    const row={booking:b,arrival,cancelled,known,fullNights,nights,stayCents,revenueCents};
    result.rows.push(row);
    if(arrival){
      result.revenueCents+=revenueCents;
      if(cancelled){result.cancelled.push(b);result.cancellationRevenueCents+=revenueCents;}
      else{
        result.arrivals.push(b);result.activeRevenueCents+=revenueCents;
        if(known)result.knownPriceCount++;else result.unknownPrices++;
        if(valid){result.fullArrivalNights+=fullNights;result.validArrivalDates++;}else result.invalidDates++;
        if(Number.isSafeInteger(b.guestCount)&&b.guestCount>=0)result.guestCount+=b.guestCount;else result.unknownGuests++;
      }
    }
    if(overlap){
      result.stayRevenueCents+=stayCents;
      if(known)result.pricedStayNights+=nights;else result.unknownStayPrices++;
      if(propertyIds.has(b.propId)){
        if(!occupied.has(b.propId))occupied.set(b.propId,new Map());
        const days=occupied.get(b.propId);
        for(let d=Math.max(start,period.startDay);d<Math.min(end,period.endDay);d++)days.set(d,(days.get(d)||0)+1);
      }else result.unassignedStays++;
    }
    const key=reportChannelKey(b);
    if(!channels.has(key))channels.set(key,{key,name:reportChannelName(b),platform:b.platform,count:0,revenueCents:0,stayRevenueCents:0,rows:[]});
    const channel=channels.get(key);channel.rows.push(row);channel.revenueCents+=revenueCents;channel.stayRevenueCents+=stayCents;
    if(arrival&&!cancelled)channel.count++;
  }
  result.bookedNights=0;
  for(const days of occupied.values()){
    result.bookedNights+=days.size;
    result.overlapNights+=[...days.values()].filter(count=>count>1).length;
  }
  result.capacity=period.days*properties.length;
  result.availableNights=Math.max(0,result.capacity-result.bookedNights);
  result.occupancy=result.capacity?result.bookedNights/result.capacity*100:0;
  result.averageBookingCents=result.knownPriceCount?Math.round(result.activeRevenueCents/result.knownPriceCount):null;
  result.averageNightCents=result.pricedStayNights?Math.round(result.stayRevenueCents/result.pricedStayNights):null;
  result.revenuePerAvailableNightCents=result.capacity?Math.round(result.stayRevenueCents/result.capacity):null;
  result.averageStay=result.validArrivalDates?result.fullArrivalNights/result.validArrivalDates:null;
  result.channels=[...channels.values()].sort((a,b)=>b.revenueCents-a.revenueCents||a.name.localeCompare(b.name));
  return result;
}

function revealReportScope(){render();const content=document.getElementById('content');if(content)content.scrollTop=0;}
function setReportVilla(id){reportVilla=reportProperties(D).some(p=>p.id===id)?id:'';revealReportScope();}
function setReportMonth(value){const month=value===''?null:Number(value);if(month!==null&&(!Number.isInteger(month)||month<0||month>11))return;reportMonth=month;revealReportScope();}
function setReportYear(value){const year=Number(value);if(Number.isInteger(year)&&year>=1900&&year<=2200){reportYear=year;revealReportScope();}}
function resetReportFilters(){reportVilla='';reportMonth=null;reportBookingSearch='';reportBookingStatus='all';revealReportScope();}
function reportScopeLabel(){return (reportMonth===null?'Full year':REPORT_MONTHS[reportMonth])+' '+reportYear+' · '+(D.props.find(p=>p.id===reportVilla)?.name||'All villas');}
function currentBookingReport(){return bookingReportData(D,reportYear,reportMonth,reportVilla);}

function reportMetric(value,label,detail,extra=''){
  return '<div class="wr-stat rpt-stat '+extra+'"><div class="wr-stat-n">'+value+'</div><div class="wr-stat-l">'+label+'</div><small>'+detail+'</small></div>';
}
function reportArrow(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';}
function renderReportMonthlyChart(months){
  const values=months.map(s=>reportChart==='occupancy'?s.occupancy:s.revenueCents/100),max=reportChart==='occupancy'?100:Math.max(...values,1);
  return '<div class="rpt-chart-scroll"><div class="rpt-chart">'+months.map((s,i)=>'<button class="rpt-chart-month'+(reportMonth===i?' selected':'')+'" onclick="setReportMonth('+i+')" aria-label="Explore '+REPORT_MONTHS[i]+' '+reportYear+' in chart" title="'+REPORT_MONTHS[i]+': '+reportMoney(s.revenueCents)+' booked revenue, '+reportPercent(s.occupancy)+' occupancy"><span class="rpt-chart-value">'+(reportChart==='occupancy'?reportPercent(s.occupancy):fmtEur(s.revenueCents/100))+'</span><span class="rpt-chart-track"><i style="height:'+values[i]/max*100+'%"></i></span><span>'+REPORT_MONTHS[i].slice(0,3)+'</span></button>').join('')+'</div></div>';
}

function renderDetailedBookingReport(){
  const trackedProperties=reportProperties(D);
  if(reportVilla&&!trackedProperties.some(p=>p.id===reportVilla))reportVilla='';
  const summary=currentBookingReport();
  const years=new Set([reportYear,new Date().getFullYear(),new Date().getFullYear()+1]);
  D.bookings.forEach(b=>{if(!REPORT_EXCLUDED_VILLA_IDS.includes(b.propId)&&reportDay(b.checkIn)!==null)years.add(Number(b.checkIn.slice(0,4)));});
  let h='<div class="sv-page-header revenue-header"><div class="sv-page-heading"><div class="sv-title">Revenue reports</div><div class="sv-subtitle">Booked prices, occupancy and performance. Explore a villa or month.</div></div>'
    +'<div class="rpt-year"><button class="week-nav-btn" aria-label="Previous revenue year" onclick="setReportYear(reportYear-1)">‹</button><label class="sr-only" for="report-year">Report year</label><select id="report-year" onchange="setReportYear(this.value)">'+[...years].sort((a,b)=>a-b).map(y=>'<option'+(y===reportYear?' selected':'')+'>'+y+'</option>').join('')+'</select><button class="week-nav-btn" aria-label="Next revenue year" onclick="setReportYear(reportYear+1)">›</button></div></div>';
  h+='<div class="wr-card rpt-filters"><div class="field"><label for="report-villa">Villa</label><select id="report-villa" onchange="setReportVilla(this.value)"><option value="">All villas</option>'+trackedProperties.map(p=>'<option value="'+esc(p.id)+'"'+(reportVilla===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></div>'
    +'<div class="field"><label for="report-month">Period</label><select id="report-month" onchange="setReportMonth(this.value)"><option value=""'+(reportMonth===null?' selected':'')+'>Full year</option>'+REPORT_MONTHS.map((m,i)=>'<option value="'+i+'"'+(reportMonth===i?' selected':'')+'>'+m+'</option>').join('')+'</select></div>'
    +((reportVilla||reportMonth!==null)?'<button class="sv-btn sv-btn-secondary" onclick="resetReportFilters()">All villas / full year</button>':'')+'</div>';
  h+='<div class="rpt-scope" role="status">'+esc(reportScopeLabel())+'</div>';
  if(summary.unknownPrices||summary.unknownStayPrices)h+='<p class="rpt-notice">Revenue totals are incomplete: '+summary.unknownPrices+' arrivals and '+summary.unknownStayPrices+' stays in this period have unknown prices. Averages use known prices, including €0.</p>';
  if(summary.overlapNights)h+='<p class="rpt-notice">'+summary.overlapNights+' villa nights have overlapping active bookings. Occupancy counts each villa night once. Review the booking details below.</p>';
  if(summary.invalidDates||summary.unassignedStays)h+='<p class="rpt-notice">'+summary.invalidDates+' arrivals have invalid stay dates; '+summary.unassignedStays+' stays refer to a missing villa. Their booked prices remain in the report; occupancy needs valid dates and an existing villa.</p>';
  h+='<div class="wr-hero rpt-metrics">'
    +reportMetric(reportMoney(summary.revenueCents),'Booked revenue','Arrival-period prices + retained cancellations','rpt-stat-revenue')
    +reportMetric(summary.arrivals.length,'Bookings arriving',summary.cancelled.length+' cancelled bookings shown separately')
    +reportMetric(reportPercent(summary.occupancy),'Occupancy',summary.bookedNights+' / '+summary.capacity+' villa nights')
    +reportMetric(summary.averageBookingCents===null?'—':reportMoney(summary.averageBookingCents),'Avg booking value',summary.knownPriceCount+' arrivals with known prices')
    +reportMetric(summary.bookedNights+'n','Booked nights','Occupied nights inside the selected period')
    +reportMetric(summary.availableNights+'n','Available nights',summary.properties.length+' villa'+(summary.properties.length===1?'':'s')+' × '+summary.days+' nights')+'</div>';
  h+='<div class="wr-card rpt-facts"><div><small>Stay value in period</small><strong>'+reportMoney(summary.stayRevenueCents)+'</strong></div><div><small>Avg nightly value</small><strong>'+(summary.averageNightCents===null?'—':reportMoney(summary.averageNightCents))+'</strong></div><div><small>Value / available night</small><strong>'+(summary.revenuePerAvailableNightCents===null?'—':reportMoney(summary.revenuePerAvailableNightCents))+'</strong></div><div><small>Avg stay</small><strong>'+(summary.averageStay===null?'—':summary.averageStay.toFixed(1)+' nights')+'</strong></div><div><small>Guests on arriving bookings</small><strong>'+summary.guestCount+(summary.unknownGuests?' + '+summary.unknownGuests+' unknown stays':'')+'</strong></div></div>';
  if(summary.cancellationRevenueCents)h+='<p class="rpt-note">Includes '+reportMoney(summary.cancellationRevenueCents)+' retained from cancelled bookings. Cancelled stays contribute no occupied nights or stay averages.</p>';

  const months=REPORT_MONTHS.map((_,m)=>bookingReportData(D,reportYear,m,reportVilla));
  h+='<div class="rpt-panels"><section class="wr-card rpt-months" aria-labelledby="report-months-title"><div class="rpt-panel-heading"><h2 id="report-months-title">Monthly revenue &amp; occupancy</h2><span>'+reportYear+'</span></div><p class="rpt-note">Select a month for its full details'+(reportVilla?' at '+esc(summary.properties[0]?.name||'this villa'):' across all villas')+'.</p><div class="sv-tabs rpt-chart-tabs" aria-label="Monthly chart"><button class="sv-tab'+(reportChart==='revenue'?' active':'')+'" aria-pressed="'+(reportChart==='revenue')+'" onclick="reportChart=\'revenue\';render()">Revenue</button><button class="sv-tab'+(reportChart==='occupancy'?' active':'')+'" aria-pressed="'+(reportChart==='occupancy')+'" onclick="reportChart=\'occupancy\';render()">Occupancy</button></div>'+renderReportMonthlyChart(months)+'<div class="rpt-month-labels"><span>Month</span><span>Booked revenue</span><span>Occupancy / nights</span><span>Arrivals</span></div>';
  for(let m=0;m<12;m++){
    const s=months[m];
    h+='<button class="rpt-month-row'+(reportMonth===m?' selected':'')+'" onclick="setReportMonth('+m+')" aria-label="Show '+REPORT_MONTHS[m]+' '+reportYear+' report" aria-pressed="'+(reportMonth===m)+'"><span class="rpt-month-name">'+REPORT_MONTHS[m].slice(0,3)+'</span><span class="rpt-month-money">'+reportMoney(s.revenueCents)+'</span><span class="rpt-month-occupancy"><span>'+reportPercent(s.occupancy)+' <small>· '+s.bookedNights+' nights</small></span><span class="rpt-meter"><i style="width:'+s.occupancy+'%"></i></span></span><span class="rpt-month-count">'+s.arrivals.length+'<small> bookings</small></span></button>';
  }
  h+='</section><section class="wr-card" aria-labelledby="report-villas-title"><div class="rpt-panel-heading"><h2 id="report-villas-title">Property performance</h2><span>'+(reportMonth===null?'Full year':REPORT_MONTHS[reportMonth])+'</span></div><p class="rpt-note">Select a villa to focus every figure and booking list.</p>';
  for(const p of summary.properties){
    const s=bookingReportData(D,reportYear,reportMonth,p.id),clr=propBarColor(p.id);
    h+='<button class="rpt-villa-row" data-report-villa="'+esc(p.id)+'" onclick="setReportVilla(this.dataset.reportVilla)" aria-label="Show '+esc(p.name)+' report"><span class="rpt-villa-top"><strong><i style="background:'+clr.border+'"></i>'+esc(p.name)+'</strong><b>'+reportMoney(s.revenueCents)+'</b>'+reportArrow()+'</span><span class="rpt-meter"><i style="width:'+s.occupancy+'%;background:'+clr.border+'"></i></span><span class="rpt-villa-facts"><span>'+reportPercent(s.occupancy)+' occupancy</span><span>'+s.bookedNights+' nights</span><span>'+s.arrivals.length+' bookings</span><span>avg '+(s.averageBookingCents===null?'—':reportMoney(s.averageBookingCents))+'</span></span></button>';
  }
  if(!summary.properties.length)h+='<p class="wr-empty">Add a villa to see its performance.</p>';
  h+='</section></div>';

  h+='<section class="wr-card" aria-labelledby="report-channels-title"><div class="rpt-panel-heading"><h2 id="report-channels-title">By platform &amp; agency</h2><span>Open channel details</span></div>';
  for(const c of summary.channels){
    const share=summary.revenueCents?c.revenueCents/summary.revenueCents*100:0;
    h+='<button class="rpt-channel" data-report-channel="'+esc(c.key)+'" onclick="openReportChannel(this.dataset.reportChannel)" aria-label="Open '+esc(c.name)+' report"><span><strong>'+esc(c.name)+'</strong><small>'+c.count+' arrivals · '+reportPercent(share)+' of booked revenue</small></span><b>'+reportMoney(c.revenueCents)+'</b>'+reportArrow()+'</button>';
  }
  if(!summary.channels.length)h+='<p class="wr-empty">No bookings in this period.</p>';
  h+='</section>';
  h+='<section class="wr-card" aria-labelledby="report-bookings-title"><div class="rpt-panel-heading"><h2 id="report-bookings-title">Booking details</h2><span>Current booked prices</span></div><p class="rpt-note">All active stays overlapping this period, plus cancellations scheduled to arrive here. Open any booking for its full record.</p>'
    +'<div class="rpt-booking-controls"><div class="field"><label for="report-booking-search">Find a booking</label><input type="text" id="report-booking-search" value="'+esc(reportBookingSearch)+'" placeholder="Guest, villa or channel" oninput="updateReportBookingList(this.value)"></div><div class="field"><label for="report-booking-status">Status</label><select id="report-booking-status" onchange="reportBookingStatus=this.value;updateReportBookingList()">'+[['all','All bookings'],['active','Active stays'],['cancelled','Cancelled']].map(([v,l])=>'<option value="'+v+'"'+(v===reportBookingStatus?' selected':'')+'>'+l+'</option>').join('')+'</select></div><div class="field"><label for="report-booking-sort">Sort</label><select id="report-booking-sort" onchange="reportBookingSort=this.value;updateReportBookingList()">'+[['arrival','Arrival: earliest'],['latest','Arrival: latest'],['highest','Price: highest'],['lowest','Price: lowest']].map(([v,l])=>'<option value="'+v+'"'+(v===reportBookingSort?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div id="report-booking-results" aria-live="polite">'+renderReportBookingResults(summary)+'</div></section>';
  if(summary.cancelled.length){
    h+='<details class="wr-card rpt-definitions"><summary>Cancelled bookings — money retained ('+summary.cancelled.length+')</summary><p>Only the recorded retained amount contributes to booked revenue. Open a booking and choose Edit to record money retained; €0 means a full refund.</p>'+summary.rows.filter(r=>r.cancelled).map(renderReportBookingRow).join('')+'</details>';
  }
  h+='<details class="wr-card rpt-definitions"><summary>How these figures work</summary><dl><dt>Tracked villas</dt><dd>Reports tracks '+trackedProperties.map(p=>esc(p.name)).join(', ')+'. Can Vallori is excluded from all report figures and filters.</dd><dt>Booked revenue</dt><dd>Current active booking prices plus recorded cancellation money, assigned to the scheduled arrival month. These are booked values; the app does not track payment receipts or expenses.</dd><dt>Stay value in period</dt><dd>Active booking prices divided across their nights. A stay crossing months contributes only the nights inside each month, including stays arriving in a previous year.</dd><dt>Occupancy and available nights</dt><dd>Checkout day is excluded. Each villa night counts once, even if bookings overlap. Every selected tracked villa is assumed available every night; no owner blocks or out-of-service periods are deducted.</dd><dt>Averages</dt><dd>Booking value uses known-price arrivals. Nightly value uses priced stay nights in this period. Value per available night uses all selected villa nights. Missing prices are excluded from averages; a genuine €0 stays included.</dd></dl></details>';
  return '<div class="sv-page revenue-page">'+h+'</div>';
}

function renderReportBookingRow(row){
  const b=row.booking,prop=D.props.find(p=>p.id===b.propId),price=row.cancelled?reportMoney(bookingRevenueCents(b)):row.known?reportMoney(Math.round(b.totalPrice*100)):'Price unknown';
  return '<button class="rpt-booking" data-report-booking="'+esc(b.id)+'" onclick="openBookingDetail(this.dataset.reportBooking)"><span class="rpt-booking-main"><strong>'+esc(b.guestName||'Guest name missing')+'</strong><span>'+esc(prop?.name||'Missing villa')+' · '+esc(reportChannelName(b))+'</span><small>'+esc(reportDateRange(b))+'</small><small>'+row.fullNights+' nights'+(Number.isSafeInteger(b.guestCount)?' · '+b.guestCount+' guests':' · Guests unknown')+'</small></span><span class="rpt-booking-price"><strong>'+price+'</strong><small>'+(row.cancelled?'Money retained':'Full booking price')+'</small><span class="sv-badge '+(row.cancelled?'sv-badge-red':'sv-badge-teal')+'">'+(row.cancelled?'Cancelled':row.arrival?'Arrives in period':'Arrived earlier')+'</span></span><span class="rpt-booking-period">'+(row.cancelled?'No occupied nights':row.nights+' nights in period · '+(row.known?reportMoney(row.stayCents)+' stay value':'Stay value unknown'))+'</span>'+reportArrow()+'</button>';
}
function renderReportBookingResults(summary){
  const search=reportBookingSearch.trim().toLowerCase();
  const rows=summary.rows.filter(r=>reportBookingStatus==='all'||(reportBookingStatus==='cancelled')===r.cancelled).filter(r=>!search||[r.booking.guestName,D.props.find(p=>p.id===r.booking.propId)?.name,reportChannelName(r.booking)].some(v=>String(v||'').toLowerCase().includes(search)));
  rows.sort((a,b)=>{
    if(reportBookingSort==='highest'||reportBookingSort==='lowest'){
      const av=a.cancelled?bookingRevenueCents(a.booking):a.known?Math.round(a.booking.totalPrice*100):null,bv=b.cancelled?bookingRevenueCents(b.booking):b.known?Math.round(b.booking.totalPrice*100):null;
      if(av===null||bv===null)return av===bv?0:av===null?1:-1;
      return reportBookingSort==='highest'?bv-av:av-bv;
    }
    return String(a.booking.checkIn).localeCompare(String(b.booking.checkIn))*(reportBookingSort==='latest'?-1:1);
  });
  return '<p class="rpt-result-count">'+rows.length+' bookings shown</p>'+(rows.length?rows.map(renderReportBookingRow).join(''):'<p class="wr-empty">No bookings match these filters.</p>');
}
function updateReportBookingList(value){
  if(typeof value==='string')reportBookingSearch=value;
  const el=document.getElementById('report-booking-results');if(el)el.innerHTML=renderReportBookingResults(currentBookingReport());
}
function openReportChannel(key){
  const summary=currentBookingReport(),channel=summary.channels.find(c=>c.key===key);if(!channel)return;
  showModal('<div class="modal-title">'+esc(channel.name)+' report</div><p class="rpt-note">'+esc(reportScopeLabel())+'</p><div class="wr-hero rpt-channel-metrics">'+reportMetric(reportMoney(channel.revenueCents),'Booked revenue',channel.count+' arrivals')+reportMetric(reportMoney(channel.stayRevenueCents),'Stay value in period','Active nights only')+'</div>'+channel.rows.slice().sort((a,b)=>String(a.booking.checkIn).localeCompare(String(b.booking.checkIn))).map(renderReportBookingRow).join('')+'<button class="sv-btn sv-btn-secondary" onclick="closeModal()">Close</button>');
}
