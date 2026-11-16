import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../frontend/src/services/customCharacterApi.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
let signedIn=true,reply,registered,lastBody;
const api=new Function('supabase','fetch','API_URL','registerCustomCharacter','renderCharacterPhoto',`${source};return {getCustomCharacter,generateCharacter};`)(
  {auth:{getSession:async()=>({data:{session:signedIn?{access_token:'test-token'}:null}})}},
  async(url,options)=>{
    assert.equal(url,'http://localhost:5000/api/custom-character');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    if(options.body)lastBody=JSON.parse(options.body);
    return reply;
  },'http://localhost:5000',value=>{registered=value;},async()=> 'prepared-photo');
reply=new Response(JSON.stringify({message:'Route not found'}),{status:404});
await assert.rejects(()=>api.getCustomCharacter(),error=>error.status===404&&/Restart.*backend/.test(error.message));
reply=new Response('<html>wrong service</html>',{status:200});
await assert.rejects(()=>api.getCustomCharacter(),/webpage instead of JSON/);
reply=new Response(JSON.stringify({data:{character:{id:'custom:test'},price:500}}),{status:200});
assert.equal((await api.getCustomCharacter()).price,500);
assert.equal(registered.id,'custom:test');
reply=new Response(JSON.stringify({data:{jobId:'character-job'}}),{status:202});
assert.equal((await api.generateCharacter({})).jobId,'character-job');
assert.deepEqual(lastBody,{image:'prepared-photo'},'Upload has no head-only mode or provider selection');
signedIn=false;
await assert.rejects(()=>api.getCustomCharacter(),/sign in/);
console.log('Passed AI API client route diagnostics, non-JSON response handling, authentication and successful metadata registration.');
