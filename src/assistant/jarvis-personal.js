/* Shared, bounded owner preferences. The PC is authoritative; this browser copy is only a session cache.
   Both the model and these shortcuts propose intents. Only the protected PC service persists them. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SV_JARVIS_PERSONAL=api;})(typeof window!=='undefined'?window:globalThis,function(){
  const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const copy=v=>JSON.parse(JSON.stringify(v));
  const empty=()=>({schema:1,version:0,preferredAddress:'',aliases:[]});
  let current=empty();
  const clean=v=>String(v||'').trim().replace(/^[“”"']+|[“”"',.!?;:]+$/g,'').trim();
  function short(v,max){return typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[<>\r\n\x00-\x1f]/.test(v);}
  function profile(value){
    if(!value||value.schema!==1||!Number.isSafeInteger(value.version)||value.version<0||typeof value.preferredAddress!=='string'||value.preferredAddress.length>40||/[<>\r\n\x00-\x1f]/.test(value.preferredAddress)||!Array.isArray(value.aliases)||value.aliases.length>64)throw Error('The saved preferences could not be read.');
    const aliases=value.aliases.map(a=>{if(!a||!short(a.alias,80)||!short(a.propertyId,100)||!short(a.propertyName,100))throw Error('A saved villa nickname is invalid.');return {alias:a.alias.trim(),propertyId:a.propertyId,propertyName:a.propertyName};});
    if(new Set(aliases.map(a=>norm(a.alias))).size!==aliases.length)throw Error('Saved villa nicknames conflict.');
    return {schema:1,version:value.version,preferredAddress:value.preferredAddress,aliases};
  }
  function intent(v){
    if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid memory request.');
    const action=v.action;
    if(['list','clear_address'].includes(action)){if(Object.keys(v).some(k=>k!=='action'))throw Error('Invalid memory fields.');return {action};}
    const fields=action==='set_address'?['value']:action==='set_alias'?['alias','property']:action==='forget_alias'?['alias']:null;
    if(!fields||Object.keys(v).some(k=>!['action',...fields].includes(k)))throw Error('Invalid memory request.');
    const out={action};for(const k of fields){if(!short(v[k],k==='value'?40:k==='alias'?80:100))throw Error('Please use a short name.');out[k]=clean(v[k]);if(!out[k])throw Error('Please use a name.');}
    return out;
  }
  /* Reject quotations/hypotheticals before recognizing a direct instruction. Source messages never enter this path. */
  function eligible(text){return typeof text==='string'&&text.length<=2000&&!/^\s*["“>]/.test(text)&&!/(?:\bfor (?:example|instance)\b|\bwhat if\b|\bif I (?:say|said|ask|asked)\b|\b(?:he|she|they|a guest|someone) (?:says|said|wrote)\b|\b(?:do not|don't|don’t) (?:save|remember)\b|\bhow (?:do|would|can|should) I\b)/i.test(text);}
  function direct(text){
    if(!eligible(text))return null;
    const t=text.trim().replace(/^(?:hey\s+)?jarvis[,\s]+/i,'').replace(/^(?:please|could you|can you|would you)\s+/i,'').replace(/[.!?]+$/,'').trim();
    let m=t.match(/^(?:(?:from now on|going forward)[:,]?\s+)?(?:call|address|refer to) me(?: as)?\s+(.+)$/i);
    if(m){const value=clean(m[1].replace(/[,;]?\s+(?:not|instead of|rather than)\s+.+$/i,'').replace(/[,;]?\s+(?:from now on|going forward|please|instead)$/i,''));if(short(value,40)&&! /^(?:at|later|tomorrow|when|on|back)\b/i.test(value))return {action:'set_address',value};}
    m=t.match(/^(?:remember(?: that)?\s+)?when I (?:say|mention)\s+(.+?)\s+I (?:mean|am referring to)\s+(.+)$/i)||t.match(/^(?:remember(?: that)?\s+)?(?:use|save)\s+(.+?)\s+as (?:a |an |my )?(?:nickname|alias) for\s+(.+)$/i);
    if(m)return intent({action:'set_alias',alias:clean(m[1]),property:clean(m[2])});
    m=t.match(/^forget\s+(?:the |my )?(?:villa |property )?(?:nickname|alias)\s+(.+)$/i);
    if(m)return intent({action:'forget_alias',alias:clean(m[1])});
    if(/^(?:forget|clear|remove|reset)\s+(?:my |the )?(?:preferred (?:name|address|title)|form of address|name preference)$/i.test(t))return {action:'clear_address'};
    if(/^(?:what do you (?:remember|know) about (?:me|my preferences)|(?:show|list|read)(?: me)? (?:my |the )?(?:saved )?(?:preferences|memories|villa (?:aliases|nicknames))|what (?:villa (?:aliases|nicknames)|preferences) (?:have you|do you have) (?:saved|remembered))$/i.test(t))return {action:'list'};
    return null;
  }
  function authorized(text,operation){
    if(!eligible(text))return false;
    const t=norm(text),o=intent(operation),has=v=>(' '+t+' ').includes(' '+norm(v)+' ');
    if(o.action==='list')return /\b(remember|preferences|memories|aliases|nicknames|know about me)\b/i.test(text);
    if(o.action==='set_address'){
      const escaped=norm(o.value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp('\\b(?:don t|do not|stop|never) (?:call|calling|address|addressing|refer to|referring to) me(?: as)? '+escaped+'(?: |$)').test(t))return false;
      return /\b(call|address|refer|name|title|prefer)\b/i.test(text)&&/\b(me|my)\b/i.test(text)&&has(o.value);
    }
    if(o.action==='set_alias'){const words=norm(o.property).split(' ').filter(w=>!['villa','casa','can','la','finca'].includes(w));return /\b(mean|nickname|alias|refer|remember|call)\b/i.test(text)&&has(o.alias)&&(has(o.property)||words.length>0&&words.every(w=>t.split(' ').includes(w)));}
    if(o.action==='forget_alias')return /\b(forget|remove|delete|stop using)\b/i.test(text)&&has(o.alias);
    return /\b(forget|clear|remove|reset|stop)\b/i.test(text)&&/\b(name|address|title|preference|calling)\b/i.test(text);
  }
  function resolve(spoken,properties,{phrase=false,saved=current}={}){
    const q=norm(spoken),p=profile(saved),contains=v=>phrase?(' '+q+' ').includes(' '+norm(v)+' '):q===norm(v);
    const aliases=p.aliases.filter(a=>contains(a.alias)).sort((a,b)=>norm(b.alias).length-norm(a.alias).length);
    if(!aliases.length)return null;
    const ids=new Set(aliases.map(a=>a.propertyId));
    const canonical=properties.filter(x=>contains(x.name));
    if(ids.size!==1||canonical.some(x=>!ids.has(String(x.id))))return {error:'That nickname conflicts with another villa. Which full villa name do you mean?',ambiguous:true};
    const target=properties.find(x=>String(x.id)===aliases[0].propertyId);
    return target?{match:target,alias:aliases[0].alias}:{error:'The villa saved for that nickname is no longer in the current records. Which villa should it mean?',unknown:true};
  }
  function expand(text,properties){
    let result=String(text);
    for(const a of current.aliases.slice().sort((x,y)=>norm(y.alias).length-norm(x.alias).length)){
      const r=resolve(a.alias,properties);if(!r?.match)continue;
      const tokens=a.alias.trim().split(/\s+/).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
      result=result.replace(new RegExp('(?<![\\p{L}\\p{N}])'+tokens+'(?![\\p{L}\\p{N}])','giu'),r.match.name);
    }
    return result;
  }
  return Object.freeze({norm,empty,profile,intent,direct,eligible,authorized,resolve,expand,get:()=>copy(current),set:v=>{current=profile(v);return copy(current);},reset:()=>{current=empty();},address:()=>current.preferredAddress||'Antonio'});
});
