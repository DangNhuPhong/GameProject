import assert from 'node:assert/strict';
import { FREE_CHARACTER_IDS, resolveStoryLineup } from '../frontend/src/game/characterAccess.js';
import { hasSeenWorldMapIntro, markWorldMapIntroSeen, resetWorldMapIntros } from '../frontend/src/game/worldMapIntro.js';

const custom='custom:4a8612fe-b48f-4151-b345-caa4a13a5a81';
const saved={p1:custom};
const access={ids:FREE_CHARACTER_IDS,loading:true,error:''};
const pending=resolveStoryLineup(saved,access,'single');
assert.equal(pending.needsSelection,false,'Quit must not flash the chef picker during ownership loading');
assert.equal(pending.characters,saved,'Keep the exact saved lineup while restoring');
assert.equal(pending.verified,false,'Loading access must not enable starting a map');
const restored=resolveStoryLineup(saved,{...access,ids:[...FREE_CHARACTER_IDS,custom],loading:false},'single');
assert.equal(restored.characters,saved);assert.equal(restored.verified,true);assert.equal(restored.needsSelection,false);
const failed=resolveStoryLineup(saved,{...access,loading:false,error:'Network unavailable'},'single');
assert.equal(failed.needsSelection,false);assert.equal(failed.characters,saved);assert.equal(failed.verified,false);
const customFailed=resolveStoryLineup(saved,{...access,loading:false,customError:'AI API temporarily unavailable'},'single');
assert.equal(customFailed.needsSelection,false);assert.equal(customFailed.characters,saved);assert.equal(customFailed.verified,false);
const free=resolveStoryLineup({p1:'pepper'},{...access,loading:false,customError:'Optional AI service is unavailable'},'single');
assert.equal(free.verified,true,'Optional AI errors must not block a free-chef story');
const revoked=resolveStoryLineup({p1:'faker'},{...access,loading:false},'single');
assert.equal(revoked.needsSelection,true,'Confirmed lack of ownership still requires an allowed chef');
assert.equal(resolveStoryLineup(null,access,'single').needsSelection,true,'A new story still chooses a chef');
const local={p1:'mint',p2:'sage'};
assert.equal(resolveStoryLineup(local,access,'coop-local').needsSelection,false);
assert.equal(resolveStoryLineup(local,{...access,loading:false},'coop-local').verified,true);

const entries=new Map();
globalThis.sessionStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),
  removeItem:key=>entries.delete(key),get length(){return entries.size;},key:index=>[...entries.keys()][index]};
resetWorldMapIntros();assert.equal(hasSeenWorldMapIntro('offline:single'),false);
markWorldMapIntroSeen('offline:single');assert.equal(hasSeenWorldMapIntro('offline:single'),true,'Quit returns without replaying the intro');
assert.equal(hasSeenWorldMapIntro('offline:coop-local'),false,'Each story mode has its own intro');
resetWorldMapIntros();assert.equal(hasSeenWorldMapIntro('offline:single'),false,'Starting a fresh story re-enables its intro');
delete globalThis.sessionStorage;
console.log('Passed quit/return lineup preservation, no loading/error picker flash, verified access gating, local co-op and intro replay/reset behavior.');
