function avInit(n){return n.trim().split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
function colorFor(n){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))%6;return h}
function propColorIdx(id){const i=D.props.findIndex(p=>p.id===id);return i<0?0:i%6}
function propName(id){const p=D.props.find(x=>x.id===id);return p?p.name:'?'}

// Muted villa colours follow the user's selected light/dark theme through CSS tokens.
function propBarColor(propId){
  const idx=propColorIdx(propId);
  return {bg:'var(--villa-'+idx+'-bg)',border:'var(--villa-'+idx+'-border)',text:'var(--villa-'+idx+'-text)'};
}
function platformBadge(platform,agencyName){
  if(platform==='direct') return'<span class="plat-ag">Direct</span>';
  if(platform==='airbnb') return'<span class="plat-ab">Airbnb</span>';
  if(platform==='booking') return'<span class="plat-bk">Booking.com</span>';
  return'<span class="plat-ag">'+(agencyName?esc(agencyName):'Agency')+'</span>';
}
function nightsBetween(checkIn,checkOut){
  const a=checkIn.split('-'),b=checkOut.split('-');
  const d1=new Date(+a[0],+a[1]-1,+a[2]),d2=new Date(+b[0],+b[1]-1,+b[2]);
  return Math.max(0,Math.round((d2-d1)/(1000*60*60*24)));
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function calcDoneThisMonth(){
  const now=new Date();
  const ms=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-01';
  const me=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(new Date(now.getFullYear(),now.getMonth()+1,0).getDate());
  return D.sessions.filter(s=>s.date>=ms&&s.date<=me&&s.status==='done').length;
}

let tt;
function toast(msg,duration){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('show'),duration||3500)}

function updateBadge(){
  const open=D.tasks.filter(t=>(t.priority==='high'||t.urgent)&&!t.done).length+D.issues.filter(i=>i.status==='open').length;
  ['tasks-badge','mobile-tasks-badge'].forEach(function(id){
    const el=document.getElementById(id);
    if(el){if(open>0){el.textContent=open>9?'9+':open;el.style.display='block';}else el.style.display='none';}
  });
  // Sidebar badge
  const sItem=document.getElementById('snav-tasks');
  if(sItem){
    let sb=sItem.querySelector('.sidebar-badge');
    if(open>0){
      if(!sb){sb=document.createElement('span');sb.className='sidebar-badge';sItem.appendChild(sb);}
      sb.textContent=open>9?'9+':open;
    } else if(sb){sb.remove();}
  }
  // Sidebar date
  const sd=document.getElementById('sidebar-date');
  const hd=document.getElementById('header-date');
  const dateStr=hd?hd.textContent:'';
  if(sd&&dateStr)sd.textContent=dateStr;
}

const NAV_COLORS={home:'nc-teal',calendar:'',tasks:'',manage:'',properties:'nc-pink'};
function go(t,extra){
  if(t==='manage')manageTab=manageTab||'overview';
  propHubId=extra||null; // FIX: always reset unless extra provided
  if(!extra)propsView='list';
  tab=t;
  document.querySelectorAll('.nav-item').forEach(b=>{b.classList.remove('active','nc-teal','nc-pink','nc-amber');});
  document.querySelectorAll('.sidebar-item').forEach(b=>{b.classList.remove('active');});
  const navKey=t==='review'||t==='booking-report'?'home':t;
  const nb=document.getElementById('nav-'+navKey);
  if(nb){nb.classList.add('active');if(NAV_COLORS[navKey])nb.classList.add(NAV_COLORS[navKey]);}
  const sb=document.getElementById('snav-'+navKey);
  if(sb)sb.classList.add('active');
  render();document.getElementById('content').scrollTop=0;
}
function safeRender(fn,tabName){
  try{return fn();}catch(e){
    console.error('Render error in '+tabName+':',e);
    return'<div style="background:#FCEBEB;border:1px solid #f5c6cb;border-radius:var(--radius);padding:20px;margin-top:12px;text-align:center">'
      +'<div style="font-size:22px;margin-bottom:8px">⚠️</div>'
      +'<div style="font-size:14px;font-weight:700;color:#A32D2D;margin-bottom:6px">Something went wrong in '+tabName+'</div>'
      +'<div style="font-size:12px;color:#7A2020;margin-bottom:14px;font-family:monospace">'+esc(e.message)+'</div>'
      +'<button class="btn btn-sm" style="background:#A32D2D;color:#fff;border:none" onclick="refreshApp()">Reload app</button>'
      +'</div>';
  }
}

function render(){
  // Debounce: if called again within 16ms (one frame), skip intermediate renders
  if(render._t)clearTimeout(render._t);
  render._t=setTimeout(()=>{
    render._t=null;
    _doRender();
  },16);
}
function _doRender(){
  // Save scroll position before re-render
  const el=document.getElementById('content');
  const scrollY=el?el.scrollTop:0;
  if(tab==='home')        el.innerHTML=safeRender(renderHome,'Home');
  else if(tab==='calendar')   el.innerHTML=safeRender(renderCalendar,'Calendar');
  else if(tab==='cleaning')   el.innerHTML=safeRender(renderCleanerSchedule,'Cleaning');
  else if(tab==='tasks')      el.innerHTML=safeRender(renderTasks,'Tasks');
  else if(tab==='manage')     el.innerHTML=safeRender(renderManage,'Manage');
  else if(tab==='review')     el.innerHTML=safeRender(renderReview,'Review');
  else if(tab==='booking-report') el.innerHTML=safeRender(renderBookingReport,'Revenue reports');
  else if(tab==='booking-availability') el.innerHTML=safeRender(renderBookingAvailability,'Availability');
  else if(tab==='calendar-events') el.innerHTML=safeRender(()=>renderBookingCalendarTool('events'),'Calendar events');
  else if(tab==='calendar-agenda') el.innerHTML=safeRender(()=>renderBookingCalendarTool('agenda'),'Upcoming agenda');
  else if(tab==='settings') el.innerHTML=safeRender(renderAppSettings,'Settings');
  else if(tab==='properties') el.innerHTML=propHubId?safeRender(()=>renderPropHub(propHubId),'Properties'):safeRender(renderProperties,'Properties');
  // Restore scroll (same tab) or reset (tab change)
  if(el){
    const prevTab=render._lastTab;
    if(tab===prevTab&&tab!=='home'){el.scrollTop=scrollY;}
    else{el.scrollTop=0;}
    render._lastTab=tab;
  }
  updateBadge();
  updateWorkspaceNav();
  revealActiveTabs();
  attachSwipeNav();
  runAnimations();
  if(tab==='calendar'&&calView==='timeline')setTimeout(tlScrollFocus,30);
}

/* Scroll each tab bar so its selected tab is fully visible, and flag which edges have more tabs. */
function revealActiveTabs(){
  document.querySelectorAll('.sv-tabs').forEach(function(bar){
    const mark=function(){
      bar.classList.toggle('has-more-left',bar.scrollLeft>4);
      bar.classList.toggle('has-more-right',bar.scrollLeft+bar.clientWidth<bar.scrollWidth-4);
    };
    const active=bar.querySelector('.sv-tab.active,.sv-tab[aria-selected="true"]');
    if(active&&bar.scrollWidth>bar.clientWidth){
      const pad=24;
      const left=active.offsetLeft-bar.offsetLeft;
      if(left<bar.scrollLeft+pad)bar.scrollLeft=Math.max(0,left-pad);
      else if(left+active.offsetWidth>bar.scrollLeft+bar.clientWidth-pad)bar.scrollLeft=left+active.offsetWidth-bar.clientWidth+pad;
    }
    bar.addEventListener('scroll',mark,{passive:true});
    mark();
  });
}

/* ── ANIMATION ENGINE — polished ── */

// Track last MAIN tab to avoid re-animating on sub-tab switches
let _lastAnimTab='';

// 1. Tab fade — only opacity, no scale (avoids Dynamic Island issue)
function animateTabEnter(){
  const el=document.getElementById('content');
  if(!el)return;
  el.classList.remove('tab-enter');
  void el.offsetWidth;
  el.classList.add('tab-enter');
  setTimeout(()=>el.classList.remove('tab-enter'),200);
}

// 2. Card stagger — ONLY on main tab change, never on sub-tab switches
function staggerCards(){
  if(tab===_lastAnimTab)return; // same tab, skip
  _lastAnimTab=tab;
  const el=document.getElementById('content');
  if(!el)return;
  const sel='.card,.dash-stat,.dash-card,.dash-next,.ev-card,.task-bubble,.issue-item,.supply-card,.prop-card,.bk-card,.wr-stat,.wr-card,.proj-block,.today-stat,.home-chip';
  const cards=el.querySelectorAll(sel);
  let i=0;
  cards.forEach(c=>{
    if(i>=8)return;
    i++;
    c.classList.add('anim-card');
    setTimeout(()=>{
      c.classList.remove('anim-card');
      c.style.opacity='';
    },124+280);
  });
}

// 3. Nav warm glow (not a hard ripple)
function attachNavRipple(){
  document.querySelectorAll('.nav-item').forEach(btn=>{
    if(btn._rippleAttached)return;
    btn._rippleAttached=true;
    btn.addEventListener('pointerdown',function(){
      const r=document.createElement('div');
      r.className='nav-ripple';
      r.style.cssText='left:50%;top:50%';
      this.style.position='relative';
      this.style.overflow='hidden';
      this.appendChild(r);
      setTimeout(()=>r.remove(),380);
    });
  });
}

// 4. Liquid seg-ctrl pill — smooth slide between options
function attachSegPills(){
  document.querySelectorAll('.seg-ctrl').forEach(ctrl=>{
    if(ctrl._pillAttached)return;
    ctrl._pillAttached=true;
    const pill=document.createElement('div');
    pill.className='seg-pill';
    ctrl.insertBefore(pill,ctrl.firstChild);
    const update=()=>{
      const active=ctrl.querySelector('.seg-btn.active');
      if(!active){pill.style.opacity='0';return;}
      pill.style.opacity='1';
      const cr=ctrl.getBoundingClientRect();
      const br=active.getBoundingClientRect();
      pill.style.left=(br.left-cr.left-3)+'px';
      pill.style.width=br.width+'px';
    };
    // Immediate position, then enable transition
    pill.style.transition='none';
    requestAnimationFrame(()=>{
      update();
      requestAnimationFrame(()=>{
        pill.style.transition='';
        ctrl.addEventListener('click',()=>requestAnimationFrame(update));
      });
    });
    ctrl._updatePill=update;
  });
  document.querySelectorAll('.seg-ctrl').forEach(c=>c._updatePill&&c._updatePill());
}

// 5. Dashboard stat counter — only on first home load
let _counterDone=false;
function animateCounters(){
  if(_counterDone)return;
  _counterDone=true;
  const el=document.getElementById('content');
  if(!el)return;
  el.querySelectorAll('.dash-stat-n,.today-stat-n').forEach(node=>{
    const raw=node.textContent.trim();
    const m=raw.match(/^(€?)(\d[\d,\.]*)(k?)$/i);
    if(!m)return;
    const prefix=m[1],suffix=m[3];
    const num=parseFloat(m[2].replace(/,/g,''));
    if(isNaN(num)||num<=1)return;
    const dur=500,steps=20,step=dur/steps;
    let i=0;const orig=node.textContent;
    const iv=setInterval(()=>{
      i++;
      const ease=1-Math.pow(1-i/steps,2);
      node.textContent=prefix+Math.round(num*ease)+suffix;
      if(i>=steps){node.textContent=orig;clearInterval(iv);}
    },step);
  });
}

// Reset counter when leaving home tab
function resetCounterIfNeeded(){
  if(tab!=='home')_counterDone=false;
}

// Master — called after every render
let workspaceAnimationCategory='';
function runAnimations(){
  const category=workspaceCurrentCategory();
  if(category!==workspaceAnimationCategory){animateTabEnter();workspaceAnimationCategory=category;}
  requestAnimationFrame(()=>{
    attachSegPills();
  });
}


const SWIPE_TABS={
  tasks:   ['today','ops','growth'],
  calendar:['timeline','month'],
};
function currentSubTab(){
  if(tab==='tasks')   return tasksTab;
  if(tab==='calendar')return calView;
  if(tab==='manage')  return manageTab;
  return null;
}
function setSubTab(t){
  if(tab==='tasks'){tasksTab=t;}
  else if(tab==='calendar'){
    calView=t;
    if((t==='timeline'||t==='week')&&!calWeekStart)calWeekStart=startOfWeek();
  }
  else if(tab==='manage'){manageTab=t;}
  render();
}
function attachSwipeNav(){
  if(window.innerWidth>=768)return; // desktop off
  const el=document.getElementById('content');
  if(!el||el._swipeAttached)return;
  el._swipeAttached=true;
  let x0=0,y0=0,locked=null;
  el.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    x0=t.clientX; y0=t.clientY; locked=null;
    // Don't hijack if touch starts inside a horizontal scroller (timeline or schedule)
    if(e.target.closest('.tl-outer,.tl-scroll,.tl-inner,.cal-grid,.sched-wrap,.sched-table'))locked='scroll';
  },{passive:true});
  el.addEventListener('touchend',e=>{
    if(locked==='scroll')return;
    if(!SWIPE_TABS[tab])return;
    const dx=e.changedTouches[0].clientX-x0;
    const dy=e.changedTouches[0].clientY-y0;
    // Must be mostly horizontal + at least 55px
    if(Math.abs(dx)<55||Math.abs(dy)>Math.abs(dx)*0.6)return;
    const tabs=SWIPE_TABS[tab];
    const cur=currentSubTab();
    const idx=tabs.indexOf(cur);
    if(idx<0)return;
    const next=dx<0?tabs[Math.min(idx+1,tabs.length-1)]:tabs[Math.max(idx-1,0)];
    if(next===cur)return;
    // Brief flash feedback on the active toggle button
    document.querySelectorAll('.seg-btn.active,.cal-toggle-btn.active').forEach(b=>{
      b.style.transition='opacity 0.1s';b.style.opacity='0.5';
      setTimeout(()=>{b.style.opacity='';},120);
    });
    setSubTab(next);
  },{passive:true});
}
function updateHeader(){document.getElementById('header-date').textContent=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'});updateThemeBtn();}

/* ── THEME TOGGLE ── */
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')||'dark';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  SV_STORAGE.setItem('sv_theme',next);
  // update theme-color meta for mobile browser chrome
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',next==='light'?'#EDF1F2':'#191E21');
  updateThemeBtn();
  toast(next==='light'?'Light mode ☀️':'Dark mode 🌙',2000);
  if(tab==='settings')render();
}
function updateThemeBtn(){
  const btn=document.getElementById('theme-btn');
  if(!btn)return;
  const isDark=(document.documentElement.getAttribute('data-theme')||'dark')==='dark';
  btn.title=isDark?'Switch to light mode':'Switch to dark mode';
  btn.setAttribute('aria-label',btn.title);
  // Sun icon in dark mode (click to go light), Moon icon in light mode (click to go dark)
  btn.innerHTML=isDark
    ?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    :'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

/* ── SESSION CARD ── */
function sessCard(s,showDate){
  const prop=D.props.find(p=>p.id===s.propId);
  const cls=(s.cleanerIds||[]).map(id=>D.cleaners.find(c=>c.id===id)).filter(Boolean);
  const cancelled=s.status==='cancelled',done=s.status==='done';
  const past=isPast(s.date)&&!isToday(s.date)&&!done&&!cancelled;
  const tb=isToday(s.date)&&!cancelled&&!done?'<span class="badge b-today">Today</span>':'';
  const pb=past?'<span class="badge b-past">Past</span>':'';
  const sb=done?'<span class="badge b-done">Done</span>':cancelled?'<span class="badge b-cancelled">Cancelled</span>':'';
  const tags=cls.map(c=>'<span class="badge tc-'+colorFor(c.name)+'">'+esc(c.name)+'</span>').join('');
  const clr=propBarColor(s.propId);
  return'<div class="card card-tap card-clean" onclick="openSess(\''+s.id+'\')" style="opacity:'+(cancelled?'0.45':past?'0.65':'1')+';border-left:3px solid '+clr.border+'">'
    +'<div class="sess-prop" style="'+(cancelled?'text-decoration:line-through':'')+'">'+esc(prop?prop.name:'?')+tb+pb+sb+'</div>'
    +'<div class="sess-date">'+(showDate?fmtDate(s.date)+(s.time?' · '+s.time:''):(s.time||'&nbsp;'))+'</div>'
    +'<div class="sess-tags">'+tags+'</div>'+(s.note?'<div class="sess-note">'+esc(s.note)+'</div>':'')+'</div>';
}

