/* Uplisting → Seravillas booking preview. Pure functions: no storage, DOM, network or writes. It compares the
   reservations the cloud service retrieved (read-only) with the app's existing records and explains what a later,
   separately approved import would do. Nothing here applies a change.

   Identity: the stable Uplisting reservation ID (b.uplisting.reservationId, written only by a future approved import),
   then a reliable channel reference (the existing Excel/manual reference), then identical dates + identical guest name
   in the same villa. Anything weaker is shown as uncertain and needs an explicit decision. Absence from a response is
   never a cancellation. Field ownership for the later sync stage is documented in docs/uplisting-integration.md. */
(function(root){
  'use strict';
  const text=v=>v==null?'':String(v).trim();
  const norm=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ');
  const compact=v=>norm(v).replace(/[^a-z0-9]/g,'');
  const has=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  const DATE=/^\d{4}-\d{2}-\d{2}$/;
  function validDate(v){if(!DATE.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
  const ACTIVE=new Set(['confirmed','checked_in','checked_out','needs_check_in','needs_check_out']);
  const canonical=name=>{const ex=root.SV_EXCEL;return compact(ex&&ex.propertyName?ex.propertyName(name):name);};
  /* Uplisting channel names → the app's platform values. Unknown channels keep their name as an agency. */
  function platform(channel){
    const c=compact(channel);
    if(c==='airbnb'||c==='airbnbofficial')return {platform:'airbnb',agencyName:''};
    if(c==='bookingdotcom'||c==='bookingcom'||c==='booking')return {platform:'booking',agencyName:''};
    if(c==='uplisting'||c==='direct')return {platform:'direct',agencyName:''};
    return c?{platform:'agency',agencyName:text(channel)}:{platform:'',agencyName:''};
  }
  /* A reference is only reliable when it looks like a real booking code (has a digit, 5+ characters). */
  const reliable=ref=>{const r=compact(ref);return r.length>=5&&/\d/.test(r);};
  function existingReference(b){
    const note=text(b.notes).match(/(?:^|\s)Ref:\s*([^\s;]+)/i);
    return text((b._excel||{}).reference||b.sourceReference||b.bookingReference||(note&&note[1]));
  }
  /* Property suggestions: an exact (alias-aware) name or nickname match is suggested; a partial match is only
     "likely" and needs an explicit choice; several matches are uncertain. Saved aliases are read, never changed. */
  function suggestProperty(up,props){
    const names=[up.name,up.nickname].filter(Boolean).map(canonical).filter(Boolean);
    const exact=props.filter(p=>names.includes(canonical(p.name)));
    if(exact.length===1)return {propId:exact[0].id,basis:'exact',candidates:exact.map(p=>p.id)};
    if(exact.length>1)return {propId:'',basis:'uncertain',candidates:exact.map(p=>p.id)};
    const partial=props.filter(p=>{const c=canonical(p.name);return c.length>=4&&names.some(n=>n.includes(c)||c.includes(n));});
    if(partial.length===1)return {propId:'',basis:'likely',candidates:[partial[0].id]};
    return {propId:'',basis:partial.length?'uncertain':'none',candidates:partial.map(p=>p.id)};
  }
  /* Owner-confirmed equivalent names (25 October 2026). Either name may be the Uplisting one or the Seravillas one, so a
     pair binds only when exactly one Uplisting listing carries one of its names and exactly one Seravillas villa carries
     one of its names. A missing or ambiguous name flags that pair; nothing is guessed. Part of the app, so the same on
     every device; villas, IDs and nickname memory are never changed. */
  const CONFIRMED=Object.freeze([['Villa Lumina','Villa Mar'],['Villa Escondido','Villa Marjals'],['Villa Terra','La Forca'],['Villa Vertice','Villa Diagonal']]);
  const same=(a,b)=>!!norm(a)&&norm(a)===norm(b);
  function confirmedPairs(upProps,props){
    return CONFIRMED.map(pair=>{
      const listings=(upProps||[]).filter(up=>pair.some(n=>same(up.name,n)||same(up.nickname,n)));
      const villas=props.filter(p=>pair.some(n=>same(p.name,n)));
      const issue=!listings.length?'No Uplisting listing is named '+pair.join(' or ')+'.':listings.length>1?'Several Uplisting listings are named '+pair.join(' or ')+'.':!villas.length?'No Seravillas villa is named '+pair.join(' or ')+'.':villas.length>1?'Several Seravillas villas are named '+pair.join(' or ')+'.':'';
      return {pair,listingIds:listings.map(x=>x.id),propIds:villas.map(x=>x.id),issue,bound:!issue};
    });
  }
  /* mappings[upId] is a Seravillas property ID, '@ignore' (not one of these villas), or absent (use the exact suggestion).
     An owner-confirmed pair takes precedence over a device choice. */
  function mapProperties(upProps,props,mappings){
    const pairs=confirmedPairs(upProps,props);
    const rows=(upProps||[]).map(up=>{
      const pair=pairs.find(p=>p.listingIds.includes(up.id));
      if(pair){const propId=pair.bound?pair.propIds[0]:'';return {...up,suggestion:{propId,basis:'confirmed',candidates:pair.propIds},propId,state:pair.bound?'confirmed':'unmapped',confirmed:pair};}
      const s=suggestProperty(up,props),chosen=has(mappings,up.id)?mappings[up.id]:'';
      let propId=chosen==='@ignore'?'':chosen||s.propId,state=chosen==='@ignore'?'ignored':chosen?'chosen':s.propId?'suggested':'unmapped';
      if(propId&&!props.some(p=>p.id===propId)){propId='';state='unmapped';}
      return {...up,suggestion:s,propId,state};
    });
    for(const r of rows)if(r.propId&&rows.filter(x=>x.propId===r.propId).length>1){r.state='conflict';}
    return rows;
  }
  function amount(r,key){return !has(r,key)?{state:'missing'}:r[key]===null?{state:'unknown'}:{state:'known',value:r[key]};}
  const overlaps=(a1,a2,b1,b2)=>a1<b2&&b1<a2;
  function plan(response,data,options){
    options=options||{};
    const year=options.year||2027,start=year+'-01-01',endExclusive=(year+1)+'-01-01',decisions=options.decisions||{};
    const props=data.props||[],bookings=data.bookings||[],sessions=data.sessions||[];
    const out={year,ok:!!(response&&response.ok),complete:!!(response&&response.ok&&response.complete),retrievedAt:response&&response.retrievedAt||'',
      problems:(response&&response.problems)||[],properties:[],rows:[],seravillasOnly:[],counts:{new:0,update:0,unchanged:0,review:0,cancelled:0,excluded:0},
      outsideScope:(response&&response.outsideScope)||0,canApply:false};
    if(!out.ok)return out;
    out.properties=mapProperties(response.properties,props,options.mappings||{});
    out.confirmed=confirmedPairs(response.properties,props);out.coverage=response.coverage||null;
    const byUp=new Map(out.properties.map(p=>[p.id,p])),incompleteProps=new Set((response.properties||[]).filter(p=>p.incomplete).map(p=>p.id));
    const seen=new Map(),claimed=new Map();
    for(const r of response.reservations||[]){
      const row={r,kind:'review',segment:'',propId:'',reason:'',changes:[],notes:[],warnings:[],candidates:[],bookingId:'',basis:'',cleaningReview:false,
        guests:amount(r,'guests'),accommodationTotal:amount(r,'accommodationTotal'),cleaningFee:amount(r,'cleaningFee'),totalPayout:amount(r,'totalPayout'),...platform(r.channel)};
      out.rows.push(row);
      const status=text(r.status);
      if(!text(r.id)){row.kind='excluded';row.reason='Uplisting returned a reservation without an ID.';continue;}
      if(seen.has(r.id)){row.kind='review';row.reason='The same Uplisting reservation appears twice.';seen.get(r.id).kind='review';seen.get(r.id).reason=row.reason;continue;}
      seen.set(r.id,row);
      if(!validDate(r.checkIn)||!validDate(r.checkOut)||r.checkOut<=r.checkIn){row.kind='excluded';row.reason='Arrival or departure date is missing or invalid.';continue;}
      if(!(r.checkIn<endExclusive&&r.checkOut>start)){row.kind='excluded';row.reason='Outside '+year+'.';continue;}
      row.segment=r.checkIn.startsWith(year+'-')?'arrives':'crosses';
      if(row.segment==='crosses')row.notes.push('Arrives '+r.checkIn+' and departs in '+year+'. Under the arrival-year rule it belongs to '+r.checkIn.slice(0,4)+'.');
      if(status!=='cancelled'&&!ACTIVE.has(status)){row.kind='excluded';row.reason='Status “'+(status||'none')+'” is not supported by this preview.';continue;}
      if(Array.isArray(r.conflicts)&&r.conflicts.length){row.kind='review';row.reason=r.conflicts[0];continue;}
      const map=byUp.get(text(r.propertyId));
      if(map&&map.state==='ignored'){row.kind='excluded';row.reason='Listing marked as not one of these villas.';continue;}
      if(!map||!map.propId){row.kind='review';row.reason=map&&map.confirmed?map.confirmed.issue:'Choose the Seravillas villa for this Uplisting listing.';continue;}
      if(map.state==='conflict'){row.kind='review';row.reason='Two Uplisting listings point to the same villa. Check the property mapping.';continue;}
      row.propId=map.propId;
      if(Array.isArray(r.invalid)&&r.invalid.length)row.warnings.push('Unreadable value for: '+r.invalid.join(', ')+'. Treated as unknown.');
      // Identity, strongest first. All years of the same villa are searched, so a moved stay is still found.
      const same=bookings.filter(b=>b.propId===row.propId);
      let match=same.filter(b=>text((b.uplisting||{}).reservationId)===text(r.id)),basis='Uplisting reservation ID';
      if(!match.length&&reliable(r.externalReservationId)){match=same.filter(b=>compact(existingReference(b))===compact(r.externalReservationId));basis='channel reference '+text(r.externalReservationId);}
      if(!match.length&&text(r.guestName)){match=same.filter(b=>b.checkIn===r.checkIn&&b.checkOut===r.checkOut&&norm(b.guestName)===norm(r.guestName));basis='same dates and guest name';}
      const decision=decisions[r.id];
      if(decision&&decision.startsWith('match:')){const chosen=same.find(b=>b.id===decision.slice(6));match=chosen?[chosen]:[];basis='your selection';}
      if(decision==='new'){match=[];}
      if(match.length>1){row.kind='review';row.reason='Several existing bookings match. Choose one.';row.candidates=match.map(b=>b.id);continue;}
      const booking=match[0]||null;
      if(!booking&&decision!=='new'){
        const possible=same.filter(b=>validDate(b.checkIn)&&validDate(b.checkOut)&&(overlaps(b.checkIn,b.checkOut,r.checkIn,r.checkOut)||(text(r.guestName)&&norm(b.guestName)===norm(r.guestName)&&Math.abs(Date.parse(b.checkIn)-Date.parse(r.checkIn))<=31*864e5)));
        if(possible.length){row.kind='review';row.reason=status==='cancelled'?'Cancelled in Uplisting; a similar Seravillas booking exists. Check whether it is the same stay.':'A Seravillas booking overlaps these dates or has the same guest. Check whether it is the same stay.';row.candidates=possible.map(b=>b.id);continue;}
      }
      if(booking){
        if(claimed.has(booking.id)){const other=claimed.get(booking.id);for(const x of [row,other]){x.kind='review';x.reason='Two Uplisting reservations match the same Seravillas booking.';x.candidates=[booking.id];}continue;}
        claimed.set(booking.id,row);row.bookingId=booking.id;row.basis=basis;
        const existingCancelled=booking.status==='cancelled';
        if(status==='cancelled'){
          if(existingCancelled){row.kind='unchanged';row.notes.push('Cancelled in both.');}
          else{row.kind='cancelled';row.changes.push('status');row.reason='Cancelled in Uplisting; still active in Seravillas.';}
        }else if(existingCancelled){row.kind='review';row.reason='Active in Uplisting but cancelled in Seravillas. Reactivation needs your decision; it is never automatic.';row.candidates=[booking.id];continue;}
        else{
          if(booking.checkIn!==r.checkIn)row.changes.push('checkIn');
          if(booking.checkOut!==r.checkOut)row.changes.push('checkOut');
          if(row.guests.state==='known'&&booking.guestCount!==row.guests.value)row.changes.push('guestCount');
          row.kind=row.changes.length?'update':'unchanged';
        }
        if(text(r.guestName)&&norm(booking.guestName)!==norm(r.guestName))row.notes.push('Guest name differs: Seravillas has “'+text(booking.guestName)+'”.');
        if(row.platform&&booking.platform&&row.platform!==booking.platform)row.notes.push('Channel differs: Seravillas has '+text(booking.platform)+(booking.agencyName?' ('+text(booking.agencyName)+')':'')+'.');
        if(text(r.arrivalTime)&&text(booking.checkInTime)&&text(r.arrivalTime).slice(0,5)!==text(booking.checkInTime).slice(0,5))row.notes.push('Arrival time differs: Seravillas records '+text(booking.checkInTime)+'.');
        if(text(r.departureTime)&&text(booking.checkOutTime)&&text(r.departureTime).slice(0,5)!==text(booking.checkOutTime).slice(0,5))row.notes.push('Departure time differs: Seravillas records '+text(booking.checkOutTime)+'.');
        if(row.guests.state!=='known')row.warnings.push(row.guests.state==='missing'?'Uplisting did not send a guest count; the existing count would be kept.':'Guest count is unknown in Uplisting; the existing count would be kept.');
        // A changed checkout or a cancellation is a cleaning-review item. Cleanings are never moved or deleted here.
        if(row.changes.includes('checkOut')||row.kind==='cancelled'){
          const linked=text(booking.linkedCleaningId)&&sessions.some(s=>s.id===booking.linkedCleaningId&&s.status!=='cancelled');
          const onDay=sessions.some(s=>s.propId===booking.propId&&s.date===booking.checkOut&&s.status!=='cancelled');
          if(linked||onDay){row.cleaningReview=true;row.warnings.push('Cleaning review: a cleaning is scheduled for the old checkout ('+booking.checkOut+'). It will not be moved, cancelled or reassigned automatically.');}
        }
        continue;
      }
      if(status==='cancelled'){row.kind='cancelled';row.reason='Cancelled in Uplisting and not in Seravillas. It would not be imported as an active booking.';continue;}
      row.kind='new';
      if(!text(r.guestName)){row.kind='review';row.reason='Guest name is missing; it is needed before this booking can be added.';continue;}
      if(row.guests.state!=='known')row.warnings.push(row.guests.state==='missing'?'Uplisting did not send a guest count; it would stay unknown.':'Guest count is unknown in Uplisting.');
      if(!row.platform)row.warnings.push('Uplisting did not say which channel this came from.');
    }
    for(const row of out.rows)out.counts[row.kind]++;
    for(const p of out.properties)p.inScope=out.rows.filter(x=>text(x.r.propertyId)===p.id&&x.segment).length;
    // Seravillas bookings in scope that Uplisting did not return: information only, never a cancellation.
    const mapped=new Map(out.properties.filter(p=>p.propId&&p.state!=='conflict').map(p=>[p.propId,p.id]));
    out.seravillasOnly=bookings.filter(b=>mapped.has(b.propId)&&b.status!=='cancelled'&&validDate(b.checkIn)&&validDate(b.checkOut)&&b.checkIn<endExclusive&&b.checkOut>start&&!claimed.has(b.id)&&!out.rows.some(x=>x.candidates.includes(b.id)))
      .map(b=>({booking:b,comparable:out.complete&&!incompleteProps.has(mapped.get(b.propId))}));
    return out;
  }
  root.SV_UPLISTING=Object.freeze({plan,CONFIRMED,confirmedPairs,suggestProperty,mapProperties,platform,existingReference,validDate,ACTIVE});
})(typeof window!=='undefined'?window:globalThis);
