/* Jarvis WhatsApp inbox panel. Received names, messages and model drafts are shown as escaped text and never
   routed as commands. Sending always needs Review reply, then Approve and send. Sample inbox is fictional and local. */
(function(){
  const API='/api/jarvis/whatsapp/';
  let S=null;
  const e=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const q=(st,sel)=>st&&st.root?st.root.querySelector(sel):null;
  const REFUSED=new Set([400,403,404,409,415,429]);

  /* ── Sample inbox: fictional people, deterministic holding drafts, no network or model ── */
  function sampleInbox(){
    return {consent:{account:false,model:false,modelAvailable:false},chats:[
      {key:'sample-cleaner',kind:'direct',name:'Sample Cleaner A',detail:'Direct chat · sample',version:1,messages:[{from:'contact',text:'Hi! Is tomorrow’s 10:00 cleaning at Villa Demo Uno still on?'}],draft:{status:'ready',text:'Hi! Thanks for checking. Let me confirm and I will get back to you shortly.',source:'sample'}},
      {key:'sample-guest',kind:'direct',name:'Sample Guest',detail:'Direct chat · sample',version:1,messages:[{from:'contact',text:'Hello, could we check in a little earlier on Saturday?'}],draft:{status:'ready',text:'Hello! Thank you for your message. Let me check what is possible and I will get back to you shortly.',source:'sample'}},
      {key:'sample-group',kind:'group',name:'Sample cleaning team',detail:'WhatsApp group · sample',version:2,messages:[{from:'contact',sender:'Sample Cleaner A',text:'Who can cover Friday afternoon?'},{from:'contact',sender:'Sample Cleaner B',text:'I can do from 14:00.'}],draft:{status:'ready',text:'Thank you both! I will check Friday and confirm in this group shortly.',source:'sample'}}
    ]};
  }
  /* ── Voice/typed commands: open a received chat, or dictate text for review. Never sends, never uses AI. ── */
  const WAKE=/^(?:hey\s+|ok\s+|okay\s+)?jarvis[,:!.\s]+/i;
  const LEAD=/^(?:please[,\s]+|i\s+(?:need|want)\s+you\s+to\s+|i\s+would\s+like\s+you\s+to\s+|i['’]d\s+like\s+you\s+to\s+|you\s+should\s+)/i;
  const SEP=/\s*:\s*|\s+saying\s*:?\s+/i;
  const VERB=/\b(?:open|show|write|draft|prepare|send|message|reply|text)\b/i;
  const QUESTION=/^(?:can|could|would|will|should|shall|do|does|did|is|are|was|were|how|what|why|when|where|who|which|may|might)\b/i;
  const UNSURE=/\b(?:don['’]?t|do\s+not|not|never|no|if|maybe|perhaps|unless|whether|or|suppose|imagine)\b/i;
  const SEND_ONLY=/^(?:yes[,\s]+)?(?:(?:approve|confirm)(?:\s+and\s+send)?(?:\s+(?:it|that|the\s+(?:message|reply)))?|send(?:\s+(?:it|that|now|the\s+(?:message|reply|whats\s?app(?:\s+message)?)))?(?:\s+now)?)[.!]?$/i;
  const HELP='Say “Write a WhatsApp message to Bex saying …”.';
  const nameKey=value=>String(value||'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
  function commandTarget(raw,group,kind,text){
    const name=String(raw).replace(/[\s,;.!?]+$/,'').replace(/^["“'‘]+|["”'’]+$/g,'').trim();
    if(!name||name.length>80)return {kind:'clarify',message:'Which chat? Say the name exactly as it shows in the inbox.'};
    return kind==='open'?{kind,name,group}:{kind,name,group,text};
  }
  /* Only the command prefix is interpreted; the dictated text after "saying" or ":" is kept exactly and never read as a command. */
  function parseCommand(input){
    let t=String(input||'').trim();if(!t||t.length>2200)return null;
    t=t.replace(WAKE,'');for(let i=0;i<3;i++){const next=t.replace(LEAD,'');if(next===t)break;t=next;}t=t.trim();
    if(SEND_ONLY.test(t))return {kind:'refuse_send',message:'I can’t send by voice. Check the review on screen and press Approve and send.'};
    const sep=t.search(SEP),head=sep>=0?t.slice(0,sep):t;
    /* Read-only inbox questions are separate from dictated reply bodies. Never parse after "saying". */
    if(sep<0&&/\bwhats\s?app\b/i.test(t)&&/\b(?:unread|new messages|read (?:my |the )?messages)\b/i.test(t)&&!(/\b(?:don't|don’t|do not|never|stop)\b/i.test(t)))return {kind:'unread'};
    if(!/\bwhats\s?app\b/i.test(head)||!VERB.test(head))return null;
    const clarify=message=>({kind:'clarify',message});
    if(/^["“'‘]/.test(t)||QUESTION.test(head)||(sep<0&&/\?\s*$/.test(t))||UNSURE.test(head))return clarify('I didn’t open anything. '+HELP);
    let m=sep<0&&head.replace(/[.!]+$/,'').match(/^(?:open|show)\s+(?:the\s+|my\s+)?whats\s?app\s+(?:chat|conversation)\s+(?:with|for)\s+(the\s+group\s+)?(.+)$/i);
    if(m)return commandTarget(m[2],!!m[1],'open');
    m=head.match(/^(?:write|draft|prepare|send)\s+(?:a\s+|an\s+)?(?:new\s+)?whats\s?app\s+(?:message|reply)\s+to\s+(the\s+group\s+)?(.+)$/i);
    if(m){
      if(sep<0)return clarify('What should the message say? '+HELP);
      const lead=t.slice(sep).match(/^(?:\s*:\s*|\s+saying\s*:?\s+)/i),body=t.slice(sep+lead[0].length).trim();
      if(!body)return clarify('What should the message say? '+HELP);
      if(body.length>2000)return clarify('That message is too long. Keep it under 2000 characters.');
      return commandTarget(m[2],!!m[1],'write',body);
    }
    return clarify('I didn’t understand that WhatsApp request. '+HELP);
  }

  /* One cancellable watcher per open Jarvis. Initial history establishes a baseline, never an announcement.
     The only acknowledgement is an explicit list of messages whose playback finished (or owner marked read). */
  function createMonitor({fetchImpl=jarvisFetch,onUpdate=()=>{},onArrivals=()=>{},schedule=setTimeout,cancel=clearTimeout,delay=8000}={}){
    let stopped=false,token='',timer=null,pending=null,baseline=false;const seen=new Set(),controller=new AbortController();
    async function api(name,body){
      const timeout=AbortSignal.timeout(27000);
      /* Each request has its own deadline without invalidating the watcher's lifetime. */
      const callController=new AbortController(),cancelCall=()=>callController.abort();controller.signal.addEventListener('abort',cancelCall,{once:true});timeout.addEventListener('abort',cancelCall,{once:true});
      try{const res=await fetchImpl(API+name,{method:body?'POST':'GET',headers:{'X-Jarvis-Session-Token':token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:callController.signal});const data=await res.json();if(!res.ok)throw Error(data.error||'The WhatsApp inbox could not be reached.');return data;}
      finally{controller.signal.removeEventListener('abort',cancelCall);timeout.removeEventListener('abort',cancelCall);}
    }
    function refresh(){
      if(stopped)return Promise.resolve(null);if(pending)return pending;cancel(timer);
      pending=(async()=>{
        try{
          if(!token){const status=await api('status');if(!status.available||typeof status.requestToken!=='string')throw Error('WhatsApp is not enabled on the Jarvis PC.');token=status.requestToken;}
          const data=await api('inbox');if(stopped)return null;
          const arrivals=(data.recent||[]).filter(m=>m.unread===true&&!seen.has(m.id));
          for(const m of data.recent||[])seen.add(m.id);while(seen.size>200)seen.delete(seen.values().next().value);
          onUpdate(data);if(baseline&&arrivals.length)onArrivals(arrivals.reverse());baseline=true;return data;
        }catch(err){if(!stopped){token='';onUpdate({connection:{state:'unreachable',message:err.message},unreadCount:null});}return null;}
        finally{pending=null;if(!stopped)timer=schedule(()=>void refresh(),delay);}
      })();return pending;
    }
    return {refresh,async markRead(messages){if(stopped||!messages.length)return;await api('read',{messages:messages.slice(0,10)});},stop(){stopped=true;cancel(timer);controller.abort();}};
  }
  const sampleChat=(st,key)=>st.sample.chats.find(c=>c.key===key)||null;
  const summaryOf=c=>({key:c.key,kind:c.kind,name:c.name,detail:c.detail,version:c.version,preview:(c.messages.at(-1)||{}).text||'',draftStatus:c.draft?c.draft.status:'',sendStatus:''});
  const live=st=>S===st&&st.mode==='live';

  /* ── Server calls (live mode only). Each caller re-checks that its panel instance is still the open one. ── */
  /* Live app: the same calls go through the relay to the Jarvis PC (jarvis-transport.js); preview: same origin. */
  const transport=()=>window.SV_JARVIS_TRANSPORT||null;
  const viaRelay=()=>!!transport()?.remote?.();
  const jarvisFetch=(url,init)=>transport()?transport().fetch(url,init):fetch(url,init);
  const pollMs=()=>viaRelay()?15000:5000;
  async function call(st,name,{method='GET',body=null,query=''}={}){
    const headers={'X-Jarvis-Session-Token':st.token};if(body)headers['Content-Type']='application/json';
    const res=await jarvisFetch(API+name+query,{method,headers,cache:'no-store',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(method==='GET'?(viaRelay()?27000:8000):(viaRelay()?62000:60000))});
    let data={};try{data=await res.json();}catch{}
    if(!res.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:'The inbox could not complete that.'),{status:res.status});
    return data;
  }
  async function start(st){
    try{
      const res=await jarvisFetch(API+'status',{cache:'no-store',signal:AbortSignal.timeout(viaRelay()?22000:5000)});
      if(!live(st))return;
      if(res.status===404&&!viaRelay()){st.offline='This Jarvis server does not have the WhatsApp inbox yet. Restart it with the updated pilot to use it.';render(st);return;}
      const data=await res.json().catch(()=>({}));
      if(!live(st))return;
      if(!res.ok&&viaRelay()){st.offline=typeof data.error==='string'?data.error:'The Jarvis PC is not reachable.';render(st);return;}
      if(!res.ok||data.available!==true||typeof data.requestToken!=='string'){st.offline='The WhatsApp inbox is not enabled on this server.';render(st);return;}
      st.token=data.requestToken;st.offline='';await refresh(st);
    }catch{if(live(st)){st.offline=viaRelay()?'Not connected — the Jarvis PC is not reachable. It must be on, with Jarvis and the live relay running.':'Not connected — the local Jarvis server is not reachable.';render(st);}}
  }
  async function refresh(st){
    if(!live(st)||!st.token)return;
    clearTimeout(st.timer);
    /* Only the newest request for the chat still selected may update the panel; out-of-order answers are dropped. */
    const seq=++st.seq,selected=st.selected,current=()=>live(st)&&st.seq===seq&&st.selected===selected;
    try{const data=await call(st,'inbox',{query:selected?'?chat='+encodeURIComponent(selected):''});if(current())apply(st,data);}
    catch(err){if(current()){st.error=err.message||'The inbox could not be refreshed.';render(st);}}
    if(current())st.timer=setTimeout(()=>void refresh(st),pollMs());
  }
  /* New data never overwrites text the owner is editing; a newer chat version cancels any open review. */
  function apply(st,data){
    if(data.chat&&data.chat.key!==st.selected)data={...data,chat:null};
    const before=st.data&&st.data.chat,chat=data.chat||null;
    if(chat&&st.review&&(chat.key!==st.review.key||chat.version!==st.review.version||!chat.reviewOpen)){st.review=null;st.notice='A new message arrived, so the review was cancelled. Read it, then review again.';}
    if(chat&&before&&before.key===chat.key&&chat.version>before.version&&!st.notice)st.notice='New message in this chat.';
    if(chat){
      const same=st.editor.key===chat.key;
      if(same&&st.editor.dirty){if(st.editor.version!==chat.version&&!st.notice)st.notice='A new message arrived. Your edited text is kept; check it still fits.';}
      else if(!same||st.editor.version!==chat.version||!st.editor.dirty)st.editor={key:chat.key,version:chat.version,text:chat.draft&&chat.draft.status!=='stale'?chat.draft.text||'':'',dirty:false};
      st.editor.version=chat.version;
    }
    st.data=data;st.error='';
    if(st.intent&&advanceIntent(st))return;
    const typing=document.activeElement&&document.activeElement.id==='wa-editor';
    if(typing&&before&&chat&&before.key===chat.key&&before.version===chat.version)return;
    render(st);
  }

  /* ── Rendering: every dynamic value goes through e(). Rendering never reads the editor back. ── */
  function connectionView(c,compact=false){
    const st=(c&&c.state)||'disconnected',label={open:'Connected',qr:'Waiting for the phone to scan',connecting:'Connecting…',missing_dependencies:'Not connected — WhatsApp support is not installed',logged_out:'Not connected — the phone ended this linked device',error:'Not connected',not_configured:'Not connected',disconnected:'Not connected'}[st]||'Not connected';
    let h='<div class="wa-banner'+(st==='open'?' ok':' warn')+'" role="status"><b>'+e(label)+'</b>'+(c&&c.message?'<span>'+e(c.message)+'</span>':'')+'</div>';
    if(compact)return h;
    if(st==='qr'&&c.qr&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c.qr))h+='<img class="wa-qr" alt="Pairing code for WhatsApp Linked devices" src="'+e(c.qr)+'">';
    /* Linking, pairing and disconnecting happen on the Jarvis PC only. */
    if(viaRelay())return h+(st==='open'?'':'<p class="wa-note">Connect WhatsApp on the Jarvis PC itself.</p>');
    if(st!=='open'&&st!=='connecting'&&st!=='qr')h+='<details class="wa-setup"><summary>Connect WhatsApp</summary><p>This links Jarvis as an extra device on the business number using an unofficial method (Baileys). WhatsApp may restrict or ban numbers that use unofficial clients. Your phone keeps working as usual. Jarvis never sends without your approval.</p><label class="wa-check"><input type="checkbox" id="wa-risk"> I understand and accept this risk for the business number.</label><button class="wa-btn" data-wa="connect">Connect</button></details>';
    else h+='<button class="wa-btn ghost" data-wa="disconnect">Disconnect</button>';
    return h;
  }
  function consentView(consent){
    /* From another device only manual (written or dictated) replies are offered; AI consent stays on the PC. */
    if(viaRelay())return '<p class="wa-note">AI drafts are off when you use Jarvis from another device. Write or dictate the reply yourself.</p>';
    if(!consent||!consent.modelAvailable)return '<p class="wa-note">AI drafts are not available on this server. You can still write and review replies yourself.</p>';
    if(consent.model)return '<p class="wa-note">AI drafts are on. <button class="wa-link" data-wa="consent-off">Turn off</button></p>';
    return '<details class="wa-setup"><summary>AI drafts (off)</summary><p>When on, each new incoming text and the recent conversation are sent to your configured Nous/OpenAI model through Hermes, and kept in Hermes’s private local history. Media is never sent. Drafts are never sent automatically.</p><label class="wa-check"><input type="checkbox" id="wa-model-ack"> I agree to this processing.</label><button class="wa-btn" data-wa="consent-on">Turn on AI drafts</button></details>';
  }
  function listView(st,chats){
    const rows=(chats||[]).filter(c=>c.kind===st.tab);
    return '<div class="wa-tabs" role="tablist"><button role="tab" aria-selected="'+(st.tab==='direct')+'" data-wa="tab" data-tab="direct">Direct</button><button role="tab" aria-selected="'+(st.tab==='group')+'" data-wa="tab" data-tab="group">Groups</button></div>'
      +'<ul class="wa-list">'+(rows.length?rows.map(c=>'<li><button class="wa-chat'+(c.key===st.selected?' on':'')+'" data-wa="select" data-key="'+e(c.key)+'"><b>'+e(c.name)+'</b><small>'+e(c.detail)+'</small><span>'+e(c.preview)+'</span>'+(c.unreadCount?'<em>'+e(c.unreadCount)+' unread in Jarvis</em>':'')+(c.draftStatus==='ready'?'<em>Draft ready</em>':'')+(c.sendStatus==='uncertain'?'<em class="bad">Check phone</em>':'')+'</button></li>').join(''):'<li class="wa-empty">No '+(st.tab==='group'?'group':'direct')+' messages yet.</li>')+'</ul>';
  }
  function messageView(m,kind){
    const who=m.from==='owner'?(m.viaJarvis?'You · via Jarvis':'You'):kind==='group'?(m.sender||'Group member'):'Contact';
    return '<div class="wa-msg'+(m.from==='owner'?' me':'')+'"><small>'+e(who)+'</small>'+(m.text?'<p>'+e(m.text)+'</p>':'')+(m.media?'<p class="wa-media">'+e(m.media.label||'Attachment (not downloaded)')+'</p>':'')+'</div>';
  }
  function chatView(st,chat){
    if(!chat)return '<p class="wa-empty">Choose a chat.</p>';
    let h='<div class="wa-chat-head"><b>'+e(chat.name)+'</b><small>'+e(chat.detail)+'</small>'+(st.embedded&&!st.listOpen?'<button class="wa-text" data-wa="change-chat">Change chat</button>':'')+'</div>';
    if(st.notice)h+='<div class="wa-banner warn" role="alert">'+e(st.notice)+'</div>';
    if(st.outcome)h+='<div class="wa-banner '+(st.outcome.status==='sent'||st.outcome.status==='sample'?'ok':'warn')+'" role="status">'+e(st.outcome.text)+'</div>';
    const send=chat.lastSend;
    if(send&&send.status==='uncertain')h+='<div class="wa-banner warn" role="alert"><b>Not sure the last reply was sent.</b><span>'+e(send.error||'Check WhatsApp on the phone before sending again.')+'</span></div>';
    const messages=chat.messages||[],thread='<div class="wa-thread" aria-label="Conversation">'+messages.map(m=>messageView(m,chat.kind)).join('')+'</div>';
    /* Embedded: the target and reply come first; earlier messages are an optional disclosure below. */
    const history=st.embedded?(messages.length?'<details class="wa-history"><summary>Previous messages ('+messages.length+')</summary>'+thread+'</details>':''):'';
    if(!st.embedded)h+=thread;
    if(st.review&&st.review.key===chat.key){
      return h+'<section class="wa-review" aria-label="Review reply">'+(st.embedded?'':'<h3>Review reply</h3>')+'<dl><dt>Send to</dt><dd><b>'+e(st.review.recipient.name)+'</b> · '+e(st.review.recipient.detail)+'</dd><dt>Reply</dt><dd><pre>'+e(st.review.text)+'</pre></dd></dl>'
        +'<p class="wa-note">'+(st.mode==='sample'?'Sample only — nothing will be sent.':'This exact text will be sent to this '+(st.review.recipient.kind==='group'?'group':'contact')+'.')+'</p>'
        +(st.embedded?'<p class="wa-note">Awaiting your approval</p><div class="wa-actions wa-text-actions"><button class="wa-text" data-wa="back" aria-label="Edit this reply">Edit</button><button class="wa-text accent" data-wa="approve" aria-label="Approve and send this exact reply">Approve and send →</button></div></section>'
          :'<div class="wa-actions"><button class="wa-btn" data-wa="approve">Approve and send</button><button class="wa-btn ghost" data-wa="back">Back</button></div></section>')+history;
    }
    const draft=chat.draft,label=draft&&draft.source==='sample'?'Sample draft':draft&&draft.source==='model'?'AI draft — check before sending':'Your reply';
    h+='<section class="wa-draft"><label for="wa-editor">'+e(draft&&draft.status==='generating'?'Writing a draft…':label)+'</label>'
      +(draft&&draft.status==='failed'?'<p class="wa-note bad">'+e(draft.error||'No draft this time.')+'</p>':'')
      +(draft&&draft.status==='stale'?'<p class="wa-note">The earlier draft was cleared because the conversation changed.</p>':'')
      +'<textarea id="wa-editor" data-key="'+e(chat.key)+'" maxlength="2000" rows="5">'+e(st.editor.key===chat.key?st.editor.text:'')+'</textarea>'
      +(send&&send.status==='uncertain'&&!send.acknowledged?'<label class="wa-check"><input type="checkbox" id="wa-checked"> I checked the phone and the reply was not sent.</label>':'')
      +'<div class="wa-actions"><button class="wa-btn" data-wa="review">Review reply</button><button class="wa-btn ghost" data-wa="discard">Discard</button>'+(st.mode==='live'&&!viaRelay()&&st.data&&st.data.consent&&st.data.consent.model?'<button class="wa-btn ghost" data-wa="generate">Draft again</button>':'')+(st.mode==='sample'?'<button class="wa-btn ghost" data-wa="sample-incoming">Add sample message</button>':'')+'</div></section>';
    return h+history;
  }
  const intentView=it=>it&&(it.stage==='find'||it.stage==='choose')?'<div class="wa-banner warn" role="status"><b>'+e(it.stage==='find'?'Finding the chat “'+it.name+'”…':it.message)+'</b>'+(it.kind==='write'?'<span>Dictated message kept: '+e(it.text)+'</span>':'')+'<button class="wa-btn ghost" data-wa="cancel-intent">Cancel command</button></div>':'';
  /* Embedded (Jarvis right column): no nested dialog or second heading. The selected chat's reply comes first; the chat
     list appears only to choose or change a chat; connection, consent and sample controls sit under Inbox settings. */
  function embeddedView(st,data,chat){
    const isLive=st.mode==='live',it=st.intent,choosing=!!(it&&(it.stage==='find'||it.stage==='choose')),showList=!chat||choosing||st.listOpen;
    const state=isLive&&st.data&&st.data.connection?st.data.connection.state:'';
    let h='<div class="wa-panel wa-panel-embedded"><div class="wa-embedded-bar">'+(isLive?'':'<span class="wa-note">Sample inbox · nothing is sent</span>')+'<button class="wa-text" id="wa-close" data-wa="close" aria-label="Close WhatsApp">Close</button></div>';
    if(isLive&&st.offline)h+='<div class="wa-banner warn" role="status"><b>Not connected</b><span>'+e(st.offline)+'</span></div>';
    else if(isLive&&!st.data)h+='<div class="wa-banner" role="status">Loading…</div>';
    else if(isLive)h+=connectionView(st.data.connection,true)+'<p class="wa-note">'+e(st.data.unreadCount||0)+' unread in Jarvis. Read aloud from the Jarvis conversation. Phone read status and older history are not synced.</p>';
    if(st.error)h+='<div class="wa-banner warn" role="alert">'+e(st.error)+'</div>';
    h+=intentView(it);
    if(chat&&!choosing)h+=chatView(st,chat);
    if(data&&(!isLive||!st.offline)&&showList)h+='<nav class="wa-side" aria-label="Chats">'+listView(st,isLive?data.chats:data.chats.map(summaryOf))+'</nav>';
    h+='<details class="wa-setup wa-inbox-settings"><summary>Inbox settings</summary>'+(isLive?(st.data?connectionView(st.data.connection)+consentView(st.data.consent):'')+'<button class="wa-link" data-wa="sample">Show sample inbox</button>':'<button class="wa-link" data-wa="live">Back to live inbox</button>')+'</details>';
    return h+'</div>';
  }
  function view(st){
    const isLive=st.mode==='live',data=isLive?st.data:st.sample,chat=isLive?(st.data&&st.data.chat&&st.data.chat.key===st.selected?st.data.chat:null):(st.selected?sampleChat(st,st.selected):null);
    if(st.embedded)return embeddedView(st,data,chat);
    let h='<div class="wa-panel" role="dialog" aria-modal="true" aria-labelledby="wa-title"><header class="wa-head"><h2 id="wa-title" tabindex="-1">WhatsApp inbox</h2><button class="wa-btn ghost" id="wa-close" data-wa="close" aria-label="Close WhatsApp inbox">Close</button></header>';
    if(isLive){
      if(st.offline)h+='<div class="wa-banner warn" role="status"><b>Not connected</b><span>'+e(st.offline)+'</span></div>';
      else if(!st.data)h+='<div class="wa-banner" role="status">Loading…</div>';
      else h+=connectionView(st.data.connection)+consentView(st.data.consent);
      h+='<button class="wa-link" data-wa="sample">Show sample inbox</button>';
    }else h+='<div class="wa-banner sample" role="status"><b>Sample inbox</b><span>Fictional messages. Nothing is sent and no AI is used.</span></div><button class="wa-link" data-wa="live">Back to live inbox</button>';
    if(st.error)h+='<div class="wa-banner warn" role="alert">'+e(st.error)+'</div>';
    h+=intentView(st.intent);
    if(data&&(!isLive||!st.offline))h+='<div class="wa-body"><nav class="wa-side" aria-label="Chats">'+listView(st,isLive?data.chats:data.chats.map(summaryOf))+'</nav><main class="wa-main">'+chatView(st,chat)+'</main></div>';
    return h+'</div>';
  }
  function render(st){if(S===st&&st)st.root.innerHTML=view(st);}

  /* ── Command intent: find → (choose) → load → reviewing. Each stage runs once; anything stale is ignored. ── */
  const intentChats=st=>st.mode==='live'?(st.data&&st.data.chats)||[]:st.sample.chats.map(summaryOf);
  function advanceIntent(st){
    const it=st.intent;
    if(it.stage==='find'){
      const want=nameKey(it.name),matches=intentChats(st).filter(c=>nameKey(c.name)===want&&(!it.group||c.kind==='group'));
      if(matches.length===1){chooseIntentChat(st,matches[0]);return true;}
      it.stage='choose';st.tab=it.group?'group':st.tab;
      it.message=matches.length?'There are '+matches.length+' chats named “'+it.name+'”. Choose the right one below, or Cancel command.':'No chat named “'+it.name+'” is in the inbox. Choose a chat below, or Cancel command.';
      render(st);return true;
    }
    if(it.stage==='load'&&st.mode==='live'){
      const chat=st.data&&st.data.chat;
      if(!chat||chat.key!==it.key)return false;
      void reviewIntent(st,it,chat);return true;
    }
    return false;
  }
  function chooseIntentChat(st,summary){
    const it=st.intent;it.key=summary.key;st.tab=summary.kind==='group'?'group':'direct';
    if(it.kind==='open'){st.intent=null;selectChat(st,summary.key,true);return;}
    it.stage='load';selectChat(st,summary.key,true);
    if(st.mode==='sample'){const c=sampleChat(st,summary.key);st.intent=null;st.editor={key:c.key,version:c.version,text:it.text,dirty:true};sampleAction(st,'review');}
  }
  /* Dictated text goes into this chat's editor and through the normal protected review. Send, drafts and consent are never called. */
  async function reviewIntent(st,it,chat){
    it.stage='reviewing';st.busy=true;st.review=null;
    st.editor={key:chat.key,version:chat.version,text:it.text,dirty:true};render(st);
    try{
      const r=await call(st,'review',{method:'POST',body:{chat:chat.key,version:chat.version,text:it.text,checkedPhone:false}});
      if(!live(st)||st.intent!==it||st.selected!==chat.key)return;
      st.intent=null;st.review={key:chat.key,token:r.reviewToken,version:r.version,text:r.text,recipient:r.recipient};st.notice='';st.outcome=null;
    }catch(err){
      if(!live(st)||st.intent!==it)return;
      st.intent=null;st.notice=(err.message||'The review could not be prepared.')+' Your dictated text is in the box; press Review reply when ready.';
    }finally{if(S===st)st.busy=false;}
    render(st);void refresh(st);
  }

  /* ── Actions ── */
  function selectChat(st,key,fromIntent=false){
    if(!fromIntent&&st.intent){
      /* While choosing, a click is the deliberate choice; at any other stage a manual switch abandons the command. */
      const chosen=st.intent.stage==='choose'&&intentChats(st).find(c=>c.key===key);
      if(chosen){chooseIntentChat(st,chosen);return;}
      st.intent=null;
    }
    st.selected=key;st.listOpen=false;st.review=null;st.notice='';st.outcome=null;st.error='';
    if(st.mode==='sample'){const c=sampleChat(st,key);st.editor={key,version:c?c.version:0,text:c&&c.draft?c.draft.text:'',dirty:false};render(st);return;}
    st.editor={key,version:-1,text:'',dirty:false};render(st);void refresh(st);
  }
  async function act(st,action,target){
    if(S!==st||st.busy)return;
    if(action==='close'){close();return;}
    if(action==='tab'){st.tab=target.dataset.tab==='group'?'group':'direct';render(st);return;}
    if(action==='cancel-intent'){st.intent=null;render(st);return;}
    if(action==='change-chat'){st.listOpen=true;render(st);return;}
    if(action==='sample'){st.intent=null;st.mode='sample';clearTimeout(st.timer);st.sample=st.sample||sampleInbox();st.selected='';st.review=null;st.notice='';st.outcome=null;st.error='';render(st);return;}
    if(action==='live'){st.intent=null;st.mode='live';st.selected='';st.review=null;st.notice='';st.outcome=null;st.data=null;st.offline='';st.token='';render(st);void start(st);return;}
    if(action==='select'){selectChat(st,String(target.dataset.key||''));return;}
    if(action==='back'){st.review=null;render(st);return;}
    if(st.mode==='sample'){sampleAction(st,action);return;}
    const chat=st.data&&st.data.chat&&st.data.chat.key===st.selected?st.data.chat:null;
    st.busy=true;st.error='';
    try{
      if(action==='connect'){if(!(q(st,'#wa-risk')||{}).checked){st.error='Tick the risk box first.';render(st);return;}const r=await call(st,'connect',{method:'POST',body:{acceptRisk:true}});if(live(st)&&st.data)st.data.connection=r.connection;}
      else if(action==='disconnect'){const r=await call(st,'disconnect',{method:'POST',body:{}});if(live(st)&&st.data)st.data.connection=r.connection;}
      else if(action==='consent-on'){if(!(q(st,'#wa-model-ack')||{}).checked){st.error='Tick the agreement box first.';render(st);return;}await call(st,'model-consent',{method:'POST',body:{enabled:true,acknowledged:true}});}
      else if(action==='consent-off')await call(st,'model-consent',{method:'POST',body:{enabled:false}});
      else if(!chat)return;
      else if(action==='discard'){await call(st,'draft',{method:'POST',body:{chat:chat.key,action:'discard'}});if(live(st))st.editor={key:chat.key,version:chat.version,text:'',dirty:false};}
      else if(action==='generate'){await call(st,'draft',{method:'POST',body:{chat:chat.key,action:'generate'}});if(live(st)&&st.editor.key===chat.key)st.editor.dirty=false;}
      else if(action==='review'){
        const text=st.editor.key===chat.key?st.editor.text:'';
        const r=await call(st,'review',{method:'POST',body:{chat:chat.key,version:chat.version,text,checkedPhone:!!(q(st,'#wa-checked')||{}).checked}});
        if(live(st))st.review={key:chat.key,token:r.reviewToken,version:r.version,text:r.text,recipient:r.recipient},st.notice='',st.outcome=null;
      }else if(action==='approve'&&st.review&&st.review.key===chat.key){
        const review=st.review;st.review=null;render(st);
        try{
          const r=await call(st,'send',{method:'POST',body:{chat:review.key,reviewToken:review.token,text:review.text}});
          if(!live(st))return;
          st.outcome={status:r.status,text:r.status==='sent'?'Sent.':r.status==='uncertain'?'Not sure it was sent — check WhatsApp on the phone before trying again.':r.message||'Not sent.'};
          if(r.status==='sent'&&st.editor.key===review.key)st.editor={key:review.key,version:review.version,text:'',dirty:false};
        }catch(err){
          if(!live(st))return;
          /* Only an explicit refusal before sending is "not sent"; anything else may have reached WhatsApp. */
          st.outcome=REFUSED.has(err.status)?{status:'refused',text:'Not sent: '+(err.message||'the approval was refused.')}:{status:'uncertain',text:'Not sure whether it was sent — check WhatsApp on the phone before trying again.'};
        }
      }
    }catch(err){if(live(st))st.error=err.message||'That did not work.';}
    finally{st.busy=false;}
    if(!live(st))return;
    await refresh(st);
    render(st);
  }
  function sampleAction(st,action){
    const chat=sampleChat(st,st.selected);if(!chat)return;
    if(action==='discard'){chat.draft=null;st.editor={key:chat.key,version:chat.version,text:'',dirty:false};}
    if(action==='review'){
      const text=(st.editor.key===chat.key?st.editor.text:'').replace(/\r\n?/g,'\n').trim();
      if(!text){st.error='Write a reply first.';render(st);return;}
      st.review={key:chat.key,token:'sample',version:chat.version,text,recipient:{kind:chat.kind,name:chat.name,detail:chat.detail}};st.notice='';st.outcome=null;st.error='';
    }
    if(action==='approve'&&st.review&&st.review.key===chat.key&&st.review.version===chat.version){
      chat.messages.push({from:'owner',text:st.review.text,viaJarvis:true});chat.draft=null;st.review=null;
      st.editor={key:chat.key,version:chat.version,text:'',dirty:false};st.outcome={status:'sample',text:'Sample reply recorded — nothing sent.'};
    }
    if(action==='sample-incoming'){
      chat.messages.push(chat.kind==='group'?{from:'contact',sender:'Sample Cleaner A',text:'Update: I can also help on Saturday.'}:{from:'contact',text:'One more thing — is there parking?'});
      chat.version++;chat.draft=null;
      if(st.review){st.review=null;st.notice='A new message arrived, so the review was cancelled. Read it, then review again.';}else st.notice='New message in this chat.';
      st.outcome=null;
    }
    render(st);
  }

  function onKey(st,event){
    if(S!==st)return;
    if(event.key==='Escape'){event.preventDefault();if(st.embedded)event.stopPropagation?.();if(st.review){st.review=null;render(st);}else close();return;}
    if(event.key!=='Tab'||st.embedded)return;
    const items=[...st.root.querySelectorAll('button,input,textarea,select,summary')].filter(n=>!n.disabled&&n.getClientRects().length);
    if(!items.length)return;const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  function cleanIntent(intent){
    if(!intent||!['open','write'].includes(intent.kind)||typeof intent.name!=='string'||!intent.name.trim())return null;
    if(intent.kind==='write'&&(typeof intent.text!=='string'||!intent.text.trim()))return null;
    return {kind:intent.kind,name:intent.name.trim().slice(0,80),group:intent.group===true,text:intent.kind==='write'?intent.text.slice(0,2000):'',stage:'find',key:'',message:''};
  }
  /* Live is the default; sample:true is only for fixtures and browser tests and never happens as a fallback. */
  /* host (optional) embeds the same inbox inside another panel, such as the Jarvis desktop; the default is a standalone overlay. */
  function open({returnFocus=null,intent=null,sample=false,host=null,onClose=null}={}){
    if(S)return false;
    const embedded=!!(host&&typeof host.appendChild==='function');
    const root=document.createElement('div');root.className=embedded?'wa-root wa-embedded':'wa-root';
    const background=embedded?null:document.querySelector('.app-wrapper');
    const st={root,embedded,onClose:typeof onClose==='function'?onClose:null,mode:sample===true?'sample':'live',tab:'direct',selected:'',data:null,sample:sample===true?sampleInbox():null,token:'',offline:'',error:'',notice:'',outcome:null,review:null,editor:{key:'',version:0,text:'',dirty:false},busy:false,timer:0,seq:0,intent:cleanIntent(intent),returnFocus,background,wasInert:!!(background&&background.hasAttribute('inert'))};
    S=st;
    root.addEventListener('click',event=>{const target=event.target&&event.target.closest?event.target.closest('[data-wa]'):null;if(target)void act(st,target.dataset.wa,target);});
    /* The editor text belongs to the chat it was typed for (data-key), so it can never move to another recipient. */
    root.addEventListener('input',event=>{const t=event.target;if(S===st&&t&&t.id==='wa-editor'&&t.dataset&&t.dataset.key===st.editor.key){st.editor.text=String(t.value||'');st.editor.dirty=true;}});
    root.addEventListener('keydown',event=>onKey(st,event));
    (embedded?host:document.body).appendChild(root);background?.setAttribute('inert','');
    render(st);q(st,'#wa-title')?.focus?.();
    if(st.mode==='sample'){if(st.intent)advanceIntent(st);return true;}
    void start(st);
    return true;
  }
  /* Closing stops polling, removes the panel, restores the background (standalone only) and focus. */
  function close(){
    if(!S)return;
    const st=S;S=null;clearTimeout(st.timer);st.root.remove();
    if(st.background&&!st.wasInert)st.background.removeAttribute('inert');
    st.returnFocus?.focus?.();
    try{st.onClose?.();}catch{}
  }
  window.SV_JARVIS_WHATSAPP=Object.freeze({open,close,parseCommand,createMonitor,isOpen:()=>!!S,isEmbedded:()=>!!(S&&S.embedded)});
})();
