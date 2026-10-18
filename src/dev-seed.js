/* Fictional sample data for the development preview (classic script).
   svDevSeedData() returns a fresh data object; app.js stores it in development
   storage only, and only when that storage is empty. */
function svDevSeedData(){
  function pad(n){return String(n).padStart(2,'0');}
  function day(n){
    var d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }
  var t=day(0);
  var props=[
    {id:'dev-p1',name:'Villa Demo Uno',notes:'Sample property — pool and garden.',photos:[]},
    {id:'dev-p2',name:'Casa Ejemplo',notes:'Sample property — key in lockbox.',photos:[]},
    {id:'dev-p3',name:'Finca Prueba',notes:'Sample property.',photos:[]}
  ];
  var cleaners=[
    {id:'dev-c1',name:'Sample Cleaner A',phone:'+34 600 000 001'},
    {id:'dev-c2',name:'Sample Cleaner B',phone:'+34 600 000 002'}
  ];
  var bookings=[
    {id:'dev-b1',propId:'dev-p1',platform:'airbnb',agencyName:'',checkIn:day(-5),checkOut:day(-1),guestName:'Sample Guest One',guestCount:6,totalPrice:1800,notes:'',status:'confirmed',linkedCleaningId:'dev-s1'},
    {id:'dev-b2',propId:'dev-p1',platform:'booking',agencyName:'',checkIn:day(0),checkOut:day(5),guestName:'Sample Guest Two',guestCount:8,totalPrice:2400,notes:'Arrives late',status:'confirmed',linkedCleaningId:'dev-s2'},
    {id:'dev-b3',propId:'dev-p2',platform:'agency',agencyName:'Sample Agency',checkIn:day(2),checkOut:day(9),guestName:'Sample Guest Three',guestCount:10,totalPrice:3900,notes:'',status:'confirmed',linkedCleaningId:'dev-s3'},
    {id:'dev-b4',propId:'dev-p3',platform:'airbnb',agencyName:'',checkIn:day(-2),checkOut:day(3),guestName:'Sample Guest Four',guestCount:4,totalPrice:1500,notes:'',status:'confirmed',linkedCleaningId:'dev-s4'},
    {id:'dev-b5',propId:'dev-p1',platform:'airbnb',agencyName:'',checkIn:day(8),checkOut:day(14),guestName:'Sample Guest Five',guestCount:7,totalPrice:2700,notes:'',status:'confirmed',linkedCleaningId:'dev-s5'},
    {id:'dev-b6',propId:'dev-p3',platform:'booking',agencyName:'',checkIn:day(6),checkOut:day(10),guestName:'Sample Guest Six',guestCount:5,totalPrice:1300,notes:'',status:'confirmed',linkedCleaningId:''}
  ];
  var sessions=[
    {id:'dev-s1',propId:'dev-p1',date:day(-1),time:'',cleanerIds:['dev-c1'],status:'done',note:'Checkout cleaning'},
    {id:'dev-s2',propId:'dev-p1',date:day(5),time:'',cleanerIds:['dev-c1','dev-c2'],status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s3',propId:'dev-p2',date:day(9),time:'10:00',cleanerIds:['dev-c2'],status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s4',propId:'dev-p3',date:day(3),time:'',cleanerIds:['dev-c1'],status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s5',propId:'dev-p1',date:day(14),time:'',cleanerIds:[],status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s6',propId:'dev-p2',date:day(1),time:'09:00',cleanerIds:['dev-c2'],status:'scheduled',note:'Mid-stay refresh'}
  ];
  function task(id,text,o){
    var r={id:id,text:text,propId:'',priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:t,status:'inbox',type:'ops',projectId:'',waitingFor:''};
    for(var k in o)r[k]=o[k];return r;
  }
  var tasks=[
    task('dev-t1','Restock towels (sample task)',{propId:'dev-p1',status:'today',dueDate:t,priority:'high',urgent:true}),
    task('dev-t2','Check pool pump (sample task)',{propId:'dev-p2',status:'today',dueDate:t}),
    task('dev-t3','Order new welcome baskets (sample task)',{status:'inbox'}),
    task('dev-t4','Call sample plumber',{propId:'dev-p3',status:'waiting',waitingFor:'Sample Plumber',dueDate:day(2)}),
    task('dev-t5','Replace smoke detector battery (sample task)',{propId:'dev-p1',status:'inbox',dueDate:day(4)}),
    task('dev-t6','Update house manual (sample task)',{status:'inbox',done:true,completedAt:day(-1)})
  ];
  function issue(id,title,o){
    var r={id:id,title:title,propId:'',note:'',status:'open',createdAt:t,resolvedAt:'',photos:[],resolveBy:'',priority:'medium',category:'other',waitingFor:''};
    for(var k in o)r[k]=o[k];return r;
  }
  var issues=[
    issue('dev-i1','Dripping tap in kitchen (sample issue)',{propId:'dev-p2',note:'Fictional example.',priority:'low',resolveBy:day(7)}),
    issue('dev-i2','Broken sun lounger (sample issue)',{propId:'dev-p1',priority:'medium',createdAt:day(-3)}),
    issue('dev-i3','Wi-Fi router resets (sample issue)',{propId:'dev-p3',priority:'high',status:'waiting',waitingFor:'Sample ISP'})
  ];
  return {props:props,cleaners:cleaners,sessions:sessions,tasks:tasks,issues:issues,scratch:'',supplies:[],projects:[],focusSetDate:'',bookings:bookings,events:[],contacts:[],_migrations:[],_devSeededOn:t};
}
/* Fictional cleaning-plan demo for the preview, loaded once from ?demo=operations: the sample data plus next-week
   checkouts at Villa Mar and Villa Marjals (one with a same-day arrival) and a cancelled stay. */
function svDevOperationsDemo(){
  var data=svDevSeedData();
  function pad(n){return String(n).padStart(2,'0');}
  var toMon=(8-new Date().getDay())%7||7;
  function nw(n){var d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+toMon+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function booking(id,propId,checkIn,checkOut,o){var b={id:id,propId:propId,platform:'airbnb',agencyName:'',checkIn:checkIn,checkOut:checkOut,guestName:'Sample Guest '+id.slice(5),guestCount:4,totalPrice:1500,notes:'',status:'confirmed',linkedCleaningId:''};for(var k in o)b[k]=o[k];return b;}
  data.props.push({id:'dev-p4',name:'Villa Mar',notes:'Sample property.',photos:[]},{id:'dev-p5',name:'Villa Marjals',notes:'Sample property.',photos:[]});
  data.bookings.push(booking('dev-b7','dev-p4',nw(-3),nw(1)),booking('dev-b8','dev-p5',nw(-2),nw(2)),booking('dev-b9','dev-p5',nw(2),nw(9),{checkInTime:'16:00'}),
    booking('dev-b10','dev-p4',nw(4),nw(6)),booking('dev-b11','dev-p2',nw(3),nw(5),{status:'cancelled'}));
  return data;
}

/* Fictional dashboard demo for the preview, loaded once from ?demo=dashboard: the operations demo plus a busy day,
   crews in every state, tasks across Today / This week / Later and open issues, so every panel can be checked and scrolled. */
function svDevDashboardDemo(){
  var data=svDevOperationsDemo();
  function pad(n){return String(n).padStart(2,'0');}
  function day(n){var d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  data.props.push({id:'dev-p6',name:'Casa Sample Norte',notes:'Sample property.',photos:[]});
  data.cleaners.push({id:'dev-c3',name:'Sample Cleaner C',phone:'+34 600 000 003'},{id:'dev-c4',name:'Sample Cleaner D',phone:'+34 600 000 004'});
  data.bookings.push(
    {id:'dev-b12',propId:'dev-p2',platform:'airbnb',agencyName:'',checkIn:day(-6),checkOut:day(0),checkOutTime:'10:00',guestName:'Sample Guest Twelve',guestCount:6,totalPrice:2100,notes:'',status:'confirmed',linkedCleaningId:'dev-s12'},
    {id:'dev-b13',propId:'dev-p4',platform:'booking',agencyName:'',checkIn:day(0),checkOut:day(6),checkInTime:'16:00',guestName:'Sample Guest Thirteen',guestCount:5,totalPrice:2600,notes:'',status:'confirmed',linkedCleaningId:''},
    {id:'dev-b14',propId:'dev-p6',platform:'airbnb',agencyName:'',checkIn:day(1),checkOut:day(4),guestName:'Sample Guest Fourteen',guestCount:3,totalPrice:900,notes:'',status:'confirmed',linkedCleaningId:''});
  data.sessions.push(
    {id:'dev-s12',propId:'dev-p2',date:day(0),time:'11:00',cleanerIds:[],status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s13',propId:'dev-p5',date:day(1),time:'10:00',crew:{main:[{cleanerId:'dev-c3',name:'Sample Cleaner C',status:'offered'}],alinaSpots:0,alinaStatus:'offered'},status:'scheduled',note:'Checkout cleaning'},
    {id:'dev-s14',propId:'dev-p4',date:day(2),time:'10:00',crew:{main:[{cleanerId:'dev-c1',name:'Sample Cleaner A',status:'confirmed'},{cleanerId:'dev-c4',name:'Sample Cleaner D',status:'confirmed'}],alinaSpots:0,alinaStatus:'offered'},status:'scheduled',note:'Deep clean'},
    {id:'dev-s15',propId:'dev-p6',date:day(4),time:'12:00',crew:{main:[{cleanerId:'dev-c2',name:'Sample Cleaner B',status:'confirmed'},{cleanerId:'dev-c3',name:'Sample Cleaner C',status:'offered'}],alinaSpots:0,alinaStatus:'offered'},status:'scheduled',note:'Checkout cleaning'});
  function task(id,text,o){var r={id:id,text:text,propId:'',priority:'medium',urgent:false,done:false,pinned:false,inFocus:false,note:'',dueDate:'',timeEst:'',photo:null,completedAt:'',createdAt:day(-2),status:'inbox',type:'ops',projectId:'',waitingFor:''};for(var k in o)r[k]=o[k];return r;}
  data.tasks.push(
    task('dev-t7','Order cleaning supplies (sample)',{dueDate:day(0),status:'today'}),
    task('dev-t8','Assign a team for Casa Ejemplo (sample)',{propId:'dev-p2',dueDate:day(0),priority:'high'}),
    task('dev-t9','Review sample guest request',{dueDate:day(1)}),
    task('dev-t10','Prepare checkout schedule (sample)',{dueDate:day(1)}),
    task('dev-t11','Restock villa towels (sample)',{propId:'dev-p4',dueDate:day(2)}),
    task('dev-t12','Update welcome book (sample)',{propId:'dev-p6',dueDate:day(3)}),
    task('dev-t13','Service garden irrigation (sample)',{propId:'dev-p5',dueDate:day(9)}),
    task('dev-t14','Renew pool chemicals (sample)',{propId:'dev-p1',dueDate:day(12)}),
    task('dev-t15','Photograph new terrace furniture (sample)',{propId:'dev-p3'}),
    task('dev-t16','Key handover note (sample, overdue)',{propId:'dev-p2',dueDate:day(-1)}));
  function issue(id,title,o){var r={id:id,title:title,propId:'',note:'',status:'open',createdAt:day(0),resolvedAt:'',photos:[],resolveBy:'',priority:'medium',category:'other',waitingFor:''};for(var k in o)r[k]=o[k];return r;}
  data.issues.push(
    issue('dev-i4','Pool pump noise (sample issue)',{propId:'dev-p6',priority:'high'}),
    issue('dev-i5','Air-conditioning check (sample issue)',{propId:'dev-p4',priority:'high',createdAt:day(-1)}),
    issue('dev-i6','Lockbox battery (sample issue)',{propId:'dev-p5',priority:'low',createdAt:day(-4)}),
    issue('dev-i7','Missing linen (sample issue)',{propId:'dev-p1',priority:'medium',createdAt:day(-2)}));
  return data;
}