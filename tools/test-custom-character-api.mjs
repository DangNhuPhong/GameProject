import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { normalizeStandingCharacter } from '../backend/src/services/characterImages.js';
import { fileURLToPath } from 'node:url';
const sharp=createRequire(new URL('../backend/package.json',import.meta.url))('sharp');
// Isolated fake provider/database. Never uses real credentials or spends provider quota.
process.env.SUPABASE_URL='https://character-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_local_test';
process.env.CLOUDFLARE_ACCOUNT_ID='local-test';process.env.CLOUDFLARE_API_TOKEN='not-a-real-token';
process.env.AI_CHARACTER_COST='500';
const user='4a8612fe-b48f-4151-b345-caa4a13a5a81';
let coins=1500,character=null,providerFails=false,releaseProvider;
let providerCalls=0,invalidLayoutOnce=true,invalidLayoutAlways=false;
let providerBlocked=false;
let blockAnimation=false,invalidStanding=false;
const progress=[];
let providerGate=new Promise(resolve=>{releaseProvider=resolve;});
const jobs=[],uploads=new Map(),deleted=[];
const photo=await sharp({create:{width:100,height:100,channels:3,background:'orange'}}).png().toBuffer();
const template=fileURLToPath(new URL('../backend/assets/character-template.png',import.meta.url));
const poseImages=await Promise.all([0,1,2].map(async row=>Promise.all([0,1,3].map(col=>sharp(template)
  .extract({left:col*128,top:row*160,width:128,height:160})
  .flatten({background:'white'}).extend({left:30,right:30,top:30,bottom:30,background:'white'}).png().toBuffer()))));
const standing=poseImages[0][0];
const expectedReference=await normalizeStandingCharacter(standing);
const directionalReferences=await Promise.all([Promise.resolve(expectedReference),normalizeStandingCharacter(poseImages[1][0]),normalizeStandingCharacter(poseImages[2][0])]);
const blankSheet=await sharp({create:{width:512,height:512,channels:3,background:'white'}}).png().toBuffer();
const originalFetch=globalThis.fetch;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url||input.href);
  if(url.hostname==='api.cloudflare.com'){
    providerCalls++;
    assert.ok(options.body instanceof FormData);
    const standingRequest=options.body.get('input_image_0').name==='person.png';
    const identity=Buffer.from(await options.body.get('input_image_0').arrayBuffer());
    if(standingRequest){
      assert.equal(options.body.has('input_image_1'),false,'Standing design receives only the user photo');
      assert.equal(options.body.get('width'),'768');assert.equal(options.body.get('height'),'1024');
    }else{
      assert.equal(options.body.get('input_image_0').name,'character.png');
      assert.equal(options.body.get('input_image_1').name,'pose.png');
      const prompt=options.body.get('prompt'),direction=prompt.match(/face ONLY (FRONT|BACK|LEFT)/)?.[1],pose=prompt.match(/Requested pose: (IDLE|STEP-A|STEP-B)/)?.[1];
      assert.ok(direction&&pose);
      assert.deepEqual(identity,pose==='IDLE'?expectedReference:directionalReferences[['FRONT','BACK','LEFT'].indexOf(direction)]);
      assert.equal(options.body.get('width'),'768');assert.equal(options.body.get('height'),'1024');
    }
    const identityMeta=await sharp(identity).metadata();
    assert.equal(options.body.has('input_image_2'),false,'No reference to an existing game character at any stage');
    assert.equal(identityMeta.width,480,'The primary reference is automatically normalized to 480 pixels');
    assert.equal(identityMeta.height,480);
    await providerGate;
    if(providerFails)return json({error:'quota'},429);
    if(providerBlocked)return json({errors:[{code:3030,message:'Your output has been flagged.'}],success:false},400);
    if(!standingRequest&&blockAnimation)return json({errors:[{code:3030,message:'Your output has been flagged.'}],success:false},400);
    if(standingRequest)return json({success:true,result:{image:(invalidStanding?blankSheet:standing).toString('base64')}});
    const prompt=options.body.get('prompt'),direction=prompt.match(/face ONLY (FRONT|BACK|LEFT)/)?.[1],pose=prompt.match(/Requested pose: (IDLE|STEP-A|STEP-B)/)?.[1];
    const image=invalidLayoutAlways||invalidLayoutOnce?blankSheet:poseImages[['FRONT','BACK','LEFT'].indexOf(direction)][['IDLE','STEP-A','STEP-B'].indexOf(pose)];
    invalidLayoutOnce=false;
    return json({success:true,result:{image:image.toString('base64')}});
  }
  if(url.hostname!=='character-test.invalid')return originalFetch(input,options);
  const method=options.method||'GET',body=options.body&&typeof options.body==='string'?JSON.parse(options.body):null;
  if(url.pathname==='/auth/v1/user')return json({id:user,aud:'authenticated',role:'authenticated'});
  const functionName=url.pathname.split('/rpc/')[1];
  if(functionName){
    const job=jobs.find(j=>j.id===body.p_job);
    if(functionName==='begin_character_generation'){
      if(jobs.some(j=>j.status==='processing'))return json({code:'P0001',message:'A character is already being generated'},400);
      if(coins<body.p_cost)return json({code:'P0001',message:'Not enough coins'},400);
      coins-=body.p_cost;jobs.push({id:body.p_job,user_id:user,cost:body.p_cost,status:'processing',cleanup_paths:[],created_at:new Date().toISOString()});
    }else if(functionName==='fail_character_generation'){
      if(job.status==='processing'){job.status='failed';job.message=body.p_message;coins+=job.cost;}
    }else if(functionName==='finish_character_generation'){
      if(job.status==='processing'){
        job.cleanup_paths=character?[character.sheet_path,character.portrait_path]:[];
        character={user_id:user,version:job.id,sheet_path:body.p_sheet,portrait_path:body.p_portrait};job.status='completed';
      }
    }else throw new Error(`Unexpected RPC ${functionName}`);
    return json(null);
  }
  if(url.pathname.includes('/storage/v1/object/')){
    if(method==='DELETE'){for(const path of body.prefixes){uploads.delete(path);deleted.push(path);}return json([]);}
    const path=decodeURIComponent(url.pathname.split('/custom-characters/')[1]);uploads.set(path,options.body);
    return json({Key:path});
  }
  const table=url.pathname.split('/rest/v1/')[1];
  if(table==='profiles')return json({coins});
  if(table==='custom_characters')return json(character?[character]:[]);
  if(table==='character_generation_jobs'){
    let rows=[...jobs];
    for(const [key,value]of url.searchParams){
      if(['id','status','user_id'].includes(key)){
        if(value.startsWith('eq.'))rows=rows.filter(j=>j[key]===value.slice(3));
        if(value.startsWith('neq.'))rows=rows.filter(j=>j[key]!==value.slice(4));
      }
      if(key==='created_at'&&value.startsWith('lt.'))rows=rows.filter(j=>j.created_at<value.slice(3));
      if(key==='cleanup_paths')rows=rows.filter(j=>j.cleanup_paths.length);
    }
    if(method==='PATCH'){if(rows.length&&body.message)progress.push(body.message);rows.forEach(j=>Object.assign(j,body));return json(null);}
    if(url.searchParams.has('order'))rows.reverse();
    if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
    return json(rows);
  }
  throw new Error(`Unexpected test database call ${method} ${url.pathname}`);
};
let server;
try{
  const {default:app}=await import('../backend/src/app.js');
  server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const endpoint=`http://127.0.0.1:${server.address().port}/api/custom-character`;
  const request=(body,auth=true)=>originalFetch(endpoint,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer test-user'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await request(null,false)).status,401);
  assert.equal((await request({image:'invalid'})).status,400);assert.equal(coins,1500);
  assert.equal((await request({image:photo.toString('base64')})).status,202);assert.equal(coins,1000);
  assert.equal((await request({image:photo.toString('base64')})).status,400,'Concurrent job rejected');
  releaseProvider();
  const waitUntilDone=async()=>{
    for(let n=0;n<750;n++){
      const response=await request();const {data}=await response.json();
      if(data.job.status!=='processing')return data;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Job did not complete');
  };
  const first=await waitUntilDone();assert.equal(first.job.status,'completed');assert.equal(first.character.id,`custom:${user}`);
  assert.equal(providerCalls,10,'Nine full-body poses plus one retry cost one 500-coin job');
  assert.ok(progress.some(message=>message.startsWith('Step 1/3')));
  assert.ok(progress.some(message=>message.startsWith('Step 2/3')));
  assert.ok(progress.some(message=>message.startsWith('Step 3/3')));
  assert.equal(uploads.size,2,'Only sheet and portrait stored, no source photo');
  const version=first.character.version;
  providerFails=true;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const failed=await waitUntilDone();assert.equal(failed.job.status,'failed');assert.equal(coins,1000);
  assert.equal(providerCalls,11,'Quota errors do not trigger provider retries');
  assert.equal(failed.character.version,version,'Provider failure keeps old character');
  providerFails=false;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const replacement=await waitUntilDone();assert.equal(replacement.job.status,'completed');assert.notEqual(replacement.character.version,version);
  // Cleanup is deliberately after the atomic finish; allow it to finish before checking.
  for(let n=0;n<50&&uploads.size>2;n++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(coins,500);assert.equal(uploads.size,2);assert.equal(deleted.filter(p=>p.includes(version)).length,2);
  invalidLayoutAlways=true;
  const callsBefore=providerCalls;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const invalid=await waitUntilDone();assert.equal(invalid.job.status,'failed');assert.equal(coins,500);
  assert.equal(providerCalls-callsBefore,3,'Broken pose output gets only one shared structural retry');
  assert.equal(invalid.character.version,replacement.character.version);
  invalidLayoutAlways=false;providerBlocked=true;
  const beforeBlocked=providerCalls;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const blocked=await waitUntilDone();assert.equal(blocked.job.status,'failed');assert.equal(coins,500);
  assert.match(blocked.job.message,/blocked.*different photo/);
  assert.equal(providerCalls-beforeBlocked,1,'Provider safety rejection is reported without automatic retry');
  providerBlocked=false;blockAnimation=true;
  const beforeAnimationBlock=providerCalls;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const animationBlocked=await waitUntilDone();assert.equal(animationBlocked.job.status,'failed');assert.equal(coins,500);
  assert.equal(providerCalls-beforeAnimationBlock,2,'Animation-stage rejection refunds the entire job without retry');
  assert.equal(animationBlocked.character.version,replacement.character.version);assert.equal(uploads.size,2);
  blockAnimation=false;invalidStanding=true;
  const beforeInvalidStanding=providerCalls;
  assert.equal((await request({image:photo.toString('base64')})).status,202);
  const badStanding=await waitUntilDone();assert.equal(badStanding.job.status,'failed');assert.equal(coins,500);
  assert.equal(providerCalls-beforeInvalidStanding,2,'Invalid standing design retries once without reaching the animation step');
  console.log('Passed authenticated upload → Cloudflare multipart → normalized Storage sprites → playable metadata; concurrent rejection, quota refund, old-character preservation and replacement cleanup.');
}finally{
  releaseProvider?.();globalThis.fetch=originalFetch;
  if(server)await new Promise(resolve=>server.close(resolve));
}
