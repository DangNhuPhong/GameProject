import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const sharp=createRequire(new URL('../backend/package.json',import.meta.url))('sharp');
import { preparePhoto, templateImage, normalizeStandingCharacter, normalizeSheet, normalizeAnimationRow, assembleAnimationRows, removeBackground, SpriteLayoutError } from '../backend/src/services/characterImages.js';
import { isCustomCharacter } from '../backend/src/services/customCharacterIds.js';

assert.equal(isCustomCharacter('custom:4a8612fe-b48f-4151-b345-caa4a13a5a81'),true);
assert.equal(isCustomCharacter('custom:../../anything'),false);
assert.equal(isCustomCharacter('custom:someone-else'),false);
await assert.rejects(()=>preparePhoto('not an image!'),/Upload/);
const input=await sharp({create:{width:1400,height:900,channels:3,background:'orange'}}).jpeg().toBuffer();
const photo=await preparePhoto(input.toString('base64'));
const photoMeta=await sharp(photo).metadata();
assert.equal(photoMeta.width,480);assert.equal(photoMeta.height,480);
assert.equal(photoMeta.format,'png');
assert.equal(photoMeta.channels,3,'Cloudflare receives flattened RGB rather than RGBA');
const rotated=await sharp({create:{width:120,height:60,channels:3,background:'orange'}})
  .withMetadata({orientation:6}).jpeg().toBuffer();
const normalizedRotated=await preparePhoto(rotated.toString('base64'));
const rotatedMeta=await sharp(normalizedRotated).metadata();
assert.equal(rotatedMeta.orientation,undefined,'EXIF orientation is applied and then removed');
assert.equal(rotatedMeta.exif,undefined,'Upload metadata is stripped');
const rotatedPixels=await sharp(normalizedRotated).raw().toBuffer();
assert.equal(rotatedPixels[0],255,'Portrait padding is white');
const sample=(240*480+240)*3;assert.ok(rotatedPixels[sample]>200&&rotatedPixels[sample+2]<40,'Photo remains visible inside padding');
const guide=await templateImage();
const guideMeta=await sharp(guide).metadata();
assert.equal(guideMeta.width,480);assert.equal(guideMeta.height,450);
const guidePixels=await sharp(guide).removeAlpha().raw().toBuffer();
for(let i=0;i<guidePixels.length;i+=3){
  assert.equal(guidePixels[i],guidePixels[i+1]);assert.equal(guidePixels[i],guidePixels[i+2]);
}
await assert.rejects(()=>preparePhoto(Buffer.from('<svg/>').toString('base64')));

// White shirt enclosed by a dark outline must remain opaque after white-background removal.
const parts=[];
for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const x=col*256+100+(col%2)*5,y=row*320+30;
  parts.push(`<g transform="translate(${x} ${y})"><rect width="60" height="60" fill="#bc7744" stroke="#101010" stroke-width="6"/>
    <rect y="58" width="60" height="100" fill="white" stroke="#101010" stroke-width="6"/>
    <rect y="157" width="24" height="100" fill="#20252c"/><rect x="36" y="157" width="24" height="100" fill="#20252c"/></g>`);
}
const original=await sharp(Buffer.from(`<svg width="1024" height="960"><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`)).png().toBuffer();
const standingDraft=await sharp(Buffer.from(`<svg width="256" height="320"><rect width="100%" height="100%" fill="white"/>${parts[0]}</svg>`)).png().toBuffer();
const standingReference=await normalizeStandingCharacter(standingDraft);
const standingMeta=await sharp(standingReference).metadata();
assert.equal(standingMeta.width,480);assert.equal(standingMeta.height,480);
// Light neutral provider backgrounds are removed without erasing enclosed white clothes.
const ivoryDraft=await sharp(Buffer.from(`<svg width="256" height="320"><rect width="100%" height="100%" fill="#e5e2de"/>${parts[0]}</svg>`)).png().toBuffer();
assert.deepEqual(await normalizeStandingCharacter(ivoryDraft),standingReference,'Ivory margins normalize like white margins');
const diagonal=Buffer.alloc(100*160*4,255);
for(let y=15;y<145;y++)for(let x=35+(y%2)*25;x<60+(y%2)*25;x++){
  const p=(y*100+x)*4;diagonal[p]=diagonal[p+1]=diagonal[p+2]=30;
}
assert.equal(removeBackground(diagonal,100,160).height,130,'Diagonally connected pixel rows remain one complete figure');
await assert.rejects(()=>normalizeStandingCharacter(original),error=>error instanceof SpriteLayoutError,'Standing stage must not accept a sprite sheet');
const multipleStanding=await sharp(Buffer.from(`<svg width="512" height="320"><rect width="100%" height="100%" fill="white"/>${parts.slice(0,2).join('')}</svg>`)).png().toBuffer();
await assert.rejects(()=>normalizeStandingCharacter(multipleStanding),/several characters/,'Two full-body characters cannot become the design reference');
const {sheet,portrait}=await normalizeSheet(original);
const directionalRows=[];
for(let row=0;row<3;row++)directionalRows.push(await normalizeAnimationRow(await sharp(original)
  .extract({left:0,top:row*320,width:1024,height:320}).png().toBuffer()));
assert.deepEqual((await assembleAnimationRows(directionalRows)).sheet,sheet,
  'Separate directional requests preserve frame ordering, shared scale and baseline');
await assert.rejects(()=>normalizeAnimationRow(original),/layout/,'A full multirow sheet is rejected for a single-row request');
const meta=await sharp(sheet).metadata();assert.equal(meta.width,512);assert.equal(meta.height,480);assert.equal(meta.hasAlpha,true);
const portraitMeta=await sharp(portrait).metadata();assert.equal(portraitMeta.width,128);assert.equal(portraitMeta.height,160);
const rgba=await sharp(sheet).raw().toBuffer();
assert.equal(rgba[3],0,'Cell corner is transparent');
let opaqueWhite=0;
for(let i=0;i<rgba.length;i+=4)if(rgba[i]>250&&rgba[i+1]>250&&rgba[i+2]>250&&rgba[i+3]===255)opaqueWhite++;
assert.ok(opaqueWhite>100,'White clothing survives background removal');
for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  let last=-1;
  for(let y=0;y<160;y++)for(let x=0;x<128;x++)if(rgba[((row*160+y)*512+col*128+x)*4+3])last=y;
  assert.equal(last,158,'Every frame has the same ground baseline');
}
const blank=await sharp({create:{width:1024,height:960,channels:3,background:'white'}}).png().toBuffer();
await assert.rejects(()=>normalizeSheet(blank),/unusable/);
const wrong=await sharp({create:{width:512,height:900,channels:3,background:'white'}}).png().toBuffer();
await assert.rejects(()=>normalizeSheet(wrong),/layout/);
// Nonuniform row spacing crosses the old fixed 320px boundary but preserves complete figures.
const shifted=parts.map((part,index)=>part.replace(/translate\((\d+) (\d+)\)/,(_,x,y)=>
  `translate(${Number(x)+(index%4===0?-35:0)} ${Number(y)+(Math.floor(index/4)===0?45:0)})`));
const shiftedImage=await sharp(Buffer.from(`<svg width="1024" height="960"><rect width="100%" height="100%" fill="white"/>${shifted.join('')}</svg>`)).png().toBuffer();
assert.equal((await sharp((await normalizeSheet(shiftedImage)).sheet).metadata()).height,480,'Shifted rows are separated by real gutters');
const ruledImage=await sharp(Buffer.from(`<svg width="1024" height="960"><rect width="100%" height="100%" fill="white"/>${parts.join('')}<path d="M10 620 H1010 M10 626 H1010" stroke="#444" stroke-width="2"/></svg>`)).png().toBuffer();
assert.equal((await sharp((await normalizeSheet(ruledImage)).sheet).metadata()).height,480,'Detached horizontal rules do not block frame segmentation');
// Overlapping row projections have no horizontal gutter, but all 12 figures are separate.
const staggeredParts=[];
for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  staggeredParts.push(`<rect x="${col*256+80}" y="${row*290+20+(col%2)*130}" width="64" height="200" fill="#343a42"/>`);
}
const staggeredSvg=figures=>sharp(Buffer.from(`<svg width="1024" height="960"><rect width="100%" height="100%" fill="white"/>${figures.join('')}</svg>`)).png().toBuffer();
const staggeredSheet=await normalizeSheet(await staggeredSvg(staggeredParts));
const staggeredPixels=await sharp(staggeredSheet.sheet).raw().toBuffer();
for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  let count=0,last=-1;
  for(let y=0;y<160;y++)for(let x=0;x<128;x++)if(staggeredPixels[((row*160+y)*512+col*128+x)*4+3]){count++;last=y;}
  assert.ok(count>1000,'Each recovered frame contains a complete figure');
  assert.equal(last,158,'Recovered figures share the game baseline');
}
await assert.rejects(()=>staggeredSvg(staggeredParts.slice(0,11)).then(normalizeSheet),error=>
  error instanceof SpriteLayoutError && /11 separable figures/.test(error.message) && /Grid extraction:/.test(error.reason),
  'Report the actual missing-figure count rather than masking it with the old spacing error');
await assert.rejects(()=>staggeredSvg([...staggeredParts,'<rect x="155" y="50" width="35" height="180" fill="#333"/>']).then(normalizeSheet),SpriteLayoutError,'Extra substantial figures are rejected');
await assert.rejects(()=>staggeredSvg([...staggeredParts,'<rect x="80" y="220" width="64" height="120" fill="#343a42"/>']).then(normalizeSheet),SpriteLayoutError,'Joined figures must not be split by guessing');
const touching=await sharp(Buffer.from('<svg width="100" height="160"><rect width="100%" height="100%" fill="white"/><rect x="35" y="15" width="30" height="140" fill="#222"/><rect x="49" y="0" width="2" height="20" fill="#222"/></svg>')).ensureAlpha().raw().toBuffer();
assert.equal(removeBackground(touching,100,160).top,0,'A narrow hair tip is accepted and padded during normalization');
const cropped=await sharp(Buffer.from('<svg width="100" height="160"><rect width="100%" height="100%" fill="white"/><rect x="30" y="10" width="40" height="150" fill="#222"/></svg>')).ensureAlpha().raw().toBuffer();
assert.throws(()=>removeBackground(cropped,100,160),error=>error instanceof SpriteLayoutError&&/edge/.test(error.message),'A sustained cut through the body remains rejected');
console.log('Passed upload validation, image sizing, transparent background, preserved white clothing, all 12 frame baselines and invalid output rejection.');
