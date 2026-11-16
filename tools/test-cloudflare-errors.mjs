import assert from 'node:assert/strict';
import { cloudflareGenerationError } from '../backend/src/services/cloudflareErrors.js';
const classify=(code,message,status=429)=>cloudflareGenerationError(new Response('',{status,headers:{'cf-ray':'test-ray','cf-ai-req-id':'test-request','Retry-After':'60'}}),{
  errors:code==null?[]:[{code,message}],
});
for(const code of [3036,'3036',4006])assert.equal(classify(code,'Daily free allocation exhausted').providerKind,'quota');
assert.equal(classify(3040,'Capacity temporarily exceeded').providerKind,'capacity');
assert.equal(classify(null,'').providerKind,'rate','An unspecified 429 is not proof of daily quota exhaustion');
assert.equal(classify(9999,'Too many requests').providerKind,'rate');
assert.equal(classify(3030,'Your output has been flagged',400).providerKind,'blocked');
assert.equal(classify(123,'Invalid image dimensions',400).providerKind,'dimensions');
const error=classify(3036,'Do not log this raw provider text');
assert.match(error.message,/Cloudflare 3036/);
assert.equal(error.providerDiagnostics.ray,'test-ray');
assert.equal(error.providerDiagnostics.retryAfter,'60');
assert.ok(!JSON.stringify(error.providerDiagnostics).includes('Do not log'));
console.log('Passed daily quota, capacity, generic rate limits, safety, dimensions and safe diagnostic metadata.');
