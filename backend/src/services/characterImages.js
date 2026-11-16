import sharp from 'sharp';
// Style is described in words: real character artwork is never sent as a reference.
const PIXEL_STYLE = `Draw a compact 2D chibi pixel-game sprite: large rounded head about half the figure height, small torso, short arms and legs, large expressive eyes, tiny nose and mouth, clear dark stepped outlines, flat color clusters and two or three shading tones per material. Use a restrained palette based on the uploaded person's own hair, skin and outfit colors. Render crisp square pixel edges and simplify tiny details into pixel clusters. No realistic adult body proportions, smooth vector illustration, airbrushed gradients, 3D rendering or photographic textures. Preserve the person's identity while translating it into these proportions.`;

export async function preparePhoto(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(base64) || base64.length > 7000000) {
    throw new Error('Upload a JPG, PNG or WebP image smaller than 5 MB.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MB.');
  const image = sharp(bytes, { limitInputPixels: 20000000 });
  const meta = await image.metadata();
  if (!['jpeg','png','webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw new Error('Use a still JPG, PNG or WebP image.');
  return image.rotate().resize(480,480,{fit:'contain',background:'#ffffff'})
    .toColourspace('srgb').flatten({background:'#ffffff'}).png().toBuffer();
}

export async function templateImage() {
  // Geometry-only mannequins: never send an existing chef's identity/clothes to the model.
  const poses=[];
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const stride=col===1?1:col===3?-1:0;
    const head=row===2
      ? '<path d="M77 40 A18 20 0 1 0 42 44 L36 49 L43 52 Q43 63 57 64 L68 62 Z"/>'
      : '<ellipse cx="64" cy="43" rx="21" ry="22"/>';
    const face=row===0
      ? '<circle cx="57" cy="42" r="1.5" fill="#777"/><circle cx="71" cy="42" r="1.5" fill="#777"/>'
      :row===2?'<circle cx="47" cy="42" r="1.5" fill="#777"/>':'';
    const arms=row===2
      ? `<path d="M60 76 L${60+stride*18} 100 M66 76 L${66-stride*18} 100"/>`
      :`<path d="M51 76 L45 ${100+(row===0?1:-1)*stride*5} M77 76 L83 ${100-(row===0?1:-1)*stride*5}"/>`;
    const legs=row===2
      ? `<path d="M60 105 L${60-stride*19} 136 M66 105 L${66+stride*19} 136"/>`
      :`<path d="M57 105 L55 ${135+(row===0?-1:1)*stride*4} M71 105 L73 ${135-(row===0?-1:1)*stride*4}"/>`;
    poses.push(`<g transform="translate(${col*128} ${row*160})" fill="#bcbcbc" stroke="#777" stroke-width="2" stroke-linejoin="round">${head}${face}
      <path d="M57 66 L71 66 L78 79 L75 106 L53 106 L50 79 Z"/>
      <g fill="none" stroke="#999" stroke-width="9" stroke-linecap="round">${arms}${legs}</g></g>`);
  }
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="480"><rect width="512" height="480" fill="white"/>${poses.join('')}</svg>`))
    .resize(480,450,{kernel:'nearest'}).png().toBuffer();
}

// Remove only edge-connected near-white background, preserving white clothing.
function clearEdgeBackground(data, width, height) {
  // Some providers return ivory/light gray even when pure white is requested.
  // Adapt only to a dominant light neutral border, never arbitrary clothing colors.
  const border=[];
  const sample=(x,y)=>{const p=(y*width+x)*4;if(data[p+3]>=24)border.push([data[p],data[p+1],data[p+2]]);};
  for(let x=0;x<width;x++){sample(x,0);sample(x,height-1);}
  for(let y=1;y<height-1;y++){sample(0,y);sample(width-1,y);}
  const median=channel=>border.map(pixel=>pixel[channel]).sort((a,b)=>a-b)[Math.floor(border.length/2)];
  const background=border.length?[median(0),median(1),median(2)]:null;
  const isNeutral=pixel=>Math.min(...pixel)>=210 && Math.max(...pixel)-Math.min(...pixel)<=24;
  const adaptive=background && isNeutral(background) && border.filter(pixel=>
    pixel.every((value,c)=>Math.abs(value-background[c])<=16)).length>=border.length*.8;
  const seen = new Uint8Array(width*height);
  const queue = new Int32Array(width*height);
  let head=0, tail=0;
  const visit = (i) => {
    if (seen[i]) return;
    seen[i]=1;
    const p=i*4;
    if (data[p+3] < 24 || (data[p]>235 && data[p+1]>235 && data[p+2]>235) ||
      (adaptive && isNeutral([data[p],data[p+1],data[p+2]]) && background.every((value,c)=>Math.abs(data[p+c]-value)<=20))) queue[tail++]=i;
  };
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){
    const i=queue[head++],x=i%width,y=Math.floor(i/width);
    data[i*4+3]=0;
    if(x)visit(i-1);if(x+1<width)visit(i+1);
    if(y)visit(i-width);if(y+1<height)visit(i+width);
  }
}

export class SpriteLayoutError extends Error {
  constructor(message){super(message);this.name='SpriteLayoutError';}
}

export function removeBackground(data, width, height, {singleFigure=false}={}) {
  clearEdgeBackground(data,width,height);
  // Keep the largest connected silhouette; discard floating generation artifacts.
  const visited=new Uint8Array(width*height); let largest=[],figureCount=0;
  for(let i=0;i<visited.length;i++){
    if(visited[i] || data[i*4+3]<32)continue;
    const component=[i];visited[i]=1;
    let minY=height,maxY=0;
    for(let k=0;k<component.length;k++){
      const p=component[k],x=p%width,y=Math.floor(p/width);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      // Diagonal pixels belong to the same outline in pixel art.
      for(const n of [x?p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1,
        x&&y?p-width-1:-1,x+1<width&&y?p-width+1:-1,
        x&&y+1<height?p+width-1:-1,x+1<width&&y+1<height?p+width+1:-1]){
        if(n>=0&&!visited[n]&&data[n*4+3]>=32){visited[n]=1;component.push(n);}
      }
    }
    if(component.length>width*height*.025 && maxY-minY>height*.4)figureCount++;
    if(component.length>largest.length)largest=component;
  }
  if(singleFigure && figureCount>1)throw new SpriteLayoutError('AI returned several characters instead of one standing character. Please try again.');
  if(largest.length<width*height*.025 || largest.length>width*height*.85){
    const error=new SpriteLayoutError('AI returned an unusable frame. Please try again.');
    error.reason=largest.length<width*height*.025?'missing_or_fragmented_figure':'background_not_separated';
    throw error;
  }
  const keep=new Uint8Array(width*height);let left=width,top=height,right=0,bottom=0;
  for(const i of largest){keep[i]=1;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  for(let i=0;i<keep.length;i++)if(!keep[i])data[i*4+3]=0;
  // A single hair tip or antialiased pixel touching an edge is not proof of truncation.
  // Reject sustained edge contact, as found when a limb/body is visibly cut through.
  const longestRun=(length,pixel)=>{
    let longest=0,current=0;
    for(let i=0;i<length;i++){current=data[pixel(i)*4+3]>=32?current+1:0;longest=Math.max(longest,current);}
    return longest;
  };
  const horizontalLimit=Math.max(6,Math.floor(width*.08)),verticalLimit=Math.max(6,Math.floor(height*.08));
  if(longestRun(width,x=>x)>horizontalLimit||longestRun(width,x=>(height-1)*width+x)>horizontalLimit||
    longestRun(height,y=>y*width)>verticalLimit||longestRun(height,y=>y*width+width-1)>verticalLimit){
    throw new SpriteLayoutError('AI cut through a character at the image edge. Please try again.');
  }
  if(bottom-top+1<height*.45 || right-left+1<width*.1)throw new SpriteLayoutError('AI did not return a complete full-body character. Please try again.');
  return {left,top,width:right-left+1,height:bottom-top+1};
}

// The intermediate design exists only in memory, and must also fit the reference limit.
export async function normalizeStandingCharacter(bytes){
  const {data,info}=await sharp(bytes,{limitInputPixels:10000000})
    .resize(1024,1280,{fit:'inside',withoutEnlargement:true,kernel:'nearest'})
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bounds=removeBackground(data,info.width,info.height,{singleFigure:true});
  const scale=Math.min(360/bounds.width,420/bounds.height);
  const width=Math.max(1,Math.round(bounds.width*scale)),height=Math.max(1,Math.round(bounds.height*scale));
  const figure=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(bounds)
    .resize(width,height,{kernel:'nearest'}).png().toBuffer();
  return sharp({create:{width:480,height:480,channels:3,background:'#ffffff'}})
    .composite([{input:figure,left:Math.floor((480-width)/2),top:450-height}]).png().toBuffer();
}

// Canonical pose references all use the same 480px canvas and sizing rules.
export async function frameFromPoseReference(bytes) {
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bounds=removeBackground(data,info.width,info.height,{singleFigure:true});
  return {data,bounds,width:info.width,height:info.height};
}

// Find real blank gutters near the requested grid rather than cutting through shifted figures.
function gridCuts(projection,count,otherLength){
  const cuts=[0],step=projection.length/count,noiseLimit=Math.max(1,Math.floor(otherLength*.002));
  for(let index=1;index<count;index++){
    const expected=index*step,lo=Math.round(expected-step*.28),hi=Math.round(expected+step*.28);
    const gaps=[];
    for(let i=lo;i<=hi;){
      if(projection[i]>noiseLimit){i++;continue;}
      const start=i;while(i<=hi&&projection[i]<=noiseLimit)i++;
      if(i-start>=3)gaps.push({center:Math.round((start+i-1)/2),width:i-start});
    }
    gaps.sort((a,b)=>Math.abs(a.center-expected)-Math.abs(b.center-expected)||b.width-a.width);
    if(!gaps.length)throw new SpriteLayoutError('AI did not leave enough space between animation frames. Please try again.');
    cuts.push(gaps[0].center);
  }
  cuts.push(projection.length);return cuts;
}

function clearDetachedGridLines(data,width,height){
  const visited=new Uint8Array(width*height),queue=new Int32Array(width*height);
  for(let start=0;start<visited.length;start++){
    if(visited[start]||data[start*4+3]<32)continue;
    let head=0,tail=1,left=width,right=0,top=height,bottom=0;queue[0]=start;visited[start]=1;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const n of [x?p-1:-1,x+1<width?p+1:-1,y?p-width:-1,y+1<height?p+width:-1]){
        if(n>=0&&!visited[n]&&data[n*4+3]>=32){visited[n]=1;queue[tail++]=n;}
      }
    }
    const w=right-left+1,h=bottom-top+1;
    if((w>width*.5&&h<=height*.025)||(h>height*.5&&w<=width*.025)){
      for(let k=0;k<tail;k++)data[queue[k]*4+3]=0;
    }
  }
}

async function gridFrames(raw,width=1024,sourceHeight=960,rowCount=3) {
  const rows=new Uint32Array(sourceHeight);
  for(let y=0;y<sourceHeight;y++)for(let x=0;x<width;x++)if(raw[(y*width+x)*4+3]>=32)rows[y]++;
  if(!rows.some(Boolean))throw new SpriteLayoutError('AI returned an unusable frame. Please try again.');
  const rowCuts=gridCuts(rows,rowCount,width),frames=[];
  for(let row=0;row<rowCount;row++){
    const top=rowCuts[row],height=rowCuts[row+1]-top;
    const columns=new Uint32Array(width);
    for(let y=top;y<top+height;y++)for(let x=0;x<width;x++)if(raw[(y*width+x)*4+3]>=32)columns[x]++;
    const columnCuts=gridCuts(columns,4,height);
    for(let col=0;col<4;col++){
      const frameWidth=columnCuts[col+1]-columnCuts[col];
      const data=await sharp(raw,{raw:{width,height:sourceHeight,channels:4}})
        .extract({left:columnCuts[col],top,width:frameWidth,height}).raw().toBuffer();
      let bounds;
      try { bounds=removeBackground(data,frameWidth,height,{singleFigure:true}); }
      catch(error){
        if(error instanceof SpriteLayoutError)error.message=`Animation frame ${row*4+col+1}/${rowCount*4}: ${error.message}`;
        throw error;
      }
      frames.push({data,bounds,width:frameWidth,height});
    }
  }
  return frames;
}

// Staggered figures can overlap in projection without touching one another.
// Recover only when exactly 12 substantial, disconnected figures form three ordered rows.
async function componentFrames(raw,width=1024,height=960,rowCount=3) {
  const seen=new Uint8Array(width*height),queue=new Int32Array(width*height),figures=[];
  for(let start=0;start<seen.length;start++){
    if(seen[start]||raw[start*4+3]<32)continue;
    let head=0,tail=1,left=width,right=0,top=height,bottom=0;
    queue[0]=start;seen[start]=1;
    while(head<tail){
      const p=queue[head++],x=p%width,y=Math.floor(p/width);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const n=ny*width+nx;
        if(!seen[n]&&raw[n*4+3]>=32){seen[n]=1;queue[tail++]=n;}
      }
    }
    if(tail<500||bottom-top<80||right-left<15)continue;
    // Do not add padding to a clipped source figure and hide the clipping.
    if(left===0||right===width-1||top===0||bottom===height-1)throw new SpriteLayoutError('AI cut through a character at the image edge. Please try again.');
    const w=right-left+1,h=bottom-top+1,data=Buffer.alloc((w+16)*(h+16)*4);
    for(let k=0;k<tail;k++){
      const p=queue[k],target=((Math.floor(p/width)-top+8)*(w+16)+(p%width)-left+8)*4;
      raw.copy(data,target,p*4,p*4+4);
    }
    figures.push({data,width:w+16,height:h+16,x:(left+right)/2,y:(top+bottom)/2});
  }
  if(figures.length!==rowCount*4)throw new SpriteLayoutError(`AI returned ${figures.length} separable figures; ${rowCount*4} are required. Figures may be missing, joined or fragmented. Please try again.`);
  figures.sort((a,b)=>a.y-b.y);
  const frames=[];
  for(let row=0;row<rowCount;row++){
    const group=figures.slice(row*4,row*4+4);
    if(group[3].y-group[0].y>160 || (row && group[0].y-figures[row*4-1].y<80))
      throw new SpriteLayoutError('AI animation rows are ambiguous. Please try again.');
    group.sort((a,b)=>a.x-b.x);
    if(group.some((f,i)=>i && f.x-group[i-1].x<60))throw new SpriteLayoutError('AI animation columns are ambiguous. Please try again.');
    for(const f of group)frames.push({...f,bounds:removeBackground(f.data,f.width,f.height)});
  }
  return frames;
}

async function extractAnimationFrames(bytes,rowCount) {
  const width=1024,height=rowCount*320;
  const source=sharp(bytes,{limitInputPixels:10000000});
  const meta=await source.metadata();
  if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-width/height)>.08)
    throw new SpriteLayoutError('AI returned the wrong sprite layout. Please try again.');
  const raw=await source.resize(width,height,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
  clearEdgeBackground(raw,width,height);
  clearDetachedGridLines(raw,width,height);
  if(!raw.some((value,index)=>index%4===3&&value>=32))throw new SpriteLayoutError('AI returned an unusable frame. Please try again.');
  try { return await gridFrames(raw,width,height,rowCount); }
  catch(error){
    if(!(error instanceof SpriteLayoutError))throw error;
    try { return await componentFrames(raw,width,height,rowCount); }
    catch(fallbackError){
      if(!(fallbackError instanceof SpriteLayoutError))throw fallbackError;
      fallbackError.reason=`Grid extraction: ${error.message} Silhouette extraction: ${fallbackError.message}`;
      throw fallbackError;
    }
  }
}

export const normalizeAnimationRow=bytes=>extractAnimationFrames(bytes,1);
export async function normalizeSheet(bytes) {
  return assembleAnimationRows([await extractAnimationFrames(bytes,3)]);
}

// All 12 raw frames share one scale, including frames generated in separate requests.
export async function assembleAnimationRows(rows) {
  const frames=rows.flat();
  if(frames.length!==12)throw new SpriteLayoutError('Exactly 12 validated frames are required.');
  const scale=Math.min(116/Math.max(...frames.map(f=>f.bounds.width)),150/Math.max(...frames.map(f=>f.bounds.height)));
  const overlays=await Promise.all(frames.map(async(f,i)=>{
    const w=Math.max(1,Math.round(f.bounds.width*scale)),h=Math.max(1,Math.round(f.bounds.height*scale));
    return {input:await sharp(f.data,{raw:{width:f.width,height:f.height,channels:4}}).extract(f.bounds)
      .resize(w,h,{kernel:'nearest'}).png().toBuffer(),left:(i%4)*128+Math.floor((128-w)/2),top:Math.floor(i/4)*160+159-h};
  }));
  const sheet=await sharp({create:{width:512,height:480,channels:4,background:'#00000000'}}).composite(overlays).png().toBuffer();
  const portrait=await sharp(sheet).extract({left:0,top:0,width:128,height:160}).png().toBuffer();
  return {sheet,portrait};
}

export const STANDING_PROMPT = `Create exactly ONE full-body standing pixel-art game character based on the person in the uploaded photo.
The ONLY uploaded image (person.png) is the person's photograph. It is the sole source of identity, hair, skin tone and clothing. No existing game character or style image is provided. Prioritize that person's recognizable hairstyle, hair length, facial features and visible outfit colors; do not substitute a generic game character.
${PIXEL_STYLE}
This request is ONLY for the character design. Do NOT create animation frames, a sprite sheet, a turnaround, a comparison or multiple figures.
Preserve the person's recognizable face shape, jawline, nose, eyebrows, hair color, hair length and hairstyle, apparent age and skin tone.
If facial hair is visible, retain the beard, moustache or stubble with its shape and color. Do not turn an adult into a generic clean-shaven child.
Copy the visible shirt colors, stripe direction, neckline and sleeve length. Simplify small logos into pixels. Do not invent bags, lanyards, aprons, chef hats or scarves.
When legs/shoes are outside the photo, use simple dark trousers and plain shoes.
Use compact big-headed pixel-game proportions, crisp dark pixel outlines and a limited color palette, while retaining identity and clothing.
Stand upright facing directly FRONT toward the viewer: both eyes, both shoulders and front of shirt visible. Arms relaxed at sides, feet separated slightly, neutral expression. No walking pose.
Use a straight-on orthographic game view even if the photo was taken at an angle: nose centered between the eyes, both cheeks equally visible, shoulder line horizontal. Head, chest and hips all face directly forward with zero yaw or tilt. Do not copy a three-quarter camera angle from the photograph.
Center the complete figure in a pure WHITE (#ffffff) canvas. Occupy about 70% of canvas height and leave clear white margins above hair, below shoes and beside hands.
No shadows, scenery, text, grid lines, watermarks, other characters, cropped body parts or photographic fragments. Return only the finished single standing character.`;

export const ANIMATION_DIRECTIONS=['front','back','left'];
export async function templatePoseImage(row,pose) {
  if(!Number.isInteger(row)||row<0||row>2||!['idle','step-a','step-b'].includes(pose))throw new RangeError('Invalid animation pose');
  const col={idle:0,'step-a':1,'step-b':3}[pose];
  return sharp(await templateImage()).extract({left:col*120,top:row*150,width:120,height:150})
    .resize(480,480,{fit:'contain',background:'#ffffff',kernel:'nearest'}).flatten({background:'#ffffff'}).png().toBuffer();
}

export function animationPosePrompt(row,pose) {
  const direction=ANIMATION_DIRECTIONS[row];
  if(!direction||!['idle','step-a','step-b'].includes(pose))throw new RangeError('Invalid animation pose');
  const facing=[
    'FRONT: directly toward the viewer, both eyes and cheeks equally visible, nose centered, shoulders square. No three-quarter view.',
    'BACK: directly away from the viewer. Only the back of the head and outfit visible; no eye, nose, mouth, cheek or front shirt panel. No three-quarter view.',
    'LEFT PROFILE: nose points toward the LEFT edge of the canvas, only one eye visible, right side of the body nearest the viewer.',
  ][row];
  const stepA=[
    'LEFT leg (screen-right) steps toward the viewer, RIGHT leg trails. RIGHT arm (screen-left) swings forward, LEFT arm back.',
    'LEFT leg (screen-left) steps away from the viewer, RIGHT leg trails. RIGHT arm (screen-right) swings away/forward, LEFT arm toward/back.',
    'LEFT/far leg extends toward screen-left, RIGHT/near leg toward screen-right. RIGHT/near arm swings screen-left, LEFT/far arm screen-right.',
  ][row];
  const stepB=[
    'RIGHT leg (screen-left) steps toward the viewer, LEFT leg trails. LEFT arm (screen-right) swings forward, RIGHT arm back.',
    'RIGHT leg (screen-right) steps away, LEFT leg trails. LEFT arm (screen-left) swings away/forward, RIGHT arm toward/back.',
    'RIGHT/near leg extends toward screen-left, LEFT/far leg toward screen-right. LEFT/far arm swings screen-left, RIGHT/near arm screen-right.',
  ][row];
  return `Create exactly ONE full-body pixel-art character, facing ${facing}
FIRST image (character.png) is the ONLY finished character design AND art style. Preserve its face, hair, age, skin tone, outfit, palette, pixel rendering and proportions. SECOND image (pose.png) is ONLY a single gray pose guide; copy its pose, never its gray appearance. No other character or style sample is provided: animate this design without replacing its identity or clothes.
Requested pose: ${pose.toUpperCase()}. ${pose==='idle'?'Stand upright, feet under hips, arms relaxed, no walking motion.':pose==='step-a'?stepA:stepB}
${pose==='idle'?'Keep the design unchanged while turning it to the requested direction. Reconstruct the back/side of the SAME outfit.':'The FIRST image is already the idle pose in this SAME direction. Copy its head, hair, neck, shoulders, torso and pelvis without turning or redesigning them. Change only arms below shoulders and legs below hips.'}
FIXED ORTHOGRAPHIC VIEW: face ONLY ${direction.toUpperCase()}. No yaw, head turns, shoulder/hip counter-rotation, leaning, camera movement, scale change or changing expression. Do not mirror the whole character to reverse the step. Use a small normal walking stride, not running or lunging. Shoes keep the same size.
Canvas 768 x 1024, pure WHITE background. One centered figure occupying about 70% of canvas height. Complete hair, hands and shoes, with generous white margins on all sides. Same compact big-headed pixel-game proportions, crisp pixel outlines and limited palette as the reference.
Return ONLY ONE figure. No sprite sheet, grid, row of poses, extra character, comparison, labels, text, props, books, scenery or shadows.`;
}
