import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMapLayout, getMapFilePath } from '../backend/src/maps/index.js';
import { readLayout } from '../frontend/src/game/core/readLayout.js';
import GameRoom from '../backend/src/classes/GameRoom.js';
import LocalGameRoom from '../frontend/src/game/core/GameRoom.js';
import { canPlayStoryMap as onlineAvailable } from '../backend/src/classes/storyConfig.js';
import { canPlayStoryMap as offlineAvailable } from '../frontend/src/game/storyConfig.js';
const raw=fs.readFileSync(getMapFilePath('classroom'),'utf8');
assert.equal(raw,fs.readFileSync(new URL('../frontend/src/game/maps/classroom/classroom.json',import.meta.url),'utf8'));
const map=JSON.parse(raw), layout=getMapLayout('classroom');
assert.deepEqual(readLayout(map), {shelves:layout.shelves,stations:layout.stations,spawn:layout.spawn});
assert.equal(layout.id,'classroom');
assert.equal(onlineAvailable('classroom',0),true);
assert.equal(offlineAvailable('classroom',0),true);
assert.deepEqual(layout.shelves.map(s=>s.ingredient).sort(),['bread','dough','meat','salad','tomato']);
const room=new GameRoom('CLASSROOM_TEST',layout);
assert.equal(room.stations.filter(s=>s.type==='cooking').length,1);
assert.equal(room.stations.filter(s=>s.type==='cutting').length,1);
assert.equal(room.stations.length,3);
assert.ok(room.plateStation);
assert.equal(room.specialStations.length,3);
const localRoom=new LocalGameRoom('LOCAL_CLASSROOM_TEST',{id:'classroom',...readLayout(map)});
assert.deepEqual(localRoom.stations.map(s=>[s.id,s.type,s.x,s.y]),room.stations.map(s=>[s.id,s.type,s.x,s.y]));
assert.deepEqual(localRoom.specialStations,room.specialStations);
const layer=map.layers.find(l=>l.name==='counters');
assert.equal(layer.data.length,map.width*map.height);
// Match KitchenScene's four foot probes, world bounds and 20-unit interaction radius.
function blocked(x,y){return [[x-5,y+3],[x+5,y+3],[x-5,y+9],[x+5,y+9]].some(([px,py])=>px<0||py<0||px>=344||py>=192||layer.data[Math.floor(py/4)*86+Math.floor(px/4)]===1);}
assert.equal(blocked(layout.spawn.x,layout.spawn.y),false);
assert.equal(blocked(layout.spawn.x+14,layout.spawn.y),false,'Second local player has a clear spawn');
const queue=[[layout.spawn.x,layout.spawn.y]],seen=new Set([queue[0].join(',')]);
for(let i=0;i<queue.length;i++){
 const [x,y]=queue[i];
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
  if(!seen.has(key)&&!blocked(nx,ny)){seen.add(key);queue.push([nx,ny]);}
 }
}
for(const s of [...layout.shelves,...layout.stations]){
 const distance=Math.min(...queue.map(([x,y])=>Math.hypot(x-s.x,y-s.y)));
 assert.ok(distance<=20,`${s.id} unreachable: ${distance}`);
 console.log(`${s.id}: reachable (${distance.toFixed(1)} units)`);
}
// A shelf must win the nearest-station choice, not merely be within range.
// Previously tomato was masked by salad at every reachable approach.
for (const shelf of layout.shelves) {
 const alternatives=[...layout.shelves.filter(s=>s.id!==shelf.id),room.plateStation];
 const approaches=queue.filter(([x,y])=>{
  const d=Math.hypot(x-shelf.x,y-shelf.y);
  return d<=18 && alternatives.every(s=>Math.hypot(x-s.x,y-s.y)>d);
 });
 assert.ok(approaches.length>0,`${shelf.id} must be selectable from the connected aisle`);
}
// Pantry shelves must be accessible through the visible doorway.
assert.ok(queue.some(([x,y])=>x<80 && y>48 && y<70),'Pantry doorway must connect to the kitchen');
// Order ticket stand must block feet as well as the lower serving counter.
for(const [px,py] of [[785,735],[790,760]]){
 assert.equal(layer.data[Math.floor(py*192/937/4)*86+Math.floor(px*344/1679/4)],1);
}
console.log(`Classroom map verified: ${queue.length} connected player positions, all stations reachable.`);
