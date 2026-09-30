// ── One-time booking migration from Excel RESERVES_updated_11_05_2026.xlsx ──
var BOOKING_MIGRATION_KEY='bk_excel_v6_strict_property_cleanup';
function runBookingMigration(){
  if(DEV_MODE)return;
  if((D._migrations||[]).indexOf(BOOKING_MIGRATION_KEY)>=0)return;
  // [propName,checkIn,checkOut,guestName,platform,agencyName,guestCount,totalPrice,notes]
  var EX=[["Villa Mar","2026-02-12","2026-02-21","Robert Rittger","agency","Homerti",19,3771.0,"Ref: 320108"],["Villa Mar","2026-02-21","2026-02-28","Peter Hanika","agency","Homerti",12,2933.0,"Ref: 254215"],["Villa Mar","2026-03-02","2026-03-08","Andreas Löwen","agency","Fora Vila",18,2514.0,"Ref: 120221"],["Villa Mar","2026-03-22","2026-03-29","Jens Balakin","agency","Homerti",18,2933.0,"Ref: 310073"],["Villa Mar","2026-04-02","2026-04-12","Quentin Kurc-Boucau","agency","Fora Vila",18,5470.0,"Ref: 120350"],["Villa Mar","2026-04-20","2026-04-26","Karina Martin","agency","Homerti",18,3474.0,"Ref: 309955"],["Villa Mar","2026-04-26","2026-04-30","Bianca Reichenecker","agency","Homerti",18,2895.0,"Ref: 319243"],["Villa Mar","2026-04-30","2026-05-07","Michal Kovaricek","agency","Inter-Home",12,4233.0,"Ref: 205926117212"],["Villa Mar","2026-05-08","2026-05-12","Richard Lieverst","agency","Homerti",16,3690.0,"Ref: 308078"],["Villa Mar","2026-05-15","2026-05-22","Corinna Helml","agency","Homerti",17,4305.0,"Ref: 255759"],["Villa Mar","2026-05-23","2026-05-29","Maire Ni Ghiobalain","agency","Homerti",16,3690.0,"Ref: 294543"],["Villa Mar","2026-05-29","2026-06-04","Axel Schurawlow","agency","Homerti",16,3840.0,"Ref: 315383"],["Villa Mar","2026-06-04","2026-06-08","Jessica Ventura","agency","Homerti",15,3870.0,"Ref: 297180"],["Villa Mar","2026-06-08","2026-06-14","Agné Bagdonaité","agency","Ca Teva",16,3870.0,""],["Villa Mar","2026-06-17","2026-06-22","Kerstin Ingenillen","agency","Homerti",14,4200.0,"Ref: 314686"],["Villa Mar","2026-06-23","2026-06-30","Sussane Lichtenberger","agency","Homerti",18,5285.0,"Ref: 314434"],["Villa Mar","2026-07-05","2026-07-12","Anna Youssefi","agency","Homerti",15,5349.0,"Ref: 304275"],["Villa Mar","2026-07-12","2026-07-19","Marian Sevka","agency","Homerti",17,5733.0,"Ref: 317921"],["Villa Mar","2026-07-19","2026-07-24","Javier Edgardo Fernandez Gonzalez","agency","Homerti",17,5733.0,"Ref: 310684"],["Villa Mar","2026-08-03","2026-08-10","Claudia Loibl","agency","Homerti",18,5733.0,"Ref: 311036"],["Villa Mar","2026-08-10","2026-08-14","Robert Riggins","agency","Homerti",10,5733.0,"Ref: 261103"],["Villa Mar","2026-08-14","2026-08-19","Elisa Regueira","booking","",12,13465.0,""],["Villa Mar","2026-08-20","2026-08-23","Madalina Raicu","airbnb","",16,5808.22,""],["Villa Mar","2026-08-23","2026-08-29","Anna Maria","airbnb","",17,8720.33,""],["Villa Mar","2026-09-03","2026-09-06","Willy Blank","booking","",12,6932.0,""],["Villa Mar","2026-09-07","2026-09-14","Alexandra Kreis","agency","Homerti",11,4515.0,"Ref: 318176"],["Villa Mar","2026-09-17","2026-09-20","Jeeta Patel","airbnb","",13,4549.3,""],["Villa Mar","2026-09-24","2026-09-27","Florian Bauer","airbnb","",16,3417.18,""],["Villa Mar","2026-09-30","2026-10-06","Hettie Jones-Chapman","agency","Homerti",1,3630.0,"Ref: 316605"],["Villa Mar","2026-10-07","2026-10-11","Tanja Kammler","booking","",12,5777.6,""],["Villa Mar","2026-10-19","2026-10-26","Thomas Langer","agency","Homerti",14,4165.0,"Ref: 319332"],["Villa Mar","2026-10-26","2026-11-01","Khiloni Westphely","agency","Homerti",12,4165.2,"Ref: 337390"],["Villa Mar","2026-11-01","2026-11-08","Campana Grazia","booking","",16,5712.0,""],["Villa Mar","2026-11-12","2026-11-20","Kathy Heitzig","agency","Homerti",18,3352.0,"Ref: 309502"],["Villa Mar","2026-11-21","2026-11-28","Carmen Wolf","agency","Homerti",16,2933.0,"Ref: 308124"],["Villa Marjals","2026-02-06","2026-02-12","Keneneth Nielsen","agency","Ca Teva",14,1794.0,""],["Villa Marjals","2026-02-21","2026-03-01","Thiel Fabio","agency","Fora Vila",8,2392.0,"Ref: 25-150397"],["Villa Marjals","2026-03-14","2026-03-20","Dieter Diehm","agency","Homerti",8,1794.0,"Ref: 312607"],["Villa Marjals","2026-03-20","2026-03-27","Tim Maihold","agency","Homerti",16,2093.0,"Ref: 317122"],["Villa Marjals","2026-04-04","2026-04-11","Julia Widmann","agency","Homerti",16,2443.0,"Ref: 274127"],["Villa Marjals","2026-04-13","2026-04-17","Bernadette Meslet","agency","Homerti",13,2094.0,"Ref: 310324"],["Villa Marjals","2026-04-17","2026-04-19","Pablo Salvadores","agency","Homerti",1,1745.0,"Ref: 311713"],["Villa Marjals","2026-04-20","2026-04-26","Philip Lamle","agency","Homerti",16,2094.0,"Ref: 294785"],["Villa Marjals","2026-04-26","2026-05-02","Sebastien Bernardi","agency","Ca Teva",15,2094.0,""],["Villa Marjals","2026-05-02","2026-05-04","Priya Patel","agency","Homerti",16,2370.0,"Ref: 315214"],["Villa Marjals","2026-05-07","2026-05-10","Juan","airbnb","",14,2062.61,""],["Villa Marjals","2026-05-10","2026-05-17","Frank Weiss","agency","Homerti",12,2765.0,"Ref: 281256"],["Villa Marjals","2026-05-17","2026-05-23","Thomas Lill","agency","Fora Vila",14,2370.0,"Ref: 119706"],["Villa Marjals","2026-05-23","2026-05-30","Katja Judith Manzei","agency","Homerti",15,2765.0,"Ref: 255231"],["Villa Marjals","2026-05-31","2026-06-07","Stefanie Müller","agency","Fora Vila",14,3003.0,"Ref: 118285"],["Villa Marjals","2026-06-20","2026-06-27","Marta Czerwinska","agency","Homerti",16,3675.0,"Ref: 318358"],["Villa Marjals","2026-06-27","2026-07-07","Andrea Babilon","agency","Homerti",16,5250.0,"Ref: 265179"],["Villa Marjals","2026-07-13","2026-08-03","Fiona Storey","agency","Homerti",14,12495.0,"Ref: 258261"],["Villa Marjals","2026-08-06","2026-08-18","Antonio Borza","agency","Homerti",13,7140.0,"Ref: 259519"],["Villa Marjals","2026-08-18","2026-08-27","André Bauer","agency","Homerti",14,5005.0,"Ref: 300423"],["Villa Marjals","2026-08-27","2026-09-01","Alison Turnbull","agency","Homerti",15,2625.0,"Ref: 321000"],["Villa Marjals","2026-09-01","2026-09-08","Thomas Kuschy","agency","Fora Vila",16,3387.0,"Ref: 119535"],["Villa Marjals","2026-09-09","2026-09-12","Katrin","airbnb","",14,3657.16,""],["Villa Marjals","2026-09-12","2026-09-19","John Nelson","agency","Ca Teva",13,3003.0,""],["Villa Marjals","2026-09-24","2026-09-29","Maira Patino","airbnb","",16,3864.44,""],["Villa Marjals","2026-10-03","2026-10-10","Chris Isbill","agency","Homerti",16,2583.0,"Ref: 298483"],["Villa Marjals","2026-10-10","2026-10-17","Heiko Heller","agency","Ca Teva",15,2583.0,""],["Villa Marjals","2026-10-22","2026-10-29","Chris Taylor","agency","Homerti",12,2583.0,"Ref: 280974"],["Villa Marjals","2026-11-01","2026-11-08","Angela Jokubaitiene","agency","Homerti",15,2093.0,"Ref: 319922"],["Villa Diagonal","2026-02-21","2026-03-01","Tracy Grotz","agency","Homerti",11,2152.0,"Ref: 310518"],["Villa Diagonal","2026-03-01","2026-03-09","Jannik Nareyka","agency","Homerti",10,2152.0,"Ref: 320211"],["Villa Diagonal","2026-03-13","2026-03-20","Josef Ricke","agency","Homerti",9,1883.0,"Ref: 265691"],["Villa Diagonal","2026-03-28","2026-04-07","Kai Christian","agency","Homerti",12,3852.0,"Ref: 274755"],["Villa Diagonal","2026-04-09","2026-04-12","Miro Roemer","airbnb","",12,2411.57,""],["Villa Diagonal","2026-04-12","2026-04-18","Carsten Bellin","agency","Homerti",9,2454.0,"Ref: 308726"],["Villa Diagonal","2026-04-19","2026-04-26","Careme Christel","agency","Homerti",11,2863.0,"Ref: 311560"],["Villa Diagonal","2026-04-27","2026-05-03","Diana Reick","agency","Homerti",13,2504.0,"Ref: 260425"],["Villa Diagonal","2026-05-03","2026-05-07","Shannon Cresham Fox","agency","Fora Vila",12,2754.0,"Ref: 119397"],["Villa Diagonal","2026-05-09","2026-05-16","Norman Nelson","agency","Homerti",13,3213.0,"Ref: 262608"],["Villa Diagonal","2026-05-16","2026-05-20","Alexander Rautzenberg","agency","Homerti",5,2295.0,"Ref: 320176"],["Villa Diagonal","2026-05-20","2026-05-31","Charlotte Crisfort","agency","Homerti",11,5109.0,"Ref: 207199"],["Villa Diagonal","2026-05-31","2026-06-06","Oliver Matthias Bäumer","agency","Homerti",12,3114.0,"Ref: 304271"],["Villa Diagonal","2026-06-06","2026-06-12","Christoph Matt","agency","Homerti",11,3114.0,"Ref: 261973"],["Villa Diagonal","2026-06-13","2026-06-20","Jarle Heron Tomter","agency","Inter-Home",11,3633.0,"Ref: 475126100031"],["Villa Diagonal","2026-06-20","2026-06-27","Joïrg Fenten","agency","Ca Teva",12,4445.0,""],["Villa Diagonal","2026-06-27","2026-07-04","Linda Odonovan","agency","Homerti",11,4445.0,"Ref: 296638"],["Villa Diagonal","2026-07-04","2026-07-16","Denny Steffan","agency","Homerti",11,7890.0,"Ref: 262792"],["Villa Diagonal","2026-07-17","2026-07-24","Stephanie Wilkins","agency","Fora Vila",12,4823.0,"Ref: 118963"],["Villa Diagonal","2026-07-25","2026-08-01","Steven Lewis","agency","Homerti",12,4823.0,"Ref: 254177"],["Villa Diagonal","2026-08-03","2026-08-10","Stuart Ratcliffe","agency","Homerti",12,4823.0,"Ref: 258376"],["Villa Diagonal","2026-08-10","2026-08-14","Annette Steenfat","agency","Homerti",11,4134.0,"Ref: 255401"],["Villa Diagonal","2026-08-16","2026-08-23","Charlie Younger","agency","Fora Vila",12,4823.0,"Ref: 119011"],["Villa Diagonal","2026-08-23","2026-08-28","Shelagh Coverdale","agency","Homerti",11,3714.0,"Ref: 264025"],["Villa Diagonal","2026-08-28","2026-09-03","Rikke Nock","agency","Homerti",11,3714.0,"Ref: 311196"],["Villa Diagonal","2026-09-03","2026-09-12","Thomas Maurer","agency","Homerti",9,4571.0,"Ref: 293174"],["Villa Diagonal","2026-09-12","2026-09-19","Oliver Schaefer","agency","Homerti",9,3633.0,"Ref: 273828"],["Villa Diagonal","2026-09-26","2026-10-03","Peter Westphal","agency","Homerti",8,3213.0,"Ref: 298346"],["Villa Diagonal","2026-10-03","2026-10-09","Sebastian Probst","airbnb","",6,4083.31,""],["Villa Diagonal","2026-10-09","2026-10-14","Ilka Wessel","agency","Homerti",12,2514.0,"Ref: 260650"],["Villa Diagonal","2026-10-15","2026-10-19","Frank Prange","agency","Homerti",12,2514.0,"Ref: 300499"],["Villa Diagonal","2026-10-19","2026-10-26","Katharina Albrecht","agency","Homerti",12,2933.0,"Ref: 309256"],["La Forca","2026-03-28","2026-04-01","Lucie","airbnb","",4,1994.47,""],["La Forca","2026-04-01","2026-04-08","Norbert Terboven","agency","Homerti",9,1999.0,"Ref: 274437"],["La Forca","2026-04-09","2026-04-16","Raul Stegelmayer","agency","Homerti",9,2086.0,"Ref: 320618"],["La Forca","2026-04-17","2026-04-27","Regina Loens","agency","Fora Vila",6,2980.0,"Ref: 119673"],["La Forca","2026-04-27","2026-05-04","Arno Kroese","agency","Homerti",10,2248.0,"Ref: 314690"],["La Forca","2026-05-08","2026-05-16","Patrick Grunau","agency","Homerti",8,3032.0,"Ref: 302630"],["La Forca","2026-05-21","2026-05-28","Vicky West","agency","Homerti",10,2653.0,"Ref: 295472"],["La Forca","2026-05-30","2026-06-06","Sharon Jones","agency","Homerti",9,3283.0,"Ref: 297243"],["La Forca","2026-06-06","2026-06-13","Uschi Magin","agency","Homerti",10,3283.0,"Ref: 266012"],["La Forca","2026-06-13","2026-06-19","Nadine Hausberger","agency","Inter-Home",9,2814.24,"Ref: 505926107504"],["La Forca","2026-06-19","2026-06-26","Rudolf Chairsell","agency","Homerti",10,3643.0,"Ref: 274593"],["La Forca","2026-07-03","2026-07-13","Dawn Alison Price","agency","Fora Vila",4,5470.0,"Ref: 119420"],["La Forca","2026-07-18","2026-08-01","Franz Peter Lonsdofer","agency","Inter-Home",10,8666.0,"Ref: 205726100710"],["La Forca","2026-08-04","2026-08-13","Steffen Seemann","agency","Fora Vila",9,5571.0,"Ref: 119944"],["La Forca","2026-08-15","2026-08-22","Jennifer Johns","agency","Homerti",10,4333.0,"Ref: 319534"],["La Forca","2026-08-22","2026-08-29","Tony Shevels","agency","Fora Vila",9,3633.0,"Ref: 120235"],["La Forca","2026-09-11","2026-09-16","Marcus Breuer","agency","Homerti",10,2754.0,"Ref: 315869"],["La Forca","2026-09-17","2026-09-22","John Hendrik Pruissen","agency","Homerti",10,2920.8,"Ref: 321365"],["La Forca","2026-10-03","2026-10-10","Stephan Siegfried","agency","Homerti",10,2653.0,"Ref: 267056"],["La Forca","2026-10-10","2026-10-17","Thys Enia","agency","Homerti",10,2653.0,"Ref: 240605"],["La Forca","2026-10-17","2026-10-24","Olivier Presson","agency","Ca Teva",10,2653.0,""]];
  // Explicit alias map — each Excel name maps to a fixed set of possible app names.
  // Sets are disjoint: 'Villa Mar' aliases never overlap 'Villa Marjals' aliases.
  var PROP_ALIASES={
    'Villa Mar':      ['villa mar','mar'],
    'Villa Marjals':  ['villa marjals','can marjals','marjals'],
    'Villa Diagonal': ['villa diagonal','diagonal'],
    'La Forca':       ['la forca','forca'],
    'Can Vallori':    ['can vallori','vallori']
  };
  function findPropId(excelName){
    var n=excelName.toLowerCase().trim();
    // Find which canonical Excel key this name belongs to
    var canonicalKey=null;
    for(var k in PROP_ALIASES){
      if(PROP_ALIASES[k].indexOf(n)>=0){canonicalKey=k;break;}
    }
    if(!canonicalKey)return null;
    // Find the app property whose name matches any alias in that canonical set
    var aliases=PROP_ALIASES[canonicalKey];
    var found=D.props.find(function(p){
      return aliases.indexOf(p.name.toLowerCase().trim())>=0;
    });
    return found?found.id:null;
  }
  // Step 1: collect propIds for all Excel properties via strict alias map
  var excelPropIds={};
  EX.forEach(function(r){var pid=findPropId(r[0]);if(pid)excelPropIds[pid]=true;});
  // Log which propIds we found
  console.log('[BK_V6] Excel propIds resolved:',Object.keys(excelPropIds));
  // Step 2: drop ALL confirmed bookings for those properties (wipes v22 fakes)
  var beforeCount=D.bookings.length;
  D.bookings=D.bookings.filter(function(b){
    if(!excelPropIds[b.propId])return true;  // not an Excel property — keep untouched
    return b.status==='cancelled';           // keep manually-cancelled; drop confirmed
  });
  console.log('[BK_V6] Dropped '+(beforeCount-D.bookings.length)+' confirmed bookings for Excel properties');
  // Step 3: re-insert all Excel bookings; skip exact duplicates already present
  var added=0,skipped=0;
  EX.forEach(function(r){
    var pid=findPropId(r[0]);
    if(!pid){console.warn('[BK_V6] no prop matched for Excel name:',r[0]);return;}
    // Dedup guard: skip if a booking with same propId+checkIn+checkOut+guestName exists
    var isDup=D.bookings.some(function(b){
      return b.propId===pid&&b.checkIn===r[1]&&b.checkOut===r[2]&&(b.guestName||'')===(r[3]||'');
    });
    if(isDup){skipped++;return;}
    D.bookings.push({id:uid(),propId:pid,checkIn:r[1],checkOut:r[2],
      guestName:r[3]||'',guestCount:r[6],totalPrice:r[7],
      platform:r[4],agencyName:r[5]||'',
      status:'confirmed',notes:r[8]||'',linkedCleaningId:''});
    added++;
  });
  // Step 4: validation console logs
  var byCounts={};
  D.bookings.filter(function(b){return b.status!=='cancelled';}).forEach(function(b){
    byCounts[b.propId]=(byCounts[b.propId]||0)+1;
  });
  console.log('[BK_V6] Active bookings per propId after migration:',JSON.stringify(byCounts));
  console.log('[BK_V6] Added:'+added+' skipped:'+skipped+' total D.bookings:'+D.bookings.length);
  if(!D._migrations)D._migrations=[];
  D._migrations.push(BOOKING_MIGRATION_KEY);
  // Step 5: save + immediate cloud push so corrected data beats stale cloud copy
  save();
  pushToCloud();
  setTimeout(function(){toast('Bookings v6: '+added+' bookings loaded');render();},400);
}

// ── One-time booking migration for 2027 bookings (RESERVES_2027.xlsx) ──
var BOOKING_2027_KEY='bk_excel_2027_v1';
function runBookingMigration2027(){
  if(DEV_MODE)return;
  if((D._migrations||[]).indexOf(BOOKING_2027_KEY)>=0)return;
  // [propName,checkIn,checkOut,guestName,platform,agencyName,guestCount,totalPrice,notes]
  var EX27=[
    ["Villa Mar","2027-04-10","2027-04-17","Niall Griffin","airbnb","",16,6504.59,""],
    ["Villa Mar","2027-06-24","2027-06-27","Mara Aparicio Blanch","booking","",15,7524.0,""],
    ["Villa Marjals","2027-03-21","2027-03-28","Karina Hümpfner-Bezold","airbnb","",16,5440.49,""],
    ["Villa Marjals","2027-04-15","2027-04-19","Katharina Weber","booking","",16,4360.0,""],
    ["Villa Marjals","2027-05-13","2027-05-16","Eleri Thomas","booking","",14,4402.4,""],
    ["Villa Marjals","2027-05-22","2027-05-29","Daniel Henschel","airbnb","",14,8092.9,""],
    ["Villa Diagonal","2027-05-29","2027-06-01","Patricia Watt","airbnb","",1,2178.75,""],
    ["La Forca","2027-06-03","2027-06-06","Fay Jones","airbnb","",10,2650.04,""]
  ];
  // Explicit alias map — same as 2026 migration, no fuzzy matching
  var PA27={
    'Villa Mar':      ['villa mar','mar'],
    'Villa Marjals':  ['villa marjals','can marjals','marjals'],
    'Villa Diagonal': ['villa diagonal','diagonal'],
    'La Forca':       ['la forca','forca'],
    'Can Vallori':    ['can vallori','vallori']
  };
  function findPropId27(excelName){
    var n=excelName.toLowerCase().trim();
    var canonicalKey=null;
    for(var k in PA27){if(PA27[k].indexOf(n)>=0){canonicalKey=k;break;}}
    if(!canonicalKey)return null;
    var aliases=PA27[canonicalKey];
    var found=D.props.find(function(p){return aliases.indexOf(p.name.toLowerCase().trim())>=0;});
    return found?found.id:null;
  }
  // Build set of Excel propIds for 2027 scope
  var propIds27={};
  EX27.forEach(function(r){var pid=findPropId27(r[0]);if(pid)propIds27[pid]=true;});
  // Build lookup key → Excel row for fast matching
  var excelMap={};
  EX27.forEach(function(r){
    var pid=findPropId27(r[0]);
    if(!pid){console.warn('[BK_2027] no prop for:',r[0]);return;}
    var key=pid+'|'+r[1]+'|'+r[2]+'|'+(r[3]||'');
    excelMap[key]=r;
  });
  // Reconcile: update matching existing 2027 bookings; cancel ones no longer in Excel
  var updated=0,cancelled=0;
  D.bookings.forEach(function(b){
    if(!b.checkIn||!b.checkIn.startsWith('2027'))return; // only 2027
    if(!propIds27[b.propId])return;                      // only Excel properties
    var key=b.propId+'|'+b.checkIn+'|'+b.checkOut+'|'+(b.guestName||'');
    if(excelMap[key]){
      var r=excelMap[key];
      b.status='confirmed';
      b.platform=r[4];b.agencyName=r[5]||'';
      b.guestCount=r[6];b.totalPrice=r[7];
      if(r[8])b.notes=r[8];
      delete excelMap[key]; // mark as handled
      updated++;
    } else if(b.status==='confirmed'){
      b.status='cancelled'; // no longer in Excel → cancel
      cancelled++;
    }
  });
  // Add remaining unmatched Excel rows as new bookings
  var added=0;
  for(var k in excelMap){
    var r=excelMap[k];
    var pid=findPropId27(r[0]);
    if(!pid)continue;
    D.bookings.push({id:uid(),propId:pid,checkIn:r[1],checkOut:r[2],
      guestName:r[3]||'',guestCount:r[6],totalPrice:r[7],
      platform:r[4],agencyName:r[5]||'',
      status:'confirmed',notes:r[8]||'',linkedCleaningId:''});
    added++;
  }
  // Validation logs
  var byCounts={};
  D.bookings.filter(function(b){return b.status!=='cancelled'&&b.checkIn&&b.checkIn.startsWith('2027');}).forEach(function(b){
    byCounts[b.propId]=(byCounts[b.propId]||0)+1;
  });
  console.log('[BK_2027] Active 2027 bookings per propId:',JSON.stringify(byCounts));
  console.log('[BK_2027] added:'+added+' updated:'+updated+' cancelled:'+cancelled);
  if(!D._migrations)D._migrations=[];
  D._migrations.push(BOOKING_2027_KEY);
  save();
  pushToCloud();
  setTimeout(function(){toast('2027 bookings: '+added+' added, '+updated+' updated, '+cancelled+' cancelled');render();},400);
}

