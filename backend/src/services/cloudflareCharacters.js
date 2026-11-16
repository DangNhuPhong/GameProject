import { frameFromPoseReference, assembleAnimationRows, normalizeStandingCharacter, templatePoseImage, animationPosePrompt, ANIMATION_DIRECTIONS, STANDING_PROMPT, SpriteLayoutError } from './characterImages.js';
import { recordFailedSheet } from './characterDiagnostics.js';
import { cloudflareGenerationError } from './cloudflareErrors.js';

async function requestImage({prompt,references,width,height}) {
    const form=new FormData();
    form.append('prompt',prompt);
    form.append('width',String(width));form.append('height',String(height));
    references.forEach(({bytes,name},index)=>form.append(`input_image_${index}`,new Blob([bytes],{type:'image/png'}),name));
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`,{
      method:'POST',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},body:form,signal:AbortSignal.timeout(150000)});
    if(!response.ok){
      const details=await response.json().catch(()=>null);
      const error=cloudflareGenerationError(response,details);
      console.error('Cloudflare character generation:',JSON.stringify(error.providerDiagnostics));
      throw error;
    }
    if(response.headers.get('content-type')?.startsWith('image/'))return Buffer.from(await response.arrayBuffer());
    else {
      const payload=await response.json();
      if(payload.success===false || !payload.result?.image)throw new Error('Cloudflare did not return a character image.');
      return Buffer.from(payload.result.image.replace(/^data:image\/[^;]+;base64,/,''),'base64');
    }
}

// Nine distinct full-body poses, with one shared structural retry. No real chef artwork is sent to AI.
export async function createCloudflareCharacter(photo,{onProgress=async()=>{}}={}) {
  let character,retryUsed=false;
  while(!character){
    await onProgress(retryUsed?'Step 1/3: Retrying your standing character...':'Step 1/3: Creating your standing character...');
    const standing=await requestImage({
      prompt:STANDING_PROMPT+(retryUsed?'\nReturn ONE complete figure with clear white margins and a connected pixel silhouette.':''),
      references:[{bytes:photo,name:'person.png'}],width:768,height:1024,
    });
    try { character=await normalizeStandingCharacter(standing); }
    catch(error){
      if(!(error instanceof SpriteLayoutError))throw error;
      if(retryUsed){error.message=`Standing character: ${error.message}`;throw error;}
      retryUsed=true;
    }
  }
  let completed=0;
  async function generatePose(row,pose,reference){
    const direction=ANIMATION_DIRECTIONS[row],template=await templatePoseImage(row,pose);
    let failure='';
    while(true){
      await onProgress(`Step 2/3: ${failure?'Retrying':'Creating'} ${direction} ${pose} (${completed+1}/8)...`);
      const bytes=await requestImage({
        prompt:animationPosePrompt(row,pose)+(failure?`\nPrevious output was rejected: ${failure} Return ONE complete full-body figure with wide white margins.`:''),
        references:[{bytes:reference,name:'character.png'},{bytes:template,name:'pose.png'}],width:768,height:1024,
      });
      try {
        const result=await normalizeStandingCharacter(bytes);completed++;return result;
      }catch(error){
        if(!(error instanceof SpriteLayoutError))throw error;
        error.message=`${direction.toUpperCase()} ${pose}: ${error.message}`;
        await recordFailedSheet(bytes,error);
        if(retryUsed)throw error;
        failure=error.message;retryUsed=true;
      }
    }
  }
  const rows=[];
  for(let row=0;row<3;row++){
    const idleReference=row===0?character:await generatePose(row,'idle',character);
    const idle=await frameFromPoseReference(idleReference);
    const stepA=await frameFromPoseReference(await generatePose(row,'step-a',idleReference));
    const stepB=await frameFromPoseReference(await generatePose(row,'step-b',idleReference));
    rows.push([idle,stepA,idle,stepB]);
  }
  await onProgress('Step 3/3: Preparing game sprites...');
  return assembleAnimationRows(rows);
}
