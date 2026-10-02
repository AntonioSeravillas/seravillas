/* Only this cleaner folder is controlled. API responses are never cached here. */
const CACHE='seravillas-cleaner-20261002-polish';
const FILES=['./','./index.html','../assets/css/fonts.css?v=20261001-design','../assets/css/app.css','../assets/css/cleaner-portal.css?v=20261001-design','../assets/fonts/plus-jakarta-sans-latin.woff2','../assets/fonts/plus-jakarta-sans-latin-ext.woff2','../assets/fonts/dm-mono-400-latin.woff2','../assets/fonts/dm-mono-400-latin-ext.woff2','../assets/fonts/dm-mono-500-latin.woff2','../assets/fonts/dm-mono-500-latin-ext.woff2','../src/cleaner/portal.js?v=20261001-design'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('seravillas-cleaner-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;}
  const paths=FILES.map(file=>new URL(file,self.registration.scope).href);
  if(paths.includes(url.href))event.respondWith(caches.match(event.request).then(saved=>saved||fetch(event.request)));
});
