import { supabase } from '../lib/supabase';
import { API_URL } from './config';
import { registerCustomCharacter } from '../game/characters';
import { renderCharacterPhoto } from './characterUploadImage';

async function request(options={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Please sign in to create your character.');
  const response=await fetch(`${API_URL}/api/custom-character`,{
    ...options,headers:{Authorization:`Bearer ${session.access_token}`,...options.headers},
  });
  let payload;
  try { payload=await response.json(); }
  catch {
    const error=new Error('The configured API returned a webpage instead of JSON. Check VITE_API_URL and restart the frontend.');
    error.status=response.status;throw error;
  }
  if(!response.ok){
    const error=new Error(response.status===404
      ? `The backend at ${API_URL} does not have the AI character API yet. Restart the updated local backend, or deploy the updated backend to Render.`
      :payload.message||'Could not contact the character generator.');
    error.status=response.status;throw error;
  }
  if(payload.data?.character)registerCustomCharacter(payload.data.character);
  return payload.data;
}
export const getCustomCharacter=()=>request();
export async function generateCharacter(file){
  const image=await renderCharacterPhoto(file);
  return request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
}
