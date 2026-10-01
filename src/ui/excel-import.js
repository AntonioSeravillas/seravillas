/* Manager-facing workbook selection and review. Files stay in this browser. */
let excelImportState=null;

function openExcelImport(){
  excelImportState={year:2026,parsed:null,fileName:'',mappings:{},overrides:{},decisions:{},statusDecisions:{},cancelIds:[],pendingCancelIds:null,completeSnapshot:false,fixYear:false,filter:'review',error:'',plan:null};
  renderExcelImport();
}

function renderExcelImport(){
  const state=excelImportState;if(!state)return;
  state.pendingCancelIds=null;
  let h='<div class="modal-title">Import bookings from Excel</div>'
    +'<p class="ei-help">Review the workbook before applying changes. Import year: <strong>'+state.year+'</strong>. Existing notes, booking IDs and cleaning assignments are kept.</p>'
    +'<div class="field"><label for="excel-import-year">Import year</label><select id="excel-import-year" onchange="setExcelImportYear(this.value)">'+SV_EXCEL.supportedYears.map(year=>'<option value="'+year+'"'+(year===state.year?' selected':'')+'>'+year+'</option>').join('')+'</select></div>'
    +(DEV_MODE?'<p class="ei-notice">Local preview: changes stay in preview storage. Cloud sync is disabled.</p>':'')
    +'<div class="field"><label for="excel-booking-file">Choose your RESERVES workbook</label><input id="excel-booking-file" type="file" accept=".xlsx"'+(state.parsed?' style="display:none"':'')+' onchange="readExcelBookingFile(event)">'+(state.parsed?'<button class="btn btn-sm" onclick="document.getElementById(\'excel-booking-file\').click()">Choose another workbook</button>':'')+'</div>';
  if(state.error)h+='<p class="ei-error">'+esc(state.error)+'</p>';
  if(state.parsed){
    state.plan=SV_EXCEL.planImport(state.parsed,D,state);
    const plan=state.plan;
    h+='<p class="ei-help">'+esc(state.fileName)+' · '+state.parsed.rows.length+' booking rows · '+state.parsed.sheets.length+' villa sheets</p>'
      +'<h3 class="ei-heading">Match the villas</h3>';
    for(const sheet of state.parsed.sheets){
      const automatic=D.props.filter(p=>SV_EXCEL.propertyName(p.name)===sheet.property);
      const selected=state.mappings[sheet.name]!==undefined?state.mappings[sheet.name]:(automatic.length===1?automatic[0].id:'');
      h+='<div class="field"><label>'+esc(sheet.name)+' ('+sheet.count+')</label><select data-sheet="'+esc(sheet.name)+'" onchange="setExcelMapping(this.dataset.sheet,this.value)">'
        +'<option value="">Choose a villa…</option>'
        +D.props.map(p=>'<option value="'+esc(p.id)+'"'+(selected===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')
        +(!automatic.length?'<option value="@create"'+(selected==='@create'?' selected':'')+'>Create '+esc(sheet.property)+'</option>':'')+'</select></div>';
    }
    const previousYear=state.year-1;
    const oldYear=state.parsed.rows.filter(r=>r.originalCheckIn.startsWith(previousYear+'-')&&r.originalCheckOut.startsWith(previousYear+'-'));
    if(oldYear.length)h+='<label class="ei-check"><input type="checkbox" id="excel-fix-year"'+(state.fixYear?' checked':'')+' onchange="setExcelYearCorrection(this.checked)"><span>Use '+state.year+' for the '+oldYear.length+' stays dated '+previousYear+'. Their original dates remain recorded.</span></label>'
      +'<p class="ei-help">'+oldYear.map(r=>esc(r.sheet)+' row '+r.row+': '+esc(r.originalCheckIn)+' → '+esc(r.originalCheckOut)).join('<br>')+'</p>';
    h+='<div class="ei-counts">'+[['New',plan.counts.add],['Updates',plan.counts.update],['Unchanged',plan.counts.unchanged],['Review',plan.counts.review],['Excluded',plan.counts.skip]].map(([label,n])=>'<div><strong>'+n+'</strong><span>'+label+'</span></div>').join('')+'</div>';
    if(plan.errors.length)h+='<p class="ei-error">'+plan.errors.map(esc).join('<br>')+'</p>';
    h+='<div class="ei-toolbar"><button class="btn btn-sm" onclick="setExcelFilter(\'review\')">Needs attention</button><button class="btn btn-sm" onclick="setExcelFilter(\'all\')">All bookings</button></div>';
    const entries=plan.rows.filter(e=>state.filter==='all'||e.kind==='review'||e.kind==='skip'||e.warnings.length||e.row.originalPriceMissing||e.row.cancelledInSource);
    if(!entries.length)h+='<p class="ei-help">No rows need attention. Open All bookings to inspect the changes.</p>';
    h+='<div class="ei-rows">'+entries.map(renderExcelImportRow).join('')+'</div>'
      +'<label class="ei-check"><input type="checkbox" id="excel-complete-snapshot"'+(state.completeSnapshot?' checked':'')+' onchange="setExcelCompleteSnapshot(this.checked)"><span>This file contains all '+state.year+' bookings for the matched villas.</span></label>';
    if(plan.cancellations.length){
      h+='<h3 class="ei-heading">Bookings missing from this workbook ('+plan.cancellations.length+')</h3>'
        +'<p class="ei-help">Select cancellations individually. Cancelled history and linked cleanings will be kept.</p>';
      if(!plan.canCancel)h+='<p class="ei-notice">Cancellation selection is available after confirming a complete snapshot and resolving every review row. Excluding an active row makes the snapshot incomplete.</p>';
      h+=plan.cancellations.map(b=>'<label class="ei-check"><input type="checkbox" data-excel-cancel="'+esc(b.id)+'"'+(state.cancelIds.includes(b.id)?' checked':'')+(!plan.canCancel?' disabled':'')+' onchange="setExcelCancellation(this.dataset.excelCancel,this.checked)"><span>'+esc(propName(b.propId))+' · '+esc(b.guestName)+' · '+esc(b.checkIn)+' → '+esc(b.checkOut)+(b.linkedCleaningId?'<br>Linked cleaning needs review if cancelled.':'')+'</span></label>').join('');
    }
    h+='<p class="ei-help">A pre-import backup is saved before applying. Missing guest counts stay unknown. Missing prices must be entered or explicitly marked unknown.</p>'
      +'<button id="excel-apply" class="btn btn-primary" style="width:100%" onclick="applyExcelBookingImport()"'+(!plan.canApply&&!(plan.canCancel&&plan.cancellations.length)?' disabled':'')+'>Apply reviewed changes'+(DEV_MODE?' to preview':'')+'</button>';
  }
  h+='<button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="closeModal()">Close</button>';
  showModal('<div class="excel-import">'+h+'</div>');
}

function renderExcelImportRow(entry){
  const r=entry.row,state=excelImportState,labels={add:'New',update:'Update',unchanged:'Unchanged',review:'Review',skip:'Excluded'};
  let h='<details class="ei-row"'+(entry.kind==='review'||r.originalPriceMissing?' open':'')+'><summary><strong>'+labels[entry.kind]+' · '+esc(r.property)+'</strong><span>'+esc(r.guestName||'Guest name missing')+' · '+esc(r.checkIn)+' → '+esc(r.checkOut)+'</span></summary>'
    +'<div class="ei-row-body"><p class="ei-help">'+esc(r.sheet)+' row '+r.row+' · '+esc(r.sourceChannel)+' · Ref: '+esc(r.reference||'none')+'<br>Guests: '+esc(r.guestCountRaw||'unknown')+' · Price: '+(r.totalPrice===null?'unknown':'€'+r.totalPrice.toFixed(2))+'</p>';
  if(entry.reason)h+='<p class="ei-'+(entry.kind==='review'?'error':'help')+'">'+esc(entry.reason)+'</p>';
  if(entry.changes.length)h+='<p class="ei-help">Changes: '+entry.changes.map(esc).join(', ')+'</p>';
  if(entry.warnings.length)h+='<p class="ei-notice">'+entry.warnings.map(esc).join('<br>')+'</p>';
  h+='<div class="field"><label>Arrival and departure</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input type="date" aria-label="Arrival for '+esc(r.guestName||r.key)+'" data-excel-date="arrival" value="'+esc(r.checkIn)+'"><input type="date" aria-label="Departure for '+esc(r.guestName||r.key)+'" data-excel-date="departure" value="'+esc(r.checkOut)+'"></div><button class="btn btn-sm" style="margin-top:8px" data-excel-dates="'+esc(r.key)+'" onclick="setExcelDates(this.dataset.excelDates,this.parentElement.querySelector(\'[data-excel-date=arrival]\').value,this.parentElement.querySelector(\'[data-excel-date=departure]\').value)">Use these dates</button></div>';
  if(SV_EXCEL.validDate(r.checkIn)&&SV_EXCEL.validDate(r.checkOut)&&r.checkOut>r.checkIn&&SV_EXCEL.datesDisagreeWithNights(r))h+='<label class="ei-check"><input type="checkbox" data-excel-date-approval="'+esc(r.key)+'"'+(r.dateMismatchApproved?' checked':'')+' onchange="setExcelDateApproval(this.dataset.excelDateApproval,this.checked)"><span>I checked the dates: keep '+SV_EXCEL.dateNights(r)+' nights instead of the workbook’s '+r.sourceNights+'.</span></label>';
  if(r.cancelledInSource)h+='<div class="field"><label>Workbook cancellation marker</label><select data-excel-status="'+esc(r.key)+'" onchange="setExcelSourceStatus(this.dataset.excelStatus,this.value)"><option value="">Confirm status…</option><option value="cancelled"'+(state.statusDecisions[r.key]==='cancelled'?' selected':'')+'>Keep as cancelled history</option><option value="active"'+(state.statusDecisions[r.key]==='active'?' selected':'')+'>Treat as active booking</option></select></div>';
  if(r.originalPriceMissing){
    h+='<div class="field"><label>Booking price (€)</label><input type="number" step="0.01" data-key="'+esc(r.key)+'" value="'+(r.totalPrice===null?'':r.totalPrice)+'" placeholder="Enter when known"><button class="btn btn-sm" style="margin-top:8px" data-excel-price="'+esc(r.key)+'" onclick="setExcelPrice(this.dataset.excelPrice,this.parentElement.querySelector(\'input\').value)">Use this price</button></div>';
    if(r.totalPrice===null)h+='<label class="ei-check"><input type="checkbox" data-key="'+esc(r.key)+'"'+(r.priceUnknown?' checked':'')+' onchange="setExcelUnknownPrice(this.dataset.key,this.checked)"><span>Price is unknown. Keep it explicitly unknown.</span></label>';
  }
  h+='<div class="field"><label>Match / exclude this row</label><select data-key="'+esc(r.key)+'" onchange="setExcelDecision(this.dataset.key,this.value)">'
    +'<option value="">'+(entry.kind==='review'?'Choose how to handle this row…':'Use the suggested match')+'</option>'
    +entry.candidates.map(b=>'<option value="match:'+esc(b.id)+'"'+(state.decisions[r.key]==='match:'+b.id?' selected':'')+'>Match '+esc(b.guestName)+' · '+esc(b.checkIn)+' → '+esc(b.checkOut)+(b.status==='cancelled'?' (reactivate)':'')+'</option>').join('')
    +(entry.candidates.length?'<option value="new"'+(state.decisions[r.key]==='new'?' selected':'')+'>Add as a separate booking</option>':'')
    +'<option value="skip"'+(state.decisions[r.key]==='skip'?' selected':'')+'>Exclude this row</option></select></div></div></details>';
  return h;
}

async function readExcelBookingFile(event){
  const file=event.target.files[0],state=excelImportState;if(!file||!state)return;
  try{
    if(!/\.xlsx$/i.test(file.name))throw new Error('Choose an .xlsx workbook.');
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellNF:true,cellText:true});
    if(excelImportState!==state)return;
    state.parsed=SV_EXCEL.parseWorkbook(book);state.fileName=file.name;state.error='';
    state.year=SV_EXCEL.suggestYear(state.parsed,state.year);
    state.mappings={};state.overrides={};state.decisions={};state.statusDecisions={};state.cancelIds=[];state.pendingCancelIds=null;state.fixYear=false;state.completeSnapshot=false;
    if(!state.parsed.rows.length)throw new Error('No booking rows were found. Check the RESERVES column headings.');
  }catch(error){state.error=error.message;state.parsed=null;}
  renderExcelImport();
}
function setExcelImportYear(value){
  const state=excelImportState,year=Number(value);if(!state||!SV_EXCEL.supportedYears.includes(year)||state.year===year)return;
  state.year=year;
  // Review decisions belong to one year. Preserve villa mappings, then rebuild the review.
  state.overrides={};state.decisions={};state.statusDecisions={};state.cancelIds=[];state.pendingCancelIds=null;state.fixYear=false;state.completeSnapshot=false;
  renderExcelImport();
}
function setExcelMapping(sheet,value){excelImportState.mappings[sheet]=value;renderExcelImport();}
function setExcelFilter(value){excelImportState.filter=value;renderExcelImport();}
function setExcelDecision(key,value){excelImportState.decisions[key]=value;renderExcelImport();}
function setExcelSourceStatus(key,value){excelImportState.statusDecisions[key]=value;renderExcelImport();}
function setExcelCompleteSnapshot(value){excelImportState.completeSnapshot=value;renderExcelImport();}
function setExcelCancellation(id,checked){
  const state=excelImportState;if(!state)return;
  state.cancelIds=state.cancelIds.filter(value=>value!==id);
  if(checked)state.cancelIds.push(id);
}
function setExcelYearCorrection(value){
  const state=excelImportState;state.fixYear=value;
  for(const row of state.parsed.rows){
    const previousYear=state.year-1;
    if(!row.originalCheckIn.startsWith(previousYear+'-')||!row.originalCheckOut.startsWith(previousYear+'-'))continue;
    state.overrides[row.key]={...(state.overrides[row.key]||{}),checkIn:value?String(state.year)+row.originalCheckIn.slice(4):row.originalCheckIn,checkOut:value?String(state.year)+row.originalCheckOut.slice(4):row.originalCheckOut,dateMismatchApproved:false};
  }
  renderExcelImport();
}
function setExcelDates(key,checkIn,checkOut){
  const state=excelImportState;if(!state)return;
  if(!SV_EXCEL.validDate(checkIn)||!SV_EXCEL.validDate(checkOut)||checkOut<=checkIn){state.error='Check-out must be after a valid check-in date.';renderExcelImport();return;}
  state.error='';state.overrides[key]={...(state.overrides[key]||{}),checkIn,checkOut,dateMismatchApproved:false};
  renderExcelImport();
}
function setExcelDateApproval(key,value){excelImportState.overrides[key]={...(excelImportState.overrides[key]||{}),dateMismatchApproved:value};renderExcelImport();}
function setExcelPrice(key,value){
  const number=value.trim()===''?null:Number(value);
  excelImportState.overrides[key]={...(excelImportState.overrides[key]||{}),totalPrice:Number.isFinite(number)?number:null,priceUnknown:false};
  renderExcelImport();
}
function setExcelUnknownPrice(key,value){excelImportState.overrides[key]={...(excelImportState.overrides[key]||{}),priceUnknown:value};renderExcelImport();}

function applyExcelBookingImport(confirmed){
  const state=excelImportState;if(!state||!state.plan)return;
  const cancelIds=confirmed===true?state.pendingCancelIds:Array.from(document.querySelectorAll('[data-excel-cancel]:checked')).map(el=>el.dataset.excelCancel);
  if(!Array.isArray(cancelIds))return;
  if(cancelIds.length&&confirmed!==true){
    state.cancelIds=cancelIds.slice();state.pendingCancelIds=cancelIds.slice();
    const selected=state.plan.cancellations.filter(b=>cancelIds.includes(b.id));
    showModal('<div class="modal-title">Confirm booking cancellations</div><p>This import will add '+state.plan.counts.add+' bookings, update '+state.plan.counts.update+' and cancel '+cancelIds.length+'.</p>'
      +'<p class="ei-help">Cancelled history and linked cleaning sessions will be kept.</p><ul>'+selected.map(b=>'<li>'+esc(propName(b.propId))+' · '+esc(b.guestName)+' · '+esc(b.checkIn)+' → '+esc(b.checkOut)+'</li>').join('')+'</ul>'
      +'<button class="btn btn-primary" style="width:100%" onclick="applyExcelBookingImport(true)">Confirm and apply'+(DEV_MODE?' to preview':'')+'</button>'
      +'<button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="renderExcelImport()">Back to review</button>');
    return;
  }
  try{
    const next=SV_EXCEL.applyPlan(D,state.plan,{cancelIds,fileName:state.fileName,makeId:uid,supersededMigrationId:state.year===2027?BOOKING_2027_KEY:BOOKING_MIGRATION_KEY});
    next._savedAt=Date.now();
    // Persist both copies before replacing in-memory data or scheduling any sync.
    const backupKey=DB+'_beforeExcelImport',previousBackup=SV_STORAGE.getItem(backupKey);
    try{
      SV_STORAGE.setItem(backupKey,JSON.stringify(D));
      SV_STORAGE.setItem(DB,JSON.stringify(next));
    }catch(error){
      try{if(previousBackup===null)SV_STORAGE.removeItem(backupKey);else SV_STORAGE.setItem(backupKey,previousBackup);}catch(backupError){}
      throw error;
    }
    D=next;save();render();
    const last=D.importHistory[D.importHistory.length-1],counts=last.counts;
    showModal('<div class="modal-title">Import completed'+(DEV_MODE?' in preview':'')+'</div><p>'+last.year+' · '+counts.add+' added · '+counts.update+' updated · '+counts.cancel+' cancelled.</p>'
      +(last.cleaningReview.length?'<p class="ei-notice">'+last.cleaningReview.length+' linked cleaning sessions need review. Their dates and assignments were preserved.</p>':'')
      +'<p class="ei-help">A backup of the data before this import is available under Properties → Data & Backup.</p><button class="btn btn-primary" style="width:100%" onclick="closeModal()">Done</button>');
    excelImportState=null;
  }catch(error){state.error=error.message;renderExcelImport();}
}

function restoreBeforeExcelImport(){
  const saved=SV_STORAGE.getItem(DB+'_beforeExcelImport');
  if(!saved){toast('No pre-import backup available');return;}
  if(!confirm('Restore all app data from before the last Excel import? Later edits will be replaced.'))return;
  try{
    const next=JSON.parse(saved);next._savedAt=Date.now();
    // Keep completed historical migration markers so a rollback cannot restart old imports.
    next._migrations=[...new Set([...(next._migrations||[]),...(D._migrations||[])])];
    SV_STORAGE.setItem(DB,JSON.stringify(next));D=next;save();render();toast('Pre-import data restored');
  }catch(error){toast('Could not restore the pre-import backup');}
}
