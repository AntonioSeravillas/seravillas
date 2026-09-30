/* Storage adapter (classic script). Every app storage call goes through SV_STORAGE.
   Production: keys are unchanged. Development: every key gets the SV_CONFIG.storagePrefix
   so the preview can never read or overwrite production data. */
(function(){
  var prefix=(window.SV_CONFIG&&window.SV_CONFIG.storagePrefix)||'';
  window.SV_STORAGE={
    key:function(k){return prefix+k;},
    getItem:function(k){return localStorage.getItem(prefix+k);},
    setItem:function(k,v){return localStorage.setItem(prefix+k,v);},
    removeItem:function(k){return localStorage.removeItem(prefix+k);}
  };
})();
