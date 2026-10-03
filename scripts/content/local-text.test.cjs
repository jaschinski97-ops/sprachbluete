const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateLocalText}=require('./local-text.cjs');
test('both local models use fixed loopback, model identity and JSON output',async()=>{
  for(const [provider,model] of [['local-qwen','qwen3.5-9b'],['local-gemma','gemma-4-12b']]) {
    const calls=[];
    const request=async(url,options)=>{
      calls.push({url,options});
      return url.endsWith('/models') ? Response.json({data:[{id:model}]}) : Response.json({model,choices:[{finish_reason:'stop',message:{content:'{"woerter":[]}'}}]});
    };
    const result=await generateLocalText({provider,model,system:'JSON',user:'Generate words',maxTokens:32768},request);
    assert.equal(result.model,model);
    assert.ok(calls.every(c=>c.url.startsWith('http://127.0.0.1:8090/')));
    const body=JSON.parse(calls[1].options.body);
    assert.equal(body.max_tokens,8192);
    assert.equal(body.response_format.type,'json_object');
    assert.equal(body.chat_template_kwargs.enable_thinking,false);
  }
});
test('missing or wrong model never falls back to another provider',async()=>{
  let calls=0;
  await assert.rejects(generateLocalText({provider:'local-qwen',model:'qwen3.5-9b',system:'',user:'Words'},async()=>{calls++;return Response.json({data:[{id:'gemma-4-12b'}]});}),/starten/);
  assert.equal(calls,1);
});
test('incomplete output is rejected before content parsing',async()=>{
  await assert.rejects(generateLocalText({provider:'local-gemma',model:'gemma-4-12b',system:'',user:'Words'},async url=>url.endsWith('/models')?Response.json({data:[{id:'gemma-4-12b'}]}):Response.json({model:'gemma-4-12b',choices:[{finish_reason:'length'}]})),/abgeschnitten/);
});
