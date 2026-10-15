/* Read-only app tools. AI chooses a query; current records supply every fact and calculation.
   The catalog, booking amounts, notes, receipts, keys and photos are never model context. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SV_JARVIS_RECORDS=api;})(typeof window!=='undefined'?window:globalThis,function(){
  const ENTITIES=['bookings','cleanings','tasks','issues','properties'];
  const VIEWS=['list','details','price','payment','summary','availability','count'];
  const STATUSES=['active','all','cancelled','done','open','overdue','unassigned','needs_team','high','doing','waiting','inbox','today','scheduled','resolved'];
  const PAGE=8,copy=v=>v?JSON.parse(JSON.stringify(v)):null;
  const clean=(v,n=100)=>typeof v==='string'?v.slice(0,n):'';
  const norm=v=>String(v||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const has=(v,q)=>norm(q).split(' ').filter(Boolean).every(w=>(' '+norm(v)+' ').includes(' '+w+' '));
  const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const dated=v=>date(v)?new Date(v+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Date unknown';
  const cents=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))?Math.round(v*100):null;
  const money=v=>v===null?'Not recorded':new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR'}).format(v/100);
  const id=v=>typeof v==='string'&&v.length>0&&v.length<=100&&!/[\u0000-\u001f\u007f]/.test(v);
  function sanitizeQuery(q){
    if(!q||typeof q!=='object'||Array.isArray(q)||!ENTITIES.includes(q.entity))throw Error('Which app records would you like me to check?');
    const out={entity:q.entity,view:q.view===undefined?'list':q.view};if(!VIEWS.includes(out.view))throw Error('That record question is not supported.');
    if(['price','payment'].includes(out.view)&&out.entity!=='bookings'||out.view==='availability'&&!['bookings','properties'].includes(out.entity))throw Error('That question does not match this record type.');
    for(const [key,max] of [['guest',100],['property',80],['search',150],['recordId',100],['staff',80]])if(q[key]!==undefined&&q[key]!==null&&q[key]!==''){if(typeof q[key]!=='string'||q[key].length>max||!q[key].trim()||/[\u0000-\u001f\u007f]/.test(q[key]))throw Error('Please give a shorter record name.');out[key]=q[key].trim();}
    for(const key of ['start','end'])if(q[key]!==undefined&&q[key]!==null&&q[key]!==''){if(!date(q[key]))throw Error('Please give a valid date.');out[key]=q[key];}
    if(out.start&&out.end&&out.start>out.end)throw Error('The end date is before the start date.');
    if(q.status!==undefined){if(!STATUSES.includes(q.status))throw Error('That record status is not supported.');out.status=q.status;}
    if(q.dateBy!==undefined){if(!['stay','arrival','departure','due'].includes(q.dateBy))throw Error('That date filter is not supported.');out.dateBy=q.dateBy;}
    if(q.field!==undefined){if(!['arrival','departure','guests','crew','status','due','priority'].includes(q.field))throw Error('That record field is not supported.');out.field=q.field;}
    if(q.option!==undefined){if(!Number.isInteger(q.option)||q.option<1||q.option>PAGE)throw Error('Please choose a displayed option.');out.option=q.option;}
    if(q.offset!==undefined){if(!Number.isInteger(q.offset)||q.offset<0||q.offset>100000)throw Error('That page is not supported.');out.offset=q.offset;}
    return out;
  }
  function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
  function create({getData=()=>D,reference=()=>today(),required=prop=>typeof getRequiredCleanersForProperty==='function'?getRequiredCleanersForProperty(prop):1}={}){
    let last=null;
    const data=()=>{const d=getData()||{};return {props:d.props||[],bookings:d.bookings||[],sessions:d.sessions||[],tasks:d.tasks||[],issues:d.issues||[],cleaners:d.cleaners||[]};};
    const property=(d,pid)=>d.props.find(p=>p.id===pid)?.name||'General';
    const collection=(d,entity)=>d[({bookings:'bookings',cleanings:'sessions',tasks:'tasks',issues:'issues',properties:'props'})[entity]];
    const selector=(row)=>({entity:row.entity,id:row.id,label:row.title,property:row.property,date:row.date,end:row.end});
    function coverage(){const d=data(),dates=d.bookings.flatMap(b=>[b.checkIn,b.checkOut]).filter(date).sort();return {bookings:d.bookings.length,cleanings:d.sessions.length,tasks:d.tasks.length,issues:d.issues.length,properties:d.props.length,bookingStart:dates[0]||'',bookingEnd:dates.at(-1)||'',paymentReceiptsTracked:false};}
    function crew(d,s){
      const main=s.crew?(s.crew.main||[]):(s.cleanerIds||[]).map(cleanerId=>({cleanerId,status:'confirmed'}));
      const active=main.filter(m=>m.status!=='cancelled'),spots=s.crew?.alinaStatus!=='cancelled'?Math.max(0,Number(s.crew?.alinaSpots)||0):0;
      const confirmed=active.filter(m=>m.status==='confirmed').length+(s.crew?.alinaStatus==='confirmed'?spots:0);
      return {assigned:active.length+spots,confirmed,missing:Math.max(0,required(s.propId)-confirmed),names:active.map(m=>clean(d.cleaners.find(c=>c.id===m.cleanerId)?.name||m.name||'Former cleaner',80)+' ('+(m.status==='offered'?'awaiting confirmation':m.status||'status unknown')+')').concat(spots?[spots+' Alina team spot(s), '+(s.crew?.alinaStatus||'offered')]:[])};
    }
    function project(d,e,r){
      const base={entity:e,id:String(r.id),property:clean(property(d,r.propId),80),facts:[]};const fact=(label,value)=>({label,value:String(value)});
      if(e==='bookings'){
        const price=r._excel?.priceUnknown?null:cents(r.totalPrice),retained=cents(r.cancellationRevenue),s=d.sessions.find(s=>s.id===r.linkedCleaningId&&s.status!=='cancelled');
        return {...base,title:clean(r.guestName,100)||'Guest name missing',date:r.checkIn,end:r.checkOut,subtitle:base.property+' · '+dated(r.checkIn)+' – '+dated(r.checkOut),priceCents:price,status:r.status==='cancelled'?'cancelled':r.status||'active',facts:[fact('Booking price',money(price)),fact('Payment received','Not tracked — booking price is not a payment receipt'),fact('Arrival',dated(r.checkIn)+' · '+clean(r.checkInTime||'16:00',20)),fact('Departure',dated(r.checkOut)+' · '+clean(r.checkOutTime||'10:00',20)),fact('Guests',Number.isSafeInteger(r.guestCount)&&r.guestCount>0?r.guestCount:'Not recorded'),fact('Source',clean(r.agencyName||r.platform,80)||'Not recorded'),fact('Status',r.status||'Active'),...(r.status==='cancelled'?[fact('Cancellation money retained',money(retained))]:[]),fact('Linked cleaning',s?dated(s.date)+' · '+(crew(d,s).names.join(', ')||'No team assigned'):'No active linked cleaning')]};
      }
      if(e==='cleanings'){const team=crew(d,r);return {...base,title:base.property,date:r.date,status:r.status||'scheduled',subtitle:dated(r.date)+(r.time?' · '+clean(r.time,20):''),facts:[fact('Status',r.status||'Scheduled'),fact('Team',team.names.join(', ')||'No team assigned'),fact('Confirmed',team.confirmed),fact('Still needed',team.missing)],team};}
      if(e==='tasks')return {...base,title:clean(r.text,300)||'Untitled task',date:r.dueDate||'',status:r.done?'done':r.status||'inbox',subtitle:base.property+' · '+(r.dueDate?'Due '+dated(r.dueDate):'No due date'),facts:[fact('Status',r.done?'Done':r.status||'Inbox'),fact('Priority',r.priority||(r.urgent?'high':'medium')),fact('Due',r.dueDate?dated(r.dueDate):'Not set')]};
      if(e==='issues')return {...base,title:clean(r.title||r.text,300)||'Untitled issue',date:'',status:r.status||'open',subtitle:base.property,facts:[fact('Status',r.status||'Open'),fact('Priority',r.priority||'Not recorded')]};
      const active=d.bookings.filter(b=>b.propId===r.id&&b.status!=='cancelled'),next=active.filter(b=>date(b.checkIn)&&b.checkIn>=reference()).sort((a,b)=>a.checkIn.localeCompare(b.checkIn))[0];
      return {...base,property:clean(r.name,80),title:clean(r.name,80)||'Unnamed property',date:'',subtitle:'Property',facts:[fact('Active bookings in app',active.length),fact('Next recorded arrival',next?dated(next.checkIn):'None recorded'),fact('Open tasks',d.tasks.filter(t=>t.propId===r.id&&!t.done).length),fact('Open issues',d.issues.filter(i=>i.propId===r.id&&i.status==='open').length)]};
    }
    function save(q,rows,total,text,extra={}){const result={query:copy(q),entity:q.entity,title:q.entity[0].toUpperCase()+q.entity.slice(1),rows,total,offset:q.offset||0,more:Math.max(0,total-(q.offset||0)-rows.length),text,...extra};last=result;return copy(result);}
    function run(input){
      let q;try{q=sanitizeQuery(input);}catch(e){return {text:e.message,rows:[],total:0,title:'App records',entity:'bookings',error:true};}
      const d=data(),td=reference();
      if(q.option){const chosen=last?.entity===q.entity?last.rows[q.option-1]:null;if(!chosen)return {text:'Please choose an option from the displayed results.',rows:[],total:0,title:'Choose a record',entity:q.entity,error:true};q={entity:q.entity,view:q.view==='list'?'details':q.view,recordId:chosen.id,...(q.field?{field:q.field}:{})};}
      if(q.recordId==='selected'){if(!last||last.entity!==q.entity||last.rows.length!==1)return save(q,[],0,'Which record do you mean? Please name it or choose a displayed option.');q.recordId=last.rows[0].id;}
      let prop=null;if(q.property){const exact=d.props.filter(p=>norm(p.name)===norm(q.property)),matches=exact.length?exact:d.props.filter(p=>has(p.name,q.property));if(matches.length!==1)return save(q,[],0,matches.length?'More than one property matches. Which full property name do you mean?':'I cannot find a property named '+q.property+'. Please use its name from the app.');prop=matches[0];}
      if(q.view==='availability'){
        if(!q.start||!q.end||q.start>=q.end)return save(q,[],0,'What arrival and departure dates should I check?');
        q.entity='properties';const rows=(prop?[prop]:d.props).map(p=>{const active=d.bookings.filter(b=>b.propId===p.id&&b.status!=='cancelled'),incomplete=active.some(b=>!date(b.checkIn)||!date(b.checkOut)||b.checkIn>=b.checkOut),count=active.filter(b=>date(b.checkIn)&&date(b.checkOut)&&b.checkIn<q.end&&b.checkOut>q.start).length;return {entity:'properties',id:String(p.id),title:clean(p.name,80),property:clean(p.name,80),date:q.start,end:q.end,subtitle:incomplete?'Incomplete booking dates; availability unknown':count?count+' overlapping active booking(s)':'No overlapping active bookings',facts:[{label:'Scope',value:'Recorded bookings only; external calendars and owner blocks are not checked'}]};});
        const page=rows.slice(q.offset||0,(q.offset||0)+PAGE);return save(q,page,rows.length,'For '+dated(q.start)+' to '+dated(q.end)+': '+page.map(r=>r.title+', '+r.subtitle).join('. ')+'. This checks recorded bookings only; external calendars and owner blocks are not checked.');
      }
      let all=collection(d,q.entity).filter(r=>!prop||(q.entity==='properties'?r.id===prop.id:r.propId===prop.id));
      if(q.recordId){if(!id(q.recordId))return save(q,[],0,'That record reference is not valid.');all=all.filter(r=>String(r.id)===q.recordId);}
      if(q.guest){if(q.entity!=='bookings')return save(q,[],0,'Guest searches apply to bookings.');all=all.filter(b=>has(b.guestName,q.guest));}
      if(q.search)all=all.filter(r=>has([r.guestName,r.text,r.title,q.entity==='properties'?r.name:''].filter(Boolean).join(' '),q.search));
      const status=q.status||(q.recordId||q.entity==='bookings'&&q.guest?'all':['bookings','cleanings'].includes(q.entity)?'active':['tasks','issues'].includes(q.entity)?'open':'all');
      all=all.filter(r=>{
        if(status==='all')return true;
        if(q.entity==='bookings')return status==='cancelled'?r.status==='cancelled':r.status!=='cancelled';
        if(q.entity==='cleanings'){if(status==='unassigned')return r.status!=='done'&&r.status!=='cancelled'&&crew(d,r).assigned===0;if(status==='needs_team')return r.status!=='done'&&r.status!=='cancelled'&&crew(d,r).missing>0;return status==='active'?r.status!=='cancelled':r.status===status;}
        if(q.entity==='tasks'){if(status==='done')return !!r.done;if(r.done)return false;if(status==='overdue')return date(r.dueDate)&&r.dueDate<td;if(status==='high')return r.priority==='high'||r.urgent===true;return ['open','active'].includes(status)?true:r.status===status;}
        return q.entity==='issues'?r.status===status:true;
      });
      if(q.staff&&q.entity==='cleanings')all=all.filter(r=>crew(d,r).names.some(n=>has(n,q.staff)));
      if(q.start||q.end)all=all.filter(r=>{
        const within=v=>date(v)&&(!q.start||v>=q.start)&&(!q.end||v<=q.end);
        if(q.entity==='bookings'){if(q.dateBy==='arrival')return within(r.checkIn);if(q.dateBy==='departure')return within(r.checkOut);return date(r.checkIn)&&date(r.checkOut)&&(!q.start||r.checkOut>q.start)&&(!q.end||r.checkIn<=q.end);}
        return within(q.entity==='tasks'?r.dueDate:r.date);
      });
      all.sort((a,b)=>String(a.checkIn||a.date||a.dueDate||'9999').localeCompare(String(b.checkIn||b.date||b.dueDate||'9999'))||String(a.time||'99:99').padStart(5,'0').localeCompare(String(b.time||'99:99').padStart(5,'0'))||String(a.id).localeCompare(String(b.id)));
      let suggestions=false;
      if(!all.length&&q.guest&&!q.recordId&&!d.bookings.some(b=>has(b.guestName,q.guest))&&norm(q.guest).length>=4){const needle=norm(q.guest);all=d.bookings.map(b=>({b,score:1-distance(norm(b.guestName).slice(0,100),needle)/Math.max(norm(b.guestName).length,needle.length)})).filter(x=>x.score>=.65).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.b);suggestions=!!all.length;}
      const offset=q.offset||0,rows=all.slice(offset,offset+PAGE).map(r=>project(d,q.entity,r));
      if(!rows.length)return save(q,[],all.length,all.length?'There are no more results on this page.':'I found no matching '+q.entity+' in the current app data. Try a full name, property or different dates.');
      const choices=suggestions||rows.length>1&&['payment','price','details'].includes(q.view);
      if(choices)return save(q,rows,all.length,(suggestions?'I did not find an exact guest match. Did you mean one of these? ':'I found '+all.length+' matching '+q.entity+'. Which one do you mean? ')+rows.map((r,i)=>'Option '+(i+1)+': '+r.title+', '+r.subtitle).join('. '),{choices:true});
      let text;
      if(q.view==='count')text='There are '+all.length+' matching '+q.entity+' in the current app data.';
      else if(q.entity==='bookings'&&['price','payment'].includes(q.view)){
        const r=rows[0];text='For '+r.title+' at '+r.property+', '+dated(r.date)+' to '+dated(r.end)+', '+(r.priceCents===null?'the booking price is not recorded.':'the recorded booking price is '+money(r.priceCents)+'.');
        if(q.view==='payment')text+=' I cannot confirm how much was actually paid because payment receipts are not tracked in this app.';
        if(r.status==='cancelled')text+=' This booking is cancelled. '+r.facts.find(f=>f.label==='Cancellation money retained').label+': '+r.facts.find(f=>f.label==='Cancellation money retained').value+'.';
      }else if(q.view==='details'){
        const label={arrival:'Arrival',departure:'Departure',guests:'Guests',crew:q.entity==='bookings'?'Linked cleaning':'Team',status:'Status',due:'Due',priority:'Priority'}[q.field];
        const facts=q.field?rows[0].facts.filter(f=>f.label===label):rows[0].facts;
        text=rows[0].title+', '+(q.field?rows[0].property:rows[0].subtitle)+'. '+(facts.length?facts.map(f=>f.label+': '+f.value).join('. ')+'.':'That detail is not recorded for this type of record.');
      }
      else if(q.entity==='bookings'&&q.view==='summary'){
        const projected=all.map(b=>({status:b.status,priceCents:b._excel?.priceUnknown?null:cents(b.totalPrice)})),priced=projected.filter(r=>r.status!=='cancelled'&&r.priceCents!==null),total=priced.reduce((n,r)=>n+r.priceCents,0),unknown=projected.filter(r=>r.status!=='cancelled'&&r.priceCents===null).length;
        text='There are '+all.length+' matching bookings in the app. The sum of recorded full prices for '+priced.length+' active bookings is '+money(Number.isSafeInteger(total)?total:null)+'. '+unknown+' active booking(s) have an unknown price. This is booked value, not payment receipts; cancelled bookings are excluded from that amount.';
      }else text='I found '+all.length+' matching '+q.entity+' in the current app data. '+rows.slice(0,3).map((r,i)=>'Option '+(i+1)+': '+r.title+', '+r.subtitle+(q.entity==='cleanings'?'. '+r.facts.map(f=>f.label+': '+f.value).join('. '):q.entity==='tasks'?'. '+r.facts.filter(f=>f.label!=='Due').map(f=>f.label+': '+f.value).join('. '):'')).join('. ')+'.'+(rows.length>3?' There are '+rows.length+' results on this page. Say an option number for details.':'')+(all.length>offset+PAGE?' Say “show more” for the next page.':'');
      return save(q,rows,all.length,text);
    }
    return {run,coverage,reset(){last=null;},current:()=>copy(last),context:()=>last?{query:copy(last.query),selected:last.rows.length===1?selector(last.rows[0]):null,choices:last.rows.map(selector),total:last.total,offset:last.offset}:null};
  }
  return Object.freeze({create,sanitizeQuery});
});
