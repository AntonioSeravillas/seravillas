const DB='seravillas_v1';
function navTo(t){if(t==='calendar')calView='timeline';go(t);}

let D={props:[],cleaners:[],sessions:[],tasks:[],issues:[],scratch:'',supplies:[],projects:[],focusSetDate:'',bookings:[],events:[],contacts:[]};
let selCleaners=[];
let tab='home',tasksTab='today',manageTab='overview',propsView='list',homeWeekOffset=0;
let fProp='',fCleaner='';
let calY=new Date().getFullYear(),calM=new Date().getMonth();
let calView='timeline';
let calSelectedBk=null;
let calWeekStart=null;
let calTimelineDate='';
let calFilter='all'; // 'all' | 'cleanings' | 'prop-{id}'
let reportYear=new Date().getFullYear();
let _showPastEvents=false;
let evView='list';
let evCalY=new Date().getFullYear();
let evCalM=new Date().getMonth();
let schedView='villas',schedPropFilter='';
let schedWeekOffset=0; // 0=this week, +1=next, -1=last
// ── Cloud sync ──
const DEV_MODE=!!(window.SV_CONFIG&&window.SV_CONFIG.isDev);
// Development preview: no cloud URL and the production access key is never read.
let SYNC_URL=DEV_MODE?'':'https://seravillas-sync.antonio-01e.workers.dev';
let SYNC_SECRET=DEV_MODE?'':(SV_STORAGE.getItem('sv_secret')||'');
let syncStatus='idle';
let syncTimeout=null;
let propHubId=null,urgentNew=false,taskFilter='all',issueFilter='all',opsFilter='all';
let issueStatusFilter='all',issueSearch='',iccSelId=null;
let contactFilter='all',contactSearch='';
let tasksView='today'; // desktop tasks nav: today|inbox|all|ops|ops-prop-{id}|project-{id}|growth-unassigned|done
let taskDetailId=null; // task ID open in desktop detail panel
let _photoPropId=null,_photoIssueId=null;
let _openProjects=new Set();

