/* App version and reliable reload.
   The loaded page's label is <meta name="sv-app-version"> in index.html (bump it on every publish). A check fetches a fresh
   copy of the page at a unique address with no-store, so neither the browser nor GitHub Pages' 10-minute cache can answer
   it. Reload opens the page at a unique address too; every app script and style carries a ?v= tag, so the fresh page
   also loads fresh code. Reloading ends any voice conversation, like closing Jarvis. */
(function(){
  const META=/<meta\s+name="sv-app-version"\s+content="([^"<>]{1,40})"/i;
  const read=()=>String(document.querySelector('meta[name="sv-app-version"]')?.getAttribute('content')||'').trim()||'unknown';
  const loaded=read();
  let latest=null,checkedAt=0,error='',pending=null,banner=null;const listeners=new Set();
  const state=()=>({loaded,latest,updateAvailable:!!latest&&latest!==loaded,checkedAt,error});
  function notify(){const s=state();showBanner(s);listeners.forEach(fn=>{try{fn(s);}catch{}});}

  async function check({force=false}={}){
    if(pending)return pending;
    if(!force&&checkedAt&&Date.now()-checkedAt<120000)return state();
    pending=(async()=>{
      try{
        const url=new URL('./index.html',location.href);url.search='';url.searchParams.set('version-check',String(Date.now()));
        const res=await fetch(url.toString(),{cache:'no-store',credentials:'same-origin'});
        if(!res.ok)throw Error('HTTP '+res.status);
        const found=(await res.text()).match(META);if(!found)throw Error('No version label');
        latest=found[1].trim();error='';
      }catch{error='Could not check for updates. Check the connection and try again.';}
      checkedAt=Date.now();return state();
    })();
    try{return await pending;}finally{pending=null;notify();}
  }

  /* A unique address bypasses cached copies of the page; the marker is removed again after loading. */
  function reload(){
    const url=new URL(location.href);url.hash='';url.searchParams.set('app-reload',(latest||loaded).replace(/[^\w.-]/g,'')+'-'+Date.now());
    location.replace(url.toString());
  }
  try{const u=new URL(location.href);if(u.searchParams.has('app-reload')){u.searchParams.delete('app-reload');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}}catch{}

  function showBanner(s){
    if(!document.body)return;
    if(!s.updateAvailable){banner?.remove();banner=null;return;}
    if(!banner){
      banner=document.createElement('div');banner.className='sv-update-banner';banner.setAttribute('role','status');
      const text=document.createElement('span');text.className='sv-update-text';
      const button=document.createElement('button');button.type='button';button.className='sv-update-reload';button.textContent='Reload now';button.addEventListener('click',reload);
      const close=document.createElement('button');close.type='button';close.className='sv-update-close';close.setAttribute('aria-label','Hide update notice');close.textContent='×';close.addEventListener('click',()=>{banner?.remove();banner=null;});
      banner.append(text,button,close);document.body.appendChild(banner);
    }
    banner.querySelector('.sv-update-text').textContent='Version '+s.latest+' is available (this device has '+s.loaded+').';
  }

  /* Check when the app opens and whenever it comes back to the foreground (at most every two minutes). */
  /* Preview (loopback) never checks automatically: it makes no network requests unless the owner asks. */
  const auto=()=>{if(!document.hidden&&!window.SV_CONFIG?.isDev)void check();};
  document.addEventListener('visibilitychange',auto);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto,{once:true});else auto();

  window.SV_APP_VERSION=Object.freeze({loaded,check,reload,state,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}});
})();
