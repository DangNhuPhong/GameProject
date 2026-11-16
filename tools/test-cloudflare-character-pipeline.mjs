import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCloudflareCharacter } from '../backend/src/services/cloudflareCharacters.js';
import { normalizeStandingCharacter } from '../backend/src/services/characterImages.js';
const sharp=createRequire(new URL('../backend/package.json',import.meta.url))('sharp');
const template=fileURLToPath(new URL('../backend/assets/character-template.png',import.meta.url));
const poseImage=(row,col)=>sharp(template).extract({left:col*128,top:row*160,width:128,height:160})
  .flatten({background:'white'}).extend({left:30,right:30,top:30,bottom:30,background:'white'}).png().toBuffer();
const standing=await poseImage(0,0);
const frames=await Promise.all([[0,1],[0,3],[1,0],[1,1],[1,3],[2,0],[2,1],[2,3]].map(([row,col])=>poseImage(row,col)));
const references=await Promise.all([standing,frames[2],frames[5]].map(normalizeStandingCharacter));
const blank=await sharp({create:{width:768,height:1024,channels:3,background:'white'}}).png().toBuffer();
const originalFetch=globalThis.fetch;
let replies=[],calls=[],prompts=[],inputs=[];
globalThis.fetch=async(url,options)=>{
  assert.ok(String(url).startsWith('https://api.cloudflare.com/'),'Cloudflare is the only provider');
  const form=options.body,name=form.get('input_image_0').name;
  calls.push(name);prompts.push(form.get('prompt'));
  inputs.push(Buffer.from(await form.get('input_image_0').arrayBuffer()));
  assert.equal(form.get('width'),'768');assert.equal(form.get('height'),'1024');
  if(name==='person.png')assert.equal(form.has('input_image_1'),false,'No existing character is supplied as style');
  else{
    assert.equal(form.get('input_image_1').name,'pose.png');
    const guide=await sharp(Buffer.from(await form.get('input_image_1').arrayBuffer())).metadata();
    assert.equal(guide.width,480);assert.equal(guide.height,480);
  }
  assert.equal(form.has('input_image_2'),false);
  const reply=replies.shift();assert.ok(reply,'No unexpected provider requests');
  return new Response(JSON.stringify(reply==='blocked'?{errors:[{message:'Your output has been flagged.'}]}:
    {success:true,result:{image:reply.toString('base64')}}),{status:reply==='blocked'?400:200,headers:{'Content-Type':'application/json'}});
};
const reset=images=>{replies=images;calls=[];prompts=[];inputs=[];};
try {
  reset([standing,...frames]);
  const result=await createCloudflareCharacter(standing);
  assert.equal(calls.length,9,'Nine complete poses, no head-only composition');
  assert.equal((await sharp(result.sheet).metadata()).height,480);
  for(const index of [1,2,3,6])assert.deepEqual(inputs[index],references[0]);
  for(const index of [4,5])assert.deepEqual(inputs[index],references[1]);
  for(const index of [7,8])assert.deepEqual(inputs[index],references[2]);
  for(const prompt of prompts)assert.match(prompt,/full-body/);
  for(let row=0;row<3;row++){
    const cell=col=>sharp(result.sheet).extract({left:col*128,top:row*160,width:128,height:160}).raw().toBuffer();
    assert.deepEqual(await cell(0),await cell(2),'Idle copies are pixel-identical');
  }
  reset([blank,standing,...frames]);
  assert.ok((await createCloudflareCharacter(standing)).sheet);assert.equal(calls.length,10);
  reset([standing,...frames.slice(0,3),blank,...frames.slice(3)]);
  assert.ok((await createCloudflareCharacter(standing)).sheet);assert.equal(calls.length,10);
  assert.deepEqual(inputs[4],inputs[5],'Retry keeps the same direction reference');
  reset([blank,standing,blank]);
  await assert.rejects(()=>createCloudflareCharacter(standing),/FRONT step-a/);assert.equal(calls.length,3);
  reset([standing,blank,blank]);
  await assert.rejects(()=>createCloudflareCharacter(standing),/FRONT step-a/);assert.equal(calls.length,3);
  reset([blank,blank]);
  await assert.rejects(()=>createCloudflareCharacter(standing),/Standing character/);
  reset(['blocked']);
  await assert.rejects(()=>createCloudflareCharacter(standing),/blocked/);assert.equal(calls.length,1);
  reset([standing,frames[0],'blocked']);
  await assert.rejects(()=>createCloudflareCharacter(standing),/blocked/);assert.equal(calls.length,3);
  console.log('Passed Cloudflare-only full-body poses, directional references, shared retry budget, sprite assembly and safety handling.');
} finally {globalThis.fetch=originalFetch;}
