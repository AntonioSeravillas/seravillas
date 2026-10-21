/* Conversational WhatsApp tools. The AI may resolve an owner's request into a bounded intent.
   Only explicit owner words can approve sending. Incoming-message AI drafting remains off.
   Spoken review is concise ("Draft ready for Bex."); the full recipient, message and translation stay on screen and are
   read aloud only on request. Voice approval is bound to the current review after its concise spoken summary finished.
   With the live microphone open during app speech, spoken text never contains an approval or cancel phrase, so the
   app's own voice heard back can never approve anything; those phrases are shown on screen instead. */
(function(){
  const API='/api/jarvis/whatsapp/',KEY=/^[a-f0-9]{20}$/;
  const normal=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
  const tidy=s=>String(s||'').trim().replace(/[.!?]+$/,'').replace(/^["“'‘]|["”'’]$/g,'').trim();
  const REPLY='(?:a |my |an )?(?:reply|response|answer)(?: from me)?';
  const AWAITING=[
    new RegExp('^who(?: (?:still )?(?:needs|wants|is waiting (?:for|on))|[\'’]?s (?:still )?waiting (?:for|on)) '+REPLY+'$','i'),
    /^who(?: is|['’]?s) (?:still )?waiting(?: (?:for|on) me)?$/i,
    /^who (?:do|should|must) i (?:still )?(?:need to |have to )?(?:reply|respond|answer|get back)(?: to)?$/i,
    new RegExp('^do i (?:still )?(?:owe anyone|owe anybody|need to (?:reply|respond) to anyone|have to (?:reply|respond) to anyone)(?: '+REPLY+')?$','i'),
    new RegExp('^(?:which|what) (?:whats\\s?app )?(?:chats|messages|conversations|people|contacts) (?:still )?(?:need|needs|require|are waiting for|want) '+REPLY+'$','i'),
    new RegExp('^(?:is|are) (?:anyone|anybody|there any (?:whats\\s?app )?(?:chats|messages|people)) (?:still )?waiting (?:for|on) '+REPLY+'$','i'),
    /^(?:is there )?anything i (?:still )?(?:need|have) to (?:reply|respond) to$/i
  ];
  const LATEST=/^(?:what(?:['’]?s| is| was)|tell me|give me)(?: me)? (?:my|the) (?:last|latest|most recent|newest) (?:(sent|outgoing) |received |incoming )?(?:whats\s?app )?message(?: i (?:got|received|(sent)))?$/i;
  const LAST_SENDER=[
    /^who (?:last|just|most recently) (?:messaged|texted|wrote to|wrote|sent) me(?: a)?(?: whats\s?app)?(?: message)?$/i,
    /^who (?:messaged|texted|wrote to|sent) me(?: a)?(?: whats\s?app)?(?: message)? (?:last|most recently)$/i,
    /^who (?:sent|wrote) (?:me )?the (?:last|latest|most recent) (?:whats\s?app )?message$/i,
    /^who(?: is|['’]?s|was) (?:my|the) (?:last|latest|most recent) (?:whats\s?app )?message from$/i
  ];
  /* Topic searches: "Did anyone ask about a private chef in the last seven days?", "¿Alguien preguntó por un chef privado?".
     Asking-style verbs only, so business-record questions keep their existing route. */
  const NUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fourteen:14,thirty:30,un:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,catorce:14,treinta:30};
  const SEARCH=[
    /^(?:(?:did|has|have) )?(?:anyone|anybody|someone|somebody|any (?:guests?|clients?|customers?)) (?:ask|asked|enquire|enquired|inquire|inquired|write|wrote|written|message|messaged|mention|mentioned|request|requested|say anything|said anything)(?: me| us)?(?: (?:about|for|regarding))? (.+)$/i,
    /^(?:(?:were|are) there|have there been|any) (?:any )?(?:whats\s?app )?(?:messages|requests|questions|enquiries|inquiries|mentions)(?: on whats\s?app)? (?:about|for|regarding|mentioning|asking (?:about|for)) (.+)$/i,
    /^(?:search|look) (?:through )?(?:my |the )?(?:whats\s?app|messages|chats)(?: messages| chats)? for (.+)$/i,
    /^(?:search|find|look for)(?: (?:whats\s?app|messages|chats))? (?:messages |requests )?(?:about|mentioning|regarding) (.+)$/i,
    /^who (?:asked|enquired|inquired|wrote|messaged)(?: me| us)? (?:about|for|regarding) (.+)$/i,
    /^¿?(?:alguien|algún cliente|algun cliente|algún huésped|algun huesped) (?:me |nos )?(?:ha )?(?:preguntado|preguntó|pregunto|pedido|pidió|pidio|escrito|escribió|escribio|mencionado|mencionó|menciono)(?: (?:por|sobre|acerca de))? (.+)$/i,
    /^(?:busca|buscar)(?: en)?(?: (?:whats\s?app|los mensajes|mensajes))?(?: sobre| de| por)? (.+)$/i
  ];
  /* Speech recognition can drop the opening words ("Ask about the private chef in the last seven days"). With an explicit
     time period, an asking verb or a bare "about …" is still a search; without one these stay unrecognised. */
  const CLIPPED=/^(?:(?:and|so|ok|okay|um|uh|well|anyone|anybody|someone|somebody)[,s]+)?(?:(?:ask|asked|asking|enquire|enquired|enquiring|inquire|inquired|mention|mentioned|message|messaged|request|requested|requesting)(?: me| us)? )?(?:about|for|regarding) (.+)$/i;
  function searchIntent(text){
    let t=String(text||'').replace(/[?¿!.]+$/,'').trim().replace(/^(?:(?:and|so|ok|okay|um|uh|erm|well|right|also)[,\s]+)+/i,''),days=7,m,ranged=false;
    const range=[[/\s+(?:in|over|during|within|from)?\s*(?:the )?(?:last|past|previous) (\d{1,2}|[a-z]+) days?$/i,n=>n],[/\s+(?:en )?(?:los )?(?:últimos|ultimos) (\d{1,2}|[a-z]+) d[ií]as?$/i,n=>n],[/\s+(?:in |over |during )?(?:the )?(?:last|past) (?:two|2) weeks$/i,()=>14],[/\s+(?:in |over |during )?(?:this|the last|the past|last|past) week$|\s+(?:esta|la última|la ultima) semana$/i,()=>7],[/\s+(?:in |over |during )?(?:this|the last|the past|last|past) month$|\s+(?:este|el último|el ultimo) mes$/i,()=>30],[/\s+(?:today|hoy)$/i,()=>1],[/\s+(?:yesterday|ayer)$/i,()=>2]];
    for(const [re,f] of range){m=t.match(re);if(m){const raw=m[1],n=f(raw===undefined?undefined:/^\d+$/.test(raw)?Number(raw):NUM[raw.toLowerCase()]);if(!Number.isInteger(n))return null;days=n;ranged=true;t=t.slice(0,m.index).trim();break;}}
    t=t.replace(/\s+(?:on|in|en) whats\s?app$/i,'');
    for(const re of SEARCH){m=t.match(re);if(m)break;}
    if(!m&&ranged)m=t.match(CLIPPED);
    if(!m)return null;
    const topic=m[1].replace(/^(?:a|an|the|any|some|un|una|unos|unas|el|la|los|las)\s+/i,'').replace(/\s+(?:on|in|en) whats\s?app$/i,'').trim();
    if(topic.length<2||topic.length>60||days<1||days>30)return null;
    return {kind:'search',query:topic,days};
  }
  function parse(input){
    let t=String(input||'').trim();if(!t||t.length>2200)return null;
    t=t.replace(/^(?:okay|ok)[,.!\s]+/i,'').replace(/^(?:(?:hi|hey|hello)[,\s]+)?jarvis[,!.\s]+/i,'').replace(/^(?:good morning[,\s]+)?(?:please\s+)?(?:(?:can|could|would|will) you\s+|i (?:want|need) you to\s+|i(?:['’]d| would) like (?:you )?to\s+)?(?:please\s+)?/i,'');
    if(/^(?:yes[,\s]+)?(?:please\s+)?approve and send(?: (?:it|the message|the reply))?[.!]?$/i.test(t))return {kind:'approve'};
    if(/^(?:cancel|discard)(?: (?:it|that|the (?:draft|message|reply)))?[.!]?$/i.test(t))return {kind:'cancel'};
    if(/^(?:read (?:the |my )?draft(?: again)?|repeat (?:the |my )?draft|review (?:it|the draft|the message)(?: again)?)[.!]?$/i.test(t))return {kind:'review'};
    if(/^(?:(?:can you |could you |please )?read (?:me )?(?:it|the (?:whole |full )?(?:message|draft|text)|what (?:it|you) (?:says|wrote))(?: (?:out|again|to me|in full|aloud))*(?: please)?|what does (?:it|the (?:message|draft)) say|what(?:'s| is) (?:in )?the (?:message|draft)|let me hear (?:it|the (?:message|draft)))[.!?]?$/i.test(t))return {kind:'readDraft'};
    if(/^(?:yes[,\s]*)?(?:send (?:it|that|now|the message)|confirm|approved?|yes)[.!]?$/i.test(t))return {kind:'ambiguousApproval'};
    /* Split before interpreting intent: even "approve and send" inside a dictated message is just text. */
    const split=t.match(/^(.*?)(?:\s+saying\s*:?\s*|\s+that says\s*:?\s*|\s*:\s*)([\s\S]*)$/i),head=(split?split[1]:t).replace(/\s+(?:on|in) whats\s?app[.!?]?$/i,'');
    if(/^(?:don['’]?t|do not|never|if|maybe|perhaps|he said|she said)\b/i.test(head)||/^["“'‘]/.test(t))return null;
    let m=head.match(/^(?:write|draft|prepare|send)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:whats\s?app\s+)?(?:message|reply|text)\s+(?:to|for)\s+(?:the\s+)?(group\s+)?(.+?)[.!?]?$/i);
    if(m)return {kind:'write',name:tidy(m[2]),group:!!m[1],text:split?split[2].trim():''};
    const readText=head.replace(/\s+(?:out loud|aloud|for me)[.!?]?$/i,'');
    if(!split&&/\b(?:unanswered|awaiting|waiting for (?:my|our|a) (?:reply|response)|(?:havent|haven['’]t|have not|didnt|didn['’]t|did not) (?:answered|answer|replied|reply))\b/i.test(t)&&/\b(?:whats\s?app|messages|requests|chats)\b/i.test(t))return {kind:'awaiting'};
    /* Whole natural questions only: anything longer (a topic, a contact) is left to the reasoning path. */
    const asked=readText.replace(/[.!?]+$/,'').replace(/\s+(?:on|in|from) whats\s?app$/i,'');
    if(!split&&AWAITING.some(r=>r.test(asked)))return {kind:'awaiting'};
    if(!split&&/^(?:read|check|show)(?: me)? (?:my |the )?(?:last|latest|most recent) (?:received |incoming |whats\s?app )?message(?: (?:on|in|from) whats\s?app)?[.!?]?$/i.test(readText))return {kind:'recent',limit:1};
    m=asked.match(LATEST);if(!split&&m)return {kind:'recent',limit:1,...(m[1]||m[2]?{direction:'outgoing'}:{})};
    if(!split&&LAST_SENDER.some(r=>r.test(asked)))return {kind:'recent',limit:1};
    if(!split&&/\b(?:unread|new (?:whats\s?app )?messages)\b/i.test(t)&&/\b(?:whats\s?app|messages)\b/i.test(t))return {kind:'unread'};
    if(!split){const s=searchIntent(asked);if(s)return s;}
    if(!split&&/^(?:(?:do (?:we|i) have|are there) (?:any )?(?:whats\s?app )?messages|(?:read|read out|read aloud|read out loud|check|show)(?: me)? (?:my |the )?(?:latest |recent |last )?(?:whats\s?app )?messages|read (?:my )?whats\s?app)(?: (?:on|in|from) whats\s?app)?[.!?]?$/i.test(readText))return {kind:'recent'};
    m=readText.match(/^(?:read|read out|read out loud|read aloud|show|check|what (?:are|were))\s+(?:me\s+)?(?:the\s+|my\s+)?(?:last\s+|latest\s+|recent\s+)?(?:whats\s?app\s+)?messages?\s+(?:from|with|in|for)\s+(?:the\s+)?(group\s+)?(.+?)[.!?]?$/i);
    if(!m)m=readText.match(/^(?:read|read out|read out loud|read aloud|show|check)\s+(?:me\s+)?(?:the\s+)?(group\s+)?(.+?)(?:['’]s)?\s+(?:whats\s?app\s+)?messages?[.!?]?$/i);
    if(!m)m=readText.match(/^what did\s+(group\s+)?(.+?)\s+(?:say|write)[.!?]?$/i);
    if(m)return {kind:'read',name:tidy(m[2]),group:!!m[1],...(/\b(?:last|latest)\s+(?:whats\s?app\s+)?message\b/i.test(readText)?{limit:1}:{})};
    return null;
  }
  const quote=(m,max=2000)=>{const t=String(m?.text||'');return t?'“'+(t.length>max?t.slice(0,max).replace(/\s+\S*$/,'')+'…':t)+'”':(m?.media?.label||m?.media||'an attachment, not downloaded');};
  /* ── Recipient resolution against the current chat directory (direct chats and groups) ──
     Same name apart from case, accents, punctuation or spacing → that chat. Otherwise every spoken word must match a
     chat-name word in order, allowing plural/singular, small spelling or transcription slips, words run together or
     split ("Seravillas" / "Sera Villas") and shortened names that leave chat words out. Approximate matches are never
     selected silently: one clear candidate is confirmed, several are offered as a short choice. */
  const STOP=new Set(['the','a','an','my','our','group','grupo','chat','whatsapp','whats','app','de','del','la','el','los','las','with','to','for','in','on','called','named']);
  const fold=v=>String(v||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’'`]/g,'').replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const singular=w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&/(?:ss|us|is)$/.test(w)?w:w.length>4&&/(?:ch|sh|x|z)es$/.test(w)?w.slice(0,-2):w.length>3&&w.endsWith('s')?w.slice(0,-1):w;
  const words=v=>fold(v).split(' ').filter(w=>w&&!STOP.has(w)).map(singular);
  function lev(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
  /* Spelling distance allowed for a word of this length: none for short words, one for 4–7 letters, two from 8. */
  const near=(a,b)=>{if(a===b)return 0;const n=Math.max(a.length,b.length),d=lev(a,b);return d<=(n>=8?2:n>=4?1:0)?d:Infinity;};
  /* Cheapest in-order alignment of spoken words to chat-name words. Cost: 2 per spelling edit, 1 per chat word left out,
     6 for one unmatched spoken word (only in longer names, so a real spelling match always wins). Infinity when the
     words cannot be aligned. */
  function align(said,name){
    const memo=new Map();
    const go=(i,j,dropped)=>{
      if(i===said.length)return name.length-j;
      const key=i+','+j+','+dropped;if(memo.has(key))return memo.get(key);
      let best=Infinity;
      if(j<name.length)best=Math.min(best,1+go(i,j+1,dropped));
      for(let k=1;k<=3&&j+k<=name.length;k++){const d=near(said[i],name.slice(j,j+k).join(''));if(d<Infinity)best=Math.min(best,2*d+go(i+1,j+k,dropped));}
      if(i+1<said.length&&j<name.length){const d=near(said[i]+said[i+1],name[j]);if(d<Infinity)best=Math.min(best,2*d+go(i+2,j+1,dropped));}
      if(!dropped&&said.length>=3)best=Math.min(best,6+go(i+1,j,true));
      memo.set(key,best);return best;
    };
    return go(0,0,false);
  }
  function resolve(spoken,pool){
    const compact=v=>fold(v).replace(/ /g,'');
    const said=words(spoken),scored=!said.length||said.join('').length<3?[]:pool.map(c=>({chat:c,cost:align(said,words(c.name))})).filter(x=>x.cost<Infinity).sort((a,b)=>a.cost-b.cost||(a.chat.kind==='group'?-1:1));
    const exact=compact(spoken)?pool.filter(c=>compact(c.name)===compact(spoken)):[];
    if(exact.length===1){
      /* A group and a direct chat can both fit ("cleaning team"): an exact name alone does not settle which kind was meant. */
      const rivals=scored.filter(x=>x.chat!==exact[0]&&x.chat.kind!==exact[0].kind&&x.cost<=2).map(x=>x.chat);
      return rivals.length?{exact:[],candidates:[exact[0],...rivals].slice(0,4),clear:false}:{exact};
    }
    if(exact.length)return {exact};
    if(!scored.length)return {exact:[],candidates:[]};
    const best=scored[0].cost,close=scored.filter(x=>x.cost<=best+1).slice(0,4);
    return {exact:[],candidates:close.map(x=>x.chat),clear:close.length===1};
  }
  function match(spoken,chats,{group=false}={}){
    const all=(chats||[]).filter(c=>c&&c.name);
    if(!group){const r=resolve(spoken,all);return r.exact.length||r.candidates.length?r:loose(spoken,all,false);}
    const groups=resolve(spoken,all.filter(c=>c.kind==='group'));
    if(groups.exact.length||groups.candidates.length)return groups;
    /* Asked for a group that does not exist: offer what does match, but never select it without confirmation. */
    const any=resolve(spoken,all),found=any.exact.length?any.exact:any.candidates;
    if(found.length)return {exact:[],candidates:found.slice(0,4),clear:found.length===1,groupMissing:true};
    return loose(spoken,all,true);
  }
  /* A description rather than a name ("my cleaning ladies group"): chats sharing a distinctive word with what was said
     (role words like ladies/team/group ignored). Offered as a question only, never selected by itself. */
  const ROLE=new Set(['group','grupo','chat','team','equipo','lady','girl','women','woman','staff','crew','people','gang','whatsapp','my','our','the']);
  function loose(spoken,pool,group){
    const key=words(spoken).filter(w=>w.length>=4&&!ROLE.has(w)),stem=w=>w.slice(0,5);
    if(!key.length)return {exact:[],candidates:[]};
    const hits=pool.filter(c=>words(c.name).some(n=>n.length>=4&&key.some(k=>stem(n)===stem(k))));
    const ranked=group?[...hits.filter(c=>c.kind==='group'),...hits.filter(c=>c.kind!=='group')]:hits;
    return {exact:[],candidates:ranked.slice(0,4),clear:ranked.length===1,loose:ranked.length>0};
  }
  const kindLabel=c=>c.kind==='group'?'the WhatsApp group':'a direct chat'+(/number ending/.test(c.detail||'')?' ('+String(c.detail).replace(/^Direct chat · /,'')+')':'');
  const YES=/^(?:(?:yes|yeah|yep|yup|correct|right|exactly|sure|ok|okay|si|sí|that one|that s (?:it|right|the one|correct)|thats (?:it|right|the one)|that is (?:it|right|the one|correct)|please|it is|it s)\s*)+$/;
  const NO=/^(?:no|nope|not that one|not that|wrong one|wrong|neither|none of them|neither of them)(?:\s+(?:thanks|thank you))?$/;
  const ORDINAL={one:1,two:2,three:3,four:4,first:1,second:2,third:3,fourth:4,'1':1,'2':2,'3':3,'4':4};
  function answer(text,choices){
    const t=fold(text).replace(/\b(?:jarvis|um+|uh+|er+|well)\b/g,' ').replace(/\s+/g,' ').trim();if(!t)return null;
    if(YES.test(t))return {yes:true};if(NO.test(t))return {no:true};
    const o=t.match(/^(?:(?:option|number|the)\s+)?(one|two|three|four|first|second|third|fourth|[1-4])(?:\s+(?:one|option))?$/);if(o)return {option:ORDINAL[o[1]]};
    const list=choices||[],groups=list.filter(c=>c.kind==='group'),direct=list.filter(c=>c.kind!=='group');
    if(/\b(?:group|grupo)\b/.test(t)&&!/\b(?:not|no)\b/.test(t)&&groups.length===1&&words(t.replace(/\b(?:yes|yeah|that|it|is|s|one|please)\b/g,' ')).length===0)return {chat:groups[0]};
    if(/\b(?:direct|private|personal|individual)\b/.test(t)&&direct.length===1)return {chat:direct[0]};
    const named=match(t.replace(/^(?:yes|yeah|no|the)\s+/,'').replace(/\b(?:one|ones|please)\b/g,' ').trim(),list);const hit=named.exact?.length===1?named.exact[0]:named.candidates?.length===1?named.candidates[0]:null;
    return hit?{chat:hit}:null;
  }
  /* "It's called Seravillas Cleaning Team." → "Seravillas Cleaning Team". */
  function spokenName(text){return tidy(text).replace(/^(?:(?:um+|uh+|er+|well|so|no|yes|oh)[,\s]+)*/i,'').replace(/^(?:(?:it|that|the group|the chat|the name|its name)\s*(?:['’]s|is|s)?\s+)?(?:(?:called|named)\s+)?/i,'').replace(/^(?:the\s+)?(?:group|chat)\s+(?:called\s+|named\s+)?/i,'').trim();}
  function create({fetchImpl,getToken=()=>'',now=()=>Date.now(),onChange=()=>{},compose=null}={}){
    let token='',pending=null,lastRecipient=null,lastRead=null,epoch=0,request=null,busy=false;
    /* Spoken relative time from WhatsApp seconds; the same phrase is passed to the models so they never compute it. */
    const ago=at=>{if(!(Number(at)>0))return '';const s=Math.max(0,now()/1000-Number(at));if(s<90)return 'just now';const m=Math.round(s/60);if(m<60)return m+' minutes ago';const h=Math.round(m/60);if(h<24)return h===1?'an hour ago':h+' hours ago';const d=Math.round(h/24);return d===1?'yesterday':d+' days ago';};
    const when=m=>{const t=ago(m?.at);return t?', '+t:'';};
    const line=m=>(m.from==='owner'?'You':m.kind==='group'?'In '+m.name+(m.sender?', '+m.sender:''):'From '+m.name)+when(m)+': '+quote(m);
    const dated=at=>{try{return new Date(at*1000).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return '';}};
    const speaker=m=>m.from==='owner'?'You':m.kind==='group'?(m.sender||'Someone')+' in '+m.name:m.name;
    /* "days:7|private chef|chef privado" — the PC validates and expands it; the relay sees an ordinary bounded query. */
    function searchQuery(intent){
      let q='days:'+(Number.isInteger(intent.days)&&intent.days>=1&&intent.days<=30?intent.days:7);
      for(const t of [intent.query,...(Array.isArray(intent.terms)?intent.terms:[])]){const w=String(t||'').replace(/[|]/g,' ').trim().slice(0,60);if(w&&q.length+w.length+1<=120)q+='|'+w;}
      return q;
    }
    /* Original wording, date, who/where, whether Antonio replied, nearest context and an explicit coverage note.
       English translation is added by Hermes or the live agent from the reading; this text is the untranslated fallback. */
    function searchResult(intent,data){
      const s=data.search||{},days=s.days||intent.days||7,topic=String(intent.query||s.terms?.[0]||'that'),total=data.page?.total??data.results.length,offset=intent.offset||0;
      const others=(s.expanded||[]).filter(t=>!(s.terms||[]).includes(t)).slice(0,4);
      const head=total?'I found '+(total===1?'1 message':total+' messages')+' about “'+topic+'” in the last '+days+' days'+(offset?' (continuing from result '+(offset+1)+')':'')+'.':'I found no messages about “'+topic+'” in the stored WhatsApp messages from the last '+days+' days.';
      const rows=data.results.map((r,i)=>{
        const before=(r.context||[]).filter(c=>c.position==='before').at(-1),after=(r.context||[]).find(c=>c.position==='after');
        return (offset+i+1)+'. '+speaker(r)+', '+dated(r.at)+(ago(r.at)?' ('+ago(r.at)+')':'')+': '+quote(r,300)+(r.answered?' You replied afterwards.':'')
          +(before?'\n   Before — '+speaker(before)+': '+quote(before,140):'')+(after?'\n   After — '+speaker(after)+': '+quote(after,140):'');
      });
      const more=total-offset-data.results.length,history=data.coverage?.history;
      const note=history?(history.complete?'History check: '+history.summary:'Note: '+history.summary):'Note: history coverage is unknown.';
      const spoken=[head+(others.length?' I also searched for '+others.join(', ')+'.':''),...rows,...(more>0?['There '+(more===1?'is 1 more.':'are '+more+' more.')]:[]),note+' Attachments and voice notes are not searched.'].join('\n');
      if(data.results.length===1){const r=data.results[0];lastRecipient={key:r.chat,name:r.name,kind:r.kind};}
      return {...reply(spoken),reading:{kind:'search',topic,days,terms:s.expanded||[],total,offset,nextOffset:data.page?.nextOffset??null,coverage:data.coverage,search:s,
        results:data.results.map(r=>({name:r.name,chat:r.chat,kind:r.kind,from:r.from,sender:r.sender||'',text:r.text||'',media:r.media||'',at:r.at,date:dated(r.at),ago:ago(r.at),answered:r.answered===true,matched:r.matched||[],truncated:r.truncated===true,
          context:(r.context||[]).map(c=>({position:c.position,name:c.name,kind:c.kind,from:c.from,sender:c.sender||'',text:c.text||'',media:c.media||'',at:c.at,ago:ago(c.at)}))}))}};
    }
    const snapshot=()=>pending?.stage==='review'?{stage:'review',name:pending.review.recipient.name,detail:pending.review.recipient.detail,text:pending.review.text,english:pending.english||'',language:pending.language||'',heard:pending.heard===true,understanding:pending.understanding===true,schedule:pending.schedule?{label:pending.schedule.label,scope:pending.schedule.scope,count:pending.schedule.count,note:pending.schedule.note}:null}:pending?{stage:pending.stage,name:pending.name||''}:null;
    const changed=()=>onChange(snapshot());
    const reset=()=>{pending=null;changed();};
    async function api(action,{body,...params}={},signal){
      // The health and inbox endpoints share the same owner session token. Reuse the
      // authenticated connection rather than paying for another relay status round trip.
      if(!token)token=String(getToken()||'');
      if(!token){const r=await fetchImpl(API+'status',{cache:'no-store',signal});const s=await r.json();if(!r.ok||!s.available||!s.requestToken)throw Error(s.error||'The WhatsApp inbox is not connected.');token=s.requestToken;}
      const query=Object.entries(params).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
      const res=await fetchImpl(API+action+(query?'?'+query:''),{method:body?'POST':'GET',headers:{'X-Jarvis-Session-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal});
      const data=await res.json();if(signal?.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});if(!res.ok){if(res.status===403)token='';throw Object.assign(Error(data.error||'WhatsApp could not complete that.'),{status:res.status});}return data;
    }
    const reply=(text,afterSpoken=null)=>({handled:true,text,afterSpoken});
    const LANGUAGES={es:'Spanish',ca:'Catalan',de:'German',fr:'French',hr:'Croatian',it:'Italian',nl:'Dutch',pt:'Portuguese',en:'English'};
    /* The full text is always available for the screen; speech is the concise result unless Antonio asks to hear it. */
    /* Keep the message's own ending so a question is read as a question. */
    const sentence=t=>{const v=String(t).trim();return /[.!?]$/.test(v)?v:v+'.';};
    const fullText=p=>'Message to '+p.review.recipient.name+', '+p.review.recipient.detail+'. '+sentence(p.review.text)+(p.english?' In English: '+sentence(p.english):'')+(p.schedule?.note?' '+p.schedule.note:'');
    function describe(full=false){
      if(!pending||pending.stage!=='review')return reply('There is no message ready to approve. Say “Write a message to Bex.”');
      const p=pending;p.heard=false;p.understanding=false;const said=p.said=(p.said||0)+1;changed();
      const name=p.review.recipient.name,language=String(p.language||'').slice(0,2).toLowerCase();
      const sched=p.schedule?' Cleaning schedule for '+(p.schedule.scope||p.schedule.label)+', '+p.schedule.count+' cleaning'+(p.schedule.count===1?'':'s')+'.'+(p.schedule.note?' '+p.schedule.note:''):'';
      const brief=(language&&language!=='en'&&p.english?'Translated to '+(LANGUAGES[language]||'the requested language')+' for '+name+'. Ready for review.':p.revised?'Draft updated for '+name+'.':'Draft ready for '+name+'.')+sched;
      /* Only the latest spoken summary of this exact review can arm voice approval. */
      return {...reply(full?fullText(p):brief,()=>{if(pending===p&&p.said===said&&now()<p.review.expiresAt){p.heard=true;changed();}}),full:fullText(p)};
    }
    async function review(chat,text,signal,translation={}){
      const r=await api('review',{body:{chat:chat.key,version:chat.version,text,checkedPhone:false}},signal);
      const revised=pending?.stage==='review'&&pending.key===chat.key;
      pending={stage:'review',name:chat.name,key:chat.key,version:chat.version,review:r,heard:false,revised,english:String(translation.english||'').slice(0,2000),language:String(translation.language||'').slice(0,12),schedule:translation.schedule&&typeof translation.schedule==='object'?translation.schedule:null};changed();return describe();
    }
    /* The original request (body, schedule, language) stays in pending.intent while the recipient is clarified. */
    async function find(intent,data){
      if(intent.chat){const chat=(data.chats||[]).find(c=>c.key===intent.chat&&(!intent.group||c.kind==='group'));if(chat)return chat;pending={stage:'name',intent:{...intent,chat:undefined}};changed();return reply('That chat is no longer available. Which chat should I use?');}
      const found=match(intent.name,data.chats,{group:intent.group});
      if(found.exact?.length===1)return found.exact[0];
      if(found.exact?.length>1){const choices=found.exact.slice(0,4);pending={stage:'choose',intent,choices};changed();return reply('There is more than one chat named '+choices[0].name+'. '+choices.map((c,i)=>'Option '+(i+1)+': '+c.name+', '+c.detail).join('. ')+'. Say the option number.');}
      const choices=found.candidates||[];
      if(!choices.length){pending={stage:'name',intent};changed();return reply('I can’t find a chat called '+intent.name+' in WhatsApp. Which chat should I use? You can say part of its name.');}
      const note=found.groupMissing?'I couldn’t find a group by that name. ':'';
      if(found.clear){pending={stage:'confirm',intent,choices};changed();return reply(note+'Do you mean '+choices[0].name+', '+kindLabel(choices[0])+'?');}
      pending={stage:'choose',intent,choices};changed();
      return reply(note+'Do you mean '+choices.map((c,i)=>'option '+(i+1)+', '+c.name+', '+kindLabel(c)).join('; or ')+'? Say the number or the name.');
    }
    /* A later request naming the recipient again keeps whatever the first request already said. */
    function merge(first,next){
      if(!first||first.kind!==next.kind)return next;
      const out={...first,...Object.fromEntries(Object.entries(next).filter(([,v])=>v!==undefined&&v!==''&&v!==null))};
      out.group=first.group===true||next.group===true;if(next.name&&!next.chat)delete out.chat;return out;
    }
    /* The message body for "send tomorrow's schedule": composed by the app from current cleaning records (read-only). */
    function scheduleText(intent,header=''){
      if(typeof compose!=='function')return reply('I can’t read the cleaning schedule here. Please dictate the message instead.');
      const out=compose(intent.schedule,intent.language||'en',{header});
      if(out&&typeof out==='object'){
        if(out.empty)return reply('There are no saved cleanings for '+(out.scope||out.label)+', so I haven’t prepared a message.'+(out.note?' '+out.note:''));
        if(!out.text)return reply('I couldn’t prepare that schedule from the records. Please dictate the message instead.');
        return {text:out.text,schedule:{schedule:intent.schedule,label:out.label,scope:out.scope||'',count:out.count,note:out.note||'',header,language:intent.language||''}};
      }
      return typeof out==='string'&&out.trim()&&out.length<=2000?out:reply('I couldn’t prepare that schedule from the records. Please dictate the message instead.');
    }
    const bodyOf=b=>typeof b==='string'?b:b.text;
    /* A new scope keeps a changed greeting; the scope words inside it follow the new range. */
    function keepHeader(old,next){
      if(!old?.header)return '';
      const was=old.scope||old.label,now_=next.scope||next.label;
      return was&&now_&&old.header.includes(was)?old.header.replace(was,now_):old.header;
    }
    async function selected(intent,chat,signal){
      lastRecipient={key:chat.key,name:chat.name,kind:chat.kind,detail:chat.detail};
      if(intent.kind==='write'){
        if(intent.schedule){const body=scheduleText(intent);if(body.handled)return body;const en=intent.language&&intent.language!=='en'?scheduleText({...intent,language:'en'}):'';
          return review(chat,bodyOf(body),signal,{...intent,english:en&&!en.handled?bodyOf(en):'',schedule:body.schedule||null});}
        if(!intent.text){pending={stage:'body',name:chat.name,key:chat.key,language:intent.language||''};changed();return reply('What should I say to '+chat.name+'?');}
        return review(chat,intent.text,signal,intent);
      }
      const history=intent.kind==='history',limit=Math.min(10,Math.max(1,intent.limit|| (history?10:1))),offset=intent.offset||0;
      const data=await api('inbox',{chat:chat.key,view:'history',limit,offset,direction:intent.direction||(history?'both':'incoming'),query:intent.query},signal);
      const all=(data.chat?.messages||[]).filter(m=>(history||intent.direction==='both'||intent.direction==='outgoing'?intent.direction!=='outgoing'||m.from==='owner':m.from==='contact')&&(!intent.query||normal(m.text).includes(normal(intent.query))));
      const messages=data.page?all:offset>=all.length?[]:all.slice(Math.max(0,all.length-offset-limit),all.length-offset);
      if(!messages.length)return reply('There are no matching messages in this stored window for '+chat.name+'. Older WhatsApp history is not imported.');
      reset();lastRead={kind:intent.kind,chat:chat.key,limit,offset,direction:intent.direction|| (history?'both':'incoming')};return readResult(messages.map(m=>({...m,name:chat.name,chat:chat.key,kind:chat.kind})),signal,history?'Here is part of your conversation with '+chat.name+'. ':'Here '+(messages.length===1?'is the latest message':'are the latest '+messages.length+' messages')+' from '+chat.name+'. ',{kind:intent.kind,total:data.page?.total??all.length,offset,nextOffset:data.page?data.page.nextOffset:offset+messages.length<all.length?offset+messages.length:null,coverage:data.coverage},!history&&messages.length===1?single({...messages[0],name:chat.name,kind:chat.kind},'chat'):'');
    }
    /* One message as a single natural sentence: "Your latest WhatsApp message is from Mara, 15 minutes ago: “…”". */
    function single(m,scope){
      if(m.from==='owner')return 'Your last sent message was to '+m.name+when(m)+': '+quote(m);
      const who=m.kind==='group'&&m.sender?m.sender+' in '+m.name:m.name;
      return (scope==='chat'?'The latest message from ':'Your latest WhatsApp message is from ')+who+when(m)+': '+quote(m);
    }
    function readResult(messages,signal,prefix,metadata={},spoken=''){
      const ids=messages.filter(m=>m.from!=='owner').map(m=>m.id).filter(id=>KEY.test(id||''));
      return {...reply(spoken||prefix+messages.map(line).join('\n'),async()=>{if(ids.length)try{await api('read',{body:{messages:ids.slice(0,10)}},signal);}catch{}}),reading:{kind:'read',...metadata,messages:messages.map(m=>({name:m.name,chat:m.chat,kind:m.kind,from:m.from||'contact',sender:m.sender||'',text:m.text||'',media:typeof m.media==='object'?m.media?.label:m.media||'',at:m.at||0,ago:ago(m.at),truncated:m.truncated===true}))}};
    }
    async function handle(text,{screenApproval=false,intent:resolved}={}){
      const literal=parse(text);
      // Approval, vague consent and cancellation always come from the owner's literal utterance.
      const control=['approve','cancel'].includes(literal?.kind)||literal?.kind==='ambiguousApproval'&&pending?.stage==='review';
      let intent=control?literal:resolved||literal;
      if(resolved&&!control&&!['write','read','recent','unread','history','awaiting','search','body','edit','choose','review','cancel'].includes(resolved.kind))return reply('I could not interpret that action safely. What would you like to do?');
      /* "Read the message" means the pending draft only when there is one; otherwise it is an ordinary request. */
      if(intent?.kind==='readDraft'){if(pending?.stage!=='review')return {handled:false};intent={kind:'review'};}
      if(!intent&&!pending)return {handled:false};
      if(busy)return reply('I am still completing the previous WhatsApp request. Please wait.');
      const myEpoch=++epoch;request?.abort();const controller=new AbortController();request=controller;const signal=controller.signal;
      const timer=setTimeout(()=>controller.abort(),65000),current=()=>myEpoch===epoch&&!signal.aborted;
      busy=true;
      try{
        let result;
        if(intent?.kind==='cancel'){reset();result=reply('Cancelled. Nothing was sent.');}
        else if(intent?.kind==='review')result=describe(true);
        else if(intent?.kind==='approve'){
          const p=pending;
          if(!p||p.stage!=='review')return reply('There is no reviewed message to send. Say “Write a message to Bex.”');
          if(p.understanding)return reply('First let me finish understanding your latest request, then review the message again. Nothing was sent.');
          if(now()>=p.review.expiresAt){reset();return reply('This review expired. Please dictate the message again. Nothing was sent.');}
          if(!screenApproval&&!p.heard){p.understanding=false;const said=p.said=(p.said||0)+1;return reply('Ready to send to '+p.review.recipient.name+'. Say it again to send.',()=>{if(pending===p&&p.said===said&&now()<p.review.expiresAt){p.heard=true;changed();}});}
          /* Consume before making the single send call. Even an uncertain result can never be replayed. */
          reset();let r;
          try{r=await api('send',{body:{chat:p.key,reviewToken:p.review.reviewToken,text:p.review.text}},signal);}
          catch(err){return myEpoch===epoch?reply([400,403,404,409,415,429].includes(err.status)?'Not sent. '+err.message:'I could not confirm whether it was sent. Check WhatsApp on your phone before sending again.'):null;}
          result=reply(r.status==='sent'?'Sent to '+p.review.recipient.name+'.':r.status==='uncertain'?'I could not confirm whether it was sent. Check WhatsApp on your phone before sending again.':r.message||'The message was not sent.');
        }else if(intent?.kind==='ambiguousApproval'&&!['confirm','choose','name'].includes(pending?.stage))result=reply(pending?.stage==='review'?'That wasn’t the approval phrase. It’s shown on screen, or tap the button.':'There is no reviewed message to send.');
        else if(intent?.kind==='body'||intent?.kind==='edit'||!intent&&pending?.stage==='body'){
          if(!pending||!(intent?.kind==='edit'?pending.stage==='review':pending.stage==='body'))return reply('Who should I write to, and what would you like to say?');
          let body=String(intent?.text??text).replace(/^(?:say|saying)\s+/i,'').trim(),schedule=null;
          if(intent?.schedule){
            const lang=intent.language||pending.language,probe=scheduleText({...intent,language:lang});if(probe.handled)return probe;
            const header=keepHeader(pending.schedule,probe.schedule||{}),s=header?scheduleText({...intent,language:lang},header):probe;if(s.handled)return s;body=bodyOf(s);schedule=s.schedule||null;
          }else if(intent?.kind==='edit'&&pending.schedule&&pending.review){
            const rest=t=>String(t).split('\n').slice(1).join('\n').trim(),first=String(body).split('\n')[0].trim();
            if(rest(body)&&rest(body)===rest(pending.review.text)&&first)schedule={...pending.schedule,header:first};
          }
          if(!body||body.length>2000)return reply('Keep the message between one and 2000 characters. What should I say?');
          const data=await api('inbox',{chat:pending.key,view:'voice'},signal);if(!current())return null;
          if(!data.chat){reset();return reply('That chat is no longer available. Nothing was sent.');}result=await review(data.chat,body,signal,{...intent,language:intent?.language||pending.language,schedule});
        }else if(['confirm','choose','name'].includes(pending?.stage)&&!(intent&&['write','read','history'].includes(intent.kind))){
          const p=pending,a=intent?.kind==='choose'?{option:intent.option}:answer(text,p.choices);
          let chat=null;
          if(a?.option)chat=p.choices?.[a.option-1]||null;
          else if(a?.yes&&p.choices?.length===1)chat=p.choices[0];
          else if(a?.chat)chat=a.chat;
          if(chat){reset();result=await selected(p.intent,chat,signal);}
          else if(a?.no){pending={stage:'name',intent:p.intent};changed();result=reply('Which chat should I use? Say its name as you see it in WhatsApp.');}
          else if(p.stage==='name'&&!intent&&String(text).trim()){
            reset();const data=await api('inbox',{view:'voice'},signal);if(!current())return null;
            const found=await find({...p.intent,name:spokenName(text)},data);if(!current())return null;result=found.handled?found:await selected(p.intent,found,signal);
          }else result=reply(p.stage==='confirm'?'Please say yes, no, or the chat name — or “Cancel.”':p.stage==='choose'?'Please say the option number or the chat name, or “Cancel.”':'Which chat should I use? Say its name, or “Cancel.”');
        }else if(intent?.kind==='choose'){return reply('There is no contact choice pending. Who would you like to contact?');}
        else if(!intent){reset();return {handled:false};}
        else{
          if(pending?.intent&&['confirm','choose','name'].includes(pending.stage))intent=merge(pending.intent,intent);
          reset();const scoped=['recent','unread','awaiting'].includes(intent.kind),data=await api('inbox',intent.kind==='search'?{view:'history',query:searchQuery(intent),limit:Math.min(10,intent.limit||5),offset:intent.offset||0,direction:intent.direction||'incoming'}:scoped?{view:intent.kind,limit:Math.min(intent.kind==='awaiting'?8:10,intent.limit||(intent.kind==='recent'?1:5)),offset:intent.offset||0,direction:intent.direction||'incoming'}:{view:'voice'},signal);if(!current())return null;
          if(data.connection?.state!=='open')return reply('WhatsApp is not connected right now. '+(data.connection?.message||'Check the Jarvis PC.'));
          if(intent.kind==='write'||intent.kind==='read'||intent.kind==='history'){
            const chat=await find(intent,data);if(!current())return null;result=chat.handled?chat:await selected(intent,chat,signal);
          }else if(intent.kind==='search'){
            if(!Array.isArray(data.results))return reply('The Jarvis PC needs its latest update before it can search WhatsApp.');
            result=searchResult(intent,data);
          }else if(intent.kind==='awaiting'){
            if(!Array.isArray(data.candidates)&&!Array.isArray(data.awaiting))return reply('The PC inbox needs the latest update before I can check unanswered chats.');
            const offset=intent.offset||0,limit=Math.min(8,intent.limit||5),candidates=data.candidates||data.awaiting.slice(offset,offset+limit);
            lastRecipient=candidates.length===1?{key:candidates[0].key,name:candidates[0].name,kind:candidates[0].kind}:null;
            const ack=!offset&&data.acknowledged?.total?data.acknowledged:null,names=ack?.names?.length?ack.names:null;
            const acks=!ack?'':ack.total===1&&names?'I left out '+names[0]+', who only said thanks or OK.':'I left out '+ack.total+' chats that only said thanks or OK'+(names?': '+names.join(', '):'')+'.';
            /* "Mara asked 15 minutes ago: “Can you send…”" — the PC's chosen request (else newest message), shortened for speech. */
            const about=c=>{const m=c.highlight||(c.messages||[]).at(-1)||{},t=ago(m.at);return (c.kind==='group'&&m.sender?m.sender+' in '+c.name:c.name)+(c.reason==='asked'?' asked':' wrote')+(t?' '+t:'')+': '+quote(m,160);};
            const total=data.page?.total??candidates.length,more=total-offset-candidates.length;
            const opening=offset?'Here are more chats that might need a reply.':total===1?'One chat might need a reply.':total+' chats might need a reply.';
            const spoken=candidates.length?[opening,...candidates.map(about),...(more>0?['There '+(more===1?'is 1 more.':'are '+more+' more.')]:[]),acks].filter(Boolean).join('\n'):'Nobody seems to be waiting for a reply right now.'+(acks?' '+acks:'');
            result={...reply(spoken),reading:{kind:'awaiting',candidates:candidates.map(c=>({...c,ago:ago((c.highlight||(c.messages||[]).at(-1))?.at)})),acknowledged:data.acknowledged||null,candidateCount:data.page?.total??data.awaitingCount??0,covered:candidates.length,offset,nextOffset:data.page?data.page.nextOffset:offset+candidates.length<data.awaiting.length?offset+candidates.length:null,coverage:data.coverage}};
          }else{
            const limit=Math.min(10,intent.limit||(intent.kind==='recent'?1:5));
            const latest=intent.direction==='outgoing'?(data.latestOutgoing||data.latestMessages||[]).filter(m=>m.from==='owner'):intent.direction==='both'?(data.latestMessages||[]):(data.latestIncoming||data.recentMessages||data.recent||[]);
            const messages=data.messages||(intent.kind==='unread'?(data.unread||[]).slice(0,limit):latest.slice(0,limit).reverse());
            if(!messages.length){
              /* Existing inbox content remains readable even when it predates unread tracking. */
              if(intent.kind==='recent'&&(data.chats||[]).length){
                const chat=(data.chats||[])[0];result=await selected({kind:'read'},chat,signal);
              }else result=reply('There are no '+(intent.kind==='unread'?'unread':'received')+' messages in the Jarvis inbox. Older WhatsApp history and phone read status are not synced.');
            }else{if(messages.length===1){const m=messages[0];lastRecipient={key:m.chat,name:m.name,kind:m.kind};}result=readResult(messages,signal,intent.kind==='unread'?'You have '+(data.page?.total??data.unreadCount)+' unread messages in Jarvis. ':'Here '+(messages.length===1?'is your latest WhatsApp message. ':'are your recent WhatsApp messages. '),{kind:intent.kind,total:data.page?.total??(intent.kind==='unread'?data.unreadCount:messages.length),nextOffset:data.page?.nextOffset??null,coverage:data.coverage},intent.kind==='recent'&&messages.length===1?single(messages[0],'inbox'):'');}
          }
        }
        return current()?result:null;
      }catch(err){if(myEpoch===epoch){reset();return reply(signal.aborted?'The WhatsApp inbox did not answer in time. Please try again.':err.message||'I could not reach the WhatsApp inbox.');}return null;}
      finally{clearTimeout(timer);if(myEpoch===epoch){busy=false;request=null;}}
    }
    const contact=c=>c?{key:c.key,name:c.name,kind:c.kind,detail:c.detail}:null;
    return {handle,describe,snapshot,get busy(){return busy;},hasPending:()=>!!pending,
      context:()=>({stage:pending?.stage||null,recipient:pending?contact(pending.stage==='choose'?null:{...lastRecipient,key:pending.key,name:pending.name}):null,lastRecipient:contact(lastRecipient),draft:pending?.stage==='review'?pending.review.text:'',draftSchedule:pending?.stage==='review'&&pending.schedule?{schedule:pending.schedule.schedule,label:pending.schedule.label,count:pending.schedule.count,unsavedNote:pending.schedule.note}:null,english:pending?.english||'',language:pending?.language||'',lastRead,requestedName:pending?.intent?.name||'',choices:['choose','confirm'].includes(pending?.stage)?pending.choices.map(contact):[],
        /* While a recipient is being clarified the original request is kept; the model only needs to supply the chat. */
        heldRequest:['confirm','choose','name'].includes(pending?.stage)?{kind:pending.intent.kind,hasText:!!pending.intent.text,schedule:pending.intent.schedule||'',language:pending.intent.language||''}:null}),
      /* Antonio's own short answer to a recipient question (yes / no / option / a listed name) is handled by the app. */
      answers(text){
        if(['confirm','choose'].includes(pending?.stage))return !!answer(text,pending.choices);
        /* Stage name: a short answer that is not a new WhatsApp request, question or approval is the chat name. */
        if(pending?.stage==='name'){const t=spokenName(text);return !!t&&t.split(/\s+/).length<=8&&!/\?\s*$/.test(String(text))&&!parse(text)&&!/^(?:who|what|when|where|why|how|is|are|do|does|did|can|could|would|should|will|open|show|close|cancel|stop|read|tell|add|make|change|send|write|approve)\b/i.test(t);}
        return false;
      },
      suspendApproval(){if(pending?.stage==='review'){pending.heard=false;pending.understanding=true;changed();}},
      finishUnderstanding(){if(pending?.stage==='review'){pending.understanding=false;changed();}},
      observe(data){if(pending?.stage==='review'){const c=(data.chats||[]).find(c=>c.key===pending.key);if(c&&c.version!==pending.version){reset();return true;}}return false;},
      clearPending(){epoch++;request?.abort();request=null;busy=false;reset();},
      cancel(){lastRecipient=null;epoch++;request?.abort();request=null;busy=false;reset();}};
  }
  window.SV_JARVIS_WHATSAPP_VOICE=Object.freeze({create,parse,match});
})();
