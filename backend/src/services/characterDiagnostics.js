import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Local opt-in only. Keep one rejected generated pose, never the uploaded photo. Legacy filename is retained.
export async function recordFailedSheet(bytes,error) {
  if(process.env.AI_CHARACTER_DEBUG_IMAGES!=='true')return;
  const directory=new URL('../../../output/ai-character-debug/',import.meta.url);
  try {
    await mkdir(directory,{recursive:true});
    await writeFile(new URL('last-failed-sheet.png',directory),bytes);
    await writeFile(new URL('last-failed-sheet.json',directory),JSON.stringify({
      time:new Date().toISOString(),message:error.message,reason:error.reason,
    },null,2));
    console.warn('AI layout diagnostic saved:',fileURLToPath(directory));
  } catch(saveError){console.warn('Could not save AI layout diagnostic:',saveError.code||'write failed');}
}
