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
