/* Runtime configuration (classic script — must load before everything else).
   Development mode turns on automatically on localhost, 127.0.0.1, IPv6 loopback
   and file://. It is never on for the hosted site (GitHub Pages). */
(function(){
  var host=(location.hostname||'').toLowerCase();
  var isDev=location.protocol==='file:'
    ||host==='localhost'
    ||host==='127.0.0.1'
    ||host==='[::1]'||host==='::1';
  window.SV_CONFIG={
    isDev:isDev,
    cloudEnabled:!isDev,
    storagePrefix:isDev?'seravillas_dev:':'',
    devLabel:'Development preview — cloud sync disabled'
  };
})();
