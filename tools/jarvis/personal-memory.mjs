/* Private structured preferences alongside Hermes, separate from chat history and business records.
   No I/O occurs on import. Writes are atomic, version checked, bounded and read back before success. */
import {readFileSync,existsSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import PERSONAL from '../../src/assistant/jarvis-personal.js';
export const defaultMemoryPath=(env=process.env)=>env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'hermes','profiles','seravillas','jarvis-personal-memory.json'):'';
export function fileMemoryStore(file){
  if(!file)throw Error('The private preference folder is unavailable.');
  return {load(){return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):PERSONAL.empty();},save(value){
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
    try{const fd=openSync(temp,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,file);}catch(e){try{unlinkSync(temp);}catch{}throw e;}
  }};
}
export function memoryProperties(value){
  if(!Array.isArray(value)||value.length>500)throw Error('Current villa records are needed.');
  return value.map(p=>{if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw Error('Invalid villa record.');return {id:p.id,name:p.name};});
}
export function createPersonalMemory({store,file}={}){
  store=store||fileMemoryStore(file);
  const get=()=>PERSONAL.profile(store.load());
  function execute({text,operation,properties=[],version}={}){
    const op=PERSONAL.intent(operation||PERSONAL.direct(text));
    if(!PERSONAL.authorized(text,op))return {kind:'clarify',text:'Is that a preference you want me to save for future conversations?'};
    const before=get(),next=structuredClone(before),props=memoryProperties(properties);
    let message='';
    if(op.action==='list')return {kind:'reply',text:describe(before,props),personalMemory:before};
    if(op.action==='set_address'){next.preferredAddress=op.value;message='Of course, '+op.value+'. I’ve saved that for next time.';}
    if(op.action==='clear_address'){next.preferredAddress='';message='I’ve cleared your preferred form of address. I’ll use Antonio again.';}
    if(op.action==='set_alias'){
      let exact=props.filter(p=>PERSONAL.norm(p.name)===PERSONAL.norm(op.property));
      if(!exact.length){const words=PERSONAL.norm(op.property).split(' ').filter(w=>!['villa','casa','can','la','finca'].includes(w));if(words.length)exact=props.filter(p=>words.every(w=>PERSONAL.norm(p.name).split(' ').includes(w)));}
      if(exact.length!==1)return {kind:'clarify',text:exact.length?'More than one villa has that name. Which one do you mean?':'Which current villa should “'+op.alias+'” mean? Please use its full name.',pending:op};
      const target=exact[0],conflict=props.find(p=>PERSONAL.norm(p.name)===PERSONAL.norm(op.alias)&&p.id!==target.id);
      if(conflict)return {kind:'clarify',text:'There is already a villa named '+conflict.name+'. Please choose a different nickname for '+target.name+'.'};
      const entry={alias:op.alias,propertyId:target.id,propertyName:target.name},index=next.aliases.findIndex(a=>PERSONAL.norm(a.alias)===PERSONAL.norm(op.alias));
      if(index<0){if(next.aliases.length>=64)throw Error('The nickname list is full. Remove an old nickname first.');next.aliases.push(entry);}else next.aliases[index]=entry;
      message='Saved. When you say '+op.alias+', I’ll use '+target.name+'.';
    }
    if(op.action==='forget_alias'){next.aliases=next.aliases.filter(a=>PERSONAL.norm(a.alias)!==PERSONAL.norm(op.alias));message='I’ve removed the nickname '+op.alias+'.';}
    if(JSON.stringify({...next,version:0})===JSON.stringify({...before,version:0}))return {kind:'reply',text:message,personalMemory:before};
    if(version!==undefined&&version!==before.version)return {kind:'clarify',text:'Your preferences changed in another conversation. I’ve refreshed them; please repeat that change.',personalMemory:before};
    next.version++;PERSONAL.profile(next);store.save(next);
    const saved=get();if(JSON.stringify(saved)!==JSON.stringify(next))throw Error('The preference could not be verified after saving.');
    return {kind:'reply',text:message,personalMemory:saved};
  }
  return Object.freeze({get,execute});
}
export function describe(profile,properties=[]){
  const parts=[];if(profile.preferredAddress)parts.push('You prefer to be called '+profile.preferredAddress+'.');
  if(profile.aliases.length)parts.push('Your villa nicknames are '+profile.aliases.map(a=>a.alias+' for '+(properties.find(p=>p.id===a.propertyId)?.name||a.propertyName)).join('; ')+'.');
  return parts.join(' ')||'You haven’t saved a preferred name or any villa nicknames yet.';
}
