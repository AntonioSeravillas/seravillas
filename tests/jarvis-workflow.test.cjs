const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'../tools/jarvis/n8n-hermes-workflow.json'),'utf8'));
const node=name=>workflow.nodes.find(n=>n.name===name);
test('n8n workflow forwards exactly the validated model request and requires both credentials',()=>{
  assert.equal(node('Jarvis request').parameters.authentication,'headerAuth');assert.equal(node('Ask Hermes').parameters.genericAuthType,'httpHeaderAuth');assert.equal(workflow.active,false);
  const body={sessionId:'conversation_123',payload:{model:'hermes-agent',messages:[{role:'system',content:'Assistant instructions'},{role:'user',content:'Hello'}]},extra:'not forwarded'};
  const result=vm.runInNewContext('(function(){'+node('Validate request').parameters.jsCode+'})()',{$input:{first:()=>({json:{body}})}});assert.equal(result[0].json.sessionId,body.sessionId);assert.equal(result[0].json.payload.stream,false);assert.equal(result[0].json.extra,undefined);
  assert.throws(()=>vm.runInNewContext('(function(){'+node('Validate request').parameters.jsCode+'})()',{$input:{first:()=>({json:{body:{...body,sessionId:'bad\r\nheader'}}})}}),/Invalid/);
});
test('n8n Ask Hermes targets the seravillas profile through the shared default gateway',()=>{
  assert.equal(node('Ask Hermes').parameters.url,'http://127.0.0.1:8642/p/seravillas/v1/chat/completions');
});
test('n8n reply normalization accepts text blocks and fails on an empty model response',()=>{
  const code='(function(){'+node('Prepare reply').parameters.jsCode+'})()';
  const result=vm.runInNewContext(code,{$input:{first:()=>({json:{choices:[{message:{content:[{type:'text',text:'Hello'},{type:'text',text:'Antonio'}]}}]}})}});assert.equal(result[0].json.reply,'Hello\nAntonio');
  assert.throws(()=>vm.runInNewContext(code,{$input:{first:()=>({json:{choices:[]}})}}),/no reply/);
});
