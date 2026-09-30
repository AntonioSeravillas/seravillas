/* RESERVES workbook import rules. Pure functions: no storage, DOM, or network. */
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=value=>value==null?'':String(value).trim();
  const norm=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  const compact=value=>norm(value).replace(/[^a-z0-9]/g,'');
  const aliases={
    'Villa Mar':['villa mar','mar'],
    'Villa Marjals':['villa marjals','can marjals','marjals'],
    'Villa Diagonal':['villa diagonal','diagonal'],
    'La Forca':['la forca','forca'],
    'Can Vallori':['can vallori','vallori']
  };
  function propertyName(value){
    const name=norm(value);
    return Object.keys(aliases).find(key=>aliases[key].includes(name))||text(value);
  }
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
    const d=new Date(value+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function dateValue(cell,date1904){
    if(!cell||cell.v==null)return '';
    if(typeof cell.v==='number'){
      const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!date1904});
      if(!d)return '';
      return [String(d.y).padStart(4,'0'),String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');
    }
    const s=text(cell.v),parts=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return parts?parts[3]+'-'+parts[2].padStart(2,'0')+'-'+parts[1].padStart(2,'0'):s.slice(0,10);
  }
  function guests(value){
    const raw=text(value);
    if(!/^\d+(?:\s*\+\s*\d+)*$/.test(raw))return {raw,value:null};
    const total=raw.split('+').reduce((sum,n)=>sum+Number(n.trim()),0);
    return {raw,value:Number.isSafeInteger(total)?total:null};
  }
  function channel(value){
    const n=compact(value);
    if(n==='airbnb')return {platform:'airbnb',agencyName:''};
    if(n==='booking'||n==='bookingcom')return {platform:'booking',agencyName:''};
    if(['private','privado','direct','directo'].includes(n))return {platform:'direct',agencyName:''};
    return {platform:'agency',agencyName:text(value)};
  }
  function usableReference(reference,agency){
    const ref=text(reference);
    return !!ref&&/\d/.test(ref)&&compact(ref)!==compact(agency);
  }
  function parseWorkbook(workbook){
    const result={rows:[],sheets:[],errors:[]};
    const date1904=workbook.Workbook&&workbook.Workbook.WBProps&&workbook.Workbook.WBProps.date1904;
    const names={agency:['agencia'],checkIn:['fechaentrada','entrada','checkin'],checkOut:['fechasalida','salida','checkout'],guestName:['nombrecliente','cliente','guestname'],reference:['reserva','reference'],guestCount:['npersonas','nopersonas','numeropersonas','personas'],amount:['acobrar','apagar','importe','total']};
    for(const sheetName of workbook.SheetNames){
      const sheet=workbook.Sheets[sheetName];
      if(!sheet||!sheet['!ref'])continue;
      const range=XLSX.utils.decode_range(sheet['!ref']);
      let header=-1,columns={};
      for(let r=range.s.r;r<=Math.min(range.e.r,14);r++){
        const candidate={};
        for(let c=range.s.c;c<=range.e.c;c++){
          const value=compact((sheet[XLSX.utils.encode_cell({r,c})]||{}).v);
          for(const key of Object.keys(names))if(names[key].includes(value))candidate[key]=c;
        }
        if(['agency','checkIn','checkOut','guestName','amount'].every(key=>candidate[key]!==undefined)){header=r;columns=candidate;break;}
      }
      if(header<0){result.errors.push(sheetName+': booking column headings were not recognised.');continue;}
      const property=propertyName(sheetName),info={name:sheetName,property,count:0,amountHeader:text((sheet[XLSX.utils.encode_cell({r:header,c:columns.amount})]||{}).v)};
      result.sheets.push(info);
      for(let r=header+1;r<=range.e.r;r++){
        const cell=key=>columns[key]===undefined?undefined:sheet[XLSX.utils.encode_cell({r,c:columns[key]})];
        // Totals have no dates, guest, or agency. A partially filled booking is kept for review.
        if(!['agency','checkIn','checkOut','guestName'].some(key=>text((cell(key)||{}).v)))continue;
        const occupancy=guests((cell('guestCount')||{}).v),sourceChannel=text((cell('agency')||{}).v),amountCell=cell('amount');
        const amount=amountCell&&typeof amountCell.v==='number'&&Number.isFinite(amountCell.v)?amountCell.v:null;
        const checkIn=dateValue(cell('checkIn'),date1904),checkOut=dateValue(cell('checkOut'),date1904);
        const reference=text((cell('reference')||{}).v);
        result.rows.push({key:sheetName+':'+(r+1),sheet:sheetName,row:r+1,property,sourceChannel,...channel(sourceChannel),checkIn,checkOut,originalCheckIn:checkIn,originalCheckOut:checkOut,guestName:text((cell('guestName')||{}).v),reference,cancelledInSource:['canceled','cancelled','cancelado','cancelada','anulado','anulada'].includes(compact(reference)),guestCount:occupancy.value,guestCountRaw:occupancy.raw,totalPrice:amount,originalPriceMissing:amount===null,amountHeader:info.amountHeader});
        info.count++;
      }
    }
    return result;
  }
  function existingReference(booking){
    const note=text(booking.notes).match(/(?:^|\s)Ref:\s*([^\s;]+)/i);
    return text((booking._excel||{}).reference||booking.sourceReference||booking.bookingReference||(note&&note[1]));
  }
  function sourceKey(row,propId){
    return usableReference(row.reference,row.sourceChannel)
      ?JSON.stringify([propId,row.platform,norm(row.agencyName),norm(row.reference)])
      :JSON.stringify([propId,row.checkIn,row.checkOut,norm(row.guestName)]);
  }
  function fingerprint(data){return JSON.stringify({props:data.props||[],bookings:data.bookings||[],sessions:data.sessions||[]});}
  function planImport(parsed,data,options){
    options=options||{};
    const year=options.year||2026,mappings=options.mappings||{},decisions=options.decisions||{},statusDecisions=options.statusDecisions||{},overrides=options.overrides||{};
    const plan={year,fingerprint:fingerprint(data),rows:[],newProperties:[],cancellations:[],errors:parsed.errors.slice(),scope:[],counts:{add:0,update:0,unchanged:0,review:0,skip:0}};
    const properties=data.props||[],bookings=(data.bookings||[]).filter(b=>text(b.checkIn).slice(0,4)===String(year));
    const matched=new Set(),used=new Set(),keys=new Map();
    for(const sheet of parsed.sheets){
      const matches=properties.filter(p=>norm(propertyName(p.name))===norm(sheet.property));
      const choice=mappings[sheet.name]!==undefined?mappings[sheet.name]:(matches.length===1?matches[0].id:'');
      let propId=choice;
      if(choice==='@create'){
        if(matches.length){propId='';plan.errors.push(sheet.name+': choose an existing villa rather than creating its duplicate.');}
        else{propId='new:'+sheet.name;plan.newProperties.push({temporaryId:propId,name:sheet.property});}
      }
      if(propId&&!propId.startsWith('new:')&&!properties.some(p=>p.id===propId)){propId='';plan.errors.push(sheet.name+': selected villa no longer exists.');}
      if(propId)plan.scope.push(propId);
      for(const original of parsed.rows.filter(row=>row.sheet===sheet.name)){
        const row={...original,...(overrides[original.key]||{})},entry={row,propId,status:statusDecisions[original.key]==='cancelled'?'cancelled':'confirmed',kind:'review',reason:'',warnings:[],candidates:[],changes:[]};
        const decision=decisions[row.key];
        if(decision==='skip'){entry.kind='skip';entry.reason='Excluded by you';}
        else if(!validDate(row.checkIn)||!validDate(row.checkOut)||row.checkOut<=row.checkIn){entry.reason='Check arrival and departure dates';}
        else if(row.checkIn.slice(0,4)!==String(year)){entry.kind='skip';entry.reason='Outside '+year;}
        else if(!propId){entry.reason='Choose the villa for this sheet';}
        else if(!row.guestName){entry.reason='Guest name is missing';}
        else if(!row.sourceChannel){entry.reason='Agency or channel is missing';}
        else if(row.cancelledInSource&&!['cancelled','active'].includes(statusDecisions[row.key])){entry.reason='The workbook marks this row cancelled. Confirm its status or exclude it.';}
        else{
          entry.sourceKey=sourceKey(row,propId);
          if(keys.has(entry.sourceKey)){
            const prior=keys.get(entry.sourceKey);prior.kind='review';prior.reason='Duplicate booking in the workbook';entry.reason=prior.reason;
          }else{
            keys.set(entry.sourceKey,entry);
            const ref=usableReference(row.reference,row.sourceChannel)?norm(row.reference):'';
            let candidates=bookings.filter(b=>b.propId===propId&&((b._excel||{}).sourceKey===entry.sourceKey||(ref&&b.platform===row.platform&&norm(b.agencyName)===norm(row.agencyName)&&norm(existingReference(b))===ref)));
            if(!candidates.length)candidates=bookings.filter(b=>b.propId===propId&&b.checkIn===row.checkIn&&b.checkOut===row.checkOut&&norm(b.guestName)===norm(row.guestName));
            let booking=candidates.length===1?candidates[0]:null;
            if(candidates.length>1){entry.reason='Multiple existing bookings match';entry.candidates=candidates;}
            else if(!booking){
              const uncertain=bookings.filter(b=>b.propId===propId&&((b.checkIn===row.checkIn&&b.checkOut===row.checkOut)||norm(b.guestName)===norm(row.guestName)));
              if(uncertain.length){entry.reason='Review a possible existing booking';entry.candidates=uncertain;}
              else entry.kind='add';
            }
            if(decision&&decision.startsWith('match:')){
              booking=bookings.find(b=>b.id===decision.slice(6)&&b.propId===propId)||null;
              if(!booking){entry.reason='The selected booking is unavailable';entry.kind='review';}
              else entry.reason='';
            }else if(decision==='new'){booking=null;entry.kind='add';entry.reason='';}
            if(booking){
              entry.bookingId=booking.id;
              if(used.has(booking.id)){entry.kind='review';entry.reason='Two spreadsheet rows match the same booking';}
              else if(booking.status==='cancelled'&&entry.status!=='cancelled'&&decision!=='match:'+booking.id&&statusDecisions[row.key]!=='active'){entry.kind='review';entry.reason='Confirm reactivation of a cancelled booking';entry.candidates=[booking];}
              else{
                entry.kind='update';entry.reason='';
                for(const field of ['checkIn','checkOut','guestName','platform','agencyName','guestCount','totalPrice'])if(row[field]!=null&&row[field]!==booking[field])entry.changes.push(field);
                if((booking.status||'confirmed')!==entry.status)entry.changes.push('status');
                if(!entry.changes.length&&(booking._excel||{}).sourceKey===entry.sourceKey)entry.kind='unchanged';
                used.add(booking.id);matched.add(booking.id);
                if(booking.linkedCleaningId&&(entry.changes.includes('checkOut')||entry.changes.includes('status')))entry.warnings.push('Linked cleaning needs review; its date and assignment will stay unchanged');
              }
            }
            if(row.totalPrice===null&&!row.priceUnknown){
              if(booking&&Number.isFinite(booking.totalPrice))entry.warnings.push('Missing spreadsheet price; existing price will be kept');
              else{entry.kind='review';entry.reason='Enter the missing booking price or exclude this row';}
            }
            if(row.guestCount===null)entry.warnings.push(booking?'Missing guest count; existing count will be kept':'Guest count is unknown');
          }
        }
        plan.rows.push(entry);
      }
    }
    for(const row of plan.rows)plan.counts[row.kind]++;
    plan.scope=[...new Set(plan.scope)];
    const unresolved=plan.errors.length||plan.counts.review;
    plan.canApply=!unresolved&&(plan.counts.add+plan.counts.update>0);
    const incomplete=plan.rows.some(e=>e.kind==='skip'&&!e.row.cancelledInSource);
    plan.canCancel=!!options.completeSnapshot&&!unresolved&&!incomplete;
    // Missing rows are only candidates. The apply step requires explicit selected IDs.
    plan.cancellations=bookings.filter(b=>plan.scope.includes(b.propId)&&b.status!=='cancelled'&&!matched.has(b.id));
    return plan;
  }
  function applyPlan(data,plan,options){
    options=options||{};
    if(fingerprint(data)!==plan.fingerprint)throw new Error('Bookings changed after the preview. Review the file again.');
    if(plan.errors.length||plan.counts.review)throw new Error('Resolve or exclude the rows requiring review first.');
    const cancelIds=options.cancelIds||[];
    if(cancelIds.length&&!plan.canCancel)throw new Error('Cancellations require a complete, valid snapshot with no excluded active rows.');
    if(cancelIds.some(id=>!plan.cancellations.some(b=>b.id===id)))throw new Error('Cancellation is outside the reviewed scope.');
    if(!plan.canApply&&!cancelIds.length)throw new Error('There are no changes to apply.');
    const next=clone(data),makeId=options.makeId||(()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8)),at=options.at||new Date().toISOString();
    const propIds={};
    for(const prop of plan.newProperties){
      if(!plan.rows.some(e=>e.propId===prop.temporaryId&&['add','update','unchanged'].includes(e.kind)))continue;
      const id=makeId();propIds[prop.temporaryId]=id;next.props.push({id,name:prop.name,notes:'',photos:[]});
    }
    const changed=[],cleaningReview=[];
    for(const entry of plan.rows){
      if(!['add','update'].includes(entry.kind))continue;
      const row=entry.row,propId=propIds[entry.propId]||entry.propId;
      let b=next.bookings.find(item=>item.id===entry.bookingId);
      if(!b){b={id:makeId(),propId,notes:'',linkedCleaningId:'',guestCount:null,totalPrice:null};next.bookings.push(b);}
      for(const field of ['checkIn','checkOut','guestName','platform','agencyName','guestCount','totalPrice'])if(row[field]!=null)b[field]=row[field];
      b.propId=propId;b.status=entry.status;
      if(b.status==='cancelled')b.cancelledAt=b.cancelledAt||at;
      b._excel={sourceKey:sourceKey(row,propId),reference:row.reference,sourceChannel:row.sourceChannel,sheet:row.sheet,row:row.row,fileName:options.fileName||'',importedAt:at,guestCountRaw:row.guestCountRaw,originalCheckIn:row.originalCheckIn,originalCheckOut:row.originalCheckOut,amountHeader:row.amountHeader,priceUnknown:b.totalPrice===null,cleaningNeedsReview:entry.warnings.some(w=>w.startsWith('Linked cleaning'))||!!(b._excel||{}).cleaningNeedsReview};
      changed.push({id:b.id,kind:entry.kind,fields:entry.changes});
      if(b._excel.cleaningNeedsReview)cleaningReview.push(b.id);
    }
    for(const id of cancelIds){
      const b=next.bookings.find(item=>item.id===id);b.status='cancelled';b.cancelledAt=at;
      if(b.linkedCleaningId){b._excel={...(b._excel||{}),cleaningNeedsReview:true};cleaningReview.push(id);}
      changed.push({id,kind:'cancel',fields:['status']});
    }
    next.importHistory=next.importHistory||[];
    next.importHistory.push({id:makeId(),source:'excel',year:plan.year,fileName:options.fileName||'',importedAt:at,counts:{add:plan.counts.add,update:plan.counts.update,cancel:cancelIds.length},changes:changed,cleaningReview:[...new Set(cleaningReview)]});
    if(options.supersededMigrationId){next._migrations=next._migrations||[];if(!next._migrations.includes(options.supersededMigrationId))next._migrations.push(options.supersededMigrationId);}
    return next;
  }
  root.SV_EXCEL=Object.freeze({parseWorkbook,planImport,applyPlan,propertyName,guests,validDate,fingerprint});
})(typeof window!=='undefined'?window:globalThis);
