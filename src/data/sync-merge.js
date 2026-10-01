/* Three-way merge for manager edits and cleaner updates. No requests or storage. */
(function(root){
  function copy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
  function normalized(v){if(Array.isArray(v))return v.map(normalized);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])]));return v;}
  function equal(a,b){return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));}
  function merge(base,local,remote,prefer){
    const conflicts=[];
    function visit(b,l,r,path){
      if(path==='_savedAt')return Math.max(Number(l)||0,Number(r)||0);
      if(equal(l,r))return copy(l);
      if(equal(l,b))return copy(r);
      if(equal(r,b))return copy(l);
      const objects=[b,l,r].every(v=>v&&typeof v==='object'&&!Array.isArray(v));
      if(objects){const out={};for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){const v=visit(b[k],l[k],r[k],path?path+'.'+k:k);if(v!==undefined)out[k]=v;}return out;}
      if([b,l,r].every(Array.isArray)){
        const all=[...b,...l,...r];
        const key=all.length&&all.every(x=>x&&typeof x==='object'&&typeof x.id==='string')?'id':all.length&&all.every(x=>x&&typeof x==='object'&&typeof x.cleanerId==='string')?'cleanerId':null;
        if(key&&[b,l,r].every(a=>new Set(a.map(x=>x[key])).size===a.length)){
          const maps=[b,l,r].map(a=>new Map(a.map(x=>[x[key],x]))), out=[];
          for(const id of new Set([...r.map(x=>x[key]),...l.map(x=>x[key]),...b.map(x=>x[key])])){const v=visit(maps[0].get(id),maps[1].get(id),maps[2].get(id),path+'['+id+']');if(v!==undefined)out.push(v);}return out;
        }
      }
      conflicts.push(path);return copy(prefer==='remote'?r:l);
    }
    return {data:visit(base,local,remote,''),conflicts};
  }
  root.SV_SYNC=Object.freeze({equal,merge});
})(typeof window!=='undefined'?window:globalThis);
