/* Local preview of this checkout with the real reasoning route, beside (never instead of) the running Jarvis API.
   Fictional data: the page is served on loopback, so it runs in development mode with seravillas_dev: storage and no
   cloud sync. WhatsApp is OFF here (no second linked-device socket). Typed and delegated requests use the existing
   n8n → Hermes route with this checkout's conversation contract. Live voice uses the existing ElevenLabs agent and
   starts only when the microphone is tapped (billed as usual). Keys are read from the private profile into this
   process only and never printed.
     node tools/jarvis/serve-preview.mjs [port]      default 5513 */
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {createJarvisServer} from './serve.mjs';
import {createElevenLabsAgent} from './elevenlabs-agent.mjs';
import {loadVoiceConfig} from './elevenlabs-voice.mjs';

const port=Number(process.argv[2]||5513);
if(!Number.isInteger(port)||port<1024||port>65535||[5500,8642,5678,5510,5511,5512].includes(port))throw Error('Choose a free preview port; 5500, 8642 and 5678 are live services.');
const profile=path.join(homedir(),'AppData','Local','hermes','profiles','seravillas');
const env=readFileSync(path.join(profile,'.env'),'utf8');
const apiKey=(env.split(/\r?\n/).filter(l=>/^API_SERVER_KEY=/.test(l)).pop()||'').slice(15).trim().replace(/^["']|["']$/g,'');
const n8nKey=readFileSync(path.join(profile,'jarvis-n8n.key'),'utf8').trim();
const liveVoice=createElevenLabsAgent({config:loadVoiceConfig()});
createJarvisServer({port,route:'n8n',apiKey,n8nKey,whatsapp:null,liveVoice,speechProvider:null})
  .listen(port,'127.0.0.1',()=>console.log('Jarvis preview: http://127.0.0.1:'+port+' · n8n → Hermes · WhatsApp off · fictional data'+(liveVoice?' · live voice on microphone tap':'')));
