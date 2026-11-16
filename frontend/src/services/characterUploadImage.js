export const MAX_PHOTO_BYTES=20*1024*1024;

export function fitPhotoDimensions(width,height,size=480){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('The photo has invalid dimensions.');
  const ratio=Math.min(size/width,size/height);
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  return {width:w,height:h,left:Math.floor((size-w)/2),top:Math.floor((size-h)/2)};
}

// Render locally before uploading: preserve aspect, apply orientation, drop EXIF, cap pixels.
export async function renderCharacterPhoto(file){
  if(!file||file.size>MAX_PHOTO_BYTES)throw new Error('Choose a photo smaller than 20 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP photo.');
  let bitmap;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    const fit=fitPhotoDimensions(bitmap.width,bitmap.height);
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Your browser could not prepare the photo.');
    context.fillStyle='#ffffff';context.fillRect(0,0,480,480);
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.drawImage(bitmap,fit.left,fit.top,fit.width,fit.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }catch(error){
    throw new Error(error.message||'Could not read this photo. Try a different JPG, PNG or WebP.',{cause:error});
  }finally{bitmap?.close();}
}
