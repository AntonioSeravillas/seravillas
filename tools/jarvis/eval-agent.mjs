/* Private TEST COPY of the live agent for the operations evaluation. The production agent is only read, never changed.
   The copy is ElevenLabs' own duplicate of the production agent: same LLM, thinking budget, voice, speed, privacy,
   authentication, prompt and tools. That tests the hosted agent exactly as it is today.
     node tools/jarvis/eval-agent.mjs --prepare             duplicate only; saves the copy's ID to ../jarvis-checks
     node tools/jarvis/eval-agent.mjs --prepare --template  also replace the copy's prompt/tools with this checkout's
                                                            template (the proposed hosted update), for comparison
     node tools/jarvis/eval-agent.mjs --delete    delete the copy (refuses the production agent)
   Creating, patching or deleting an agent uses no conversation credits; conversations with the copy are billed. */
import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LIVE_PROMPT,agentConfiguration} from './elevenlabs-agent-config.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const RECORD=path.resolve(here,'../../../jarvis-checks/operations-eval-agent.json');
const API='https://api.elevenlabs.io/v1/convai/agents/';
const config=JSON.parse(readFileSync(path.join(homedir(),'AppData','Local','hermes','profiles','seravillas','jarvis-elevenlabs.json'),'utf8'));
const headers={'xi-api-key':config.apiKey,'Content-Type':'application/json'};
const call=async(method,url,body)=>{const r=await fetch(url,{method,headers,redirect:'error',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(method+' agent HTTP '+r.status);return r.status===204?null:r.json().catch(()=>null);};
const valid=id=>/^agent_[a-zA-Z0-9]{15,80}$/.test(id||'');

if(process.argv.includes('--prepare')){
  if(existsSync(RECORD))throw Error('A test copy is already recorded. Delete it first.');
  const production=await call('GET',API+config.liveAgentId);
  const prompt=production?.conversation_config?.agent?.prompt||{};
  /* Only proceed when production uses inline client tools like the template; anything else needs review first. */
  if(process.argv.includes('--template')&&Array.isArray(prompt.tool_ids)&&prompt.tool_ids.length)throw Error('Production uses shared tool IDs; a template copy needs a different setup. Nothing was created.');
  const copy=await call('POST',API+config.liveAgentId+'/duplicate',{name:'Jarvis Seravillas · operations TEST (fictional data)'});
  const id=copy?.agent_id;if(!valid(id)||id===config.liveAgentId)throw Error('Unexpected duplicate result.');
  writeFileSync(RECORD,JSON.stringify({agentId:id,createdAt:new Date().toISOString(),purpose:'Operations understanding evaluation with fictional data. Delete after use.'},null,1));
  const template=agentConfiguration(production.conversation_config.tts.voice_id).conversation_config.agent.prompt;
  /* The copy has its own daily cap, so tests never use up the production agent's 20 conversations a day. */
  await call('PATCH',API+id,{...(process.argv.includes('--template')?{conversation_config:{agent:{prompt:{prompt:LIVE_PROMPT,tools:template.tools}}}}:{}),platform_settings:{call_limits:{agent_concurrency_limit:1,daily_limit:30,bursting_enabled:false}}});
  const check=await call('GET',API+id),p=check.conversation_config.agent.prompt;
  console.log(JSON.stringify({testAgent:'saved to jarvis-checks/operations-eval-agent.json',llm:p.llm,thinkingBudget:p.thinking_budget,sameLlmAsProduction:p.llm===prompt.llm&&p.thinking_budget===prompt.thinking_budget,tools:(p.tools||[]).map(t=>t.name),prompt:process.argv.includes('--template')?'checkout template':'same as production',textOnlyAllowed:check.platform_settings?.overrides?.conversation_config_override?.conversation?.text_only===true}));
}else if(process.argv.includes('--delete')){
  const {agentId}=JSON.parse(readFileSync(RECORD,'utf8'));
  if(!valid(agentId)||agentId===config.liveAgentId)throw Error('Refusing to delete that agent.');
  await call('DELETE',API+agentId);rmSync(RECORD);console.log('Test copy deleted.');
}else console.log('Use --prepare or --delete. Owner approval is required first.');
