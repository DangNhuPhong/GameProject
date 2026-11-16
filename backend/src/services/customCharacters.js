import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { createCloudflareCharacter } from './cloudflareCharacters.js';
export { isCustomCharacter } from './customCharacterIds.js';

const BUCKET='custom-characters';
export const generationPrice = () => {
  const value=Number(process.env.AI_CHARACTER_COST || 500);
  if(!Number.isSafeInteger(value)||value<1||value>2147483647)throw new Error('Invalid AI_CHARACTER_COST configuration');
  return value;
};
export const generationEnabled = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN);
const storage=()=>supabase.storage.from(BUCKET);
const checked = result => {if(result.error)throw result.error;return result.data;};
export async function customCharacter(userId) {
  const {data,error}=await supabase.from('custom_characters').select('*').eq('user_id',userId).maybeSingle();
  // Existing installations can still play before the optional migration is applied.
  if(error && ['42P01','PGRST205'].includes(error.code))return null;
  if(error)throw error;
  if(!data)return null;
  return {id:`custom:${userId}`,name:'My AI Chef',description:'Your personalized character',
    spriteKey:`chef-custom-${userId}-${data.version}`,color:'#f4bd67',version:data.version,
    sheet:storage().getPublicUrl(data.sheet_path).data.publicUrl,
    portrait:storage().getPublicUrl(data.portrait_path).data.publicUrl};
}

export async function recoverExpiredJobs(userId) {
  let query=supabase.from('character_generation_jobs').select('id').eq('status','processing')
    .lt('created_at',new Date(Date.now()-30*60*1000).toISOString());
  if(userId)query=query.eq('user_id',userId);
  const {data,error}=await query.limit(50);
  if(error){if(['42P01','PGRST205'].includes(error.code))return;throw error;}
  for(const job of data||[])checked(await supabase.rpc('fail_character_generation',{
    p_job:job.id,p_message:'Generation was interrupted. Your coins were refunded.'}));
}

export async function cleanupCharacterFiles() {
  const {data,error}=await supabase.from('character_generation_jobs').select('id,user_id,cleanup_paths')
    .neq('cleanup_paths','{}').neq('status','processing').limit(30);
  if(error)return;
  for(const job of data||[]){
    // Only delete files belonging to this user; never touch the current active version.
    const {data:current,error:readError}=await supabase.from('custom_characters').select('sheet_path,portrait_path')
      .eq('user_id',job.user_id).maybeSingle();
    if(readError)continue;
    const paths=job.cleanup_paths.filter(p=>p.startsWith(`${job.user_id}/`) && p!==current?.sheet_path && p!==current?.portrait_path);
    if(paths.length){const {error:deleteError}=await storage().remove(paths);if(deleteError)continue;}
    await supabase.from('character_generation_jobs').update({cleanup_paths:[]}).eq('id',job.id);
  }
}

let running=0;
export function serverBusy(){return running>=2;}
export async function startGeneration(userId,photo) {
  if(!generationEnabled())throw new Error('AI generation is not configured on the server yet.');
  if(serverBusy())throw new Error('The character generator is busy. Please try again shortly.');
  running++;
  const id=randomUUID();
  try {
    checked(await supabase.rpc('begin_character_generation',{p_user:userId,p_job:id,p_cost:generationPrice()}));
  } catch(error){running--;throw error;}
  // No original photograph is persisted. The authenticated request receives a durable job ID.
  void generate(id,userId,photo).finally(()=>{running--;}).catch(error=>console.error('Character job recovery required:',error.message));
  return id;
}

async function generate(id,userId,photo) {
  const sheetPath=`${userId}/${id}/sheet.png`,portraitPath=`${userId}/${id}/portrait.png`;
  let finishing=false;
  try {
    const {sheet,portrait}=await createCloudflareCharacter(photo,{onProgress:async message=>{
      checked(await supabase.from('character_generation_jobs').update({message}).eq('id',id).eq('status','processing'));
    }});
    checked(await supabase.from('character_generation_jobs').update({cleanup_paths:[sheetPath,portraitPath]}).eq('id',id).eq('status','processing'));
    checked(await storage().upload(sheetPath,sheet,{contentType:'image/png',upsert:false,cacheControl:'31536000'}));
    checked(await storage().upload(portraitPath,portrait,{contentType:'image/png',upsert:false,cacheControl:'31536000'}));
    finishing=true;
    checked(await supabase.rpc('finish_character_generation',{p_job:id,p_sheet:sheetPath,p_portrait:portraitPath}));
    await cleanupCharacterFiles();
  } catch(error){
    // A lost response after a commit must never delete the newly active character or refund a completed job.
    if(finishing){
      const {data,error:readError}=await supabase.from('character_generation_jobs').select('status').eq('id',id).single();
      if(readError)throw new Error('Unable to resolve generation commit; recovery will retry.');
      if(data.status==='completed')return;
    }
    checked(await supabase.from('character_generation_jobs').update({cleanup_paths:[sheetPath,portraitPath]}).eq('id',id).eq('status','processing'));
    checked(await supabase.rpc('fail_character_generation',{p_job:id,p_message:error.message?.slice(0,250)||'Generation failed. Coins refunded.'}));
    await cleanupCharacterFiles();
  }
}
