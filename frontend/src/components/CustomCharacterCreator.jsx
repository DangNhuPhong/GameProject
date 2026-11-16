import { useEffect, useRef, useState } from 'react';
import { getCustomCharacter, generateCharacter } from '../services/customCharacterApi';
import { saveCharacter } from '../game/characters';
import { MAX_PHOTO_BYTES } from '../services/characterUploadImage';
import './CustomCharacterCreator.css';

export default function CustomCharacterCreator({onBalanceChange,onComplete}){
  const [data,setData]=useState(null);
  const [file,setFile]=useState(null);
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [direction,setDirection]=useState(0);
  const [frame,setFrame]=useState(0);
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const callbacks=useRef({onBalanceChange,onComplete});
  const previousJob=useRef(null);
  const previewUrl=useRef('');
  useEffect(()=>{callbacks.current={onBalanceChange,onComplete};},[onBalanceChange,onComplete]);
  useEffect(()=>()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);},[]);
  useEffect(()=>{
    let active=true,timer;
    const poll=async()=>{
      try{
        const next=await getCustomCharacter();
        if(!active)return;
        setData(next);setError('');setLoading(false);
        callbacks.current.onBalanceChange(next.coins);
        const job=next.job;
        if(previousJob.current===job?.id && job?.status!=='processing'){
          previousJob.current=null;
          callbacks.current.onComplete();
          if(job.status==='completed')setNotice('Your AI chef is ready! Select it below or in the character picker.');
        }
        if(job?.status==='processing'){previousJob.current=job.id;timer=setTimeout(poll,2500);}
      }catch(err){
        if(active){
          setError(err.message);setLoading(false);
          if(![400,401,403,404,503].includes(err.status))timer=setTimeout(poll,10000);
        }
      }
    };
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>setFrame(f=>(f+1)%4),160);
    return()=>clearInterval(timer);
  },[]);
  const busy=submitting||data?.job?.status==='processing';
  const create=async()=>{
    if(busy||!file)return;
    setSubmitting(true);setError('');setNotice('');
    try{
      const job=await generateCharacter(file);
      previousJob.current=job.jobId;
      setData(current=>({...current,job:{id:job.jobId,status:'processing'}}));
    }catch(err){setError(`${err.message} Reopen the shop to check the job if the connection was interrupted.`);}
    finally{setSubmitting(false);setRefresh(value=>value+1);callbacks.current.onComplete();}
  };
  return <section className="ai-chef" aria-labelledby="ai-chef-title">
    <div className="ai-chef-heading"><div><p className="shop-eyebrow">PERSONAL CHEF</p><h3 id="ai-chef-title">Create your AI character</h3></div>
      <strong>{data?`${Number(data.price).toLocaleString('en-US')} coins / creation`:loading?'Loading...':'Unavailable'}</strong></div>
    <p>AI creates your head in front, back and side views, then attaches it to Pepper’s existing chef body and walking animations. You have one custom character slot. A successful creation replaces your previous AI chef.</p>
    <div className="ai-chef-body">
      <div className="ai-chef-upload">
        <label htmlFor="ai-chef-photo">Your photo (JPG, PNG or WebP, up to 20 MB)</label>
        <small>Photos are automatically resized to fit 480 × 480 pixels before upload, without cropping or stretching.</small>
        <input id="ai-chef-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!data?.enabled}
          onChange={event=>{
            const selected=event.target.files?.[0];setError('');
            if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
            previewUrl.current='';setPreview('');
            if(selected&&selected.size>MAX_PHOTO_BYTES){setError('Choose a photo smaller than 20 MB.');event.target.value='';setFile(null);return;}
            setFile(selected||null);
            if(selected){previewUrl.current=URL.createObjectURL(selected);setPreview(previewUrl.current);}
          }}/>
        {preview&&<><img className="ai-chef-photo" src={preview} alt="Photo selected for character creation"/>
          <small>Selected photo. Click {data?.character?'Replace':'Create'} AI chef to generate a new character from it.</small></>}
        <button type="button" className="ai-chef-create" onClick={create}
          disabled={busy||!file||!data?.enabled||data.coins<data.price}>
          {busy?'Creating your chef...':data&&data.coins<data.price?'Not enough coins':`${data?.character?'Replace':'Create'} AI chef — ${data?.price??'…'} coins`}
        </button>
        {data&&!data.enabled&&<p>AI creation is not available yet. Configure Cloudflare on the server.</p>}
        <small>Coins are reserved while creating and refunded if generation fails. Your old chef stays until the new one is saved. Your source photo is not stored by the game.</small>
      </div>
      {data?.character&&<div className="ai-chef-result">
        <strong>Saved AI chef</strong>
        <small>{busy?'Your previous character stays here until the new one is ready.':'This is your saved character. Choosing a photo does not replace it yet.'}</small>
        <div className="ai-chef-sprite" role="img" aria-label="Animated preview of your AI chef"
          style={{backgroundImage:`url("${data.character.sheet}")`,backgroundPosition:`${[1,0,3,0][frame]*128*-1}px ${direction*-160}px`}}/>
        <div className="ai-chef-directions" role="group" aria-label="Preview direction">
          {['Front','Back','Side'].map((label,index)=><button type="button" key={label} aria-pressed={direction===index} onClick={()=>setDirection(index)}>{label}</button>)}
        </div>
        <button type="button" disabled={busy} onClick={()=>{saveCharacter('p1',data.character.id);setNotice('Selected for your next character selection. In an online lobby, choose My AI Chef to equip it.');}}>Select my AI chef</button>
        <small>Available in Single, Local Co-op and Online character selection.</small>
      </div>}
    </div>
    {busy&&<p role="status">{data?.job?.message||'Preparing your photo...'} You can close the shop and return to check progress.</p>}
    {!busy&&data?.job?.status==='failed'&&<p className="shop-error" role="alert">{data.job.message} Your coins have been refunded.</p>}
    {error&&<div className="shop-error" role="alert">{error}
      <button type="button" disabled={loading||submitting} onClick={()=>{setLoading(true);setError('');setRefresh(value=>value+1);}}>Retry</button>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
