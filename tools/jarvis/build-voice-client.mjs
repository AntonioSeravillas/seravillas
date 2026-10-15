/* Reproducible browser bundle. Run npm ci --prefix tools/jarvis/agents-runtime first. */
import {build} from './agents-runtime/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const vendor=fileURLToPath(new URL('../../src/assistant/vendor/',import.meta.url));
const result=await build({entryPoints:[fileURLToPath(new URL('./agents-runtime/node_modules/@elevenlabs/client/dist/platform/web/index.js',import.meta.url))],outfile:path.join(vendor,'elevenlabs-client.js'),bundle:true,format:'esm',platform:'browser',target:['safari16','chrome110'],minify:true,legalComments:'linked',metafile:true});
const packages=new Map();
for(const input of Object.keys(result.metafile.inputs)){
  let dir=path.dirname(path.resolve(input));
  while(dir!==path.dirname(dir)){
    const pkg=path.join(dir,'package.json');if(fs.existsSync(pkg)){const info=JSON.parse(fs.readFileSync(pkg,'utf8'));packages.set(info.name,{dir,info});break;}dir=path.dirname(dir);
  }
}
let notice='Pinned ElevenLabs browser client and bundled runtime dependencies. Rebuild with tools/jarvis/build-voice-client.mjs.\n';
for(const {dir,info} of packages.values()){
  notice+='\n'+info.name+' '+info.version+' — '+info.license+'\n';
  const licenses=fs.readdirSync(dir).filter(n=>/^(licen[sc]e|notice|copying)(\.|$)/i.test(n)&&fs.statSync(path.join(dir,n)).isFile());
  for(const name of licenses)notice+=fs.readFileSync(path.join(dir,name),'utf8')+'\n';
  if(!licenses.length&&info.name.startsWith('@elevenlabs/'))notice+=fs.readFileSync(path.join(vendor,'elevenlabs-LICENSE.txt'),'utf8')+'\n';
}
fs.writeFileSync(path.join(vendor,'THIRD_PARTY.txt'),notice.trimEnd()+'\n');
const bundle=path.join(vendor,'elevenlabs-client.js');fs.writeFileSync(bundle,fs.readFileSync(bundle,'utf8').replace(/[ \t]+$/gm,''));
