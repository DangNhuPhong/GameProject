import assert from 'node:assert/strict';
import { fitPhotoDimensions, renderCharacterPhoto, MAX_PHOTO_BYTES } from '../frontend/src/services/characterUploadImage.js';
assert.deepEqual(fitPhotoDimensions(1000,500),{width:480,height:240,left:0,top:120});
assert.deepEqual(fitPhotoDimensions(3000,4000),{width:360,height:480,left:60,top:0});
assert.deepEqual(fitPhotoDimensions(100,100),{width:480,height:480,left:0,top:0});
assert.throws(()=>fitPhotoDimensions(0,100),/dimensions/);
let closed=false,draw,fill,decodes=0;
globalThis.createImageBitmap=async(file,options)=>{
  decodes++;assert.equal(options.imageOrientation,'from-image');
  return {width:1000,height:500,close(){closed=true;}};
};
const context={fillRect(...args){fill=args;},drawImage(...args){draw=args.slice(1);}};
const canvas={getContext:()=>context,toDataURL:mime=>{assert.equal(mime,'image/png');return 'data:image/png;base64,normalized-test';}};
globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return canvas;}};
try{
  assert.equal(await renderCharacterPhoto({type:'image/jpeg',size:8*1024*1024}),'normalized-test','Large source is rendered before upload');
  assert.equal(canvas.width,480);assert.equal(canvas.height,480);
  assert.deepEqual(fill,[0,0,480,480]);assert.deepEqual(draw,[0,120,480,240]);assert.equal(closed,true);
  await assert.rejects(()=>renderCharacterPhoto({type:'image/jpeg',size:MAX_PHOTO_BYTES+1}),/20 MB/);
  await assert.rejects(()=>renderCharacterPhoto({type:'image/gif',size:1000}),/JPG/);
  assert.equal(decodes,1,'Invalid/oversized sources are rejected before decoding');
}finally{delete globalThis.createImageBitmap;delete globalThis.document;}
console.log('Passed automatic browser resize, portrait/landscape aspect, padding, orientation request, source size/type checks and bitmap cleanup.');
