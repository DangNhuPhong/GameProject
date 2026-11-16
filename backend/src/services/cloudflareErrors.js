// Classify provider refusals without assuming every HTTP 429 is daily quota exhaustion.
export function cloudflareGenerationError(response,details) {
  const errors=Array.isArray(details?.errors)?details.errors:[];
  const codes=errors.map(error=>String(error.code??'')).filter(Boolean);
  const messages=errors.map(error=>String(error.message||''));
  const text=messages.join(' ');
  const suffix=codes.length?` (Cloudflare ${codes.join(', ')})`:'';
  let message,kind;
  if(/flagged|safety|content policy/i.test(text)){
    kind='blocked';message='Cloudflare blocked this image generation. Please choose a different photo.';
  }else if(codes.some(code=>['3036','4006'].includes(code)) || /daily.{0,30}(allocation|quota|limit)|free allocation|used up.{0,40}neurons/i.test(text)){
    kind='quota';message='Cloudflare reports that this account has exhausted its daily AI allocation. The dashboard may show a different usage window; please try later.';
  }else if(codes.includes('3040') || /capacity|temporarily exceeded|busy/i.test(text)){
    kind='capacity';message='Cloudflare image generation is temporarily at capacity. Please try again later.';
  }else if(response.status===429 || /rate limit|too many requests/i.test(text)){
    kind='rate';message='Cloudflare is temporarily limiting requests. This response does not confirm that your daily quota is exhausted. Please try later.';
  }else if(/pixel|resolution|dimension|image.{0,20}size|size.{0,20}image/i.test(text)){
    kind='dimensions';message='Cloudflare rejected the image dimensions. Please check the model input/output limits.';
  }else{
    kind='provider';message='Cloudflare could not generate your character. Please try again later.';
  }
  const error=new Error(message+suffix);
  error.providerKind=kind;
  // Only safe support metadata; do not log tokens, image data, prompts or raw response bodies.
  error.providerDiagnostics={status:response.status,codes,kind,
    ray:response.headers.get('cf-ray'),requestId:response.headers.get('cf-ai-req-id'),retryAfter:response.headers.get('retry-after')};
  return error;
}
