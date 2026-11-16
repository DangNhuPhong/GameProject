import express from 'express';
import { supabase } from '../config/supabase.js';
import { preparePhoto } from '../services/characterImages.js';
import { customCharacter, generationEnabled, generationPrice, startGeneration, recoverExpiredJobs } from '../services/customCharacters.js';

const router=express.Router();
router.use(async(req,res,next)=>{
  try{
    const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');
    if(!token)return res.status(401).json({message:'Please sign in.'});
    const {data:{user},error}=await supabase.auth.getUser(token);
    if(error||!user)return res.status(401).json({message:'Please sign in again.'});
    req.characterUser=user;next();
  }catch{res.status(503).json({message:'Could not verify your account.'});}
});
router.use(express.json({limit:'7mb'}));

router.get('/',async(req,res)=>{
  try{
    await recoverExpiredJobs(req.characterUser.id);
    const {data:job,error}=await supabase.from('character_generation_jobs')
      .select('id,status,cost,message,created_at').eq('user_id',req.characterUser.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;
    const {data:profile,error:balanceError}=await supabase.from('profiles').select('coins').eq('id',req.characterUser.id).single();
    if(balanceError)throw balanceError;
    res.set('Cache-Control','no-store').json({data:{character:await customCharacter(req.characterUser.id),job,
      price:generationPrice(),enabled:generationEnabled(),coins:profile.coins}});
  }catch(error){
    res.status(503).json({message:['42P01','PGRST205','PGRST202'].includes(error.code)?
      'Run backend/sql/custom_characters.sql in Supabase SQL Editor to enable AI characters.':'Could not load AI character. Please try again.'});
  }
});
router.post('/',async(req,res)=>{
  try{
    if(!generationEnabled())return res.status(503).json({message:'AI generation is not configured on the server yet.'});
    if(req.body.mode!=null&&req.body.mode!=='full-body')return res.status(400).json({message:'Head-only creation has been removed. Reload the game to create a complete character.'});
    const photo=await preparePhoto(req.body.image);
    await recoverExpiredJobs(req.characterUser.id);
    const id=await startGeneration(req.characterUser.id,photo);
    res.status(202).json({data:{jobId:id}});
  }catch(error){
    console.error('Start character generation:',error.message);
    res.status(400).json({message:error.code && error.code!=='P0001'?'Could not start generation. Check the server setup.':error.message||'Could not start generation.'});
  }
});
router.use((error,req,res,next)=>{ // eslint-disable-line no-unused-vars
  res.status(400).json({message:error.type==='entity.too.large'?'Image exceeds 5 MB.':'Invalid image request.'});
});
export default router;
